/**
 * Dispute Resolution Module — Unit Tests
 *
 * Comprehensive tests for:
 *   1. Claim Registration (disputeEngineService)
 *   2. Claim State Machine transitions
 *   3. Dashboard Aggregation
 *   4. Notice Timeline deadline calculations
 *   5. Evidence Linkage limits and constraints
 *   6. Quantum Analyser calculations
 *   7. Delay Analysis and net claimable delay
 *   8. Adjudication sequential transitions
 *
 * Requirements: 5.1–5.7, 6.1–6.9, 7.1–7.9, 8.1–8.10, 9.1–9.9, 10.1–10.8
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { createDisputeEngineService } from '../services/disputeEngineService';
import type { DisputeEngineService } from '../services/disputeEngineService';
import { createNoticeTimelineService } from '../services/noticeTimelineService';
import type { NoticeTimelineService } from '../services/noticeTimelineService';
import { createEvidenceLinkageService } from '../services/evidenceLinkageService';
import type { EvidenceLinkageService } from '../services/evidenceLinkageService';
import { createQuantumAnalyserService } from '../services/quantumAnalyserService';
import type { QuantumAnalyserService } from '../services/quantumAnalyserService';
import { createAdjudicationService } from '../services/adjudicationService';
import type { AdjudicationService } from '../services/adjudicationService';
import { createWorkingDayCalculator } from '../../p1-shared/services/workingDayCalculator';
import type { FormalClaimInput } from '../schemas';
import type { FormalClaim } from '../types';

// ─── Shared Constants ─────────────────────────────────────────────────────────

const FIXED_NOW = '2025-03-15T10:00:00.000Z';
const fixedClock = () => FIXED_NOW;

function makeEoTInput(overrides: Partial<FormalClaimInput> = {}): FormalClaimInput {
  return {
    claimType: 'EoT',
    causativeEventDate: '2025-01-10',
    notificationDate: '2025-01-15',
    contractClauseNumber: '25.1',
    contractClauseTitle: 'Extension of Time',
    briefDescription: 'Delays caused by heavy rainfall',
    timeClaimed: 15,
    ...overrides,
  };
}

function makeMonetaryInput(overrides: Partial<FormalClaimInput> = {}): FormalClaimInput {
  return {
    claimType: 'loss_and_expense',
    causativeEventDate: '2025-02-01',
    notificationDate: '2025-02-05',
    contractClauseNumber: '26.1',
    contractClauseTitle: 'Loss and Expense',
    briefDescription: 'Additional costs due to site access delay',
    amountClaimed: 150000.50,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Claim Registration
// ═══════════════════════════════════════════════════════════════════════════════

describe('Dispute Engine — Claim Registration', () => {
  let service: DisputeEngineService;

  beforeEach(() => {
    service = createDisputeEngineService({ now: fixedClock });
  });

  it('registers a valid EoT claim with reference "EOT-001"', () => {
    const claim = service.registerClaim('proj-1', makeEoTInput(), 'actor-1');

    expect(claim.referenceNumber).toBe('EOT-001');
    expect(claim.claimType).toBe('EoT');
    expect(claim.currentStage).toBe('notified');
    expect(claim.timeClaimed).toBe(15);
    expect(claim.projectId).toBe('proj-1');
    expect(claim.createdBy).toBe('actor-1');
  });

  it('registers a valid monetary claim with reference "LE-001"', () => {
    const claim = service.registerClaim('proj-1', makeMonetaryInput(), 'actor-1');

    expect(claim.referenceNumber).toBe('LE-001');
    expect(claim.claimType).toBe('loss_and_expense');
    expect(claim.amountClaimed).toBe(150000.50);
  });

  it('increments reference numbers for same type', () => {
    service.registerClaim('proj-1', makeEoTInput(), 'actor-1');
    const second = service.registerClaim('proj-1', makeEoTInput(), 'actor-1');

    expect(second.referenceNumber).toBe('EOT-002');
  });

  it('rejects claim with missing mandatory fields', () => {
    const invalid = {
      claimType: 'EoT' as const,
      causativeEventDate: '2025-01-10',
      notificationDate: '2025-01-15',
      // missing contractClauseNumber, contractClauseTitle, briefDescription
    } as any;

    expect(() => service.registerClaim('proj-1', invalid, 'actor-1')).toThrow();
  });

  it('rejects monetary claim missing amountClaimed', () => {
    const invalid = makeMonetaryInput({ amountClaimed: undefined });

    expect(() => service.registerClaim('proj-1', invalid, 'actor-1')).toThrow();
  });

  it('rejects EoT claim missing timeClaimed', () => {
    const invalid = makeEoTInput({ timeClaimed: undefined });

    expect(() => service.registerClaim('proj-1', invalid, 'actor-1')).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Claim State Machine
// ═══════════════════════════════════════════════════════════════════════════════

describe('Dispute Engine — Claim State Machine', () => {
  let service: DisputeEngineService;
  let claim: FormalClaim;

  beforeEach(() => {
    service = createDisputeEngineService({ now: fixedClock });
    claim = service.registerClaim('proj-1', makeEoTInput(), 'actor-1');
  });

  it('transitions through the full accepted path', () => {
    let updated = service.transitionClaim({
      claimId: claim.id, targetStage: 'particularised', actorId: 'actor-1',
    });
    expect(updated.currentStage).toBe('particularised');

    updated = service.transitionClaim({
      claimId: claim.id, targetStage: 'assessed', actorId: 'actor-1',
    });
    expect(updated.currentStage).toBe('assessed');

    updated = service.transitionClaim({
      claimId: claim.id, targetStage: 'responded', actorId: 'actor-1',
      responseSubState: 'accepted',
    });
    expect(updated.currentStage).toBe('responded');
    expect(updated.responseSubState).toBe('accepted');

    updated = service.transitionClaim({
      claimId: claim.id, targetStage: 'settled', actorId: 'actor-1',
    });
    expect(updated.currentStage).toBe('settled');
  });

  it('transitions through the rejected → adjudication path', () => {
    service.transitionClaim({ claimId: claim.id, targetStage: 'particularised', actorId: 'a' });
    service.transitionClaim({ claimId: claim.id, targetStage: 'assessed', actorId: 'a' });
    service.transitionClaim({
      claimId: claim.id, targetStage: 'responded', actorId: 'a',
      responseSubState: 'rejected',
    });

    let updated = service.transitionClaim({
      claimId: claim.id, targetStage: 'notice_of_dissatisfaction', actorId: 'a',
    });
    expect(updated.currentStage).toBe('notice_of_dissatisfaction');

    updated = service.transitionClaim({
      claimId: claim.id, targetStage: 'referred_to_adjudication', actorId: 'a',
    });
    expect(updated.currentStage).toBe('referred_to_adjudication');

    updated = service.transitionClaim({
      claimId: claim.id, targetStage: 'adjudication_decision_issued', actorId: 'a',
    });
    expect(updated.currentStage).toBe('adjudication_decision_issued');

    updated = service.transitionClaim({
      claimId: claim.id, targetStage: 'settled', actorId: 'a',
    });
    expect(updated.currentStage).toBe('settled');
  });

  it('throws on invalid transition with current stage and permitted list', () => {
    expect(() =>
      service.transitionClaim({
        claimId: claim.id, targetStage: 'settled', actorId: 'a',
      })
    ).toThrow(/cannot move from 'notified' to 'settled'/);
  });

  it('throws on skipping stages (notified → assessed)', () => {
    expect(() =>
      service.transitionClaim({
        claimId: claim.id, targetStage: 'assessed', actorId: 'a',
      })
    ).toThrow(/Permitted next stages/);
  });

  it('requires responseSubState when transitioning to responded', () => {
    service.transitionClaim({ claimId: claim.id, targetStage: 'particularised', actorId: 'a' });
    service.transitionClaim({ claimId: claim.id, targetStage: 'assessed', actorId: 'a' });

    expect(() =>
      service.transitionClaim({
        claimId: claim.id, targetStage: 'responded', actorId: 'a',
        // no responseSubState
      })
    ).toThrow(/Response sub-state is required/);
  });

  it('partial acceptance requires awarded amount/time within bounds', () => {
    const monetaryClaim = service.registerClaim('proj-1', makeMonetaryInput(), 'actor-1');
    service.transitionClaim({ claimId: monetaryClaim.id, targetStage: 'particularised', actorId: 'a' });
    service.transitionClaim({ claimId: monetaryClaim.id, targetStage: 'assessed', actorId: 'a' });

    // No awarded amount/time → throws
    expect(() =>
      service.transitionClaim({
        claimId: monetaryClaim.id, targetStage: 'responded', actorId: 'a',
        responseSubState: 'partially_accepted',
      })
    ).toThrow(/Partial acceptance requires/);

    // Valid awarded amount within bounds → succeeds
    const updated = service.transitionClaim({
      claimId: monetaryClaim.id, targetStage: 'responded', actorId: 'a',
      responseSubState: 'partially_accepted',
      awardedAmount: 75000,
    });
    expect(updated.awardedAmount).toBe(75000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Dashboard Aggregation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Dispute Engine — Dashboard Aggregation', () => {
  let service: DisputeEngineService;

  beforeEach(() => {
    service = createDisputeEngineService({ now: fixedClock });
  });

  it('aggregates correct totals by type, amount, time, and stage', () => {
    // Register multiple claims of different types
    service.registerClaim('proj-1', makeEoTInput({ timeClaimed: 10 }), 'a');
    service.registerClaim('proj-1', makeEoTInput({ timeClaimed: 20 }), 'a');
    service.registerClaim('proj-1', makeMonetaryInput({ amountClaimed: 50000 }), 'a');
    const disruption = service.registerClaim('proj-1', {
      claimType: 'disruption',
      causativeEventDate: '2025-01-10',
      notificationDate: '2025-01-15',
      contractClauseNumber: '27.1',
      contractClauseTitle: 'Disruption',
      briefDescription: 'Work disrupted',
      amountClaimed: 25000,
    }, 'a');

    // Transition one claim to particularised
    service.transitionClaim({
      claimId: disruption.id, targetStage: 'particularised', actorId: 'a',
    });

    const dashboard = service.getClaimsDashboard('proj-1');

    expect(dashboard.totalClaimsByType.EoT).toBe(2);
    expect(dashboard.totalClaimsByType.loss_and_expense).toBe(1);
    expect(dashboard.totalClaimsByType.disruption).toBe(1);
    expect(dashboard.totalClaimsByType.prolongation).toBe(0);

    expect(dashboard.totalTimeClaimed).toBe(30); // 10 + 20
    expect(dashboard.totalAmountClaimed).toBe(75000); // 50000 + 25000

    expect(dashboard.claimsPerStage.notified).toBe(3);
    expect(dashboard.claimsPerStage.particularised).toBe(1);
  });

  it('tracks awarded amounts after partial acceptance', () => {
    const claim = service.registerClaim('proj-1', makeMonetaryInput({ amountClaimed: 100000 }), 'a');
    service.transitionClaim({ claimId: claim.id, targetStage: 'particularised', actorId: 'a' });
    service.transitionClaim({ claimId: claim.id, targetStage: 'assessed', actorId: 'a' });
    service.transitionClaim({
      claimId: claim.id, targetStage: 'responded', actorId: 'a',
      responseSubState: 'partially_accepted', awardedAmount: 60000,
    });

    const dashboard = service.getClaimsDashboard('proj-1');
    expect(dashboard.totalAmountAwarded).toBe(60000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Notice Timeline
// ═══════════════════════════════════════════════════════════════════════════════

describe('Notice Timeline — Deadline Calculations', () => {
  const wdCalc = createWorkingDayCalculator();

  function makeTimelineService(nowDate: string): NoticeTimelineService {
    return createNoticeTimelineService({
      workingDayCalculator: wdCalc,
      getClaims: async () => [],
      getContractForm: async () => null,
      now: () => nowDate,
    });
  }

  function makeClaim(overrides: Partial<FormalClaim> = {}): FormalClaim {
    return {
      id: 'claim-1',
      projectId: 'proj-1',
      referenceNumber: 'EOT-001',
      claimType: 'EoT',
      causativeEventDate: '2025-01-10',
      notificationDate: '2025-01-15',
      contractClauseNumber: '25.1',
      contractClauseTitle: 'Extension of Time',
      briefDescription: 'Test claim',
      timeClaimed: 10,
      currentStage: 'notified',
      timeBarredRisk: false,
      evidenceItems: [],
      createdBy: 'actor-1',
      createdAt: '2025-01-15T10:00:00Z',
      updatedAt: '2025-01-15T10:00:00Z',
      ...overrides,
    };
  }

  it('JBCC deadline = causativeEventDate + 20 working days', () => {
    const svc = makeTimelineService('2025-01-10');
    const claim = makeClaim({ causativeEventDate: '2025-01-10' });
    const deadlines = svc.calculateDeadlines(claim, 'jbcc_pba');

    const notification = deadlines.find(d => d.deadlineType === 'notification');
    expect(notification).toBeDefined();
    // 20 working days from 2025-01-10 (Fri) = 2025-02-07
    const expectedDate = wdCalc.addWorkingDays('2025-01-10', 20);
    expect(notification!.dueDate).toBe(expectedDate);
    expect(notification!.contractForm).toBe('jbcc_pba');
  });

  it('NEC deadline = notificationDate + 56 calendar days', () => {
    const svc = makeTimelineService('2025-01-15');
    const claim = makeClaim({ notificationDate: '2025-01-15' });
    const deadlines = svc.calculateDeadlines(claim, 'nec_ecc');

    const notification = deadlines.find(d => d.deadlineType === 'notification');
    expect(notification).toBeDefined();
    // 2025-01-15 + 56 days = 2025-03-12
    expect(notification!.dueDate).toBe('2025-03-12');
  });

  it('GCC deadline = causativeEventDate + 28 calendar days', () => {
    const svc = makeTimelineService('2025-02-01');
    const claim = makeClaim({ causativeEventDate: '2025-02-01' });
    const deadlines = svc.calculateDeadlines(claim, 'gcc_2025');

    const notification = deadlines.find(d => d.deadlineType === 'notification');
    expect(notification).toBeDefined();
    // 2025-02-01 + 28 days = 2025-03-01
    expect(notification!.dueDate).toBe('2025-03-01');
  });

  it('FIDIC deadline = notificationDate + 28 calendar days', () => {
    const svc = makeTimelineService('2025-02-05');
    const claim = makeClaim({ notificationDate: '2025-02-05' });
    const deadlines = svc.calculateDeadlines(claim, 'fidic');

    const notification = deadlines.find(d => d.deadlineType === 'notification');
    expect(notification).toBeDefined();
    // 2025-02-05 + 28 days = 2025-03-05
    expect(notification!.dueDate).toBe('2025-03-05');
  });

  it('detects approaching deadline (within withinDays threshold)', async () => {
    const claim = makeClaim({ causativeEventDate: '2025-01-10' });
    const expectedDue = wdCalc.addWorkingDays('2025-01-10', 20);
    // Set "now" to 5 days before the deadline
    const fiveBefore = new Date(expectedDue);
    fiveBefore.setDate(fiveBefore.getDate() - 5);
    const nowStr = fiveBefore.toISOString().substring(0, 10);

    const svc = createNoticeTimelineService({
      workingDayCalculator: wdCalc,
      getClaims: async () => [claim],
      getContractForm: async () => 'jbcc_pba',
      now: () => nowStr,
    });

    const approaching = await svc.getApproachingDeadlines('proj-1', 7);
    expect(approaching.length).toBeGreaterThan(0);
    expect(approaching[0].daysRemaining).toBeLessThanOrEqual(7);
    expect(approaching[0].daysRemaining).toBeGreaterThanOrEqual(0);
  });

  it('detects overdue deadline', async () => {
    const claim = makeClaim({ causativeEventDate: '2025-01-10' });
    // Set "now" far past the JBCC 20WD deadline
    const svc = createNoticeTimelineService({
      workingDayCalculator: wdCalc,
      getClaims: async () => [claim],
      getContractForm: async () => 'jbcc_pba',
      now: () => '2025-06-01',
    });

    const overdue = await svc.getOverdueDeadlines('proj-1');
    expect(overdue.length).toBeGreaterThan(0);
    expect(overdue[0].isOverdue).toBe(true);
    expect(overdue[0].daysRemaining).toBeLessThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Evidence Linkage
// ═══════════════════════════════════════════════════════════════════════════════

describe('Evidence Linkage — Limits and Constraints', () => {
  let service: EvidenceLinkageService;

  const validEvidence = {
    evidenceType: 'site_diary',
    sourceModule: 'site_execution',
    sourceReferenceId: 'se-ref-001',
    dateOfEvidence: '2025-02-10',
    description: 'Daily log showing rain stoppage',
    relevanceCategory: 'delay' as const,
  };

  beforeEach(() => {
    service = createEvidenceLinkageService({ now: fixedClock });
  });

  it('links evidence successfully up to 100 items', () => {
    for (let i = 0; i < 100; i++) {
      const result = service.linkEvidence('claim-1', {
        ...validEvidence,
        sourceReferenceId: `ref-${i}`,
      }, 'actor-1');
      expect(result.id).toBeDefined();
      expect(result.claimId).toBe('claim-1');
    }

    const allEvidence = service.getEvidenceForClaim('claim-1');
    expect(allEvidence.length).toBe(100);
  });

  it('throws when linking the 101st evidence item', () => {
    for (let i = 0; i < 100; i++) {
      service.linkEvidence('claim-1', {
        ...validEvidence,
        sourceReferenceId: `ref-${i}`,
      }, 'actor-1');
    }

    expect(() =>
      service.linkEvidence('claim-1', validEvidence, 'actor-1')
    ).toThrow(/Maximum evidence limit reached/);
  });

  it('unlinks evidence successfully', () => {
    const ev1 = service.linkEvidence('claim-1', validEvidence, 'actor-1');
    service.linkEvidence('claim-1', {
      ...validEvidence, sourceReferenceId: 'ref-2',
    }, 'actor-1');

    service.unlinkEvidence('claim-1', ev1.id, 'actor-1');
    const remaining = service.getEvidenceForClaim('claim-1');
    expect(remaining.length).toBe(1);
  });

  it('throws when unlinking at adjudication stage with only 1 item remaining', () => {
    const ev = service.linkEvidence('claim-1', validEvidence, 'actor-1');
    service.registerClaimState({ id: 'claim-1', currentStage: 'referred_to_adjudication' });

    expect(() =>
      service.unlinkEvidence('claim-1', ev.id, 'actor-1')
    ).toThrow(/must retain at least 1 evidence item/);
  });

  it('generates evidence schedule sorted by date ascending', () => {
    service.linkEvidence('claim-1', {
      ...validEvidence, dateOfEvidence: '2025-03-01', sourceReferenceId: 'ref-c',
    }, 'actor-1');
    service.linkEvidence('claim-1', {
      ...validEvidence, dateOfEvidence: '2025-01-15', sourceReferenceId: 'ref-a',
    }, 'actor-1');
    service.linkEvidence('claim-1', {
      ...validEvidence, dateOfEvidence: '2025-02-10', sourceReferenceId: 'ref-b',
    }, 'actor-1');

    const schedule = service.generateEvidenceSchedule('claim-1');

    expect(schedule.length).toBe(3);
    expect(schedule[0].dateOfEvidence).toBe('2025-01-15');
    expect(schedule[1].dateOfEvidence).toBe('2025-02-10');
    expect(schedule[2].dateOfEvidence).toBe('2025-03-01');
    expect(schedule[0].itemNumber).toBe(1);
    expect(schedule[1].itemNumber).toBe(2);
    expect(schedule[2].itemNumber).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Quantum Analyser
// ═══════════════════════════════════════════════════════════════════════════════

describe('Quantum Analyser — Line Item Calculations', () => {
  let service: QuantumAnalyserService;
  const wdCalc = createWorkingDayCalculator();

  beforeEach(() => {
    service = createQuantumAnalyserService({
      workingDayCalculator: wdCalc,
      now: fixedClock,
    });
  });

  it('calculates line item amount = round(quantity × rate, 2)', () => {
    const assessment = service.createAssessment('claim-1', 'proj-1');
    const updated = service.addLineItem(assessment.id, {
      description: 'Cement bags',
      costCategory: 'materials',
      unit: 'bag',
      quantity: 7,
      rate: 3.33,
    });

    // 7 * 3.33 = 23.31
    expect(updated.lineItems[0].amount).toBe(23.31);
  });

  it('calculates correct category subtotals', () => {
    const assessment = service.createAssessment('claim-1', 'proj-1');
    service.addLineItem(assessment.id, {
      description: 'Labour A', costCategory: 'labour', unit: 'hr', quantity: 10, rate: 100,
    });
    service.addLineItem(assessment.id, {
      description: 'Labour B', costCategory: 'labour', unit: 'hr', quantity: 5, rate: 150,
    });
    const updated = service.addLineItem(assessment.id, {
      description: 'Steel', costCategory: 'materials', unit: 'ton', quantity: 2, rate: 5000,
    });

    expect(updated.subtotalByCategory.labour).toBe(1750); // 1000 + 750
    expect(updated.subtotalByCategory.materials).toBe(10000);
    expect(updated.totalQuantumAmount).toBe(11750);
  });

  it('enforces max 500 line items', () => {
    const assessment = service.createAssessment('claim-1', 'proj-1');
    for (let i = 0; i < 500; i++) {
      service.addLineItem(assessment.id, {
        description: `Item ${i}`, costCategory: 'labour', unit: 'hr', quantity: 1, rate: 1,
      });
    }

    expect(() =>
      service.addLineItem(assessment.id, {
        description: 'Overflow', costCategory: 'labour', unit: 'hr', quantity: 1, rate: 1,
      })
    ).toThrow(/maximum of 500/);
  });

  it('percentages sum correctly across categories', () => {
    const assessment = service.createAssessment('claim-1', 'proj-1');
    service.addLineItem(assessment.id, {
      description: 'Labour', costCategory: 'labour', unit: 'hr', quantity: 10, rate: 100,
    });
    service.addLineItem(assessment.id, {
      description: 'Materials', costCategory: 'materials', unit: 'unit', quantity: 5, rate: 200,
    });
    const updated = service.addLineItem(assessment.id, {
      description: 'Plant', costCategory: 'plant', unit: 'day', quantity: 2, rate: 500,
    });

    // Total = 1000 + 1000 + 1000 = 3000
    // Each category = 33.3%
    const percentageSum = Object.values(updated.percentageByCategory)
      .reduce((sum, val) => sum + val, 0);

    // Allow for rounding (should be very close to 100%)
    expect(percentageSum).toBeGreaterThanOrEqual(99.5);
    expect(percentageSum).toBeLessThanOrEqual(100.5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Delay Analysis
// ═══════════════════════════════════════════════════════════════════════════════

describe('Quantum Analyser — Delay Analysis', () => {
  let service: QuantumAnalyserService;
  const wdCalc = createWorkingDayCalculator();

  beforeEach(() => {
    service = createQuantumAnalyserService({
      workingDayCalculator: wdCalc,
      now: fixedClock,
    });
  });

  it('auto-calculates working days impacted using working day calculator', () => {
    const analysis = service.createDelayAnalysis('claim-1', 'proj-1');
    // 2025-01-06 (Mon) to 2025-01-10 (Fri) = 5 working days
    const updated = service.addDelayEvent(analysis.id, {
      description: 'Rain delay',
      startDate: '2025-01-06',
      endDate: '2025-01-10',
      delayType: 'critical_path',
      responsibleParty: 'employer',
    });

    const expectedDays = wdCalc.countWorkingDays('2025-01-06', '2025-01-10');
    expect(updated.events[0].workingDaysImpacted).toBe(expectedDays);
    expect(updated.events[0].workingDaysImpacted).toBeGreaterThan(0);
  });

  it('calculates net claimable = employer critical - shared concurrent', () => {
    const analysis = service.createDelayAnalysis('claim-1', 'proj-1');

    // Employer critical path delay: 2025-01-06 to 2025-01-17 (Mon-Fri two weeks)
    service.addDelayEvent(analysis.id, {
      description: 'Access delay',
      startDate: '2025-01-06',
      endDate: '2025-01-17',
      delayType: 'critical_path',
      responsibleParty: 'employer',
    });

    // Shared concurrent delay: 2025-01-06 to 2025-01-10 (Mon-Fri one week)
    const updated = service.addDelayEvent(analysis.id, {
      description: 'Joint resource issue',
      startDate: '2025-01-06',
      endDate: '2025-01-10',
      delayType: 'concurrent',
      responsibleParty: 'shared',
    });

    const employerDays = wdCalc.countWorkingDays('2025-01-06', '2025-01-17');
    const sharedDays = wdCalc.countWorkingDays('2025-01-06', '2025-01-10');

    expect(updated.netClaimableDelay).toBe(employerDays - sharedDays);
    expect(updated.netClaimableDelay).toBeGreaterThan(0);
  });

  it('tracks total working days by responsible party', () => {
    const analysis = service.createDelayAnalysis('claim-1', 'proj-1');

    service.addDelayEvent(analysis.id, {
      description: 'Employer delay',
      startDate: '2025-01-06',
      endDate: '2025-01-10',
      delayType: 'critical_path',
      responsibleParty: 'employer',
    });

    const updated = service.addDelayEvent(analysis.id, {
      description: 'Contractor delay',
      startDate: '2025-01-13',
      endDate: '2025-01-17',
      delayType: 'critical_path',
      responsibleParty: 'contractor',
    });

    expect(updated.totalByParty.employer).toBeGreaterThan(0);
    expect(updated.totalByParty.contractor).toBeGreaterThan(0);
    expect(updated.totalByParty.neutral).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Adjudication
// ═══════════════════════════════════════════════════════════════════════════════

describe('Adjudication — Stage Transitions', () => {
  let service: AdjudicationService;

  const validAdjudicationInput = {
    adjudicatorName: 'Adv. J. Modise',
    appointmentDate: '2025-03-01',
    referringParty: 'Contractor XYZ',
    respondentParty: 'Employer ABC',
    disputeValue: 500000,
    timeInDispute: 30,
    referralNoticeRef: 'NOD-2025-001',
    maxSubmissionRounds: 2,
  };

  beforeEach(() => {
    service = createAdjudicationService({ now: fixedClock });
  });

  it('creates adjudication at referred stage', () => {
    const adj = service.createAdjudication('claim-1', validAdjudicationInput, 'actor-1');

    expect(adj.currentStage).toBe('referred');
    expect(adj.adjudicatorName).toBe('Adv. J. Modise');
    expect(adj.disputeValue).toBe(500000);
  });

  it('transitions sequentially through all stages', () => {
    const adj = service.createAdjudication('claim-1', validAdjudicationInput, 'actor-1');

    let updated = service.transitionStage(adj.id, 'adjudicator_appointed', 'a');
    expect(updated.currentStage).toBe('adjudicator_appointed');

    updated = service.transitionStage(adj.id, 'submissions_open', 'a');
    expect(updated.currentStage).toBe('submissions_open');

    updated = service.transitionStage(adj.id, 'submissions_closed', 'a');
    expect(updated.currentStage).toBe('submissions_closed');

    updated = service.transitionStage(adj.id, 'hearing_scheduled', 'a');
    expect(updated.currentStage).toBe('hearing_scheduled');

    updated = service.transitionStage(adj.id, 'hearing_completed', 'a');
    expect(updated.currentStage).toBe('hearing_completed');

    updated = service.transitionStage(adj.id, 'decision_issued', 'a');
    expect(updated.currentStage).toBe('decision_issued');

    updated = service.transitionStage(adj.id, 'decision_implemented', 'a');
    expect(updated.currentStage).toBe('decision_implemented');
  });

  it('allows hearing bypass: submissions_closed → decision_issued', () => {
    const adj = service.createAdjudication('claim-1', validAdjudicationInput, 'actor-1');
    service.transitionStage(adj.id, 'adjudicator_appointed', 'a');
    service.transitionStage(adj.id, 'submissions_open', 'a');
    service.transitionStage(adj.id, 'submissions_closed', 'a');

    // Bypass hearing stages directly to decision_issued
    const updated = service.transitionStage(adj.id, 'decision_issued', 'a');
    expect(updated.currentStage).toBe('decision_issued');
  });

  it('throws on invalid stage transition', () => {
    const adj = service.createAdjudication('claim-1', validAdjudicationInput, 'actor-1');

    expect(() =>
      service.transitionStage(adj.id, 'decision_issued', 'a')
    ).toThrow(/cannot move from 'referred' to 'decision_issued'/);
  });

  it('recordDecision validates bounds and transitions to decision_issued', () => {
    const adj = service.createAdjudication('claim-1', validAdjudicationInput, 'actor-1');
    service.transitionStage(adj.id, 'adjudicator_appointed', 'a');
    service.transitionStage(adj.id, 'submissions_open', 'a');
    service.transitionStage(adj.id, 'submissions_closed', 'a');
    service.transitionStage(adj.id, 'hearing_scheduled', 'a');
    service.transitionStage(adj.id, 'hearing_completed', 'a');

    const decided = service.recordDecision(adj.id, {
      decisionDate: '2025-04-15',
      amountAwarded: 350000,
      timeAwarded: 20,
      decisionSummary: 'Partial award in favour of claimant',
      isInterimBinding: true,
    }, 'actor-1');

    expect(decided.currentStage).toBe('decision_issued');
    expect(decided.amountAwarded).toBe(350000);
    expect(decided.timeAwarded).toBe(20);
    expect(decided.decisionSummary).toBe('Partial award in favour of claimant');
  });

  it('recordDecision rejects amount out of bounds', () => {
    const adj = service.createAdjudication('claim-1', validAdjudicationInput, 'actor-1');
    service.transitionStage(adj.id, 'adjudicator_appointed', 'a');
    service.transitionStage(adj.id, 'submissions_open', 'a');
    service.transitionStage(adj.id, 'submissions_closed', 'a');
    service.transitionStage(adj.id, 'hearing_scheduled', 'a');
    service.transitionStage(adj.id, 'hearing_completed', 'a');

    expect(() =>
      service.recordDecision(adj.id, {
        decisionDate: '2025-04-15',
        amountAwarded: -1,
        timeAwarded: 20,
        decisionSummary: 'Invalid',
        isInterimBinding: true,
      }, 'actor-1')
    ).toThrow(/amountAwarded must be between 0 and/);
  });

  it('recordDecision rejects time out of bounds', () => {
    const adj = service.createAdjudication('claim-1', validAdjudicationInput, 'actor-1');
    service.transitionStage(adj.id, 'adjudicator_appointed', 'a');
    service.transitionStage(adj.id, 'submissions_open', 'a');
    service.transitionStage(adj.id, 'submissions_closed', 'a');
    service.transitionStage(adj.id, 'hearing_scheduled', 'a');
    service.transitionStage(adj.id, 'hearing_completed', 'a');

    expect(() =>
      service.recordDecision(adj.id, {
        decisionDate: '2025-04-15',
        amountAwarded: 100000,
        timeAwarded: 10000,
        decisionSummary: 'Invalid',
        isInterimBinding: true,
      }, 'actor-1')
    ).toThrow(/timeAwarded must be between 0 and 9999/);
  });
});
