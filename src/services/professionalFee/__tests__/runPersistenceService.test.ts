import {
  RunPersistenceService,
  InMemoryFirestoreAdapter,
} from '../persistence/runPersistenceService';
import type { FeeInput, FeeCalculationResult, Profession } from '../types';
import type { FeeProposalRun } from '../persistence/types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function createTestInput(overrides?: Partial<FeeInput>): FeeInput {
  return {
    profession: 'architect',
    projectValue: 5_000_000,
    complexityId: 'medium',
    workCategorySplits: { design: 0.6, documentation: 0.4 },
    selectedStages: {
      stage1: { applicable: true, reductionPercentage: 0 },
      stage2: { applicable: true, reductionPercentage: 10 },
    },
    vatApplicable: true,
    ...overrides,
  };
}

function createTestResult(overrides?: Partial<FeeCalculationResult>): FeeCalculationResult {
  return {
    profession: 'architect',
    sourceVersionId: 'sv_test_1',
    formulaType: 'slidingScale',
    guidelineProfessionalFee: 350000,
    stageAdjustedFee: 315000,
    professionalFeeBeforeDiscount: 315000,
    discountAmount: 0,
    professionalFeeAfterDiscount: 315000,
    disbursementsTotal: 15000,
    statutoryFeesTotal: 5000,
    vatAmount: 50250,
    totalInclVat: 385250,
    lines: [
      { label: 'Professional Fee', amount: 315000, taxable: true, discountable: true },
      { label: 'Disbursements', amount: 15000, taxable: true, discountable: false },
    ],
    warnings: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RunPersistenceService', () => {
  let db: InMemoryFirestoreAdapter;
  let service: RunPersistenceService;

  beforeEach(() => {
    db = new InMemoryFirestoreAdapter();
    service = new RunPersistenceService(db);
  });

  describe('saveRun', () => {
    it('creates a valid FeeProposalRun with correct fields', async () => {
      const input = createTestInput();
      const result = createTestResult();
      const userId = 'user_123';
      const profession: Profession = 'architect';
      const sourceVersionId = 'sv_sacap_2021';

      const run = await service.saveRun(input, result, userId, profession, sourceVersionId);

      expect(run.runId).toBeTruthy();
      expect(run.runId.startsWith('run_')).toBe(true);
      expect(run.userId).toBe(userId);
      expect(run.profession).toBe(profession);
      expect(run.input).toEqual(input);
      expect(run.result).toEqual(result);
      expect(run.sourceVersionId).toBe(sourceVersionId);
      expect(run.sourceVersionHash).toBeTruthy();
      expect(run.sourceVersionHash.length).toBe(8); // FNV-1a hex
      expect(run.version).toBe(1);
      expect(run.previousRunId).toBeUndefined();
      expect(run.createdAt).toBeTruthy();
      expect(run.updatedAt).toBeTruthy();
      expect(run.projectId).toBeUndefined();
    });

    it('persists the run to the store', async () => {
      const run = await service.saveRun(
        createTestInput(),
        createTestResult(),
        'user_1',
        'architect',
        'sv_1',
      );

      const stored = await db.get('fee_proposal_runs', run.runId);
      expect(stored).not.toBeNull();
      expect((stored as Record<string, unknown>).runId).toBe(run.runId);
    });

    it('generates unique runIds for separate saves', async () => {
      const run1 = await service.saveRun(createTestInput(), createTestResult(), 'u1', 'architect', 'sv1');
      const run2 = await service.saveRun(createTestInput(), createTestResult(), 'u1', 'architect', 'sv1');

      expect(run1.runId).not.toBe(run2.runId);
    });

    it('computes a consistent sourceVersionHash for same sourceVersionId', async () => {
      const run1 = await service.saveRun(createTestInput(), createTestResult(), 'u1', 'architect', 'sv_x');
      const run2 = await service.saveRun(createTestInput(), createTestResult(), 'u2', 'architect', 'sv_x');

      expect(run1.sourceVersionHash).toBe(run2.sourceVersionHash);
    });
  });

  describe('reopenRun', () => {
    it('creates a new run with incremented version and previousRunId', async () => {
      const original = await service.saveRun(
        createTestInput(),
        createTestResult(),
        'user_1',
        'architect',
        'sv_1',
      );

      const reopened = await service.reopenRun(original.runId);

      expect(reopened.runId).not.toBe(original.runId);
      expect(reopened.version).toBe(original.version + 1);
      expect(reopened.previousRunId).toBe(original.runId);
      expect(reopened.input).toEqual(original.input);
      expect(reopened.result).toEqual(original.result);
      expect(reopened.userId).toBe(original.userId);
      expect(reopened.profession).toBe(original.profession);
      expect(reopened.sourceVersionId).toBe(original.sourceVersionId);
    });

    it('does not mutate the original run', async () => {
      const original = await service.saveRun(
        createTestInput(),
        createTestResult(),
        'user_1',
        'architect',
        'sv_1',
      );

      const originalSnapshot = { ...original };
      await service.reopenRun(original.runId);

      // Re-read the original from the store
      const storedOriginal = await db.get('fee_proposal_runs', original.runId) as unknown as FeeProposalRun;
      expect(storedOriginal.version).toBe(originalSnapshot.version);
      expect(storedOriginal.runId).toBe(originalSnapshot.runId);
      expect(storedOriginal.previousRunId).toBeUndefined();
      expect(storedOriginal.createdAt).toBe(originalSnapshot.createdAt);
    });

    it('can be chained (reopen a reopened run)', async () => {
      const v1 = await service.saveRun(createTestInput(), createTestResult(), 'u1', 'architect', 'sv1');
      const v2 = await service.reopenRun(v1.runId);
      const v3 = await service.reopenRun(v2.runId);

      expect(v3.version).toBe(3);
      expect(v3.previousRunId).toBe(v2.runId);
      expect(v2.previousRunId).toBe(v1.runId);
    });

    it('throws when run not found', async () => {
      await expect(service.reopenRun('nonexistent')).rejects.toThrow('Run not found');
    });
  });

  describe('listRuns', () => {
    it('filters correctly by userId', async () => {
      await service.saveRun(createTestInput(), createTestResult(), 'alice', 'architect', 'sv1');
      await service.saveRun(createTestInput(), createTestResult(), 'bob', 'architect', 'sv1');
      await service.saveRun(createTestInput(), createTestResult(), 'alice', 'architect', 'sv1');

      const aliceRuns = await service.listRuns('alice');
      expect(aliceRuns).toHaveLength(2);
      expect(aliceRuns.every(r => (r as FeeProposalRun).userId === 'alice')).toBe(true);
    });

    it('filters correctly by userId and profession', async () => {
      await service.saveRun(createTestInput(), createTestResult(), 'alice', 'architect', 'sv1');
      await service.saveRun(
        createTestInput({ profession: 'civilEngineer' }),
        createTestResult({ profession: 'civilEngineer' }),
        'alice',
        'civilEngineer',
        'sv2',
      );

      const architectRuns = await service.listRuns('alice', 'architect');
      expect(architectRuns).toHaveLength(1);
      expect((architectRuns[0] as unknown as FeeProposalRun).profession).toBe('architect');

      const engineerRuns = await service.listRuns('alice', 'civilEngineer');
      expect(engineerRuns).toHaveLength(1);
      expect((engineerRuns[0] as unknown as FeeProposalRun).profession).toBe('civilEngineer');
    });

    it('filters by projectId when provided', async () => {
      const run1 = await service.saveRun(createTestInput(), createTestResult(), 'alice', 'architect', 'sv1');
      await service.saveRun(createTestInput(), createTestResult(), 'alice', 'architect', 'sv1');

      await service.assignToProject(run1.runId, 'project_abc');

      const projectRuns = await service.listRuns('alice', undefined, 'project_abc');
      expect(projectRuns).toHaveLength(1);
      expect((projectRuns[0] as unknown as FeeProposalRun).projectId).toBe('project_abc');
    });

    it('returns empty array when no runs match', async () => {
      const runs = await service.listRuns('nonexistent');
      expect(runs).toEqual([]);
    });
  });

  describe('assignToProject', () => {
    it('updates the projectId on the run', async () => {
      const run = await service.saveRun(createTestInput(), createTestResult(), 'user_1', 'architect', 'sv1');

      const updated = await service.assignToProject(run.runId, 'project_xyz');

      expect(updated.projectId).toBe('project_xyz');
      expect(updated.projectRecordId).toBeTruthy();
    });

    it('persists the projectId to the store', async () => {
      const run = await service.saveRun(createTestInput(), createTestResult(), 'user_1', 'architect', 'sv1');
      await service.assignToProject(run.runId, 'project_xyz');

      const stored = await db.get('fee_proposal_runs', run.runId) as Record<string, unknown>;
      expect(stored.projectId).toBe('project_xyz');
      expect(stored.projectRecordId).toBeTruthy();
    });

    it('throws when run not found', async () => {
      await expect(service.assignToProject('nonexistent', 'proj_1')).rejects.toThrow('Run not found');
    });
  });

  describe('exportRun', () => {
    it('returns data in JSON format', async () => {
      const run = await service.saveRun(createTestInput(), createTestResult(), 'user_1', 'architect', 'sv1');

      const exported = await service.exportRun(run.runId, 'json');

      expect(exported.format).toBe('json');
      const parsed = JSON.parse(exported.content);
      expect(parsed.runId).toBe(run.runId);
      expect(parsed.profession).toBe('architect');
      expect(parsed.result.totalInclVat).toBe(385250);
    });

    it('returns data in CSV format', async () => {
      const run = await service.saveRun(createTestInput(), createTestResult(), 'user_1', 'architect', 'sv1');

      const exported = await service.exportRun(run.runId, 'csv');

      expect(exported.format).toBe('csv');
      expect(exported.content).toContain('Field,Value');
      expect(exported.content).toContain(`Run ID,${run.runId}`);
      expect(exported.content).toContain('Profession,architect');
      expect(exported.content).toContain('Total Incl VAT,385250');
      expect(exported.content).toContain('Fee Lines');
      expect(exported.content).toContain('"Professional Fee"');
    });

    it('returns data in PDF format', async () => {
      const run = await service.saveRun(createTestInput(), createTestResult(), 'user_1', 'architect', 'sv1');

      const exported = await service.exportRun(run.runId, 'pdf');

      expect(exported.format).toBe('pdf');
      expect(exported.content).toContain('FEE PROPOSAL RUN EXPORT');
      expect(exported.content).toContain(run.runId);
      expect(exported.content).toContain('architect');
      expect(exported.content).toContain('RESULTS');
    });

    it('records exportedAt and exportFormat on the run', async () => {
      const run = await service.saveRun(createTestInput(), createTestResult(), 'user_1', 'architect', 'sv1');
      await service.exportRun(run.runId, 'csv');

      const stored = await db.get('fee_proposal_runs', run.runId) as Record<string, unknown>;
      expect(stored.exportedAt).toBeTruthy();
      expect(stored.exportFormat).toBe('csv');
    });

    it('throws when run not found', async () => {
      await expect(service.exportRun('nonexistent', 'json')).rejects.toThrow('Run not found');
    });
  });
});
