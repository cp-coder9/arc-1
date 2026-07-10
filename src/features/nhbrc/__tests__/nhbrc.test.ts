/**
 * NHBRC Module — Unit Tests
 *
 * Comprehensive unit tests for all four NHBRC services:
 * 1. NHBRC Engine Service (enrolment readiness, fee calculation)
 * 2. Inspection Tracker Service (stage enforcement, waivers, re-inspection)
 * 3. Warranty Manager Service (period validation, state machine)
 * 4. Builder Verification Service (input validation, result recording)
 *
 * Requirements: 11.1–11.9, 12.1–12.10, 13.1–13.10, 14.1–14.9, 15.1–15.8
 */

import { describe, it, expect } from 'vitest';

import { createNHBRCEngineService } from '../services/nhbrcEngineService';
import { createInspectionTrackerService, STAGE_ORDER } from '../services/inspectionTrackerService';
import { createWarrantyManagerService } from '../services/warrantyManagerService';
import { createBuilderVerificationService } from '../services/builderVerificationService';
import type { FeeBand, RecordInspectionInput, CreateWarrantyClaimInput } from '../types';

// ─── Injectable Clock ─────────────────────────────────────────────────────────

function createClock(iso: string) {
  return () => iso;
}

// ─── 1. Enrolment Checklist Tests ─────────────────────────────────────────────

describe('NHBRCEngineService — Enrolment Checklist', () => {
  it('creates enrolment with default items and readiness 0%', async () => {
    const service = createNHBRCEngineService();
    const enrolment = await service.createEnrolment(
      'proj-1',
      { numberOfUnits: 4, estimatedValuePerUnit: 800_000 },
      'actor-1',
    );

    expect(enrolment.projectId).toBe('proj-1');
    expect(enrolment.readinessPercentage).toBe(0);
    expect(enrolment.status).toBe('not_started');
    expect(enrolment.items.length).toBeGreaterThan(0);
    // All items should be not_started and applicable
    for (const item of enrolment.items) {
      expect(item.status).toBe('not_started');
      expect(item.isApplicable).toBe(true);
    }
  });

  it('updating an item to completed recalculates readiness', async () => {
    const service = createNHBRCEngineService();
    const enrolment = await service.createEnrolment(
      'proj-2',
      { numberOfUnits: 1, estimatedValuePerUnit: 500_000 },
      'actor-1',
    );

    const firstItemId = enrolment.items[0].id;
    const updated = await service.updateChecklistItem('proj-2', firstItemId, 'completed', 'actor-1');

    // 1 out of N items completed → readiness should be floor(1/N * 100)
    const totalApplicable = updated.items.filter((i) => i.isApplicable).length;
    const expectedReadiness = Math.floor((1 / totalApplicable) * 100);
    expect(updated.readinessPercentage).toBe(expectedReadiness);
    expect(updated.readinessPercentage).toBeGreaterThan(0);
  });

  it('not_applicable items are excluded from readiness calculation', async () => {
    const service = createNHBRCEngineService();
    const enrolment = await service.createEnrolment(
      'proj-3',
      { numberOfUnits: 2, estimatedValuePerUnit: 1_000_000 },
      'actor-1',
    );

    const totalItems = enrolment.items.length;

    // Mark some items as not_applicable
    await service.updateChecklistItem('proj-3', enrolment.items[0].id, 'not_applicable', 'actor-1');
    const after = await service.updateChecklistItem('proj-3', enrolment.items[1].id, 'not_applicable', 'actor-1');

    // Applicable items are now totalItems - 2
    const applicableCount = after.items.filter((i) => i.isApplicable).length;
    expect(applicableCount).toBe(totalItems - 2);
    // Readiness still 0 since no applicable item is completed
    expect(after.readinessPercentage).toBe(0);
  });

  it('all applicable items completed = 100%', async () => {
    const service = createNHBRCEngineService();
    const enrolment = await service.createEnrolment(
      'proj-4',
      { numberOfUnits: 1, estimatedValuePerUnit: 200_000 },
      'actor-1',
    );

    // Complete all items
    let current = enrolment;
    for (const item of enrolment.items) {
      current = await service.updateChecklistItem('proj-4', item.id, 'completed', 'actor-1');
    }

    expect(current.readinessPercentage).toBe(100);
    expect(current.status).toBe('in_progress');
  });
});

// ─── 2. Fee Calculator Tests ──────────────────────────────────────────────────

describe('NHBRCEngineService — Fee Calculator', () => {
  it('matching band returns fee = units * feeRate', async () => {
    const bands: FeeBand[] = [
      { id: 'b1', minValue: 0.01, maxValue: 1_000_000, feePerUnit: 2_000, effectiveFrom: '2024-01-01' },
      { id: 'b2', minValue: 1_000_000.01, maxValue: 5_000_000, feePerUnit: 5_000, effectiveFrom: '2024-01-01' },
    ];
    const service = createNHBRCEngineService({ feeBands: bands });

    const result = await service.calculateFee(3, 750_000);
    expect(result.fee).toBe(3 * 2_000); // 6000
    expect(result.error).toBeUndefined();
    expect(result.disclaimer).toBeDefined();
  });

  it('no matching band returns null + error', async () => {
    const bands: FeeBand[] = [
      { id: 'b1', minValue: 100_000, maxValue: 500_000, feePerUnit: 1_000, effectiveFrom: '2024-01-01' },
    ];
    const service = createNHBRCEngineService({ feeBands: bands });

    // Value below the band
    const result = await service.calculateFee(2, 50_000);
    expect(result.fee).toBeNull();
    expect(result.error).toBeDefined();
  });

  it('empty bands returns null + error', async () => {
    const service = createNHBRCEngineService({ feeBands: [] });

    const result = await service.calculateFee(1, 500_000);
    expect(result.fee).toBeNull();
    expect(result.error).toBeDefined();
  });
});

// ─── 3. Inspection Stage Enforcement Tests ────────────────────────────────────

describe('InspectionTrackerService — Stage Enforcement', () => {
  const clock = createClock('2025-01-15T10:00:00.000Z');

  function makeInput(stage: string, outcome: string): RecordInspectionInput {
    return {
      unitId: 'unit-1',
      stage: stage as RecordInspectionInput['stage'],
      inspectionDate: '2025-01-15',
      inspectorName: 'Inspector Smith',
      outcome: outcome as RecordInspectionInput['outcome'],
      conditionsOrDefects: outcome === 'failed' || outcome === 'conditionally_passed' ? 'Defect found' : undefined,
      evidenceRefs: [],
    };
  }

  it('foundation is always allowed', async () => {
    const service = createInspectionTrackerService({ now: clock });
    const check = await service.canRecordStage('proj-1', 'unit-1', 'foundation');
    expect(check.allowed).toBe(true);
  });

  it('wall_plate is blocked if foundation has not passed', async () => {
    const service = createInspectionTrackerService({ now: clock });
    const check = await service.canRecordStage('proj-1', 'unit-1', 'wall_plate');
    expect(check.allowed).toBe(false);
    expect(check.blockedBy).toBe('foundation');
  });

  it('passed stages unblock next stage', async () => {
    const service = createInspectionTrackerService({ now: clock });

    // Pass foundation
    await service.recordInspection('proj-1', makeInput('foundation', 'passed'), 'actor-1');

    const check = await service.canRecordStage('proj-1', 'unit-1', 'wall_plate');
    expect(check.allowed).toBe(true);
  });

  it('failed stage blocks subsequent stages until re-inspected', async () => {
    const service = createInspectionTrackerService({ now: clock });

    // Pass foundation, then fail wall_plate
    await service.recordInspection('proj-1', makeInput('foundation', 'passed'), 'actor-1');
    await service.recordInspection('proj-1', makeInput('wall_plate', 'failed'), 'actor-1');

    // Roof should be blocked by wall_plate
    const check = await service.canRecordStage('proj-1', 'unit-1', 'roof');
    expect(check.allowed).toBe(false);
    expect(check.blockedBy).toBe('wall_plate');

    // Re-inspect wall_plate as passed → roof unblocked
    await service.recordInspection('proj-1', makeInput('wall_plate', 'passed'), 'actor-1');
    const checkAfter = await service.canRecordStage('proj-1', 'unit-1', 'roof');
    expect(checkAfter.allowed).toBe(true);
  });

  it('waive unblocks stage (architect/engineer/site_manager only)', async () => {
    const service = createInspectionTrackerService({ now: clock });

    // Waive foundation as architect
    await service.waiveStage('proj-1', 'unit-1', 'foundation', 'actor-1', 'architect');

    const check = await service.canRecordStage('proj-1', 'unit-1', 'wall_plate');
    expect(check.allowed).toBe(true);
  });

  it('waive by engineer is permitted', async () => {
    const service = createInspectionTrackerService({ now: clock });
    await expect(
      service.waiveStage('proj-1', 'unit-1', 'foundation', 'actor-1', 'engineer'),
    ).resolves.toBeUndefined();
  });

  it('waive by site_manager is permitted', async () => {
    const service = createInspectionTrackerService({ now: clock });
    await expect(
      service.waiveStage('proj-1', 'unit-1', 'foundation', 'actor-1', 'site_manager'),
    ).resolves.toBeUndefined();
  });

  it('waive rejected for unauthorized roles', async () => {
    const service = createInspectionTrackerService({ now: clock });

    await expect(
      service.waiveStage('proj-1', 'unit-1', 'foundation', 'actor-1', 'contractor'),
    ).rejects.toThrow(/not permitted/i);

    await expect(
      service.waiveStage('proj-1', 'unit-1', 'foundation', 'actor-1', 'client'),
    ).rejects.toThrow(/not permitted/i);
  });
});

// ─── 4. Warranty Period Validation & State Machine Tests ──────────────────────

describe('WarrantyManagerService — Period Validation', () => {
  const clock = createClock('2025-06-01T00:00:00.000Z');

  function makeClaimInput(completionDate: string, discoveredDate: string): CreateWarrantyClaimInput {
    return {
      unitId: 'unit-1',
      claimantName: 'John Doe',
      claimantContact: '+27821234567',
      defectDescription: 'Structural crack in foundation wall',
      defectCategory: 'structural',
      defectDiscoveredDate: discoveredDate,
      practicalCompletionDate: completionDate,
      evidenceRefs: ['photo1.jpg'],
    };
  }

  it('warrantyExpiryDate = completion + 5 years', async () => {
    const service = createWarrantyManagerService({ now: clock });
    const claim = await service.registerClaim(
      'proj-1',
      makeClaimInput('2020-03-15', '2024-06-01'),
      'actor-1',
    );
    expect(claim.warrantyExpiryDate).toBe('2025-03-15');
  });

  it('isOutsideWarranty correctly flagged when defect after expiry', async () => {
    const service = createWarrantyManagerService({ now: clock });
    // Completion 2019-01-01 → expiry 2024-01-01
    // Defect discovered 2024-06-01 → outside warranty
    const claim = await service.registerClaim(
      'proj-2',
      makeClaimInput('2019-01-01', '2024-06-01'),
      'actor-1',
    );
    expect(claim.isOutsideWarranty).toBe(true);
  });

  it('isOutsideWarranty false when defect within warranty', async () => {
    const service = createWarrantyManagerService({ now: clock });
    // Completion 2022-01-01 → expiry 2027-01-01
    // Defect discovered 2025-03-01 → within warranty
    const claim = await service.registerClaim(
      'proj-3',
      makeClaimInput('2022-01-01', '2025-03-01'),
      'actor-1',
    );
    expect(claim.isOutsideWarranty).toBe(false);
  });
});

describe('WarrantyManagerService — State Machine', () => {
  const clock = createClock('2025-06-01T00:00:00.000Z');

  function makeClaimInput(): CreateWarrantyClaimInput {
    return {
      unitId: 'unit-1',
      claimantName: 'Jane Smith',
      claimantContact: '+27829876543',
      defectDescription: 'Roof waterproofing failure',
      defectCategory: 'roof_waterproofing',
      defectDiscoveredDate: '2025-05-01',
      practicalCompletionDate: '2023-01-01',
      evidenceRefs: ['img1.png'],
    };
  }

  it('sequential transitions work correctly', async () => {
    const service = createWarrantyManagerService({ now: clock });
    const claim = await service.registerClaim('proj-1', makeClaimInput(), 'actor-1');
    expect(claim.currentStage).toBe('reported');

    const s1 = await service.transitionClaim('proj-1', claim.id, 'acknowledged');
    expect(s1.currentStage).toBe('acknowledged');

    const s2 = await service.transitionClaim('proj-1', claim.id, 'inspection_scheduled');
    expect(s2.currentStage).toBe('inspection_scheduled');

    const s3 = await service.transitionClaim('proj-1', claim.id, 'inspected');
    expect(s3.currentStage).toBe('inspected');

    const s4 = await service.transitionClaim('proj-1', claim.id, 'liability_determined', {
      liabilityOutcome: 'builder_liable',
    });
    expect(s4.currentStage).toBe('liability_determined');
    expect(s4.liabilityOutcome).toBe('builder_liable');

    const s5 = await service.transitionClaim('proj-1', claim.id, 'rectification_ordered', {
      rectificationDescription: 'Redo waterproofing',
      rectificationDeadline: '2025-08-01',
      rectificationResponsibleParty: 'Builder XYZ',
    });
    expect(s5.currentStage).toBe('rectification_ordered');

    const s6 = await service.transitionClaim('proj-1', claim.id, 'rectification_in_progress');
    expect(s6.currentStage).toBe('rectification_in_progress');

    const s7 = await service.transitionClaim('proj-1', claim.id, 'rectification_complete');
    expect(s7.currentStage).toBe('rectification_complete');

    const s8 = await service.transitionClaim('proj-1', claim.id, 'claim_closed');
    expect(s8.currentStage).toBe('claim_closed');
  });

  it('no_liability → claim_closed shortcut works', async () => {
    const service = createWarrantyManagerService({ now: clock });
    const claim = await service.registerClaim('proj-2', makeClaimInput(), 'actor-1');

    // Advance to liability_determined with no_liability
    await service.transitionClaim('proj-2', claim.id, 'acknowledged');
    await service.transitionClaim('proj-2', claim.id, 'inspection_scheduled');
    await service.transitionClaim('proj-2', claim.id, 'inspected');
    await service.transitionClaim('proj-2', claim.id, 'liability_determined', {
      liabilityOutcome: 'no_liability',
    });

    // Direct transition to claim_closed via no_liability path
    const closed = await service.transitionClaim('proj-2', claim.id, 'claim_closed', {
      liabilityOutcome: 'no_liability',
    });
    expect(closed.currentStage).toBe('claim_closed');
  });

  it('invalid transition throws error', async () => {
    const service = createWarrantyManagerService({ now: clock });
    const claim = await service.registerClaim('proj-3', makeClaimInput(), 'actor-1');

    // Cannot skip from reported to inspected
    await expect(
      service.transitionClaim('proj-3', claim.id, 'inspected'),
    ).rejects.toThrow(/invalid transition/i);
  });
});

// ─── 5. Builder Verification Tests ───────────────────────────────────────────

describe('BuilderVerificationService', () => {
  const clock = createClock('2025-06-01T00:00:00.000Z');

  it('valid input returns a verification result', async () => {
    const service = createBuilderVerificationService({ now: clock });
    const result = await service.verifyBuilder(
      'proj-1',
      {
        builderName: 'Solid Builders',
        registrationNumber: 'REG12345',
        verificationDate: '2025-05-30',
      },
      'actor-1',
    );

    expect(result.id).toBeDefined();
    expect(result.projectId).toBe('proj-1');
    expect(result.builderName).toBe('Solid Builders');
    expect(result.registrationNumber).toBe('REG12345');
    expect(result.result).toBe('verified_active');
    expect(result.registrationCategory).toBeDefined();
    expect(result.maxProjectValue).toBeDefined();
  });

  it('invalid registration number (too short) is rejected', async () => {
    const service = createBuilderVerificationService({ now: clock });

    await expect(
      service.verifyBuilder(
        'proj-1',
        {
          builderName: 'Bad Builder',
          registrationNumber: 'AB', // too short (min 4)
          verificationDate: '2025-05-30',
        },
        'actor-1',
      ),
    ).rejects.toThrow();
  });

  it('invalid registration number (special characters) is rejected', async () => {
    const service = createBuilderVerificationService({ now: clock });

    await expect(
      service.verifyBuilder(
        'proj-1',
        {
          builderName: 'Bad Builder',
          registrationNumber: 'REG@#$!', // non-alphanumeric
          verificationDate: '2025-05-30',
        },
        'actor-1',
      ),
    ).rejects.toThrow();
  });

  it('future verification date is rejected', async () => {
    const service = createBuilderVerificationService({ now: clock });

    await expect(
      service.verifyBuilder(
        'proj-1',
        {
          builderName: 'Future Builder',
          registrationNumber: 'FUTU1234',
          verificationDate: '2099-12-31', // future date
        },
        'actor-1',
      ),
    ).rejects.toThrow();
  });

  it('EXP prefix returns verified_expired', async () => {
    const service = createBuilderVerificationService({ now: clock });
    const result = await service.verifyBuilder(
      'proj-1',
      {
        builderName: 'Expired Builder Co',
        registrationNumber: 'EXP54321',
        verificationDate: '2025-05-30',
      },
      'actor-1',
    );

    expect(result.result).toBe('verified_expired');
  });

  it('prior verifications returned sorted by date (most recent first)', async () => {
    let counter = 0;
    const incrementingClock = () => {
      counter++;
      return `2025-06-0${counter}T00:00:00.000Z`;
    };

    const service = createBuilderVerificationService({ now: incrementingClock });

    // Create multiple verifications for same registration number
    await service.verifyBuilder(
      'proj-1',
      { builderName: 'Builder A', registrationNumber: 'HIST1234', verificationDate: '2025-05-01' },
      'actor-1',
    );
    await service.verifyBuilder(
      'proj-1',
      { builderName: 'Builder A', registrationNumber: 'HIST1234', verificationDate: '2025-05-15' },
      'actor-2',
    );
    await service.verifyBuilder(
      'proj-1',
      { builderName: 'Builder A', registrationNumber: 'HIST1234', verificationDate: '2025-05-20' },
      'actor-3',
    );

    const priors = await service.getPriorVerifications('proj-1', 'HIST1234');
    expect(priors.length).toBe(3);

    // Should be sorted by createdAt descending
    for (let i = 0; i < priors.length - 1; i++) {
      expect(priors[i].createdAt >= priors[i + 1].createdAt).toBe(true);
    }
  });
});
