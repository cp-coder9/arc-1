/**
 * Integration Tests — Cross-Module Flows
 *
 * End-to-end tests verifying data flows across multiple P1 platform modules.
 * Uses injectable clocks and mock platform writers to verify cross-module wiring.
 *
 * Requirements: 4.1–4.8, 10.1–10.8, 15.1–15.8, 20.1–20.8, 23.1–23.8
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';

import { createInsuranceRegisterService } from '../../insurance-register/services/insuranceRegisterService';
import { createPolicyCheckerService } from '../../insurance-register/services/policyCheckerService';
import { createPassportAdapter } from '../../insurance-register/adapters/passportAdapter';
import { createActionCentreAdapter } from '../../insurance-register/adapters/actionCentreAdapter';
import { createClaimsNotificationService } from '../../insurance-register/services/claimsNotificationService';
import { createInspectionTrackerService } from '../../nhbrc/services/inspectionTrackerService';
import { createNHBRCRiskEngineAdapter } from '../../nhbrc/adapters/riskEngineAdapter';
import { createSGTrackerService } from '../../survey-geomatics/services/sgTrackerService';
import { createSurveyTownPlanningAdapter } from '../../survey-geomatics/adapters/townPlanningAdapter';
import { createRetryQueueService } from '../services/retryQueue';
import { createPlatformIntegrationService } from '../services/platformIntegration';
import { createWorkingDayCalculator } from '../services/workingDayCalculator';
import type { PassportWritePayload, ActionCentreWritePayload, RiskEngineWritePayload } from '../services/platformIntegration';
import type { FailedSyncAlert } from '../services/retryQueue';
import type { ContractDataSheet, InsurancePolicy } from '../../insurance-register/types';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ─── Test 1: Policy → Compliance → Passport → Action Centre ──────────────────

describe('Cross-module flow: Policy → Compliance → Passport → Action Centre', () => {
  it('registers a policy, checks compliance, writes to passport adapter, and notifies action centre', async () => {
    // Injectable clock fixed at 2026-01-15
    const fixedDate = makeDate(2026, 1, 15);
    const now = () => fixedDate;

    // Capture platform writes
    const passportWrites: PassportWritePayload[] = [];
    const actionCentreWrites: ActionCentreWritePayload[] = [];

    // Set up retry queue (no-op executor — writes should succeed directly)
    const retryQueue = createRetryQueueService({ now: () => fixedDate.toISOString() });

    // Set up platform integration with mock writers
    const platformIntegration = createPlatformIntegrationService(retryQueue, {
      writers: {
        passport: async (payload) => { passportWrites.push(payload); },
        actionCentre: async (payload) => { actionCentreWrites.push(payload); },
      },
      sourceModule: 'insurance-register',
    });

    // 1. Create insurance register service and register a CAR policy
    const registerService = createInsuranceRegisterService({ now });

    const policyInput = {
      projectId: 'proj-001',
      policyType: 'CAR' as const,
      insurerName: 'Santam Ltd',
      policyNumber: 'POL-2026-001',
      policyholderName: 'ABC Contractors',
      inceptionDate: '2025-06-01',
      expiryDate: '2027-06-01', // well within active range
      sumInsured: 50_000_000,
      excessAmount: 100_000,
      brokerContactName: 'John Broker',
      brokerPhone: '+27821234567',
      brokerEmail: 'john@broker.co.za',
      createdBy: 'actor-1',
    };

    const registeredPolicy = await registerService.registerPolicy('proj-001', policyInput, 'actor-1');
    expect(registeredPolicy.status).toBe('active');
    expect(registeredPolicy.policyType).toBe('CAR');

    // 2. Create a policy checker that fetches from the register service
    const contractDataSheet: ContractDataSheet = {
      contractForm: 'JBCC_PBA',
      minimumSumInsured: { CAR: 10_000_000, public_liability: 5_000_000 },
    };

    const policyChecker = createPolicyCheckerService({
      getPolicies: async (projectId: string) => registerService.getProjectPolicies(projectId),
      getContractDataSheet: async () => contractDataSheet,
      now,
    });

    // 3. Check compliance — should show partially compliant (CAR ok, public_liability missing)
    const compliance = await policyChecker.checkCompliance('proj-001');
    expect(compliance.overallStatus).toBe('partially_compliant');
    expect(compliance.activePolicies).toBe(1);

    const carResult = compliance.results.find(r => r.policyType === 'CAR');
    expect(carResult?.status).toBe('compliant');

    const plResult = compliance.results.find(r => r.policyType === 'public_liability');
    expect(plResult?.status).toBe('non_compliant');

    // 4. Write compliance summary to passport adapter
    const passportAdapter = createPassportAdapter(platformIntegration);
    const passportResult = await passportAdapter.write({
      projectId: 'proj-001',
      complianceSummary: compliance,
    });
    expect(passportResult.success).toBe(true);

    // Verify passport payload
    expect(passportWrites).toHaveLength(1);
    expect(passportWrites[0].projectId).toBe('proj-001');
    expect(passportWrites[0].moduleId).toBe('insurance-register');
    expect(passportWrites[0].statusLabel).toBe('partially_compliant');
    expect(passportWrites[0].activeRecords).toBe(1);

    // 5. Write non-compliance alert to action centre
    const actionCentreAdapter = createActionCentreAdapter(platformIntegration);
    const actionResult = await actionCentreAdapter.write({
      type: 'non_compliance_alert',
      projectId: 'proj-001',
      policyType: 'public_liability',
    });
    expect(actionResult.success).toBe(true);

    // Verify action centre payload
    expect(actionCentreWrites).toHaveLength(1);
    expect(actionCentreWrites[0].projectId).toBe('proj-001');
    expect(actionCentreWrites[0].sourceModule).toBe('insurance-register');
    expect(actionCentreWrites[0].actionType).toBe('non_compliance_alert');
    expect(actionCentreWrites[0].priority).toBe('critical');
    expect(actionCentreWrites[0].subject).toContain('public_liability');
  });
});

// ─── Test 2: Claim → Deadline → Warning → Overdue ────────────────────────────

describe('Cross-module flow: Claim → Deadline → Warning → Overdue', () => {
  it('registers a claim, verifies deadline calculation, advances clock past warning, detects overdue', async () => {
    // Mutable clock starting at 2026-03-01
    let currentDate = '2026-03-01';
    const now = () => currentDate;

    // 1. Create claims notification service with injectable clock
    const claimsService = createClaimsNotificationService({ now });

    // 2. Register a claim with incident date 2026-03-01
    const claim = await claimsService.registerClaim(
      'proj-002',
      {
        projectId: 'proj-002',
        incidentDate: '2026-03-01',
        discoveryDate: '2026-03-01',
        affectedPolicyId: 'policy-123',
        affectedPolicyType: 'CAR',
        description: 'Water damage to foundation during excavation works',
        estimatedLoss: 250_000,
        locationOnSite: 'Block A - Foundation level',
        category: 'property_damage',
        evidenceRefs: ['photo-001', 'photo-002'],
      },
      'actor-2',
    );

    // 3. Verify deadline is calculated (30 days from incident = 2026-03-31)
    expect(claim.status).toBe('reported');
    expect(claim.notificationDeadline).toBe('2026-03-31');

    // 4. Advance clock to 7 days before deadline (within warning threshold)
    currentDate = '2026-03-24';
    const overdueCheckMid = await claimsService.getOverdueNotifications('proj-002');
    // Not yet overdue
    expect(overdueCheckMid).toHaveLength(0);

    // 5. Advance clock past the deadline (2026-04-01)
    currentDate = '2026-04-01';
    const overdueClaims = await claimsService.getOverdueNotifications('proj-002');

    // Should detect the overdue claim
    expect(overdueClaims).toHaveLength(1);
    expect(overdueClaims[0].id).toBe(claim.id);
    expect(overdueClaims[0].status).toBe('reported');
    expect(overdueClaims[0].notificationDeadline).toBe('2026-03-31');
  });
});

// ─── Test 3: Inspection Failed → Risk Event → Action Centre ──────────────────

describe('Cross-module flow: Inspection Failed → Risk Event → Action Centre', () => {
  it('records a failed inspection, blocks subsequent stages, creates risk event with correct payload', async () => {
    let timestamp = 0;
    const now = () => new Date(2026, 0, 15 + timestamp++).toISOString();

    // Capture risk engine writes
    const riskWrites: Array<{ projectId: string; category: string; severity: string; description: string; recordRef: string }> = [];
    const actionCentreWrites: ActionCentreWritePayload[] = [];

    // Set up retry queue and platform integration
    const retryQueue = createRetryQueueService({ now: () => new Date().toISOString() });
    const platformIntegration = createPlatformIntegrationService(retryQueue, {
      writers: {
        riskEngine: async (payload) => { riskWrites.push(payload); },
        actionCentre: async (payload) => { actionCentreWrites.push(payload); },
      },
      sourceModule: 'nhbrc',
    });

    // 1. Create inspection tracker service
    const inspectionTracker = createInspectionTrackerService({ now });

    // 2. Record a FAILED foundation inspection
    const failedInspection = await inspectionTracker.recordInspection(
      'proj-003',
      {
        unitId: 'unit-A1',
        stage: 'foundation',
        inspectionDate: '2026-01-15',
        inspectorName: 'Inspector Williams',
        outcome: 'failed',
        conditionsOrDefects: 'Concrete mix ratio incorrect, insufficient cover to reinforcement',
        evidenceRefs: ['photo-fail-001'],
      },
      'actor-3',
    );
    expect(failedInspection.outcome).toBe('failed');

    // 3. Verify it blocks subsequent stages
    const canDoWallPlate = await inspectionTracker.canRecordStage('proj-003', 'unit-A1', 'wall_plate');
    expect(canDoWallPlate.allowed).toBe(false);
    expect(canDoWallPlate.blockedBy).toBe('foundation');

    // 4. Create risk event via NHBRC risk adapter
    const riskAdapter = createNHBRCRiskEngineAdapter(platformIntegration);
    const riskResult = await riskAdapter.raiseInspectionFailureRisk({
      projectId: 'proj-003',
      unitId: 'unit-A1',
      stage: 'foundation',
      inspectionId: failedInspection.id,
      description: 'Foundation inspection failed: concrete mix ratio incorrect',
    });
    expect(riskResult.success).toBe(true);

    // 5. Verify risk payload has category "construction compliance" and severity "high"
    expect(riskWrites).toHaveLength(1);
    expect(riskWrites[0].category).toBe('construction compliance');
    expect(riskWrites[0].severity).toBe('high');
    expect(riskWrites[0].projectId).toBe('proj-003');
    expect(riskWrites[0].description).toContain('Foundation inspection failed');
    expect(riskWrites[0].recordRef).toContain(failedInspection.id);
    expect(riskWrites[0].recordRef).toContain('unit-A1');
    expect(riskWrites[0].recordRef).toContain('foundation');
  });
});

// ─── Test 4: SG Diagram Approved → Town Planning Condition Fulfilled ──────────

describe('Cross-module flow: SG Diagram Approved → Town Planning Condition Fulfilled', () => {
  it('registers a diagram, advances through stages to approved, and verifies town planning unblocked', async () => {
    const fixedDate = makeDate(2026, 2, 1);
    const now = () => fixedDate;
    const workingDayCalculator = createWorkingDayCalculator();

    // 1. Create SG tracker service
    const sgTracker = createSGTrackerService({ now, workingDayCalculator });

    // 2. Register a diagram
    const diagram = await sgTracker.registerDiagram(
      'proj-004',
      {
        diagramReference: 'SG-2026-001',
        diagramType: 'subdivision',
        linkedSurveyInstructionId: 'si-001',
        propertyDescription: 'Erf 123 Johannesburg',
        lodgementDate: '2026-01-10',
        lodgementOffice: 'Pretoria',
        surveyorName: 'Peter Smith',
        surveyorPLATO: 'PLS12345',
        expectedProcessingDays: 60,
      },
      'actor-4',
    );
    expect(diagram.currentStage).toBe('prepared');

    // 3. Advance through stages sequentially to 'approved'
    const checked = await sgTracker.transitionStage('proj-004', diagram.id, 'checked');
    expect(checked.currentStage).toBe('checked');

    const lodged = await sgTracker.transitionStage('proj-004', diagram.id, 'lodged');
    expect(lodged.currentStage).toBe('lodged');

    const examining = await sgTracker.transitionStage('proj-004', diagram.id, 'examination_in_progress');
    expect(examining.currentStage).toBe('examination_in_progress');

    const approved = await sgTracker.transitionStage('proj-004', diagram.id, 'approved', {
      approvalDate: '2026-02-28',
      sgApprovalNumber: 'SGA-2026-789',
    });
    expect(approved.currentStage).toBe('approved');
    expect(approved.sgApprovalNumber).toBe('SGA-2026-789');

    // 4. Set up town planning adapter and verify decision block is released
    const retryQueue = createRetryQueueService({ now: () => fixedDate.toISOString() });
    const platformIntegration = createPlatformIntegrationService(retryQueue, {
      writers: {},
      sourceModule: 'survey-geomatics',
    });
    const townPlanningAdapter = createSurveyTownPlanningAdapter(platformIntegration);

    // With hasDiagramLodged=true (since diagram is past lodged → approved), should not be blocked
    const unblocked = townPlanningAdapter.checkDecisionBlock({
      projectId: 'proj-004',
      townPlanningAppId: 'tp-001',
      hasDiagramLodged: true,
      surveyNotApplicable: false,
    });
    expect(unblocked.blocked).toBe(false);

    // Verify that without a lodged diagram, it IS blocked
    const blocked = townPlanningAdapter.checkDecisionBlock({
      projectId: 'proj-004',
      townPlanningAppId: 'tp-001',
      hasDiagramLodged: false,
      surveyNotApplicable: false,
    });
    expect(blocked.blocked).toBe(true);
    expect(blocked.reason).toBeDefined();
  });
});

// ─── Test 5: Retry Queue under failure ────────────────────────────────────────

describe('Cross-module flow: Retry Queue under failure', () => {
  it('creates a failing writer, enqueues on failure, processes queue 3x, and creates failed-sync alert', async () => {
    // Mutable clock for controlling retry timing
    let currentTime = new Date('2026-01-15T00:00:00.000Z');
    const now = () => currentTime.toISOString();

    // Track failed-sync alerts
    const failedAlerts: FailedSyncAlert[] = [];

    // Create retry queue with:
    // - An executor that always fails (simulates platform being down)
    // - An alert callback to capture exhausted operations
    const retryQueue = createRetryQueueService({
      now,
      executor: async () => false, // always fails
      onFailedSyncAlert: (alert) => { failedAlerts.push(alert); },
      config: { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 60000, backoffMultiplier: 2 },
    });

    // Create platform integration with a writer that throws (triggering retry queue enqueue)
    const platformIntegration = createPlatformIntegrationService(retryQueue, {
      writers: {
        passport: async () => { throw new Error('Connection refused'); },
      },
      sourceModule: 'test-module',
    });

    // 1. Attempt to write to passport — should fail and enqueue
    const writeResult = await platformIntegration.writeToPassport({
      projectId: 'proj-005',
      moduleId: 'test-module',
      statusLabel: 'compliant',
      activeRecords: 5,
      overdueItems: 0,
      lastUpdated: '2026-01-15',
    });

    // Write fails, operation is queued for retry
    expect(writeResult.success).toBe(false);
    expect(writeResult.retryQueued).toBe(true);

    // 2. Process queue — attempt 1 (advance clock past first retry delay)
    currentTime = new Date('2026-01-15T00:00:02.000Z'); // +2s (past 1s base delay)
    const results1 = await retryQueue.processQueue();
    expect(results1).toHaveLength(1);
    expect(results1[0].success).toBe(false);
    expect(results1[0].retryQueued).toBe(true); // still has retries remaining

    // 3. Process queue — attempt 2 (advance clock past 2nd retry delay = 2s)
    currentTime = new Date('2026-01-15T00:00:05.000Z'); // +5s total
    const results2 = await retryQueue.processQueue();
    expect(results2).toHaveLength(1);
    expect(results2[0].success).toBe(false);
    expect(results2[0].retryQueued).toBe(true); // still has retries remaining

    // 4. Process queue — attempt 3 (advance clock past 3rd retry delay = 4s)
    currentTime = new Date('2026-01-15T00:00:10.000Z'); // +10s total
    const results3 = await retryQueue.processQueue();
    expect(results3).toHaveLength(1);
    expect(results3[0].success).toBe(false);
    expect(results3[0].retryQueued).toBe(false); // exhausted

    // 5. Verify failed-sync alert was created
    expect(failedAlerts).toHaveLength(1);
    expect(failedAlerts[0].targetModule).toBe('project_passport');
    expect(failedAlerts[0].sourceModule).toBe('test-module');
    expect(failedAlerts[0].sourceEvent).toBe('writeToPassport');
    expect(results3[0].failedSyncAlertId).toBeDefined();
  });
});
