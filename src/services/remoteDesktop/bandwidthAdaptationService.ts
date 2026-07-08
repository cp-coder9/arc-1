/**
 * Bandwidth Adaptation Service
 *
 * Implements encoding profile selection based on measured bandwidth conditions,
 * with hysteresis to prevent rapid profile switching on fluctuating connections.
 * Designed for South African network constraints where bandwidth can vary widely.
 *
 * Profile Thresholds:
 * - High:     ≥ 4 Mbps     → 1080p, 30fps
 * - Balanced: 1.5–4 Mbps   → 720p, 24fps
 * - Low:      0.5–1.5 Mbps → 480p, 15fps
 * - Critical: < 0.5 Mbps   → 360p, 10fps (sustained 10s entry, 15s exit at ≥1.0 Mbps)
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.7, 10.8
 */

// ─── Types ──────────────────────────────────────────────────────────────────────

export type QualityProfile = 'high' | 'balanced' | 'low' | 'critical';

export interface ProfileConfig {
  resolution: string;
  fps: number;
  minBandwidthMbps: number;
  maxBandwidthMbps: number;
}

export interface BandwidthMeasurement {
  bandwidthMbps: number;
  timestamp: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Profile threshold boundaries in Mbps */
export const PROFILE_THRESHOLDS = {
  high: 4.0,       // ≥ 4 Mbps
  balanced: 1.5,   // 1.5–4 Mbps
  low: 0.5,        // 0.5–1.5 Mbps
  critical: 0.5,   // < 0.5 Mbps
} as const;

/** Critical mode entry: bandwidth < 500Kbps sustained for 10 seconds */
export const CRITICAL_ENTRY_DURATION_MS = 10_000;

/** Critical mode exit: bandwidth ≥ 1.0 Mbps sustained for 15 seconds */
export const CRITICAL_EXIT_DURATION_MS = 15_000;
export const CRITICAL_EXIT_THRESHOLD_MBPS = 1.0;

/** Hysteresis: threshold crossing must be sustained for 5 seconds */
export const HYSTERESIS_DURATION_MS = 5_000;

/** Measurement interval (5 seconds) */
export const MEASUREMENT_INTERVAL_MS = 5_000;

/** Default profile before initial measurement completes */
export const DEFAULT_PROFILE: QualityProfile = 'balanced';

/** Profile configurations for display/encoding */
export const PROFILE_CONFIGS: Record<QualityProfile, ProfileConfig> = {
  high: { resolution: '1080p', fps: 30, minBandwidthMbps: 4.0, maxBandwidthMbps: Infinity },
  balanced: { resolution: '720p', fps: 24, minBandwidthMbps: 1.5, maxBandwidthMbps: 4.0 },
  low: { resolution: '480p', fps: 15, minBandwidthMbps: 0.5, maxBandwidthMbps: 1.5 },
  critical: { resolution: '360p', fps: 10, minBandwidthMbps: 0, maxBandwidthMbps: 0.5 },
};

// ─── Service Class ──────────────────────────────────────────────────────────────

export class BandwidthAdaptationService {
  private currentProfile: QualityProfile = DEFAULT_PROFILE;
  private manualOverride: QualityProfile | null = null;
  private initialMeasurementComplete = false;

  /**
   * Tracks when the bandwidth first crossed into a different profile's range.
   * null means no pending transition.
   */
  private pendingTransition: {
    targetProfile: QualityProfile;
    startTimestamp: number;
  } | null = null;

  /**
   * Tracks when bandwidth first rose above the critical exit threshold.
   * Used for the 15-second sustained exit requirement.
   */
  private criticalExitStart: number | null = null;

  /**
   * Tracks when bandwidth first dropped below critical entry threshold.
   * Used for the 10-second sustained entry requirement.
   */
  private criticalEntryStart: number | null = null;

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Pure function: selects the appropriate profile based on bandwidth measurement.
   * Does NOT apply hysteresis — use processMeasurement() for stateful switching.
   */
  selectProfile(bandwidthMbps: number): QualityProfile {
    if (bandwidthMbps >= PROFILE_THRESHOLDS.high) {
      return 'high';
    }
    if (bandwidthMbps >= PROFILE_THRESHOLDS.balanced) {
      return 'balanced';
    }
    if (bandwidthMbps >= PROFILE_THRESHOLDS.low) {
      return 'low';
    }
    return 'critical';
  }

  /**
   * Processes a bandwidth measurement and returns a new profile if a switch
   * should occur, or null if no change is needed.
   *
   * Applies hysteresis: a threshold crossing must be sustained for 5 seconds
   * before switching profiles. Critical mode has special entry (10s) and exit (15s)
   * requirements.
   *
   * If manual override is active, returns null (no automatic switching).
   */
  processMeasurement(bandwidthMbps: number, timestamp: number): QualityProfile | null {
    // Mark initial measurement as complete on first call
    if (!this.initialMeasurementComplete) {
      this.initialMeasurementComplete = true;
    }

    // Manual override suspends automatic switching
    if (this.manualOverride !== null) {
      return null;
    }

    const targetProfile = this.selectProfile(bandwidthMbps);

    // Handle critical mode entry/exit separately
    if (this.currentProfile === 'critical') {
      return this.processCriticalExit(bandwidthMbps, timestamp);
    }

    if (targetProfile === 'critical') {
      return this.processCriticalEntry(bandwidthMbps, timestamp);
    }

    // Standard profile switching with hysteresis
    // Reset critical entry tracking since bandwidth is above critical threshold
    this.criticalEntryStart = null;

    if (targetProfile === this.currentProfile) {
      // No change needed, reset pending transition
      this.pendingTransition = null;
      return null;
    }

    // Check if we're already tracking a transition to this target
    if (this.pendingTransition && this.pendingTransition.targetProfile === targetProfile) {
      const elapsed = timestamp - this.pendingTransition.startTimestamp;
      if (elapsed >= HYSTERESIS_DURATION_MS) {
        // Sustained long enough — switch profile
        this.currentProfile = targetProfile;
        this.pendingTransition = null;
        return targetProfile;
      }
      // Still waiting for hysteresis period
      return null;
    }

    // Start tracking a new transition
    this.pendingTransition = {
      targetProfile,
      startTimestamp: timestamp,
    };
    return null;
  }

  /**
   * Sets a manual override profile, suspending automatic switching.
   * Pass null to clear the override and re-enable automatic adaptation.
   */
  setManualOverride(profile: QualityProfile | null): void {
    this.manualOverride = profile;

    if (profile !== null) {
      // Apply the manual profile immediately
      this.currentProfile = profile;
      // Clear any pending transitions
      this.pendingTransition = null;
      this.criticalEntryStart = null;
      this.criticalExitStart = null;
    }
  }

  /**
   * Returns whether a manual override is currently active.
   */
  isManualOverride(): boolean {
    return this.manualOverride !== null;
  }

  /**
   * Returns the current active profile.
   */
  getCurrentProfile(): QualityProfile {
    return this.currentProfile;
  }

  /**
   * Returns whether the initial measurement has been completed.
   */
  isInitialMeasurementComplete(): boolean {
    return this.initialMeasurementComplete;
  }

  /**
   * Resets the service to its initial state.
   */
  reset(): void {
    this.currentProfile = DEFAULT_PROFILE;
    this.manualOverride = null;
    this.initialMeasurementComplete = false;
    this.pendingTransition = null;
    this.criticalExitStart = null;
    this.criticalEntryStart = null;
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Handles entering Critical mode.
   * Bandwidth must remain < 500Kbps for 10 seconds sustained.
   */
  private processCriticalEntry(bandwidthMbps: number, timestamp: number): QualityProfile | null {
    if (bandwidthMbps < PROFILE_THRESHOLDS.critical) {
      // Bandwidth is below critical threshold
      if (this.criticalEntryStart === null) {
        this.criticalEntryStart = timestamp;
      }

      const elapsed = timestamp - this.criticalEntryStart;
      if (elapsed >= CRITICAL_ENTRY_DURATION_MS) {
        // Sustained below threshold long enough — enter critical
        this.currentProfile = 'critical';
        this.criticalEntryStart = null;
        this.pendingTransition = null;
        return 'critical';
      }
      return null;
    }

    // Bandwidth recovered above critical threshold — reset entry tracking
    this.criticalEntryStart = null;

    // Apply standard hysteresis for non-critical transitions
    const targetProfile = this.selectProfile(bandwidthMbps);
    if (targetProfile === this.currentProfile) {
      this.pendingTransition = null;
      return null;
    }

    if (this.pendingTransition && this.pendingTransition.targetProfile === targetProfile) {
      const elapsed = timestamp - this.pendingTransition.startTimestamp;
      if (elapsed >= HYSTERESIS_DURATION_MS) {
        this.currentProfile = targetProfile;
        this.pendingTransition = null;
        return targetProfile;
      }
      return null;
    }

    this.pendingTransition = {
      targetProfile,
      startTimestamp: timestamp,
    };
    return null;
  }

  /**
   * Handles exiting Critical mode.
   * Bandwidth must remain ≥ 1.0 Mbps for 15 seconds sustained.
   */
  private processCriticalExit(bandwidthMbps: number, timestamp: number): QualityProfile | null {
    if (bandwidthMbps >= CRITICAL_EXIT_THRESHOLD_MBPS) {
      // Bandwidth is above exit threshold
      if (this.criticalExitStart === null) {
        this.criticalExitStart = timestamp;
      }

      const elapsed = timestamp - this.criticalExitStart;
      if (elapsed >= CRITICAL_EXIT_DURATION_MS) {
        // Sustained above threshold long enough — exit critical
        const newProfile = this.selectProfile(bandwidthMbps);
        this.currentProfile = newProfile;
        this.criticalExitStart = null;
        return newProfile;
      }
      return null;
    }

    // Bandwidth dropped back below exit threshold — reset exit tracking
    this.criticalExitStart = null;
    return null;
  }
}

// ─── Singleton Export ───────────────────────────────────────────────────────────

/**
 * Default singleton instance for use across the application.
 * For testing, instantiate BandwidthAdaptationService directly.
 */
export const bandwidthAdaptationService = new BandwidthAdaptationService();
