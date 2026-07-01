/**
 * Unit tests for Command Centre KPI Service
 */

import { describe, it, expect } from 'vitest';
import {
  computeScheduleVariance,
  computeCostVariance,
  computeQualityScore,
  computeRFIResponseTime,
  deriveTrend,
  classifyKPIStatus,
  buildCommandCentreKPIs,
} from './kpiService';
import type { CommandCentreMilestone } from './types';

// ── computeScheduleVariance ──────────────────────────────────────────────────

describe('computeScheduleVariance', () => {
  it('returns zero values for empty milestones', () => {
    const result = computeScheduleVariance([]);
    expect(result).toEqual({
      completedOnTime: 0,
      delayed: 0,
      totalWithDates: 0,
      variancePercent: 0,
    });
  });

  it('computes correct variance with mixed statuses', () => {
    const milestones: CommandCentreMilestone[] = [
      {
        id: '1', projectId: 'p1', name: 'M1', plannedDate: '2024-06-01',
        actualDate: '2024-05-30', status: 'complete',
        createdBy: 'u1', createdAt: '2024-01-01', updatedAt: '2024-01-01',
      },
      {
        id: '2', projectId: 'p1', name: 'M2', plannedDate: '2024-06-15',
        actualDate: '2024-06-20', status: 'complete',
        createdBy: 'u1', createdAt: '2024-01-01', updatedAt: '2024-01-01',
      },
      {
        id: '3', projectId: 'p1', name: 'M3', plannedDate: '2024-07-01',
        status: 'overdue',
        createdBy: 'u1', createdAt: '2024-01-01', updatedAt: '2024-01-01',
      },
      {
        id: '4', projectId: 'p1', name: 'M4', plannedDate: '2024-08-01',
        status: 'on_track',
        createdBy: 'u1', createdAt: '2024-01-01', updatedAt: '2024-01-01',
      },
    ];

    const result = computeScheduleVariance(milestones);

    // M1 is completed on time (actual <= planned)
    // M2 is completed but late (actual > planned), so NOT completedOnTime
    // M3 is overdue (delayed)
    // M4 is on track (neither completed nor delayed)
    expect(result.completedOnTime).toBe(1);
    expect(result.delayed).toBe(1);
    expect(result.totalWithDates).toBe(4);
    // (1 - 1) / 4 * 100 = 0
    expect(result.variancePercent).toBe(0);
  });

  it('returns 100% when all milestones completed on time', () => {
    const milestones: CommandCentreMilestone[] = [
      {
        id: '1', projectId: 'p1', name: 'M1', plannedDate: '2024-06-01',
        actualDate: '2024-05-30', status: 'complete',
        createdBy: 'u1', createdAt: '2024-01-01', updatedAt: '2024-01-01',
      },
      {
        id: '2', projectId: 'p1', name: 'M2', plannedDate: '2024-06-15',
        actualDate: '2024-06-15', status: 'complete',
        createdBy: 'u1', createdAt: '2024-01-01', updatedAt: '2024-01-01',
      },
    ];

    const result = computeScheduleVariance(milestones);
    expect(result.completedOnTime).toBe(2);
    expect(result.delayed).toBe(0);
    // (2 - 0) / 2 * 100 = 100
    expect(result.variancePercent).toBe(100);
  });

  it('returns -100% when all milestones are overdue', () => {
    const milestones: CommandCentreMilestone[] = [
      {
        id: '1', projectId: 'p1', name: 'M1', plannedDate: '2024-06-01',
        status: 'overdue',
        createdBy: 'u1', createdAt: '2024-01-01', updatedAt: '2024-01-01',
      },
      {
        id: '2', projectId: 'p1', name: 'M2', plannedDate: '2024-06-15',
        status: 'overdue',
        createdBy: 'u1', createdAt: '2024-01-01', updatedAt: '2024-01-01',
      },
    ];

    const result = computeScheduleVariance(milestones);
    expect(result.completedOnTime).toBe(0);
    expect(result.delayed).toBe(2);
    // (0 - 2) / 2 * 100 = -100
    expect(result.variancePercent).toBe(-100);
  });
});

// ── computeCostVariance ──────────────────────────────────────────────────────

describe('computeCostVariance', () => {
  it('returns 0 when contractSum is zero', () => {
    const result = computeCostVariance(500000, 0);
    expect(result.variancePercent).toBe(0);
  });

  it('computes positive variance when over budget', () => {
    // forecast 1.1M vs contract 1M = 10% over
    const result = computeCostVariance(1_100_000, 1_000_000);
    expect(result.variancePercent).toBe(10);
  });

  it('computes negative variance when under budget', () => {
    // forecast 900K vs contract 1M = -10% under
    const result = computeCostVariance(900_000, 1_000_000);
    expect(result.variancePercent).toBe(-10);
  });

  it('returns 0 when forecast equals contract sum', () => {
    const result = computeCostVariance(1_000_000, 1_000_000);
    expect(result.variancePercent).toBe(0);
  });

  it('handles large values correctly', () => {
    // R 55M forecast vs R 50M contract = 10% over
    const result = computeCostVariance(55_000_000, 50_000_000);
    expect(result.variancePercent).toBeCloseTo(10, 5);
  });
});

// ── computeQualityScore ──────────────────────────────────────────────────────

describe('computeQualityScore', () => {
  it('returns 100% for empty snags (no issues)', () => {
    const result = computeQualityScore([]);
    expect(result.scorePercent).toBe(100);
    expect(result.total).toBe(0);
    expect(result.resolved).toBe(0);
  });

  it('counts resolved and closed as resolved', () => {
    const snags = [
      { status: 'resolved' as const },
      { status: 'closed' as const },
      { status: 'open' as const },
      { status: 'rectifying' as const },
    ];

    const result = computeQualityScore(snags);
    expect(result.resolved).toBe(2);
    expect(result.total).toBe(4);
    expect(result.scorePercent).toBe(50);
  });

  it('returns 100% when all snags are resolved', () => {
    const snags = [
      { status: 'resolved' as const },
      { status: 'closed' as const },
    ];

    const result = computeQualityScore(snags);
    expect(result.scorePercent).toBe(100);
  });

  it('returns 0% when no snags are resolved', () => {
    const snags = [
      { status: 'open' as const },
      { status: 'rectifying' as const },
    ];

    const result = computeQualityScore(snags);
    expect(result.scorePercent).toBe(0);
  });
});

// ── computeRFIResponseTime ───────────────────────────────────────────────────

describe('computeRFIResponseTime', () => {
  it('returns 0 for empty RFIs', () => {
    const result = computeRFIResponseTime([]);
    expect(result.averageDays).toBe(0);
    expect(result.respondedCount).toBe(0);
  });

  it('only counts closed RFIs', () => {
    const rfis = [
      { dateRaised: '2024-06-01', responseDueDate: '2024-06-08', status: 'closed' as const },
      { dateRaised: '2024-06-05', responseDueDate: '2024-06-12', status: 'pending' as const },
      { dateRaised: '2024-06-10', responseDueDate: '2024-06-17', status: 'critical' as const },
    ];

    const result = computeRFIResponseTime(rfis);
    expect(result.respondedCount).toBe(1);
    expect(result.averageDays).toBe(7);
  });

  it('computes correct average across multiple closed RFIs', () => {
    const rfis = [
      { dateRaised: '2024-06-01', responseDueDate: '2024-06-08', status: 'closed' as const }, // 7 days
      { dateRaised: '2024-06-01', responseDueDate: '2024-06-15', status: 'closed' as const }, // 14 days
    ];

    const result = computeRFIResponseTime(rfis);
    expect(result.respondedCount).toBe(2);
    expect(result.totalResponseDays).toBe(21);
    expect(result.averageDays).toBe(10.5);
  });

  it('returns 0 when all RFIs are pending', () => {
    const rfis = [
      { dateRaised: '2024-06-01', responseDueDate: '2024-06-08', status: 'pending' as const },
    ];

    const result = computeRFIResponseTime(rfis);
    expect(result.averageDays).toBe(0);
    expect(result.respondedCount).toBe(0);
  });
});

// ── deriveTrend ──────────────────────────────────────────────────────────────

describe('deriveTrend', () => {
  it('returns stable when values are within tolerance', () => {
    expect(deriveTrend(50, 50)).toBe('stable');
    expect(deriveTrend(50.3, 50)).toBe('stable');
    expect(deriveTrend(49.7, 50)).toBe('stable');
  });

  it('returns improving when higher is better and current > previous', () => {
    expect(deriveTrend(80, 70, true)).toBe('improving');
  });

  it('returns deteriorating when higher is better and current < previous', () => {
    expect(deriveTrend(60, 70, true)).toBe('deteriorating');
  });

  it('returns improving when lower is better and current < previous', () => {
    expect(deriveTrend(5, 10, false)).toBe('improving');
  });

  it('returns deteriorating when lower is better and current > previous', () => {
    expect(deriveTrend(15, 10, false)).toBe('deteriorating');
  });

  it('respects custom tolerance', () => {
    // With tolerance 5, diff of 3 is stable
    expect(deriveTrend(53, 50, true, 5)).toBe('stable');
    // With tolerance 2, diff of 3 is improving
    expect(deriveTrend(53, 50, true, 2)).toBe('improving');
  });
});

// ── classifyKPIStatus ────────────────────────────────────────────────────────

describe('classifyKPIStatus', () => {
  it('returns on_target when value meets or exceeds target (higher is better)', () => {
    expect(classifyKPIStatus(95, 90, true)).toBe('on_target');
    expect(classifyKPIStatus(90, 90, true)).toBe('on_target');
  });

  it('returns at_risk when within threshold (higher is better)', () => {
    expect(classifyKPIStatus(85, 90, true, 10)).toBe('at_risk');
  });

  it('returns over when beyond threshold (higher is better)', () => {
    expect(classifyKPIStatus(70, 90, true, 10)).toBe('over');
  });

  it('returns on_target when value meets or is below target (lower is better)', () => {
    expect(classifyKPIStatus(5, 7, false)).toBe('on_target');
    expect(classifyKPIStatus(7, 7, false)).toBe('on_target');
  });

  it('returns at_risk when slightly over target (lower is better)', () => {
    expect(classifyKPIStatus(7.5, 7, false, 10)).toBe('at_risk');
  });

  it('returns over when well above target (lower is better)', () => {
    expect(classifyKPIStatus(10, 7, false, 10)).toBe('over');
  });
});

// ── buildCommandCentreKPIs ───────────────────────────────────────────────────

describe('buildCommandCentreKPIs', () => {
  it('builds all four KPI stat cards', () => {
    const milestones: CommandCentreMilestone[] = [
      {
        id: '1', projectId: 'p1', name: 'M1', plannedDate: '2024-06-01',
        actualDate: '2024-05-30', status: 'complete',
        createdBy: 'u1', createdAt: '2024-01-01', updatedAt: '2024-01-01',
      },
    ];

    const result = buildCommandCentreKPIs({
      milestones,
      forecast: 1_100_000,
      contractSum: 1_000_000,
      snags: [{ status: 'resolved' }, { status: 'open' }],
      rfis: [
        { dateRaised: '2024-06-01', responseDueDate: '2024-06-08', status: 'closed' },
      ],
    });

    expect(result).toHaveLength(4);
    expect(result[0].name).toBe('schedule_variance');
    expect(result[1].name).toBe('cost_variance');
    expect(result[2].name).toBe('quality_score');
    expect(result[3].name).toBe('rfi_response_time');
  });

  it('uses previous values for trend derivation', () => {
    const result = buildCommandCentreKPIs({
      milestones: [],
      forecast: 1_000_000,
      contractSum: 1_000_000,
      snags: [],
      rfis: [],
      previousValues: {
        scheduleVariance: -10,
        costVariance: 5,
        qualityScore: 80,
        rfiResponseTime: 10,
      },
    });

    // Schedule: 0 vs -10 (higher is better) → improving
    expect(result[0].trend).toBe('improving');
    // Cost: 0 vs 5 (lower is better) → improving
    expect(result[1].trend).toBe('improving');
    // Quality: 100 vs 80 (higher is better) → improving
    expect(result[2].trend).toBe('improving');
    // RFI: 0 vs 10 (lower is better) → improving
    expect(result[3].trend).toBe('improving');
  });
});
