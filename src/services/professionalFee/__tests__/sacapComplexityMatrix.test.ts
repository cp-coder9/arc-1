import {
  lookupComplexity,
  getCategories,
  getTypesForCategory,
  getMatrix,
  createDemoMatrix,
} from '../sacapComplexityMatrix';

describe('SACAP Complexity Matrix', () => {
  const matrix = createDemoMatrix();

  describe('createDemoMatrix', () => {
    it('returns a valid SACAPComplexityMatrix with categories array', () => {
      const m = createDemoMatrix();
      expect(m).toBeDefined();
      expect(m.categories).toBeDefined();
      expect(Array.isArray(m.categories)).toBe(true);
    });

    it('returns a fresh instance each call (not shared reference)', () => {
      const m1 = createDemoMatrix();
      const m2 = createDemoMatrix();
      expect(m1).not.toBe(m2);
      expect(m1).toEqual(m2);
    });
  });

  describe('getCategories', () => {
    it('returns all 9 seeded categories', () => {
      const categories = getCategories(matrix);
      expect(categories).toHaveLength(9);
      const names = categories.map(c => c.name);
      expect(names).toContain('Residential Domestic');
      expect(names).toContain('Residential Multi-Unit');
      expect(names).toContain('Commercial');
      expect(names).toContain('Industrial');
      expect(names).toContain('Medical Social Services');
      expect(names).toContain('Educational');
      expect(names).toContain('Recreational');
      expect(names).toContain('Religious');
      expect(names).toContain('Agricultural');
    });

    it('returns objects with id and name only', () => {
      const categories = getCategories(matrix);
      for (const cat of categories) {
        expect(Object.keys(cat).sort()).toEqual(['id', 'name']);
      }
    });
  });

  describe('getTypesForCategory', () => {
    it('returns types for a valid category', () => {
      const types = getTypesForCategory(matrix, 'medical-social-services');
      expect(types.length).toBeGreaterThanOrEqual(3);
      const names = types.map(t => t.name);
      expect(names).toContain('General hospitals');
      expect(names).toContain('Clinics');
      expect(names).toContain('Day care centres');
    });

    it('returns empty array for invalid category', () => {
      const types = getTypesForCategory(matrix, 'nonexistent-category');
      expect(types).toEqual([]);
    });

    it('each type has a valid complexity level', () => {
      const categories = getCategories(matrix);
      for (const cat of categories) {
        const types = getTypesForCategory(matrix, cat.id);
        for (const type of types) {
          expect(['low', 'medium', 'high']).toContain(type.complexityLevel);
        }
      }
    });

    it('every category has at least 3 types', () => {
      const categories = getCategories(matrix);
      for (const cat of categories) {
        const types = getTypesForCategory(matrix, cat.id);
        expect(types.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe('lookupComplexity', () => {
    it('returns correct complexity for known low-complexity pairs', () => {
      expect(lookupComplexity(matrix, 'residential-domestic', 'rd-low-cost')).toBe('low');
      expect(lookupComplexity(matrix, 'industrial', 'ind-warehouse')).toBe('low');
      expect(lookupComplexity(matrix, 'recreational', 'rec-community-hall')).toBe('low');
    });

    it('returns correct complexity for known medium-complexity pairs', () => {
      expect(lookupComplexity(matrix, 'residential-domestic', 'rd-townhouse')).toBe('medium');
      expect(lookupComplexity(matrix, 'residential-multi-unit', 'rmu-walk-up')).toBe('medium');
      expect(lookupComplexity(matrix, 'medical-social-services', 'med-clinic')).toBe('medium');
    });

    it('returns correct complexity for known high-complexity pairs', () => {
      expect(lookupComplexity(matrix, 'residential-domestic', 'rd-custom')).toBe('high');
      expect(lookupComplexity(matrix, 'medical-social-services', 'med-general-hospital')).toBe('high');
      expect(lookupComplexity(matrix, 'recreational', 'rec-stadium')).toBe('high');
    });

    it('returns a valid level for every known (category, type) pair', () => {
      for (const cat of matrix.categories) {
        for (const type of cat.types) {
          const result = lookupComplexity(matrix, cat.id, type.id);
          expect(result).not.toBeNull();
          expect(['low', 'medium', 'high']).toContain(result);
        }
      }
    });

    it('returns null for invalid category', () => {
      expect(lookupComplexity(matrix, 'invalid-category', 'rd-single-dwelling')).toBeNull();
    });

    it('returns null for invalid type within valid category', () => {
      expect(lookupComplexity(matrix, 'residential-domestic', 'invalid-type')).toBeNull();
    });

    it('returns null for mismatched category-type pair', () => {
      expect(lookupComplexity(matrix, 'commercial', 'med-general-hospital')).toBeNull();
    });

    it('is deterministic - same input always returns same output', () => {
      const result1 = lookupComplexity(matrix, 'commercial', 'com-mixed-high-rise');
      const result2 = lookupComplexity(matrix, 'commercial', 'com-mixed-high-rise');
      expect(result1).toBe(result2);
      expect(result1).toBe('high');
    });
  });

  describe('no duplicate IDs', () => {
    it('all category IDs are unique', () => {
      const ids = matrix.categories.map(c => c.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });

    it('all type IDs across all categories are unique', () => {
      const allIds = new Set();
      for (const cat of matrix.categories) {
        for (const type of cat.types) {
          expect(allIds.has(type.id)).toBe(false);
          allIds.add(type.id);
        }
      }
    });
  });

  describe('getMatrix (module-level convenience)', () => {
    it('returns the full matrix structure', () => {
      const m = getMatrix();
      expect(m.categories).toBeDefined();
      expect(m.categories.length).toBe(9);
    });

    it('is consistent with createDemoMatrix', () => {
      const m = getMatrix();
      expect(m).toEqual(createDemoMatrix());
    });
  });
});
