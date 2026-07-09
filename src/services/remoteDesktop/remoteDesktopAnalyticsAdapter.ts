/**
 * Remote Desktop Core — Analytics Engine Integration Adapter
 *
 * Exposes session data to the Analytics & Reporting Engine for the following KPIs:
 *
 *   1. Utilisation Rate — connected hours ÷ available hours per host per calendar month
 *   2. Revenue per Host — billing total per host per calendar month
 *   3. Session Reliability — successful connections ÷ total connection attempts per calendar month
 *   4. Average Bandwidth Utilisation — mean % of allocated bandwidth consumed per session
 *
 * All KPI functions accept a date range and optional hostId filter.
 * Return typed KPI objects following the platform analytics pattern.
 *
 * Requirements: 13.5
 */

import type { SessionRecord } from './sessionBrokerService';

// ─── Types ──────────────────────────────────────────────────────────────────────

/** Date range filter for KPI computation */
export interface DateRange {
  /** Start of range (ISO 8601 string or Unix ms) */
  from: string;
  /** End of range (ISO 8601 string or Unix ms) */
  to: string;
}

/** Optional filter parameters for KPI computation */
export interface KPIFilter {
  /** Restrict to a specific host */
  hostId?: string;
}

/** Host availability record (hours the host was online and ready) */
export interface HostAvailabilityRecord {
  hostId: string;
  /** Total hours the host was marked online/idle (available for sessions) */
  availableHours: number;
}

/** Billing record associated with a session for revenue computation */
export interface SessionBillingRecord {
  sessionId: string;
  hostId: string;
  /** Billed amount in ZAR */
  billedAmountZar: number;
}

/** Bandwidth measurement snapshot for a session */
export interface SessionBandwidthRecord {
  sessionId: string;
  hostId: string;
  /** Allocated bandwidth in Mbps for the session profile */
  allocatedBandwidthMbps: number;
  /** Mean consumed bandwidth in Mbps during the session */
  consumedBandwidthMbps: number;
}

/** Connection attempt record for reliability computation */
export interface ConnectionAttemptRecord {
  sessionId: string;
  hostId: string;
  /** Whether the connection was successfully established */
  successful: boolean;
}

// ─── KPI Result Types ───────────────────────────────────────────────────────────

export interface UtilisationRateKPI {
  name: 'rd_utilisation_rate';
  label: 'Utilisation Rate';
  connectedHours: number;
  availableHours: number;
  utilisationPercent: number;
  unit: 'percent';
  hostId?: string;
}

export interface RevenuePerHostKPI {
  name: 'rd_revenue_per_host';
  label: 'Revenue per Host';
  totalRevenueZar: number;
  sessionCount: number;
  averageRevenuePerSessionZar: number;
  unit: 'ZAR';
  hostId?: string;
}

export interface SessionReliabilityKPI {
  name: 'rd_session_reliability';
  label: 'Session Reliability';
  successfulConnections: number;
  totalAttempts: number;
  reliabilityPercent: number;
  unit: 'percent';
  hostId?: string;
}

export interface AverageBandwidthUtilisationKPI {
  name: 'rd_average_bandwidth_utilisation';
  label: 'Average Bandwidth Utilisation';
  meanBandwidthPercent: number;
  sessionCount: number;
  unit: 'percent';
  hostId?: string;
}

export type RemoteDesktopKPIResult =
  | UtilisationRateKPI
  | RevenuePerHostKPI
  | SessionReliabilityKPI
  | AverageBandwidthUtilisationKPI;

/** Aggregated result containing all 4 remote desktop KPIs */
export interface RemoteDesktopKPIComputationResult {
  computedAt: string;
  dateRange: DateRange;
  filter?: KPIFilter;
  kpis: RemoteDesktopKPIResult[];
  version: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const RD_KPI_VERSION = 1;

// ─── In-Memory Data Stores (backed by Firestore in production) ──────────────────

const sessionStore: SessionRecord[] = [];
const availabilityStore: HostAvailabilityRecord[] = [];
const billingStore: SessionBillingRecord[] = [];
const bandwidthStore: SessionBandwidthRecord[] = [];
const connectionAttemptStore: ConnectionAttemptRecord[] = [];

// ─── Helpers ────────────────────────────────────────────────────────────────────

function toMs(dateStr: string): number {
  return new Date(dateStr).getTime();
}

/**
 * Filter sessions by date range and optional hostId.
 * A session falls within the range if its startTimestamp is >= from and < to.
 */
function filterSessions(
  sessions: SessionRecord[],
  dateRange: DateRange,
  filter?: KPIFilter,
): SessionRecord[] {
  const fromMs = toMs(dateRange.from);
  const toMs_ = toMs(dateRange.to);

  return sessions.filter((s) => {
    if (s.startTimestamp === null) return false;
    if (s.startTimestamp < fromMs || s.startTimestamp >= toMs_) return false;
    if (filter?.hostId && s.hostId !== filter.hostId) return false;
    return true;
  });
}

/**
 * Filter records by hostId if provided.
 */
function filterByHost<T extends { hostId: string }>(
  records: T[],
  filter?: KPIFilter,
): T[] {
  if (!filter?.hostId) return records;
  return records.filter((r) => r.hostId === filter.hostId);
}

// ─── KPI 1: Utilisation Rate ────────────────────────────────────────────────────

/**
 * Compute utilisation rate: connected hours ÷ available hours.
 *
 * Connected hours = sum of totalConnectedSeconds across sessions in the range,
 * converted to hours. Available hours = sum of host availability hours in the range.
 *
 * Returns 0% if no available hours recorded.
 */
export function computeUtilisationRate(
  dateRange: DateRange,
  filter?: KPIFilter,
): UtilisationRateKPI {
  const sessions = filterSessions(sessionStore, dateRange, filter);
  const availability = filterByHost(availabilityStore, filter);

  const connectedSeconds = sessions.reduce(
    (sum, s) => sum + s.totalConnectedSeconds,
    0,
  );
  const connectedHours = connectedSeconds / 3600;
  const availableHours = availability.reduce(
    (sum, a) => sum + a.availableHours,
    0,
  );

  const utilisationPercent =
    availableHours > 0
      ? Math.round((connectedHours / availableHours) * 100 * 100) / 100
      : 0;

  return {
    name: 'rd_utilisation_rate',
    label: 'Utilisation Rate',
    connectedHours: Math.round(connectedHours * 100) / 100,
    availableHours: Math.round(availableHours * 100) / 100,
    utilisationPercent,
    unit: 'percent',
    hostId: filter?.hostId,
  };
}

// ─── KPI 2: Revenue per Host ────────────────────────────────────────────────────

/**
 * Compute revenue per host: total billing amount per host over the period.
 *
 * Sums billedAmountZar from billing records matching the filter.
 */
export function computeRevenuePerHost(
  dateRange: DateRange,
  filter?: KPIFilter,
): RevenuePerHostKPI {
  const sessions = filterSessions(sessionStore, dateRange, filter);
  const sessionIds = new Set(sessions.map((s) => s.sessionId));

  // Only include billing records for sessions within the date range
  const billingRecords = filterByHost(billingStore, filter).filter((b) =>
    sessionIds.has(b.sessionId),
  );

  const totalRevenueZar = billingRecords.reduce(
    (sum, b) => sum + b.billedAmountZar,
    0,
  );
  const sessionCount = billingRecords.length;
  const averageRevenuePerSessionZar =
    sessionCount > 0
      ? Math.round((totalRevenueZar / sessionCount) * 100) / 100
      : 0;

  return {
    name: 'rd_revenue_per_host',
    label: 'Revenue per Host',
    totalRevenueZar: Math.round(totalRevenueZar * 100) / 100,
    sessionCount,
    averageRevenuePerSessionZar,
    unit: 'ZAR',
    hostId: filter?.hostId,
  };
}

// ─── KPI 3: Session Reliability ─────────────────────────────────────────────────

/**
 * Compute session reliability: successful connections ÷ total connection attempts.
 *
 * A successful connection is one where the session reached 'active' or 'completed' status
 * (i.e., did not end in 'failed' without ever being active).
 */
export function computeSessionReliability(
  dateRange: DateRange,
  filter?: KPIFilter,
): SessionReliabilityKPI {
  const sessions = filterSessions(sessionStore, dateRange, filter);
  const sessionIds = new Set(sessions.map((s) => s.sessionId));

  // Use connection attempt records for precise tracking
  const attempts = filterByHost(connectionAttemptStore, filter).filter((a) =>
    sessionIds.has(a.sessionId),
  );

  let totalAttempts: number;
  let successfulConnections: number;

  if (attempts.length > 0) {
    // Use explicit connection attempt records
    totalAttempts = attempts.length;
    successfulConnections = attempts.filter((a) => a.successful).length;
  } else {
    // Fallback: derive from session status
    totalAttempts = sessions.length;
    successfulConnections = sessions.filter(
      (s) => s.status !== 'failed',
    ).length;
  }

  const reliabilityPercent =
    totalAttempts > 0
      ? Math.round((successfulConnections / totalAttempts) * 100 * 100) / 100
      : 0;

  return {
    name: 'rd_session_reliability',
    label: 'Session Reliability',
    successfulConnections,
    totalAttempts,
    reliabilityPercent,
    unit: 'percent',
    hostId: filter?.hostId,
  };
}

// ─── KPI 4: Average Bandwidth Utilisation ───────────────────────────────────────

/**
 * Compute average bandwidth utilisation: mean % of allocated bandwidth consumed per session.
 *
 * For each session, computes (consumed ÷ allocated) × 100, then averages across all sessions.
 */
export function computeAverageBandwidthUtilisation(
  dateRange: DateRange,
  filter?: KPIFilter,
): AverageBandwidthUtilisationKPI {
  const sessions = filterSessions(sessionStore, dateRange, filter);
  const sessionIds = new Set(sessions.map((s) => s.sessionId));

  const bandwidthRecords = filterByHost(bandwidthStore, filter).filter((b) =>
    sessionIds.has(b.sessionId),
  );

  let meanBandwidthPercent = 0;
  const sessionCount = bandwidthRecords.length;

  if (sessionCount > 0) {
    const totalPercent = bandwidthRecords.reduce((sum, b) => {
      if (b.allocatedBandwidthMbps <= 0) return sum;
      return sum + (b.consumedBandwidthMbps / b.allocatedBandwidthMbps) * 100;
    }, 0);
    meanBandwidthPercent = Math.round((totalPercent / sessionCount) * 100) / 100;
  }

  return {
    name: 'rd_average_bandwidth_utilisation',
    label: 'Average Bandwidth Utilisation',
    meanBandwidthPercent,
    sessionCount,
    unit: 'percent',
    hostId: filter?.hostId,
  };
}

// ─── Aggregate Computation ──────────────────────────────────────────────────────

/**
 * Compute all 4 Remote Desktop KPIs for a given date range and optional filter.
 *
 * Returns a typed result object following the platform analytics pattern.
 */
export function computeAllRemoteDesktopKPIs(
  dateRange: DateRange,
  filter?: KPIFilter,
): RemoteDesktopKPIComputationResult {
  const kpis: RemoteDesktopKPIResult[] = [
    computeUtilisationRate(dateRange, filter),
    computeRevenuePerHost(dateRange, filter),
    computeSessionReliability(dateRange, filter),
    computeAverageBandwidthUtilisation(dateRange, filter),
  ];

  return {
    computedAt: new Date().toISOString(),
    dateRange,
    filter,
    kpis,
    version: RD_KPI_VERSION,
  };
}

// ─── Data Ingestion (called by session lifecycle services) ──────────────────────

/**
 * Ingest a completed session record for KPI computation.
 */
export function ingestSessionRecord(session: SessionRecord): void {
  sessionStore.push(session);
}

/**
 * Ingest host availability data for utilisation computation.
 */
export function ingestHostAvailability(record: HostAvailabilityRecord): void {
  availabilityStore.push(record);
}

/**
 * Ingest a billing record for revenue computation.
 */
export function ingestBillingRecord(record: SessionBillingRecord): void {
  billingStore.push(record);
}

/**
 * Ingest a bandwidth measurement record for bandwidth utilisation computation.
 */
export function ingestBandwidthRecord(record: SessionBandwidthRecord): void {
  bandwidthStore.push(record);
}

/**
 * Ingest a connection attempt record for reliability computation.
 */
export function ingestConnectionAttempt(record: ConnectionAttemptRecord): void {
  connectionAttemptStore.push(record);
}

// ─── Observability ──────────────────────────────────────────────────────────────

/**
 * Get the current KPI version for remote desktop analytics.
 */
export function getRemoteDesktopKPIVersion(): number {
  return RD_KPI_VERSION;
}

/**
 * Get count of ingested session records (for observability).
 */
export function getIngestedSessionCount(): number {
  return sessionStore.length;
}

// ─── Test Utilities ─────────────────────────────────────────────────────────────

/**
 * Reset all in-memory data stores. Used in tests only.
 */
export function _resetAnalyticsAdapterState(): void {
  sessionStore.length = 0;
  availabilityStore.length = 0;
  billingStore.length = 0;
  bandwidthStore.length = 0;
  connectionAttemptStore.length = 0;
}
