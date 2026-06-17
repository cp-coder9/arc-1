import type {
  LifecycleEvaluation,
  Priority,
  ProjectMetadata,
  ProjectRecord,
  RiskFinding,
} from '@/services/lifecycleTypes';

/**
 * Evaluate project risks from metadata, records, and lifecycle evaluation.
 * Returns sorted array of RiskFindings (critical first).
 *
 * Checks include:
 * - Construction phase without municipal approval evidence
 * - Missing signed appointment for critical phases
 * - Payment certificates pending review
 * - Candidate professional output requiring supervision
 * - Missing records from lifecycle evaluation
 */
export function evaluateRisks(
  metadata: ProjectMetadata,
  records: ProjectRecord[],
  lifecycle: LifecycleEvaluation,
): RiskFinding[] {
  const findings: RiskFinding[] = [];

  const hasApproval = records.some(
    (record) =>
      record.recordType === 'municipal_approval_letter' &&
      ['approved', 'issued'].includes(record.status),
  );
  const hasAppointment = records.some(
    (record) =>
      record.recordType === 'professional_appointment' &&
      ['approved', 'issued'].includes(record.status),
  );
  const pendingPayment = records.some(
    (record) =>
      record.recordType === 'payment_certificate' &&
      record.status === 'pending_review',
  );
  const unsupervisedCandidateOutput = records.some(
    (record) =>
      record.audit.createdBy.includes('candidate') &&
      record.approvals.pendingRoles?.includes('architect' as any),
  );

  // Construction without municipal approval evidence
  if (metadata.currentPhase === 'construction_execution' && !hasApproval) {
    findings.push({
      code: 'CONSTRUCTION_WITHOUT_APPROVAL_EVIDENCE',
      priority: 'critical',
      message:
        'Construction phase requires municipal approval evidence before proceeding.',
      assignedRoles: ['client_developer', 'architect', 'admin'],
    });
  }

  // No signed appointment for critical phases
  if (
    !hasAppointment &&
    [
      'appointment',
      'concept_design',
      'design_development',
      'municipal_submission',
      'tender_procurement',
      'construction_execution',
      'closeout',
    ].includes(metadata.currentPhase)
  ) {
    findings.push({
      code: 'NO_SIGNED_APPOINTMENT',
      priority: 'high',
      message: 'Signed appointment record is missing for the current phase.',
      assignedRoles: ['client_developer', 'architect', 'admin'],
    });
  }

  // Payment pending review
  if (pendingPayment) {
    findings.push({
      code: 'PAYMENT_PENDING_REVIEW',
      priority: 'high',
      message: 'Payment certificate requires review before release.',
      assignedRoles: ['client_developer', 'quantity_surveyor', 'contractor'],
    });
  }

  // Candidate professional output requiring supervision
  if (unsupervisedCandidateOutput) {
    findings.push({
      code: 'CANDIDATE_SUPERVISION_REQUIRED',
      priority: 'high',
      message:
        'Candidate professional output requires responsible professional supervision.',
      assignedRoles: ['candidate_professional', 'architect', 'admin'],
    });
  }

  // Missing records from lifecycle evaluation
  for (const missing of lifecycle.missingRecords) {
    findings.push({
      code: `MISSING_${missing.recordType.toUpperCase()}`,
      priority: missing.priority,
      message: missing.reason,
      assignedRoles: [
        'client_developer',
        metadata.leadProfessionalRole,
        'admin',
      ],
    });
  }

  return findings.sort((a, b) => rank(b.priority) - rank(a.priority));
}

function rank(priority: Priority): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[priority];
}
