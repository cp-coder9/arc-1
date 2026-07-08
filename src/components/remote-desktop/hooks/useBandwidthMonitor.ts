/**
 * useBandwidthMonitor — Connection quality metrics hook
 *
 * Monitors an active RTCPeerConnection to surface real-time network
 * quality indicators for the Browser Viewer session control bar:
 * - latencyMs: current round-trip time in milliseconds (nearest integer)
 * - bandwidthMbps: estimated inbound bandwidth in Mbps (1 decimal place)
 * - quality: derived quality tier based on latency and bandwidth thresholds
 *
 * Polls RTCPeerConnection.getStats() every 5 seconds (≤5s update interval).
 *
 * Quality thresholds:
 *   good — latency <100ms AND bandwidth ≥4 Mbps
 *   fair — latency <200ms OR bandwidth ≥1.5 Mbps
 *   poor — otherwise
 *   unknown — no measurements available yet
 *
 * Requirements: 10.6
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type ConnectionQuality = 'good' | 'fair' | 'poor' | 'unknown';

export interface UseBandwidthMonitorParams {
  /** The active RTCPeerConnection to monitor (null when not connected) */
  peerConnection: RTCPeerConnection | null;
}

export interface UseBandwidthMonitorResult {
  /** Current round-trip latency in milliseconds (nearest integer), null if unavailable */
  latencyMs: number | null;
  /** Estimated inbound bandwidth in Mbps (1 decimal place), null if unavailable */
  bandwidthMbps: number | null;
  /** Derived connection quality tier */
  quality: ConnectionQuality;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Polling interval in milliseconds (5 seconds) */
const POLL_INTERVAL_MS = 5_000;

/** Quality threshold: latency must be below this for "good" (ms) */
const GOOD_LATENCY_THRESHOLD_MS = 100;

/** Quality threshold: bandwidth must be at or above this for "good" (Mbps) */
const GOOD_BANDWIDTH_THRESHOLD_MBPS = 4;

/** Quality threshold: latency below this qualifies for "fair" (ms) */
const FAIR_LATENCY_THRESHOLD_MS = 200;

/** Quality threshold: bandwidth at or above this qualifies for "fair" (Mbps) */
const FAIR_BANDWIDTH_THRESHOLD_MBPS = 1.5;

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Determine the connection quality tier from latency and bandwidth.
 */
function deriveQuality(latencyMs: number | null, bandwidthMbps: number | null): ConnectionQuality {
  if (latencyMs === null || bandwidthMbps === null) {
    return 'unknown';
  }

  // Good: latency <100ms AND bandwidth ≥4 Mbps
  if (latencyMs < GOOD_LATENCY_THRESHOLD_MS && bandwidthMbps >= GOOD_BANDWIDTH_THRESHOLD_MBPS) {
    return 'good';
  }

  // Fair: latency <200ms OR bandwidth ≥1.5 Mbps
  if (latencyMs < FAIR_LATENCY_THRESHOLD_MS || bandwidthMbps >= FAIR_BANDWIDTH_THRESHOLD_MBPS) {
    return 'fair';
  }

  // Poor: everything else
  return 'poor';
}

/**
 * Round a number to 1 decimal place.
 */
function roundTo1Decimal(value: number): number {
  return Math.round(value * 10) / 10;
}

// ─── Hook Implementation ────────────────────────────────────────────────────────

export function useBandwidthMonitor({
  peerConnection,
}: UseBandwidthMonitorParams): UseBandwidthMonitorResult {
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [bandwidthMbps, setBandwidthMbps] = useState<number | null>(null);
  const [quality, setQuality] = useState<ConnectionQuality>('unknown');

  // Track previous bytesReceived and timestamp for bandwidth delta calculation
  const prevBytesReceivedRef = useRef<number | null>(null);
  const prevTimestampRef = useRef<number | null>(null);

  const pollStats = useCallback(async () => {
    if (!peerConnection) return;

    try {
      const stats = await peerConnection.getStats();

      let currentRoundTripTime: number | null = null;
      let totalBytesReceived: number | null = null;

      stats.forEach((report) => {
        // Extract latency from candidate-pair stats
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          if (typeof report.currentRoundTripTime === 'number') {
            // currentRoundTripTime is in seconds, convert to ms
            currentRoundTripTime = Math.round(report.currentRoundTripTime * 1000);
          }
        }

        // Extract bytesReceived from inbound-rtp stats
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          if (typeof report.bytesReceived === 'number') {
            // Accumulate all video inbound-rtp bytesReceived
            totalBytesReceived = (totalBytesReceived ?? 0) + report.bytesReceived;
          }
        }
      });

      // Update latency
      const newLatencyMs = currentRoundTripTime;
      setLatencyMs(newLatencyMs);

      // Calculate bandwidth from bytesReceived delta
      let newBandwidthMbps: number | null = null;
      const nowMs = Date.now();

      if (
        totalBytesReceived !== null &&
        prevBytesReceivedRef.current !== null &&
        prevTimestampRef.current !== null
      ) {
        const bytesDelta = totalBytesReceived - prevBytesReceivedRef.current;
        const timeDeltaSeconds = (nowMs - prevTimestampRef.current) / 1000;

        if (timeDeltaSeconds > 0 && bytesDelta >= 0) {
          // Convert bytes/second to Mbps: (bytes * 8) / (1_000_000) = Mbps
          const bitsPerSecond = (bytesDelta * 8) / timeDeltaSeconds;
          const mbps = bitsPerSecond / 1_000_000;
          newBandwidthMbps = roundTo1Decimal(mbps);
        }
      }

      setBandwidthMbps(newBandwidthMbps);

      // Store current values for next delta calculation
      prevBytesReceivedRef.current = totalBytesReceived;
      prevTimestampRef.current = nowMs;

      // Derive quality from new measurements
      setQuality(deriveQuality(newLatencyMs, newBandwidthMbps));
    } catch {
      // If getStats() fails (e.g. connection closed), reset to unknown
      setLatencyMs(null);
      setBandwidthMbps(null);
      setQuality('unknown');
    }
  }, [peerConnection]);

  useEffect(() => {
    // Reset state when peerConnection changes
    setLatencyMs(null);
    setBandwidthMbps(null);
    setQuality('unknown');
    prevBytesReceivedRef.current = null;
    prevTimestampRef.current = null;

    if (!peerConnection) return;

    // Do an initial poll immediately
    pollStats();

    // Set up polling interval (every 5 seconds)
    const intervalId = setInterval(pollStats, POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [peerConnection, pollStats]);

  return { latencyMs, bandwidthMbps, quality };
}

export default useBandwidthMonitor;
