/**
 * Unit tests for ProfitabilityCalculatorService
 *
 * Tests margin calculation, status classification at threshold boundaries,
 * per-stage profitability, firm-wide reporting, and notification generation.
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
import {
  calculateProjectMargin,
  calculateStageMargin,
  getFirmProfitability,
  classifyMarginStatus,
  computeMarginPercent,
  generateProfitabilityNotifications,
} from '../profitabilityCalculatorService';
import type { ProfitabilityInput } from '../profitabilityCalculatorService';

// ─── Test Fixtures ──────────────────────────────────────────────────────

const FIRM_ID = 'firm_001';
const PROJECT_ID = 'proj_001';

function makeProfitabilityInput(overrides: Partial<ProfitabilityInput> = {}): ProfitabilityInput {
  return {
    projectId: PROJECT_ID,
    feeEarnedCents: 1000000, // R10,000
    timeCostCents: 500000,   // R5,000
    disbursementsCents: 100000, // R1,000
    writeOffsCents: 0,
    ...overrides,
  };
}

// ─── classifyMarginStatus ────────────────────────────────────────────────

describe('classifyMarginStatus', () => {
  it('returns profitable for margin >= 20%', () => {
    expect(classifyMarginStatus(20)).toBe('profitable');
    expect(classifyMarginStatus(50)).toBe('profitable');
    expect(classifyMarginStatus(100)).toBe('profitable');
  });

  it('returns at_risk for margin >= 0% and < 20%', () => {
    expect(classifyMarginStatus(0)).toBe('at_risk');
    expect(classifyMarginStatus(10)).toBe('at_risk');
    expect(classifyMarginStatus(19.99)).toBe('at_risk');
  });

  it('returns loss_making for margin < 0%', () => {
    expect(classifyMarginStatus(-1)).toBe('loss_making');
    expect(classifyMarginStatus(-50)).toBe('loss_making');
    expect(classifyMarginStatus(-100)).toBe('loss_making');
  });

  it('handles exact boundary at 20%', () => {
    expect(classifyMarginStatus(20)).toBe('profitable');
    expect(classifyMarginStatus(19.999999)).toBe('at_risk');
  });

  it('handles exact boundary at 0%', () => {
    expect(classifyMarginStatus(0)).toBe('at_risk');
    expect(classifyMarginStatus(-0.001)).toBe('loss_making');
  });
});

// ─── computeMarginPercent ────────────────────────────────────────────────

describe('computeMarginPercent', () => {
  it('computes correct margin when all values are positive', () => {
    // (1000000 - 500000 - 100000 - 0) / 1000000 * 100 = 40%
    const result = computeMarginPercent(1000000, 500000, 100000, 0);
    expect(result).toBe(40);
  });

  it('returns 0% when costs exactly equal fee', () => {
    const result = computeMarginPercent(1000000, 800000, 200000, 0);
    expect(result).toBe(0);
  });

  it('returns negative margin when costs exceed fee', () => {
    // (1000000 - 800000 - 300000 - 0) / 1000000 * 100 = -10%
    const result = computeMarginPercent(1000000, 800000, 300000, 0);
    expect(result).toBe(-10);
  });

  it('returns -100 when fee is 0 but costs exist', () => {
    const result = computeMarginPercent(0, 500000, 0, 0);
    expect(result).toBe(-100);
  });

  it('returns 0 when both fee and costs are zero', () => {
    const result = computeMarginPercent(0, 0, 0, 0);
    expect(result).toBe(0);
  });

  it('includes write-offs in cost calculation', () => {
    // (1000000 - 400000 - 100000 - 200000) / 1000000 * 100 = 30%
    const result = computeMarginPercent(1000000, 400000, 100000, 200000);
    expect(result).toBe(30);
  });
});

// ─── calculateProjectMargin ──────────────────────────────────────────────

describe('calculateProjectMargin', () => {
  it('computes correct ProfitabilityResult for a profitable project', () => {
    const input = makeProfitabilityInput({
      feeEarnedCents: 1000000,
      timeCostCents: 400000,
      disbursementsCents: 100000,
      writeOffsCents: 0,
    });

    const result = calculateProjectMargin(input);

    expect(result.projectId).toBe(PROJECT_ID);
    expect(result.feeEarnedCents).toBe(1000000);
    expect(result.timeCostCents).toBe(400000);
    expect(result.disbursementsCents).toBe(100000);
    expect(result.writeOffsCents).toBe(0);
    expect(result.netProfitCents).toBe(500000);
    expect(result.marginPercent).toBe(50);
    expect(result.status).toBe('profitable');
  });

  it('correctly classifies an at-risk project (margin 0-20%)', () => {
    const input = makeProfitabilityInput({
      feeEarnedCents: 1000000,
      timeCostCents: 850000,
      disbursementsCents: 50000,
      writeOffsCents: 0,
    });

    const result = calculateProjectMargin(input);

    expect(result.netProfitCents).toBe(100000);
    expect(result.marginPercent).toBe(10);
    expect(result.status).toBe('at_risk');
  });

  it('correctly classifies a loss-making project (margin < 0%)', () => {
    const input = makeProfitabilityInput({
      feeEarnedCents: 1000000,
      timeCostCents: 900000,
      disbursementsCents: 200000,
      writeOffsCents: 50000,
    });

    const result = calculateProjectMargin(input);

    expect(result.netProfitCents).toBe(-150000);
    expect(result.marginPercent).toBe(-15);
    expect(result.status).toBe('loss_making');
  });

  it('does not include stage in project-level result', () => {
    const input = makeProfitabilityInput();
    const result = calculateProjectMargin(input);

    expect(result.stage).toBeUndefined();
  });

  it('handles write-offs reducing margin', () => {
    const input = makeProfitabilityInput({
      feeEarnedCents: 1000000,
      timeCostCents: 500000,
      disbursementsCents: 100000,
      writeOffsCents: 300000,
    });

    const result = calculateProjectMargin(input);

    expect(result.netProfitCents).toBe(100000);
    expect(result.marginPercent).toBe(10);
    expect(result.status).toBe('at_risk');
  });
});

// ─── calculateStageMargin ────────────────────────────────────────────────

describe('calculateStageMargin', () => {
  it('computes stage-level profitability with stage field included', () => {
    const input: ProfitabilityInput = {
      projectId: PROJECT_ID,
      stage: 'stage_3_design_development',
      feeEarnedCents: 500000,
      timeCostCents: 200000,
      disbursementsCents: 50000,
      writeOffsCents: 0,
    };

    const result = calculateStageMargin(input);

    expect(result.projectId).toBe(PROJECT_ID);
    expect(result.stage).toBe('stage_3_design_development');
    expect(result.netProfitCents).toBe(250000);
    expect(result.marginPercent).toBe(50);
    expect(result.status).toBe('profitable');
  });

  it('identifies a loss-making stage within a project', () => {
    const input: ProfitabilityInput = {
      projectId: PROJECT_ID,
      stage: 'stage_4_documentation',
      feeEarnedCents: 200000,
      timeCostCents: 250000,
      disbursementsCents: 30000,
      writeOffsCents: 0,
    };

    const result = calculateStageMargin(input);

    expect(result.netProfitCents).toBe(-80000);
    expect(result.marginPercent).toBe(-40);
    expect(result.status).toBe('loss_making');
  });

  it('handles zero fee for a stage', () => {
    const input: ProfitabilityInput = {
      projectId: PROJECT_ID,
      stage: 'stage_1_inception',
      feeEarnedCents: 0,
      timeCostCents: 50000,
      disbursementsCents: 0,
      writeOffsCents: 0,
    };

    const result = calculateStageMargin(input);

    expect(result.marginPercent).toBe(-100);
    expect(result.status).toBe('loss_making');
  });
});

// ─── getFirmProfitability ────────────────────────────────────────────────

describe('getFirmProfitability', () => {
  it('aggregates profitability across multiple projects', () => {
    const inputs: ProfitabilityInput[] = [
      {
        projectId: 'proj_001',
        feeEarnedCents: 1000000,
        timeCostCents: 400000,
        disbursementsCents: 100000,
        writeOffsCents: 0,
      },
      {
        projectId: 'proj_002',
        feeEarnedCents: 500000,
        timeCostCents: 300000,
        disbursementsCents: 50000,
        writeOffsCents: 50000,
      },
    ];

    const report = getFirmProfitability(FIRM_ID, inputs);

    expect(report.firmId).toBe(FIRM_ID);
    expect(report.projects).toHaveLength(2);
    expect(report.totalRevenueCents).toBe(1500000);
    expect(report.totalCostsCents).toBe(900000);
    expect(report.totalProfitCents).toBe(600000);
    // Weighted average: 600000 / 1500000 * 100 = 40%
    expect(report.averageMarginPercent).toBe(40);
  });

  it('returns zero averages for empty project list', () => {
    const report = getFirmProfitability(FIRM_ID, []);

    expect(report.projects).toHaveLength(0);
    expect(report.totalRevenueCents).toBe(0);
    expect(report.totalCostsCents).toBe(0);
    expect(report.totalProfitCents).toBe(0);
    expect(report.averageMarginPercent).toBe(0);
  });

  it('computes weighted average margin (not arithmetic mean)', () => {
    // Project 1: fee 800000, costs 400000 → margin 50%
    // Project 2: fee 200000, costs 180000 → margin 10%
    // Arithmetic mean: (50 + 10) / 2 = 30%
    // Weighted: (400000 + 20000) / (800000 + 200000) * 100 = 42%
    const inputs: ProfitabilityInput[] = [
      {
        projectId: 'proj_a',
        feeEarnedCents: 800000,
        timeCostCents: 400000,
        disbursementsCents: 0,
        writeOffsCents: 0,
      },
      {
        projectId: 'proj_b',
        feeEarnedCents: 200000,
        timeCostCents: 180000,
        disbursementsCents: 0,
        writeOffsCents: 0,
      },
    ];

    const report = getFirmProfitability(FIRM_ID, inputs);

    // Total profit: 400000 + 20000 = 420000
    // Total revenue: 1000000
    // Weighted avg: 420000 / 1000000 * 100 = 42%
    expect(report.averageMarginPercent).toBe(42);
  });

  it('individual project results have correct status classification', () => {
    const inputs: ProfitabilityInput[] = [
      {
        projectId: 'profitable',
        feeEarnedCents: 1000000,
        timeCostCents: 500000,
        disbursementsCents: 0,
        writeOffsCents: 0,
      },
      {
        projectId: 'at_risk',
        feeEarnedCents: 1000000,
        timeCostCents: 850000,
        disbursementsCents: 50000,
        writeOffsCents: 0,
      },
      {
        projectId: 'loss_making',
        feeEarnedCents: 1000000,
        timeCostCents: 900000,
        disbursementsCents: 200000,
        writeOffsCents: 0,
      },
    ];

    const report = getFirmProfitability(FIRM_ID, inputs);

    expect(report.projects[0].status).toBe('profitable');
    expect(report.projects[1].status).toBe('at_risk');
    expect(report.projects[2].status).toBe('loss_making');
  });
});

// ─── generateProfitabilityNotifications ──────────────────────────────────

describe('generateProfitabilityNotifications', () => {
  it('generates no notifications for a profitable project', () => {
    const result = calculateProjectMargin(makeProfitabilityInput({
      feeEarnedCents: 1000000,
      timeCostCents: 400000,
      disbursementsCents: 100000,
      writeOffsCents: 0,
    }));

    const notifications = generateProfitabilityNotifications(result);
    expect(notifications).toHaveLength(0);
  });

  it('notifies project lead when margin < 20% (at_risk)', () => {
    const result = calculateProjectMargin(makeProfitabilityInput({
      feeEarnedCents: 1000000,
      timeCostCents: 850000,
      disbursementsCents: 50000,
      writeOffsCents: 0,
    }));

    const notifications = generateProfitabilityNotifications(result);

    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('at_risk');
    expect(notifications[0].notifyRole).toBe('project_lead');
    expect(notifications[0].projectId).toBe(PROJECT_ID);
  });

  it('notifies both directors and project lead when margin < 0% (loss_making)', () => {
    const result = calculateProjectMargin(makeProfitabilityInput({
      feeEarnedCents: 1000000,
      timeCostCents: 900000,
      disbursementsCents: 200000,
      writeOffsCents: 0,
    }));

    const notifications = generateProfitabilityNotifications(result);

    expect(notifications).toHaveLength(2);
    // Directors get loss_making notification
    const directorsNotification = notifications.find((n) => n.notifyRole === 'directors');
    expect(directorsNotification).toBeDefined();
    expect(directorsNotification!.type).toBe('loss_making');
    // Project lead also gets at_risk notification (margin < 20%)
    const leadNotification = notifications.find((n) => n.notifyRole === 'project_lead');
    expect(leadNotification).toBeDefined();
    expect(leadNotification!.type).toBe('at_risk');
  });

  it('includes stage info in notifications when result has a stage', () => {
    const result = calculateStageMargin({
      projectId: PROJECT_ID,
      stage: 'stage_4_documentation',
      feeEarnedCents: 200000,
      timeCostCents: 250000,
      disbursementsCents: 0,
      writeOffsCents: 0,
    });

    const notifications = generateProfitabilityNotifications(result);

    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications[0].stage).toBe('stage_4_documentation');
    expect(notifications[0].message).toContain('stage_4_documentation');
  });
});
