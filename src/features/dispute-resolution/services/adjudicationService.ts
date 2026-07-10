/**
 * Adjudication Service
 *
 * Manages adjudication lifecycle: creation, sequential stage transitions,
 * decision recording, and outcome retrieval.
 *
 * Stage machine (sequential with hearing bypass):
 *   referred → adjudicator_appointed → submissions_open → submissions_closed
 *     → hearing_scheduled → hearing_completed → decision_issued → decision_implemented
 *   Hearing bypass: submissions_closed → decision_issued (documents-only adjudications)
 *
 * Requirements: 8.1–8.10
 */

import type { Adjudication, AdjudicationStage } from '../types';
import { adjudicationSchema } from '../schemas';
import type { AdjudicationInput } from '../schemas';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdjudicationServiceOptions {
  /** Injectable clock for deterministic testing. Returns ISO date-time string. */
  now?: () => string;
}

export interface RecordDecisionInput {
  decisionDate: string;
  amountAwarded: number;
  timeAwarded: number;
  decisionSummary: string;
  isInterimBinding: boolean;
}

export interface AdjudicationService {
  /** Create a new adjudication for a claim. Validates with adjudicationSchema. */
  createAdjudication(claimId: string, input: AdjudicationInput, actorId: string): Adjudication;
  /** Transition to the next stage. Enforces sequential ordering with hearing bypass. */
  transitionStage(adjudicationId: string, newStage: AdjudicationStage, actorId: string): Adjudication;
  /** Record the adjudicator's decision. Transitions to 'decision_issued'. */
  recordDecision(adjudicationId: string, decision: RecordDecisionInput, actorId: string): Adjudication;
  /** Get an adjudication by ID, or null if not found. */
  getAdjudication(adjudicationId: string): Adjudication | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Permitted stage transitions. Each stage maps to the allowed next stages.
 * The hearing_scheduled/hearing_completed path may be skipped:
 * submissions_closed can go directly to decision_issued for documents-only adjudications.
 */
const PERMITTED: Record<AdjudicationStage, AdjudicationStage[]> = {
  referred: ['adjudicator_appointed'],
  adjudicator_appointed: ['submissions_open'],
  submissions_open: ['submissions_closed'],
  submissions_closed: ['hearing_scheduled', 'decision_issued'],
  hearing_scheduled: ['hearing_completed'],
  hearing_completed: ['decision_issued'],
  decision_issued: ['decision_implemented'],
  decision_implemented: [],
};

// ─── Implementation ───────────────────────────────────────────────────────────

class AdjudicationServiceImpl implements AdjudicationService {
  private adjudications: Map<string, Adjudication> = new Map();
  private readonly now: () => string;

  constructor(options: AdjudicationServiceOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  createAdjudication(claimId: string, input: AdjudicationInput, actorId: string): Adjudication {
    const parsed = adjudicationSchema.parse(input);

    const id = this.generateId();
    const timestamp = this.now();

    const adjudication: Adjudication = {
      id,
      claimId,
      projectId: '', // Set by caller or adapter when integrating with project context
      adjudicatorName: parsed.adjudicatorName,
      appointmentDate: parsed.appointmentDate,
      referringParty: parsed.referringParty,
      respondentParty: parsed.respondentParty,
      disputeValue: parsed.disputeValue,
      timeInDispute: parsed.timeInDispute,
      referralNoticeRef: parsed.referralNoticeRef,
      currentStage: 'referred',
      maxSubmissionRounds: parsed.maxSubmissionRounds,
      isInterimBinding: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.adjudications.set(id, adjudication);
    return { ...adjudication };
  }

  transitionStage(adjudicationId: string, newStage: AdjudicationStage, actorId: string): Adjudication {
    const adjudication = this.adjudications.get(adjudicationId);
    if (!adjudication) {
      throw new Error(`Adjudication not found: ${adjudicationId}`);
    }

    const permitted = PERMITTED[adjudication.currentStage];
    if (!permitted.includes(newStage)) {
      throw new Error(
        `Invalid stage transition: cannot move from '${adjudication.currentStage}' to '${newStage}'. ` +
        `Permitted next stages: [${permitted.join(', ')}]`
      );
    }

    const timestamp = this.now();
    const updated: Adjudication = {
      ...adjudication,
      currentStage: newStage,
      updatedAt: timestamp,
    };

    this.adjudications.set(adjudicationId, updated);
    return { ...updated };
  }

  recordDecision(adjudicationId: string, decision: RecordDecisionInput, actorId: string): Adjudication {
    const adjudication = this.adjudications.get(adjudicationId);
    if (!adjudication) {
      throw new Error(`Adjudication not found: ${adjudicationId}`);
    }

    // Validate decision fields
    if (decision.amountAwarded < 0 || decision.amountAwarded > 999_999_999.99) {
      throw new Error('amountAwarded must be between 0 and 999,999,999.99');
    }
    if (decision.timeAwarded < 0 || decision.timeAwarded > 9999) {
      throw new Error('timeAwarded must be between 0 and 9999');
    }
    if (decision.decisionSummary.length > 2000) {
      throw new Error('decisionSummary must not exceed 2000 characters');
    }

    // Must be in a stage that can transition to decision_issued
    const permitted = PERMITTED[adjudication.currentStage];
    if (!permitted.includes('decision_issued')) {
      throw new Error(
        `Cannot record decision: adjudication is at stage '${adjudication.currentStage}' ` +
        `which cannot transition to 'decision_issued'. ` +
        `Permitted next stages: [${permitted.join(', ')}]`
      );
    }

    const timestamp = this.now();
    const updated: Adjudication = {
      ...adjudication,
      currentStage: 'decision_issued',
      decisionDate: decision.decisionDate,
      amountAwarded: decision.amountAwarded,
      timeAwarded: decision.timeAwarded,
      decisionSummary: decision.decisionSummary,
      isInterimBinding: decision.isInterimBinding,
      updatedAt: timestamp,
    };

    this.adjudications.set(adjudicationId, updated);
    return { ...updated };
  }

  getAdjudication(adjudicationId: string): Adjudication | null {
    const adjudication = this.adjudications.get(adjudicationId);
    return adjudication ? { ...adjudication } : null;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private generateId(): string {
    return `adj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a new AdjudicationService instance.
 * Uses in-memory Map storage. Injectable clock for deterministic tests.
 */
export function createAdjudicationService(options: AdjudicationServiceOptions = {}): AdjudicationService {
  return new AdjudicationServiceImpl(options);
}
