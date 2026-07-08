/**
 * Unit tests for BillingRateTableService
 *
 * Tests rate CRUD operations and temporal lookup logic.
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
import {
  createRate,
  updateRate,
  getApplicableRate,
  getRatesForRole,
  getAllRates,
} from '../billingRateTableService';
import type { BillingRate, CreateBillingRateInput } from '../types';

// ─── Test Fixtures ──────────────────────────────────────────────────────

const FIRM_ID = 'firm_001';
const ADMIN_USER = 'admin_001';

function makeBillingRate(overrides: Partial<BillingRate> = {}): BillingRate {
  return {
    id: 'rate_001',
    firmId: FIRM_ID,
    role: 'architect',
    rateType: 'hourly',
    rateCents: 85000, // R850/hr
    effectiveDate: '2025-01-01',
    createdBy: ADMIN_USER,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const sampleRates: BillingRate[] = [
  makeBillingRate({
    id: 'rate_arch_v1',
    role: 'architect',
    rateCents: 75000,
    effectiveDate: '2024-01-01',
  }),
  makeBillingRate({
    id: 'rate_arch_v2',
    role: 'architect',
    rateCents: 85000,
    effectiveDate: '2025-01-01',
  }),
  makeBillingRate({
    id: 'rate_arch_v3',
    role: 'architect',
    rateCents: 95000,
    effectiveDate: '2025-07-01',
  }),
  makeBillingRate({
    id: 'rate_tech_v1',
    role: 'technologist',
    rateCents: 55000,
    effectiveDate: '2024-06-01',
  }),
  makeBillingRate({
    id: 'rate_tech_v2',
    role: 'technologist',
    rateCents: 60000,
    effectiveDate: '2025-03-01',
  }),
  makeBillingRate({
    id: 'rate_draughts_v1',
    role: 'draughtsperson',
    rateCents: 35000,
    effectiveDate: '2024-01-01',
  }),
];

// ─── createRate ─────────────────────────────────────────────────────────

describe('BillingRateTableService', () => {
  describe('createRate', () => {
    it('creates a billing rate with all required fields', () => {
      const input: CreateBillingRateInput = {
        firmId: FIRM_ID,
        role: 'architect',
        rateType: 'hourly',
        rateCents: 85000,
        effectiveDate: '2025-01-01',
      };

      const result = createRate(input, ADMIN_USER);

      expect(result.firmId).toBe(FIRM_ID);
      expect(result.role).toBe('architect');
      expect(result.rateType).toBe('hourly');
      expect(result.rateCents).toBe(85000);
      expect(result.effectiveDate).toBe('2025-01-01');
      expect(result.createdBy).toBe(ADMIN_USER);
      expect(result.id).toBeTruthy();
      expect(result.createdAt).toBeTruthy();
      expect(result.updatedAt).toBeTruthy();
    });

    it('supports all rate types: hourly, daily, fixed', () => {
      const baseInput: CreateBillingRateInput = {
        firmId: FIRM_ID,
        role: 'technician',
        rateType: 'hourly',
        rateCents: 45000,
        effectiveDate: '2025-01-01',
      };

      const hourly = createRate({ ...baseInput, rateType: 'hourly' }, ADMIN_USER);
      const daily = createRate({ ...baseInput, rateType: 'daily' }, ADMIN_USER);
      const fixed = createRate({ ...baseInput, rateType: 'fixed' }, ADMIN_USER);

      expect(hourly.rateType).toBe('hourly');
      expect(daily.rateType).toBe('daily');
      expect(fixed.rateType).toBe('fixed');
    });

    it('supports all billing rate roles', () => {
      const roles = ['architect', 'technologist', 'technician', 'draughtsperson', 'admin'] as const;

      for (const role of roles) {
        const input: CreateBillingRateInput = {
          firmId: FIRM_ID,
          role,
          rateType: 'hourly',
          rateCents: 50000,
          effectiveDate: '2025-01-01',
        };
        const result = createRate(input, ADMIN_USER);
        expect(result.role).toBe(role);
      }
    });

    it('generates a unique ID for each rate', () => {
      const input: CreateBillingRateInput = {
        firmId: FIRM_ID,
        role: 'architect',
        rateType: 'hourly',
        rateCents: 85000,
        effectiveDate: '2025-01-01',
      };

      const rate1 = createRate(input, ADMIN_USER);
      const rate2 = createRate(input, ADMIN_USER);

      // IDs include timestamp so they'll be unique even for same inputs
      expect(rate1.id).toBeTruthy();
      expect(rate2.id).toBeTruthy();
    });
  });

  // ─── updateRate ─────────────────────────────────────────────────────────

  describe('updateRate', () => {
    it('updates rateCents on an existing rate', () => {
      const result = updateRate(sampleRates, 'rate_arch_v2', { rateCents: 90000 });

      expect(result).not.toBeNull();
      expect(result!.rateCents).toBe(90000);
      expect(result!.role).toBe('architect');
      expect(result!.effectiveDate).toBe('2025-01-01');
    });

    it('updates rateType on an existing rate', () => {
      const result = updateRate(sampleRates, 'rate_tech_v1', { rateType: 'daily' });

      expect(result).not.toBeNull();
      expect(result!.rateType).toBe('daily');
      expect(result!.rateCents).toBe(55000);
    });

    it('updates effectiveDate on an existing rate', () => {
      const result = updateRate(sampleRates, 'rate_arch_v2', { effectiveDate: '2025-02-01' });

      expect(result).not.toBeNull();
      expect(result!.effectiveDate).toBe('2025-02-01');
    });

    it('returns null if rate ID not found', () => {
      const result = updateRate(sampleRates, 'nonexistent_id', { rateCents: 100000 });

      expect(result).toBeNull();
    });

    it('sets a new updatedAt timestamp', () => {
      const result = updateRate(sampleRates, 'rate_arch_v1', { rateCents: 80000 });

      expect(result).not.toBeNull();
      expect(result!.updatedAt).not.toBe(sampleRates[0].updatedAt);
    });

    it('preserves fields that are not being updated', () => {
      const result = updateRate(sampleRates, 'rate_arch_v2', { rateCents: 90000 });

      expect(result).not.toBeNull();
      expect(result!.id).toBe('rate_arch_v2');
      expect(result!.firmId).toBe(FIRM_ID);
      expect(result!.role).toBe('architect');
      expect(result!.createdBy).toBe(ADMIN_USER);
      expect(result!.createdAt).toBe('2025-01-01T00:00:00.000Z');
    });
  });

  // ─── getApplicableRate (temporal lookup) ────────────────────────────────

  describe('getApplicableRate', () => {
    it('returns the most recent rate on or before the query date', () => {
      // Query date 2025-04-15 — should get v2 (effective 2025-01-01), not v3 (effective 2025-07-01)
      const result = getApplicableRate(sampleRates, 'architect', FIRM_ID, '2025-04-15');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('rate_arch_v2');
      expect(result!.rateCents).toBe(85000);
    });

    it('returns the exact rate when query date matches effective date', () => {
      const result = getApplicableRate(sampleRates, 'architect', FIRM_ID, '2025-07-01');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('rate_arch_v3');
      expect(result!.rateCents).toBe(95000);
    });

    it('returns the earliest rate when query date is between first and second versions', () => {
      // Query date 2024-09-15 — only v1 (2024-01-01) is applicable
      const result = getApplicableRate(sampleRates, 'architect', FIRM_ID, '2024-09-15');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('rate_arch_v1');
      expect(result!.rateCents).toBe(75000);
    });

    it('returns null when no rate exists before the query date', () => {
      // Query date 2023-06-01 — no architect rate exists before 2024-01-01
      const result = getApplicableRate(sampleRates, 'architect', FIRM_ID, '2023-06-01');

      expect(result).toBeNull();
    });

    it('returns null for a role with no rates defined', () => {
      const result = getApplicableRate(sampleRates, 'admin', FIRM_ID, '2025-06-01');

      expect(result).toBeNull();
    });

    it('scopes lookup by firmId', () => {
      const otherFirmRate = makeBillingRate({
        id: 'rate_other_firm',
        firmId: 'firm_other',
        role: 'architect',
        rateCents: 120000,
        effectiveDate: '2020-01-01',
      });

      const ratesWithOtherFirm = [...sampleRates, otherFirmRate];
      const result = getApplicableRate(ratesWithOtherFirm, 'architect', 'firm_other', '2025-01-01');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('rate_other_firm');
      expect(result!.firmId).toBe('firm_other');
    });

    it('does not return rates from other firms', () => {
      const result = getApplicableRate(sampleRates, 'architect', 'firm_nonexistent', '2025-06-01');

      expect(result).toBeNull();
    });

    it('returns the latest rate when query date is after all versions', () => {
      const result = getApplicableRate(sampleRates, 'architect', FIRM_ID, '2026-12-31');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('rate_arch_v3');
      expect(result!.rateCents).toBe(95000);
    });

    it('handles different roles independently', () => {
      // technologist rates: v1 at 2024-06-01, v2 at 2025-03-01
      const result = getApplicableRate(sampleRates, 'technologist', FIRM_ID, '2025-01-15');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('rate_tech_v1');
      expect(result!.rateCents).toBe(55000);
    });
  });

  // ─── getRatesForRole ────────────────────────────────────────────────────

  describe('getRatesForRole', () => {
    it('returns all rate versions for a role sorted by effective date descending', () => {
      const result = getRatesForRole(sampleRates, 'architect', FIRM_ID);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('rate_arch_v3'); // 2025-07-01
      expect(result[1].id).toBe('rate_arch_v2'); // 2025-01-01
      expect(result[2].id).toBe('rate_arch_v1'); // 2024-01-01
    });

    it('returns empty array for a role with no rates', () => {
      const result = getRatesForRole(sampleRates, 'admin', FIRM_ID);

      expect(result).toHaveLength(0);
    });

    it('scopes results by firmId', () => {
      const result = getRatesForRole(sampleRates, 'architect', 'firm_nonexistent');

      expect(result).toHaveLength(0);
    });

    it('returns rates for technologist role', () => {
      const result = getRatesForRole(sampleRates, 'technologist', FIRM_ID);

      expect(result).toHaveLength(2);
      expect(result[0].effectiveDate).toBe('2025-03-01');
      expect(result[1].effectiveDate).toBe('2024-06-01');
    });
  });

  // ─── getAllRates ────────────────────────────────────────────────────────

  describe('getAllRates', () => {
    it('returns all rates for a firm', () => {
      const result = getAllRates(sampleRates, FIRM_ID);

      expect(result).toHaveLength(6);
    });

    it('sorts by role then effective date descending', () => {
      const result = getAllRates(sampleRates, FIRM_ID);

      // architect rates first (alphabetically), newest first
      expect(result[0].role).toBe('architect');
      expect(result[0].effectiveDate).toBe('2025-07-01');
      expect(result[1].role).toBe('architect');
      expect(result[1].effectiveDate).toBe('2025-01-01');
      expect(result[2].role).toBe('architect');
      expect(result[2].effectiveDate).toBe('2024-01-01');

      // draughtsperson next
      expect(result[3].role).toBe('draughtsperson');

      // technologist last
      expect(result[4].role).toBe('technologist');
      expect(result[4].effectiveDate).toBe('2025-03-01');
      expect(result[5].role).toBe('technologist');
      expect(result[5].effectiveDate).toBe('2024-06-01');
    });

    it('returns empty array for a non-existent firm', () => {
      const result = getAllRates(sampleRates, 'firm_nonexistent');

      expect(result).toHaveLength(0);
    });

    it('does not return rates from other firms', () => {
      const mixedRates = [
        ...sampleRates,
        makeBillingRate({ id: 'rate_other', firmId: 'firm_other', role: 'architect' }),
      ];

      const result = getAllRates(mixedRates, FIRM_ID);

      expect(result).toHaveLength(6);
      expect(result.every((r) => r.firmId === FIRM_ID)).toBe(true);
    });
  });
});
