/**
 * Unit tests for Net Zero Pathway Service
 * Tests: trajectory calculation, percentage reduction, on-track evaluation, full progress
 * Requirements: 11.1–11.7
 */

import { describe, it, expect } from 'vitest';
import {
  calculateTrajectoryTarget,
  calculatePercentageReduction,
  evaluateOnTrackStatus,
  computeNetZeroProgress,
  NET_ZERO_TOLERANCE_POINTS,
} from '../../services/eia/netZeroService';
import type { NetZeroTarget, AnnualPerformance } from '../../services/eia/eiaTypes';

// ─── Helper Factories ────────────────────────────────────────────────────────

function makeTarget(overrides: Partial<NetZeroTarget> = {}): NetZeroTarget {
  return {
    id: 'nz-target-1',
    projectId: 'proj-1',
    targetType: 'net_zero_carbon',
    baselineYear: 2020,
    targetYear: 2030,
    baselineConsumption: 1000,
    ...overrides,
  };
}

function makeAnnualData(overrides: Partial<AnnualPerformance> = {}): AnnualPerformance {
  return {
    year: 2025,
    actualConsumption: 500,
    baselineConsumption: 1000,
    ...overrides,
  };
}

// ─── calculateTrajectoryTarget ───────────────────────────────────────────────

describe('calculateTrajectoryTarget', () => {
  it('should return 0% at baseline year (no reduction expected)', () => {
    const result = calculateTrajectoryTarget(2020, 2030, 2020);
    expect(result).toBe(0);
  });

  it('should return 100% at target year (full reduction expected)', () => {
    const result = calculateTrajectoryTarget(2020, 2030, 2030);
    expect(result).toBe(100);
  });

  it('should return 50% at midpoint', () => {
    const result = calculateTrajectoryTarget(2020, 2030, 2025);
    expect(result).toBe(50);
  });

  it('should linearly interpolate between baseline and target', () => {
    // 3 years into a 10-year window = 30%
    const result = calculateTrajectoryTarget(2020, 2030, 2023);
    expect(result).toBe(30);
  });

  it('should return 0% for years before baseline (clamped)', () => {
    const result = calculateTrajectoryTarget(2020, 2030, 2018);
    expect(result).toBe(0);
  });

  it('should return 100% for years after target (clamped)', () => {
    const result = calculateTrajectoryTarget(2020, 2030, 2035);
    expect(result).toBe(100);
  });

  it('should handle a 1-year target window', () => {
    // 1 year from baseline = halfway through
    const result = calculateTrajectoryTarget(2020, 2021, 2020);
    expect(result).toBe(0);

    const resultEnd = calculateTrajectoryTarget(2020, 2021, 2021);
    expect(resultEnd).toBe(100);
  });

  it('should handle same baseline and target year gracefully', () => {
    const result = calculateTrajectoryTarget(2020, 2020, 2020);
    expect(result).toBe(0);
  });

  it('should produce non-integer values for non-aligned years', () => {
    // 1 year into 3-year window = 33.33...%
    const result = calculateTrajectoryTarget(2020, 2023, 2021);
    expect(result).toBeCloseTo(33.33, 1);
  });
});

// ─── calculatePercentageReduction ────────────────────────────────────────────

describe('calculatePercentageReduction', () => {
  it('should return 50% when consumption is halved', () => {
    const result = calculatePercentageReduction(1000, 500);
    expect(result).toBe(50);
  });

  it('should return 100% when consumption is zero (full reduction)', () => {
    const result = calculatePercentageReduction(1000, 0);
    expect(result).toBe(100);
  });

  it('should return 0% when consumption equals baseline (no reduction)', () => {
    const result = calculatePercentageReduction(1000, 1000);
    expect(result).toBe(0);
  });

  it('should return negative value when consumption exceeds baseline', () => {
    const result = calculatePercentageReduction(1000, 1200);
    expect(result).toBe(-20);
  });

  it('should return 0% when baseline is zero (avoid division by zero)', () => {
    const result = calculatePercentageReduction(0, 500);
    expect(result).toBe(0);
  });

  it('should handle decimal values correctly', () => {
    const result = calculatePercentageReduction(100.5, 50.25);
    expect(result).toBe(50);
  });

  it('should handle very large values', () => {
    const result = calculatePercentageReduction(999_999_999.99, 499_999_999.995);
    expect(result).toBeCloseTo(50, 0);
  });
});

// ─── evaluateOnTrackStatus ───────────────────────────────────────────────────

describe('evaluateOnTrackStatus', () => {
  it('should be on track when actual equals trajectory', () => {
    const result = evaluateOnTrackStatus(50, 50, 10);
    expect(result.onTrack).toBe(true);
    expect(result.deviation).toBe(0);
  });

  it('should be on track when actual is ahead of trajectory', () => {
    const result = evaluateOnTrackStatus(60, 50, 10);
    expect(result.onTrack).toBe(true);
    expect(result.deviation).toBe(10);
  });

  it('should be on track when actual is within tolerance below trajectory', () => {
    // 45% actual vs 50% trajectory with 10pp tolerance → 45 >= 40 → on track
    const result = evaluateOnTrackStatus(45, 50, 10);
    expect(result.onTrack).toBe(true);
    expect(result.deviation).toBe(-5);
  });

  it('should be on track at exactly tolerance boundary', () => {
    // 40% actual vs 50% trajectory with 10pp tolerance → 40 >= 40 → on track
    const result = evaluateOnTrackStatus(40, 50, 10);
    expect(result.onTrack).toBe(true);
    expect(result.deviation).toBe(-10);
  });

  it('should be off track when below tolerance', () => {
    // 39% actual vs 50% trajectory with 10pp tolerance → 39 < 40 → off track
    const result = evaluateOnTrackStatus(39, 50, 10);
    expect(result.onTrack).toBe(false);
    expect(result.deviation).toBe(-11);
  });

  it('should be off track when significantly behind', () => {
    const result = evaluateOnTrackStatus(10, 50, 10);
    expect(result.onTrack).toBe(false);
    expect(result.deviation).toBe(-40);
  });

  it('should handle zero tolerance', () => {
    // With 0 tolerance, must exactly meet or exceed trajectory
    const resultExact = evaluateOnTrackStatus(50, 50, 0);
    expect(resultExact.onTrack).toBe(true);

    const resultBelow = evaluateOnTrackStatus(49.9, 50, 0);
    expect(resultBelow.onTrack).toBe(false);
  });

  it('should handle negative actual (consumption above baseline)', () => {
    const result = evaluateOnTrackStatus(-20, 50, 10);
    expect(result.onTrack).toBe(false);
    expect(result.deviation).toBe(-70);
  });
});

// ─── computeNetZeroProgress ──────────────────────────────────────────────────

describe('computeNetZeroProgress', () => {
  it('should compute full progress for current year with data', () => {
    const target = makeTarget();
    const annualData = [makeAnnualData({ year: 2025, actualConsumption: 500, baselineConsumption: 1000 })];

    const result = computeNetZeroProgress(target, annualData, 2025);

    expect(result.target).toEqual(target);
    expect(result.annualData).toEqual(annualData);
    expect(result.percentageReduction).toBe(50);
    expect(result.trajectoryTarget).toBe(50); // midpoint of 2020-2030
    expect(result.onTrack).toBe(true); // 50 >= 50 - 10
    expect(result.deviationPercentagePoints).toBe(0);
  });

  it('should use most recent year data when current year has no entry', () => {
    const target = makeTarget();
    const annualData = [
      makeAnnualData({ year: 2023, actualConsumption: 700, baselineConsumption: 1000 }),
      makeAnnualData({ year: 2024, actualConsumption: 600, baselineConsumption: 1000 }),
    ];

    const result = computeNetZeroProgress(target, annualData, 2025);

    // Most recent is 2024 with 40% reduction
    expect(result.percentageReduction).toBe(40);
    // Trajectory at 2025 = 50%
    expect(result.trajectoryTarget).toBe(50);
    // 40 >= 50 - 10 → on track
    expect(result.onTrack).toBe(true);
    expect(result.deviationPercentagePoints).toBe(-10);
  });

  it('should return 0% reduction and off-track when no annual data', () => {
    const target = makeTarget();

    const result = computeNetZeroProgress(target, [], 2025);

    expect(result.percentageReduction).toBe(0);
    expect(result.trajectoryTarget).toBe(50);
    // 0 < 50 - 10 → off track
    expect(result.onTrack).toBe(false);
    expect(result.deviationPercentagePoints).toBe(-50);
  });

  it('should be on track when ahead of trajectory', () => {
    const target = makeTarget();
    const annualData = [makeAnnualData({ year: 2025, actualConsumption: 300, baselineConsumption: 1000 })];

    const result = computeNetZeroProgress(target, annualData, 2025);

    expect(result.percentageReduction).toBe(70);
    expect(result.trajectoryTarget).toBe(50);
    expect(result.onTrack).toBe(true);
    expect(result.deviationPercentagePoints).toBe(20);
  });

  it('should be off track when significantly behind', () => {
    const target = makeTarget();
    const annualData = [makeAnnualData({ year: 2025, actualConsumption: 900, baselineConsumption: 1000 })];

    const result = computeNetZeroProgress(target, annualData, 2025);

    expect(result.percentageReduction).toBe(10);
    expect(result.trajectoryTarget).toBe(50);
    // 10 < 50 - 10 = 40 → off track
    expect(result.onTrack).toBe(false);
    expect(result.deviationPercentagePoints).toBe(-40);
  });

  it('should handle baseline year (0% trajectory target)', () => {
    const target = makeTarget();
    const annualData = [makeAnnualData({ year: 2020, actualConsumption: 1000, baselineConsumption: 1000 })];

    const result = computeNetZeroProgress(target, annualData, 2020);

    expect(result.percentageReduction).toBe(0);
    expect(result.trajectoryTarget).toBe(0);
    expect(result.onTrack).toBe(true); // 0 >= 0 - 10
    expect(result.deviationPercentagePoints).toBe(0);
  });

  it('should handle target year (100% trajectory target)', () => {
    const target = makeTarget();
    const annualData = [makeAnnualData({ year: 2030, actualConsumption: 0, baselineConsumption: 1000 })];

    const result = computeNetZeroProgress(target, annualData, 2030);

    expect(result.percentageReduction).toBe(100);
    expect(result.trajectoryTarget).toBe(100);
    expect(result.onTrack).toBe(true);
    expect(result.deviationPercentagePoints).toBe(0);
  });

  it('should use the default 10pp tolerance threshold', () => {
    expect(NET_ZERO_TOLERANCE_POINTS).toBe(10);
  });

  it('should handle net_zero_energy target type', () => {
    const target = makeTarget({ targetType: 'net_zero_energy' });
    const annualData = [
      makeAnnualData({
        year: 2025,
        actualConsumption: 400,
        baselineConsumption: 1000,
        onSiteRenewable: 200,
      }),
    ];

    const result = computeNetZeroProgress(target, annualData, 2025);

    // 60% reduction (1000-400)/1000
    expect(result.percentageReduction).toBe(60);
    expect(result.onTrack).toBe(true);
  });

  it('should handle net_zero_water target type', () => {
    const target = makeTarget({ targetType: 'net_zero_water' });
    const annualData = [makeAnnualData({ year: 2025, actualConsumption: 600, baselineConsumption: 1000 })];

    const result = computeNetZeroProgress(target, annualData, 2025);

    expect(result.percentageReduction).toBe(40);
    expect(result.trajectoryTarget).toBe(50);
    expect(result.onTrack).toBe(true); // 40 >= 40
  });
});
