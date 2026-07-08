/**
 * Bandwidth Adaptation Service — Unit Tests
 *
 * Comprehensive coverage for profile selection, hysteresis,
 * manual override, and critical mode entry/exit.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.7, 10.8
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  BandwidthAdaptationService,
  PROFILE_THRESHOLDS,
  CRITICAL_ENTRY_DURATION_MS,
  CRITICAL_EXIT_DURATION_MS,
  CRITICAL_EXIT_THRESHOLD_MBPS,
  HYSTERESIS_DURATION_MS,
  MEASUREMENT_INTERVAL_MS,
  DEFAULT_PROFILE,
  PROFILE_CONFIGS,
  type QualityProfile,
} from '../bandwidthAdaptationService';

// ─── Test Helpers ───────────────────────────────────────────────────────────────

let service: BandwidthAdaptationService;
let baseTime: number;

beforeEach(() => {
  service = new BandwidthAdaptationService();
  baseTime = Date.now();
});

/**
 * Simulates a sequence of bandwidth measurements at regular intervals.
 */
function simulateMeasurements(
  svc: BandwidthAdaptationService,
  bandwidthMbps: number,
  count: number,
  startTime: number,
  intervalMs: number = MEASUREMENT_INTERVAL_MS,
): (QualityProfile | null)[] {
  const results: (QualityProfile | null)[] = [];
  for (let i = 0; i < count; i++) {
    const timestamp = startTime + i * intervalMs;
    results.push(svc.processMeasurement(bandwidthMbps, timestamp));
  }
  return results;
}

// ─── Profile Selection (Pure Function) ──────────────────────────────────────────

describe('selectProfile — pure profile selection', () => {
  it('should return "high" for bandwidth ≥ 4 Mbps', () => {
    expect(service.selectProfile(4.0)).toBe('high');
    expect(service.selectProfile(5.5)).toBe('high');
    expect(service.selectProfile(10.0)).toBe('high');
    expect(service.selectProfile(100.0)).toBe('high');
  });

  it('should return "balanced" for bandwidth 1.5–4 Mbps (exclusive upper)', () => {
    expect(service.selectProfile(1.5)).toBe('balanced');
    expect(service.selectProfile(2.0)).toBe('balanced');
    expect(service.selectProfile(3.0)).toBe('balanced');
    expect(service.selectProfile(3.99)).toBe('balanced');
  });

  it('should return "low" for bandwidth 0.5–1.5 Mbps (exclusive upper)', () => {
    expect(service.selectProfile(0.5)).toBe('low');
    expect(service.selectProfile(0.75)).toBe('low');
    expect(service.selectProfile(1.0)).toBe('low');
    expect(service.selectProfile(1.49)).toBe('low');
  });

  it('should return "critical" for bandwidth < 0.5 Mbps', () => {
    expect(service.selectProfile(0.0)).toBe('critical');
    expect(service.selectProfile(0.1)).toBe('critical');
    expect(service.selectProfile(0.3)).toBe('critical');
    expect(service.selectProfile(0.49)).toBe('critical');
  });

  it('should handle exact boundary values correctly', () => {
    expect(service.selectProfile(4.0)).toBe('high');
    expect(service.selectProfile(1.5)).toBe('balanced');
    expect(service.selectProfile(0.5)).toBe('low');
  });
});

// ─── Default Profile ────────────────────────────────────────────────────────────

describe('Default profile', () => {
  it('should default to "balanced" before initial measurement', () => {
    expect(service.getCurrentProfile()).toBe('balanced');
    expect(service.isInitialMeasurementComplete()).toBe(false);
  });

  it('should mark initial measurement complete after first processMeasurement call', () => {
    service.processMeasurement(5.0, baseTime);
    expect(service.isInitialMeasurementComplete()).toBe(true);
  });

  it('DEFAULT_PROFILE constant should be "balanced"', () => {
    expect(DEFAULT_PROFILE).toBe('balanced');
  });
});

// ─── Hysteresis ─────────────────────────────────────────────────────────────────

describe('Hysteresis — 5-second sustained threshold crossing', () => {
  it('should NOT switch profile on a single measurement crossing a threshold', () => {
    // Current is balanced, measure high bandwidth once
    const result = service.processMeasurement(5.0, baseTime);
    expect(result).toBeNull();
    expect(service.getCurrentProfile()).toBe('balanced');
  });

  it('should switch profile after threshold is sustained for ≥5 seconds', () => {
    // Balanced → High: two measurements at 5s intervals (0s and 5s)
    const t0 = baseTime;
    const t1 = baseTime + HYSTERESIS_DURATION_MS;

    const r0 = service.processMeasurement(5.0, t0);
    expect(r0).toBeNull(); // starts tracking

    const r1 = service.processMeasurement(5.0, t1);
    expect(r1).toBe('high'); // sustained 5s → switch
    expect(service.getCurrentProfile()).toBe('high');
  });

  it('should reset hysteresis if bandwidth reverts before duration', () => {
    const t0 = baseTime;
    const t1 = baseTime + 3_000; // 3s (not enough)
    const t2 = baseTime + 5_000;

    // Start tracking transition to high
    service.processMeasurement(5.0, t0);
    // Bandwidth drops back to balanced range — resets tracking
    service.processMeasurement(2.0, t1);
    // New measurement in high range starts fresh tracking
    service.processMeasurement(5.0, t2);

    expect(service.getCurrentProfile()).toBe('balanced');
  });

  it('should handle transition from balanced to low with hysteresis', () => {
    const t0 = baseTime;
    const t1 = baseTime + HYSTERESIS_DURATION_MS;

    service.processMeasurement(0.8, t0); // low range
    const result = service.processMeasurement(0.8, t1);
    expect(result).toBe('low');
    expect(service.getCurrentProfile()).toBe('low');
  });

  it('should handle transition from high to balanced with hysteresis', () => {
    // First get to high profile
    service.processMeasurement(5.0, baseTime);
    service.processMeasurement(5.0, baseTime + HYSTERESIS_DURATION_MS);
    expect(service.getCurrentProfile()).toBe('high');

    // Now transition down to balanced
    const t2 = baseTime + 10_000;
    const t3 = t2 + HYSTERESIS_DURATION_MS;
    service.processMeasurement(2.5, t2);
    const result = service.processMeasurement(2.5, t3);
    expect(result).toBe('balanced');
    expect(service.getCurrentProfile()).toBe('balanced');
  });

  it('should not switch if target profile changes during hysteresis', () => {
    const t0 = baseTime;
    const t1 = baseTime + 3_000;
    const t2 = baseTime + HYSTERESIS_DURATION_MS;

    // Start tracking towards high
    service.processMeasurement(5.0, t0);
    // Switch to low range — resets and starts tracking low
    service.processMeasurement(0.8, t1);
    // Continue in low range — but only 2s elapsed from new start
    const result = service.processMeasurement(0.8, t2);

    // 5s - 3s = 2s elapsed for low tracking → not enough
    expect(result).toBeNull();
    expect(service.getCurrentProfile()).toBe('balanced');
  });

  it('should return null when measurement matches current profile', () => {
    // Current is balanced, measure in balanced range
    const result = service.processMeasurement(2.5, baseTime);
    expect(result).toBeNull();
    expect(service.getCurrentProfile()).toBe('balanced');
  });
});

// ─── Critical Mode Entry ────────────────────────────────────────────────────────

describe('Critical mode entry — <500Kbps sustained 10 seconds', () => {
  it('should NOT enter critical on a single sub-500Kbps measurement', () => {
    const result = service.processMeasurement(0.3, baseTime);
    expect(result).toBeNull();
    expect(service.getCurrentProfile()).toBe('balanced');
  });

  it('should enter critical after bandwidth <500Kbps sustained for 10 seconds', () => {
    // 2 measurements at 5s intervals = 10s total (at 0s and 10s)
    const t0 = baseTime;
    const t1 = baseTime + CRITICAL_ENTRY_DURATION_MS;

    service.processMeasurement(0.3, t0);
    const result = service.processMeasurement(0.3, t1);
    expect(result).toBe('critical');
    expect(service.getCurrentProfile()).toBe('critical');
  });

  it('should reset critical entry tracking if bandwidth recovers', () => {
    const t0 = baseTime;
    const t1 = baseTime + 5_000;
    const t2 = baseTime + 10_000;
    const t3 = baseTime + 15_000;

    // Start critical entry tracking
    service.processMeasurement(0.3, t0);
    // Bandwidth recovers — reset
    service.processMeasurement(0.8, t1);
    // Back below threshold — restart tracking
    service.processMeasurement(0.3, t2);
    // Not 10s yet from restart (only 5s)
    const result = service.processMeasurement(0.3, t3);
    // 15_000 - 10_000 = 5s (not enough for critical entry which needs 10s)
    expect(result).toBeNull();
    expect(service.getCurrentProfile()).toBe('balanced');
  });

  it('should enter critical from low profile when sustained', () => {
    // First transition to low
    service.processMeasurement(0.8, baseTime);
    service.processMeasurement(0.8, baseTime + HYSTERESIS_DURATION_MS);
    expect(service.getCurrentProfile()).toBe('low');

    // Now drop below critical threshold
    const t2 = baseTime + 15_000;
    const t3 = t2 + CRITICAL_ENTRY_DURATION_MS;
    service.processMeasurement(0.2, t2);
    const result = service.processMeasurement(0.2, t3);
    expect(result).toBe('critical');
    expect(service.getCurrentProfile()).toBe('critical');
  });
});

// ─── Critical Mode Exit ─────────────────────────────────────────────────────────

describe('Critical mode exit — ≥1.0 Mbps sustained 15 seconds', () => {
  function enterCritical() {
    // Force into critical mode
    service.processMeasurement(0.3, baseTime);
    service.processMeasurement(0.3, baseTime + CRITICAL_ENTRY_DURATION_MS);
    expect(service.getCurrentProfile()).toBe('critical');
  }

  it('should NOT exit critical on a single measurement ≥1.0 Mbps', () => {
    enterCritical();

    const t = baseTime + 20_000;
    const result = service.processMeasurement(2.0, t);
    expect(result).toBeNull();
    expect(service.getCurrentProfile()).toBe('critical');
  });

  it('should exit critical after ≥1.0 Mbps sustained for 15 seconds', () => {
    enterCritical();

    // 3 measurements at 5s intervals (0s, 5s, 10s, 15s from exit start)
    const exitStart = baseTime + 20_000;
    service.processMeasurement(2.0, exitStart);
    service.processMeasurement(2.0, exitStart + 5_000);
    service.processMeasurement(2.0, exitStart + 10_000);
    const result = service.processMeasurement(2.0, exitStart + CRITICAL_EXIT_DURATION_MS);

    expect(result).toBe('balanced');
    expect(service.getCurrentProfile()).toBe('balanced');
  });

  it('should select correct profile on critical exit based on current bandwidth', () => {
    enterCritical();

    const exitStart = baseTime + 20_000;
    // Bandwidth at 5.0 Mbps — should exit to high
    service.processMeasurement(5.0, exitStart);
    service.processMeasurement(5.0, exitStart + 5_000);
    service.processMeasurement(5.0, exitStart + 10_000);
    const result = service.processMeasurement(5.0, exitStart + CRITICAL_EXIT_DURATION_MS);

    expect(result).toBe('high');
    expect(service.getCurrentProfile()).toBe('high');
  });

  it('should reset exit tracking if bandwidth drops below 1.0 Mbps', () => {
    enterCritical();

    const exitStart = baseTime + 20_000;
    service.processMeasurement(2.0, exitStart);
    service.processMeasurement(2.0, exitStart + 5_000);
    // Bandwidth drops — reset
    service.processMeasurement(0.3, exitStart + 10_000);
    // Restart tracking
    service.processMeasurement(2.0, exitStart + 15_000);
    // Only 5s from restart (not 15s)
    const result = service.processMeasurement(2.0, exitStart + 20_000);
    expect(result).toBeNull();
    expect(service.getCurrentProfile()).toBe('critical');
  });

  it('should NOT exit critical if bandwidth is between 0.5 and 1.0 Mbps', () => {
    enterCritical();

    const exitStart = baseTime + 20_000;
    // 0.7 Mbps is above critical threshold but below exit threshold
    service.processMeasurement(0.7, exitStart);
    service.processMeasurement(0.7, exitStart + 5_000);
    service.processMeasurement(0.7, exitStart + 10_000);
    const result = service.processMeasurement(0.7, exitStart + CRITICAL_EXIT_DURATION_MS);
    expect(result).toBeNull();
    expect(service.getCurrentProfile()).toBe('critical');
  });

  it('should use CRITICAL_EXIT_THRESHOLD_MBPS (1.0) for exit check', () => {
    expect(CRITICAL_EXIT_THRESHOLD_MBPS).toBe(1.0);
  });
});

// ─── Manual Override ────────────────────────────────────────────────────────────

describe('Manual override', () => {
  it('should suspend automatic switching when manual override is set', () => {
    service.setManualOverride('low');
    expect(service.isManualOverride()).toBe(true);
    expect(service.getCurrentProfile()).toBe('low');

    // Even with high bandwidth, should not auto-switch
    const result = service.processMeasurement(10.0, baseTime);
    expect(result).toBeNull();
    expect(service.getCurrentProfile()).toBe('low');
  });

  it('should apply manual profile immediately', () => {
    service.setManualOverride('high');
    expect(service.getCurrentProfile()).toBe('high');
  });

  it('should resume automatic switching when override is cleared', () => {
    service.setManualOverride('low');
    service.setManualOverride(null);
    expect(service.isManualOverride()).toBe(false);

    // Now auto-switching should work again
    const t0 = baseTime;
    const t1 = baseTime + HYSTERESIS_DURATION_MS;
    service.processMeasurement(5.0, t0);
    const result = service.processMeasurement(5.0, t1);
    // Profile was set to low by manual override, now clearing it retains 'low'
    // and the automatic switching targets 'high' — needs hysteresis from 'low' current
    expect(result).toBe('high');
  });

  it('should clear pending transitions when manual override is set', () => {
    // Start a pending transition
    service.processMeasurement(5.0, baseTime);

    // Set manual override — should clear tracking
    service.setManualOverride('balanced');
    expect(service.getCurrentProfile()).toBe('balanced');

    // Clear override and start fresh
    service.setManualOverride(null);
    const t = baseTime + 10_000;
    const result = service.processMeasurement(5.0, t);
    expect(result).toBeNull(); // Fresh tracking, not carried over
  });

  it('should not auto-switch regardless of bandwidth fluctuations', () => {
    service.setManualOverride('balanced');

    // Simulate many measurements at various bandwidths
    for (let i = 0; i < 20; i++) {
      const bw = Math.random() * 10; // 0–10 Mbps
      const result = service.processMeasurement(bw, baseTime + i * MEASUREMENT_INTERVAL_MS);
      expect(result).toBeNull();
    }
    expect(service.getCurrentProfile()).toBe('balanced');
  });

  it('should allow override to any profile including critical', () => {
    service.setManualOverride('critical');
    expect(service.getCurrentProfile()).toBe('critical');
    expect(service.isManualOverride()).toBe(true);

    // High bandwidth should not exit critical when manually set
    const result = service.processMeasurement(10.0, baseTime);
    expect(result).toBeNull();
  });
});

// ─── Reset ──────────────────────────────────────────────────────────────────────

describe('reset', () => {
  it('should reset all state to initial values', () => {
    // Put service in a complex state
    service.processMeasurement(5.0, baseTime);
    service.processMeasurement(5.0, baseTime + HYSTERESIS_DURATION_MS);
    service.setManualOverride('low');

    // Reset
    service.reset();

    expect(service.getCurrentProfile()).toBe('balanced');
    expect(service.isManualOverride()).toBe(false);
    expect(service.isInitialMeasurementComplete()).toBe(false);
  });

  it('should allow fresh operation after reset', () => {
    service.processMeasurement(0.3, baseTime);
    service.processMeasurement(0.3, baseTime + CRITICAL_ENTRY_DURATION_MS);
    expect(service.getCurrentProfile()).toBe('critical');

    service.reset();
    expect(service.getCurrentProfile()).toBe('balanced');

    // Can track fresh measurements
    service.processMeasurement(5.0, baseTime + 30_000);
    const result = service.processMeasurement(5.0, baseTime + 30_000 + HYSTERESIS_DURATION_MS);
    expect(result).toBe('high');
  });
});

// ─── Profile Configs ────────────────────────────────────────────────────────────

describe('Profile configurations', () => {
  it('should define correct resolution and fps for each profile', () => {
    expect(PROFILE_CONFIGS.high).toEqual({
      resolution: '1080p',
      fps: 30,
      minBandwidthMbps: 4.0,
      maxBandwidthMbps: Infinity,
    });
    expect(PROFILE_CONFIGS.balanced).toEqual({
      resolution: '720p',
      fps: 24,
      minBandwidthMbps: 1.5,
      maxBandwidthMbps: 4.0,
    });
    expect(PROFILE_CONFIGS.low).toEqual({
      resolution: '480p',
      fps: 15,
      minBandwidthMbps: 0.5,
      maxBandwidthMbps: 1.5,
    });
    expect(PROFILE_CONFIGS.critical).toEqual({
      resolution: '360p',
      fps: 10,
      minBandwidthMbps: 0,
      maxBandwidthMbps: 0.5,
    });
  });

  it('should have correct threshold constants', () => {
    expect(PROFILE_THRESHOLDS.high).toBe(4.0);
    expect(PROFILE_THRESHOLDS.balanced).toBe(1.5);
    expect(PROFILE_THRESHOLDS.low).toBe(0.5);
    expect(PROFILE_THRESHOLDS.critical).toBe(0.5);
  });

  it('should have correct timing constants', () => {
    expect(CRITICAL_ENTRY_DURATION_MS).toBe(10_000);
    expect(CRITICAL_EXIT_DURATION_MS).toBe(15_000);
    expect(HYSTERESIS_DURATION_MS).toBe(5_000);
    expect(MEASUREMENT_INTERVAL_MS).toBe(5_000);
  });
});

// ─── Integration Scenarios ──────────────────────────────────────────────────────

describe('Integration scenarios', () => {
  it('should handle a session lifecycle: start balanced → high → low → critical → exit', () => {
    let t = baseTime;

    // Start in balanced (default), first measurement at high bandwidth
    service.processMeasurement(5.0, t);
    t += HYSTERESIS_DURATION_MS;
    service.processMeasurement(5.0, t);
    expect(service.getCurrentProfile()).toBe('high');

    // Bandwidth drops to low range
    t += MEASUREMENT_INTERVAL_MS;
    service.processMeasurement(0.8, t);
    t += HYSTERESIS_DURATION_MS;
    service.processMeasurement(0.8, t);
    expect(service.getCurrentProfile()).toBe('low');

    // Bandwidth drops to critical
    t += MEASUREMENT_INTERVAL_MS;
    service.processMeasurement(0.2, t);
    t += CRITICAL_ENTRY_DURATION_MS;
    service.processMeasurement(0.2, t);
    expect(service.getCurrentProfile()).toBe('critical');

    // Bandwidth recovers to balanced
    t += MEASUREMENT_INTERVAL_MS;
    const exitStart = t;
    service.processMeasurement(2.5, t);
    t = exitStart + CRITICAL_EXIT_DURATION_MS;
    service.processMeasurement(2.5, t);
    expect(service.getCurrentProfile()).toBe('balanced');
  });

  it('should handle rapid fluctuations without switching (hysteresis protection)', () => {
    let t = baseTime;
    const results: (QualityProfile | null)[] = [];

    // Alternate between high and balanced bandwidth every 2 seconds (not sustained)
    for (let i = 0; i < 10; i++) {
      const bw = i % 2 === 0 ? 5.0 : 2.5;
      results.push(service.processMeasurement(bw, t));
      t += 2_000; // 2s intervals — never sustained 5s
    }

    // Should never switch due to hysteresis
    expect(service.getCurrentProfile()).toBe('balanced');
    expect(results.every((r) => r === null)).toBe(true);
  });

  it('should handle manual override during critical mode', () => {
    // Enter critical
    service.processMeasurement(0.3, baseTime);
    service.processMeasurement(0.3, baseTime + CRITICAL_ENTRY_DURATION_MS);
    expect(service.getCurrentProfile()).toBe('critical');

    // Manual override to balanced
    service.setManualOverride('balanced');
    expect(service.getCurrentProfile()).toBe('balanced');

    // Bandwidth is still low — should not auto-switch back to critical
    const result = service.processMeasurement(0.3, baseTime + 30_000);
    expect(result).toBeNull();
    expect(service.getCurrentProfile()).toBe('balanced');
  });

  it('should resume from manual override at correct profile based on bandwidth', () => {
    // Manual override to low
    service.setManualOverride('low');

    // Clear override while bandwidth is high
    service.setManualOverride(null);
    expect(service.getCurrentProfile()).toBe('low');

    // Automatic switching should now resume
    const t0 = baseTime + 50_000;
    service.processMeasurement(5.0, t0);
    const result = service.processMeasurement(5.0, t0 + HYSTERESIS_DURATION_MS);
    expect(result).toBe('high');
    expect(service.getCurrentProfile()).toBe('high');
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('should handle zero bandwidth', () => {
    expect(service.selectProfile(0)).toBe('critical');
  });

  it('should handle very large bandwidth values', () => {
    expect(service.selectProfile(1000)).toBe('high');
  });

  it('should handle negative bandwidth gracefully', () => {
    // Shouldn't happen in practice, but handle gracefully
    expect(service.selectProfile(-1)).toBe('critical');
  });

  it('should handle same timestamp for multiple measurements', () => {
    const result1 = service.processMeasurement(5.0, baseTime);
    const result2 = service.processMeasurement(5.0, baseTime);
    // 0 elapsed time — not enough for hysteresis
    expect(result1).toBeNull();
    expect(result2).toBeNull();
  });

  it('should not switch when processMeasurement called with current profile bandwidth', () => {
    // Default is balanced, measure in balanced range
    const results = simulateMeasurements(service, 2.5, 10, baseTime);
    expect(results.every((r) => r === null)).toBe(true);
    expect(service.getCurrentProfile()).toBe('balanced');
  });
});
