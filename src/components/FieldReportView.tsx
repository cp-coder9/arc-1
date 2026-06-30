import React, { useState } from 'react';
import {
  Calendar,
  FileText,
  FolderOpen,
  Loader2,
  AlertCircle,
  ImageIcon,
  ListChecks,
  ExternalLink,
  Download,
} from 'lucide-react';
import type { FieldReport, FieldIssueSummary, EvidenceRef } from '@/types';
import {
  generateReport,
  exportReport,
  type ExportDocument,
} from '@/services/fieldReportService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A selectable project for the report's project selector. */
export interface ReportProjectOption {
  id: string;
  /** Human-readable label; falls back to the id when absent. */
  name?: string;
  /** Project time zone (IANA). Falls back to the component default when absent. */
  timeZone?: string;
  /** Current lifecycle stage; when 'closeout', the report includes outstanding snag counts. */
  lifecycleStage?: string;
}

type Props = {
  /** Projects the user can generate a report for. */
  projects: ReportProjectOption[];
  /** Optional pre-selected project id. */
  initialProjectId?: string;
  /** Fallback time zone when a project does not define one. Defaults to the browser zone. */
  defaultTimeZone?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Today's date as YYYY-MM-DD in local time, for the date picker default. */
function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Resolve the browser's IANA time zone, defaulting to UTC when unavailable. */
function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const WEATHER_LABEL: Record<string, string> = {
  clear: 'Clear',
  cloudy: 'Cloudy',
  rain: 'Rain',
  wind: 'Wind',
  storm: 'Storm',
  snow: 'Snow',
  not_recorded: 'Not recorded',
};

/** Display label for a report's weather, handling the 'not_recorded' sentinel. */
export function weatherLabel(weather: FieldReport['weather']): string {
  return WEATHER_LABEL[weather] ?? weather;
}

/** Human-readable label for a snag lifecycle status value. */
export function statusLabel(status: string): string {
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

/**
 * Build the ordered text lines of an exported field report document.
 *
 * Pure function — maps every field of the {@link ExportDocument} produced by
 * `fieldReportService.exportReport` into a flat, renderable line list:
 * report date, project identifier, each aggregated issue's id/status/severity,
 * and an evidence reference for each aggregated evidence item (Requirement 7.4).
 */
export function buildReportExportLines(doc: ExportDocument): string[] {
  const lines: string[] = [];

  lines.push(doc.title);
  lines.push('');
  lines.push(`Project: ${doc.projectId}`);
  lines.push(`Date: ${doc.date}`);
  lines.push(`Weather: ${WEATHER_LABEL[doc.weather] ?? doc.weather}`);
  lines.push(`Issues blocking payment: ${doc.paymentBlockingCount}`);
  if (doc.outstandingHandoverSnags !== undefined) {
    lines.push(`Outstanding handover snags: ${doc.outstandingHandoverSnags}`);
  }

  lines.push('');
  lines.push('Issue summary:');
  if (doc.issueSummary.length === 0) {
    lines.push('  No issues captured for this date.');
  } else {
    for (const issue of doc.issueSummary) {
      lines.push(`  ${issue.id} - ${statusLabel(issue.status)} / ${issue.severity}`);
    }
  }

  lines.push('');
  lines.push('Evidence references:');
  if (doc.evidenceRefs.length === 0) {
    lines.push('  No evidence captured for this date.');
  } else {
    for (const ref of doc.evidenceRefs) {
      lines.push(`  ${ref.id} (${ref.type})${ref.uri ? ` - ${ref.uri}` : ''}`);
    }
  }

  return lines;
}

/** Download filename for an exported report. */
export function reportExportFilename(doc: ExportDocument): string {
  const safeProject = doc.projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `field-report-${safeProject}-${doc.date}.pdf`;
}

/**
 * Sanitize text for the StandardFonts (WinAnsi) encoder used by pdf-lib —
 * normalize unicode dashes and drop characters the encoding cannot represent.
 */
function sanitizePdfText(text: string): string {
  return text.replace(/[\u2012-\u2015]/g, '-').replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '?');
}

/**
 * Render an export document to PDF bytes using pdf-lib (the project's existing
 * PDF approach — kept in the `pdf-vendor` chunk via dynamic import).
 */
async function buildReportPdfBytes(doc: ExportDocument): Promise<Uint8Array> {
  const { PDFDocument, PageSizes, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  let page = pdf.addPage(PageSizes.A4);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { height } = page.getSize();

  const lines = buildReportExportLines(doc);
  const marginTop = height - 60;
  const marginBottom = 50;
  let y = marginTop;

  lines.forEach((line, index) => {
    if (y < marginBottom) {
      page = pdf.addPage(PageSizes.A4);
      y = marginTop;
    }
    const isTitle = index === 0;
    const isHeading = line.endsWith(':');
    page.drawText(sanitizePdfText(line), {
      x: 50,
      y,
      size: isTitle ? 18 : isHeading ? 12 : 10,
      font: isTitle || isHeading ? bold : regular,
      color: isTitle ? rgb(0.05, 0.1, 0.2) : rgb(0, 0, 0),
      maxWidth: 500,
      lineHeight: 14,
    });
    y -= isTitle ? 28 : line === '' ? 8 : 16;
  });

  return pdf.save();
}

/** Trigger a browser download for a Blob; safe no-op when the DOM/URL API is unavailable. */
function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Export a generated field report: derive the export document via the pure
 * `exportReport` service function, render it to a PDF, and download it.
 */
export async function downloadFieldReport(report: FieldReport): Promise<void> {
  const doc = exportReport(report);
  const bytes = await buildReportPdfBytes(doc);
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  downloadBlob(blob, reportExportFilename(doc));
}

/** Tailwind classes for a lifecycle status badge. */
function statusBadgeClass(status: string): string {
  switch (status) {
    case 'open':
      return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'allocated':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'ready_for_reinspection':
      return 'border-purple-200 bg-purple-50 text-purple-700';
    case 'closed':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'rejected':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    default:
      return 'border-border bg-secondary/30 text-muted-foreground';
  }
}

/** Tailwind classes for a severity badge. */
function severityBadgeClass(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'border-rose-300 bg-rose-100 text-rose-800';
    case 'high':
      return 'border-orange-200 bg-orange-50 text-orange-700';
    case 'medium':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'low':
      return 'border-slate-200 bg-slate-50 text-slate-600';
    default:
      return 'border-border bg-secondary/30 text-muted-foreground';
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Detailed list of aggregated field issues showing id, lifecycle status, and severity. */
function IssueList({ issues }: { issues: FieldIssueSummary[] }) {
  return (
    <section className="space-y-3" aria-label="Aggregated issues">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <ListChecks size={16} className="text-primary" />
        Issues
        <span className="rounded-full bg-secondary/40 px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {issues.length}
        </span>
      </h3>

      {issues.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-white/60 p-4 text-sm text-muted-foreground">
          No issues were captured for this date.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Aggregated field issues</caption>
            <thead className="bg-secondary/20 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Issue ID
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Severity
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {issues.map((issue) => (
                <tr key={issue.id}>
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground">
                    {issue.id}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(
                        issue.status,
                      )}`}
                    >
                      {statusLabel(issue.status)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${severityBadgeClass(
                        issue.severity,
                      )}`}
                    >
                      {issue.severity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** List of evidence references captured for the report date. */
function EvidenceList({ evidence }: { evidence: EvidenceRef[] }) {
  return (
    <section className="space-y-3" aria-label="Evidence references">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <ImageIcon size={16} className="text-primary" />
        Evidence references
        <span className="rounded-full bg-secondary/40 px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {evidence.length}
        </span>
      </h3>

      {evidence.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-white/60 p-4 text-sm text-muted-foreground">
          No evidence was captured for this date.
        </p>
      ) : (
        <ul className="space-y-2">
          {evidence.map((ref) => (
            <li
              key={ref.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-2.5 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex shrink-0 rounded-full border border-border bg-secondary/30 px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground">
                  {ref.type}
                </span>
                <span className="truncate font-mono text-xs text-foreground">{ref.id}</span>
              </div>
              {ref.uri && (
                <a
                  href={ref.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  aria-label={`Open evidence ${ref.id}`}
                >
                  <ExternalLink size={13} /> Open
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FieldReportView({
  projects,
  initialProjectId,
  defaultTimeZone,
}: Props) {
  const fallbackZone = defaultTimeZone ?? browserTimeZone();

  const [projectId, setProjectId] = useState<string>(
    initialProjectId ?? projects[0]?.id ?? '',
  );
  const [date, setDate] = useState<string>(todayIso());
  const [report, setReport] = useState<FieldReport | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const selectedProject = projects.find((p) => p.id === projectId);

  const handleGenerate = async () => {
    if (!projectId || !date) {
      setError('Select a project and a date before generating a report.');
      return;
    }
    setError(null);
    setIsGenerating(true);
    setReport(null);
    try {
      const timeZone = selectedProject?.timeZone ?? fallbackZone;
      const generated = await generateReport(projectId, date, timeZone, {
        lifecycleStage: selectedProject?.lifecycleStage,
      });
      setReport(generated);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to generate the field report. Please try again.',
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const weatherIsRecorded = report ? report.weather !== 'not_recorded' : true;

  const handleExport = async () => {
    if (!report) return;
    setError(null);
    setIsExporting(true);
    try {
      await downloadFieldReport(report);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to export the field report. Please try again.',
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card
      className="rounded-3xl border-border bg-white shadow-sm overflow-hidden h-full"
      role="region"
      aria-label="Field report generator"
    >
      <CardHeader className="flex flex-row items-center justify-between gap-4 bg-primary/5 border-b border-border p-6">
        <CardTitle className="flex items-center gap-2 text-xl font-heading">
          <FileText className="text-primary" /> Field Report
        </CardTitle>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* Report controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
          <div className="space-y-1.5">
            <label
              htmlFor="field-report-project"
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"
            >
              <FolderOpen size={14} /> Project
            </label>
            <select
              id="field-report-project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              aria-label="Select project"
            >
              {projects.length === 0 && <option value="">No projects available</option>}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.id}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="field-report-date"
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"
            >
              <Calendar size={14} /> Report date
            </label>
            <input
              id="field-report-date"
              type="date"
              value={date}
              max={todayIso()}
              onChange={(e) => setDate(e.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              aria-label="Select report date"
            />
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !projectId || !date}
            aria-label="Generate field report"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {isGenerating ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Generating…
              </>
            ) : (
              <>
                <FileText size={16} /> Generate report
              </>
            )}
          </button>
        </div>

        {/* Error state */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Generated report summary */}
        {report && (
          <div
            className="space-y-4 rounded-2xl border border-border bg-secondary/10 p-5"
            role="status"
            aria-live="polite"
            aria-label="Generated field report"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">
                  {selectedProject?.name || report.projectId}
                </p>
                <p className="text-lg font-bold">Field Report — {report.date}</p>
                <p className="text-xs text-muted-foreground">
                  Time zone: {report.timeZone}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={isExporting}
                  aria-label="Export field report as PDF"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-white px-3 text-sm font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {isExporting ? (
                    <>
                      <Loader2 size={15} className="animate-spin" /> Exporting…
                    </>
                  ) : (
                    <>
                      <Download size={15} /> Export PDF
                    </>
                  )}
                </button>
                <div
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    weatherIsRecorded
                      ? 'border-border bg-white text-foreground'
                      : 'border-amber-200 bg-amber-50 text-amber-700'
                  }`}
                >
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    Weather
                  </span>
                  <p className="font-medium">{weatherLabel(report.weather)}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-border bg-white p-3 text-center">
                <p className="text-2xl font-bold">{report.issues.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Issues</p>
              </div>
              <div className="rounded-xl border border-border bg-white p-3 text-center">
                <p className="text-2xl font-bold">{report.evidence.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Evidence</p>
              </div>
              <div className="rounded-xl border border-border bg-white p-3 text-center">
                <p className="text-2xl font-bold">{report.paymentBlockingCount}</p>
                <p className="text-xs text-muted-foreground mt-1">Blocking payment</p>
              </div>
              {report.outstandingHandoverSnags !== undefined && (
                <div className="rounded-xl border border-border bg-white p-3 text-center">
                  <p className="text-2xl font-bold">{report.outstandingHandoverSnags}</p>
                  <p className="text-xs text-muted-foreground mt-1">Outstanding snags</p>
                </div>
              )}
            </div>

            {/* Aggregated issues */}
            <IssueList issues={report.issues} />

            {/* Evidence references */}
            <EvidenceList evidence={report.evidence} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
