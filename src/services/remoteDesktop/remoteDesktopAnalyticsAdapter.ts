/**
 * Remote Desktop Core — Analytics Engine Integration Adapter
 *
 * Exposes session data to the Analytics & Reporting Engine for the following KPIs:
 *
 *   1. Utilisation Rate — connected hours ÷ available hours per host per calendar month
 *   2. Revenue per Host — billing total per host per calendar month
 *   3. Session Reliability — successful connections ÷ total connection attempts per calendar month
 *   4. Average Bandwidth Utilisation — mean % of allocated bandwidth consumed per session
 *   5. Average Session Duration — mean session duration in minutes
 *   6. Incident Rate — incidents raised per 100 sessions
 *
 * All KPI functions accept host-scoped parameters with a date range.
 * Return typed KPI objects following the platform analytics pattern.
 *
 * Requirements: 13.5, 14 (Platform Integration — Analytics)
 */

import type { SessionRecord } from './sessionBrokerService';

// ─── Types ──────────────────────────────────────────────────────────────────────

/** Session data shape for analytics computation */
export interface SessionAnalyticsRecord {
  sessionId: string;
  hostId: string;
  status: string;
  totalConnectedSeconds: number;
  connectionType: string;
  bandwidthUtilisationPercent?: number;
  startTimestamp: number | null;
  endTimestamp: number | null;
}

/** Host availability record (hours the host was online and ready) */
export interface HostAvailabilityRecord {
  hostId: string;
  /** Total hours the host was marked online/idle (available for sessions) */
  availableHours: number;
}

/** Billing record associated with a session for revenue computation */
export interface HostBillingRecord {
  hostId: string;
  sessionId: string;
  /** Billed amount in ZAR */
  billedAmountZar: number;
}

/** Incident record for incident rate computation */
export interface SessionIncidentRecord {
  sessionId: string;
  hostId: string;
  incidentId: string;
  category: string;
  createdAt: string;
}

/** Input required to compute all KPIs for a single host */
export interface ComputeHostKPIsInput {
  hostId: string;
  sessions: SessionAnalyticsRecord[];
  availability: HostAvailabilityRecord;
  billing: HostBillingRecord[];
  incidents?: SessionIncidentRecord[];
  periodStart: string;
  periodEnd: string;
}

// ─── KPI Result Types ───────────────────────────────────────────────────────────

export interface UtilisationRateKPI {
  name: 'rd_utilisation_rate';
  label: 'Utilisation Rate';
  connectedHours: number;
  availableHours: number;
  utilisationPercent: number;
  unit: 'percent';
  hostId: string;
  periodStart: string;
  periodEnd: string;
}

export interface RevenuePerHostKPI {
  name: 'rd_revenue_per_host';
  label: 'Revenue per Host';
  totalRevenueZar: number;
  sessionCount: number;
  averageRevenuePerSessionZar: number;
  unit: 'ZAR';
  hostId: string;
  periodStart: string;
  periodEnd: string;
}

export interface SessionReliabilityKPI {
  name: 'rd_session_reliability';
  label: 'Session Reliability';
  successfulConnections: number;
  totalConnectionAttempts: number;
  reliabilityPercent: number;
  unit: 'percent';
  hostId: string;
  periodStart: string;
  periodEnd: string;
}

export interface AverageBandwidthUtilisationKPI {
  name: 'rd_average_bandwidth_utilisation';
  label: 'Average Bandwidth Utilisation';
  averageUtilisationPercent: number;
  sessionsWithData: number;
  unit: 'percent';
  hostId: string;
  periodStart: string;
  periodEnd: string;
}

export interface AverageSessionDurationKPI {
  name: 'rd_average_session_duration';
  label: 'Average Session Duration';
  averageDurationMinutes: number;
  sessionCount: number;
  unit: 'minutes';
  hostId: string;
  periodStart: string;
  periodEnd: string;
}

export interface IncidentRateKPI {
  name: 'rd_incident_rate';
  label: 'Incident Rate';
  incidentCount: number;
  sessionCount: number;
  incidentsPer100Sessions: number;
  unit: 'per_100_sessions';
  hostId: string;
  periodStart: string;
  periodEnd: string;
}

export type RemoteDesktopKPIResult =
  | UtilisationRateKPI
  | RevenuePerHostKPI
  | SessionReliabilityKPI
  | AverageBandwidthUtilisationKPI
  | AverageSessionDurationKPI
  | IncidentRateKPI;

/** Aggregated result containing all remote desktop KPIs for a host */
export interface HostKPIComputationResult {
  hostId: string;
  kpis: RemoteDesktopKPIResult[];
  periodStart: string;
  periodEnd: string;
  computedAt: string;
  version: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

export const RD_KPI_VERSION = 1;

// ─── In-Memory KPI Store ────────────────────────────────────────────────────────

const kpiStore: Map<string, HostKPIComputationResult[]> = new Map();

// ─── Helpers ────────────────────────────────────────────────────────────────────

function storeKey(hostId: string): string {
  return hostId;
}

function filterSessionsByHost(sessions: SessionAnalyticsRecord[], hostId: string): SessionAnalyticsRecord[] {
  return sessions.filter((s) => s.hostId === hostId);
}

function filterBillingByHost(billing: HostBillingRecord[], hostId: string): HostBillingRecord[] {
  return billing.filter((b) => b.hostId === hostId);
}

function filterIncidentsByHost(incidents: SessionIncidentRecord[], hostId: string): SessionIncidentRecord[] {
  return incidents.filter((i) => i.hostId === hostId);
}

function isSuccessfulSession(status: string): boolean {
  return status !== 'failed';
}

// ─── KPI 1: Utilisation Rate ────────────────────────────────────────────────────

/**
 * Compute utilisation rate: connected hours ÷ available hours.
 *
 * Connected hours = sum of totalConnectedSeconds across sessions for the host,
 * converted to hours. Available hours = host availability record value.
 *
 * Returns 0% if no available hours recorded.
 */
export function computeUtilisationRate(
  hostId: string,
  sessions: SessionAnalyticsRecord[],
  availability: HostAvailabilityRecord,
  periodStart: string,
  periodEnd: string,
): UtilisationRateKPI {
  const hostSessions = filterSessionsByHost(sessions, hostId);

  const connectedSeconds = hostSessions.reduce(
    (sum, s) => sum + s.totalConnectedSeconds,
    0,
  );
  const connectedHours = connectedSeconds / 3600;
  const availableHours = availability.availableHours;

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
    hostId,
    periodStart,
    periodEnd,
  };
}

// ─── KPI 2: Revenue per Host ────────────────────────────────────────────────────

/**
 * Compute revenue per host: total billing amount per host over the period.
 *
 * Sums billedAmountZar from billing records matching the host.
 */
export function computeRevenuePerHost(
  hostId: string,
  billing: HostBillingRecord[],
  sessions: SessionAnalyticsRecord[],
  periodStart: string,
  periodEnd: string,
): RevenuePerHostKPI {
  const hostBilling = filterBillingByHost(billing, hostId);
  const hostSessions = filterSessionsByHost(sessions, hostId);

  const totalRevenueZar = hostBilling.reduce(
    (sum, b) => sum + b.billedAmountZar,
    0,
  );
  const sessionCount = hostSessions.length;
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
    hostId,
    periodStart,
    periodEnd,
  };
}

// ─── KPI 3: Session Reliability ─────────────────────────────────────────────────

/**
 * Compute session reliability: successful connections ÷ total connection attempts.
 *
 * A successful connection is any session that did not end in 'failed' status.
 */
export function computeSessionReliability(
  hostId: string,
  sessions: SessionAnalyticsRecord[],
  periodStart: string,
  periodEnd: string,
): SessionReliabilityKPI {
  const hostSessions = filterSessionsByHost(sessions, hostId);

  const totalConnectionAttempts = hostSessions.length;
  const successfulConnections = hostSessions.filter(
    (s) => isSuccessfulSession(s.status),
  ).length;

  const reliabilityPercent =
    totalConnectionAttempts > 0
      ? Math.round((successfulConnections / totalConnectionAttempts) * 100 * 100) / 100
      : 0;

  return {
    name: 'rd_session_reliability',
    label: 'Session Reliability',
    successfulConnections,
    totalConnectionAttempts,
    reliabilityPercent,
    unit: 'percent',
    hostId,
    periodStart,
    periodEnd,
  };
}

// ─── KPI 4: Average Bandwidth Utilisation ───────────────────────────────────────

/**
 * Compute average bandwidth utilisation: mean % of allocated bandwidth consumed per session.
 *
 * Only includes sessions that have bandwidth data (bandwidthUtilisationPercent defined).
 */
export function computeAverageBandwidthUtilisation(
  hostId: string,
  sessions: SessionAnalyticsRecord[],
  periodStart: string,
  periodEnd: string,
): AverageBandwidthUtilisationKPI {
  const hostSessions = filterSessionsByHost(sessions, hostId);

  const sessionsWithData = hostSessions.filter(
    (s) => s.bandwidthUtilisationPercent !== undefined,
  );

  let averageUtilisationPercent = 0;
  const count = sessionsWithData.length;

  if (count > 0) {
    const totalPercent = sessionsWithData.reduce(
      (sum, s) => sum + (s.bandwidthUtilisationPercent ?? 0),
      0,
    );
    averageUtilisationPercent = Math.round((totalPercent / count) * 100) / 100;
  }

  return {
    name: 'rd_average_bandwidth_utilisation',
    label: 'Average Bandwidth Utilisation',
    averageUtilisationPercent,
    sessionsWithData: count,
    unit: 'percent',
    hostId,
    periodStart,
    periodEnd,
  };
}

// ─── KPI 5: Average Session Duration ────────────────────────────────────────────

/**
 * Compute average session duration in minutes across all sessions for the host.
 *
 * Only includes sessions with totalConnectedSeconds > 0.
 */
export function computeAverageSessionDuration(
  hostId: string,
  sessions: SessionAnalyticsRecord[],
  periodStart: string,
  periodEnd: string,
): AverageSessionDurationKPI {
  const hostSessions = filterSessionsByHost(sessions, hostId);
  const activeSessions = hostSessions.filter((s) => s.totalConnectedSeconds > 0);

  let averageDurationMinutes = 0;
  const sessionCount = activeSessions.length;

  if (sessionCount > 0) {
    const totalMinutes = activeSessions.reduce(
      (sum, s) => sum + s.totalConnectedSeconds / 60,
      0,
    );
    averageDurationMinutes = Math.round((totalMinutes / sessionCount) * 100) / 100;
  }

  return {
    name: 'rd_average_session_duration',
    label: 'Average Session Duration',
    averageDurationMinutes,
    sessionCount,
    unit: 'minutes',
    hostId,
    periodStart,
    periodEnd,
  };
}

// ─── KPI 6: Incident Rate ───────────────────────────────────────────────────────

/**
 * Compute incident rate: incidents raised per 100 sessions.
 *
 * incidentsPer100Sessions = (incidentCount / sessionCount) * 100
 */
export function computeIncidentRate(
  hostId: string,
  sessions: SessionAnalyticsRecord[],
  incidents: SessionIncidentRecord[],
  periodStart: string,
  periodEnd: string,
): IncidentRateKPI {
  const hostSessions = filterSessionsByHost(sessions, hostId);
  const hostIncidents = filterIncidentsByHost(incidents, hostId);

  const sessionCount = hostSessions.length;
  const incidentCount = hostIncidents.length;

  const incidentsPer100Sessions =
    sessionCount > 0
      ? Math.round((incidentCount / sessionCount) * 100 * 100) / 100
      : 0;

  return {
    name: 'rd_incident_rate',
    label: 'Incident Rate',
    incidentCount,
    sessionCount,
    incidentsPer100Sessions,
    unit: 'per_100_sessions',
    hostId,
    periodStart,
    periodEnd,
  };
}

// ─── Aggregate Computation ──────────────────────────────────────────────────────

/**
 * Compute all Remote Desktop KPIs for a given host.
 *
 * Returns a typed result object following the platform analytics pattern.
 * Stores the result for later retrieval.
 */
export function computeAllHostKPIs(input: ComputeHostKPIsInput): HostKPIComputationResult {
  const { hostId, sessions, availability, billing, incidents, periodStart, periodEnd } = input;

  const kpis: RemoteDesktopKPIResult[] = [
    computeUtilisationRate(hostId, sessions, availability, periodStart, periodEnd),
    computeRevenuePerHost(hostId, billing, sessions, periodStart, periodEnd),
    computeSessionReliability(hostId, sessions, periodStart, periodEnd),
    computeAverageBandwidthUtilisation(hostId, sessions, periodStart, periodEnd),
    computeAverageSessionDuration(hostId, sessions, periodStart, periodEnd),
    computeIncidentRate(hostId, sessions, incidents ?? [], periodStart, periodEnd),
  ];

  const result: HostKPIComputationResult = {
    hostId,
    kpis,
    periodStart,
    periodEnd,
    computedAt: new Date().toISOString(),
    version: RD_KPI_VERSION,
  };

  // Store the result
  const key = storeKey(hostId);
  if (!kpiStore.has(key)) {
    kpiStore.set(key, []);
  }
  kpiStore.get(key)!.push(result);

  return result;
}

/**
 * Compute KPIs for multiple hosts in a batch.
 */
export function computeMultiHostKPIs(inputs: ComputeHostKPIsInput[]): HostKPIComputationResult[] {
  return inputs.map((input) => computeAllHostKPIs(input));
}

// ─── Retrieval ──────────────────────────────────────────────────────────────────

/**
 * Get the latest KPI computation for a host matching the given period.
 */
export function getLatestHostKPIs(
  hostId: string,
  periodStart: string,
  periodEnd: string,
): HostKPIComputationResult | undefined {
  const key = storeKey(hostId);
  const history = kpiStore.get(key);
  if (!history || history.length === 0) return undefined;

  const matching = history.filter(
    (r) => r.periodStart === periodStart && r.periodEnd === periodEnd,
  );

  return matching.length > 0 ? matching[matching.length - 1] : undefined;
}

/**
 * Get the full KPI computation history for a host, newest first.
 */
export function getHostKPIHistory(
  hostId: string,
  options?: { limit?: number },
): HostKPIComputationResult[] {
  const key = storeKey(hostId);
  const history = kpiStore.get(key);
  if (!history || history.length === 0) return [];

  const sorted = [...history].reverse();
  if (options?.limit) {
    return sorted.slice(0, options.limit);
  }
  return sorted;
}

/**
 * Get a specific KPI by name from the latest computation for a host and period.
 */
export function getHostKPIByName(
  hostId: string,
  name: string,
  periodStart: string,
  periodEnd: string,
): RemoteDesktopKPIResult | undefined {
  const latest = getLatestHostKPIs(hostId, periodStart, periodEnd);
  if (!latest) return undefined;
  return latest.kpis.find((kpi) => kpi.name === name);
}

// ─── SessionRecord Conversion ───────────────────────────────────────────────────

/**
 * Convert a SessionRecord from the session broker into a SessionAnalyticsRecord
 * suitable for KPI computation.
 */
export function sessionRecordToAnalytics(
  session: SessionRecord,
  bandwidthUtilisationPercent?: number,
): SessionAnalyticsRecord {
  return {
    sessionId: session.sessionId,
    hostId: session.hostId,
    status: session.status,
    totalConnectedSeconds: session.totalConnectedSeconds,
    connectionType: session.connectionType,
    bandwidthUtilisationPercent,
    startTimestamp: session.startTimestamp,
    endTimestamp: session.endTimestamp,
  };
}

// ─── Observability ──────────────────────────────────────────────────────────────

/**
 * Get the current KPI version for remote desktop analytics.
 */
export function getCurrentRdKpiVersion(): number {
  return RD_KPI_VERSION;
}

// ─── Test Utilities ─────────────────────────────────────────────────────────────

/**
 * Reset all in-memory data stores. Used in tests only.
 */
export function _resetAnalyticsAdapterState(): void {
  kpiStore.clear();
  ingestedSessions.length = 0;
  ingestedBilling.length = 0;
}

// ─── Legacy Compatibility (used by sessionLifecycleOrchestrator) ────────────────

/** Date range filter for KPI computation (legacy compatibility) */
export interface DateRange {
  from: string;
  to: string;
}

/** Optional filter parameters (legacy compatibility) */
export interface KPIFilter {
  hostId?: string;
}

/** Aggregated result matching old interface shape */
export interface RemoteDesktopKPIComputationResult {
  computedAt: string;
  dateRange: DateRange;
  filter?: KPIFilter;
  kpis: RemoteDesktopKPIResult[];
  version: number;
}

/** In-memory stores for ingested records (used by computeAllRemoteDesktopKPIs) */
const ingestedSessions: SessionAnalyticsRecord[] = [];
const ingestedBilling: HostBillingRecord[] = [];

/**
 * Ingest a completed session record for KPI computation.
 * Called by the session lifecycle orchestrator on session end.
 */
export function ingestSessionRecord(session: Pick<SessionAnalyticsRecord, 'sessionId' | 'hostId' | 'status' | 'totalConnectedSeconds' | 'connectionType'> & { startTimestamp: number | null; endTimestamp?: number | null }): void {
  ingestedSessions.push({
    sessionId: session.sessionId,
    hostId: session.hostId,
    status: session.status,
    totalConnectedSeconds: session.totalConnectedSeconds,
    connectionType: session.connectionType,
    bandwidthUtilisationPercent: undefined,
    startTimestamp: session.startTimestamp,
    endTimestamp: session.endTimestamp ?? null,
  });
}

/**
 * Ingest a billing record for revenue computation.
 */
export function ingestBillingRecord(record: HostBillingRecord): void {
  ingestedBilling.push(record);
}

/**
 * Compute all Remote Desktop KPIs across all ingested data for a given date range.
 * Legacy compatibility function used by sessionLifecycleOrchestrator.
 */
export function computeAllRemoteDesktopKPIs(
  dateRange: DateRange,
  filter?: KPIFilter,
): RemoteDesktopKPIComputationResult {
  // Get unique hosts from ingested sessions (optionally filtered)
  const filtered = filter?.hostId
    ? ingestedSessions.filter((s) => s.hostId === filter.hostId)
    : ingestedSessions;

  const hostIds = [...new Set(filtered.map((s) => s.hostId))];
  const kpis: RemoteDesktopKPIResult[] = [];

  for (const hostId of hostIds) {
    const sessions = filtered.filter((s) => s.hostId === hostId);
    const billing = filter?.hostId
      ? ingestedBilling.filter((b) => b.hostId === filter.hostId)
      : ingestedBilling.filter((b) => b.hostId === hostId);

    const availability: HostAvailabilityRecord = {
      hostId,
      availableHours: 0, // Unknown without availability data
    };

    kpis.push(computeUtilisationRate(hostId, sessions, availability, dateRange.from, dateRange.to));
    kpis.push(computeRevenuePerHost(hostId, billing, sessions, dateRange.from, dateRange.to));
    kpis.push(computeSessionReliability(hostId, sessions, dateRange.from, dateRange.to));
    kpis.push(computeAverageBandwidthUtilisation(hostId, sessions, dateRange.from, dateRange.to));
    kpis.push(computeAverageSessionDuration(hostId, sessions, dateRange.from, dateRange.to));
    kpis.push(computeIncidentRate(hostId, sessions, [], dateRange.from, dateRange.to));
  }

  return {
    computedAt: new Date().toISOString(),
    dateRange,
    filter,
    kpis,
    version: RD_KPI_VERSION,
  };
}

