/**
 * Tests for Retention Service
 */
import { describe, it, expect } from 'vitest';
import {
  calculateRetention,
  createRetentionRecord,
  releaseRetention,
  scheduleRetentionRelease,
  totalRetentionHeld,
  totalRetentionReleased,
  retentionBalance,
} from '../retentionService';
import type { RetentionRecord } from '../types';

function makeRecord(
  held: number = 50_000,
  released: number = 0,
  status: RetentionRecord['status'] = 'held',
): RetentionRecord {
  return {
    retentionId: 'ret-test-001',
    projectId: 'project-001',
    certificateId: 'cert-001',
    amountHeld: { currency: 'ZAR', amount: held },
    percent: 5,
    scheduledReleaseDate: '2027-01-01T00:00:00.000Z',
    status,
    releasedAmount: { currency: 'ZAR', amount: released },
  };
}

describe('retentionService', () => {
  describe('calculateRetention', () => {
    it('calculates 5% retention', () => {
      const result = calculateRetention(
        { currency: 'ZAR', amount: 1_000_000 },
        5,
      );
      expect(result.amount).toBe(50_000);
    });

    it('rounds to nearest Rand', () => {
      const result = calculateRetention(
        { currency: 'ZAR', amount: 1_000_001 },
        5,
      );
      expect(result.amount).toBe(50_000); // 50000.05 rounds to 50000
    });

    it('throws for invalid percentage', () => {
      expect(() =>
        calculateRetention({ currency: 'ZAR', amount: 1000 }, -1),
      ).toThrow(/between 0 and 100/);
      expect(() =>
        calculateRetention({ currency: 'ZAR', amount: 1000 }, 101),
      ).toThrow(/between 0 and 100/);
    });

    it('returns zero for 0% retention', () => {
      const result = calculateRetention(
        { currency: 'ZAR', amount: 500_000 },
        0,
      );
      expect(result.amount).toBe(0);
    });
  });

  describe('createRetentionRecord', () => {
    it('creates a record with held status', () => {
      const record = createRetentionRecord({
        projectId: 'project-001',
        certificateId: 'cert-001',
        amountHeld: { currency: 'ZAR', amount: 25_000 },
        percent: 5,
      });
      expect(record.status).toBe('held');
      expect(record.amountHeld.amount).toBe(25_000);
      expect(record.releasedAmount.amount).toBe(0);
      expect(record.projectId).toBe('project-001');
    });
  });

  describe('releaseRetention', () => {
    it('partially releases retention', () => {
      const record = makeRecord(50_000);
      const updated = releaseRetention(record, {
        currency: 'ZAR',
        amount: 20_000,
      });
      expect(updated.status).toBe('partially_released');
      expect(updated.releasedAmount.amount).toBe(20_000);
    });

    it('fully releases retention', () => {
      const record = makeRecord(50_000);
      const updated = releaseRetention(record, {
        currency: 'ZAR',
        amount: 50_000,
      });
      expect(updated.status).toBe('fully_released');
      expect(updated.releasedAmount.amount).toBe(50_000);
    });

    it('throws if releasing more than held', () => {
      const record = makeRecord(50_000, 30_000, 'partially_released');
      expect(() =>
        releaseRetention(record, { currency: 'ZAR', amount: 30_000 }),
      ).toThrow(/exceeds remaining retention/);
    });

    it('throws if already fully released', () => {
      const record = makeRecord(50_000, 50_000, 'fully_released');
      expect(() =>
        releaseRetention(record, { currency: 'ZAR', amount: 10_000 }),
      ).toThrow(/already fully released/);
    });
  });

  describe('scheduleRetentionRelease', () => {
    it('sets the scheduled release date', () => {
      const record = makeRecord();
      const updated = scheduleRetentionRelease(record, '2027-06-01T00:00:00.000Z');
      expect(updated.scheduledReleaseDate).toBe('2027-06-01T00:00:00.000Z');
    });
  });

  describe('aggregation functions', () => {
    const records = [
      makeRecord(50_000, 20_000, 'partially_released'),
      makeRecord(30_000, 30_000, 'fully_released'),
      makeRecord(40_000, 0, 'held'),
    ];

    it('totals held amounts', () => {
      expect(totalRetentionHeld(records).amount).toBe(120_000);
    });

    it('totals released amounts', () => {
      expect(totalRetentionReleased(records).amount).toBe(50_000);
    });

    it('calculates balance (held - released)', () => {
      expect(retentionBalance(records).amount).toBe(70_000);
    });
  });
});
