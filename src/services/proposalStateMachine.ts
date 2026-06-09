/**
 * Proposal State Machine — Pack 4: Professional Toolboxes & Proposal Builder
 *
 * Manages the full proposal lifecycle across 10 states with validated
 * transitions and immutable audit trails.
 *
 * States:
 *   draft → calculator_completed → terms_attached → professional_approved
 *   → issued → revision_requested → accepted/rejected → withdrawn
 *   → converted_to_appointment
 */
import type { ProposalStatus } from '../types/proposalBuilder';

// ─── State Definitions ─────────────────────────────────────────────────────

export const ALL_PROPOSAL_STATES: ReadonlyArray<ProposalStatus> = [
  'draft',
  'calculator_completed',
  'terms_attached',
  'professional_approved',
  'issued',
  'revision_requested',
  'accepted',
  'rejected',
  'withdrawn',
  'converted_to_appointment',
] as const;

export interface ProposalStateInfo {
  state: ProposalStatus;
  label: string;
  description: string;
  isTerminal: boolean;
  isMutable: boolean;
  requiresAction: boolean;
  responsibleRole: 'professional' | 'client' | 'system' | 'admin';
}

export const PROPOSAL_STATE_INFO: Record<ProposalStatus, ProposalStateInfo> = {
  draft: {
    state: 'draft',
    label: 'Draft',
    description: 'Proposal is being prepared. Calculator, terms and scope are being assembled.',
    isTerminal: false,
    isMutable: true,
    requiresAction: true,
    responsibleRole: 'professional',
  },
  calculator_completed: {
    state: 'calculator_completed',
    label: 'Calculator Completed',
    description: 'Fee calculator has been run and professional fee determined. Terms must be attached.',
    isTerminal: false,
    isMutable: true,
    requiresAction: true,
    responsibleRole: 'professional',
  },
  terms_attached: {
    state: 'terms_attached',
    label: 'Terms Attached',
    description: 'Terms and conditions have been attached. Ready for professional approval.',
    isTerminal: false,
    isMutable: true,
    requiresAction: true,
    responsibleRole: 'professional',
  },
  professional_approved: {
    state: 'professional_approved',
    label: 'Professionally Approved',
    description: 'Proposal has been approved by the professional and is ready to issue.',
    isTerminal: false,
    isMutable: false,
    requiresAction: true,
    responsibleRole: 'professional',
  },
  issued: {
    state: 'issued',
    label: 'Issued',
    description: 'Proposal has been issued to the client for review and acceptance.',
    isTerminal: false,
    isMutable: false,
    requiresAction: true,
    responsibleRole: 'client',
  },
  revision_requested: {
    state: 'revision_requested',
    label: 'Revision Requested',
    description: 'Client has requested changes. A revised proposal will supersede this one.',
    isTerminal: false,
    isMutable: false,
    requiresAction: true,
    responsibleRole: 'professional',
  },
  accepted: {
    state: 'accepted',
    label: 'Accepted',
    description: 'Client has accepted the proposal. Ready for conversion to appointment.',
    isTerminal: true,
    isMutable: false,
    requiresAction: true,
    responsibleRole: 'system',
  },
  rejected: {
    state: 'rejected',
    label: 'Rejected',
    description: 'Client has rejected the proposal.',
    isTerminal: true,
    isMutable: false,
    requiresAction: false,
    responsibleRole: 'client',
  },
  withdrawn: {
    state: 'withdrawn',
    label: 'Withdrawn',
    description: 'Proposal has been withdrawn by the professional.',
    isTerminal: true,
    isMutable: false,
    requiresAction: false,
    responsibleRole: 'professional',
  },
  converted_to_appointment: {
    state: 'converted_to_appointment',
    label: 'Converted to Appointment',
    description: 'Accepted proposal has been converted into a formal professional appointment.',
    isTerminal: true,
    isMutable: false,
    requiresAction: false,
    responsibleRole: 'system',
  },
};

// ─── Transition Map ─────────────────────────────────────────────────────────

/**
 * Defines ALL valid transitions for each state.
 * Any transition not listed here is illegal and will throw.
 */
export const VALID_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  draft: ['calculator_completed', 'withdrawn'],
  calculator_completed: ['terms_attached', 'draft', 'withdrawn'],
  terms_attached: ['professional_approved', 'calculator_completed', 'withdrawn'],
  professional_approved: ['issued', 'terms_attached', 'withdrawn'],
  issued: ['accepted', 'rejected', 'revision_requested', 'withdrawn'],
  revision_requested: ['draft'], // forces creation of new revision
  accepted: ['converted_to_appointment'],
  rejected: [], // terminal
  withdrawn: [], // terminal
  converted_to_appointment: [], // terminal
};

// ─── Audit Trail ────────────────────────────────────────────────────────────

export interface StateChangeEntry {
  id: string;
  from: ProposalStatus;
  to: ProposalStatus;
  timestamp: string;
  actorId: string;
  actorRole: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface ProposalAuditTrail {
  proposalId: string;
  entries: StateChangeEntry[];
  createdAt: string;
  updatedAt: string;
  currentState: ProposalStatus;
  version: number;
}

// ─── State Machine Engine ───────────────────────────────────────────────────

export class ProposalStateMachine {
  public readonly proposalId: string;
  private auditTrail: ProposalAuditTrail;

  constructor(proposalId: string, initialState: ProposalStatus = 'draft') {
    this.proposalId = proposalId;
    const now = new Date().toISOString();
    this.auditTrail = {
      proposalId,
      entries: [
        {
          id: `${proposalId}-state-init`,
          from: 'draft' as ProposalStatus,
          to: initialState,
          timestamp: now,
          actorId: 'system',
          actorRole: 'system',
          reason: 'Proposal created',
        },
      ],
      createdAt: now,
      updatedAt: now,
      currentState: initialState,
      version: 1,
    };
  }

  /**
   * Get the current state of the proposal.
   */
  get currentState(): ProposalStatus {
    return this.auditTrail.currentState;
  }

  /**
   * Get full audit trail.
   */
  get trail(): Readonly<ProposalAuditTrail> {
    return this.auditTrail;
  }

  /**
   * Get the state info for the current state.
   */
  get stateInfo(): ProposalStateInfo {
    return PROPOSAL_STATE_INFO[this.auditTrail.currentState];
  }

  /**
   * Get valid next states from the current state.
   */
  get validNextStates(): ReadonlyArray<ProposalStatus> {
    return VALID_TRANSITIONS[this.auditTrail.currentState];
  }

  /**
   * Check if a transition is valid.
   */
  canTransitionTo(target: ProposalStatus): boolean {
    return this.validNextStates.includes(target);
  }

  /**
   * Execute a state transition. Throws if invalid.
   */
  transition(
    to: ProposalStatus,
    actor: { id: string; role: string },
    reason?: string,
    metadata?: Record<string, unknown>,
  ): StateChangeEntry {
    const from = this.auditTrail.currentState;

    if (!this.canTransitionTo(to)) {
      throw new Error(
        `Invalid state transition: "${from}" → "${to}". ` +
        `Valid transitions from "${from}" are: ${this.validNextStates.join(', ') || 'none (terminal state)'}.`,
      );
    }

    const entry: StateChangeEntry = {
      id: `${this.proposalId}-state-${this.auditTrail.entries.length}`,
      from,
      to,
      timestamp: new Date().toISOString(),
      actorId: actor.id,
      actorRole: actor.role,
      reason,
      metadata,
    };

    this.auditTrail = {
      ...this.auditTrail,
      entries: [...this.auditTrail.entries, entry],
      currentState: to,
      updatedAt: entry.timestamp,
      version: this.auditTrail.version + 1,
    };

    return entry;
  }

  /**
   * Get all entries in the audit trail.
   */
  getHistory(): ReadonlyArray<StateChangeEntry> {
    return this.auditTrail.entries;
  }

  /**
   * Get the last N entries.
   */
  getRecentHistory(count: number = 5): ReadonlyArray<StateChangeEntry> {
    return this.auditTrail.entries.slice(-count);
  }

  /**
   * Get time spent in the current state.
   */
  timeInCurrentState(): number {
    const lastEntry = this.auditTrail.entries[this.auditTrail.entries.length - 1];
    return Date.now() - new Date(lastEntry.timestamp).getTime();
  }

  /**
   * Serialize the full audit trail for storage.
   */
  serialize(): ProposalAuditTrail {
    return { ...this.auditTrail, entries: [...this.auditTrail.entries] };
  }

  /**
   * Restore a state machine from a serialized audit trail.
   */
  static fromAuditTrail(trail: ProposalAuditTrail): ProposalStateMachine {
    const machine = new ProposalStateMachine(trail.proposalId, trail.currentState);
    machine.auditTrail = { ...trail, entries: [...trail.entries] };
    return machine;
  }

  /**
   * Check if the proposal is in a terminal state.
   */
  get isTerminal(): boolean {
    return PROPOSAL_STATE_INFO[this.auditTrail.currentState].isTerminal;
  }

  /**
   * Check if the proposal is currently mutable (can have its contents changed).
   */
  get isMutable(): boolean {
    return PROPOSAL_STATE_INFO[this.auditTrail.currentState].isMutable;
  }
}

// ─── State Machine Factory ──────────────────────────────────────────────────

/**
 * Create a new proposal state machine, starting at "draft".
 */
export function createProposalStateMachine(proposalId: string): ProposalStateMachine {
  return new ProposalStateMachine(proposalId, 'draft');
}

/**
 * Create a proposal state machine at "calculator_completed" — used when
 * a fee calculation has been completed and terms are ready to attach.
 */
export function createProposalFromCalculator(proposalId: string): ProposalStateMachine {
  return new ProposalStateMachine(proposalId, 'calculator_completed');
}

// ─── Convenience Transitions ────────────────────────────────────────────────

export interface TransitionActor {
  id: string;
  role: string;
}

/**
 * Professional approves the proposal after attaching terms.
 */
export function approveProposal(
  machine: ProposalStateMachine,
  actor: TransitionActor,
): StateChangeEntry {
  if (machine.currentState === 'terms_attached') {
    return machine.transition('professional_approved', actor, 'Professional review completed.');
  }
  if (machine.currentState === 'professional_approved') {
    return machine.transition('issued', actor, 'Proposal issued to client.');
  }
  throw new Error(`Cannot approve from state "${machine.currentState}".`);
}

/**
 * Client accepts an issued proposal.
 */
export function acceptProposal(
  machine: ProposalStateMachine,
  actor: TransitionActor,
): StateChangeEntry {
  return machine.transition('accepted', actor, 'Client accepted the proposal.');
}

/**
 * Client rejects an issued proposal.
 */
export function rejectProposal(
  machine: ProposalStateMachine,
  actor: TransitionActor,
  reason?: string,
): StateChangeEntry {
  return machine.transition('rejected', actor, reason || 'Client rejected the proposal.');
}

/**
 * Client requests a revision to an issued proposal.
 */
export function requestRevision(
  machine: ProposalStateMachine,
  actor: TransitionActor,
  reason?: string,
): StateChangeEntry {
  return machine.transition(
    'revision_requested',
    actor,
    reason || 'Client requested revisions.',
  );
}

/**
 * Professional withdraws a proposal.
 */
export function withdrawProposal(
  machine: ProposalStateMachine,
  actor: TransitionActor,
  reason?: string,
): StateChangeEntry {
  return machine.transition('withdrawn', actor, reason || 'Proposal withdrawn by professional.');
}

/**
 * Convert an accepted proposal to an appointment.
 */
export function convertToAppointment(
  machine: ProposalStateMachine,
  actor: TransitionActor,
): StateChangeEntry {
  return machine.transition(
    'converted_to_appointment',
    actor,
    'Proposal converted to professional appointment.',
  );
}

/**
 * Attach terms to a calculator-completed proposal.
 */
export function attachTerms(
  machine: ProposalStateMachine,
  actor: TransitionActor,
): StateChangeEntry {
  return machine.transition('terms_attached', actor, 'Terms and conditions attached.');
}
