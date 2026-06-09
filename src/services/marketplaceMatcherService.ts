/**
 * Enhanced Marketplace Matcher
 *
 * Matches marketplace listings to procurement requirements by:
 *   - Discipline/trade matching
 *   - Geographic proximity
 *   - Capacity assessment
 *   - Risk rating evaluation
 *   - Verification badge integration (Pack 13)
 *
 * All matches are advisory — human selection is required.
 * Rankings are decision-support, not deterministic awards.
 */

export type MarketplaceParticipantCategory =
  | 'main_contractor'
  | 'subcontractor'
  | 'trade_package'
  | 'supplier'
  | 'specialist_consultant'
  | 'freelancer_support'
  | 'freelancer_candidate_professional';

export type MatchAvailability = 'available' | 'limited' | 'unavailable';

export interface MarketplaceListing {
  listingId: string;
  name: string;
  category: MarketplaceParticipantCategory;
  trades: string[];
  location: string;
  province?: string;
  municipality?: string;
  availability: MatchAvailability;
  verified: boolean;
  verificationBadges: string[];
  rating: number;
  completedProjects: number;
  capacityUtilization: number; // 0-1, higher = less capacity
  conflictProjectIds: string[];
  supervisionRequired: boolean;
  cidbGrading?: string;
  bbbeeLevel?: number;
}

export interface ProcurementRequirement {
  projectId: string;
  location: string;
  requiredTrades: string[];
  requiredDisciplines: string[];
  estimatedValueZar: number;
  categoryPreferences: MarketplaceParticipantCategory[];
  verificationRequirements: string[];
  excludeListingIds: string[];
}

export interface MarketplaceMatch {
  listing: MarketplaceListing;
  score: number;
  maxScore: number;
  normalizedScore: number;
  reasons: string[];
  flags: string[];
  conflict: boolean;
  recommendedInvite: boolean;
  advisoryNote: string;
}

const ADVISORY_NOTE =
  'This marketplace match is advisory only. Rankings are decision-support tools and do not constitute automatic selection or appointment. Human review and recorded approval are required for all procurement actions.';

// ─── Scoring Weights (configurable) ──────────────────────────────────────

const WEIGHTS = {
  TRADE_MATCH: 25,
  GEO_PROXIMITY: 15,
  CAPACITY: 15,
  RATING: 15,
  VERIFICATION: 15,
  CATEGORY_PREFERENCE: 10,
  BBBEE: 5,
};

// ─── Trade Matching ──────────────────────────────────────────────────────

function scoreTrades(
  listing: MarketplaceListing,
  requiredTrades: string[],
  requiredDisciplines: string[],
): { score: number; matches: string[] } {
  const allRequired = [...requiredTrades, ...requiredDisciplines].map((t) =>
    t.toLowerCase().trim(),
  );
  const listingTrades = listing.trades.map((t) => t.toLowerCase().trim());

  const matches = allRequired.filter((req) =>
    listingTrades.some(
      (lt) =>
        lt.includes(req) ||
        req.includes(lt) ||
        lt === req,
    ),
  );

  const uniqueMatches = [...new Set(matches)];
  const coverage =
    allRequired.length > 0 ? uniqueMatches.length / allRequired.length : 0;

  return {
    score: Math.round(coverage * WEIGHTS.TRADE_MATCH),
    matches: uniqueMatches,
  };
}

// ─── Geographic Proximity ────────────────────────────────────────────────

function scoreProximity(
  listingLocation: string,
  requirementLocation: string,
  listingProvince?: string,
  listingMunicipality?: string,
  requirementMunicipality?: string,
): { score: number; reason: string } {
  const loc = listingLocation.toLowerCase().trim();
  const req = requirementLocation.toLowerCase().trim();

  // Exact match
  if (loc === req) {
    return { score: WEIGHTS.GEO_PROXIMITY, reason: 'Exact location match' };
  }

  // Municipality match
  if (
    listingMunicipality &&
    requirementMunicipality &&
    listingMunicipality.toLowerCase().trim() === requirementMunicipality.toLowerCase().trim()
  ) {
    return { score: Math.round(WEIGHTS.GEO_PROXIMITY * 0.9), reason: 'Same municipality' };
  }

  // Province match
  if (
    listingProvince &&
    (req.includes(listingProvince.toLowerCase()) || loc.includes(req.split(',')[0]?.trim()))
  ) {
    return { score: Math.round(WEIGHTS.GEO_PROXIMITY * 0.7), reason: 'Same province' };
  }

  // Broad region
  if (
    loc
      .split(/[,\s]+/)
      .some((part) => req.includes(part) && part.length > 3)
  ) {
    return { score: Math.round(WEIGHTS.GEO_PROXIMITY * 0.4), reason: 'Regional proximity' };
  }

  return { score: 0, reason: 'No geographic proximity' };
}

// ─── Capacity Scoring ────────────────────────────────────────────────────

function scoreCapacity(
  availability: MatchAvailability,
  capacityUtilization: number,
): { score: number; reason: string } {
  if (availability === 'unavailable') {
    return { score: 0, reason: 'Listing marked unavailable' };
  }

  if (availability === 'limited') {
    return {
      score: Math.round(WEIGHTS.CAPACITY * 0.4),
      reason: 'Limited availability — capacity may be constrained',
    };
  }

  // Available: score based on utilization
  const capacityScore = Math.round(WEIGHTS.CAPACITY * (1 - capacityUtilization));
  return {
    score: Math.max(2, capacityScore),
    reason:
      capacityUtilization < 0.5
        ? 'Good capacity available'
        : capacityUtilization < 0.8
          ? 'Moderate capacity'
          : 'High utilization — capacity may be limited',
  };
}

// ─── Rating Scoring ──────────────────────────────────────────────────────

function scoreRating(
  rating: number,
  completedProjects: number,
): { score: number; reason: string } {
  const ratingComponent = (Math.min(rating, 5) / 5) * (WEIGHTS.RATING * 0.7);
  const experienceComponent =
    Math.min(completedProjects / 20, 1) * (WEIGHTS.RATING * 0.3);

  const total = Math.round(ratingComponent + experienceComponent);

  let reason = '';
  if (rating >= 4.5) reason = 'Excellent rating';
  else if (rating >= 3.5) reason = 'Good rating';
  else if (rating >= 2.5) reason = 'Average rating';
  else reason = 'Below-average rating';

  if (completedProjects >= 20) reason += ' with extensive experience';
  else if (completedProjects >= 10) reason += ' with significant experience';
  else if (completedProjects >= 5) reason += ' with moderate experience';

  return { score: total, reason };
}

// ─── Verification Badge Scoring ──────────────────────────────────────────

function scoreVerification(
  listing: MarketplaceListing,
  requiredVerifications: string[],
): { score: number; matched: string[]; missing: string[] } {
  if (requiredVerifications.length === 0) {
    return { score: WEIGHTS.VERIFICATION, matched: [], missing: [] };
  }

  const listingBadges = listing.verificationBadges.map((b) => b.toLowerCase().trim());
  const required = requiredVerifications.map((r) => r.toLowerCase().trim());

  const matched = required.filter((req) =>
    listingBadges.some((badge) => badge.includes(req) || req.includes(badge)),
  );
  const missing = required.filter((req) => !matched.includes(req));

  const coverage = required.length > 0 ? matched.length / required.length : 1;

  return {
    score: Math.round(coverage * WEIGHTS.VERIFICATION),
    matched,
    missing,
  };
}

// ─── Category Preference ─────────────────────────────────────────────────

function scoreCategory(
  listingCategory: MarketplaceParticipantCategory,
  preferredCategories: MarketplaceParticipantCategory[],
): { score: number; reason: string } {
  if (preferredCategories.length === 0) {
    return { score: WEIGHTS.CATEGORY_PREFERENCE, reason: 'No category preference specified' };
  }

  const isPreferred = preferredCategories.some(
    (pref) => pref.toLowerCase() === listingCategory.toLowerCase(),
  );

  if (isPreferred) {
    return { score: WEIGHTS.CATEGORY_PREFERENCE, reason: 'Category matches preference' };
  }

  return { score: Math.round(WEIGHTS.CATEGORY_PREFERENCE * 0.3), reason: 'Category not preferred' };
}

// ─── B-BBEE Scoring ──────────────────────────────────────────────────────

function scoreBbbee(bbbeeLevel?: number): { score: number; reason: string } {
  if (bbbeeLevel === undefined) {
    return { score: 0, reason: 'No B-BBEE data' };
  }

  // Lower B-BBEE level = better (Level 1 is best, Level 8 is worst)
  const normalizedScore = Math.max(0, (8 - bbbeeLevel) / 7);
  return {
    score: Math.round(normalizedScore * WEIGHTS.BBBEE),
    reason: `B-BBEE Level ${bbbeeLevel}`,
  };
}

// ─── Conflict Detection ──────────────────────────────────────────────────

function detectConflict(
  listing: MarketplaceListing,
  projectId: string,
  excludeListingIds: string[],
): { conflict: boolean; reason: string } {
  if (excludeListingIds.includes(listing.listingId)) {
    return { conflict: true, reason: 'Listing explicitly excluded' };
  }

  if (listing.conflictProjectIds.includes(projectId)) {
    return { conflict: true, reason: 'Listing has declared conflict with this project' };
  }

  return { conflict: false, reason: 'No conflict detected' };
}

// ─── Main Matcher ────────────────────────────────────────────────────────

export interface MatchResult {
  matches: MarketplaceMatch[];
  totalListingsSearched: number;
  advisoryNote: string;
  generatedAt: string;
}

/**
 * Matches marketplace listings against procurement requirements.
 * Rankings are advisory only — human selection required.
 */
export function matchMarketplaceListings(
  listings: MarketplaceListing[],
  requirement: ProcurementRequirement,
): MatchResult {
  if (listings.length === 0) {
    return {
      matches: [],
      totalListingsSearched: 0,
      advisoryNote: ADVISORY_NOTE,
      generatedAt: new Date().toISOString(),
    };
  }

  const matches: MarketplaceMatch[] = listings
    .filter((listing) => !requirement.excludeListingIds.includes(listing.listingId))
    .map((listing) => {
      const tradeScore = scoreTrades(
        listing,
        requirement.requiredTrades,
        requirement.requiredDisciplines,
      );
      const proximityScore = scoreProximity(
        listing.location,
        requirement.location,
        listing.province,
        listing.municipality,
      );
      const capacityScore = scoreCapacity(listing.availability, listing.capacityUtilization);
      const ratingScore = scoreRating(listing.rating, listing.completedProjects);
      const verificationScore = scoreVerification(listing, requirement.verificationRequirements);
      const categoryScore = scoreCategory(listing.category, requirement.categoryPreferences);
      const bbbeeScore = scoreBbbee(listing.bbbeeLevel);
      const conflictCheck = detectConflict(
        listing,
        requirement.projectId,
        requirement.excludeListingIds,
      );

      const totalScore =
        tradeScore.score +
        proximityScore.score +
        capacityScore.score +
        ratingScore.score +
        verificationScore.score +
        categoryScore.score +
        bbbeeScore.score;

      const maxScore = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

      const reasons: string[] = [
        `Trades: ${tradeScore.matches.length} match(es) — ${tradeScore.matches.join(', ') || 'none'}`,
        `Location: ${proximityScore.reason}`,
        `Capacity: ${capacityScore.reason}`,
        `Rating: ${ratingScore.reason}`,
        `Verification: ${verificationScore.matched.length}/${requirement.verificationRequirements.length} badge(s) — ${verificationScore.matched.join(', ') || 'none'}`,
        `Category: ${categoryScore.reason}`,
        `B-BBEE: ${bbbeeScore.reason}`,
      ];

      const flags: string[] = [];
      if (listing.supervisionRequired) {
        flags.push('Candidate professional — supervision required');
      }
      if (verificationScore.missing.length > 0) {
        flags.push(
          `Missing verification badges: ${verificationScore.missing.join(', ')}`,
        );
      }
      if (listing.availability === 'limited') {
        flags.push('Limited availability');
      }
      if (conflictCheck.conflict) {
        flags.push(`Conflict: ${conflictCheck.reason}`);
      }

      const recommendedInvite =
        !conflictCheck.conflict &&
        tradeScore.score >= WEIGHTS.TRADE_MATCH * 0.3 &&
        capacityScore.score > 0 &&
        listing.availability !== 'unavailable';

      return {
        listing,
        score: totalScore,
        maxScore,
        normalizedScore: maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0,
        reasons,
        flags,
        conflict: conflictCheck.conflict,
        recommendedInvite,
        advisoryNote: ADVISORY_NOTE,
      };
    })
    .sort((a, b) => {
      // Conflicts always at the bottom
      if (a.conflict && !b.conflict) return 1;
      if (!a.conflict && b.conflict) return -1;
      // Sort by score descending
      return b.score - a.score;
    });

  return {
    matches,
    totalListingsSearched: listings.length,
    advisoryNote: ADVISORY_NOTE,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Returns the top N recommended matches (filtering out conflicts).
 */
export function getTopRecommendations(
  result: MatchResult,
  limit: number = 5,
): MarketplaceMatch[] {
  return result.matches
    .filter((m) => m.recommendedInvite && !m.conflict)
    .slice(0, limit);
}
