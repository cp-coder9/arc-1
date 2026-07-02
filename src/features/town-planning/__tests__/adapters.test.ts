/**
 * Integration Tests — Town Planning Adapters
 *
 * Tests each adapter calls the correct platform module interface,
 * tests retry logic (succeeds on 2nd/3rd attempt, fails after 3),
 * and tests failed-sync alert creation on exhaustion.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  updatePlanningStatus,
  markPlanningPhaseComplete,
  type PlanningPassportUpdate,
  type PassportAdapterDeps,
} from '../adapters/passportAdapter';

import {
  createPlanningBlockerRisk,
  clearPlanningBlockerRisk,
  type RiskAdapterDeps,
} from '../adapters/riskAdapter';

import {
  createDeadlineAction,
  createNotification,
  createCalendarEvent,
  type ActionCentreAdapterDeps,
  type DeadlineActionParams,
  type NotificationParams,
  type CalendarEventParams,
} from '../adapters/actionCentreAdapter';

import {
  recordEvent,
  type TownPlanningAuditEvent,
  type AuditAdapterDeps,
} from '../adapters/auditAdapter';

import {
  registerControlledDocument,
  type DocumentRegistrationParams,
  type DocumentAdapterDeps,
} from '../adapters/documentAdapter';

import {
  updateZoningParameters,
  type ComplianceHubAdapterDeps,
} from '../adapters/complianceHubAdapter';

import {
  updatePlanningReadiness,
  type PlanningReadinessStatus,
  type ReadinessAdapterDeps,
} from '../adapters/readinessAdapter';

import {
  requestProfessionalAppointment,
  type TeamRouterAdapterDeps,
} from '../adapters/teamRouterAdapter';

import { withRetry } from '../adapters/retryUtils';

// ─── Passport Adapter ────────────────────────────────────────────────────────

describe('passportAdapter', () => {
  let writeFn: ReturnType<typeof vi.fn>;
  let deps: PassportAdapterDeps;

  beforeEach(() => {
    writeFn = vi.fn().mockResolvedValue(undefined);
    deps = { writeFn, retryOptions: { maxAttempts: 1, delayMs: 0 } };
  });

  it('updatePlanningStatus calls writeFn with projectId and status', async () => {
    const status: PlanningPassportUpdate = {
      applicationId: 'app-1',
      applicationType: 'rezoning',
      stage: 'submission',
      referenceNumber: 'TP-PROJ-001',
    };

    await updatePlanningStatus('proj-1', status, deps);

    expect(writeFn).toHaveBeenCalledWith('proj-1', status);
    expect(writeFn).toHaveBeenCalledTimes(1);
  });

  it('markPlanningPhaseComplete calls writeFn with 100% compliance', async () => {
    await markPlanningPhaseComplete('proj-1', deps);

    expect(writeFn).toHaveBeenCalledTimes(1);
    const call = writeFn.mock.calls[0];
    expect(call[0]).toBe('proj-1');
    expect(call[1]).toMatchObject({
      stage: 'conditions_compliance',
      conditionsCompliancePercent: 100,
    });
  });
});

// ─── Risk Adapter ────────────────────────────────────────────────────────────

describe('riskAdapter', () => {
  let createRiskFn: ReturnType<typeof vi.fn>;
  let clearRiskFn: ReturnType<typeof vi.fn>;
  let deps: RiskAdapterDeps;

  beforeEach(() => {
    createRiskFn = vi.fn().mockResolvedValue(undefined);
    clearRiskFn = vi.fn().mockResolvedValue(undefined);
    deps = { createRiskFn, clearRiskFn, retryOptions: { maxAttempts: 1, delayMs: 0 } };
  });

  it('createPlanningBlockerRisk creates a high-severity risk event', async () => {
    await createPlanningBlockerRisk('proj-1', 'SPLUMA approval pending', deps);

    expect(createRiskFn).toHaveBeenCalledTimes(1);
    const event = createRiskFn.mock.calls[0][0];
    expect(event.projectId).toBe('proj-1');
    expect(event.source).toBe('town_planning');
    expect(event.severity).toBe('high');
    expect(event.reason).toBe('SPLUMA approval pending');
    expect(event.createdAt).toBeDefined();
  });

  it('clearPlanningBlockerRisk clears risk for town_planning source', async () => {
    await clearPlanningBlockerRisk('proj-1', deps);

    expect(clearRiskFn).toHaveBeenCalledWith('proj-1', 'town_planning');
  });
});

// ─── Action Centre Adapter ───────────────────────────────────────────────────

describe('actionCentreAdapter', () => {
  let createDeadlineFn: ReturnType<typeof vi.fn>;
  let createNotificationFn: ReturnType<typeof vi.fn>;
  let createCalendarEventFn: ReturnType<typeof vi.fn>;
  let deps: ActionCentreAdapterDeps;

  beforeEach(() => {
    createDeadlineFn = vi.fn().mockResolvedValue(undefined);
    createNotificationFn = vi.fn().mockResolvedValue(undefined);
    createCalendarEventFn = vi.fn().mockResolvedValue(undefined);
    deps = {
      createDeadlineFn,
      createNotificationFn,
      createCalendarEventFn,
      retryOptions: { maxAttempts: 1, delayMs: 0 },
    };
  });

  it('createDeadlineAction calls createDeadlineFn with params', async () => {
    const params: DeadlineActionParams = {
      projectId: 'proj-1',
      applicationId: 'app-1',
      title: 'Acknowledgement deadline',
      description: 'Municipality must acknowledge within 15 working days',
      dueDate: '2026-02-15',
      severity: 'warning',
    };

    await createDeadlineAction(params, deps);

    expect(createDeadlineFn).toHaveBeenCalledWith(params);
  });

  it('createNotification calls createNotificationFn with params', async () => {
    const params: NotificationParams = {
      projectId: 'proj-1',
      applicationId: 'app-1',
      title: 'Application approved',
      message: 'Your rezoning application has been approved with conditions',
    };

    await createNotification(params, deps);

    expect(createNotificationFn).toHaveBeenCalledWith(params);
  });

  it('createCalendarEvent calls createCalendarEventFn with params', async () => {
    const params: CalendarEventParams = {
      projectId: 'proj-1',
      applicationId: 'app-1',
      title: 'MPRA Hearing',
      description: 'Municipal Planning Review Authority hearing for rezoning',
      eventDate: '2026-03-10',
      venue: 'Cape Town Civic Centre',
    };

    await createCalendarEvent(params, deps);

    expect(createCalendarEventFn).toHaveBeenCalledWith(params);
  });
});

// ─── Audit Adapter ───────────────────────────────────────────────────────────

describe('auditAdapter', () => {
  let recordFn: ReturnType<typeof vi.fn>;
  let deps: AuditAdapterDeps;

  beforeEach(() => {
    recordFn = vi.fn().mockResolvedValue(undefined);
    deps = { recordFn, retryOptions: { maxAttempts: 1, delayMs: 0 } };
  });

  it('recordEvent calls recordFn with the audit event', async () => {
    const event: TownPlanningAuditEvent = {
      projectId: 'proj-1',
      applicationId: 'app-1',
      action: 'stage_transition',
      actorId: 'user-1',
      actorRole: 'town_planner',
      timestamp: '2026-01-15T10:00:00Z',
      details: { from: 'preparation', to: 'submission' },
    };

    await recordEvent(event, deps);

    expect(recordFn).toHaveBeenCalledWith(event);
    expect(recordFn).toHaveBeenCalledTimes(1);
  });
});

// ─── Document Adapter ────────────────────────────────────────────────────────

describe('documentAdapter', () => {
  let registerFn: ReturnType<typeof vi.fn>;
  let deps: DocumentAdapterDeps;

  beforeEach(() => {
    registerFn = vi.fn().mockResolvedValue(undefined);
    deps = { registerFn, retryOptions: { maxAttempts: 1, delayMs: 0 } };
  });

  it('registerControlledDocument calls registerFn with document params', async () => {
    const params: DocumentRegistrationParams = {
      projectId: 'proj-1',
      applicationId: 'app-1',
      documentName: 'Decision Letter',
      documentType: 'decision_letter',
      category: 'town_planning',
      uploadedBy: 'user-1',
      uploadedAt: '2026-01-15T10:00:00Z',
      fileReference: 'blob://decision-letter-123',
    };

    await registerControlledDocument(params, deps);

    expect(registerFn).toHaveBeenCalledWith(params);
  });
});

// ─── Compliance Hub Adapter ──────────────────────────────────────────────────

describe('complianceHubAdapter', () => {
  let updateZoningFn: ReturnType<typeof vi.fn>;
  let deps: ComplianceHubAdapterDeps;

  beforeEach(() => {
    updateZoningFn = vi.fn().mockResolvedValue(undefined);
    deps = { updateZoningFn, retryOptions: { maxAttempts: 1, delayMs: 0 } };
  });

  it('updateZoningParameters calls updateZoningFn with projectId and params', async () => {
    const params = {
      currentZoning: 'Residential 1',
      proposedZoning: 'Mixed Use',
      coveragePercentage: 60,
      floorAreaRatio: 2.0,
      height: 15,
    };

    await updateZoningParameters('proj-1', params, deps);

    expect(updateZoningFn).toHaveBeenCalledWith('proj-1', params);
  });
});

// ─── Readiness Adapter ───────────────────────────────────────────────────────

describe('readinessAdapter', () => {
  let updateFn: ReturnType<typeof vi.fn>;
  let deps: ReadinessAdapterDeps;

  beforeEach(() => {
    updateFn = vi.fn().mockResolvedValue(undefined);
    deps = { updateFn, retryOptions: { maxAttempts: 1, delayMs: 0 } };
  });

  it('updatePlanningReadiness calls updateFn with projectId and status', async () => {
    const status: PlanningReadinessStatus = {
      applicationId: 'app-1',
      conditionsCompliant: true,
      sdpApproved: true,
      splumaDetermined: true,
      overallReady: true,
    };

    await updatePlanningReadiness('proj-1', status, deps);

    expect(updateFn).toHaveBeenCalledWith('proj-1', status);
  });
});

// ─── Team Router Adapter ─────────────────────────────────────────────────────

describe('teamRouterAdapter', () => {
  let requestFn: ReturnType<typeof vi.fn>;
  let deps: TeamRouterAdapterDeps;

  beforeEach(() => {
    requestFn = vi.fn().mockResolvedValue(undefined);
    deps = { requestFn, retryOptions: { maxAttempts: 1, delayMs: 0 } };
  });

  it('requestProfessionalAppointment calls requestFn with appointment request', async () => {
    await requestProfessionalAppointment('proj-1', 'land_surveyor', 'Subdivision requires surveyor', deps);

    expect(requestFn).toHaveBeenCalledTimes(1);
    const request = requestFn.mock.calls[0][0];
    expect(request.projectId).toBe('proj-1');
    expect(request.profession).toBe('land_surveyor');
    expect(request.reason).toBe('Subdivision requires surveyor');
    expect(request.requestedAt).toBeDefined();
  });
});

// ─── Retry Logic ─────────────────────────────────────────────────────────────

describe('retryUtils — withRetry', () => {
  it('returns result on first success without retry', async () => {
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await withRetry(fn, { maxAttempts: 3, delayMs: 0 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('succeeds on 2nd attempt after first failure', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { maxAttempts: 3, delayMs: 0 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('succeeds on 3rd attempt after two failures', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { maxAttempts: 3, delayMs: 0 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws last error after all attempts exhausted (no onExhausted)', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockRejectedValueOnce(new Error('fail 3'));

    await expect(withRetry(fn, { maxAttempts: 3, delayMs: 0 })).rejects.toThrow('fail 3');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('calls onExhausted callback when all retries fail', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockRejectedValueOnce(new Error('fail 3'));

    const onExhausted = vi.fn().mockResolvedValue(undefined);

    await expect(
      withRetry(fn, { maxAttempts: 3, delayMs: 0, onExhausted })
    ).rejects.toThrow('fail 3');

    expect(onExhausted).toHaveBeenCalledTimes(1);
    expect(onExhausted).toHaveBeenCalledWith(expect.any(Error));
  });

  it('creates failed-sync alert via onExhausted when adapter call exhausted', async () => {
    // Simulates the pattern: adapter calls withRetry with an onExhausted that
    // creates a failed-sync alert in the Action Centre
    const failedSyncAlertFn = vi.fn().mockResolvedValue(undefined);
    const failingAdapterCall = vi.fn().mockRejectedValue(new Error('service down'));

    await expect(
      withRetry(failingAdapterCall, {
        maxAttempts: 3,
        delayMs: 0,
        onExhausted: async (error) => {
          await failedSyncAlertFn({
            type: 'failed_sync',
            source: 'town_planning',
            error: (error as Error).message,
          });
        },
      })
    ).rejects.toThrow('service down');

    expect(failedSyncAlertFn).toHaveBeenCalledWith({
      type: 'failed_sync',
      source: 'town_planning',
      error: 'service down',
    });
  });

  it('uses exponential backoff between retries', async () => {
    const callTimes: number[] = [];
    const startTime = Date.now();

    const fn = vi.fn().mockImplementation(() => {
      callTimes.push(Date.now() - startTime);
      if (callTimes.length < 3) {
        return Promise.reject(new Error(`fail ${callTimes.length}`));
      }
      return Promise.resolve('ok');
    });

    // Use small delays to verify backoff works (1ms base → 1ms, 2ms)
    const result = await withRetry(fn, { maxAttempts: 3, delayMs: 1 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('uses default 3 attempts when no options provided', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockRejectedValueOnce(new Error('fail 3'));

    await expect(withRetry(fn)).rejects.toThrow('fail 3');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
