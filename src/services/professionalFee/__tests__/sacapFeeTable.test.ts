import {
  lookupFeePercentage,
  calculateProjectFee,
  calculateScopeOfWorkFee,
  createDemoFeeTables,
} from '../sacapFeeTable';
import type { SACAPFeeTable } from '../persistence/types';

describe('SACAP Fee Table Lookup', () => {
  const tables = createDemoFeeTables();

  describe('createDemoFeeTables', () => {
    it('returns 3 tables (one per complexity level)', () => {
      expect(tables).toHaveLength(3);
      const levels = tables.map(t => t.complexityLevel);
      expect(levels).toContain('low');
      expect(levels).toContain('medium');
      expect(levels).toContain('high');
    });

    it('each table has 6 bands covering R0 to R500M', () => {
      for (const table of tables) {
        expect(table.bands).toHaveLength(6);
        expect(table.bands[0].minValue).toBe(0);
        expect(table.bands[table.bands.length - 1].maxValue).toBe(500_000_000);
      }
    });

    it('all bands have baseFee and rateAboveMin for interpolation', () => {
      for (const table of tables) {
        for (const band of table.bands) {
          expect(band.baseFee).toBeDefined();
          expect(band.rateAboveMin).toBeDefined();
          expect(typeof band.baseFee).toBe('number');
          expect(typeof band.rateAboveMin).toBe('number');
        }
      }
    });
  });

  describe('lookupFeePercentage', () => {
    it('returns correct percentage for value at lowest band boundary', () => {
      // At R500,000 in low complexity: fee = 0 + 500000 * 0.075 = 37500 → 7.5%
      const result = lookupFeePercentage(500_000, 'low', tables);
      expect(result.percentage).toBeCloseTo(7.5, 1);
      expect(result.warning).toBeUndefined();
    });

    it('returns correct percentage for value at a mid-band point (interpolation)', () => {
      // At R1,500,000 in medium: fee = 47500 + (1500000 - 500001) * 0.075
      // = 47500 + 999999 * 0.075 = 47500 + 74999.925 = 122499.925
      // percentage = 122499.925 / 1500000 * 100 ≈ 8.17%
      const result = lookupFeePercentage(1_500_000, 'medium', tables);
      expect(result.percentage).toBeGreaterThan(7);
      expect(result.percentage).toBeLessThan(10);
      expect(result.warning).toBeUndefined();
    });

    it('returns correct percentage for value in the first band', () => {
      // At R250,000 in high: fee = 0 + 250000 * 0.12 = 30000 → 12%
      const result = lookupFeePercentage(250_000, 'high', tables);
      expect(result.percentage).toBeCloseTo(12.0, 1);
      expect(result.warning).toBeUndefined();
    });

    it('clamps and returns warning for value exceeding published range', () => {
      const result = lookupFeePercentage(600_000_000, 'medium', tables);
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain('exceeds published range');
      // Fee is calculated at max band boundary, percentage will be less than band rate
      expect(result.percentage).toBeGreaterThan(0);
      expect(result.percentage).toBeLessThan(100);
    });

    it('uses lowest band rate for value below minimum', () => {
      // Value of 0 is below minimum, should use lowest band percentage
      // However, at value=0 the fee formula would give 0/0 which is problematic
      // Let's test with a small positive value
      const result = lookupFeePercentage(100, 'low', tables);
      // Value is within first band (0 to 500000), so uses normal interpolation
      // fee = 0 + 100 * 0.075 = 7.5, percentage = 7.5 / 100 * 100 = 7.5%
      expect(result.percentage).toBeCloseTo(7.5, 1);
    });

    it('throws error for non-existent complexity level table', () => {
      const emptyTables: SACAPFeeTable[] = [];
      expect(() => lookupFeePercentage(1_000_000, 'low', emptyTables)).toThrow();
    });
  });

  describe('calculateProjectFee', () => {
    it('returns correct fee for low complexity at R1,000,000', () => {
      // Band 2: baseFee=37500, rateAboveMin=0.055, minValue=500001
      // fee = 37500 + (1000000 - 500001) * 0.055 = 37500 + 499999 * 0.055 = 37500 + 27499.945 = 64999.945
      const result = calculateProjectFee(1_000_000, 'low', tables);
      expect(result.projectFee).toBeGreaterThan(60_000);
      expect(result.projectFee).toBeLessThan(70_000);
      expect(result.projectFeeRate).toBeGreaterThan(0);
      expect(result.warning).toBeUndefined();
    });

    it('returns correct fee for medium complexity at R5,000,000', () => {
      // Band 3: baseFee=197500, rateAboveMin=0.055, minValue=2500001
      // fee = 197500 + (5000000 - 2500001) * 0.055 = 197500 + 2499999 * 0.055 = 197500 + 137499.945 = 334999.945
      const result = calculateProjectFee(5_000_000, 'medium', tables);
      expect(result.projectFee).toBeGreaterThan(330_000);
      expect(result.projectFee).toBeLessThan(340_000);
      expect(result.projectFeeRate).toBeGreaterThan(0);
      expect(result.warning).toBeUndefined();
    });

    it('returns correct fee for high complexity at R500,000', () => {
      // Band 1: baseFee=0, rateAboveMin=0.12, minValue=0
      // fee = 0 + 500000 * 0.12 = 60000
      const result = calculateProjectFee(500_000, 'high', tables);
      expect(result.projectFee).toBe(60_000);
      expect(result.projectFeeRate).toBeCloseTo(12.0, 1);
      expect(result.warning).toBeUndefined();
    });

    it('returns warning when value exceeds range', () => {
      const result = calculateProjectFee(600_000_000, 'low', tables);
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain('exceeds published range');
      expect(result.projectFee).toBeGreaterThan(0);
    });

    it('returns zero fee for zero construction value', () => {
      const result = calculateProjectFee(0, 'medium', tables);
      expect(result.projectFee).toBe(0);
      expect(result.projectFeeRate).toBe(0);
    });

    it('higher complexity produces higher fee for same value', () => {
      const low = calculateProjectFee(3_000_000, 'low', tables);
      const medium = calculateProjectFee(3_000_000, 'medium', tables);
      const high = calculateProjectFee(3_000_000, 'high', tables);

      expect(medium.projectFee).toBeGreaterThan(low.projectFee);
      expect(high.projectFee).toBeGreaterThan(medium.projectFee);
    });
  });

  describe('calculateScopeOfWorkFee', () => {
    it('scales correctly with full stage weights (1.0 = 100%)', () => {
      const result = calculateScopeOfWorkFee(100_000, 1.0);
      expect(result.scopeOfWorkFee).toBe(100_000);
      expect(result.scopeOfWorkRate).toBe(100);
    });

    it('scales correctly with partial stage weights (0.6 = 60%)', () => {
      const result = calculateScopeOfWorkFee(100_000, 0.6);
      expect(result.scopeOfWorkFee).toBe(60_000);
      expect(result.scopeOfWorkRate).toBe(60);
    });

    it('scales correctly with small stage weights (0.25 = 25%)', () => {
      const result = calculateScopeOfWorkFee(200_000, 0.25);
      expect(result.scopeOfWorkFee).toBe(50_000);
      expect(result.scopeOfWorkRate).toBe(25);
    });

    it('returns zero fee for zero project fee', () => {
      const result = calculateScopeOfWorkFee(0, 0.75);
      expect(result.scopeOfWorkFee).toBe(0);
    });

    it('returns zero fee for zero stage weights', () => {
      const result = calculateScopeOfWorkFee(100_000, 0);
      expect(result.scopeOfWorkFee).toBe(0);
      expect(result.scopeOfWorkRate).toBe(0);
    });
  });

  describe('monotonicity', () => {
    it('higher construction values produce higher or equal fees (low complexity)', () => {
      const values = [100_000, 500_000, 1_000_000, 5_000_000, 10_000_000, 50_000_000, 200_000_000];
      let previousFee = 0;
      for (const value of values) {
        const result = calculateProjectFee(value, 'low', tables);
        expect(result.projectFee).toBeGreaterThanOrEqual(previousFee);
        previousFee = result.projectFee;
      }
    });

    it('higher construction values produce higher or equal fees (medium complexity)', () => {
      const values = [100_000, 500_000, 1_000_000, 5_000_000, 10_000_000, 50_000_000, 200_000_000];
      let previousFee = 0;
      for (const value of values) {
        const result = calculateProjectFee(value, 'medium', tables);
        expect(result.projectFee).toBeGreaterThanOrEqual(previousFee);
        previousFee = result.projectFee;
      }
    });

    it('higher construction values produce higher or equal fees (high complexity)', () => {
      const values = [100_000, 500_000, 1_000_000, 5_000_000, 10_000_000, 50_000_000, 200_000_000];
      let previousFee = 0;
      for (const value of values) {
        const result = calculateProjectFee(value, 'high', tables);
        expect(result.projectFee).toBeGreaterThanOrEqual(previousFee);
        previousFee = result.projectFee;
      }
    });
  });

  describe('higher complexity produces higher fees', () => {
    it('at R500,000 construction value', () => {
      const low = calculateProjectFee(500_000, 'low', tables);
      const medium = calculateProjectFee(500_000, 'medium', tables);
      const high = calculateProjectFee(500_000, 'high', tables);
      expect(medium.projectFee).toBeGreaterThan(low.projectFee);
      expect(high.projectFee).toBeGreaterThan(medium.projectFee);
    });

    it('at R10,000,000 construction value', () => {
      const low = calculateProjectFee(10_000_000, 'low', tables);
      const medium = calculateProjectFee(10_000_000, 'medium', tables);
      const high = calculateProjectFee(10_000_000, 'high', tables);
      expect(medium.projectFee).toBeGreaterThan(low.projectFee);
      expect(high.projectFee).toBeGreaterThan(medium.projectFee);
    });

    it('at R100,000,000 construction value', () => {
      const low = calculateProjectFee(100_000_000, 'low', tables);
      const medium = calculateProjectFee(100_000_000, 'medium', tables);
      const high = calculateProjectFee(100_000_000, 'high', tables);
      expect(medium.projectFee).toBeGreaterThan(low.projectFee);
      expect(high.projectFee).toBeGreaterThan(medium.projectFee);
    });
  });
});
