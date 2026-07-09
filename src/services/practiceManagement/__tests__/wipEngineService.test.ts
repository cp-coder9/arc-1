/**
 * WIP Engine Service — Unit Tests
 *
 * Tests WIP calculation per project and per stage, loss indicator flag,
 * firm-wide aggregation, and WIP report column output.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */

import {
  calculateProjectWip,
  calculateStageWip,
  getFirmWipReport,
} from '../wipEngineService';
import type { ProjectCostData, WipStageCostData } from '../wipEngineService';
import type { ProjectFeeStructure } from '../types';

// ─── Test Fixtures ───────────────────────────────────────────────────────────

function createFeeStructure(overrides?: Partial<ProjectFeeStructure>): ProjectFeeStructure {
  return {
    id: 'fee_1',
    firmId: 'firm_1',
    projectId: 'project_1',
    totalAgreedFeeCents: 1_000_000, // R10,000
    feeBasis: 'lump_sum',
    stageBreakdown: [
      { stage: 'stage_1_inception', allocatedFeeCents: 100_000 },
      { stage: 'stage_2_concept', allocatedFeeCents: 200_000 },
      { stage: 'stage_3_design_development', allocatedFeeCents: 300_000 },
      { stage: 'stage_4_documentation', allocatedFeeCents: 250_000 },
      { stage: 'stage_5_construction', allocatedFeeCents: 100_000 },
      { stage: 'stage_6_close_out', allocatedFeeCents: 50_000 },
    ],
    createdBy: 'admin_1',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createCostData(overrides?: Partial<ProjectCostData>): ProjectCostData {
  return {
    projectId: 'project_1',
    timeCostsCents: 300_000,
    disbursementsCents: 50_000,
    amountInvoicedCents: 200_000,
    amountCollectedCents: 150_000,
    ...overrides,
  };
}

// ─── calculateProjectWip ─────────────────────────────────────────────────────

describe('calculateProjectWip', () => {
  it('should calculate WIP as agreed_fee - costs_incurred - amount_invoiced', () => {
    const feeStructure = createFeeStructure();
    const costData = createCostData();

    const result = calculateProjectWip(feeStructure, costData);

    // WIP = 1,000,000 - (300,000 + 50,000) - 200,000 = 450,000
    expect(result.wipBalanceCents).toBe(450_000);
    expect(result.agreedFeeCents).toBe(1_000_000);
    expect(result.costsIncurredCents).toBe(350_000);
    expect(result.amountInvoicedCents).toBe(200_000);
    expect(result.amountCollectedCents).toBe(150_000);
    expect(result.projectId).toBe('project_1');
  });

  it('should set isLoss to true when costs >= fee', () => {
    const feeStructure = createFeeStructure({ totalAgreedFeeCents: 500_000 });
    const costData = createCostData({
      timeCostsCents: 400_000,
      disbursementsCents: 100_000, // total costs = 500,000 = fee
    });

    const result = calculateProjectWip(feeStructure, costData);

    expect(result.isLoss).toBe(true);
  });

  it('should set isLoss to true when costs exceed fee', () => {
    const feeStructure = createFeeStructure({ totalAgreedFeeCents: 300_000 });
    const costData = createCostData({
      timeCostsCents: 250_000,
      disbursementsCents: 100_000, // total costs = 350,000 > 300,000
    });

    const result = calculateProjectWip(feeStructure, costData);

    expect(result.isLoss).toBe(true);
  });

  it('should set isLoss to false when costs are less than fee', () => {
    const feeStructure = createFeeStructure({ totalAgreedFeeCents: 1_000_000 });
    const costData = createCostData({
      timeCostsCents: 200_000,
      disbursementsCents: 50_000,
    });

    const result = calculateProjectWip(feeStructure, costData);

    expect(result.isLoss).toBe(false);
  });

  it('should produce negative WIP balance when costs + invoiced exceed fee', () => {
    const feeStructure = createFeeStructure({ totalAgreedFeeCents: 500_000 });
    const costData = createCostData({
      timeCostsCents: 300_000,
      disbursementsCents: 100_000,
      amountInvoicedCents: 200_000,
      // WIP = 500,000 - 400,000 - 200,000 = -100,000
    });

    const result = calculateProjectWip(feeStructure, costData);

    expect(result.wipBalanceCents).toBe(-100_000);
  });

  it('should handle zero costs (new project with no activity)', () => {
    const feeStructure = createFeeStructure();
    const costData = createCostData({
      timeCostsCents: 0,
      disbursementsCents: 0,
      amountInvoicedCents: 0,
      amountCollectedCents: 0,
    });

    const result = calculateProjectWip(feeStructure, costData);

    expect(result.wipBalanceCents).toBe(1_000_000);
    expect(result.costsIncurredCents).toBe(0);
    expect(result.isLoss).toBe(false);
  });
});

// ─── calculateStageWip ───────────────────────────────────────────────────────

describe('calculateStageWip', () => {
  it('should calculate WIP for a specific stage', () => {
    const feeStructure = createFeeStructure();
    const stageCosts: WipStageCostData = {
      stage: 'stage_2_concept',
      timeCostsCents: 80_000,
      disbursementsCents: 10_000,
      amountInvoicedCents: 50_000,
      amountCollectedCents: 50_000,
    };

    const result = calculateStageWip(feeStructure, 'stage_2_concept', stageCosts);

    // Stage 2 fee = 200,000. WIP = 200,000 - 90,000 - 50,000 = 60,000
    expect(result).not.toBeNull();
    expect(result!.agreedFeeCents).toBe(200_000);
    expect(result!.costsIncurredCents).toBe(90_000);
    expect(result!.wipBalanceCents).toBe(60_000);
    expect(result!.stage).toBe('stage_2_concept');
    expect(result!.isLoss).toBe(false);
  });

  it('should flag loss when stage costs exceed stage fee', () => {
    const feeStructure = createFeeStructure();
    const stageCosts: WipStageCostData = {
      stage: 'stage_6_close_out',
      timeCostsCents: 40_000,
      disbursementsCents: 15_000,
      amountInvoicedCents: 0,
      amountCollectedCents: 0,
    };

    const result = calculateStageWip(feeStructure, 'stage_6_close_out', stageCosts);

    // Stage 6 fee = 50,000. Costs = 55,000. Loss!
    expect(result).not.toBeNull();
    expect(result!.isLoss).toBe(true);
    expect(result!.wipBalanceCents).toBe(-5_000);
  });

  it('should return null if the stage is not found in fee structure', () => {
    const feeStructure = createFeeStructure({
      stageBreakdown: [
        { stage: 'stage_1_inception', allocatedFeeCents: 1_000_000 },
      ],
    });
    const stageCosts: WipStageCostData = {
      stage: 'stage_3_design_development',
      timeCostsCents: 10_000,
      disbursementsCents: 0,
      amountInvoicedCents: 0,
      amountCollectedCents: 0,
    };

    const result = calculateStageWip(feeStructure, 'stage_3_design_development', stageCosts);

    expect(result).toBeNull();
  });

  it('should include projectId in stage WIP position', () => {
    const feeStructure = createFeeStructure({ projectId: 'project_abc' });
    const stageCosts: WipStageCostData = {
      stage: 'stage_1_inception',
      timeCostsCents: 0,
      disbursementsCents: 0,
      amountInvoicedCents: 0,
      amountCollectedCents: 0,
    };

    const result = calculateStageWip(feeStructure, 'stage_1_inception', stageCosts);

    expect(result).not.toBeNull();
    expect(result!.projectId).toBe('project_abc');
  });
});

// ─── getFirmWipReport ────────────────────────────────────────────────────────

describe('getFirmWipReport', () => {
  it('should aggregate WIP across all active projects', () => {
    const feeStructures: ProjectFeeStructure[] = [
      createFeeStructure({ projectId: 'p1', totalAgreedFeeCents: 500_000 }),
      createFeeStructure({ projectId: 'p2', totalAgreedFeeCents: 800_000 }),
    ];

    const costDataByProject = new Map<string, ProjectCostData>([
      ['p1', { projectId: 'p1', timeCostsCents: 100_000, disbursementsCents: 20_000, amountInvoicedCents: 50_000, amountCollectedCents: 50_000 }],
      ['p2', { projectId: 'p2', timeCostsCents: 200_000, disbursementsCents: 30_000, amountInvoicedCents: 100_000, amountCollectedCents: 80_000 }],
    ]);

    const report = getFirmWipReport('firm_1', feeStructures, costDataByProject);

    expect(report.firmId).toBe('firm_1');
    expect(report.projects).toHaveLength(2);
    expect(report.totalAgreedFeeCents).toBe(1_300_000);
    expect(report.totalCostsIncurredCents).toBe(350_000); // 120,000 + 230,000
    expect(report.totalInvoicedCents).toBe(150_000);
    expect(report.totalCollectedCents).toBe(130_000);
    // Total WIP = (500,000 - 120,000 - 50,000) + (800,000 - 230,000 - 100,000) = 330,000 + 470,000 = 800,000
    expect(report.totalWipBalanceCents).toBe(800_000);
    expect(report.calculatedAt).toBeDefined();
  });

  it('should handle projects with no cost data (zero costs)', () => {
    const feeStructures: ProjectFeeStructure[] = [
      createFeeStructure({ projectId: 'p_new', totalAgreedFeeCents: 250_000 }),
    ];

    const costDataByProject = new Map<string, ProjectCostData>();

    const report = getFirmWipReport('firm_1', feeStructures, costDataByProject);

    expect(report.projects).toHaveLength(1);
    expect(report.projects[0].costsIncurredCents).toBe(0);
    expect(report.projects[0].wipBalanceCents).toBe(250_000);
    expect(report.projects[0].isLoss).toBe(false);
    expect(report.totalWipBalanceCents).toBe(250_000);
  });

  it('should return empty report when no projects exist', () => {
    const report = getFirmWipReport('firm_1', [], new Map());

    expect(report.projects).toHaveLength(0);
    expect(report.totalAgreedFeeCents).toBe(0);
    expect(report.totalCostsIncurredCents).toBe(0);
    expect(report.totalInvoicedCents).toBe(0);
    expect(report.totalCollectedCents).toBe(0);
    expect(report.totalWipBalanceCents).toBe(0);
  });

  it('should include loss indicators per project in the report', () => {
    const feeStructures: ProjectFeeStructure[] = [
      createFeeStructure({ projectId: 'profitable', totalAgreedFeeCents: 1_000_000 }),
      createFeeStructure({ projectId: 'loss_making', totalAgreedFeeCents: 200_000 }),
    ];

    const costDataByProject = new Map<string, ProjectCostData>([
      ['profitable', { projectId: 'profitable', timeCostsCents: 100_000, disbursementsCents: 0, amountInvoicedCents: 0, amountCollectedCents: 0 }],
      ['loss_making', { projectId: 'loss_making', timeCostsCents: 180_000, disbursementsCents: 30_000, amountInvoicedCents: 0, amountCollectedCents: 0 }],
    ]);

    const report = getFirmWipReport('firm_1', feeStructures, costDataByProject);

    const profitable = report.projects.find((p) => p.projectId === 'profitable');
    const lossMaking = report.projects.find((p) => p.projectId === 'loss_making');

    expect(profitable!.isLoss).toBe(false);
    expect(lossMaking!.isLoss).toBe(true);
  });

  it('should produce WIP report columns matching Requirement 5.2', () => {
    const feeStructures: ProjectFeeStructure[] = [
      createFeeStructure({ projectId: 'p1', totalAgreedFeeCents: 600_000 }),
    ];

    const costDataByProject = new Map<string, ProjectCostData>([
      ['p1', { projectId: 'p1', timeCostsCents: 150_000, disbursementsCents: 25_000, amountInvoicedCents: 100_000, amountCollectedCents: 75_000 }],
    ]);

    const report = getFirmWipReport('firm_1', feeStructures, costDataByProject);
    const position = report.projects[0];

    // Verifies all WIP report columns are present
    expect(position).toHaveProperty('projectId');
    expect(position).toHaveProperty('agreedFeeCents');
    expect(position).toHaveProperty('costsIncurredCents');
    expect(position).toHaveProperty('amountInvoicedCents');
    expect(position).toHaveProperty('amountCollectedCents');
    expect(position).toHaveProperty('wipBalanceCents');
    expect(position).toHaveProperty('isLoss');

    // Verify formula: WIP = 600,000 - 175,000 - 100,000 = 325,000
    expect(position.wipBalanceCents).toBe(325_000);
  });
});
