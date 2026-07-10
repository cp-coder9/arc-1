/**
 * Host Agent — Heartbeat Service
 *
 * Sends periodic heartbeat signals to the Session Broker at 30-second intervals.
 * Reports host status, CPU utilisation, and available RAM.
 *
 * Responsibilities:
 * - Send heartbeat POST to /api/remote-desktop/hosts/:hostId/heartbeat every 30s
 * - Collect live system metrics (CPU utilisation via os.cpus(), available RAM via os.freemem())
 * - Track consecutive failures: 3 = "connection_lost" state
 * - Sync App_Allowlist and session policy from heartbeat acknowledgement
 * - Emit events: heartbeat_sent, heartbeat_ack, connection_lost, connection_restored
 *
 * Requirements: 1.2, 1.3, 1.4, 1.8
 */

import { EventEmitter } from 'events';
import * as os from 'os';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type HostStatus = 'idle' | 'in_session' | 'unavailable';

export interface HeartbeatPayload {
  hostId: string;
  status: HostStatus;
  cpuUtilisation: number;   // 0–100 percentage
  availableRamMb: number;   // Available RAM in megabytes
}

export interface HeartbeatAcknowledgement {
  hostId: string;
  status: string;
  lastHeartbeat: { seconds: number; nanoseconds: number };
  configVersion: number;
  allowlistVersion: number;
  sessionPolicy?: SessionPolicy;
  allowlist?: AllowlistEntry[];
}

export interface SessionPolicy {
  clipboardPolicy: 'enabled' | 'disabled';
  gracePeriodSeconds: number;
  sessionWorkspacePath: string;
  recordingEnabled: boolean;
}

export interface AllowlistEntry {
  appId: string;
  displayName: string;
  executablePath: string;
  softwareCategory: string;
}

export interface HeartbeatServiceConfig {
  hostId: string;
  brokerBaseUrl: string;
  intervalMs?: number;              // Default: 30000 (30 seconds)
  authToken: string;                // Bearer token for authentication
  maxConsecutiveFailures?: number;  // Default: 3
  onOwnerNotification?: (message: string) => void;
}

export interface HeartbeatState {
  status: HostStatus;
  consecutiveFailures: number;
  connectionLost: boolean;
  lastSuccessfulHeartbeat: number | null;  // Unix ms
  lastAttemptTimestamp: number | null;      // Unix ms
  currentAllowlistVersion: number;
  currentConfigVersion: number;
}

export type HeartbeatEvent =
  | 'heartbeat_sent'
  | 'heartbeat_ack'
  | 'connection_lost'
  | 'connection_restored';

// ─── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;
const OFFLINE_DETECTION_THRESHOLD_MS = 90_000;

// ─── CPU Utilisation Calculation ────────────────────────────────────────────────

interface CpuSnapshot {
  idle: number;
  total: number;
}

function getCpuSnapshot(): CpuSnapshot {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
  }

  return { idle, total };
}

// ─── HTTP Client Interface ──────────────────────────────────────────────────────

/**
 * Abstraction for HTTP requests to allow testing without network calls.
 */
export interface HttpClient {
  post(url: string, body: unknown, headers: Record<string, string>): Promise<HttpResponse>;
}

export interface HttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

/**
 * Default HTTP client using fetch.
 */
export class FetchHttpClient implements HttpClient {
  async post(url: string, body: unknown, headers: Record<string, string>): Promise<HttpResponse> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });

    return {
      ok: response.ok,
      status: response.status,
      json: () => response.json(),
    };
  }
}

// ─── HeartbeatService Class ─────────────────────────────────────────────────────

export class HeartbeatService extends EventEmitter {
  private readonly hostId: string;
  private readonly brokerBaseUrl: string;
  private readonly intervalMs: number;
  private readonly authToken: string;
  private readonly maxConsecutiveFailures: number;
  private readonly onOwnerNotification?: (message: string) => void;
  private readonly httpClient: HttpClient;

  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  private state: HeartbeatState = {
    status: 'idle',
    consecutiveFailures: 0,
    connectionLost: false,
    lastSuccessfulHeartbeat: null,
    lastAttemptTimestamp: null,
    currentAllowlistVersion: 0,
    currentConfigVersion: 0,
  };

  // For CPU utilisation calculation between intervals
  private lastCpuSnapshot: CpuSnapshot | null = null;

  // Synced data from broker
  private sessionPolicy: SessionPolicy | null = null;
  private allowlist: AllowlistEntry[] = [];

  constructor(config: HeartbeatServiceConfig, httpClient?: HttpClient) {
    super();
    this.hostId = config.hostId;
    this.brokerBaseUrl = config.brokerBaseUrl.replace(/\/$/, '');
    this.intervalMs = config.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.authToken = config.authToken;
    this.maxConsecutiveFailures = config.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES;
    this.onOwnerNotification = config.onOwnerNotification;
    this.httpClient = httpClient ?? new FetchHttpClient();

    // Take initial CPU snapshot for delta calculation
    this.lastCpuSnapshot = getCpuSnapshot();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Start the heartbeat loop. Sends an immediate heartbeat, then every intervalMs.
   */
  start(): void {
    if (this.running) return;

    this.running = true;

    // Send immediately, then at interval
    this.sendHeartbeat();
    this.timer = setInterval(() => this.sendHeartbeat(), this.intervalMs);
  }

  /**
   * Stop the heartbeat loop.
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Get the current host status.
   */
  getCurrentStatus(): HostStatus {
    return this.state.status;
  }

  /**
   * Set the host status (e.g., when a session starts/ends).
   */
  setStatus(status: HostStatus): void {
    this.state.status = status;
  }

  /**
   * Get the last successful heartbeat timestamp (Unix ms) or null if none.
   */
  getLastHeartbeat(): number | null {
    return this.state.lastSuccessfulHeartbeat;
  }

  /**
   * Get the full internal state (for diagnostics/testing).
   */
  getState(): Readonly<HeartbeatState> {
    return { ...this.state };
  }

  /**
   * Check if the service is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Check if connectivity to the broker has been lost.
   */
  isConnectionLost(): boolean {
    return this.state.connectionLost;
  }

  /**
   * Get the currently synced session policy (from last ack).
   */
  getSessionPolicy(): SessionPolicy | null {
    return this.sessionPolicy;
  }

  /**
   * Get the currently synced allowlist (from last ack).
   */
  getAllowlist(): AllowlistEntry[] {
    return [...this.allowlist];
  }

  // ─── Private Methods ────────────────────────────────────────────────────────

  /**
   * Collect system metrics and send heartbeat to Session Broker.
   */
  private async sendHeartbeat(): Promise<void> {
    const payload = this.buildPayload();
    this.state.lastAttemptTimestamp = Date.now();

    this.emit('heartbeat_sent', payload);

    try {
      const url = `${this.brokerBaseUrl}/api/remote-desktop/hosts/${this.hostId}/heartbeat`;
      const response = await this.httpClient.post(url, {
        status: this.mapStatusForBroker(payload.status),
        cpuUtilisation: payload.cpuUtilisation,
        availableRamMb: payload.availableRamMb,
      }, {
        Authorization: `Bearer ${this.authToken}`,
      });

      if (response.ok) {
        this.handleSuccess(await response.json() as HeartbeatAcknowledgement);
      } else {
        this.handleFailure(`HTTP ${response.status}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.handleFailure(message);
    }
  }

  /**
   * Build the heartbeat payload with current system metrics.
   */
  private buildPayload(): HeartbeatPayload {
    return {
      hostId: this.hostId,
      status: this.state.status,
      cpuUtilisation: this.measureCpuUtilisation(),
      availableRamMb: this.measureAvailableRam(),
    };
  }

  /**
   * Measure CPU utilisation as a percentage (0–100) using delta between snapshots.
   */
  private measureCpuUtilisation(): number {
    const currentSnapshot = getCpuSnapshot();

    if (!this.lastCpuSnapshot) {
      this.lastCpuSnapshot = currentSnapshot;
      return 0;
    }

    const idleDelta = currentSnapshot.idle - this.lastCpuSnapshot.idle;
    const totalDelta = currentSnapshot.total - this.lastCpuSnapshot.total;

    this.lastCpuSnapshot = currentSnapshot;

    if (totalDelta === 0) return 0;

    const utilisation = ((totalDelta - idleDelta) / totalDelta) * 100;
    return Math.round(Math.min(100, Math.max(0, utilisation)));
  }

  /**
   * Measure available RAM in megabytes.
   */
  private measureAvailableRam(): number {
    return Math.round(os.freemem() / (1024 * 1024));
  }

  /**
   * Map internal HostStatus to broker-expected status enum.
   * The broker schema uses 'online' | 'offline' | 'in_session'.
   */
  private mapStatusForBroker(status: HostStatus): string {
    switch (status) {
      case 'idle':
        return 'online';
      case 'in_session':
        return 'in_session';
      case 'unavailable':
        return 'offline';
    }
  }

  /**
   * Handle a successful heartbeat acknowledgement.
   */
  private handleSuccess(ack: HeartbeatAcknowledgement): void {
    const wasConnectionLost = this.state.connectionLost;

    // Reset failure tracking
    this.state.consecutiveFailures = 0;
    this.state.connectionLost = false;
    this.state.lastSuccessfulHeartbeat = Date.now();

    // Sync allowlist and session policy from acknowledgement
    this.syncFromAcknowledgement(ack);

    // Emit acknowledgement event
    this.emit('heartbeat_ack', ack);

    // If connection was previously lost, emit restoration
    if (wasConnectionLost) {
      this.emit('connection_restored');
      this.onOwnerNotification?.('Connection to Architex platform restored.');
    }
  }

  /**
   * Handle a heartbeat delivery failure.
   */
  private handleFailure(reason: string): void {
    this.state.consecutiveFailures += 1;

    // Check if we've hit the threshold for connection_lost
    if (
      this.state.consecutiveFailures >= this.maxConsecutiveFailures &&
      !this.state.connectionLost
    ) {
      this.state.connectionLost = true;
      this.emit('connection_lost', { reason, consecutiveFailures: this.state.consecutiveFailures });
      this.onOwnerNotification?.(
        `Lost connectivity to Architex platform after ${this.state.consecutiveFailures} failed heartbeats. Will continue retrying.`
      );
    }
  }

  /**
   * Sync App_Allowlist and session policy from heartbeat acknowledgement.
   * Requirement 1.4: Replace locally cached policy with version from acknowledgement.
   */
  private syncFromAcknowledgement(ack: HeartbeatAcknowledgement): void {
    // Update allowlist if a new version is available
    if (ack.allowlistVersion && ack.allowlistVersion > this.state.currentAllowlistVersion) {
      this.state.currentAllowlistVersion = ack.allowlistVersion;
      if (ack.allowlist) {
        this.allowlist = ack.allowlist;
      }
    }

    // Update session policy if a new version is available
    if (ack.configVersion && ack.configVersion > this.state.currentConfigVersion) {
      this.state.currentConfigVersion = ack.configVersion;
      if (ack.sessionPolicy) {
        this.sessionPolicy = ack.sessionPolicy;
      }
    }
  }
}

// ─── Broker-Side Offline Detection ──────────────────────────────────────────────

/**
 * Broker-side function: check if a host should be marked offline.
 * Called by the Session Broker to evaluate host connectivity.
 *
 * Requirement 1.3: If no heartbeat for 90 seconds, mark host "offline".
 *
 * @param lastHeartbeatMs - Unix ms timestamp of the last received heartbeat
 * @param currentTimeMs - Current time in Unix ms (injectable for testing)
 * @returns true if the host should be marked offline
 */
export function shouldMarkHostOffline(
  lastHeartbeatMs: number,
  currentTimeMs?: number,
): boolean {
  const now = currentTimeMs ?? Date.now();
  return (now - lastHeartbeatMs) >= OFFLINE_DETECTION_THRESHOLD_MS;
}

/**
 * Broker-side offline detection threshold in milliseconds.
 */
export function getOfflineThresholdMs(): number {
  return OFFLINE_DETECTION_THRESHOLD_MS;
}
