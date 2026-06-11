import {
  ArchitexRole,
  LifecycleEvaluation,
  Priority,
  ProjectPhase,
  ProjectRecord,
  RiskFinding,
} from '@/types/architexMasterTypes';

// ─── Risk Detection Engine ──────────────────────────────────────────────────

/**
 * Detect project risks from records and lifecycle evaluation.
 * Includes both static risk checks (by phase/record condition) and
 * dynamic risks derived from missing lifecycle records.
 *
 * @param records - All project records
 * @param lifecycle - Optional lifecycle evaluation for dynamic risk generation
 * @returns Sorted array of RiskFindings (critical first)
 */
export function detectProjectRisks(
  records: ProjectRecord<unknown>[],
  lifecycle?: LifecycleEvaluation,
): RiskFinding[] {
  const findings: RiskFinding[] = [];

  // ── Static Risk Checks ───────────────────────────────────────────────

  // 1. Construction phase without municipal approval evidence
  const hasMunicipalApproval = records.some(
    (r) =>
      r.recordType === 'municipal_submission_item' &&
      ['approved', 'issued'].includes(r.approval.status),
  );
  const constructionPhases = records.filter(
    (r) => r.phase === 'construction_execution',
  );
  if (constructionPhases.length > 0 && !hasMunicipalApproval) {
    findings.push({
      code: 'CONSTRUCTION_WITHOUT_APPROVAL_EVIDENCE',
      severity: 'critical',
      message:
        'Construction phase requires municipal approval evidence before proceeding.',
      assignedRoles: ['client', 'architect', 'platform_admin'],
    });
  }

  // 2. No signed appointment record
  const hasAppointment = records.some(
    (r) =>
      r.recordType === 'practice_record' &&
      r.title.toLowerCase().includes('appointment'),
  );
  const appointmentDependentPhases: ProjectPhase[] = [
    'proposal_appointment',
    'design_coordination',
    'municipal_submission',
    'tender_procurement',
    'construction_execution',
    'payments_commercial_control',
    'closeout',
  ];
  const activeInDependentPhase = records.some((r) =>
    appointmentDependentPhases.includes(r.phase),
  );
  if (!hasAppointment && activeInDependentPhase) {
    findings.push({
      code: 'NO_SIGNED_APPOINTMENT',
      severity: 'high',
      message:
        'Signed appointment record is missing for the current project phase.',
      assignedRoles: ['client', 'architect', 'platform_admin'],
    });
  }

  // 3. Tender/procurement phase without scope baseline
  const hasRfq = records.some((r) => r.recordType === 'rfq');
  const inTenderPhase = records.some((r) => r.phase === 'tender_procurement');
  if (inTenderPhase && !hasRfq) {
    findings.push({
      code: 'TENDER_WITHOUT_SCOPE_BASELINE',
      severity: 'high',
      message:
        'Tender/procurement phase requires an RFQ and scope baseline before soliciting bids.',
      assignedRoles: ['client', 'quantity_surveyor', 'architect'],
    });
  }

  // 4. Payment certificate without QS/client review
  const pendingPayments = records.filter(
    (r) =>
      r.recordType === 'payment_certificate' &&
      r.approval.status === 'pending_review',
  );
  if (pendingPayments.length > 0) {
    findings.push({
      code: 'PAYMENT_PENDING_REVIEW',
      severity: 'high',
      message: `${pendingPayments.length} payment certificate(s) require QS and client review before release.`,
      assignedRoles: ['client', 'quantity_surveyor', 'contractor'],
    });
  }

  // 5. Closeout without snag register resolution
  const closeoutPhases: ProjectPhase[] = [
    'closeout',
    'defects_liability',
    'operations_post_occupancy',
  ];
  const inCloseout = records.some((r) => closeoutPhases.includes(r.phase));
  const unresolvedSnags = records.filter(
    (r) =>
      r.recordType === 'snag' &&
      !['closed', 'approved', 'issued'].includes(r.approval.status),
  );
  if (inCloseout && unresolvedSnags.length > 0) {
    findings.push({
      code: 'CLOSEOUT_WITHOUT_SNAG_RESOLUTION',
      severity: 'high',
      message: `${unresolvedSnags.length} unresolved snag(s) remain — closeout cannot proceed without snag register sign-off.`,
      assignedRoles: ['architect', 'contractor', 'client'],
    });
  }

  // 6. Candidate professional issuing unsupervised formal output
  const unsupervisedCandidate = records.some(
    (r) =>
      r.audit.createdByUserId?.toLowerCase().includes('candidate') &&
      r.approval.status === 'pending_review' &&
      r.approval.requiredApproverRoles.length > 0 &&
      !r.approval.approvedByUserId,
  );
  if (unsupervisedCandidate) {
    findings.push({
      code: 'CANDIDATE_UNSUPERVISED_OUTPUT',
      severity: 'high',
      message:
        'Candidate professional has issued output requiring responsible professional supervision and sign-off.',
      assignedRoles: [
        'candidate_professional',
        'architect',
        'platform_admin',
      ],
    });
  }

  // 7. No drawing revision recorded (existing check, enhanced)
  const hasDrawingRevision = records.some(
    (r) =>
      r.recordType === 'drawing_revision' &&
      r.approval.status !== 'superseded',
  );
  if (
    !hasDrawingRevision &&
    records.some((r) =>
      [
        'design_coordination',
        'municipal_submission',
        'construction_execution',
      ].includes(r.phase),
    )
  ) {
    findings.push({
      code: 'NO_DRAWING_REVISION',
      severity: 'medium',
      message:
        'No current controlled drawing revision is recorded for this active design/construction phase.',
      assignedRoles: ['architect', 'engineer'],
    });
  }

  // 8. Outstanding payments (existing check, enhanced)
  const unpaidPayments = records.filter(
    (r) => r.recordType === 'payment_certificate' && r.status !== 'paid',
  );
  if (unpaidPayments.length > 0) {
    findings.push({
      code: 'OUTSTANDING_PAYMENT',
      severity: 'medium',
      message: `${unpaidPayments.length} payment record(s) appear outstanding.`,
      assignedRoles: ['quantity_surveyor', 'client', 'contractor'],
    });
  }

  // 9. Pending formal approvals (existing check, enhanced)
  const pendingFormalApprovals = records.filter(
    (r) =>
      r.approval.status === 'pending_review' &&
      r.approval.requiredApproverRoles.length > 0,
  );
  if (pendingFormalApprovals.length > 0) {
    findings.push({
      code: 'PENDING_APPROVALS',
      severity: 'high',
      message: `${pendingFormalApprovals.length} record(s) require professional/admin review before they can be issued.`,
      assignedRoles: ['architect', 'platform_admin'],
    });
  }

  // 10. Marketplace/candidate verification pending (existing check, enhanced)
  const unverifiedListings = records.filter(
    (r) =>
      r.recordType === 'marketplace_listing' &&
      r.status.includes('pending'),
  );
  if (unverifiedListings.length > 0) {
    findings.push({
      code: 'MARKETPLACE_VERIFICATION_PENDING',
      severity: 'medium',
      message:
        'Marketplace/candidate-professional listing requires verification before use.',
      assignedRoles: ['platform_admin', 'architect'],
    });
  }

  // 11. Construction with delay events (new)
  const constructionDelays = records.filter(
    (r) =>
      r.recordType === 'delay_event' &&
      r.phase === 'construction_execution' &&
      !['closed', 'resolved'].includes(r.status),
  );
  if (constructionDelays.length > 0) {
    findings.push({
      code: 'ACTIVE_CONSTRUCTION_DELAYS',
      severity: 'high',
      message: `${constructionDelays.length} active delay event(s) in construction — schedule and cost impact should be assessed.`,
      assignedRoles: ['architect', 'contractor', 'site_manager', 'client'],
    });
  }

  // 12. Closeout without final items (new)
  const inCloseoutPhase = records.some((r) => r.phase === 'closeout');
  const hasCloseoutItem = records.some(
    (r) =>
      r.recordType === 'closeout_item' &&
      ['approved', 'issued'].includes(r.approval.status),
  );
  if (inCloseoutPhase && !hasCloseoutItem) {
    findings.push({
      code: 'CLOSEOUT_WITHOUT_CLOSEOUT_ITEMS',
      severity: 'medium',
      message:
        'Closeout phase requires completion certificates, warranties, and handover documentation.',
      assignedRoles: ['architect', 'contractor', 'client'],
    });
  }

  // ── Dynamic Risks from Lifecycle Evaluation ───────────────────────────

  if (lifecycle) {
    for (const missing of lifecycle.missingRecords) {
      // Avoid duplicating risks already captured above
      const alreadyCovered = findings.some((f) =>
        f.code.includes(missing.recordType.toUpperCase()),
      );
      if (!alreadyCovered) {
        findings.push({
          code: `MISSING_${missing.recordType.toUpperCase()}`,
          severity: missing.priority,
          message: missing.reason,
          assignedRoles: getDefaultRolesForRecordType(missing.recordType),
        });
      }
    }
  }

  // ── Sort by severity (critical first) ────────────────────────────────

  return findings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function severityRank(severity: Priority): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[severity];
}

function getDefaultRolesForRecordType(
  recordType: string,
): ArchitexRole[] {
  switch (recordType) {
    case 'knowledge_source':
      return ['architect', 'client'];
    case 'verification_record':
      return ['architect', 'platform_admin'];
    case 'drawing_revision':
      return ['architect', 'engineer'];
    case 'document':
      return ['architect', 'platform_admin'];
    case 'municipal_submission_item':
      return ['architect', 'town_planner', 'client'];
    case 'rfq':
      return ['quantity_surveyor', 'architect', 'client'];
    case 'quote_comparison':
      return ['quantity_surveyor', 'architect'];
    case 'purchase_order':
      return ['client', 'architect', 'contractor'];
    case 'site_diary':
      return ['site_manager', 'contractor', 'architect'];
    case 'snag':
      return ['architect', 'contractor', 'site_manager'];
    case 'payment_certificate':
      return ['quantity_surveyor', 'client', 'contractor'];
    case 'escrow_milestone':
      return ['client', 'quantity_surveyor', 'platform_admin'];
    case 'closeout_item':
      return ['architect', 'client', 'contractor'];
    case 'delay_event':
      return ['architect', 'contractor', 'site_manager', 'client'];
    default:
      return ['architect', 'platform_admin'];
  }
}
