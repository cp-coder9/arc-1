/**
 * Field Report Service
 *
 * Provides pure functions for aggregating field activity (issues, evidence, weather)
 * into dated site reports, and for exporting reports to document format.
 *
 * Extends the existing SiteLog model for Stage 6 (Build) and Stage 8 (Close-out).
 */

import type { FieldReport, FieldIssueSummary, EvidenceRef, FieldReportWeather, SiteLog } from '@/types';
import { getDocs, addDoc, query, where } from 'firebase/firestore';
import { getDemoCol } from '@/demo-seed/demoFirestore';
import { handleFirestoreError, OperationType } from '@/lib/firebase';

/**
 * Export document format produced by exportReport.
 * Contains all fields required for a shareable field report document.
 * Validates: Requirements 7.4, 7.25
 */
export interface ExportDocument {
  title: string;
  date: string;
  projectId: string;
  weather: string;
  paymentBlockingCount: number;
  outstandingHandoverSnags?: number;
  issueSummary: Array<{ id: string; status: string; severity: string }>;
  evidenceRefs: Array<{ id: string; type: string; uri: string }>;
}

/**
 * Input contract for the aggregateReport pure function.
 */
export interface ReportInputs {
  projectId: string;
  date: string; // YYYY-MM-DD
  timeZone: string;
  issues: Array<{
    id: string;
    status: string;
    severity: string;
    createdAt: string;
    blocksPayment: boolean;
  }>;
  evidence: Array<{
    id: string;
    type: string;
    uri: string;
    capturedAt: string;
  }>;
  weather?: FieldReportWeather;
  lifecycleStage?: string;
}

/**
 * Parse the date boundaries (00:00:00 to 23:59:59.999) in the specified timezone.
 * Returns ISO string boundaries for comparison.
 *
 * Uses the Intl API to resolve the timezone offset for the given date,
 * then computes the UTC equivalents of midnight and end-of-day in that timezone.
 */
function getDateBoundaries(date: string, timeZone: string): { start: string; end: string } {
  // Use a reference point at noon UTC on the target date to determine the
  // timezone offset (avoids DST edge cases at midnight)
  const refDate = new Date(`${date}T12:00:00Z`);

  // Format the reference time in the target timezone using en-CA locale (YYYY-MM-DD format)
  const localStr = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(refDate);

  // Parse the local representation to compute offset
  // Format from en-CA: "YYYY-MM-DD, HH:MM:SS"
  const localParts = localStr.replace(',', '').split(' ');
  const localDate = localParts[0]; // YYYY-MM-DD
  const localTime = localParts[1]; // HH:MM:SS

  const localMs = new Date(`${localDate}T${localTime}Z`).getTime();
  const utcMs = refDate.getTime();
  const offsetMs = localMs - utcMs; // positive = timezone is ahead of UTC

  // Compute UTC boundaries for midnight and 23:59:59.999 in the target timezone
  const startUtcMs = new Date(`${date}T00:00:00Z`).getTime() - offsetMs;
  const endUtcMs = new Date(`${date}T23:59:59.999Z`).getTime() - offsetMs;

  const startIso = new Date(startUtcMs).toISOString();
  const endIso = new Date(endUtcMs).toISOString();

  return { start: startIso, end: endIso };
}

/**
 * Determines if a given ISO timestamp falls within the date boundaries.
 */
function isWithinDateRange(timestamp: string, start: string, end: string): boolean {
  return timestamp >= start && timestamp <= end;
}

/**
 * Aggregates field issues and evidence for a given date in the project timezone.
 *
 * Pure function — no I/O. All data is passed in via ReportInputs.
 *
 * - Filters issues where createdAt falls within date range → FieldIssueSummary[]
 * - Filters evidence where capturedAt falls within date range → EvidenceRef[]
 * - Counts blocking issues: blocksPayment === true AND status !== 'closed' AND status !== 'rejected'
 * - Weather: uses input.weather or 'not_recorded' if undefined
 * - If lifecycleStage is 'closeout': counts outstanding snags (status !== 'closed' AND status !== 'rejected')
 *   across ALL issues (not just the date range)
 *
 * Validates: Requirements 7.1, 7.2, 7.3 (weather fallback), 7.5 (closeout snag count)
 */
export function aggregateReport(input: ReportInputs): FieldReport {
  const { projectId, date, timeZone, issues, evidence, weather, lifecycleStage } = input;

  // Compute date boundaries in the project timezone
  const { start, end } = getDateBoundaries(date, timeZone);

  // Filter issues created within the date range
  const dateIssues: FieldIssueSummary[] = issues
    .filter(issue => isWithinDateRange(issue.createdAt, start, end))
    .map(issue => ({
      id: issue.id,
      status: issue.status,
      severity: issue.severity,
    }));

  // Filter evidence captured within the date range
  const dateEvidence: EvidenceRef[] = evidence
    .filter(ev => isWithinDateRange(ev.capturedAt, start, end))
    .map(ev => ({
      id: ev.id,
      type: ev.type,
      uri: ev.uri,
    }));

  // Count blocking issues: blocksPayment true AND not closed/rejected
  const paymentBlockingCount = issues.filter(
    issue =>
      issue.blocksPayment &&
      issue.status !== 'closed' &&
      issue.status !== 'rejected'
  ).length;

  // Weather: use provided value or 'not_recorded'
  const reportWeather: FieldReportWeather | 'not_recorded' = weather ?? 'not_recorded';

  // Build report
  const report: FieldReport = {
    projectId,
    date,
    timeZone,
    issues: dateIssues,
    evidence: dateEvidence,
    weather: reportWeather,
    paymentBlockingCount,
  };

  // For Close-out stage, include outstanding snag count across ALL issues
  if (lifecycleStage === 'closeout') {
    report.outstandingHandoverSnags = issues.filter(
      issue => issue.status !== 'closed' && issue.status !== 'rejected'
    ).length;
  }

  return report;
}

/**
 * Exports a FieldReport to a document format suitable for sharing/printing.
 *
 * Pure function — no I/O. Maps the FieldReport fields to the ExportDocument shape:
 * - title: "Field Report — {date}"
 * - issueSummary: maps report.issues (id, status, severity)
 * - evidenceRefs: maps report.evidence (id, type, uri)
 * - Includes paymentBlockingCount, outstandingHandoverSnags (if present), weather as string
 *
 * Validates: Requirements 7.4, 7.25
 */
export function exportReport(report: FieldReport): ExportDocument {
  const doc: ExportDocument = {
    title: `Field Report — ${report.date}`,
    date: report.date,
    projectId: report.projectId,
    weather: report.weather,
    paymentBlockingCount: report.paymentBlockingCount,
    issueSummary: report.issues.map(issue => ({
      id: issue.id,
      status: issue.status,
      severity: issue.severity,
    })),
    evidenceRefs: report.evidence.map(ev => ({
      id: ev.id,
      type: ev.type,
      uri: ev.uri,
    })),
  };

  if (report.outstandingHandoverSnags !== undefined) {
    doc.outstandingHandoverSnags = report.outstandingHandoverSnags;
  }

  return doc;
}


// ─── Firestore Collection Helpers ───────────────────────────────────────────

const PROJECTS_COL = 'projects';
const SNAGS_COL = 'snags';
const FIELD_EVIDENCE_COL = 'field_evidence';
const SITE_LOGS_COL = 'site_logs';
const FIELD_REPORTS_COL = 'field_reports';

/**
 * Maps a SiteLog WeatherCondition to the FieldReportWeather union.
 * The SiteLog uses 'sunny' | 'cloudy' | 'rainy' | 'stormy' while
 * FieldReportWeather uses 'clear' | 'cloudy' | 'rain' | 'wind' | 'storm' | 'snow'.
 */
function mapWeatherCondition(condition: SiteLog['weather']): FieldReportWeather {
  switch (condition) {
    case 'sunny': return 'clear';
    case 'cloudy': return 'cloudy';
    case 'rainy': return 'rain';
    case 'stormy': return 'storm';
    default: return 'clear';
  }
}

/**
 * I/O: Generates a field report for a project on a given date.
 *
 * 1. Queries `projects/{projectId}/snags` for all issues
 * 2. Queries `projects/{projectId}/field_evidence` for all evidence
 * 3. Queries weather from `projects/{projectId}/site_logs` for the date
 *    (uses 'not_recorded' if not found)
 * 4. Builds ReportInputs and calls `aggregateReport(inputs)`
 * 5. Persists the result to `projects/{projectId}/field_reports` using addDoc
 * 6. Returns the generated report
 *
 * Validates: Requirements 7.1, 7.2, 7.3
 */
export async function generateReport(
  projectId: string,
  date: string,
  timeZone: string,
  options?: { lifecycleStage?: string }
): Promise<FieldReport> {
  try {
    // 1. Query all snags for the project
    const snagsColRef = getDemoCol(PROJECTS_COL, projectId, SNAGS_COL);
    const snagsSnap = await getDocs(snagsColRef);
    const issues = snagsSnap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        status: data.status as string,
        severity: data.severity ?? data.priority as string,
        createdAt: data.createdAt as string,
        blocksPayment: data.blocksPayment as boolean ?? false,
      };
    });

    // 2. Query all field evidence for the project
    const evidenceColRef = getDemoCol(PROJECTS_COL, projectId, FIELD_EVIDENCE_COL);
    const evidenceSnap = await getDocs(evidenceColRef);
    const evidence = evidenceSnap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        type: data.type as string,
        uri: data.uri as string,
        capturedAt: data.capturedAt ?? data.createdAt as string,
      };
    });

    // 3. Query weather from site_logs for the date (optional)
    const logsColRef = getDemoCol(PROJECTS_COL, projectId, SITE_LOGS_COL);
    const weatherQuery = query(logsColRef, where('date', '==', date));
    const logsSnap = await getDocs(weatherQuery);

    let weather: FieldReportWeather | undefined;
    if (!logsSnap.empty) {
      const logData = logsSnap.docs[0].data() as SiteLog;
      weather = mapWeatherCondition(logData.weather);
    }

    // 4. Build ReportInputs and call aggregateReport
    const reportInputs: ReportInputs = {
      projectId,
      date,
      timeZone,
      issues,
      evidence,
      weather,
      lifecycleStage: options?.lifecycleStage,
    };

    const report = aggregateReport(reportInputs);

    // 5. Persist to field_reports collection
    const reportsColRef = getDemoCol(PROJECTS_COL, projectId, FIELD_REPORTS_COL);
    await addDoc(reportsColRef, report);

    // 6. Return the generated report
    return report;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${projectId}/${FIELD_REPORTS_COL}`);
    // handleFirestoreError always throws, but TypeScript needs a return
    throw error;
  }
}
