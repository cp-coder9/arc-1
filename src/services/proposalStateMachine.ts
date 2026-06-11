/**
 * Proposal State Machine
 *
 * Manages all 10 proposal states with:
 *   - Valid transition definitions
 *   - Transition validation (throw on invalid transition)
 *   - Audit trail on every state change
 *   - Issued-proposal locking (only allow revision, not mutation)
 *
 * State Flow:
 *   draft → calculator_completed → terms_attached → professional_approved
 *     → issued → revision_requested
 *     → issued → accepted → converted_to_appointment
 *     → issued → rejected
 *   Any pre-issue state → withdrawn
 */

import type { ProposalStatus } from '../types/proposalBuilder';

export interface StateTransition {
  from: ProposalStatus;
  to: ProposalStatus;
  /** Human-readable description of the transition */
  description: string;
  /** Which actor roles can perform this transition */
  allowedBy: string[];
  /** Whether the proposal becomes locked after this transition */
  locksProposal?: boolean;
}

export interface AuditTrailEntry {
  from: ProposalStatus;
  to: ProposalStatus;
  timestamp: string;
  actorUserId: string;
  actorRole: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface ProposalState {
  currentStatus: ProposalStatus;
  auditTrail: AuditTrailEntry[];
  isLocked: boolean;
  lockedAt?: string;
  issuedAt?: string;
  acceptedAt?: string;
  rejectedAt?: string;
  withdrawnAt?: string;
  convertedAt?: string;
}

// ─── Valid Transitions ────────────────────────────────────────────────────────

export const VALID_TRANSITIONS: StateTransition[] = [
  {
    from: 'draft',
    to: 'calculator_completed',
    description: 'Fee calculator has been run and attached.',
    allowedBy: ['architect', 'engineer', 'quantity_surveyor', 'town_planner', 'admin'],
  },
  {
    from: 'calculator_completed',
    to: 'terms_attached',
    description: 'Terms and conditions have been selected and attached.',
    allowedBy: ['architect', 'engineer', 'quantity_surveyor', 'town_planner', 'admin'],
  },
  {
    from: 'terms_attached',
    to: 'professional_approved',
    description: 'Issuing professional has reviewed and approved the proposal.',
    allowedBy: ['architect', 'engineer', 'quantity_surveyor', 'town_planner', 'admin'],
  },
  {
    from: 'professional_approved',
    to: 'issued',
    description: 'Proposal has been formally issued to the client.',
    allowedBy: ['architect', 'engineer', 'quantity_surveyor', 'town_planner', 'admin'],
    locksProposal: true,
  },
  {
    from: 'issued',
    to: 'revision_requested',
    description: 'Client or professional has requested a revision.',
    allowedBy: ['client', 'architect', 'engineer', 'quantity_surveyor', 'town_planner', 'admin'],
  },
  {
    from: 'issued',
    to: 'accepted',
    description: 'Client has formally accepted the proposal.',
    allowedBy: ['client', 'admin'],
  },
  {
    from: 'issued',
    to: 'rejected',
    description: 'Client has rejected the proposal.',
    allowedBy: ['client', 'admin'],
  },
  {
    from: 'accepted',
    to: 'converted_to_appointment',
    description: 'Accepted proposal has been converted to a formal appointment.',
    allowedBy: ['architect', 'admin'],
  },
  // Any pre-issue state can be withdrawn
  {
    from: 'draft',
    to: 'withdrawn',
    description: 'Proposal has been withdrawn before issue.',
    allowedBy: ['architect', 'engineer', 'quantity_surveyor', 'town_planner', 'admin'],
  },
  {
    from: 'calculator_completed',
    to: 'withdrawn',
    description: 'Proposal has been withdrawn before issue.',
    allowedBy: ['architect', 'engineer', 'quantity_surveyor', 'town_planner', 'admin'],
  },
  {
    from: 'terms_attached',
    to: 'withdrawn',
    description: 'Proposal has been withdrawn before issue.',
    allowedBy: ['architect', 'engineer', 'quantity_surveyor', 'town_planner', 'admin'],
  },
  {
    from: 'professional_approved',
    to: 'withdrawn',
    description: 'Proposal has been withdrawn before issue.',
    allowedBy: ['architect', 'engineer', 'quantity_surveyor', 'town_planner', 'admin'],
  },
  // Allow re-drafting from revision_requested
  {
    from: 'revision_requested',
    to: 'draft',
    description: 'Revision request accepted — returning to draft for rework.',
    allowedBy: ['architect', 'engineer', 'quantity_surveyor', 'town_planner', 'admin'],
  },
];

/** Transitions that are allowed from each state (derived from VALID_TRANSITIONS) */
const TRANSITION_MAP = new Map<ProposalStatus, StateTransition[]>();
for (const t of VALID_TRANSITIONS) {
  const existing = TRANSITION_MAP.get(t.from) ?? [];
  existing.push(t);
  TRANSITION_MAP.set(t.from, existing);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a new proposal state starting at 'draft'.
 */
export function createProposalState(): ProposalState {
  return {
    currentStatus: 'draft',
    auditTrail: [
      {
        from: 'draft' as ProposalStatus,
        to: 'draft',
        timestamp: new Date().toISOString(),
        actorUserId: 'system',
        actorRole: 'system',
        reason: 'Proposal created',
      },
    ],
    isLocked: false,
  };
}

/**
 * Get all valid transitions from a given state.
 */
export function availableTransitions(from: ProposalStatus): StateTransition[] {
  return TRANSITION_MAP.get(from) ?? [];
}

/**
 * Check if a transition from one state to another is valid.
 */
export function isValidTransition(from: ProposalStatus, to: ProposalStatus): boolean {
  return availableTransitions(from).some((t) => t.to === to);
}

/**
 * Attempt to transition a proposal to a new state.
 * Returns the updated ProposalState.
 * Throws if the transition is invalid.
 */
export function transitionProposal(
  state: ProposalState,
  to: ProposalStatus,
  actor: { userId: string; role: string },
  reason?: string,
  metadata?: Record<string, unknown>,
): ProposalState {
  // Check if locked
  if (state.isLocked) {
    throw new Error(
      `Cannot transition a locked proposal. The proposal was issued and is locked against mutation. ` +
      `Create a revision instead.`,
    );
  }

  // Find the matching transition
  const transition = availableTransitions(state.currentStatus).find((t) => t.to === to);
  if (!transition) {
    throw new Error(
      `Invalid state transition: ${state.currentStatus} → ${to}. ` +
      `Allowed transitions from ${state.currentStatus}: ${availableTransitions(state.currentStatus).map(t => t.to).join(', ') || 'none'}`,
    );
  }

  // Create audit entry
  const entry: AuditTrailEntry = {
    from: state.currentStatus,
    to,
    timestamp: new Date().toISOString(),
    actorUserId: actor.userId,
    actorRole: actor.role,
    reason,
    metadata,
  };

  const updated: ProposalState = {
    ...state,
    currentStatus: to,
    auditTrail: [...state.auditTrail, entry],
    isLocked: transition.locksProposal ?? false,
  };

  // Record timestamped milestones
  if (to === 'issued') {
    updated.issuedAt = entry.timestamp;
    updated.lockedAt = entry.timestamp;
  }
  if (to === 'accepted') {
    updated.acceptedAt = entry.timestamp;
  }
  if (to === 'rejected') {
    updated.rejectedAt = entry.timestamp;
  }
  if (to === 'withdrawn') {
    updated.withdrawnAt = entry.timestamp;
  }
  if (to === 'converted_to_appointment') {
    updated.convertedAt = entry.timestamp;
  }

  return updated;
}

/**
 * Create a revision of an issued proposal.
 * Only works for proposals in 'issued', 'accepted', or 'revision_requested' status.
 * The revision starts a new proposal in 'draft' state.
 */
export function createRevision(
  state: ProposalState,
  actor: { userId: string; role: string },
  reason?: string,
): ProposalState {
  if (!['issued', 'accepted', 'revision_requested'].includes(state.currentStatus)) {
    throw new Error(
      `Revisions can only be created from issued, accepted, or revision_requested proposals. ` +
      `Current status: ${state.currentStatus}`,
    );
  }

  return {
    currentStatus: 'draft',
    auditTrail: [
      {
        from: state.currentStatus,
        to: 'draft',
        timestamp: new Date().toISOString(),
        actorUserId: actor.userId,
        actorRole: actor.role,
        reason: reason ?? 'Revision created from issued proposal',
        metadata: { revisedFromStatus: state.currentStatus },
      },
    ],
    isLocked: false,
  };
}

/**
 * Generate a summary of the proposal state for display.
 */
export function stateSummary(state: ProposalState): string {
  const latest = state.auditTrail[state.auditTrail.length - 1];
  const statusLabel = state.currentStatus.replace(/_/g, ' ');
  const lockedNote = state.isLocked ? ' (locked)' : '';
  const actionNote = latest
    ? `\nLast action: ${latest.from} → ${latest.to} by ${latest.actorRole} at ${latest.timestamp}`
    : '';
  return `Status: ${statusLabel}${lockedNote}${actionNote}`;
}

// ─── Class-based wrapper for the frontend component ──────────────────────────

export interface StateChangeEntry {
  id: string;
  from: string;
  to: string;
  timestamp: string;
  actorRole: string;
  actorId: string;
  reason?: string;
}

/**
 * Class-based state machine wrapper used by the ProposalBuilderPanel.
 * Wraps the functional ProposalState API.
 */
export class ProposalStateMachine {
  private state: ProposalState;
  private historyEntries: StateChangeEntry[] = [];

  constructor(proposalId: string) {
    this.state = createProposalState();
  }

  get currentState(): string {
    return this.state.currentStatus;
  }

  get isLocked(): boolean {
    return this.state.isLocked;
  }

  transition(
    to: string,
    actor: { id: string; role: string },
    reason?: string,
  ): void {
    this.state = transitionProposal(
      this.state,
      to as any,
      { userId: actor.id, role: actor.role },
      reason,
    );
    const lastAudit = this.state.auditTrail[this.state.auditTrail.length - 1];
    this.historyEntries.push({
      id: `entry-${this.historyEntries.length + 1}`,
      from: lastAudit.from,
      to: lastAudit.to,
      timestamp: lastAudit.timestamp,
      actorRole: lastAudit.actorRole,
      actorId: lastAudit.actorUserId,
      reason: lastAudit.reason,
    });
  }

  getHistory(): StateChangeEntry[] {
    return [...this.historyEntries];
  }
}

/**
 * Create a state machine instance for a proposal.
 */
export function createProposalStateMachine(proposalId: string): ProposalStateMachine {
  return new ProposalStateMachine(proposalId);
}
