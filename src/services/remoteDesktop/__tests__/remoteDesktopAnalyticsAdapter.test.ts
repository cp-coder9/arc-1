/**
 * Tests for Remote Desktop — Analytics Engine Integration Adapter
 *
 * Validates: Requirements 13.5
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { SessionAnalyticsRecord, HostAvailabilityRecord, HostBillingRecord, ComputeHostKPIsInput } from '../remoteDesktopAnalyticsAdapter';
import {
  computeUtilisationRate,
  computeRevenuePerHost,
  computeSessionReliability,
  computeAverageBandwidthUtilisation,
  computeAllHostKPIs,
  computeMultiHostKPIs,
  getLatestHostKPIs,
  getHostKPIHistory,
  getHostKPIByName,
  sessionRecordToAnalytics,
  getCurrentRdKpiVersion,
  RD_KPI_VERSION,
  _resetAnalyticsAdapterState,
} from '../remoteDesktopAnalyticsAdapter';
import type { SessionRecord } from '../sessionBrokerService';

// ─── Test Helpers ───────────────────────────────────────────────────────────────

const PERIOD_START = '2025-06-01';
const PERIOD_END = '2025-06-30';
const HOST_ID = 'host-001';

function createSession(overrides: Partial<SessionAnalyticsRecord> = {}): SessionAnalyticsRecord {
  return {
    sessionId: `session-${Math.random().toString(36).slice(2, 8)}`,
    hostId: HOST_ID,
    status: 'completed',
    totalConnectedSeconds: 3600, // 1 hour
    connectionType: 'peer-to-peer',
    bandwidthUtilisationPercent: 65,
    startTimestamp: Date.now() - 7200_000,
    endTimestamp: Date.now(),
    ...overrides,
  };
}

function createAvailability(overrides: Partial<HostAvailabilityRecord> = {}): HostAvailabilityRecord {
  return {
    hostId: HOST_ID,
    availableHours: 160, // typical working month
    ...overrides,
  };
}

function createBilling(overrides: Partial<HostBillingRecord> = {}): HostBillingRecord {
  return {
    hostId: HOST_ID,
    sessionId: `session-${Math.random().toString(36).slice(2, 8)}`,
    billedAmountZar: 250,
    ...overrides,
  };
}

function createMockSessionRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sessionId: 'session-abc-123',
    bookingId: 'booking-xyz-789',
    hostId: HOST_ID,
    consumerUid: 'consumer-uid-42',
    ownerUid: 'owner-uid-99',
    tokenId: 'token-001',
    projectReference: 'project-ref-001',
    status: 'completed',
    connectionType: 'peer-to-peer',
    startTimestamp: Date.now() - 3600_000,
    endTimestamp: Date.now(),
    windowStart: Date.now() - 7200_000,
    windowEnd: Date.now() + 3600_000,
    gracePeriodSeconds: 300,
    totalConnectedSeconds: 3540,
    totalDisconnectionGapSeconds: 60,
    applicationsUsed: ['revit', 'autocad'],
    filesProducedCount: 5,
    disconnectionReason: 'user_initiated',
    ownerApproved: false,
    reconnectionAttempts: 0,
    lastDisconnectTimestamp: null,
    createdAt: Date.now() - 3600_000,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('remoteDesktopAnalyticsAdapter', () => {
  beforeEach(() => {
    _resetAnalyticsAdapterState();
  });

  describe('computeUtilisationRate', () => {
    it('calculates utilisation as connected hours / available hours', () => {
      const sessions = [
        createSession({ totalConnectedSeconds: 3600 }),  // 1 hour
        createSession({ totalConnectedSeconds: 7200 }),  // 2 hours
      ];
      const availability = createAvailability({ availableHours: 100 });

      const result = computeUtilisationRate(HOST_ID, sessions, availability, PERIOD_START, PERIOD_END);

      expect(result.name).toBe('rd_utilisation_rate');
      expect(result.connectedHours).toBe(2.5 + 0.5); // Actually 1 + 2 = 3
      expect(result.connectedHours).toBe(3);
      expect(result.availableHours).toBe(100);
      expect(result.utilisationPercent).toBe(3.0);
      expect(result.unit).toBe('percent');
    });

    it('returns 0% when no sessions exist', () => {
      const availability = createAvailability({ availableHours: 160 });
      const result = computeUtilisationRate(HOST_ID, [], availability, PERIOD_START, PERIOD_END);

      expect(result.connectedHours).toBe(0);
      expect(result.utilisationPercent).toBe(0);
    });

    it('returns 0% when available hours is 0', () => {
      const sessions = [createSession({ totalConnectedSeconds: 3600 })];
      const availability = createAvailability({ availableHours: 0 });

      const result = computeUtilisationRate(HOST_ID, sessions, availability, PERIOD_START, PERIOD_END);

      expect(result.utilisationPercent).toBe(0);
    });

    it('only counts sessions for the specified host', () => {
      const sessions = [
        createSession({ hostId: HOST_ID, totalConnectedSeconds: 3600 }),
        createSession({ hostId: 'other-host', totalConnectedSeconds: 7200 }),
      ];
      const availability = createAvailability({ availableHours: 100 });

      const result = computeUtilisationRate(HOST_ID, sessions, availability, PERIOD_START, PERIOD_END);

      expect(result.connectedHours).toBe(1);
    });

    it('includes period start and end in the result', () => {
      const result = computeUtilisationRate(HOST_ID, [], createAvailability(), PERIOD_START, PERIOD_END);

      expect(result.periodStart).toBe(PERIOD_START);
      expect(result.periodEnd).toBe(PERIOD_END);
    });
  });

  describe('computeRevenuePerHost', () => {
    it('sums billed amounts for a host', () => {
      const billing = [
        createBilling({ billedAmountZar: 100 }),
        createBilling({ billedAmountZar: 250 }),
        createBilling({ billedAmountZar: 75.50 }),
      ];
      const sessions = [createSession(), createSession(), createSession()];

      const result = computeRevenuePerHost(HOST_ID, billing, sessions, PERIOD_START, PERIOD_END);

      expect(result.name).toBe('rd_revenue_per_host');
      expect(result.totalRevenueZar).toBe(425.50);
      expect(result.sessionCount).toBe(3);
      expect(result.unit).toBe('ZAR');
    });

    it('returns 0 revenue when no billing records exist', () => {
      const result = computeRevenuePerHost(HOST_ID, [], [], PERIOD_START, PERIOD_END);

      expect(result.totalRevenueZar).toBe(0);
      expect(result.sessionCount).toBe(0);
    });

    it('only counts billing for the specified host', () => {
      const billing = [
        createBilling({ hostId: HOST_ID, billedAmountZar: 200 }),
        createBilling({ hostId: 'other-host', billedAmountZar: 500 }),
      ];

      const result = computeRevenuePerHost(HOST_ID, billing, [], PERIOD_START, PERIOD_END);

      expect(result.totalRevenueZar).toBe(200);
    });
  });

  describe('computeSessionReliability', () => {
    it('calculates reliability as successful / total attempts', () => {
      const sessions = [
        createSession({ status: 'completed' }),
        createSession({ status: 'completed' }),
        createSession({ status: 'failed' }),
        createSession({ status: 'active' }),
      ];

      const result = computeSessionReliability(HOST_ID, sessions, PERIOD_START, PERIOD_END);

      expect(result.name).toBe('rd_session_reliability');
      // successful = completed(2) + active(1) = 3
      // total = all 4
      expect(result.successfulConnections).toBe(3);
      expect(result.totalConnectionAttempts).toBe(4);
      expect(result.reliabilityPercent).toBe(75.0);
      expect(result.unit).toBe('percent');
    });

    it('counts terminated sessions as successful', () => {
      const sessions = [
        createSession({ status: 'terminated' }),
        createSession({ status: 'failed' }),
      ];

      const result = computeSessionReliability(HOST_ID, sessions, PERIOD_START, PERIOD_END);

      expect(result.successfulConnections).toBe(1);
      expect(result.totalConnectionAttempts).toBe(2);
      expect(result.reliabilityPercent).toBe(50.0);
    });

    it('returns 0% when no sessions exist', () => {
      const result = computeSessionReliability(HOST_ID, [], PERIOD_START, PERIOD_END);

      expect(result.reliabilityPercent).toBe(0);
      expect(result.totalConnectionAttempts).toBe(0);
    });

    it('returns 100% when all sessions are successful', () => {
      const sessions = [
        createSession({ status: 'completed' }),
        createSession({ status: 'completed' }),
      ];

      const result = computeSessionReliability(HOST_ID, sessions, PERIOD_START, PERIOD_END);

      expect(result.reliabilityPercent).toBe(100.0);
    });

    it('only counts sessions for the specified host', () => {
      const sessions = [
        createSession({ hostId: HOST_ID, status: 'completed' }),
        createSession({ hostId: 'other-host', status: 'failed' }),
      ];

      const result = computeSessionReliability(HOST_ID, sessions, PERIOD_START, PERIOD_END);

      expect(result.successfulConnections).toBe(1);
      expect(result.totalConnectionAttempts).toBe(1);
      expect(result.reliabilityPercent).toBe(100.0);
    });
  });

  describe('computeAverageBandwidthUtilisation', () => {
    it('computes mean bandwidth utilisation across sessions with data', () => {
      const sessions = [
        createSession({ bandwidthUtilisationPercent: 40 }),
        createSession({ bandwidthUtilisationPercent: 60 }),
        createSession({ bandwidthUtilisationPercent: 80 }),
      ];

      const result = computeAverageBandwidthUtilisation(HOST_ID, sessions, PERIOD_START, PERIOD_END);

      expect(result.name).toBe('rd_average_bandwidth_utilisation');
      expect(result.averageUtilisationPercent).toBe(60.0);
      expect(result.sessionsWithData).toBe(3);
      expect(result.unit).toBe('percent');
    });

    it('excludes sessions without bandwidth data', () => {
      const sessions = [
        createSession({ bandwidthUtilisationPercent: 50 }),
        createSession({ bandwidthUtilisationPercent: undefined }),
        createSession({ bandwidthUtilisationPercent: 70 }),
      ];

      const result = computeAverageBandwidthUtilisation(HOST_ID, sessions, PERIOD_START, PERIOD_END);

      expect(result.averageUtilisationPercent).toBe(60.0);
      expect(result.sessionsWithData).toBe(2);
    });

    it('returns 0 when no sessions have bandwidth data', () => {
      const sessions = [
        createSession({ bandwidthUtilisationPercent: undefined }),
      ];

      const result = computeAverageBandwidthUtilisation(HOST_ID, sessions, PERIOD_START, PERIOD_END);

      expect(result.averageUtilisationPercent).toBe(0);
      expect(result.sessionsWithData).toBe(0);
    });

    it('returns 0 when no sessions exist', () => {
      const result = computeAverageBandwidthUtilisation(HOST_ID, [], PERIOD_START, PERIOD_END);

      expect(result.averageUtilisationPercent).toBe(0);
      expect(result.sessionsWithData).toBe(0);
    });

    it('includes sessions with 0% bandwidth utilisation', () => {
      const sessions = [
        createSession({ bandwidthUtilisationPercent: 0 }),
        createSession({ bandwidthUtilisationPercent: 100 }),
      ];

      const result = computeAverageBandwidthUtilisation(HOST_ID, sessions, PERIOD_START, PERIOD_END);

      expect(result.averageUtilisationPercent).toBe(50.0);
      expect(result.sessionsWithData).toBe(2);
    });
  });

  describe('computeAllHostKPIs', () => {
    it('computes all 4 KPIs for a host', () => {
      const input: ComputeHostKPIsInput = {
        hostId: HOST_ID,
        sessions: [createSession(), createSession({ status: 'failed' })],
        availability: createAvailability({ availableHours: 100 }),
        billing: [createBilling({ billedAmountZar: 300 })],
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      };

      const result = computeAllHostKPIs(input);

      expect(result.hostId).toBe(HOST_ID);
      expect(result.kpis).toHaveLength(4);
      expect(result.version).toBe(RD_KPI_VERSION);
      expect(result.periodStart).toBe(PERIOD_START);
      expect(result.periodEnd).toBe(PERIOD_END);
      expect(result.computedAt).toBeDefined();

      const kpiNames = result.kpis.map((kpi) => kpi.name);
      expect(kpiNames).toContain('rd_utilisation_rate');
      expect(kpiNames).toContain('rd_revenue_per_host');
      expect(kpiNames).toContain('rd_session_reliability');
      expect(kpiNames).toContain('rd_average_bandwidth_utilisation');
    });

    it('stores the computation result for later retrieval', () => {
      const input: ComputeHostKPIsInput = {
        hostId: HOST_ID,
        sessions: [createSession()],
        availability: createAvailability(),
        billing: [],
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      };

      computeAllHostKPIs(input);

      const stored = getLatestHostKPIs(HOST_ID, PERIOD_START, PERIOD_END);
      expect(stored).toBeDefined();
      expect(stored!.hostId).toBe(HOST_ID);
    });
  });

  describe('computeMultiHostKPIs', () => {
    it('computes KPIs for multiple hosts', () => {
      const inputs: ComputeHostKPIsInput[] = [
        {
          hostId: 'host-001',
          sessions: [createSession({ hostId: 'host-001' })],
          availability: createAvailability({ hostId: 'host-001' }),
          billing: [createBilling({ hostId: 'host-001' })],
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
        },
        {
          hostId: 'host-002',
          sessions: [createSession({ hostId: 'host-002' })],
          availability: createAvailability({ hostId: 'host-002' }),
          billing: [createBilling({ hostId: 'host-002' })],
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
        },
      ];

      const results = computeMultiHostKPIs(inputs);

      expect(results).toHaveLength(2);
      expect(results[0].hostId).toBe('host-001');
      expect(results[1].hostId).toBe('host-002');
    });
  });

  describe('getLatestHostKPIs', () => {
    it('returns undefined when no computation exists', () => {
      expect(getLatestHostKPIs('nonexistent', PERIOD_START, PERIOD_END)).toBeUndefined();
    });

    it('returns the latest computation for the period', () => {
      const input: ComputeHostKPIsInput = {
        hostId: HOST_ID,
        sessions: [createSession()],
        availability: createAvailability(),
        billing: [],
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      };

      computeAllHostKPIs(input);
      computeAllHostKPIs(input); // second computation

      const latest = getLatestHostKPIs(HOST_ID, PERIOD_START, PERIOD_END);
      expect(latest).toBeDefined();
    });
  });

  describe('getHostKPIHistory', () => {
    it('returns all computations for a host sorted newest first', () => {
      const input: ComputeHostKPIsInput = {
        hostId: HOST_ID,
        sessions: [createSession()],
        availability: createAvailability(),
        billing: [],
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      };

      computeAllHostKPIs(input);
      computeAllHostKPIs({ ...input, periodStart: '2025-07-01', periodEnd: '2025-07-31' });

      const history = getHostKPIHistory(HOST_ID);
      expect(history).toHaveLength(2);
    });

    it('respects limit option', () => {
      const input: ComputeHostKPIsInput = {
        hostId: HOST_ID,
        sessions: [createSession()],
        availability: createAvailability(),
        billing: [],
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      };

      computeAllHostKPIs(input);
      computeAllHostKPIs(input);
      computeAllHostKPIs(input);

      const history = getHostKPIHistory(HOST_ID, { limit: 2 });
      expect(history).toHaveLength(2);
    });

    it('returns empty array for unknown host', () => {
      const history = getHostKPIHistory('nonexistent');
      expect(history).toHaveLength(0);
    });
  });

  describe('getHostKPIByName', () => {
    it('returns a specific KPI by name', () => {
      const input: ComputeHostKPIsInput = {
        hostId: HOST_ID,
        sessions: [createSession()],
        availability: createAvailability({ availableHours: 50 }),
        billing: [],
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      };

      computeAllHostKPIs(input);

      const kpi = getHostKPIByName(HOST_ID, 'rd_utilisation_rate', PERIOD_START, PERIOD_END);
      expect(kpi).toBeDefined();
      expect(kpi!.name).toBe('rd_utilisation_rate');
    });

    it('returns undefined when KPI not found', () => {
      const kpi = getHostKPIByName('nonexistent', 'rd_utilisation_rate', PERIOD_START, PERIOD_END);
      expect(kpi).toBeUndefined();
    });
  });

  describe('sessionRecordToAnalytics', () => {
    it('converts a SessionRecord to SessionAnalyticsRecord', () => {
      const session = createMockSessionRecord();
      const result = sessionRecordToAnalytics(session, 72.5);

      expect(result.sessionId).toBe(session.sessionId);
      expect(result.hostId).toBe(session.hostId);
      expect(result.status).toBe(session.status);
      expect(result.totalConnectedSeconds).toBe(session.totalConnectedSeconds);
      expect(result.connectionType).toBe(session.connectionType);
      expect(result.bandwidthUtilisationPercent).toBe(72.5);
      expect(result.startTimestamp).toBe(session.startTimestamp);
      expect(result.endTimestamp).toBe(session.endTimestamp);
    });

    it('handles undefined bandwidth', () => {
      const session = createMockSessionRecord();
      const result = sessionRecordToAnalytics(session);

      expect(result.bandwidthUtilisationPercent).toBeUndefined();
    });
  });

  describe('getCurrentRdKpiVersion', () => {
    it('returns the current KPI version', () => {
      expect(getCurrentRdKpiVersion()).toBe(RD_KPI_VERSION);
      expect(getCurrentRdKpiVersion()).toBe(1);
    });
  });
});
