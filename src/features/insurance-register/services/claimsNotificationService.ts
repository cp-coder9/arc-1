/**
 * Claims Notification Service
 *
 * Records claims events, tracks notification deadlines, manages state transitions,
 * and provides claims summary aggregation and overdue notification detection.
 *
 * Requirements: 3.1–3.9
 */

import { claimsNotificationSchema } from '../schemas';
import type {
  ClaimsNotification,
  ClaimsNotificationService,
  ClaimNotificationStatus,
  ClaimsSummary,
  InsurancePolicyType,
} from '../types';

// ─── State Machine Definition ─────────────────────────────────────────────────

/**
 * Permitted sequential transitions for the claims notification lifecycle.
 * Terminal states (settled, rejected, withdrawn) have empty permitted-next arrays.
 * 'withdrawn' is reachable from any non-terminal state.
 */
const PERMITTED_TRANSITIONS: Readonly<Record<ClaimNotificationStatus, readonly ClaimNotificationStatus[]>> = {
  reported: ['notified_to_insurer', 'withdrawn'],
  notified_to_insurer: ['under_investigation', 'withdrawn'],
  under_investigation: ['claim_lodged', 'withdrawn'],
  claim_lodged: ['settled', 'rejected', 'withdrawn'],
  settled: [],
  rejected: [],
  withdrawn: [],
};

// ─── Error Types ──────────────────────────────────────────────────────────────

export interface StateTransitionError {
  type: 'invalid_transition';
  currentState: ClaimNotificationStatus;
  attemptedState: ClaimNotificationStatus;
  permittedStates: ClaimNotificationStatus[];
}

// ─── Factory Options ──────────────────────────────────────────────────────────

export interface ClaimsNotificationServiceOptions {
  /** Injectable clock for testability. Returns ISO date string (YYYY-MM-DD). */
  now?: () => string;
  /** Custom notification period lookup by policy ID. Returns days or undefined. */
  getNotificationPeriod?: (policyId: string) => number | undefined;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let idCounter = 0;

function generateId(): string {
  idCounter += 1;
  return `claim-${Date.now()}-${idCounter.toString(36)}`;
}

/**
 * Adds a given number of calendar days to an ISO date string.
 */
function addCalendarDays(isoDate: string, days: number): string {
  const date = new Date(isoDate + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Calculates the notification deadline — the earlier of:
 * - 30 calendar days from the incident date, or
 * - A custom notification period (in days) from the incident date, if configured.
 */
function calculateNotificationDeadline(
  incidentDate: string,
  customPeriodDays: number | undefined,
): string {
  const defaultDeadline = addCalendarDays(incidentDate, 30);

  if (customPeriodDays !== undefined && customPeriodDays > 0) {
    const customDeadline = addCalendarDays(incidentDate, customPeriodDays);
    // Return the earlier deadline
    return customDeadline < defaultDeadline ? customDeadline : defaultDeadline;
  }

  return defaultDeadline;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates an instance of the Claims Notification Service with injectable
 * dependencies for testability.
 */
export function createClaimsNotificationService(
  options: ClaimsNotificationServiceOptions = {},
): ClaimsNotificationService {
  const {
    now = () => new Date().toISOString().slice(0, 10),
    getNotificationPeriod,
  } = options;

  // In-memory store keyed by projectId → claimId → ClaimsNotification
  const store = new Map<string, Map<string, ClaimsNotification>>();

  function getProjectStore(projectId: string): Map<string, ClaimsNotification> {
    let projectClaims = store.get(projectId);
    if (!projectClaims) {
      projectClaims = new Map();
      store.set(projectId, projectClaims);
    }
    return projectClaims;
  }

  // ─── registerClaim ────────────────────────────────────────────────────────

  async function registerClaim(
    projectId: string,
    claim: Omit<ClaimsNotification, 'id' | 'status' | 'notificationDeadline' | 'createdAt' | 'updatedAt'>,
    actorId: string,
  ): Promise<ClaimsNotification> {
    // Validate input using Zod schema
    const validationResult = claimsNotificationSchema.safeParse({
      incidentDate: claim.incidentDate,
      discoveryDate: claim.discoveryDate,
      affectedPolicyId: claim.affectedPolicyId,
      affectedPolicyType: claim.affectedPolicyType,
      description: claim.description,
      estimatedLoss: claim.estimatedLoss,
      locationOnSite: claim.locationOnSite,
      category: claim.category,
      evidenceRefs: claim.evidenceRefs,
      linkedRiskEventId: claim.linkedRiskEventId,
    });

    if (!validationResult.success) {
      throw new Error(
        `Validation failed: ${validationResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      );
    }

    // Determine custom notification period from the policy if configured
    const customPeriod = getNotificationPeriod
      ? getNotificationPeriod(claim.affectedPolicyId)
      : undefined;

    const id = generateId();
    const timestamp = now();

    const notificationDeadline = calculateNotificationDeadline(
      claim.incidentDate,
      customPeriod,
    );

    const newClaim: ClaimsNotification = {
      id,
      projectId,
      incidentDate: claim.incidentDate,
      discoveryDate: claim.discoveryDate,
      affectedPolicyId: claim.affectedPolicyId,
      affectedPolicyType: claim.affectedPolicyType,
      description: claim.description,
      estimatedLoss: claim.estimatedLoss,
      locationOnSite: claim.locationOnSite ?? '',
      category: claim.category,
      evidenceRefs: claim.evidenceRefs ?? [],
      status: 'reported',
      notificationDeadline,
      linkedRiskEventId: claim.linkedRiskEventId,
      createdBy: actorId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const projectStore = getProjectStore(projectId);
    projectStore.set(id, newClaim);

    return newClaim;
  }

  // ─── transitionStatus ─────────────────────────────────────────────────────

  async function transitionStatus(
    projectId: string,
    claimId: string,
    newStatus: ClaimNotificationStatus,
    _actorId: string,
  ): Promise<ClaimsNotification> {
    const projectStore = getProjectStore(projectId);
    const claim = projectStore.get(claimId);

    if (!claim) {
      throw new Error(`Claim not found: ${claimId}`);
    }

    const currentState = claim.status;
    const permitted = PERMITTED_TRANSITIONS[currentState];

    if (!permitted.includes(newStatus)) {
      const error: StateTransitionError = {
        type: 'invalid_transition',
        currentState,
        attemptedState: newStatus,
        permittedStates: [...permitted],
      };
      throw error;
    }

    const updatedClaim: ClaimsNotification = {
      ...claim,
      status: newStatus,
      updatedAt: now(),
    };

    projectStore.set(claimId, updatedClaim);
    return updatedClaim;
  }

  // ─── getClaimsSummary ─────────────────────────────────────────────────────

  async function getClaimsSummary(projectId: string): Promise<ClaimsSummary> {
    const projectStore = getProjectStore(projectId);
    const claims = Array.from(projectStore.values());

    // Initialize totals
    const totalByPolicyType: Record<InsurancePolicyType, number> = {
      CAR: 0,
      PI: 0,
      public_liability: 0,
      SASRIA: 0,
      LDI: 0,
    };

    const countByStatus: Record<ClaimNotificationStatus, number> = {
      reported: 0,
      notified_to_insurer: 0,
      under_investigation: 0,
      claim_lodged: 0,
      settled: 0,
      rejected: 0,
      withdrawn: 0,
    };

    let totalEstimatedLoss = 0;
    let totalSettledAmount = 0;

    for (const claim of claims) {
      totalByPolicyType[claim.affectedPolicyType] += 1;
      countByStatus[claim.status] += 1;
      totalEstimatedLoss += claim.estimatedLoss;

      if (claim.status === 'settled') {
        totalSettledAmount += claim.estimatedLoss;
      }
    }

    return {
      totalByPolicyType,
      totalEstimatedLoss,
      countByStatus,
      totalSettledAmount,
    };
  }

  // ─── getOverdueNotifications ──────────────────────────────────────────────

  async function getOverdueNotifications(projectId: string): Promise<ClaimsNotification[]> {
    const projectStore = getProjectStore(projectId);
    const claims = Array.from(projectStore.values());
    const today = now();

    return claims.filter(
      (claim) => claim.status === 'reported' && today > claim.notificationDeadline,
    );
  }

  return {
    registerClaim,
    transitionStatus,
    getClaimsSummary,
    getOverdueNotifications,
  };
}
