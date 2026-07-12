/**
 * Survey & Geomatics Module — Unit Tests
 *
 * Comprehensive tests for:
 * - Survey Engine: instruction creation, issuance, stage transitions, SG bypass
 * - SG Tracker: diagram registration, transitions, queries loop, withdrawal, overdue
 * - Beacon Register: registration, condition updates, replacement, boundary lines
 * - As-Built Comparator: comparison creation, measurements, deviation, compliance
 * - Town Planning Integration: auto-instruction creation
 *
 * Requirements: 16.1–16.7, 17.1–17.11, 18.1–18.8, 19.1–19.9, 20.1–20.8
 */

import { describe, expect, it } from 'vitest';

import { createSurveyEngineService } from '../services/surveyEngineService';
import { createSGTrackerService } from '../services/sgTrackerService';
import { createBeaconRegisterService } from '../services/beaconRegisterService';
import { createAsBuiltComparatorService } from '../services/asBuiltComparatorService';
import type { WorkingDayCalculator } from '../../p1-shared/services/workingDayCalculator';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function fixedClock(dateStr: string) {
  return () => dateStr + 'T00:00:00.000Z';
}

function fixedClockDate(dateStr: string) {
  return () => new Date(dateStr + 'T00:00:00.000Z');
}

/** Stub working day calculator for SG Tracker tests. */
function createMockWorkingDayCalculator(): WorkingDayCalculator {
  return {
    countWorkingDays: (start: string, end: string) => {
      // Simple stub: count calendar days as working days
      const s = new Date(start);
      const e = new Date(end);
      const diff = Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
      return Math.max(0, diff);
    },
    addWorkingDays: (start: string, days: number) => {
      const d = new Date(start);
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    },
    subtractWorkingDays: (end: string, days: number) => {
      const d = new Date(end);
      d.setDate(d.getDate() - days);
      return d.toISOString().slice(0, 10);
    },
    isWorkingDay: () => true,
    getPublicHolidays: () => [],
  };
}

function makeValidSurveyInput(overrides: Record<string, unknown> = {}) {
  return {
    surveyType: 'boundary_determination' as const,
    propertyDescription: 'Erf 123 Cape Town',
    scopeOfWork: 'Boundary determination survey for Erf 123',
    appointedSurveyorName: 'John Smith PLS',
    appointedSurveyorPLATO: 'PLS-12345',
    requiredCompletionDate: '2026-06-30',
    linkedDocuments: [],
    ...overrides,
  };
}

function makeValidSGDiagramInput(overrides: Record<string, unknown> = {}) {
  return {
    diagramReference: 'SG-REF-001',
    diagramType: 'general_plan' as const,
    linkedSurveyInstructionId: 'si-001',
    propertyDescription: 'Erf 123',
    lodgementDate: '2026-01-15',
    lodgementOffice: 'Cape Town' as const,
    surveyorName: 'John Smith PLS',
    surveyorPLATO: 'PLS-12345',
    expectedProcessingDays: 60,
    ...overrides,
  };
}

function makeValidBeaconInput(overrides: Record<string, unknown> = {}) {
  return {
    identifier: 'BCN-001',
    beaconType: 'iron_peg' as const,
    coordinateSystem: 'WGS84' as const,
    latitude: -33.9,
    longitude: 18.4,
    condition: 'intact' as const,
    dateLastInspected: '2026-01-10',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Survey Engine Service
// ═══════════════════════════════════════════════════════════════════════════════

describe('Survey Engine Service', () => {
  it('creates instruction with reference "SI-001"', () => {
    const service = createSurveyEngineService({ now: fixedClock('2026-03-01') });
    const input = makeValidSurveyInput();

    const result = service.createInstruction('proj-1', input as any, 'actor-1');

    expect(result.referenceNumber).toBe('SI-001');
    expect(result.currentStage).toBe('drafted');
    expect(result.projectId).toBe('proj-1');
    expect(result.surveyType).toBe('boundary_determination');
  });

  it('issues instruction from drafted to issued (validates mandatory fields)', () => {
    const service = createSurveyEngineService({ now: fixedClock('2026-03-01') });
    const input = makeValidSurveyInput();
    const created = service.createInstruction('proj-1', input as any, 'actor-1');

    const issued = service.issueInstruction('proj-1', created.id, 'actor-2');

    expect(issued.currentStage).toBe('issued');
    expect(issued.issuedBy).toBe('actor-2');
    expect(issued.issuedAt).toBeTruthy();
  });

  it('sequential stage transitions work', () => {
    const service = createSurveyEngineService({ now: fixedClock('2026-03-01') });
    const input = makeValidSurveyInput();
    const created = service.createInstruction('proj-1', input as any, 'actor-1');
    service.issueInstruction('proj-1', created.id, 'actor-1');

    const stages = ['accepted', 'fieldwork_in_progress', 'office_processing', 'submitted_to_sg', 'completed'] as const;
    let current = created.id;

    for (const stage of stages) {
      const result = service.transitionStage('proj-1', current, stage, 'actor-1');
      expect(result.currentStage).toBe(stage);
    }
  });

  it('SG bypass (office_processing→completed) works for topographic_survey', () => {
    const service = createSurveyEngineService({ now: fixedClock('2026-03-01') });
    const input = makeValidSurveyInput({ surveyType: 'topographic_survey' });
    const created = service.createInstruction('proj-1', input as any, 'actor-1');
    service.issueInstruction('proj-1', created.id, 'actor-1');
    service.transitionStage('proj-1', created.id, 'accepted', 'actor-1');
    service.transitionStage('proj-1', created.id, 'fieldwork_in_progress', 'actor-1');
    service.transitionStage('proj-1', created.id, 'office_processing', 'actor-1');

    // Bypass submitted_to_sg → directly to completed
    const result = service.transitionStage('proj-1', created.id, 'completed', 'actor-1');
    expect(result.currentStage).toBe('completed');
  });

  it('SG bypass (office_processing→completed) works for as_built_survey', () => {
    const service = createSurveyEngineService({ now: fixedClock('2026-03-01') });
    const input = makeValidSurveyInput({ surveyType: 'as_built_survey' });
    const created = service.createInstruction('proj-1', input as any, 'actor-1');
    service.issueInstruction('proj-1', created.id, 'actor-1');
    service.transitionStage('proj-1', created.id, 'accepted', 'actor-1');
    service.transitionStage('proj-1', created.id, 'fieldwork_in_progress', 'actor-1');
    service.transitionStage('proj-1', created.id, 'office_processing', 'actor-1');

    const result = service.transitionStage('proj-1', created.id, 'completed', 'actor-1');
    expect(result.currentStage).toBe('completed');
  });

  it('SG bypass rejected for boundary_determination type', () => {
    const service = createSurveyEngineService({ now: fixedClock('2026-03-01') });
    const input = makeValidSurveyInput({ surveyType: 'boundary_determination' });
    const created = service.createInstruction('proj-1', input as any, 'actor-1');
    service.issueInstruction('proj-1', created.id, 'actor-1');
    service.transitionStage('proj-1', created.id, 'accepted', 'actor-1');
    service.transitionStage('proj-1', created.id, 'fieldwork_in_progress', 'actor-1');
    service.transitionStage('proj-1', created.id, 'office_processing', 'actor-1');

    expect(() =>
      service.transitionStage('proj-1', created.id, 'completed', 'actor-1')
    ).toThrow('Invalid transition');
  });

  it('SG bypass rejected for sectional_title_survey type', () => {
    const service = createSurveyEngineService({ now: fixedClock('2026-03-01') });
    const input = makeValidSurveyInput({ surveyType: 'sectional_title_survey' });
    const created = service.createInstruction('proj-1', input as any, 'actor-1');
    service.issueInstruction('proj-1', created.id, 'actor-1');
    service.transitionStage('proj-1', created.id, 'accepted', 'actor-1');
    service.transitionStage('proj-1', created.id, 'fieldwork_in_progress', 'actor-1');
    service.transitionStage('proj-1', created.id, 'office_processing', 'actor-1');

    expect(() =>
      service.transitionStage('proj-1', created.id, 'completed', 'actor-1')
    ).toThrow('Invalid transition');
  });

  it('invalid transitions throw', () => {
    const service = createSurveyEngineService({ now: fixedClock('2026-03-01') });
    const input = makeValidSurveyInput();
    const created = service.createInstruction('proj-1', input as any, 'actor-1');

    // Cannot go directly from drafted to accepted (must go through issued first)
    expect(() =>
      service.transitionStage('proj-1', created.id, 'accepted', 'actor-1')
    ).toThrow('Invalid transition');

    // Cannot skip stages
    service.issueInstruction('proj-1', created.id, 'actor-1');
    expect(() =>
      service.transitionStage('proj-1', created.id, 'fieldwork_in_progress', 'actor-1')
    ).toThrow('Invalid transition');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. SG Tracker Service
// ═══════════════════════════════════════════════════════════════════════════════

describe('SG Tracker Service', () => {
  function createService(dateStr = '2026-03-01') {
    return createSGTrackerService({
      now: fixedClockDate(dateStr),
      workingDayCalculator: createMockWorkingDayCalculator(),
    });
  }

  it('registers diagram with unique reference', async () => {
    const service = createService();
    const input = makeValidSGDiagramInput();

    const result = await service.registerDiagram('proj-1', input, 'actor-1');

    expect(result.diagramReference).toBe('SG-REF-001');
    expect(result.currentStage).toBe('prepared');
    expect(result.projectId).toBe('proj-1');
    expect(result.processingDays).toBe(0);
  });

  it('duplicate reference throws', async () => {
    const service = createService();
    const input = makeValidSGDiagramInput();

    await service.registerDiagram('proj-1', input, 'actor-1');

    await expect(
      service.registerDiagram('proj-1', input, 'actor-1')
    ).rejects.toThrow('already exists');
  });

  it('sequential stage transitions work', async () => {
    const service = createService();
    const input = makeValidSGDiagramInput();
    const diagram = await service.registerDiagram('proj-1', input, 'actor-1');

    const r1 = await service.transitionStage('proj-1', diagram.id, 'checked');
    expect(r1.currentStage).toBe('checked');

    const r2 = await service.transitionStage('proj-1', diagram.id, 'lodged');
    expect(r2.currentStage).toBe('lodged');

    const r3 = await service.transitionStage('proj-1', diagram.id, 'examination_in_progress');
    expect(r3.currentStage).toBe('examination_in_progress');

    const r4 = await service.transitionStage('proj-1', diagram.id, 'approved', {
      approvalDate: '2026-04-01',
      sgApprovalNumber: 'SG-2026-001',
    });
    expect(r4.currentStage).toBe('approved');

    const r5 = await service.transitionStage('proj-1', diagram.id, 'registered');
    expect(r5.currentStage).toBe('registered');
  });

  it('queries loop works (examination→queries_raised→queries_resolved→examination)', async () => {
    const service = createService();
    const input = makeValidSGDiagramInput();
    const diagram = await service.registerDiagram('proj-1', input, 'actor-1');

    await service.transitionStage('proj-1', diagram.id, 'checked');
    await service.transitionStage('proj-1', diagram.id, 'lodged');
    await service.transitionStage('proj-1', diagram.id, 'examination_in_progress');

    // Enter queries loop
    const q1 = await service.transitionStage('proj-1', diagram.id, 'queries_raised', {
      queryDetails: 'Missing cadastral data',
    });
    expect(q1.currentStage).toBe('queries_raised');
    expect(q1.queryDetails).toBe('Missing cadastral data');

    const q2 = await service.transitionStage('proj-1', diagram.id, 'queries_resolved');
    expect(q2.currentStage).toBe('queries_resolved');

    // Back to examination
    const q3 = await service.transitionStage('proj-1', diagram.id, 'examination_in_progress');
    expect(q3.currentStage).toBe('examination_in_progress');
  });

  it('withdrawal from pre-approved stages works', async () => {
    const service = createService();
    const input = makeValidSGDiagramInput();
    const diagram = await service.registerDiagram('proj-1', input, 'actor-1');

    await service.transitionStage('proj-1', diagram.id, 'checked');

    const withdrawn = await service.withdrawDiagram('proj-1', diagram.id, 'Client cancelled', 'actor-1');
    expect(withdrawn.currentStage).toBe('withdrawn');
    expect(withdrawn.withdrawalReason).toBe('Client cancelled');
  });

  it('withdrawal rejected from approved stage', async () => {
    const service = createService();
    const input = makeValidSGDiagramInput();
    const diagram = await service.registerDiagram('proj-1', input, 'actor-1');

    await service.transitionStage('proj-1', diagram.id, 'checked');
    await service.transitionStage('proj-1', diagram.id, 'lodged');
    await service.transitionStage('proj-1', diagram.id, 'examination_in_progress');
    await service.transitionStage('proj-1', diagram.id, 'approved', {
      approvalDate: '2026-04-01',
      sgApprovalNumber: 'SG-2026-001',
    });

    await expect(
      service.withdrawDiagram('proj-1', diagram.id, 'Too late', 'actor-1')
    ).rejects.toThrow('Cannot withdraw');
  });

  it('withdrawal rejected from registered stage', async () => {
    const service = createService();
    const input = makeValidSGDiagramInput();
    const diagram = await service.registerDiagram('proj-1', input, 'actor-1');

    await service.transitionStage('proj-1', diagram.id, 'checked');
    await service.transitionStage('proj-1', diagram.id, 'lodged');
    await service.transitionStage('proj-1', diagram.id, 'examination_in_progress');
    await service.transitionStage('proj-1', diagram.id, 'approved', {
      approvalDate: '2026-04-01',
      sgApprovalNumber: 'SG-2026-001',
    });
    await service.transitionStage('proj-1', diagram.id, 'registered');

    await expect(
      service.withdrawDiagram('proj-1', diagram.id, 'Impossible', 'actor-1')
    ).rejects.toThrow('Cannot withdraw');
  });

  it('queries transition requires queryDetails', async () => {
    const service = createService();
    const input = makeValidSGDiagramInput();
    const diagram = await service.registerDiagram('proj-1', input, 'actor-1');

    await service.transitionStage('proj-1', diagram.id, 'checked');
    await service.transitionStage('proj-1', diagram.id, 'lodged');
    await service.transitionStage('proj-1', diagram.id, 'examination_in_progress');

    await expect(
      service.transitionStage('proj-1', diagram.id, 'queries_raised', {})
    ).rejects.toThrow('Query details are required');
  });

  it('approved transition requires approvalDate and sgApprovalNumber', async () => {
    const service = createService();
    const input = makeValidSGDiagramInput();
    const diagram = await service.registerDiagram('proj-1', input, 'actor-1');

    await service.transitionStage('proj-1', diagram.id, 'checked');
    await service.transitionStage('proj-1', diagram.id, 'lodged');
    await service.transitionStage('proj-1', diagram.id, 'examination_in_progress');

    await expect(
      service.transitionStage('proj-1', diagram.id, 'approved', {})
    ).rejects.toThrow('Approval date and SG approval number are required');
  });

  it('overdue processing detection (>120% expected)', async () => {
    // Lodged 100 days ago with expected 60 days → 100 > 60*1.2=72 → overdue
    const service = createSGTrackerService({
      now: fixedClockDate('2026-05-01'),
      workingDayCalculator: createMockWorkingDayCalculator(),
    });
    const input = makeValidSGDiagramInput({
      lodgementDate: '2026-01-15',
      expectedProcessingDays: 60,
    });
    const diagram = await service.registerDiagram('proj-1', input, 'actor-1');

    await service.transitionStage('proj-1', diagram.id, 'checked');
    await service.transitionStage('proj-1', diagram.id, 'lodged');
    await service.transitionStage('proj-1', diagram.id, 'examination_in_progress');

    const overdue = await service.getOverdueProcessing('proj-1');
    expect(overdue.length).toBe(1);
    expect(overdue[0].diagramReference).toBe('SG-REF-001');
  });

  it('not overdue when within threshold', async () => {
    // Lodged 50 days ago with expected 60 → 50 < 72 → not overdue
    const service = createSGTrackerService({
      now: fixedClockDate('2026-03-06'),
      workingDayCalculator: createMockWorkingDayCalculator(),
    });
    const input = makeValidSGDiagramInput({
      lodgementDate: '2026-01-15',
      expectedProcessingDays: 60,
    });
    const diagram = await service.registerDiagram('proj-1', input, 'actor-1');

    await service.transitionStage('proj-1', diagram.id, 'checked');
    await service.transitionStage('proj-1', diagram.id, 'lodged');
    await service.transitionStage('proj-1', diagram.id, 'examination_in_progress');

    const overdue = await service.getOverdueProcessing('proj-1');
    expect(overdue.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Beacon Register Service
// ═══════════════════════════════════════════════════════════════════════════════

describe('Beacon Register Service', () => {
  it('registers beacon with unique identifier', () => {
    const service = createBeaconRegisterService({ now: fixedClockDate('2026-03-01') });
    const input = makeValidBeaconInput();

    const result = service.registerBeacon('proj-1', input as any, 'actor-1');

    expect(result.identifier).toBe('BCN-001');
    expect(result.beaconType).toBe('iron_peg');
    expect(result.condition).toBe('intact');
    expect(result.projectId).toBe('proj-1');
    expect(result.replacementHistory).toEqual([]);
  });

  it('duplicate identifier throws', () => {
    const service = createBeaconRegisterService({ now: fixedClockDate('2026-03-01') });
    const input = makeValidBeaconInput();

    service.registerBeacon('proj-1', input as any, 'actor-1');

    expect(() =>
      service.registerBeacon('proj-1', input as any, 'actor-1')
    ).toThrow('already exists');
  });

  it('condition update triggers notification for damaged', () => {
    const notifications: any[] = [];
    const service = createBeaconRegisterService({
      now: fixedClockDate('2026-03-01'),
      onConditionNotification: (n) => notifications.push(n),
    });
    const input = makeValidBeaconInput();
    const beacon = service.registerBeacon('proj-1', input as any, 'actor-1');

    service.updateCondition('proj-1', beacon.id, 'damaged', 'actor-1');

    expect(notifications.length).toBe(1);
    expect(notifications[0].condition).toBe('damaged');
    expect(notifications[0].identifier).toBe('BCN-001');
  });

  it('condition update triggers notification for missing', () => {
    const notifications: any[] = [];
    const service = createBeaconRegisterService({
      now: fixedClockDate('2026-03-01'),
      onConditionNotification: (n) => notifications.push(n),
    });
    const input = makeValidBeaconInput();
    const beacon = service.registerBeacon('proj-1', input as any, 'actor-1');

    service.updateCondition('proj-1', beacon.id, 'missing', 'actor-1');

    expect(notifications.length).toBe(1);
    expect(notifications[0].condition).toBe('missing');
  });

  it('replace adds to history', () => {
    const service = createBeaconRegisterService({ now: fixedClockDate('2026-03-01') });
    const input = makeValidBeaconInput();
    const beacon = service.registerBeacon('proj-1', input as any, 'actor-1');

    const replaced = service.replaceBeacon('proj-1', beacon.id, {
      newLatitude: -33.91,
      newLongitude: 18.42,
      replacingSurveyorId: 'surveyor-1',
      reason: 'Beacon damaged during excavation',
    }, 'actor-1');

    expect(replaced.condition).toBe('replaced');
    expect(replaced.replacementHistory.length).toBe(1);
    expect(replaced.replacementHistory[0].replacingSurveyorId).toBe('surveyor-1');
    expect(replaced.replacementHistory[0].reason).toBe('Beacon damaged during excavation');
    expect(replaced.latitude).toBe(-33.91);
    expect(replaced.longitude).toBe(18.42);
  });

  it('boundary line requires min 2 beacons', () => {
    const service = createBeaconRegisterService({ now: fixedClockDate('2026-03-01') });

    expect(() =>
      service.defineBoundaryLine('proj-1', { parcelIdentifier: 'ERF-123', beaconSequence: ['BCN-001'] })
    ).toThrow();
  });

  it('boundary line validates beacon existence', () => {
    const service = createBeaconRegisterService({ now: fixedClockDate('2026-03-01') });
    // Register one beacon
    service.registerBeacon('proj-1', makeValidBeaconInput({ identifier: 'BCN-001' }) as any, 'actor-1');

    // Try to create boundary with a non-existent beacon
    expect(() =>
      service.defineBoundaryLine('proj-1', {
        parcelIdentifier: 'ERF-123',
        beaconSequence: ['BCN-001', 'BCN-NONEXIST'],
      })
    ).toThrow('not found');
  });

  it('boundary line succeeds with valid existing beacons', () => {
    const service = createBeaconRegisterService({ now: fixedClockDate('2026-03-01') });
    service.registerBeacon('proj-1', makeValidBeaconInput({ identifier: 'BCN-001' }) as any, 'actor-1');
    service.registerBeacon('proj-1', makeValidBeaconInput({ identifier: 'BCN-002' }) as any, 'actor-1');

    const line = service.defineBoundaryLine('proj-1', {
      parcelIdentifier: 'ERF-123',
      beaconSequence: ['BCN-001', 'BCN-002'],
    });

    expect(line.parcelIdentifier).toBe('ERF-123');
    expect(line.beaconSequence).toEqual(['BCN-001', 'BCN-002']);
  });

  it('SA bounds warning enforced at schema level (latitude out of range)', () => {
    const service = createBeaconRegisterService({ now: fixedClockDate('2026-03-01') });
    // Latitude outside SA range (-35 to -22)
    const input = makeValidBeaconInput({ latitude: -10.0, longitude: 18.4 });

    expect(() =>
      service.registerBeacon('proj-1', input as any, 'actor-1')
    ).toThrow('Validation failed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. As-Built Comparator Service
// ═══════════════════════════════════════════════════════════════════════════════

describe('As-Built Comparator Service', () => {
  function makeComparisonInput() {
    return {
      linkedSurveyInstructionId: 'si-001',
      linkedApprovedPlanRef: 'PLAN-001',
      surveyDate: '2026-03-15',
      surveyorId: 'surveyor-1',
    };
  }

  it('creates comparison with 0% compliance', () => {
    const service = createAsBuiltComparatorService({ now: fixedClock('2026-03-15') });
    const result = service.createComparison('proj-1', makeComparisonInput(), 'actor-1');

    expect(result.compliancePercentage).toBe(0.0);
    expect(result.totalMeasurements).toBe(0);
    expect(result.measurements).toEqual([]);
    expect(result.isCompleted).toBe(false);
  });

  it('add measurement calculates deviation', () => {
    const service = createAsBuiltComparatorService({ now: fixedClock('2026-03-15') });
    const comparison = service.createComparison('proj-1', makeComparisonInput(), 'actor-1');

    const result = service.addMeasurement(comparison.id, {
      dimensionDescription: 'Wall length A',
      approvedDimension: 10.0,
      asBuiltDimension: 10.03,
      toleranceThreshold: 0.05,
    });

    expect(result.measurements.length).toBe(1);
    const m = result.measurements[0];
    expect(m.deviation).toBeCloseTo(0.03);
    expect(m.absoluteDeviation).toBeCloseTo(0.03);
    expect(m.isWithinTolerance).toBe(true);
  });

  it('within tolerance correctly flagged', () => {
    const service = createAsBuiltComparatorService({ now: fixedClock('2026-03-15') });
    const comparison = service.createComparison('proj-1', makeComparisonInput(), 'actor-1');

    // Within tolerance: |10.04 - 10.0| = 0.04 <= 0.05
    const r1 = service.addMeasurement(comparison.id, {
      dimensionDescription: 'Dim A',
      approvedDimension: 10.0,
      asBuiltDimension: 10.04,
      toleranceThreshold: 0.05,
    });
    expect(r1.measurements[0].isWithinTolerance).toBe(true);

    // Outside tolerance: |10.06 - 10.0| = 0.06 > 0.05
    const r2 = service.addMeasurement(comparison.id, {
      dimensionDescription: 'Dim B',
      approvedDimension: 10.0,
      asBuiltDimension: 10.06,
      toleranceThreshold: 0.05,
    });
    expect(r2.measurements[1].isWithinTolerance).toBe(false);
  });

  it('compliance percentage = within/total * 100 (1 decimal place)', () => {
    const service = createAsBuiltComparatorService({ now: fixedClock('2026-03-15') });
    const comparison = service.createComparison('proj-1', makeComparisonInput(), 'actor-1');

    // Add 3 measurements: 2 within, 1 outside → 66.7%
    service.addMeasurement(comparison.id, {
      dimensionDescription: 'Dim A',
      approvedDimension: 10.0,
      asBuiltDimension: 10.01,
      toleranceThreshold: 0.05,
    });
    service.addMeasurement(comparison.id, {
      dimensionDescription: 'Dim B',
      approvedDimension: 10.0,
      asBuiltDimension: 10.02,
      toleranceThreshold: 0.05,
    });
    const result = service.addMeasurement(comparison.id, {
      dimensionDescription: 'Dim C',
      approvedDimension: 10.0,
      asBuiltDimension: 10.10,
      toleranceThreshold: 0.05,
    });

    expect(result.compliancePercentage).toBe(66.7);
    expect(result.withinTolerance).toBe(2);
    expect(result.outsideTolerance).toBe(1);
    expect(result.totalMeasurements).toBe(3);
  });

  it('compliance is 0.0% when no measurements', () => {
    const service = createAsBuiltComparatorService({ now: fixedClock('2026-03-15') });
    const comparison = service.createComparison('proj-1', makeComparisonInput(), 'actor-1');

    expect(comparison.compliancePercentage).toBe(0.0);
  });

  it('markCompleted requires min 1 measurement', () => {
    const service = createAsBuiltComparatorService({ now: fixedClock('2026-03-15') });
    const comparison = service.createComparison('proj-1', makeComparisonInput(), 'actor-1');

    expect(() =>
      service.markCompleted(comparison.id, 'actor-1')
    ).toThrow('at least 1 measurement');
  });

  it('markCompleted succeeds with measurements', () => {
    const service = createAsBuiltComparatorService({ now: fixedClock('2026-03-15') });
    const comparison = service.createComparison('proj-1', makeComparisonInput(), 'actor-1');
    service.addMeasurement(comparison.id, {
      dimensionDescription: 'Dim A',
      approvedDimension: 10.0,
      asBuiltDimension: 10.01,
      toleranceThreshold: 0.05,
    });

    const result = service.markCompleted(comparison.id, 'actor-1');
    expect(result.isCompleted).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Town Planning Integration
// ═══════════════════════════════════════════════════════════════════════════════

describe('Town Planning Integration', () => {
  it('createFromTownPlanning creates draft instruction linked to application', () => {
    const service = createSurveyEngineService({ now: fixedClock('2026-03-01') });

    const result = service.createFromTownPlanning('proj-1', 'app-123', 'cond-456');

    expect(result.currentStage).toBe('drafted');
    expect(result.linkedTownPlanningAppId).toBe('app-123');
    expect(result.projectId).toBe('proj-1');
    expect(result.scopeOfWork).toContain('cond-456');
    expect(result.scopeOfWork).toContain('app-123');
    expect(result.referenceNumber).toMatch(/^SI-\d{3}$/);
  });
});
