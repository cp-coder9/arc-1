/**
 * Unit tests for WriteOffTrackerService
 *
 * Tests write-off recording, cumulative tracking, reversal entries,
 * warning generation, and firm-wide aggregation.
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */
import {
  createWriteOff,
  createReversal,
  getProjectWriteOffs,
  getFirmWriteOffs,
  getWriteOffTotalForProject,
} from '../writeOffTrackerService';
import type {
  WriteOffEntry,
  CreateWriteOffInput,
  ProjectFeeStructure,
} from '../types';

// ─── Test Fixtures ──────────────────────────────────────────────────────

const FIRM_ID = 'firm_001';
const PROJECT_ID = 'proj_001';
const PROJECT_ID_2 = 'proj_002';
const DIRECTOR_USER = 'director_001';

function makeWriteOffEntry(overrides: Partial<WriteOffEntry> = {}): WriteOffEntry {
  return {
    id: 'wo_001',
    firmId: FIRM_ID,
    projectId: PROJECT_ID,
    sacapStage: 'stage_3_design_development',
    amountCents: 500000, // R5,000
    reason: 'scope_creep',
    description: 'Extra design iterations requested by client',
    isReversal: false,
    authorisedBy: DIRECTOR_USER,
    date: '2025-03-15',
    createdAt: '2025-03-15T10:00:00.000Z',
    ...overrides,
  };
}

function makeFeeStructure(overrides: Partial<ProjectFeeStructure> = {}): ProjectFeeStructure {
  return {
    id: 'fee_001',
    firmId: FIRM_ID,
    projectId: PROJECT_ID,
    totalAgreedFeeCents: 10000000, // R100,000
    feeBasis: 'lump_sum',
    stageBreakdown: [
      { stage: 'stage_3_design_development', allocatedFeeCents: 3000000 },
    ],
    createdBy: 'admin_001',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const sampleEntries: WriteOffEntry[] = [
  makeWriteOffEntry({
    id: 'wo_001',
    amountCents: 500000,
    date: '2025-03-15',
    sacapStage: 'stage_3_design_development',
  }),
  makeWriteOffEntry({
    id: 'wo_002',
    amountCents: 300000,
    reason: 'rework',
    date: '2025-04-01',
    sacapStage: 'stage_3_design_development',
  }),
  makeWriteOffEntry({
    id: 'wo_003',
    amountCents: 200000,
    reason: 'goodwill',
    date: '2025-04-10',
    sacapStage: 'stage_4_documentation',
  }),
];

const sampleFeeStructures: ProjectFeeStructure[] = [
  makeFeeStructure(),
];

// ─── createWriteOff ─────────────────────────────────────────────────────

describe('WriteOffTrackerService', () => {
  describe('createWriteOff', () => {
    it('creates a write-off entry with all required fields', () => {
      const input: CreateWriteOffInput = {
        firmId: FIRM_ID,
        projectId: PROJECT_ID,
        sacapStage: 'stage_3_design_development',
        amountCents: 500000,
        reason: 'scope_creep',
        description: 'Extra design iterations',
        authorisedBy: DIRECTOR_USER,
        date: '2025-03-15',
      };

      const result = createWriteOff(input);

      expect(result.firmId).toBe(FIRM_ID);
      expect(result.projectId).toBe(PROJECT_ID);
      expect(result.sacapStage).toBe('stage_3_design_development');
      expect(result.amountCents).toBe(500000);
      expect(result.reason).toBe('scope_creep');
      expect(result.description).toBe('Extra design iterations');
      expect(result.authorisedBy).toBe(DIRECTOR_USER);
      expect(result.date).toBe('2025-03-15');
      expect(result.isReversal).toBe(false);
      expect(result.reversalOfId).toBeUndefined();
      expect(result.id).toBeTruthy();
      expect(result.createdAt).toBeTruthy();
    });

    it('supports all write-off reasons', () => {
      const reasons = ['scope_creep', 'rework', 'goodwill', 'fee_negotiation', 'other'] as const;

      for (const reason of reasons) {
        const input: CreateWriteOffInput = {
          firmId: FIRM_ID,
          projectId: PROJECT_ID,
          amountCents: 100000,
          reason,
          authorisedBy: DIRECTOR_USER,
          date: '2025-03-15',
        };
        const result = createWriteOff(input);
        expect(result.reason).toBe(reason);
      }
    });

    it('allows write-off without sacapStage', () => {
      const input: CreateWriteOffInput = {
        firmId: FIRM_ID,
        projectId: PROJECT_ID,
        amountCents: 100000,
        reason: 'goodwill',
        authorisedBy: DIRECTOR_USER,
        date: '2025-03-15',
      };

      const result = createWriteOff(input);
      expect(result.sacapStage).toBeUndefined();
    });

    it('allows write-off without description', () => {
      const input: CreateWriteOffInput = {
        firmId: FIRM_ID,
        projectId: PROJECT_ID,
        amountCents: 100000,
        reason: 'rework',
        authorisedBy: DIRECTOR_USER,
        date: '2025-03-15',
      };

      const result = createWriteOff(input);
      expect(result.description).toBeUndefined();
    });
  });

  // ─── createReversal ───────────────────────────────────────────────────────

  describe('createReversal', () => {
    it('creates a reversal entry referencing the original write-off', () => {
      const result = createReversal(
        sampleEntries,
        'wo_001',
        'Client agreed to pay for extra work',
        DIRECTOR_USER,
      );

      expect(result).not.toBeNull();
      expect(result!.isReversal).toBe(true);
      expect(result!.reversalOfId).toBe('wo_001');
      expect(result!.amountCents).toBe(500000); // same as original
      expect(result!.firmId).toBe(FIRM_ID);
      expect(result!.projectId).toBe(PROJECT_ID);
      expect(result!.sacapStage).toBe('stage_3_design_development');
      expect(result!.description).toBe('Client agreed to pay for extra work');
      expect(result!.authorisedBy).toBe(DIRECTOR_USER);
    });

    it('returns null if the original write-off is not found', () => {
      const result = createReversal(
        sampleEntries,
        'nonexistent_id',
        'Some reason',
        DIRECTOR_USER,
      );

      expect(result).toBeNull();
    });

    it('returns null when trying to reverse a reversal entry', () => {
      const entriesWithReversal: WriteOffEntry[] = [
        ...sampleEntries,
        makeWriteOffEntry({
          id: 'wo_rev_001',
          isReversal: true,
          reversalOfId: 'wo_001',
        }),
      ];

      const result = createReversal(
        entriesWithReversal,
        'wo_rev_001',
        'Cannot reverse a reversal',
        DIRECTOR_USER,
      );

      expect(result).toBeNull();
    });
  });

  // ─── getProjectWriteOffs ──────────────────────────────────────────────────

  describe('getProjectWriteOffs', () => {
    it('calculates cumulative write-off total correctly', () => {
      const result = getProjectWriteOffs(sampleEntries, sampleFeeStructures, PROJECT_ID);

      // 500000 + 300000 + 200000 = 1000000
      expect(result.cumulativeWriteOffCents).toBe(1000000);
    });

    it('subtracts reversal amounts from cumulative total', () => {
      const entriesWithReversal: WriteOffEntry[] = [
        ...sampleEntries,
        makeWriteOffEntry({
          id: 'wo_rev_001',
          isReversal: true,
          reversalOfId: 'wo_001',
          amountCents: 500000,
          date: '2025-05-01',
        }),
      ];

      const result = getProjectWriteOffs(entriesWithReversal, sampleFeeStructures, PROJECT_ID);

      // 500000 + 300000 + 200000 - 500000 = 500000
      expect(result.cumulativeWriteOffCents).toBe(500000);
    });

    it('cumulative total cannot go negative', () => {
      const entries: WriteOffEntry[] = [
        makeWriteOffEntry({
          id: 'wo_small',
          amountCents: 100000,
          date: '2025-03-01',
        }),
        makeWriteOffEntry({
          id: 'wo_big_reversal',
          isReversal: true,
          reversalOfId: 'wo_small',
          amountCents: 200000,
          date: '2025-03-02',
        }),
      ];

      const result = getProjectWriteOffs(entries, sampleFeeStructures, PROJECT_ID);

      expect(result.cumulativeWriteOffCents).toBe(0);
    });

    it('displays write-off percentage of agreed fee', () => {
      const result = getProjectWriteOffs(sampleEntries, sampleFeeStructures, PROJECT_ID);

      // 1000000 / 10000000 * 100 = 10%
      expect(result.writeOffPercentage).toBe(10);
    });

    it('returns 0% when no fee structure exists for project', () => {
      const result = getProjectWriteOffs(sampleEntries, [], PROJECT_ID);

      expect(result.writeOffPercentage).toBe(0);
      expect(result.agreedFeeCents).toBe(0);
    });

    it('calculates per-stage breakdown', () => {
      const result = getProjectWriteOffs(sampleEntries, sampleFeeStructures, PROJECT_ID);

      // stage_3_design_development: 500000 + 300000 = 800000
      expect(result.byStage['stage_3_design_development']).toBe(800000);
      // stage_4_documentation: 200000
      expect(result.byStage['stage_4_documentation']).toBe(200000);
    });

    it('generates warning when write-offs exceed 10% threshold', () => {
      // 1000000 / 10000000 = 10%, which is the boundary.
      // Need to exceed 10%, so use a fee of R9,000,000 or add more write-offs
      const smallFeeFeeStructures: ProjectFeeStructure[] = [
        makeFeeStructure({ totalAgreedFeeCents: 5000000 }), // R50,000
      ];

      const result = getProjectWriteOffs(sampleEntries, smallFeeFeeStructures, PROJECT_ID);

      // 1000000 / 5000000 * 100 = 20% — exceeds 10% threshold
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].writeOffPercentage).toBe(20);
      expect(result.warnings[0].thresholdPercent).toBe(10);
    });

    it('does not generate warning when write-offs are at or below 10%', () => {
      const result = getProjectWriteOffs(sampleEntries, sampleFeeStructures, PROJECT_ID);

      // 1000000 / 10000000 = 10% — exactly at threshold, not exceeding
      expect(result.warnings).toHaveLength(0);
    });

    it('returns entries sorted by date ascending', () => {
      const result = getProjectWriteOffs(sampleEntries, sampleFeeStructures, PROJECT_ID);

      expect(result.entries[0].date).toBe('2025-03-15');
      expect(result.entries[1].date).toBe('2025-04-01');
      expect(result.entries[2].date).toBe('2025-04-10');
    });

    it('only includes entries for the specified project', () => {
      const mixedEntries: WriteOffEntry[] = [
        ...sampleEntries,
        makeWriteOffEntry({
          id: 'wo_other_proj',
          projectId: PROJECT_ID_2,
          amountCents: 900000,
        }),
      ];

      const result = getProjectWriteOffs(mixedEntries, sampleFeeStructures, PROJECT_ID);

      expect(result.entries).toHaveLength(3);
      expect(result.cumulativeWriteOffCents).toBe(1000000);
    });
  });

  // ─── getFirmWriteOffs ─────────────────────────────────────────────────────

  describe('getFirmWriteOffs', () => {
    const multiProjectEntries: WriteOffEntry[] = [
      ...sampleEntries,
      makeWriteOffEntry({
        id: 'wo_p2_001',
        projectId: PROJECT_ID_2,
        amountCents: 400000,
        date: '2025-05-01',
      }),
    ];

    const multiProjectFeeStructures: ProjectFeeStructure[] = [
      makeFeeStructure(),
      makeFeeStructure({
        id: 'fee_002',
        projectId: PROJECT_ID_2,
        totalAgreedFeeCents: 8000000, // R80,000
      }),
    ];

    it('aggregates write-offs across all firm projects', () => {
      const result = getFirmWriteOffs(multiProjectEntries, multiProjectFeeStructures, FIRM_ID);

      expect(result.firmId).toBe(FIRM_ID);
      // proj_001: 1000000, proj_002: 400000
      expect(result.totalWriteOffCents).toBe(1400000);
    });

    it('calculates firm-wide write-off percentage', () => {
      const result = getFirmWriteOffs(multiProjectEntries, multiProjectFeeStructures, FIRM_ID);

      // totalWriteOff: 1400000, totalFee: 10000000 + 8000000 = 18000000
      const expectedPercent = (1400000 / 18000000) * 100;
      expect(result.firmWriteOffPercentage).toBeCloseTo(expectedPercent, 2);
    });

    it('includes per-project summaries', () => {
      const result = getFirmWriteOffs(multiProjectEntries, multiProjectFeeStructures, FIRM_ID);

      expect(result.projects).toHaveLength(2);
      const proj1 = result.projects.find((p) => p.projectId === PROJECT_ID);
      const proj2 = result.projects.find((p) => p.projectId === PROJECT_ID_2);

      expect(proj1).toBeDefined();
      expect(proj1!.cumulativeWriteOffCents).toBe(1000000);

      expect(proj2).toBeDefined();
      expect(proj2!.cumulativeWriteOffCents).toBe(400000);
    });

    it('scopes results by firmId', () => {
      const entriesMultiFirm: WriteOffEntry[] = [
        ...multiProjectEntries,
        makeWriteOffEntry({
          id: 'wo_other_firm',
          firmId: 'firm_other',
          projectId: 'proj_other',
          amountCents: 999999,
        }),
      ];

      const result = getFirmWriteOffs(entriesMultiFirm, multiProjectFeeStructures, FIRM_ID);

      expect(result.totalWriteOffCents).toBe(1400000);
      expect(result.projects).toHaveLength(2);
    });

    it('returns zero totals when no entries exist for firm', () => {
      const result = getFirmWriteOffs([], [], FIRM_ID);

      expect(result.totalWriteOffCents).toBe(0);
      expect(result.totalAgreedFeeCents).toBe(0);
      expect(result.firmWriteOffPercentage).toBe(0);
      expect(result.projects).toHaveLength(0);
    });

    it('includes calculatedAt timestamp', () => {
      const result = getFirmWriteOffs(multiProjectEntries, multiProjectFeeStructures, FIRM_ID);

      expect(result.calculatedAt).toBeTruthy();
    });
  });

  // ─── getWriteOffTotalForProject ───────────────────────────────────────────

  describe('getWriteOffTotalForProject', () => {
    it('returns cumulative write-off total for a project', () => {
      const total = getWriteOffTotalForProject(sampleEntries, PROJECT_ID);

      expect(total).toBe(1000000);
    });

    it('accounts for reversals', () => {
      const entriesWithReversal: WriteOffEntry[] = [
        ...sampleEntries,
        makeWriteOffEntry({
          id: 'wo_rev_001',
          isReversal: true,
          reversalOfId: 'wo_002',
          amountCents: 300000,
          date: '2025-05-01',
        }),
      ];

      const total = getWriteOffTotalForProject(entriesWithReversal, PROJECT_ID);

      expect(total).toBe(700000);
    });

    it('returns 0 when no entries exist for project', () => {
      const total = getWriteOffTotalForProject(sampleEntries, 'nonexistent_proj');

      expect(total).toBe(0);
    });
  });
});
