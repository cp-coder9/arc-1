// ─── Pack 17: Governance Gate Service ───────────────────────────────────────
// Evaluates governance rules for dedicated apps, determining whether a workflow
// event is allowed, blocked, or requires human intervention.

import type {
  DedicatedAppDefinition,
  DedicatedAppWorkflowEvent,
  GovernanceDecision,
  HumanGate,
  ArchitexSpineObject,
} from '@/services/lifecycleTypes';

// ─── Governance Rules ────────────────────────────────────────────────────────

/** Spine objects that always require human gate approval. */
const SENSITIVE_OUTPUTS: ArchitexSpineObject[] = [
  'PaymentGovernanceRecord',
  'ApprovalGate',
];

/** Spine objects that require audit events. */
const AUDIT_REQUIRED_OUTPUTS: ArchitexSpineObject[] = [
  'ProjectRecord',
  'ProjectDecision',
  'ProjectInboxItem',
  'AuditEvent',
  'PaymentGovernanceRecord',
];

/**
 * Evaluate governance for a dedicated app workflow event.
 * Checks against the app's sensitive gates and output types.
 */
export function evaluateDedicatedAppGovernance(
  app: DedicatedAppDefinition,
  event: DedicatedAppWorkflowEvent,
): GovernanceDecision {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // 1. Check if any output is sensitive and the event's human gate is insufficient
  for (const output of event.outputs) {
    if (SENSITIVE_OUTPUTS.includes(output) && event.humanGate === 'none') {
      blockers.push(
        `Output ${output} requires a human gate, but event has none.`,
      );
    }
  }

  // 2. Check if any output requires audit but the event lacks auditRequired
  for (const output of event.outputs) {
    if (AUDIT_REQUIRED_OUTPUTS.includes(output) && !event.auditRequired) {
      warnings.push(
        `Output ${output} should have audit trail enabled.`,
      );
    }
  }

  // 3. Check app-level sensitive gates
  for (const gate of app.sensitiveGates) {
    const gateLevel = gatePriority(gate);
    const eventGateLevel = gatePriority(event.humanGate);
    if (eventGateLevel < gateLevel) {
      blockers.push(
        `App ${app.id} requires gate "${gate}" but event only has "${event.humanGate}".`,
      );
    }
  }

  // 4. Check if event risk level exceeds app threshold
  if (event.riskLevel === 'critical' && event.humanGate === 'none') {
    blockers.push(
      'Critical risk events must have a human gate.',
    );
  }

  // 5. Check offline support requirements
  if (app.requiresOfflineSupport && event.humanGate !== 'none') {
    warnings.push(
      'App requires offline support — human gates may not be enforceable offline.',
    );
  }

  return {
    status: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'requires_human' : 'allowed',
    blockers,
    warnings,
    humanGate: blockers.length > 0 ? event.humanGate : 'none',
    auditRequired: true,
    aiMayExecute: false,
  };
}

function gatePriority(gate: HumanGate): number {
  const order: HumanGate[] = [
    'none',
    'review',
    'approval',
    'signature',
    'payment_release',
    'municipal_submission',
    'professional_certification',
    'closeout_acceptance',
  ];
  return order.indexOf(gate);
}

/**
 * Check whether a governance decision allows automated execution.
 */
export function governanceAllowsExecution(decision: GovernanceDecision): boolean {
  return decision.status === 'allowed';
}

/**
 * Get the list of all governance blockers as a human-readable string.
 */
export function governanceBlockerSummary(decision: GovernanceDecision): string {
  if (decision.status === 'allowed') return 'No governance blockers.';
  const parts: string[] = [];
  if (decision.blockers.length > 0) {
    parts.push(`Blocked: ${decision.blockers.join('; ')}`);
  }
  if (decision.warnings.length > 0) {
    parts.push(`Warnings: ${decision.warnings.join('; ')}`);
  }
  return parts.join(' | ');
}
