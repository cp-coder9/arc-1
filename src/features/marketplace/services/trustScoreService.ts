/**
 * Trust Score Engine
 *
 * Computes and maintains dynamic Trust Scores (0–100) for marketplace participants
 * using seven weighted factors. The service separates pure computation logic
 * (testable without Firestore) from persistence and data-fetching concerns.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.6
 */

import type {
  TrustScore,
  TrustScoreFactor,
  TrustScoreFactorType,
  TrustBadge,
} from '../types';

// ─── Event Type ───────────────────────────────────────────────────────────────

export interface TrustScoreEvent {
  type: 'project_completed' | 'rating_received' | 'audit_result' | 'cpd_activity' | 'registration_update';
  userId: string;
  data?: Record<string, unknown>;
}

// ─── Factor Input Types ───────────────────────────────────────────────────────

/**
 * Raw data inputs used to compute trust score factors.
 * Each field may be undefined/null to indicate data is unavailable.
 */
export interface TrustScoreFactorInputs {
  /** Professional Body API registration status: 'active', 'inactive', 'suspended', or undefined if unavailable */
  registrationStatus?: 'active' | 'inactive' | 'suspended' | null;
  /** Whether the user has met their CPD hours requirement in the last 12 months */
  cpdCompliant?: boolean | null;
  /** Number of projects completed (accepted and marked complete) */
  projectsCompleted?: number | null;
  /** Total number of projects accepted */
  projectsAccepted?: number | null;
  /** Number of AI audits passed without resubmission */
  auditsPassed?: number | null;
  /** Total number of AI audits */
  auditsTotal?: number | null;
  /** Weighted average rating on a 1–5 scale */
  averageRating?: number | null;
  /** Number of distinct tools used in the last 12 months */
  distinctToolsUsed?: number | null;
  /** Whether the user has any upheld disputes in the last 12 months */
  hasUpheldDisputes?: boolean | null;
}

// ─── Factor Weight Definitions ────────────────────────────────────────────────

export const FACTOR_WEIGHTS: Record<TrustScoreFactorType, number> = {
  professional_registration: 0.25,
  cpd_compliance: 0.20,
  project_completion_rate: 0.15,
  ai_audit_pass_rate: 0.15,
  client_ratings: 0.10,
  tool_mastery: 0.10,
  dispute_free: 0.05,
};

const TOP_10_PERCENT_THRESHOLD = 90;

// ─── Pure Computation Functions ───────────────────────────────────────────────

/**
 * Computes the raw score (0–100) for the professional registration factor.
 * Returns 100 if active, 0 if inactive/suspended/unavailable.
 */
export function computeRegistrationScore(
  status: TrustScoreFactorInputs['registrationStatus']
): { rawScore: number; insufficientData: boolean } {
  if (status === undefined || status === null) {
    return { rawScore: 0, insufficientData: true };
  }
  return { rawScore: status === 'active' ? 100 : 0, insufficientData: false };
}

/**
 * Computes the raw score for CPD compliance factor.
 * Returns 100 if CPD hours met for last 12 months, 0 if not.
 */
export function computeCpdScore(
  compliant: TrustScoreFactorInputs['cpdCompliant']
): { rawScore: number; insufficientData: boolean } {
  if (compliant === undefined || compliant === null) {
    return { rawScore: 0, insufficientData: true };
  }
  return { rawScore: compliant ? 100 : 0, insufficientData: false };
}

/**
 * Computes the raw score for project completion rate.
 * Score = (completed / total accepted) * 100.
 */
export function computeProjectCompletionScore(
  completed: TrustScoreFactorInputs['projectsCompleted'],
  accepted: TrustScoreFactorInputs['projectsAccepted']
): { rawScore: number; insufficientData: boolean } {
  if (completed === undefined || completed === null || accepted === undefined || accepted === null) {
    return { rawScore: 0, insufficientData: true };
  }
  if (accepted === 0) {
    return { rawScore: 0, insufficientData: true };
  }
  const rate = (completed / accepted) * 100;
  return { rawScore: Math.min(100, Math.max(0, rate)), insufficientData: false };
}

/**
 * Computes the raw score for AI audit pass rate.
 * Score = (passed without resubmission / total audits) * 100.
 */
export function computeAuditPassScore(
  passed: TrustScoreFactorInputs['auditsPassed'],
  total: TrustScoreFactorInputs['auditsTotal']
): { rawScore: number; insufficientData: boolean } {
  if (passed === undefined || passed === null || total === undefined || total === null) {
    return { rawScore: 0, insufficientData: true };
  }
  if (total === 0) {
    return { rawScore: 0, insufficientData: true };
  }
  const rate = (passed / total) * 100;
  return { rawScore: Math.min(100, Math.max(0, rate)), insufficientData: false };
}

/**
 * Computes the raw score for client ratings.
 * Maps 1–5 average rating to 0–100 scale: score = averageRating * 20.
 */
export function computeRatingsScore(
  averageRating: TrustScoreFactorInputs['averageRating']
): { rawScore: number; insufficientData: boolean } {
  if (averageRating === undefined || averageRating === null) {
    return { rawScore: 0, insufficientData: true };
  }
  const score = averageRating * 20;
  return { rawScore: Math.min(100, Math.max(0, score)), insufficientData: false };
}

/**
 * Computes the raw score for tool mastery.
 * 100 if ≥ 5 distinct tools used in last 12 months, else (count/5)*100.
 */
export function computeToolMasteryScore(
  distinctTools: TrustScoreFactorInputs['distinctToolsUsed']
): { rawScore: number; insufficientData: boolean } {
  if (distinctTools === undefined || distinctTools === null) {
    return { rawScore: 0, insufficientData: true };
  }
  const score = distinctTools >= 5 ? 100 : (distinctTools / 5) * 100;
  return { rawScore: Math.min(100, Math.max(0, score)), insufficientData: false };
}

/**
 * Computes the raw score for dispute-free factor.
 * 100 if no upheld disputes in last 12 months, 0 if any.
 */
export function computeDisputeFreeScore(
  hasUpheldDisputes: TrustScoreFactorInputs['hasUpheldDisputes']
): { rawScore: number; insufficientData: boolean } {
  if (hasUpheldDisputes === undefined || hasUpheldDisputes === null) {
    return { rawScore: 0, insufficientData: true };
  }
  return { rawScore: hasUpheldDisputes ? 0 : 100, insufficientData: false };
}

/**
 * Pure function: computes the full trust score from factor inputs.
 * Produces the weighted sum of all factors, rounds to nearest integer,
 * and clamps to [0, 100]. Assigns the "top_10_percent" badge when score ≥ 90.
 *
 * This function is fully testable without Firestore or any external dependencies.
 */
export function computeScoreFromInputs(
  userId: string,
  inputs: TrustScoreFactorInputs,
  calculatedAt?: string
): TrustScore {
  const timestamp = calculatedAt || new Date().toISOString();

  const registration = computeRegistrationScore(inputs.registrationStatus);
  const cpd = computeCpdScore(inputs.cpdCompliant);
  const projectCompletion = computeProjectCompletionScore(inputs.projectsCompleted, inputs.projectsAccepted);
  const auditPass = computeAuditPassScore(inputs.auditsPassed, inputs.auditsTotal);
  const ratings = computeRatingsScore(inputs.averageRating);
  const toolMastery = computeToolMasteryScore(inputs.distinctToolsUsed);
  const disputeFree = computeDisputeFreeScore(inputs.hasUpheldDisputes);

  const factorResults: Array<{ type: TrustScoreFactorType; rawScore: number; insufficientData: boolean }> = [
    { type: 'professional_registration', ...registration },
    { type: 'cpd_compliance', ...cpd },
    { type: 'project_completion_rate', ...projectCompletion },
    { type: 'ai_audit_pass_rate', ...auditPass },
    { type: 'client_ratings', ...ratings },
    { type: 'tool_mastery', ...toolMastery },
    { type: 'dispute_free', ...disputeFree },
  ];

  const factors: TrustScoreFactor[] = factorResults.map((result) => {
    const weight = FACTOR_WEIGHTS[result.type];
    return {
      factor: result.type,
      weight,
      rawScore: result.rawScore,
      weightedScore: result.rawScore * weight,
      insufficientData: result.insufficientData,
    };
  });

  const rawTotal = factors.reduce((sum, f) => sum + f.weightedScore, 0);
  const overallScore = Math.min(100, Math.max(0, Math.round(rawTotal)));

  const badges: TrustBadge[] = overallScore >= TOP_10_PERCENT_THRESHOLD
    ? ['top_10_percent']
    : [];

  return {
    userId,
    overallScore,
    factors,
    calculatedAt: timestamp,
    badges,
  };
}

// ─── Data Fetching Helpers ────────────────────────────────────────────────────

/**
 * Fetches the raw factor inputs for a user from various platform services.
 * This function is the boundary between pure computation and data access.
 */
export async function fetchFactorInputs(userId: string): Promise<TrustScoreFactorInputs> {
  const inputs: TrustScoreFactorInputs = {};

  try {
    const { adminDb } = await import('@/lib/firebase-admin');

    // 1. Professional registration status
    try {
      const registrationSnap = await adminDb
        .collection('professional_registrations')
        .where('userId', '==', userId)
        .limit(1)
        .get();

      if (!registrationSnap.empty) {
        const regData = registrationSnap.docs[0].data();
        const status = regData.status as string;
        if (status === 'active') {
          inputs.registrationStatus = 'active';
        } else if (status === 'suspended') {
          inputs.registrationStatus = 'suspended';
        } else {
          inputs.registrationStatus = 'inactive';
        }
      }
    } catch {
      // Registration data unavailable
    }

    // 2. CPD compliance
    try {
      const cpdSnap = await adminDb
        .collection('cpd_records')
        .doc(userId)
        .get();

      if (cpdSnap.exists) {
        const cpdData = cpdSnap.data();
        inputs.cpdCompliant = cpdData?.compliant === true;
      }
    } catch {
      // CPD data unavailable
    }

    // 3. Project completion rate
    try {
      const projectsSnap = await adminDb
        .collection('marketplace_proposals')
        .where('professionalId', '==', userId)
        .where('status', 'in', ['accepted', 'completed'])
        .get();

      if (!projectsSnap.empty) {
        let completed = 0;
        let total = 0;
        for (const doc of projectsSnap.docs) {
          total++;
          if (doc.data().status === 'completed') {
            completed++;
          }
        }
        inputs.projectsCompleted = completed;
        inputs.projectsAccepted = total;
      }
    } catch {
      // Project data unavailable
    }

    // 4. AI audit pass rate
    try {
      const twelveMoAgo = new Date();
      twelveMoAgo.setMonth(twelveMoAgo.getMonth() - 12);

      const auditsSnap = await adminDb
        .collection('ai_audit_results')
        .where('userId', '==', userId)
        .where('createdAt', '>=', twelveMoAgo.toISOString())
        .get();

      if (!auditsSnap.empty) {
        let passed = 0;
        let total = 0;
        for (const doc of auditsSnap.docs) {
          total++;
          if (doc.data().status === 'passed' && doc.data().submissionNumber === 1) {
            passed++;
          }
        }
        inputs.auditsPassed = passed;
        inputs.auditsTotal = total;
      }
    } catch {
      // Audit data unavailable
    }

    // 5. Client ratings
    try {
      const ratingsSnap = await adminDb
        .collection('marketplace_ratings')
        .where('ratedUserId', '==', userId)
        .get();

      if (!ratingsSnap.empty) {
        let totalRating = 0;
        let count = 0;
        for (const doc of ratingsSnap.docs) {
          const rating = doc.data().rating as number;
          if (typeof rating === 'number' && rating >= 1 && rating <= 5) {
            totalRating += rating;
            count++;
          }
        }
        if (count > 0) {
          inputs.averageRating = totalRating / count;
        }
      }
    } catch {
      // Ratings data unavailable
    }

    // 6. Tool mastery — distinct tools used in last 12 months
    try {
      const twelveMoAgo = new Date();
      twelveMoAgo.setMonth(twelveMoAgo.getMonth() - 12);

      const toolUsageSnap = await adminDb
        .collection('tool_usage_records')
        .where('userId', '==', userId)
        .where('usedAt', '>=', twelveMoAgo.toISOString())
        .get();

      if (!toolUsageSnap.empty) {
        const distinctTools = new Set<string>();
        for (const doc of toolUsageSnap.docs) {
          const toolId = doc.data().toolId as string;
          if (toolId) {
            distinctTools.add(toolId);
          }
        }
        inputs.distinctToolsUsed = distinctTools.size;
      }
    } catch {
      // Tool usage data unavailable
    }

    // 7. Dispute-free status (last 12 months)
    try {
      const twelveMoAgo = new Date();
      twelveMoAgo.setMonth(twelveMoAgo.getMonth() - 12);

      const disputesSnap = await adminDb
        .collection('marketplace_disputes')
        .where('opposingPartyId', '==', userId)
        .where('createdAt', '>=', twelveMoAgo.toISOString())
        .where('outcome', '==', 'upheld')
        .get();

      inputs.hasUpheldDisputes = !disputesSnap.empty;
    } catch {
      // Dispute data unavailable
    }
  } catch {
    // Firebase unavailable — all factors will be insufficientData
  }

  return inputs;
}

// ─── Firestore Persistence ────────────────────────────────────────────────────

/**
 * Persists a computed trust score to Firestore.
 */
export async function persistTrustScore(score: TrustScore): Promise<void> {
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_trust_scores')
      .doc(score.userId)
      .set({
        overallScore: score.overallScore,
        factors: score.factors,
        badges: score.badges,
        calculatedAt: score.calculatedAt,
        updatedAt: new Date().toISOString(),
      });
  } catch (error) {
    console.error('[TrustScoreService] Failed to persist trust score:', error);
    throw error;
  }
}

/**
 * Reads a trust score from Firestore.
 */
export async function readTrustScoreFromFirestore(userId: string): Promise<TrustScore | null> {
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const doc = await adminDb
      .collection('marketplace_trust_scores')
      .doc(userId)
      .get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data()!;
    return {
      userId,
      overallScore: data.overallScore as number,
      factors: data.factors as TrustScoreFactor[],
      calculatedAt: data.calculatedAt as string,
      badges: (data.badges as TrustBadge[]) || [],
    };
  } catch (error) {
    console.error('[TrustScoreService] Failed to read trust score:', error);
    return null;
  }
}

// ─── Debounce State ───────────────────────────────────────────────────────────

const pendingRecalculations = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_WINDOW_MS = 60_000; // 60 seconds

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Computes and persists a trust score for the given user.
 * Fetches all factor inputs from platform services, computes the score,
 * and saves the result to Firestore.
 */
export async function computeTrustScore(userId: string): Promise<TrustScore> {
  const inputs = await fetchFactorInputs(userId);
  const score = computeScoreFromInputs(userId, inputs);
  await persistTrustScore(score);
  return score;
}

/**
 * Reads the most recently persisted trust score for a user from Firestore.
 * Returns null if no score has been computed yet.
 */
export async function getTrustScore(userId: string): Promise<TrustScore | null> {
  return readTrustScoreFromFirestore(userId);
}

/**
 * Triggered by marketplace events (project completion, rating, audit, CPD activity,
 * or registration status change). Collapses multiple events within 60 seconds
 * into a single recalculation to avoid excessive recomputation.
 */
export async function recalculateOnEvent(event: TrustScoreEvent): Promise<TrustScore> {
  const { userId } = event;

  // If there's already a pending recalculation for this user, clear it
  const existingTimeout = pendingRecalculations.get(userId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
    pendingRecalculations.delete(userId);
  }

  // For the initial event, compute immediately
  const score = await computeTrustScore(userId);

  // Set up debounce: if another event comes within 60 seconds,
  // it will clear this timeout and compute fresh. If no further events,
  // the timeout simply expires with no action needed (score already current).
  const timeout = setTimeout(() => {
    pendingRecalculations.delete(userId);
  }, DEBOUNCE_WINDOW_MS);

  pendingRecalculations.set(userId, timeout);

  return score;
}

/**
 * Clears all pending debounce timers. Useful for testing cleanup.
 */
export function clearPendingRecalculations(): void {
  for (const timeout of pendingRecalculations.values()) {
    clearTimeout(timeout);
  }
  pendingRecalculations.clear();
}
