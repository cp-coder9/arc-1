/**
 * Compliance Search Engine
 *
 * Implements compliance-first professional search that returns only professionals
 * meeting all verification, CPD, tool usage, audit, dispute, and Trust Score criteria.
 * Includes hysteresis logic for Trust Score threshold (excluded at < 75, re-included at ≥ 78).
 *
 * Design constraint: search must return within 3 seconds.
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */

import type {
  ComplianceSearchQuery,
  ComplianceSearchResult,
  AutoSuggestion,
} from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Trust Score threshold below which users are excluded from search */
export const TRUST_SCORE_EXCLUSION_THRESHOLD = 75;

/** Trust Score threshold at which previously excluded users are re-included (hysteresis) */
export const TRUST_SCORE_REINCLUSION_THRESHOLD = 78;

/** Maximum number of auto-suggestions returned */
export const MAX_SUGGESTIONS = 10;

/** Minimum characters required before providing auto-suggestions */
export const MIN_SUGGESTION_INPUT_LENGTH = 2;

// ─── Hysteresis State ─────────────────────────────────────────────────────────

/**
 * Tracks users that have been excluded due to Trust Score falling below 75.
 * A user in this set is NOT re-included until their score reaches 78+.
 * In production this would be persisted to Firestore; here we use in-memory
 * state suitable for a single-server deployment.
 */
const excludedUsers = new Set<string>();

// ─── Types for Internal Data ──────────────────────────────────────────────────

export interface ProfessionalRecord {
  userId: string;
  displayName: string;
  registrationNumber: string;
  registrationStatus: 'verified' | 'unverified' | 'suspended' | 'expired';
  cpdStatus: 'compliant' | 'non_compliant' | 'expired' | 'revoked';
  trustScore: number;
  toolUsageHistory: Record<string, number>; // toolId → usage count
  aiAuditPassCount: number;
  municipalApprovalCount: number;
  disputeCount: number; // unresolved disputes
  badges: string[];
  region?: string;
}

/** Structured exclusion info returned when no results match */
export interface ExclusionCriteria {
  registrationNotVerified: number;
  cpdExpiredOrRevoked: number;
  toolUsageInsufficient: number;
  noAiAuditPass: number;
  unresolvedDisputes: number;
  trustScoreBelowThreshold: number;
  regionMismatch: number;
}

export interface NoResultsMessage {
  message: string;
  exclusionCriteria: ExclusionCriteria;
}

// ─── Pure Filtering Functions ─────────────────────────────────────────────────

/**
 * Applies hysteresis logic to determine if a user should be visible in search.
 * - If user was previously excluded (in excludedUsers set) and score < 78, still excluded.
 * - If user was previously excluded and score >= 78, re-included.
 * - If user is not excluded and score < 75, becomes excluded.
 * - If user is not excluded and score >= 75, stays included.
 */
export function applyHysteresis(userId: string, trustScore: number): boolean {
  const wasExcluded = excludedUsers.has(userId);

  if (wasExcluded) {
    if (trustScore >= TRUST_SCORE_REINCLUSION_THRESHOLD) {
      excludedUsers.delete(userId);
      return true; // re-included
    }
    return false; // still excluded
  }

  if (trustScore < TRUST_SCORE_EXCLUSION_THRESHOLD) {
    excludedUsers.add(userId);
    return false; // newly excluded
  }

  return true; // included
}

/**
 * Checks if a professional meets all compliance search criteria.
 * Returns true if the professional qualifies for inclusion in search results.
 */
export function meetsComplianceCriteria(
  professional: ProfessionalRecord,
  query: ComplianceSearchQuery
): boolean {
  // Registration must be "verified"
  if (professional.registrationStatus !== 'verified') {
    return false;
  }

  // CPD status must not be "expired" or "revoked"
  if (professional.cpdStatus === 'expired' || professional.cpdStatus === 'revoked') {
    return false;
  }

  // Tool usage: at least 1 usage per queried tool
  if (query.tools && query.tools.length > 0) {
    for (const tool of query.tools) {
      if (!professional.toolUsageHistory[tool] || professional.toolUsageHistory[tool] < 1) {
        return false;
      }
    }
  }

  // AI audit pass: at least 1
  if (professional.aiAuditPassCount < 1) {
    return false;
  }

  // Dispute count: 0 unresolved disputes
  if (professional.disputeCount > 0) {
    return false;
  }

  // Trust Score: apply hysteresis
  if (!applyHysteresis(professional.userId, professional.trustScore)) {
    return false;
  }

  // Geographic region filter
  if (query.region && professional.region !== query.region) {
    return false;
  }

  return true;
}

/**
 * Computes which criteria caused exclusions across a set of professionals.
 */
export function computeExclusionCriteria(
  professionals: ProfessionalRecord[],
  query: ComplianceSearchQuery
): ExclusionCriteria {
  const criteria: ExclusionCriteria = {
    registrationNotVerified: 0,
    cpdExpiredOrRevoked: 0,
    toolUsageInsufficient: 0,
    noAiAuditPass: 0,
    unresolvedDisputes: 0,
    trustScoreBelowThreshold: 0,
    regionMismatch: 0,
  };

  for (const p of professionals) {
    if (p.registrationStatus !== 'verified') {
      criteria.registrationNotVerified++;
    }
    if (p.cpdStatus === 'expired' || p.cpdStatus === 'revoked') {
      criteria.cpdExpiredOrRevoked++;
    }
    if (query.tools && query.tools.length > 0) {
      const hasAll = query.tools.every(
        (tool) => p.toolUsageHistory[tool] && p.toolUsageHistory[tool] >= 1
      );
      if (!hasAll) {
        criteria.toolUsageInsufficient++;
      }
    }
    if (p.aiAuditPassCount < 1) {
      criteria.noAiAuditPass++;
    }
    if (p.disputeCount > 0) {
      criteria.unresolvedDisputes++;
    }
    if (p.trustScore < TRUST_SCORE_EXCLUSION_THRESHOLD) {
      criteria.trustScoreBelowThreshold++;
    }
    if (query.region && p.region !== query.region) {
      criteria.regionMismatch++;
    }
  }

  return criteria;
}

/**
 * Sorts search results by Trust Score descending, then alphabetically by displayName for ties.
 */
export function sortResults(results: ComplianceSearchResult[]): ComplianceSearchResult[] {
  return [...results].sort((a, b) => {
    if (b.trustScore !== a.trustScore) {
      return b.trustScore - a.trustScore;
    }
    return a.displayName.localeCompare(b.displayName);
  });
}

/**
 * Maps a ProfessionalRecord to a ComplianceSearchResult.
 */
export function toSearchResult(professional: ProfessionalRecord): ComplianceSearchResult {
  return {
    userId: professional.userId,
    displayName: professional.displayName,
    registrationNumber: professional.registrationNumber,
    cpdStatus: professional.cpdStatus === 'compliant' ? 'compliant' : 'non_compliant',
    trustScore: professional.trustScore,
    toolUsageHistory: { ...professional.toolUsageHistory },
    municipalApprovalCount: professional.municipalApprovalCount,
    disputeCount: professional.disputeCount,
    badges: [...professional.badges],
  };
}

/**
 * Builds a structured "no results" message listing which criteria excluded results.
 */
export function buildNoResultsMessage(exclusionCriteria: ExclusionCriteria): NoResultsMessage {
  const reasons: string[] = [];

  if (exclusionCriteria.registrationNotVerified > 0) {
    reasons.push(`${exclusionCriteria.registrationNotVerified} excluded due to unverified registration`);
  }
  if (exclusionCriteria.cpdExpiredOrRevoked > 0) {
    reasons.push(`${exclusionCriteria.cpdExpiredOrRevoked} excluded due to expired/revoked CPD status`);
  }
  if (exclusionCriteria.toolUsageInsufficient > 0) {
    reasons.push(`${exclusionCriteria.toolUsageInsufficient} excluded due to insufficient tool usage`);
  }
  if (exclusionCriteria.noAiAuditPass > 0) {
    reasons.push(`${exclusionCriteria.noAiAuditPass} excluded due to no AI audit pass`);
  }
  if (exclusionCriteria.unresolvedDisputes > 0) {
    reasons.push(`${exclusionCriteria.unresolvedDisputes} excluded due to unresolved disputes`);
  }
  if (exclusionCriteria.trustScoreBelowThreshold > 0) {
    reasons.push(`${exclusionCriteria.trustScoreBelowThreshold} excluded due to Trust Score below threshold`);
  }
  if (exclusionCriteria.regionMismatch > 0) {
    reasons.push(`${exclusionCriteria.regionMismatch} excluded due to region mismatch`);
  }

  const message = reasons.length > 0
    ? `No professionals matched the specified criteria. ${reasons.join('; ')}.`
    : 'No professionals matched the specified criteria.';

  return { message, exclusionCriteria };
}

// ─── Firestore Data Fetching ──────────────────────────────────────────────────

/**
 * Fetches professional records from Firestore that could potentially match a search query.
 * Pre-filters by registration status "verified" at the Firestore query level where possible.
 *
 * Design constraint: must complete within 3 seconds.
 */
export async function fetchProfessionalRecords(
  query: ComplianceSearchQuery
): Promise<ProfessionalRecord[]> {
  try {
    const { adminDb } = await import('@/lib/firebase-admin');

    // Query professionals collection — pre-filter by verified status
    const professionalsRef = adminDb.collection('marketplace_professionals');
    let firestoreQuery = professionalsRef.where('registrationStatus', '==', 'verified');

    // Apply region filter at Firestore level if specified
    if (query.region) {
      firestoreQuery = firestoreQuery.where('region', '==', query.region);
    }

    const snapshot = await firestoreQuery.get();

    const records: ProfessionalRecord[] = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      records.push({
        userId: doc.id,
        displayName: data.displayName ?? '',
        registrationNumber: data.registrationNumber ?? '',
        registrationStatus: data.registrationStatus ?? 'unverified',
        cpdStatus: data.cpdStatus ?? 'non_compliant',
        trustScore: data.trustScore ?? 0,
        toolUsageHistory: data.toolUsageHistory ?? {},
        aiAuditPassCount: data.aiAuditPassCount ?? 0,
        municipalApprovalCount: data.municipalApprovalCount ?? 0,
        disputeCount: data.disputeCount ?? 0,
        badges: data.badges ?? [],
        region: data.region,
      });
    }

    return records;
  } catch (error) {
    console.error('[ComplianceSearchService] Failed to fetch professional records:', error);
    return [];
  }
}

/**
 * Fetches suggestion source data from Firestore for auto-suggest functionality.
 */
export async function fetchSuggestionSources(): Promise<{
  tools: Array<{ label: string; value: string }>;
  sansClauses: Array<{ label: string; value: string }>;
  disciplines: Array<{ label: string; value: string }>;
  regions: Array<{ label: string; value: string }>;
}> {
  const sources = {
    tools: [] as Array<{ label: string; value: string }>,
    sansClauses: [] as Array<{ label: string; value: string }>,
    disciplines: [] as Array<{ label: string; value: string }>,
    regions: [] as Array<{ label: string; value: string }>,
  };

  try {
    const { adminDb } = await import('@/lib/firebase-admin');

    // Fetch tool definitions
    try {
      const toolsSnap = await adminDb.collection('calculator_definitions').get();
      for (const doc of toolsSnap.docs) {
        const data = doc.data();
        if (data.name) {
          sources.tools.push({ label: data.name, value: doc.id });
        }
      }
    } catch {
      // Tools collection unavailable
    }

    // Fetch SANS clause references
    try {
      const sansSnap = await adminDb.collection('sans_references').get();
      for (const doc of sansSnap.docs) {
        const data = doc.data();
        if (data.clause) {
          sources.sansClauses.push({ label: data.clause, value: doc.id });
        }
      }
    } catch {
      // SANS references unavailable
    }

    // Fetch disciplines
    try {
      const disciplinesSnap = await adminDb.collection('professional_disciplines').get();
      for (const doc of disciplinesSnap.docs) {
        const data = doc.data();
        if (data.name) {
          sources.disciplines.push({ label: data.name, value: doc.id });
        }
      }
    } catch {
      // Disciplines unavailable
    }

    // Fetch regions
    try {
      const regionsSnap = await adminDb.collection('geographic_regions').get();
      for (const doc of regionsSnap.docs) {
        const data = doc.data();
        if (data.name) {
          sources.regions.push({ label: data.name, value: doc.id });
        }
      }
    } catch {
      // Regions unavailable
    }
  } catch {
    // Firebase unavailable
  }

  return sources;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Searches for professionals matching all compliance criteria.
 *
 * Design constraint: must return within 3 seconds.
 *
 * Filtering criteria:
 * - Registration status "verified"
 * - CPD status not "expired" or "revoked"
 * - Tool usage ≥ 1 per queried tool
 * - AI audit pass ≥ 1
 * - Dispute count = 0 (unresolved disputes)
 * - Trust Score ≥ 75 (with hysteresis: excluded at < 75, re-included only at ≥ 78)
 * - Geographic region match (when specified)
 *
 * Results are ranked by Trust Score descending, then alphabetically by displayName for ties.
 */
export async function search(
  query: ComplianceSearchQuery
): Promise<ComplianceSearchResult[]> {
  const professionals = await fetchProfessionalRecords(query);

  const qualifying = professionals.filter((p) => meetsComplianceCriteria(p, query));

  if (qualifying.length === 0) {
    // Compute exclusion criteria for the "no results" message.
    // We still return an empty array — the no-results message can be obtained via
    // getNoResultsInfo() or through the API layer which wraps this.
    return [];
  }

  const results = qualifying.map(toSearchResult);
  return sortResults(results);
}

/**
 * Returns a structured "no results" message indicating which criteria excluded results.
 * Call this after search() returns an empty array to get detailed exclusion info.
 */
export async function getNoResultsInfo(
  query: ComplianceSearchQuery
): Promise<NoResultsMessage> {
  const professionals = await fetchProfessionalRecords(query);
  const exclusionCriteria = computeExclusionCriteria(professionals, query);
  return buildNoResultsMessage(exclusionCriteria);
}

/**
 * Returns auto-suggestions based on input text (min 2 characters).
 * Suggestions are drawn from: tool names, SANS clauses, disciplines, and geographic regions.
 * Maximum 10 results returned.
 */
export async function getSuggestions(text: string): Promise<AutoSuggestion[]> {
  if (!text || text.length < MIN_SUGGESTION_INPUT_LENGTH) {
    return [];
  }

  const sources = await fetchSuggestionSources();
  const lowerText = text.toLowerCase();
  const suggestions: AutoSuggestion[] = [];

  // Search across all source types
  for (const source of sources.tools) {
    if (source.label.toLowerCase().includes(lowerText)) {
      suggestions.push({ type: 'tool', label: source.label, value: source.value });
    }
    if (suggestions.length >= MAX_SUGGESTIONS) break;
  }

  if (suggestions.length < MAX_SUGGESTIONS) {
    for (const source of sources.sansClauses) {
      if (source.label.toLowerCase().includes(lowerText)) {
        suggestions.push({ type: 'sans_clause', label: source.label, value: source.value });
      }
      if (suggestions.length >= MAX_SUGGESTIONS) break;
    }
  }

  if (suggestions.length < MAX_SUGGESTIONS) {
    for (const source of sources.disciplines) {
      if (source.label.toLowerCase().includes(lowerText)) {
        suggestions.push({ type: 'discipline', label: source.label, value: source.value });
      }
      if (suggestions.length >= MAX_SUGGESTIONS) break;
    }
  }

  if (suggestions.length < MAX_SUGGESTIONS) {
    for (const source of sources.regions) {
      if (source.label.toLowerCase().includes(lowerText)) {
        suggestions.push({ type: 'region', label: source.label, value: source.value });
      }
      if (suggestions.length >= MAX_SUGGESTIONS) break;
    }
  }

  return suggestions.slice(0, MAX_SUGGESTIONS);
}

// ─── Hysteresis State Management ──────────────────────────────────────────────

/**
 * Marks a user as excluded from search results due to Trust Score falling below threshold.
 * Used by external systems (e.g., Trust Score Engine) to update hysteresis state.
 */
export function markUserExcluded(userId: string): void {
  excludedUsers.add(userId);
}

/**
 * Checks if a user is currently in the excluded state (hysteresis).
 */
export function isUserExcluded(userId: string): boolean {
  return excludedUsers.has(userId);
}

/**
 * Clears all hysteresis state. Useful for testing.
 */
export function clearHysteresisState(): void {
  excludedUsers.clear();
}
