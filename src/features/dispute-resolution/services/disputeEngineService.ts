/**
 * Dispute Engine Service
 *
 * Manages formal claim registration, state machine transitions,
 * dashboard aggregation, and contract admin cross-references.
 *
 * State machine:
 *   notified → particularised → assessed → responded
 *   responded(accepted) → settled
 *   responded(rejected|partially_accepted) → notice_of_dissatisfaction
 *     → referred_to_adjudication → adjudication_decision_issued → settled
 *
 * Requirements: 5.1–5.7, 10.1–10.5
 */

import type {
  FormalClaim,
  ClaimType,
  ClaimStage,
  ResponseSubState,
} from '../types';
import { formalClaimSchema } from '../schemas';
import type { FormalClaimInput } from '../schemas';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DisputeEngineServiceOptions {
  /** Injectable clock for deterministic testing. Returns ISO date-time string. */
  now?: () => string;
}

export interface TransitionInput {
  claimId: string;
  targetStage: ClaimStage;
  responseSubState?: ResponseSubState;
  awardedAmount?: number;
  awardedTime?: number;
  actorId: string;
}

export interface ClaimsDashboard {
  totalClaimsByType: Record<ClaimType, number>;
  totalAmountClaimed: number;
  totalAmountAwarded: number;
  totalTimeClaimed: number;
  totalTimeAwarded: number;
  claimsPerStage: Record<ClaimStage, number>;
}

export interface DisputeEngineService {
  /** Register a new formal claim. Validates via formalClaimSchema. */
  registerClaim(projectId: string, input: FormalClaimInput, actorId: string): FormalClaim;
  /** Transition a claim through the state machine. */
  transitionClaim(input: TransitionInput): FormalClaim;
  /** Get permitted next stages from a given stage. */
  getPermittedTransitions(currentStage: ClaimStage, responseSubState?: ResponseSubState): ClaimStage[];
  /** Dashboard aggregation for a project. */
  getClaimsDashboard(projectId: string): ClaimsDashboard;
  /** Create a formal claim pre-populated from a Contract Admin claim record. */
  createFromContractAdmin(projectId: string, contractAdminClaimId: string, actorId: string): FormalClaim;
  /** Get a claim by ID. */
  getClaimById(claimId: string): FormalClaim | undefined;
  /** Get all claims for a project. */
  getProjectClaims(projectId: string): FormalClaim[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Type prefix map for reference number generation. */
const TYPE_PREFIX: Record<ClaimType, string> = {
  EoT: 'EOT',
  loss_and_expense: 'LE',
  disruption: 'DIS',
  prolongation: 'PRO',
};

/**
 * Permitted transitions from each stage.
 * The 'responded' stage fans out based on responseSubState.
 */
const BASE_TRANSITIONS: Record<ClaimStage, ClaimStage[]> = {
  notified: ['particularised'],
  particularised: ['assessed'],
  assessed: ['responded'],
  responded: [], // dynamically resolved based on responseSubState
  notice_of_dissatisfaction: ['referred_to_adjudication'],
  referred_to_adjudication: ['adjudication_decision_issued'],
  adjudication_decision_issued: ['settled'],
  settled: [],
};

// ─── Implementation ───────────────────────────────────────────────────────────

class DisputeEngineServiceImpl implements DisputeEngineService {
  private claims: Map<string, FormalClaim> = new Map();
  private sequenceCounters: Map<ClaimType, number> = new Map();
  private readonly now: () => string;

  constructor(options: DisputeEngineServiceOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  registerClaim(projectId: string, input: FormalClaimInput, actorId: string): FormalClaim {
    // Validate input with Zod schema
    const parsed = formalClaimSchema.parse(input);

    const id = this.generateId();
    const referenceNumber = this.generateReferenceNumber(parsed.claimType);
    const timestamp = this.now();

    const claim: FormalClaim = {
      id,
      projectId,
      referenceNumber,
      claimType: parsed.claimType,
      causativeEventDate: parsed.causativeEventDate,
      notificationDate: parsed.notificationDate,
      contractClauseNumber: parsed.contractClauseNumber,
      contractClauseTitle: parsed.contractClauseTitle,
      briefDescription: parsed.briefDescription,
      detailedParticulars: parsed.detailedParticulars,
      amountClaimed: parsed.amountClaimed,
      timeClaimed: parsed.timeClaimed,
      currentStage: 'notified',
      timeBarredRisk: false,
      evidenceItems: [],
      createdBy: actorId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.claims.set(id, claim);
    return { ...claim };
  }

  transitionClaim(input: TransitionInput): FormalClaim {
    const { claimId, targetStage, responseSubState, awardedAmount, awardedTime, actorId } = input;

    const claim = this.claims.get(claimId);
    if (!claim) {
      throw new Error(`Claim not found: ${claimId}`);
    }

    const permitted = this.getPermittedTransitions(claim.currentStage, claim.responseSubState);
    if (!permitted.includes(targetStage)) {
      throw new Error(
        `Invalid transition: cannot move from '${claim.currentStage}' to '${targetStage}'. ` +
        `Permitted next stages: [${permitted.join(', ')}]`
      );
    }

    // At 'responded' stage: require responseSubState
    if (targetStage === 'responded') {
      if (!responseSubState) {
        throw new Error(
          `Response sub-state is required when transitioning to 'responded'. ` +
          `Must be one of: accepted, partially_accepted, rejected`
        );
      }

      // For partially_accepted: require awardedAmount or awardedTime
      if (responseSubState === 'partially_accepted') {
        const hasValidAmount = awardedAmount !== undefined &&
          awardedAmount >= 0.01 &&
          (claim.amountClaimed === undefined || awardedAmount <= claim.amountClaimed);
        const hasValidTime = awardedTime !== undefined &&
          awardedTime >= 1 &&
          (claim.timeClaimed === undefined || awardedTime <= claim.timeClaimed);

        if (!hasValidAmount && !hasValidTime) {
          throw new Error(
            `Partial acceptance requires awardedAmount (0.01..amountClaimed) or awardedTime (1..timeClaimed)`
          );
        }
      }
    }

    const timestamp = this.now();
    const updatedClaim: FormalClaim = {
      ...claim,
      currentStage: targetStage,
      updatedAt: timestamp,
    };

    // Set responseSubState when transitioning to 'responded'
    if (targetStage === 'responded' && responseSubState) {
      updatedClaim.responseSubState = responseSubState;
      if (awardedAmount !== undefined) {
        updatedClaim.awardedAmount = awardedAmount;
      }
      if (awardedTime !== undefined) {
        updatedClaim.awardedTime = awardedTime;
      }
    }

    this.claims.set(claimId, updatedClaim);
    return { ...updatedClaim };
  }

  getPermittedTransitions(currentStage: ClaimStage, responseSubState?: ResponseSubState): ClaimStage[] {
    // Special handling for 'responded' stage based on responseSubState
    if (currentStage === 'responded') {
      if (responseSubState === 'accepted') {
        return ['settled'];
      }
      // rejected or partially_accepted go through NOD→adjudication path
      if (responseSubState === 'rejected' || responseSubState === 'partially_accepted') {
        return ['notice_of_dissatisfaction'];
      }
      // No responseSubState yet (shouldn't happen in practice)
      return ['settled', 'notice_of_dissatisfaction'];
    }

    return [...(BASE_TRANSITIONS[currentStage] ?? [])];
  }

  getClaimsDashboard(projectId: string): ClaimsDashboard {
    const projectClaims = this.getProjectClaims(projectId);

    const totalClaimsByType: Record<ClaimType, number> = {
      EoT: 0,
      loss_and_expense: 0,
      disruption: 0,
      prolongation: 0,
    };

    const claimsPerStage: Record<ClaimStage, number> = {
      notified: 0,
      particularised: 0,
      assessed: 0,
      responded: 0,
      notice_of_dissatisfaction: 0,
      referred_to_adjudication: 0,
      adjudication_decision_issued: 0,
      settled: 0,
    };

    let totalAmountClaimed = 0;
    let totalAmountAwarded = 0;
    let totalTimeClaimed = 0;
    let totalTimeAwarded = 0;

    for (const claim of projectClaims) {
      totalClaimsByType[claim.claimType]++;
      claimsPerStage[claim.currentStage]++;

      if (claim.amountClaimed !== undefined) {
        totalAmountClaimed += claim.amountClaimed;
      }
      if (claim.awardedAmount !== undefined) {
        totalAmountAwarded += claim.awardedAmount;
      }
      if (claim.timeClaimed !== undefined) {
        totalTimeClaimed += claim.timeClaimed;
      }
      if (claim.awardedTime !== undefined) {
        totalTimeAwarded += claim.awardedTime;
      }
    }

    return {
      totalClaimsByType,
      totalAmountClaimed,
      totalAmountAwarded,
      totalTimeClaimed,
      totalTimeAwarded,
      claimsPerStage,
    };
  }

  createFromContractAdmin(projectId: string, contractAdminClaimId: string, actorId: string): FormalClaim {
    // Stubbed: creates a formal claim pre-populated from a Contract Admin claim record.
    // In production this would read from the Contract Admin module's ClaimRecord.
    const timestamp = this.now();
    const id = this.generateId();
    const referenceNumber = this.generateReferenceNumber('loss_and_expense');

    const claim: FormalClaim = {
      id,
      projectId,
      referenceNumber,
      claimType: 'loss_and_expense',
      causativeEventDate: timestamp.substring(0, 10),
      notificationDate: timestamp.substring(0, 10),
      contractClauseNumber: 'TBD',
      contractClauseTitle: 'From Contract Admin Escalation',
      briefDescription: `Escalated from Contract Admin claim ${contractAdminClaimId}`,
      currentStage: 'notified',
      timeBarredRisk: false,
      linkedContractAdminClaimId: contractAdminClaimId,
      evidenceItems: [],
      createdBy: actorId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.claims.set(id, claim);
    return { ...claim };
  }

  getClaimById(claimId: string): FormalClaim | undefined {
    const claim = this.claims.get(claimId);
    return claim ? { ...claim } : undefined;
  }

  getProjectClaims(projectId: string): FormalClaim[] {
    const results: FormalClaim[] = [];
    for (const claim of this.claims.values()) {
      if (claim.projectId === projectId) {
        results.push({ ...claim });
      }
    }
    return results;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private generateId(): string {
    return `claim_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private generateReferenceNumber(claimType: ClaimType): string {
    const prefix = TYPE_PREFIX[claimType];
    const current = this.sequenceCounters.get(claimType) ?? 0;
    const next = current + 1;
    this.sequenceCounters.set(claimType, next);
    return `${prefix}-${String(next).padStart(3, '0')}`;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a new DisputeEngineService instance.
 * Uses in-memory Map storage. Injectable clock for deterministic tests.
 */
export function createDisputeEngineService(options: DisputeEngineServiceOptions = {}): DisputeEngineService {
  return new DisputeEngineServiceImpl(options);
}
