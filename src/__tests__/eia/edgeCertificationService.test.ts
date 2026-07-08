/**
 * Unit tests for EDGE Certification Service
 * Tests: all EDGE levels, input validation, level transitions, edge cases
 * Requirements: 10.1–10.9
 */

import { describe, it, expect } from 'vitest';
import {
  validateEDGEInput,
  calculateEDGELevel,
  computeEDGEResult,
} from '../../services/eia/edgeCertificationService';
import type { EDGECategoryValue, EDGEStage } from '../../services/eia/eiaTypes';

// ─── Helper Factories ────────────────────────────────────────────────────────

function makeCategory(
  category: EDGECategoryValue['category'],
  percentageSavings: number,
  overrides: Partial<EDGECategoryValue> = {}
): EDGECategoryValue {
  return {
    category,
    baselineValue: 100,
    designedValue: 100 - percentageSavings,
    percentageSavings,
    meetsThreshold: percentageSavings >= 20,
    ...overrides,
  };
}

function makeAllCategories(
  energySavings: number,
  waterSavings: number,
  materialsSavings: number
): EDGECategoryValue[] {
  return [
    makeCategory('energy', energySavings),
    makeCategory('water', waterSavings),
    makeCategory('embodied_energy_materials', materialsSavings),
  ];
}

// ─── validateEDGEInput ───────────────────────────────────────────────────────

describe('validateEDGEInput', () => {
  it('should return true for value at lower bound (0)', () => {
    expect(validateEDGEInput(0)).toBe(true);
  });

  it('should return true for value at upper bound (100)', () => {
    expect(validateEDGEInput(100)).toBe(true);
  });

  it('should return true for value within range', () => {
    expect(validateEDGEInput(50)).toBe(true);
    expect(validateEDGEInput(20)).toBe(true);
    expect(validateEDGEInput(99.5)).toBe(true);
  });

  it('should return false for negative value', () => {
    expect(validateEDGEInput(-1)).toBe(false);
    expect(validateEDGEInput(-0.01)).toBe(false);
  });

  it('should return false for value exceeding 100', () => {
    expect(validateEDGEInput(101)).toBe(false);
    expect(validateEDGEInput(100.01)).toBe(false);
  });

  it('should return false for NaN', () => {
    expect(validateEDGEInput(NaN)).toBe(false);
  });
});

// ─── calculateEDGELevel ──────────────────────────────────────────────────────

describe('calculateEDGELevel', () => {
  describe('not_eligible', () => {
    it('should return not_eligible when any category is below 20%', () => {
      const categories = makeAllCategories(25, 15, 30);
      expect(calculateEDGELevel(categories)).toBe('not_eligible');
    });

    it('should return not_eligible when all categories are below 20%', () => {
      const categories = makeAllCategories(10, 5, 19);
      expect(calculateEDGELevel(categories)).toBe('not_eligible');
    });

    it('should return not_eligible when energy is exactly 19%', () => {
      const categories = makeAllCategories(19, 30, 40);
      expect(calculateEDGELevel(categories)).toBe('not_eligible');
    });

    it('should return not_eligible for empty categories array', () => {
      expect(calculateEDGELevel([])).toBe('not_eligible');
    });

    it('should return not_eligible when one category is 0%', () => {
      const categories = makeAllCategories(50, 50, 0);
      expect(calculateEDGELevel(categories)).toBe('not_eligible');
    });
  });

  describe('edge_certified', () => {
    it('should return edge_certified when all categories are exactly 20%', () => {
      const categories = makeAllCategories(20, 20, 20);
      expect(calculateEDGELevel(categories)).toBe('edge_certified');
    });

    it('should return edge_certified when all categories between 20-39%', () => {
      const categories = makeAllCategories(25, 30, 35);
      expect(calculateEDGELevel(categories)).toBe('edge_certified');
    });

    it('should return edge_certified when some categories ≥40% but not all', () => {
      const categories = makeAllCategories(45, 25, 50);
      expect(calculateEDGELevel(categories)).toBe('edge_certified');
    });

    it('should return edge_certified at boundary: one category exactly 39%', () => {
      const categories = makeAllCategories(40, 39, 40);
      expect(calculateEDGELevel(categories)).toBe('edge_certified');
    });
  });

  describe('edge_advanced', () => {
    it('should return edge_advanced when all categories are exactly 40%', () => {
      const categories = makeAllCategories(40, 40, 40);
      expect(calculateEDGELevel(categories)).toBe('edge_advanced');
    });

    it('should return edge_advanced when all categories ≥40% but energy < 100%', () => {
      const categories = makeAllCategories(60, 50, 45);
      expect(calculateEDGELevel(categories)).toBe('edge_advanced');
    });

    it('should return edge_advanced when energy is 99%', () => {
      const categories = makeAllCategories(99, 50, 50);
      expect(calculateEDGELevel(categories)).toBe('edge_advanced');
    });
  });

  describe('edge_zero_carbon', () => {
    it('should return edge_zero_carbon when all ≥40% and energy is 100%', () => {
      const categories = makeAllCategories(100, 50, 45);
      expect(calculateEDGELevel(categories)).toBe('edge_zero_carbon');
    });

    it('should return edge_zero_carbon when all categories are 100%', () => {
      const categories = makeAllCategories(100, 100, 100);
      expect(calculateEDGELevel(categories)).toBe('edge_zero_carbon');
    });

    it('should return edge_zero_carbon at minimum threshold: energy 100%, others exactly 40%', () => {
      const categories = makeAllCategories(100, 40, 40);
      expect(calculateEDGELevel(categories)).toBe('edge_zero_carbon');
    });
  });

  describe('level transitions (category value changes)', () => {
    it('should downgrade from edge_certified to not_eligible when a category drops below 20%', () => {
      // Start at certified level
      const certified = makeAllCategories(25, 30, 25);
      expect(calculateEDGELevel(certified)).toBe('edge_certified');

      // Water drops below threshold
      const downgraded = makeAllCategories(25, 18, 25);
      expect(calculateEDGELevel(downgraded)).toBe('not_eligible');
    });

    it('should downgrade from edge_advanced to edge_certified when a category drops below 40%', () => {
      const advanced = makeAllCategories(50, 45, 60);
      expect(calculateEDGELevel(advanced)).toBe('edge_advanced');

      const downgraded = makeAllCategories(50, 35, 60);
      expect(calculateEDGELevel(downgraded)).toBe('edge_certified');
    });

    it('should downgrade from edge_zero_carbon to edge_advanced when energy drops below 100%', () => {
      const zeroCar = makeAllCategories(100, 50, 50);
      expect(calculateEDGELevel(zeroCar)).toBe('edge_zero_carbon');

      const downgraded = makeAllCategories(95, 50, 50);
      expect(calculateEDGELevel(downgraded)).toBe('edge_advanced');
    });

    it('should upgrade from not_eligible to edge_certified when all reach 20%', () => {
      const notEligible = makeAllCategories(20, 19, 25);
      expect(calculateEDGELevel(notEligible)).toBe('not_eligible');

      const certified = makeAllCategories(20, 20, 25);
      expect(calculateEDGELevel(certified)).toBe('edge_certified');
    });
  });
});

// ─── computeEDGEResult ───────────────────────────────────────────────────────

describe('computeEDGEResult', () => {
  it('should return correct result with pass/fail per category', () => {
    const categories = makeAllCategories(25, 15, 30);
    const result = computeEDGEResult(categories, 'preliminary_design');

    expect(result.level).toBe('not_eligible');
    expect(result.stage).toBe('preliminary_design');
    expect(result.allCategoriesValid).toBe(false);
    expect(result.lastUpdated).toBeDefined();

    // Check individual category meetsThreshold
    const energyCat = result.categories.find(c => c.category === 'energy');
    const waterCat = result.categories.find(c => c.category === 'water');
    const matCat = result.categories.find(c => c.category === 'embodied_energy_materials');

    expect(energyCat?.meetsThreshold).toBe(true); // 25% ≥ 20%
    expect(waterCat?.meetsThreshold).toBe(false); // 15% < 20%
    expect(matCat?.meetsThreshold).toBe(true); // 30% ≥ 20%
  });

  it('should return allCategoriesValid true when all meet threshold', () => {
    const categories = makeAllCategories(30, 25, 22);
    const result = computeEDGEResult(categories, 'post_construction');

    expect(result.allCategoriesValid).toBe(true);
    expect(result.level).toBe('edge_certified');
    expect(result.stage).toBe('post_construction');
  });

  it('should set correct level for advanced', () => {
    const categories = makeAllCategories(50, 45, 60);
    const result = computeEDGEResult(categories, 'certified');

    expect(result.level).toBe('edge_advanced');
    expect(result.allCategoriesValid).toBe(true);
  });

  it('should set correct level for zero carbon', () => {
    const categories = makeAllCategories(100, 50, 45);
    const result = computeEDGEResult(categories, 'certified');

    expect(result.level).toBe('edge_zero_carbon');
    expect(result.allCategoriesValid).toBe(true);
  });

  it('should update meetsThreshold even if incoming value is incorrect', () => {
    // Provide categories where meetsThreshold is wrong
    const categories: EDGECategoryValue[] = [
      { category: 'energy', baselineValue: 100, designedValue: 80, percentageSavings: 20, meetsThreshold: false },
      { category: 'water', baselineValue: 100, designedValue: 85, percentageSavings: 15, meetsThreshold: true },
      { category: 'embodied_energy_materials', baselineValue: 100, designedValue: 70, percentageSavings: 30, meetsThreshold: false },
    ];

    const result = computeEDGEResult(categories, 'preliminary_design');

    // meetsThreshold should be recalculated
    const energyCat = result.categories.find(c => c.category === 'energy');
    const waterCat = result.categories.find(c => c.category === 'water');
    const matCat = result.categories.find(c => c.category === 'embodied_energy_materials');

    expect(energyCat?.meetsThreshold).toBe(true);  // 20% ≥ 20%
    expect(waterCat?.meetsThreshold).toBe(false);  // 15% < 20%
    expect(matCat?.meetsThreshold).toBe(true);     // 30% ≥ 20%
  });

  it('should include a valid ISO timestamp in lastUpdated', () => {
    const categories = makeAllCategories(20, 20, 20);
    const result = computeEDGEResult(categories, 'preliminary_design');

    const parsed = new Date(result.lastUpdated);
    expect(parsed.getTime()).not.toBeNaN();
  });

  it('should handle empty categories as not_eligible', () => {
    const result = computeEDGEResult([], 'preliminary_design');

    expect(result.level).toBe('not_eligible');
    expect(result.allCategoriesValid).toBe(false);
    expect(result.categories).toHaveLength(0);
  });
});
