/**
 * Unit tests for Green Star SA service
 *
 * Covers: star rating boundaries, category minimum enforcement,
 * rating reduction, and at-risk credit identification.
 *
 * Requirements: 9.1–9.8
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  calculateStarRating,
  checkCategoryMinimums,
  calculateGreenStarResult,
  identifyAtRiskCredits,
  CATEGORY_MINIMUMS,
} from '../../services/eia/greenBuildingService';
import type { Credit, RatingTool } from '../../services/eia/eiaTypes';

// ─── Helper: Create a credit ─────────────────────────────────────────────────

function makeCredit(overrides: Partial<Credit> = {}): Credit {
  return {
    id: 'credit-1',
    category: 'energy',
    name: 'Test Credit',
    availablePoints: 10,
    targetedPoints: 5,
    achievedPoints: 5,
    evidenceStatus: 'verified',
    ...overrides,
  };
}

// ─── calculateStarRating ─────────────────────────────────────────────────────

describe('calculateStarRating', () => {
  it('returns 0 for points below 10', () => {
    expect(calculateStarRating(0)).toBe(0);
    expect(calculateStarRating(5)).toBe(0);
    expect(calculateStarRating(9)).toBe(0);
  });

  it('returns 1 Star for 10-19 points', () => {
    expect(calculateStarRating(10)).toBe(1);
    expect(calculateStarRating(15)).toBe(1);
    expect(calculateStarRating(19)).toBe(1);
  });

  it('returns 2 Star for 20-29 points', () => {
    expect(calculateStarRating(20)).toBe(2);
    expect(calculateStarRating(25)).toBe(2);
    expect(calculateStarRating(29)).toBe(2);
  });

  it('returns 3 Star for 30-44 points', () => {
    expect(calculateStarRating(30)).toBe(3);
    expect(calculateStarRating(40)).toBe(3);
    expect(calculateStarRating(44)).toBe(3);
  });

  it('returns 4 Star for 45-59 points', () => {
    expect(calculateStarRating(45)).toBe(4);
    expect(calculateStarRating(50)).toBe(4);
    expect(calculateStarRating(59)).toBe(4);
  });

  it('returns 5 Star for 60-74 points', () => {
    expect(calculateStarRating(60)).toBe(5);
    expect(calculateStarRating(70)).toBe(5);
    expect(calculateStarRating(74)).toBe(5);
  });

  it('returns 6 Star for 75+ points', () => {
    expect(calculateStarRating(75)).toBe(6);
    expect(calculateStarRating(100)).toBe(6);
  });

  it('handles exact boundary values correctly', () => {
    expect(calculateStarRating(9)).toBe(0);
    expect(calculateStarRating(10)).toBe(1);
    expect(calculateStarRating(19)).toBe(1);
    expect(calculateStarRating(20)).toBe(2);
    expect(calculateStarRating(29)).toBe(2);
    expect(calculateStarRating(30)).toBe(3);
    expect(calculateStarRating(44)).toBe(3);
    expect(calculateStarRating(45)).toBe(4);
    expect(calculateStarRating(59)).toBe(4);
    expect(calculateStarRating(60)).toBe(5);
    expect(calculateStarRating(74)).toBe(5);
    expect(calculateStarRating(75)).toBe(6);
  });
});

// ─── checkCategoryMinimums ───────────────────────────────────────────────────

describe('checkCategoryMinimums', () => {
  it('returns met=true for custom rating tool (no minimums enforced)', () => {
    const credits = [makeCredit({ category: 'energy', achievedPoints: 0 })];
    const result = checkCategoryMinimums(credits, 'custom');
    expect(result.met).toBe(true);
    expect(result.unmet).toHaveLength(0);
  });

  it('returns met=true when all category minimums are satisfied for office_v1', () => {
    const credits: Credit[] = [
      makeCredit({ id: '1', category: 'energy', achievedPoints: 5 }),
      makeCredit({ id: '2', category: 'water', achievedPoints: 4 }),
      makeCredit({ id: '3', category: 'ieq', achievedPoints: 3 }),
      makeCredit({ id: '4', category: 'materials', achievedPoints: 3 }),
      makeCredit({ id: '5', category: 'land_use_ecology', achievedPoints: 2 }),
    ];
    const result = checkCategoryMinimums(credits, 'office_v1');
    expect(result.met).toBe(true);
    expect(result.unmet).toHaveLength(0);
  });

  it('returns unmet categories when minimums are not satisfied', () => {
    const credits: Credit[] = [
      makeCredit({ id: '1', category: 'energy', achievedPoints: 2 }), // needs 4
      makeCredit({ id: '2', category: 'water', achievedPoints: 3 }),
      makeCredit({ id: '3', category: 'ieq', achievedPoints: 3 }),
      makeCredit({ id: '4', category: 'materials', achievedPoints: 2 }),
      makeCredit({ id: '5', category: 'land_use_ecology', achievedPoints: 2 }),
    ];
    const result = checkCategoryMinimums(credits, 'office_v1');
    expect(result.met).toBe(false);
    expect(result.unmet).toHaveLength(1);
    expect(result.unmet[0]).toEqual({
      category: 'energy',
      required: 4,
      achieved: 2,
    });
  });

  it('aggregates points from multiple credits in the same category', () => {
    const credits: Credit[] = [
      makeCredit({ id: '1', category: 'energy', achievedPoints: 2 }),
      makeCredit({ id: '2', category: 'energy', achievedPoints: 2 }),
      makeCredit({ id: '3', category: 'water', achievedPoints: 3 }),
      makeCredit({ id: '4', category: 'ieq', achievedPoints: 3 }),
      makeCredit({ id: '5', category: 'materials', achievedPoints: 2 }),
      makeCredit({ id: '6', category: 'land_use_ecology', achievedPoints: 2 }),
    ];
    const result = checkCategoryMinimums(credits, 'office_v1');
    expect(result.met).toBe(true);
  });

  it('reports multiple unmet minimums when several categories fail', () => {
    const credits: Credit[] = [
      makeCredit({ id: '1', category: 'energy', achievedPoints: 1 }),
      makeCredit({ id: '2', category: 'water', achievedPoints: 1 }),
    ];
    const result = checkCategoryMinimums(credits, 'office_v1');
    expect(result.met).toBe(false);
    expect(result.unmet.length).toBeGreaterThanOrEqual(2);
  });

  it('treats missing category credits as 0 achieved', () => {
    const credits: Credit[] = [];
    const result = checkCategoryMinimums(credits, 'residential_v1');
    expect(result.met).toBe(false);
    // All 5 categories should be unmet
    expect(result.unmet).toHaveLength(5);
  });

  it('enforces residential_v1 minimums (water=4 higher than office)', () => {
    const credits: Credit[] = [
      makeCredit({ id: '1', category: 'energy', achievedPoints: 4 }),
      makeCredit({ id: '2', category: 'water', achievedPoints: 3 }), // needs 4 for residential
      makeCredit({ id: '3', category: 'ieq', achievedPoints: 3 }),
      makeCredit({ id: '4', category: 'materials', achievedPoints: 2 }),
      makeCredit({ id: '5', category: 'land_use_ecology', achievedPoints: 2 }),
    ];
    const result = checkCategoryMinimums(credits, 'residential_v1');
    expect(result.met).toBe(false);
    expect(result.unmet).toEqual([
      { category: 'water', required: 4, achieved: 3 },
    ]);
  });

  it('enforces retail_v1 minimums (energy=5 higher than office)', () => {
    const credits: Credit[] = [
      makeCredit({ id: '1', category: 'energy', achievedPoints: 4 }), // needs 5 for retail
      makeCredit({ id: '2', category: 'water', achievedPoints: 3 }),
      makeCredit({ id: '3', category: 'ieq', achievedPoints: 3 }),
      makeCredit({ id: '4', category: 'materials', achievedPoints: 2 }),
      makeCredit({ id: '5', category: 'land_use_ecology', achievedPoints: 2 }),
    ];
    const result = checkCategoryMinimums(credits, 'retail_v1');
    expect(result.met).toBe(false);
    expect(result.unmet).toEqual([
      { category: 'energy', required: 5, achieved: 4 },
    ]);
  });

  it('enforces public_education_v1 minimums (ieq=4 higher than office)', () => {
    const credits: Credit[] = [
      makeCredit({ id: '1', category: 'energy', achievedPoints: 4 }),
      makeCredit({ id: '2', category: 'water', achievedPoints: 3 }),
      makeCredit({ id: '3', category: 'ieq', achievedPoints: 3 }), // needs 4 for public_education
      makeCredit({ id: '4', category: 'materials', achievedPoints: 2 }),
      makeCredit({ id: '5', category: 'land_use_ecology', achievedPoints: 2 }),
    ];
    const result = checkCategoryMinimums(credits, 'public_education_v1');
    expect(result.met).toBe(false);
    expect(result.unmet).toEqual([
      { category: 'ieq', required: 4, achieved: 3 },
    ]);
  });
});

// ─── calculateGreenStarResult ────────────────────────────────────────────────

describe('calculateGreenStarResult', () => {
  it('calculates total targeted and achieved scores', () => {
    const credits: Credit[] = [
      makeCredit({ id: '1', targetedPoints: 5, achievedPoints: 3 }),
      makeCredit({ id: '2', targetedPoints: 10, achievedPoints: 8 }),
    ];
    const result = calculateGreenStarResult(credits, 'custom');
    expect(result.totalTargeted).toBe(15);
    expect(result.totalAchieved).toBe(11);
  });

  it('assigns correct star rating based on total achieved points', () => {
    const credits: Credit[] = [
      makeCredit({ id: '1', category: 'energy', achievedPoints: 20 }),
      makeCredit({ id: '2', category: 'water', achievedPoints: 15 }),
      makeCredit({ id: '3', category: 'ieq', achievedPoints: 10 }),
      makeCredit({ id: '4', category: 'materials', achievedPoints: 10 }),
      makeCredit({ id: '5', category: 'land_use_ecology', achievedPoints: 5 }),
    ];
    // Total = 60 → 5 Star
    const result = calculateGreenStarResult(credits, 'custom');
    expect(result.starRating).toBe(5);
  });

  it('reduces star rating by 1 when category minimums are not met', () => {
    const credits: Credit[] = [
      makeCredit({ id: '1', category: 'energy', achievedPoints: 2 }), // below min 4
      makeCredit({ id: '2', category: 'water', achievedPoints: 3 }),
      makeCredit({ id: '3', category: 'ieq', achievedPoints: 3 }),
      makeCredit({ id: '4', category: 'materials', achievedPoints: 2 }),
      makeCredit({ id: '5', category: 'land_use_ecology', achievedPoints: 2 }),
      // Extra credits to reach 30 total = 3 Star normally
      makeCredit({ id: '6', category: 'management', achievedPoints: 10 }),
      makeCredit({ id: '7', category: 'transport', achievedPoints: 8 }),
    ];
    // Total = 30 → normally 3 Star, but minimums not met → 2 Star
    const result = calculateGreenStarResult(credits, 'office_v1');
    expect(result.categoryMinimumsMet).toBe(false);
    expect(result.starRating).toBe(2);
  });

  it('does not reduce star rating below 0', () => {
    const credits: Credit[] = [
      makeCredit({ id: '1', category: 'energy', achievedPoints: 5 }),
      makeCredit({ id: '2', category: 'water', achievedPoints: 5 }),
    ];
    // Total = 10 → 1 Star normally, but if minimums unmet → 0 Star
    const result = calculateGreenStarResult(credits, 'office_v1');
    expect(result.starRating).toBe(0);
  });

  it('keeps star rating when category minimums are met', () => {
    const credits: Credit[] = [
      makeCredit({ id: '1', category: 'energy', achievedPoints: 10 }),
      makeCredit({ id: '2', category: 'water', achievedPoints: 5 }),
      makeCredit({ id: '3', category: 'ieq', achievedPoints: 5 }),
      makeCredit({ id: '4', category: 'materials', achievedPoints: 5 }),
      makeCredit({ id: '5', category: 'land_use_ecology', achievedPoints: 5 }),
      makeCredit({ id: '6', category: 'management', achievedPoints: 15 }),
      makeCredit({ id: '7', category: 'transport', achievedPoints: 15 }),
    ];
    // Total = 60 → 5 Star, all minimums met
    const result = calculateGreenStarResult(credits, 'office_v1');
    expect(result.categoryMinimumsMet).toBe(true);
    expect(result.starRating).toBe(5);
  });

  it('includes unmet minimums list in the result', () => {
    const credits: Credit[] = [
      makeCredit({ id: '1', category: 'energy', achievedPoints: 1 }),
    ];
    const result = calculateGreenStarResult(credits, 'office_v1');
    expect(result.unmetMinimums.length).toBeGreaterThan(0);
    const energyUnmet = result.unmetMinimums.find((u) => u.category === 'energy');
    expect(energyUnmet).toBeDefined();
    expect(energyUnmet!.required).toBe(4);
    expect(energyUnmet!.achieved).toBe(1);
  });

  it('includes ratingTool and credits in the result', () => {
    const credits: Credit[] = [makeCredit()];
    const result = calculateGreenStarResult(credits, 'retail_v1');
    expect(result.ratingTool).toBe('retail_v1');
    expect(result.credits).toBe(credits);
  });

  it('handles empty credits array', () => {
    const result = calculateGreenStarResult([], 'custom');
    expect(result.totalTargeted).toBe(0);
    expect(result.totalAchieved).toBe(0);
    expect(result.starRating).toBe(0);
    expect(result.categoryMinimumsMet).toBe(true);
  });
});

// ─── identifyAtRiskCredits ───────────────────────────────────────────────────

describe('identifyAtRiskCredits', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty array when review date is beyond threshold', () => {
    // Set "now" to Jan 1, 2025
    vi.setSystemTime(new Date('2025-01-01'));

    const credits: Credit[] = [
      makeCredit({ targetedPoints: 5, evidenceStatus: 'not_started' }),
    ];
    // Review date is 60 days away, threshold is 30 days
    const result = identifyAtRiskCredits(credits, '2025-03-02', 30);
    expect(result).toHaveLength(0);
  });

  it('returns credits with not_started evidence within threshold', () => {
    vi.setSystemTime(new Date('2025-01-01'));

    const credits: Credit[] = [
      makeCredit({ id: '1', targetedPoints: 5, evidenceStatus: 'not_started' }),
      makeCredit({ id: '2', targetedPoints: 3, evidenceStatus: 'verified' }),
    ];
    // Review date is 20 days away, threshold is 30 days
    const result = identifyAtRiskCredits(credits, '2025-01-21', 30);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('returns credits with in_progress evidence within threshold', () => {
    vi.setSystemTime(new Date('2025-01-01'));

    const credits: Credit[] = [
      makeCredit({ id: '1', targetedPoints: 5, evidenceStatus: 'in_progress' }),
    ];
    const result = identifyAtRiskCredits(credits, '2025-01-15', 30);
    expect(result).toHaveLength(1);
  });

  it('excludes credits with submitted or verified evidence', () => {
    vi.setSystemTime(new Date('2025-01-01'));

    const credits: Credit[] = [
      makeCredit({ id: '1', targetedPoints: 5, evidenceStatus: 'submitted' }),
      makeCredit({ id: '2', targetedPoints: 5, evidenceStatus: 'verified' }),
    ];
    const result = identifyAtRiskCredits(credits, '2025-01-15', 30);
    expect(result).toHaveLength(0);
  });

  it('excludes credits with targetedPoints of 0 (not being pursued)', () => {
    vi.setSystemTime(new Date('2025-01-01'));

    const credits: Credit[] = [
      makeCredit({ id: '1', targetedPoints: 0, evidenceStatus: 'not_started' }),
    ];
    const result = identifyAtRiskCredits(credits, '2025-01-15', 30);
    expect(result).toHaveLength(0);
  });

  it('identifies multiple at-risk credits', () => {
    vi.setSystemTime(new Date('2025-01-01'));

    const credits: Credit[] = [
      makeCredit({ id: '1', targetedPoints: 5, evidenceStatus: 'not_started' }),
      makeCredit({ id: '2', targetedPoints: 3, evidenceStatus: 'in_progress' }),
      makeCredit({ id: '3', targetedPoints: 2, evidenceStatus: 'verified' }),
    ];
    const result = identifyAtRiskCredits(credits, '2025-01-20', 30);
    expect(result).toHaveLength(2);
  });

  it('includes credits when review date is exactly at threshold boundary', () => {
    vi.setSystemTime(new Date('2025-01-01'));

    const credits: Credit[] = [
      makeCredit({ id: '1', targetedPoints: 5, evidenceStatus: 'not_started' }),
    ];
    // 30 days from now = Jan 31 — at the threshold boundary
    const result = identifyAtRiskCredits(credits, '2025-01-31', 30);
    expect(result).toHaveLength(1);
  });

  it('handles review date in the past (all targeted credits are at risk)', () => {
    vi.setSystemTime(new Date('2025-02-01'));

    const credits: Credit[] = [
      makeCredit({ id: '1', targetedPoints: 5, evidenceStatus: 'not_started' }),
      makeCredit({ id: '2', targetedPoints: 3, evidenceStatus: 'in_progress' }),
    ];
    // Review date already passed
    const result = identifyAtRiskCredits(credits, '2025-01-15', 30);
    expect(result).toHaveLength(2);
  });
});

// ─── CATEGORY_MINIMUMS constant validation ───────────────────────────────────

describe('CATEGORY_MINIMUMS', () => {
  it('defines minimums for all 4 standard rating tools', () => {
    expect(CATEGORY_MINIMUMS.office_v1).toBeDefined();
    expect(CATEGORY_MINIMUMS.residential_v1).toBeDefined();
    expect(CATEGORY_MINIMUMS.retail_v1).toBeDefined();
    expect(CATEGORY_MINIMUMS.public_education_v1).toBeDefined();
  });

  it('office_v1 has correct minimum values', () => {
    expect(CATEGORY_MINIMUMS.office_v1.energy).toBe(4);
    expect(CATEGORY_MINIMUMS.office_v1.water).toBe(3);
    expect(CATEGORY_MINIMUMS.office_v1.ieq).toBe(3);
    expect(CATEGORY_MINIMUMS.office_v1.materials).toBe(2);
    expect(CATEGORY_MINIMUMS.office_v1.land_use_ecology).toBe(2);
  });

  it('residential_v1 has water=4 (higher than office)', () => {
    expect(CATEGORY_MINIMUMS.residential_v1.water).toBe(4);
  });

  it('retail_v1 has energy=5 (higher than office)', () => {
    expect(CATEGORY_MINIMUMS.retail_v1.energy).toBe(5);
  });

  it('public_education_v1 has ieq=4 (higher than office)', () => {
    expect(CATEGORY_MINIMUMS.public_education_v1.ieq).toBe(4);
  });
});
