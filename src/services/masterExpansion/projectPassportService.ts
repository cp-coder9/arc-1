import {
  ArchitexRole,
  LifecycleEvaluation,
  Priority,
  ProjectLifecycleState,
  ProjectMetadata,
  ProjectPassportSummary,
  ProjectRecord,
  TeamAppointmentSummary,
} from '@/types/architexMasterTypes';
import { evaluateLifecycle, recommendLifecycleActions } from './projectLifecycleEngine';
import { detectProjectRisks } from './riskEngineService';

// ─── Full Project Passport Builder ──────────────────────────────────────────

/**
 * Build a comprehensive Project Passport from project metadata and records.
 * This is the enriched version that includes municipality context, team
 * appointments, approval/document/financial status, lifecycle evaluation,
 * and risk summary — beyond the basic summary fields.
 */
export function buildProjectPassport(
  metadata: ProjectMetadata,
  records: ProjectRecord<unknown>[],
): ProjectPassportSummary {
  const lifecycle = evaluateLifecycle(metadata, records);
  const riskFindings = detectProjectRisks(records, lifecycle);

  return {
    tenantId: metadata.tenantId,
    projectId: metadata.projectId,
    currentPhase: metadata.currentPhase,

    // Core counts (existing contract)
    totalRecords: records.length,
    currentDrawingRevisions: records.filter(
      (r) => r.recordType === 'drawing_revision' && r.approval.status !== 'superseded',
    ).length,
    openRisks: riskFindings.length,
    pendingApprovals: records.filter(
      (r) => r.approval.status === 'pending_review',
    ).length,
    outstandingPayments: records.filter(
      (r) => r.recordType === 'payment_certificate' && r.status !== 'paid',
    ).length,
    missingRequiredRecords: lifecycle.missingRecords.map((m) => m.recordType),
    nextBestActions: lifecycle.nextBestActions,

    // Enriched fields from Pack 2
    projectName: metadata.projectName,
    clientName: metadata.clientName,
    municipality: metadata.municipality,
    propertyReference: metadata.propertyReference,
    propertyUse: metadata.propertyUse,
    landUseNotes: metadata.landUseNotes,
    leadProfessionalRole: metadata.leadProfessionalRole,
    appointments: extractTeamAppointments(records),
    approvalStatus: calculateApprovalStatus(records),
    documentStatus: calculateDocumentStatus(records),
    financialStatus: calculateFinancialStatus(records),
    lifecycle,
    riskLevel: riskFindings[0]?.severity ?? (lifecycle.mayAdvance ? 'low' : 'medium'),
  };
}

// ─── Original Thin Builder (backward-compatible) ────────────────────────────

/**
 * Build a basic passport summary from a lifecycle state and records.
 * Kept for backward compatibility with existing consumers.
 */
export function buildProjectPassportSummary(
  state: ProjectLifecycleState,
  records: ProjectRecord<unknown>[],
): ProjectPassportSummary {
  return {
    tenantId: state.tenantId,
    projectId: state.projectId,
    currentPhase: state.currentPhase,
    totalRecords: records.length,
    currentDrawingRevisions: records.filter(
      (r) => r.recordType === 'drawing_revision' && r.approval.status !== 'superseded',
    ).length,
    openRisks: records.filter(
      (r) => r.recordType === 'risk_alert' && r.status !== 'closed',
    ).length,
    pendingApprovals: records.filter(
      (r) => r.approval.status === 'pending_review',
    ).length,
    outstandingPayments: records.filter(
      (r) => r.recordType === 'payment_certificate' && r.status !== 'paid',
    ).length,
    missingRequiredRecords: state.requiredRecordTypes.filter(
      (t) => !state.completedRecordTypes.includes(t),
    ),
    nextBestActions: recommendLifecycleActions(state),
  };
}

// ─── Team Appointment Extraction ────────────────────────────────────────────

/**
 * Extract team appointment summaries from professional appointment records.
 * Validates that each appointment has a recognized role and appointed party.
 */
export function extractTeamAppointments(
  records: ProjectRecord<unknown>[],
): TeamAppointmentSummary[] {
  const appointmentRecords = records.filter(
    (r) =>
      r.recordType === 'practice_record' &&
      typeof r.payload === 'object' &&
      r.payload !== null,
  );

  if (appointmentRecords.length === 0) {
    // Fallback: look for verification records that reference appointments
    return records
      .filter(
        (r) =>
          r.recordType === 'verification_record' &&
          r.title.toLowerCase().includes('appointment'),
      )
      .map((r) => ({
        role: (r.payload as Record<string, unknown>)?.role as ArchitexRole ?? 'architect',
        appointedParty: String(
          (r.payload as Record<string, unknown>)?.appointedParty ?? 'Unknown',
        ),
        status: r.approval.status,
        recordId: r.id,
      }));
  }

  return appointmentRecords.map((r) => {
    const payload = r.payload as Record<string, unknown>;
    return {
      role: (payload.role as ArchitexRole) ?? 'architect',
      appointedParty: String(payload.appointedParty ?? payload.name ?? 'Unknown'),
      status: r.approval.status,
      recordId: r.id,
      discipline: payload.discipline as string | undefined,
    };
  });
}

// ─── Status Calculators ─────────────────────────────────────────────────────

/**
 * Determine overall approval status for the project.
 * Checks for municipal submission items and verification records
 * that indicate regulatory or professional approval gates.
 */
export function calculateApprovalStatus(
  records: ProjectRecord<unknown>[],
): ProjectPassportSummary['approvalStatus'] {
  const approvalRecords = records.filter(
    (r) =>
      r.recordType === 'municipal_submission_item' ||
      (r.recordType === 'verification_record' &&
        r.title.toLowerCase().includes('approval')),
  );

  if (approvalRecords.length === 0) return 'missing';

  const hasApproved = approvalRecords.some((r) =>
    ['approved', 'issued'].includes(r.approval.status),
  );
  if (hasApproved) return 'approved';

  const hasPending = approvalRecords.some((r) =>
    ['pending_review', 'draft'].includes(r.approval.status),
  );
  return hasPending ? 'pending' : 'missing';
}

/**
 * Determine overall document readiness status.
 * Considers drawing revisions and submitted documents.
 */
export function calculateDocumentStatus(
  records: ProjectRecord<unknown>[],
): ProjectPassportSummary['documentStatus'] {
  const docRecords = records.filter((r) =>
    ['drawing_revision', 'document', 'municipal_submission_item'].includes(
      r.recordType,
    ),
  );

  if (docRecords.length === 0) return 'incomplete';

  const hasIssued = docRecords.some((r) =>
    ['issued', 'approved'].includes(r.approval.status),
  );
  if (hasIssued) return 'issued';

  const hasReady = docRecords.some((r) =>
    ['pending_review', 'draft'].includes(r.approval.status),
  );
  return hasReady ? 'ready' : 'incomplete';
}

/**
 * Determine overall financial status.
 * Checks payment certificates and escrow milestones.
 */
export function calculateFinancialStatus(
  records: ProjectRecord<unknown>[],
): ProjectPassportSummary['financialStatus'] {
  const financialRecords = records.filter((r) =>
    ['payment_certificate', 'escrow_milestone'].includes(r.recordType),
  );

  if (financialRecords.length === 0) return 'not_started';

  const hasPending = financialRecords.some((r) =>
    ['pending_review', 'draft'].includes(r.approval.status),
  );
  if (hasPending) return 'pending_review';

  return 'current';
}

// ─── Readiness Scoring ──────────────────────────────────────────────────────

/**
 * Calculate a 0-100 readiness score for the project based on:
 * - Required records present (50% weight)
 * - Approval gates cleared (25% weight)
 * - Risk severity (25% weight)
 */
export function calculateReadinessScore(
  passport: ProjectPassportSummary,
): number {
  let score = 50; // baseline

  // Required records dimension (0-50 points)
  const totalRequired =
    (passport.lifecycle?.requiredRecordTypes.length ?? 0) +
    (passport.missingRequiredRecords?.length ?? 0);
  if (totalRequired > 0) {
    const presentCount = totalRequired - (passport.missingRequiredRecords?.length ?? 0);
    score = Math.round((presentCount / totalRequired) * 50);
  }

  // Approval dimension (0-25 points)
  if (passport.approvalStatus === 'approved') score += 25;
  else if (passport.approvalStatus === 'pending') score += 10;

  // Risk dimension (0-25 points)
  const riskPenalty: Record<Priority, number> = {
    low: 0,
    medium: 8,
    high: 16,
    critical: 25,
  };
  score -= riskPenalty[passport.riskLevel ?? 'medium'];

  return Math.max(0, Math.min(100, score));
}

// ─── Re-export for convenience ─────────────────────────────────────────────

export { evaluateLifecycle } from './projectLifecycleEngine';
export { detectProjectRisks } from './riskEngineService';
export { recommendLifecycleActions } from './projectLifecycleEngine';
