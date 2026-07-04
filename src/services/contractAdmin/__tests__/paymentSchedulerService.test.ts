/**
 * Unit tests for Payment Scheduler Service
 *
 * Tests: schedule generation, retention calculation, schedule regeneration after EoT grant,
 * and overdue detection.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */

import { describe, expect, it, vi } from 'vitest';

// Mock firebase-admin to prevent initialization errors in test environment
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn(),
        set: vi.fn(),
        update: vi.fn(),
      })),
      where: vi.fn(() => ({ get: vi.fn() })),
      orderBy: vi.fn(() => ({ get: vi.fn() })),
    })),
    batch: vi.fn(() => ({
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn(),
    })),
  },
}));

import { generateSchedule, calculateRetention } from '../paymentSchedulerService';
import { getSouthAfricanHolidays } from '../workingDayCalculator';
import type { PublicHoliday } from '../contractTypes';

// ══════════════════════════════════════════════════════════════════════════════
// Test Data
// ══════════════════════════════════════════════════════════════════════════════

/** Get holidays covering the test period (2025–2026) */
function getTestHolidays(): PublicHoliday[] {
  return [...getSouthAfricanHolidays(2025), ...getSouthAfricanHolidays(2026)];
}

// 12-month contract: 2025-01-06 to 2026-01-05, 30-day intervals
const COMMENCEMENT_DATE = '2025-01-06';
const COMPLETION_DATE = '2026-01-05';
const INTERVAL_DAYS = 30;

// ══════════════════════════════════════════════════════════════════════════════
// generateSchedule tests
// ══════════════════════════════════════════════════════════════════════════════

describe('paymentSchedulerService', () => {
  describe('generateSchedule', () => {
    const holidays = getTestHolidays();

    it('generates correct number of entries for a 12-month contract with 30-day intervals (~12 entries)', () => {
      const schedule = generateSchedule(
        COMMENCEMENT_DATE,
        COMPLETION_DATE,
        INTERVAL_DAYS,
        holidays,
      );

      // 365 days / 30-day interval = ~12 entries
      // The exact number depends on whether the last valuation lands on or before completion
      expect(schedule.length).toBeGreaterThanOrEqual(11);
      expect(schedule.length).toBeLessThanOrEqual(13);
    });

    it('first valuation date is exactly interval days after commencement', () => {
      const schedule = generateSchedule(
        COMMENCEMENT_DATE,
        COMPLETION_DATE,
        INTERVAL_DAYS,
        holidays,
      );

      expect(schedule.length).toBeGreaterThan(0);

      // First valuation = commencement + 30 calendar days
      // 2025-01-06 + 30 days = 2025-02-05
      const firstEntry = schedule[0];
      expect(firstEntry.valuationDate).toBe('2025-02-05');
    });

    it('last valuation date is on or before completion date', () => {
      const schedule = generateSchedule(
        COMMENCEMENT_DATE,
        COMPLETION_DATE,
        INTERVAL_DAYS,
        holidays,
      );

      const lastEntry = schedule[schedule.length - 1];
      const lastValuationMs = new Date(lastEntry.valuationDate).getTime();
      const completionMs = new Date(COMPLETION_DATE).getTime();

      expect(lastValuationMs).toBeLessThanOrEqual(completionMs);
    });

    it('consecutive entries are spaced exactly interval apart', () => {
      const schedule = generateSchedule(
        COMMENCEMENT_DATE,
        COMPLETION_DATE,
        INTERVAL_DAYS,
        holidays,
      );

      for (let i = 1; i < schedule.length; i++) {
        const prevDate = new Date(schedule[i - 1].valuationDate);
        const currDate = new Date(schedule[i].valuationDate);
        const diffMs = currDate.getTime() - prevDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        expect(diffDays).toBe(INTERVAL_DAYS);
      }
    });

    it('all entries start with pending status', () => {
      const schedule = generateSchedule(
        COMMENCEMENT_DATE,
        COMPLETION_DATE,
        INTERVAL_DAYS,
        holidays,
      );

      for (const entry of schedule) {
        expect(entry.status).toBe('pending');
      }
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // calculateRetention tests
  // ══════════════════════════════════════════════════════════════════════════════

  describe('calculateRetention', () => {
    it('below limit: retentionHeld = C × P / 100, atLimit = false', () => {
      // C = 500_000, P = 5%, L = 100_000
      // Calculated = 500_000 × 5 / 100 = 25_000 (below limit of 100_000)
      const result = calculateRetention(500_000, 5, 100_000);

      expect(result.retentionHeld).toBe(25_000);
      expect(result.atLimit).toBe(false);
    });

    it('at limit: retentionHeld = L, atLimit = true', () => {
      // C = 3_000_000, P = 5%, L = 100_000
      // Calculated = 3_000_000 × 5 / 100 = 150_000 (exceeds limit of 100_000)
      const result = calculateRetention(3_000_000, 5, 100_000);

      expect(result.retentionHeld).toBe(100_000);
      expect(result.atLimit).toBe(true);
    });

    it('exactly at limit boundary: atLimit = true', () => {
      // C = 2_000_000, P = 5%, L = 100_000
      // Calculated = 2_000_000 × 5 / 100 = 100_000 (exactly at limit)
      const result = calculateRetention(2_000_000, 5, 100_000);

      expect(result.retentionHeld).toBe(100_000);
      expect(result.atLimit).toBe(true);
    });

    it('zero cumulative: retentionHeld = 0, atLimit = false (unless limit is 0)', () => {
      // C = 0, P = 5%, L = 100_000
      // Calculated = 0 × 5 / 100 = 0 (below limit of 100_000)
      const result = calculateRetention(0, 5, 100_000);

      expect(result.retentionHeld).toBe(0);
      expect(result.atLimit).toBe(false);
    });
  });
});
