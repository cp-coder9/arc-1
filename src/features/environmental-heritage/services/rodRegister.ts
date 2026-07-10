/**
 * Environmental & Heritage Module — ROD Register Service
 *
 * Pure business logic for Record of Decision (ROD) condition compliance
 * tracking. Handles forward-only state machine transitions, compliance
 * summary calculations, deadline alert evaluation, and evidence recording.
 *
 * State transitions (forward-only):
 *   outstanding → in_progress → evidence_submitted → verified_compliant
 *
 * Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 18.8
 */

import type {
  ConditionCategory,
  ConditionComplianceState,
  RODCondition,
  VerificationMethod,
} from '../types';

// ─── Service Result Pattern ───────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── Summary & Alert Types ────────────────────────────────────────────────────

/** Summary of condition compliance across a set of ROD conditions */
export interface ConditionComplianceSummary {
  totalConditions: number;
  byCategory: Record<ConditionCategory, number>;
  verifiedCount: number;
  outstandingCount: number;
  overdueCount: number;
  compliancePercentage: number;
}

/** Alert generated from condition deadline evaluation */
export interface ConditionAlert {
  conditionId: string;
  conditionNumber: number;
  type: 'deadline_warning' | 'overdue_critical';
  message: string;
  deadline: string;
  daysRemaining: number;
}

/** Evidence record to attach to a condition */
export interface EvidenceRecord {
  type: 'document_ref' | 'inspection_record' | 'monitoring_data';
  reference: string;
  description?: string;
  recordedBy: string;
  recordedAt: string;
}

// ─── State Machine ────────────────────────────────────────────────────────────

/**
 * Ordered compliance states for the forward-only state machine.
 * Index position determines valid forward transitions.
 */
const STATE_ORDER: ConditionComplianceState[] = [
  'outstanding',
  'in_progress',
  'evidence_submitted',
  'verified_compliant',
];

// ─── Public Functions ─────────────────────────────────────────────────────────

/**
 * Transitions a ROD condition to a target compliance state, enforcing the
 * forward-only state machine. Only allows transitions to the immediately
 * next state in the sequence.
 *
 * Records the transition in stageHistory as an audit trail entry.
 *
 * Validates: Requirements 18.2, 18.7
 */
export function transitionCondition(
  condition: RODCondition,
  targetState: ConditionComplianceState,
  actor: { id: string; displayName: string },
  now?: Date,
): ServiceResult<{ next: RODCondition; valid: boolean; error?: string }> {
  if (!condition) {
    return {
      success: false,
      error: {
        code: 'INVALID_CONDITION',
        message: 'ROD condition record is required.',
      },
    };
  }

  if (!actor?.id) {
    return {
      success: false,
      error: {
        code: 'ACTOR_REQUIRED',
        message: 'Actor ID is required for condition state transitions.',
      },
    };
  }

  const currentIndex = STATE_ORDER.indexOf(condition.state);
  const targetIndex = STATE_ORDER.indexOf(targetState);

  // Validate target state is a known state
  if (targetIndex === -1) {
    return {
      success: true,
      data: {
        next: condition,
        valid: false,
        error: `'${targetState}' is not a valid compliance state.`,
      },
    };
  }

  // Enforce forward-only: target must be exactly one step ahead
  if (targetIndex !== currentIndex + 1) {
    const currentState = condition.state;
    const nextAllowed = currentIndex < STATE_ORDER.length - 1
      ? STATE_ORDER[currentIndex + 1]
      : undefined;

    const errorMsg = nextAllowed
      ? `Cannot transition from '${currentState}' to '${targetState}'. Forward-only transitions allowed. Next valid state: '${nextAllowed}'.`
      : `Cannot transition from '${currentState}'. It is already in the terminal state 'verified_compliant'.`;

    return {
      success: true,
      data: {
        next: condition,
        valid: false,
        error: errorMsg,
      },
    };
  }

  const timestamp = (now ?? new Date()).toISOString();

  const next: RODCondition = {
    ...condition,
    state: targetState,
    stageHistory: [
      ...condition.stageHistory,
      {
        state: targetState,
        date: timestamp.split('T')[0],
        actor: actor.id,
      },
    ],
    updatedAt: timestamp,
  };

  return {
    success: true,
    data: {
      next,
      valid: true,
    },
  };
}

/**
 * Calculates a compliance summary across a set of ROD conditions.
 * Produces totals, per-category breakdown, verified/outstanding/overdue counts,
 * and an overall compliance percentage.
 *
 * A condition is considered overdue if:
 * - It has a compliance deadline set
 * - The deadline has passed (relative to `now`)
 * - Its state is NOT 'evidence_submitted' or 'verified_compliant'
 *
 * Validates: Requirement 18.5
 */
export function calculateConditionCompliance(
  conditions: RODCondition[],
  now?: Date,
): ServiceResult<ConditionComplianceSummary> {
  if (!conditions) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Conditions array is required.',
      },
    };
  }

  const currentDate = now ?? new Date();

  const byCategory: Record<ConditionCategory, number> = {
    pre_construction: 0,
    construction: 0,
    operational: 0,
    ongoing: 0,
  };

  let verifiedCount = 0;
  let outstandingCount = 0;
  let overdueCount = 0;

  for (const cond of conditions) {
    // Count by category
    byCategory[cond.complianceCategory] = (byCategory[cond.complianceCategory] ?? 0) + 1;

    // Count verified
    if (cond.state === 'verified_compliant') {
      verifiedCount++;
    }

    // Count outstanding (not yet submitted evidence or verified)
    if (cond.state === 'outstanding' || cond.state === 'in_progress') {
      outstandingCount++;
    }

    // Count overdue: past deadline and not in evidence_submitted or verified_compliant
    if (
      cond.complianceDeadline &&
      cond.state !== 'evidence_submitted' &&
      cond.state !== 'verified_compliant'
    ) {
      const deadline = new Date(cond.complianceDeadline);
      if (deadline < currentDate) {
        overdueCount++;
      }
    }
  }

  const totalConditions = conditions.length;
  const compliancePercentage = totalConditions > 0
    ? Math.round((verifiedCount / totalConditions) * 100)
    : 0;

  return {
    success: true,
    data: {
      totalConditions,
      byCategory,
      verifiedCount,
      outstandingCount,
      overdueCount,
      compliancePercentage,
    },
  };
}

/**
 * Evaluates condition alerts based on deadline proximity and overdue status.
 *
 * Generates two types of alerts:
 * - `deadline_warning`: When a condition in outstanding/in_progress state has a
 *   deadline within 30 days (Requirement 18.3)
 * - `overdue_critical`: When a condition is past its deadline without being in
 *   evidence_submitted or verified_compliant state (Requirement 18.4)
 *
 * Validates: Requirements 18.3, 18.4
 */
export function evaluateConditionAlerts(
  conditions: RODCondition[],
  now?: Date,
): ServiceResult<ConditionAlert[]> {
  if (!conditions) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Conditions array is required.',
      },
    };
  }

  const currentDate = now ?? new Date();
  const alerts: ConditionAlert[] = [];

  for (const cond of conditions) {
    // Only evaluate conditions that have a deadline
    if (!cond.complianceDeadline) {
      continue;
    }

    // Skip conditions already submitted or verified
    if (cond.state === 'evidence_submitted' || cond.state === 'verified_compliant') {
      continue;
    }

    const deadline = new Date(cond.complianceDeadline);
    const diffMs = deadline.getTime() - currentDate.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysRemaining < 0) {
      // Overdue critical alert (Req 18.4)
      alerts.push({
        conditionId: cond.id,
        conditionNumber: cond.conditionNumber,
        type: 'overdue_critical',
        message: `Condition ${cond.conditionNumber} is ${Math.abs(daysRemaining)} day(s) overdue. Immediate action required.`,
        deadline: cond.complianceDeadline,
        daysRemaining,
      });
    } else if (daysRemaining <= 30) {
      // 30-day deadline warning (Req 18.3)
      alerts.push({
        conditionId: cond.id,
        conditionNumber: cond.conditionNumber,
        type: 'deadline_warning',
        message: `Condition ${cond.conditionNumber} deadline in ${daysRemaining} day(s). Action recommended.`,
        deadline: cond.complianceDeadline,
        daysRemaining,
      });
    }
  }

  return { success: true, data: alerts };
}

/**
 * Records evidence against a ROD condition. Supports document references,
 * inspection records, and monitoring data. Appends the evidence reference
 * to the condition's evidence array.
 *
 * Does not automatically transition state — the responsible party must
 * explicitly transition to evidence_submitted after attaching evidence.
 *
 * Validates: Requirement 18.6
 */
export function recordEvidence(
  condition: RODCondition,
  evidence: EvidenceRecord,
): ServiceResult<RODCondition> {
  if (!condition) {
    return {
      success: false,
      error: {
        code: 'INVALID_CONDITION',
        message: 'ROD condition record is required.',
      },
    };
  }

  if (!evidence?.reference || evidence.reference.trim() === '') {
    return {
      success: false,
      error: {
        code: 'EVIDENCE_REFERENCE_REQUIRED',
        message: 'Evidence reference is required.',
      },
    };
  }

  if (!evidence.type) {
    return {
      success: false,
      error: {
        code: 'EVIDENCE_TYPE_REQUIRED',
        message: 'Evidence type is required (document_ref, inspection_record, or monitoring_data).',
      },
    };
  }

  if (!evidence.recordedBy || evidence.recordedBy.trim() === '') {
    return {
      success: false,
      error: {
        code: 'EVIDENCE_RECORDED_BY_REQUIRED',
        message: 'recordedBy field is required for evidence recording.',
      },
    };
  }

  // Build a structured evidence string for storage
  const evidenceEntry = `[${evidence.type}] ${evidence.reference}${evidence.description ? ' — ' + evidence.description : ''} (by ${evidence.recordedBy}, ${evidence.recordedAt})`;

  const updated: RODCondition = {
    ...condition,
    evidence: [...condition.evidence, evidenceEntry],
    updatedAt: evidence.recordedAt,
  };

  return { success: true, data: updated };
}

/**
 * Disclaimer Banner text for the Environmental & Heritage module.
 * Must be displayed on all compliance-related views.
 *
 * Validates: Requirement 18.8
 */
export const DISCLAIMER_BANNER =
  'ADVISORY ONLY — This tool provides indicative compliance tracking and does not constitute legal compliance certification. ' +
  'All Record of Decision conditions must be verified by the appointed Environmental Control Officer (ECO) and relevant competent authority. ' +
  'Professional sign-off is required before any condition can be considered formally discharged.';
