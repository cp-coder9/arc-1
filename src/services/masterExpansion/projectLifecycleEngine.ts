import {
  LifecycleEvaluation,
  MissingRecord,
  PhaseDefinition,
  Priority,
  ProjectLifecycleState,
  ProjectMetadata,
  ProjectPhase,
  ProjectRecord,
  ProjectRecordType,
} from '@/types/architexMasterTypes';

// ─── Phase Definitions ─────────────────────────────────────────────────────

/**
 * Full phase definitions with required/optional record types and handoff rules.
 * Maps the production 11-phase model to required record types.
 */
export const PHASE_DEFINITIONS: PhaseDefinition[] = [
  {
    phase: 'lead_enquiry',
    label: 'Lead / Enquiry',
    requiredRecordTypes: [],
    optionalRecordTypes: ['knowledge_source'],
    handoffRule: 'Capture client brief and project scope before feasibility.',
  },
  {
    phase: 'brief_feasibility',
    label: 'Brief / Feasibility',
    requiredRecordTypes: ['knowledge_source'],
    optionalRecordTypes: ['verification_record'],
    handoffRule: 'Feasibility should identify property constraints and likely professional appointments.',
  },
  {
    phase: 'proposal_appointment',
    label: 'Proposal / Appointment',
    requiredRecordTypes: ['verification_record'],
    optionalRecordTypes: ['practice_record'],
    handoffRule: 'Signed appointment and verified professional records required before design.',
  },
  {
    phase: 'design_coordination',
    label: 'Design Coordination',
    requiredRecordTypes: ['drawing_revision', 'document'],
    optionalRecordTypes: ['verification_record'],
    handoffRule: 'Coordinated design package with controlled drawings required before municipal submission.',
  },
  {
    phase: 'municipal_submission',
    label: 'Municipal Submission',
    requiredRecordTypes: ['municipal_submission_item', 'drawing_revision'],
    optionalRecordTypes: [],
    handoffRule: 'Submission pack must be issued; approval evidence required before procurement.',
  },
  {
    phase: 'tender_procurement',
    label: 'Tender / Procurement',
    requiredRecordTypes: ['rfq', 'quote_comparison'],
    optionalRecordTypes: ['purchase_order', 'verification_record'],
    handoffRule: 'Tender pack and scope baseline required before awards and construction.',
  },
  {
    phase: 'construction_execution',
    label: 'Construction Execution',
    requiredRecordTypes: ['site_diary', 'snag'],
    optionalRecordTypes: [
      'payment_certificate',
      'drawing_revision',
      'delay_event',
      'municipal_submission_item',
    ],
    handoffRule:
      'Construction should not proceed without approval evidence, appointments and programme.',
  },
  {
    phase: 'payments_commercial_control',
    label: 'Payments / Commercial Control',
    requiredRecordTypes: ['payment_certificate', 'escrow_milestone'],
    optionalRecordTypes: ['site_diary', 'snag'],
    handoffRule:
      'Match payment certificates to approved deliverables, site evidence, retention and escrow milestones.',
  },
  {
    phase: 'closeout',
    label: 'Closeout',
    requiredRecordTypes: ['closeout_item', 'drawing_revision'],
    optionalRecordTypes: ['payment_certificate', 'snag', 'site_diary'],
    handoffRule: 'Closeout pack with snag resolution required before handover.',
  },
  {
    phase: 'defects_liability',
    label: 'Defects Liability',
    requiredRecordTypes: ['snag'],
    optionalRecordTypes: ['closeout_item', 'site_diary'],
    handoffRule: 'All snags must be resolved before defects liability period ends.',
  },
  {
    phase: 'operations_post_occupancy',
    label: 'Operations / Post-Occupancy',
    requiredRecordTypes: ['closeout_item'],
    optionalRecordTypes: ['snag', 'verification_record'],
    handoffRule: 'Final closeout documentation and handover records complete.',
  },
];

// ─── Phase Definition Lookups ───────────────────────────────────────────────

export function definitionForPhase(phase: ProjectPhase): PhaseDefinition {
  const def = PHASE_DEFINITIONS.find((d) => d.phase === phase);
  if (!def) {
    throw new Error(`No lifecycle definition for phase: ${phase}`);
  }
  return def;
}

export function requiredByPhase(phase: ProjectPhase): ProjectRecordType[] {
  return definitionForPhase(phase).requiredRecordTypes;
}

// ─── Original buildLifecycleState (backward compatible) ─────────────────────

const requiredByPhaseMap: Record<ProjectPhase, ProjectRecordType[]> = (() => {
  const map = {} as Record<ProjectPhase, ProjectRecordType[]>;
  for (const def of PHASE_DEFINITIONS) {
    map[def.phase] = def.requiredRecordTypes;
  }
  return map;
})();

export function buildLifecycleState(input: {
  tenantId: string;
  projectId: string;
  currentPhase: ProjectPhase;
  records: ProjectRecord<unknown>[];
}): ProjectLifecycleState {
  const requiredRecordTypes = requiredByPhaseMap[input.currentPhase] ?? [];
  const completedRecordTypes = unique(
    input.records.map((record) => record.recordType),
  );
  const missing = requiredRecordTypes.filter(
    (type) => !completedRecordTypes.includes(type),
  );

  return {
    tenantId: input.tenantId,
    projectId: input.projectId,
    currentPhase: input.currentPhase,
    phaseStartedAt: new Date().toISOString(),
    requiredRecordTypes,
    completedRecordTypes,
    blockers: missing.map(
      (type) => `Missing required ${type} record for ${input.currentPhase}`,
    ),
  };
}

// ─── Rich Lifecycle Evaluation ──────────────────────────────────────────────

const USABLE_STATUSES = new Set(['approved', 'issued']);

/**
 * Check whether a usable (approved or issued) record of the given type exists.
 */
export function hasUsableRecord(
  records: ProjectRecord<unknown>[],
  recordType: ProjectRecordType,
): boolean {
  return records.some(
    (r) => r.recordType === recordType && USABLE_STATUSES.has(r.approval.status),
  );
}

/**
 * Evaluate the current phase readiness with detailed record checking.
 * Returns a comprehensive LifecycleEvaluation including missing records,
 * blockers, mayAdvance decision, and next best actions.
 */
export function evaluateLifecycle(
  metadata: ProjectMetadata,
  records: ProjectRecord<unknown>[],
): LifecycleEvaluation {
  const definition = definitionForPhase(metadata.currentPhase);
  const presentRequired = definition.requiredRecordTypes.filter((type) =>
    hasUsableRecord(records, type),
  );
  const missingRecords: MissingRecord[] = definition.requiredRecordTypes
    .filter((type) => !presentRequired.includes(type))
    .map((type) => ({
      recordType: type,
      priority: priorityForMissingRecord(type, metadata.currentPhase),
      reason: `Required for ${definition.label}: ${type}`,
    }));

  const blockers = identifyBlockers(missingRecords, metadata, records);
  const nextBestActions = produceNextBestActions(
    missingRecords,
    metadata.currentPhase,
  );

  return {
    phase: metadata.currentPhase,
    requiredRecordTypes: definition.requiredRecordTypes,
    presentRequiredRecordTypes: presentRequired,
    missingRecords,
    mayAdvance: missingRecords.length === 0 && blockers.length === 0,
    blockers,
    nextBestActions,
  };
}

// ─── Phase Readiness Evaluation ─────────────────────────────────────────────

/**
 * Evaluate whether the current phase has all required records present.
 * Checks both record existence AND approval status where applicable.
 */
export function evaluatePhaseReadiness(
  phase: ProjectPhase,
  records: ProjectRecord<unknown>[],
): {
  ready: boolean;
  missingRequired: ProjectRecordType[];
  optionalPresent: ProjectRecordType[];
} {
  const definition = definitionForPhase(phase);
  const missingRequired = definition.requiredRecordTypes.filter(
    (type) => !hasUsableRecord(records, type),
  );
  const optionalPresent = definition.optionalRecordTypes.filter((type) =>
    hasUsableRecord(records, type),
  );

  return {
    ready: missingRequired.length === 0,
    missingRequired,
    optionalPresent,
  };
}

// ─── Blocker Identification ─────────────────────────────────────────────────

/**
 * Identify specific blockers based on missing records and phase context.
 * Some blockers require multi-party approval checks.
 */
export function identifyBlockers(
  missingRecords: MissingRecord[],
  metadata: ProjectMetadata,
  records: ProjectRecord<unknown>[],
): string[] {
  const blockers: string[] = [];

  // Direct missing record blockers
  for (const missing of missingRecords) {
    blockers.push(
      `[${missing.priority.toUpperCase()}] Missing ${missing.recordType}: ${missing.reason}`,
    );
  }

  // Multi-party approval checks for specific phases
  if (metadata.currentPhase === 'construction_execution') {
    const hasMunicipalApproval = records.some(
      (r) =>
        r.recordType === 'municipal_submission_item' &&
        USABLE_STATUSES.has(r.approval.status),
    );
    if (!hasMunicipalApproval) {
      blockers.push(
        '[CRITICAL] Construction requires municipal approval evidence — multi-party sign-off needed (client + architect + municipality).',
      );
    }
  }

  if (metadata.currentPhase === 'payments_commercial_control') {
    const hasEscrowApproval = records.some(
      (r) =>
        r.recordType === 'escrow_milestone' &&
        USABLE_STATUSES.has(r.approval.status),
    );
    if (!hasEscrowApproval) {
      blockers.push(
        '[HIGH] Payment release requires escrow milestone approval from client and quantity surveyor.',
      );
    }
  }

  if (
    ['closeout', 'defects_liability', 'operations_post_occupancy'].includes(
      metadata.currentPhase,
    )
  ) {
    const unresolvedSnags = records.filter(
      (r) =>
        r.recordType === 'snag' &&
        !['closed', 'approved', 'issued'].includes(r.approval.status),
    );
    if (unresolvedSnags.length > 0) {
      blockers.push(
        `[HIGH] ${unresolvedSnags.length} unresolved snag(s) require multi-party sign-off before closeout.`,
      );
    }
  }

  return blockers;
}

// ─── Can Advance Gate Logic ─────────────────────────────────────────────────

/**
 * Determine whether a project may advance from the current phase.
 * Considers missing records AND multi-party approval requirements.
 */
export function canAdvance(
  evaluation: LifecycleEvaluation,
  overrides?: { adminOverride?: boolean; skipApprovalCheck?: boolean },
): { allowed: boolean; reason?: string } {
  if (evaluation.mayAdvance) return { allowed: true };

  if (overrides?.adminOverride && overrides?.skipApprovalCheck) {
    return { allowed: true };
  }

  const criticalBlockers = evaluation.missingRecords.filter(
    (m) => m.priority === 'critical',
  );
  if (criticalBlockers.length > 0 && !overrides?.adminOverride) {
    return {
      allowed: false,
      reason: `Critical blockers must be resolved before advance: ${criticalBlockers.map((m) => m.recordType).join(', ')}`,
    };
  }

  const reason = evaluation.blockers.join('; ');
  return { allowed: false, reason: reason || 'Missing required records' };
}

// ─── Next Best Actions ──────────────────────────────────────────────────────

/**
 * Produce actionable next-best-action strings from missing records.
 * Each action is specific to the record type and phase context.
 */
export function produceNextBestActions(
  missingRecords: MissingRecord[],
  phase: ProjectPhase,
): string[] {
  if (missingRecords.length === 0) {
    const definition = definitionForPhase(phase);
    return [`Review ${definition.handoffRule}`];
  }

  return missingRecords.map((missing) => actionForMissingRecord(missing.recordType));
}

function actionForMissingRecord(recordType: ProjectRecordType): string {
  switch (recordType) {
    case 'knowledge_source':
      return 'Create or link project brief and feasibility knowledge sources.';
    case 'verification_record':
      return 'Complete professional appointment verification record with role confirmation.';
    case 'drawing_revision':
      return 'Upload and issue current controlled drawing revisions.';
    case 'document':
      return 'Create or upload required project document.';
    case 'municipal_submission_item':
      return 'Prepare and issue municipal submission package with required forms.';
    case 'rfq':
      return 'Create and issue RFQ/tender package to qualified contractors.';
    case 'quote_comparison':
      return 'Complete quote comparison and procurement recommendation.';
    case 'purchase_order':
      return 'Issue purchase order or letter of award to selected contractor.';
    case 'site_diary':
      return 'Start and maintain site diary entries for construction progress.';
    case 'snag':
      return 'Create baseline snag register and track resolution.';
    case 'payment_certificate':
      return 'Prepare and submit payment certificate for review.';
    case 'escrow_milestone':
      return 'Define and approve escrow milestones linked to deliverables.';
    case 'closeout_item':
      return 'Assemble closeout documentation, certificates, and handover pack.';
    case 'delay_event':
      return 'Record delay event with cause, impact, and mitigation plan.';
    default:
      return `Create or approve missing record: ${recordType}.`;
  }
}

// ─── Original recommendLifecycleActions (backward compatible) ───────────────

export function recommendLifecycleActions(state: ProjectLifecycleState): string[] {
  if (state.blockers.length > 0) {
    return state.blockers.map((blocker) => `Resolve blocker: ${blocker}`);
  }

  if (state.currentPhase === 'municipal_submission') {
    return [
      'Confirm submission checklist, drawing revisions and municipality-specific forms before issue.',
    ];
  }

  if (state.currentPhase === 'payments_commercial_control') {
    return [
      'Match payment certificates to approved deliverables, site evidence, retention and escrow milestones.',
    ];
  }

  return ['Confirm phase gate and prepare next project action.'];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function priorityForMissingRecord(
  recordType: ProjectRecordType,
  phase: ProjectPhase,
): Priority {
  // Critical: blocks all progress
  if (
    recordType === 'municipal_submission_item' &&
    ['construction_execution', 'tender_procurement'].includes(phase)
  ) {
    return 'critical';
  }
  if (recordType === 'verification_record' && phase === 'proposal_appointment') {
    return 'critical';
  }

  // High: significant progress blocker
  if (
    ['drawing_revision', 'payment_certificate', 'escrow_milestone', 'snag'].includes(
      recordType,
    )
  ) {
    return 'high';
  }
  if (recordType === 'closeout_item' && phase === 'closeout') {
    return 'high';
  }

  // Medium: important but not blocking
  if (['rfq', 'quote_comparison', 'site_diary', 'document'].includes(recordType)) {
    return 'medium';
  }

  return 'medium';
}
