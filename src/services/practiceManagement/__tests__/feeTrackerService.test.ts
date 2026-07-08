/**
 * Unit tests for FeeTrackerService
 *
 * Tests fee structure definition, stage breakdown calculation,
 * and fee health monitoring (warning/over-run thresholds).
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
import {
  defineProjectFee,
  getStageBreakdown,
  checkFeeHealth,
  WARNING_THRESHOLD_PERCENT,
  OVERRUN_THRESHOLD_PERCENT,
} from '../feeTrackerService';
import type {
  DefineProjectFeeInput,
  StageCostData,
} from '../feeTrackerService';
import type { ProjectFeeStructure, SacapWorkStage } from '../types';

// ─── Test Fixtures ──────────────────────────────────────────────────────

const FIRM_ID = 'firm_001';
const PROJECT_ID = 'proj_001';
const ADMIN_USER = 'admin_001';

function makeFeeStructure(overrides: Partial<ProjectFeeStructure> = {}): ProjectFeeStructure {
  return {
    id: 'fee_001',
    firmId: FIRM_ID,
    projectId: PROJECT_ID,
    totalAgreedFeeCents: 1_000_000, // R10,000
    feeBasis: 'lump_sum',
    stageBreakdown: [
      { stage: 'stage_1_inception', fixedAmountCents: 100_000, allocatedFeeCents: 100_000 },
      { stage: 'stage_2_concept', fixedAmountCents: 200_000, allocatedFeeCents: 200_000 },
      { stage: 'stage_3_design_development', fixedAmountCents: 300_000, allocatedFeeCents: 300_000 },
      { stage: 'stage_4_documentation', fixedAmountCents: 250_000, allocatedFeeCents: 250_000 },
      { stage: 'stage_5_construction', fixedAmountCents: 100_000, allocatedFeeCents: 100_000 },
      { stage: 'stage_6_close_out', fixedAmountCents: 50_000, allocatedFeeCents: 50_000 },
    ],
    createdBy: ADMIN_USER,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeStageCosts(costs: Partial<Record<SacapWorkStage, { time: number; disb: number }>>): StageCostData[] {
  return Object.entries(costs).map(([stage, data]) => ({
    stage: stage as SacapWorkStage,
    timeCostsCents: data!.time,
    disbursementsCents: data!.disb,
  }));
}

// ─── defineProjectFee ────────────────────────────────────────────────────

describe('FeeTrackerService', () => {
  describe('defineProjectFee', () => {
    it('creates a lump_sum fee structure with fixed amounts per stage', () => {
      const input: DefineProjectFeeInput = {
        firmId: FIRM_ID,
        projectId: PROJECT_ID,
        totalAgreedFeeCents: 500_000,
        feeBasis: 'lump_sum',
        stageBreakdown: [
          { stage: 'stage_1_inception', fixedAmountCents: 50_000 },
          { stage: 'stage_2_concept', fixedAmountCents: 100_000 },
          { stage: 'stage_3_design_development', fixedAmountCents: 150_000 },
          { stage: 'stage_4_documentation', fixedAmountCents: 100_000 },
          { stage: 'stage_5_construction', fixedAmountCents: 75_000 },
          { stage: 'stage_6_close_out', fixedAmountCents: 25_000 },
        ],
        createdBy: ADMIN_USER,
      };

      const result = defineProjectFee(input);

      expect(result.firmId).toBe(FIRM_ID);
      expect(result.projectId).toBe(PROJECT_ID);
      expect(result.totalAgreedFeeCents).toBe(500_000);
      expect(result.feeBasis).toBe('lump_sum');
      expect(result.stageBreakdown).toHaveLength(6);
      expect(result.stageBreakdown[0].allocatedFeeCents).toBe(50_000);
      expect(result.stageBreakdown[2].allocatedFeeCents).toBe(150_000);
      expect(result.id).toBeTruthy();
      expect(result.createdAt).toBeTruthy();
      expect(result.updatedAt).toBeTruthy();
    });

    it('creates a time_based fee structure with fixed amounts', () => {
      const input: DefineProjectFeeInput = {
        firmId: FIRM_ID,
        projectId: PROJECT_ID,
        totalAgreedFeeCents: 800_000,
        feeBasis: 'time_based',
        stageBreakdown: [
          { stage: 'stage_1_inception', fixedAmountCents: 200_000 },
          { stage: 'stage_2_concept', fixedAmountCents: 300_000 },
          { stage: 'stage_3_design_development', fixedAmountCents: 300_000 },
        ],
        createdBy: ADMIN_USER,
      };

      const result = defineProjectFee(input);

      expect(result.feeBasis).toBe('time_based');
      expect(result.stageBreakdown).toHaveLength(3);
      expect(result.stageBreakdown[0].allocatedFeeCents).toBe(200_000);
    });

    it('creates a percentage_of_construction_cost fee structure with percentage allocations', () => {
      const input: DefineProjectFeeInput = {
        firmId: FIRM_ID,
        projectId: PROJECT_ID,
        totalAgreedFeeCents: 1_200_000,
        feeBasis: 'percentage_of_construction_cost',
        constructionCostCents: 20_000_000,
        stageBreakdown: [
          { stage: 'stage_1_inception', percentage: 10 },
          { stage: 'stage_2_concept', percentage: 20 },
          { stage: 'stage_3_design_development', percentage: 30 },
          { stage: 'stage_4_documentation', percentage: 25 },
          { stage: 'stage_5_construction', percentage: 10 },
          { stage: 'stage_6_close_out', percentage: 5 },
        ],
        createdBy: ADMIN_USER,
      };

      const result = defineProjectFee(input);

      expect(result.feeBasis).toBe('percentage_of_construction_cost');
      expect(result.constructionCostCents).toBe(20_000_000);
      expect(result.stageBreakdown[0].allocatedFeeCents).toBe(120_000); // 10% of 1,200,000
      expect(result.stageBreakdown[1].allocatedFeeCents).toBe(240_000); // 20% of 1,200,000
      expect(result.stageBreakdown[2].allocatedFeeCents).toBe(360_000); // 30% of 1,200,000
    });

    it('throws error when percentage basis lacks construction cost', () => {
      const input: DefineProjectFeeInput = {
        firmId: FIRM_ID,
        projectId: PROJECT_ID,
        totalAgreedFeeCents: 1_200_000,
        feeBasis: 'percentage_of_construction_cost',
        stageBreakdown: [
          { stage: 'stage_1_inception', percentage: 100 },
        ],
        createdBy: ADMIN_USER,
      };

      expect(() => defineProjectFee(input)).toThrow('constructionCostCents is required');
    });

    it('does not include constructionCostCents for non-percentage fee basis', () => {
      const input: DefineProjectFeeInput = {
        firmId: FIRM_ID,
        projectId: PROJECT_ID,
        totalAgreedFeeCents: 500_000,
        feeBasis: 'lump_sum',
        constructionCostCents: 10_000_000, // should be ignored
        stageBreakdown: [
          { stage: 'stage_1_inception', fixedAmountCents: 500_000 },
        ],
        createdBy: ADMIN_USER,
      };

      const result = defineProjectFee(input);

      expect(result.constructionCostCents).toBeUndefined();
    });

    it('generates unique IDs', () => {
      const input: DefineProjectFeeInput = {
        firmId: FIRM_ID,
        projectId: PROJECT_ID,
        totalAgreedFeeCents: 100_000,
        feeBasis: 'lump_sum',
        stageBreakdown: [
          { stage: 'stage_1_inception', fixedAmountCents: 100_000 },
        ],
        createdBy: ADMIN_USER,
      };

      const result1 = defineProjectFee(input);
      const result2 = defineProjectFee(input);

      expect(result1.id).toBeTruthy();
      expect(result2.id).toBeTruthy();
    });
  });

  // ─── getStageBreakdown ─────────────────────────────────────────────────

  describe('getStageBreakdown', () => {
    it('calculates per-stage breakdown with agreed fee, costs, and net position', () => {
      const feeStructure = makeFeeStructure();
      const stageCosts = makeStageCosts({
        stage_1_inception: { time: 50_000, disb: 10_000 },
        stage_2_concept: { time: 120_000, disb: 20_000 },
        stage_3_design_development: { time: 200_000, disb: 30_000 },
      });

      const result = getStageBreakdown(feeStructure, stageCosts);

      expect(result).toHaveLength(6);

      // Stage 1: fee 100k, costs 60k, net +40k
      expect(result[0].stage).toBe('stage_1_inception');
      expect(result[0].agreedFeeCents).toBe(100_000);
      expect(result[0].timeCostsCents).toBe(50_000);
      expect(result[0].disbursementsCents).toBe(10_000);
      expect(result[0].netPositionCents).toBe(40_000);
      expect(result[0].percentUsed).toBe(60);
      expect(result[0].status).toBe('healthy');

      // Stage 2: fee 200k, costs 140k, net +60k
      expect(result[1].agreedFeeCents).toBe(200_000);
      expect(result[1].netPositionCents).toBe(60_000);
      expect(result[1].percentUsed).toBe(70);
      expect(result[1].status).toBe('healthy');
    });

    it('returns zero costs for stages with no cost data', () => {
      const feeStructure = makeFeeStructure();
      const stageCosts: StageCostData[] = []; // no costs

      const result = getStageBreakdown(feeStructure, stageCosts);

      for (const stage of result) {
        expect(stage.timeCostsCents).toBe(0);
        expect(stage.disbursementsCents).toBe(0);
        expect(stage.netPositionCents).toBe(stage.agreedFeeCents);
        expect(stage.percentUsed).toBe(0);
        expect(stage.status).toBe('healthy');
      }
    });

    it('flags stage as warning when costs exceed 80% of agreed fee', () => {
      const feeStructure = makeFeeStructure();
      const stageCosts = makeStageCosts({
        stage_1_inception: { time: 85_000, disb: 0 }, // 85% of 100k
      });

      const result = getStageBreakdown(feeStructure, stageCosts);

      expect(result[0].status).toBe('warning');
      expect(result[0].percentUsed).toBe(85);
    });

    it('flags stage as over_run when costs exceed 100% of agreed fee', () => {
      const feeStructure = makeFeeStructure();
      const stageCosts = makeStageCosts({
        stage_2_concept: { time: 180_000, disb: 30_000 }, // 105% of 200k
      });

      const result = getStageBreakdown(feeStructure, stageCosts);

      const stage2 = result.find((s) => s.stage === 'stage_2_concept')!;
      expect(stage2.status).toBe('over_run');
      expect(stage2.percentUsed).toBe(105);
      expect(stage2.netPositionCents).toBe(-10_000);
    });

    it('marks exactly 80% as warning (inclusive threshold)', () => {
      const feeStructure = makeFeeStructure();
      const stageCosts = makeStageCosts({
        stage_1_inception: { time: 80_000, disb: 0 }, // exactly 80%
      });

      const result = getStageBreakdown(feeStructure, stageCosts);

      expect(result[0].status).toBe('warning');
      expect(result[0].percentUsed).toBe(80);
    });

    it('marks exactly 100% as over_run (inclusive threshold)', () => {
      const feeStructure = makeFeeStructure();
      const stageCosts = makeStageCosts({
        stage_1_inception: { time: 90_000, disb: 10_000 }, // exactly 100%
      });

      const result = getStageBreakdown(feeStructure, stageCosts);

      expect(result[0].status).toBe('over_run');
      expect(result[0].percentUsed).toBe(100);
    });

    it('handles zero allocated fee gracefully (no division by zero)', () => {
      const feeStructure = makeFeeStructure({
        stageBreakdown: [
          { stage: 'stage_1_inception', fixedAmountCents: 0, allocatedFeeCents: 0 },
        ],
      });
      const stageCosts = makeStageCosts({
        stage_1_inception: { time: 5_000, disb: 0 },
      });

      const result = getStageBreakdown(feeStructure, stageCosts);

      // When allocated fee is 0, percentUsed should be 0 (no division by zero)
      expect(result[0].percentUsed).toBe(0);
    });
  });

  // ─── checkFeeHealth ────────────────────────────────────────────────────

  describe('checkFeeHealth', () => {
    it('returns healthy metrics when all stages are under 80%', () => {
      const feeStructure = makeFeeStructure();
      const stageCosts = makeStageCosts({
        stage_1_inception: { time: 30_000, disb: 5_000 }, // 35%
        stage_2_concept: { time: 80_000, disb: 10_000 },  // 45%
      });

      const result = checkFeeHealth(feeStructure, stageCosts);

      expect(result.metrics.projectId).toBe(PROJECT_ID);
      expect(result.metrics.totalFeeCents).toBe(1_000_000);
      expect(result.metrics.totalCostsIncurredCents).toBe(125_000);
      expect(result.metrics.netPositionCents).toBe(875_000);
      expect(result.metrics.overRunStages).toHaveLength(0);
      expect(result.metrics.warningStages).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('generates warning when a stage exceeds 80% threshold', () => {
      const feeStructure = makeFeeStructure();
      const stageCosts = makeStageCosts({
        stage_1_inception: { time: 85_000, disb: 5_000 }, // 90% of 100k
      });

      const result = checkFeeHealth(feeStructure, stageCosts);

      expect(result.metrics.warningStages).toContain('stage_1_inception');
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('warning');
      expect(result.warnings[0].stage).toBe('stage_1_inception');
      expect(result.warnings[0].percentUsed).toBe(90);
    });

    it('generates over-run risk entry when a stage exceeds 100% threshold', () => {
      const feeStructure = makeFeeStructure();
      const stageCosts = makeStageCosts({
        stage_2_concept: { time: 200_000, disb: 20_000 }, // 110% of 200k
      });

      const result = checkFeeHealth(feeStructure, stageCosts);

      expect(result.metrics.overRunStages).toContain('stage_2_concept');
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('over_run');
      expect(result.warnings[0].stage).toBe('stage_2_concept');
    });

    it('handles multiple warnings and over-runs simultaneously', () => {
      const feeStructure = makeFeeStructure();
      const stageCosts = makeStageCosts({
        stage_1_inception: { time: 85_000, disb: 0 },     // 85% warning
        stage_2_concept: { time: 210_000, disb: 5_000 },  // 107.5% over-run
        stage_3_design_development: { time: 250_000, disb: 10_000 }, // 86.7% warning
      });

      const result = checkFeeHealth(feeStructure, stageCosts);

      expect(result.metrics.warningStages).toHaveLength(2);
      expect(result.metrics.overRunStages).toHaveLength(1);
      expect(result.warnings).toHaveLength(3);

      const overRun = result.warnings.find((w) => w.type === 'over_run');
      expect(overRun).toBeDefined();
      expect(overRun!.stage).toBe('stage_2_concept');
    });

    it('calculates total costs correctly across all stages', () => {
      const feeStructure = makeFeeStructure();
      const stageCosts = makeStageCosts({
        stage_1_inception: { time: 20_000, disb: 5_000 },
        stage_2_concept: { time: 50_000, disb: 10_000 },
        stage_3_design_development: { time: 100_000, disb: 15_000 },
        stage_4_documentation: { time: 80_000, disb: 5_000 },
      });

      const result = checkFeeHealth(feeStructure, stageCosts);

      // Total: 20k+5k + 50k+10k + 100k+15k + 80k+5k = 285k
      expect(result.metrics.totalCostsIncurredCents).toBe(285_000);
      expect(result.metrics.netPositionCents).toBe(715_000);
    });

    it('writes correct fee health metrics for Project Passport', () => {
      const feeStructure = makeFeeStructure();
      const stageCosts = makeStageCosts({
        stage_1_inception: { time: 110_000, disb: 0 },    // over-run
        stage_3_design_development: { time: 260_000, disb: 0 }, // warning (86.7%)
      });

      const result = checkFeeHealth(feeStructure, stageCosts);

      // Requirement 4.5: metrics for Project Passport
      expect(result.metrics).toHaveProperty('projectId', PROJECT_ID);
      expect(result.metrics).toHaveProperty('totalFeeCents', 1_000_000);
      expect(result.metrics).toHaveProperty('totalCostsIncurredCents');
      expect(result.metrics).toHaveProperty('netPositionCents');
      expect(result.metrics).toHaveProperty('overRunStages');
      expect(result.metrics).toHaveProperty('warningStages');
      expect(result.metrics.overRunStages).toContain('stage_1_inception');
      expect(result.metrics.warningStages).toContain('stage_3_design_development');
    });

    it('returns empty warnings/overruns when no costs provided', () => {
      const feeStructure = makeFeeStructure();
      const stageCosts: StageCostData[] = [];

      const result = checkFeeHealth(feeStructure, stageCosts);

      expect(result.metrics.totalCostsIncurredCents).toBe(0);
      expect(result.metrics.netPositionCents).toBe(1_000_000);
      expect(result.metrics.overRunStages).toHaveLength(0);
      expect(result.metrics.warningStages).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  // ─── Threshold constants ───────────────────────────────────────────────

  describe('threshold constants', () => {
    it('warning threshold is 80%', () => {
      expect(WARNING_THRESHOLD_PERCENT).toBe(80);
    });

    it('overrun threshold is 100%', () => {
      expect(OVERRUN_THRESHOLD_PERCENT).toBe(100);
    });
  });
});
