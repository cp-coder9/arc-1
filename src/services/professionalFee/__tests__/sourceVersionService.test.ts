import { SourceVersionService } from '../persistence/sourceVersionService';
import type { CreateSourceVersionInput } from '../persistence/sourceVersionService';
import { InMemoryFirestoreAdapter } from '../persistence/runPersistenceService';
import type { FeeSourceVersionRecord, FeeSourceVersionPayload } from '../persistence/types';
import type { Profession } from '../types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function createTestPayload(overrides?: Partial<FeeSourceVersionPayload>): FeeSourceVersionPayload {
  return {
    feeTables: [
      {
        complexityLevel: 'medium',
        bands: [
          { minValue: 0, maxValue: 1_000_000, feePercentage: 8.5 },
          { minValue: 1_000_001, maxValue: 5_000_000, feePercentage: 7.0 },
        ],
      },
    ],
    stageWeightings: [
      { id: 'stage1', name: 'Inception', defaultWeight: 0.1, deliverables: ['Brief'] },
      { id: 'stage2', name: 'Concept', defaultWeight: 0.15, deliverables: ['Sketches'] },
    ],
    ...overrides,
  };
}

function createTestInput(overrides?: Partial<CreateSourceVersionInput>): CreateSourceVersionInput {
  return {
    profession: 'architect',
    body: 'SACAP',
    title: 'Board Notice 27 of 2021',
    effectiveDate: '2021-03-01',
    boardNoticeRef: 'BN27/2021',
    payload: createTestPayload(),
    createdBy: 'admin_user_1',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SourceVersionService', () => {
  let db: InMemoryFirestoreAdapter;
  let service: SourceVersionService;

  beforeEach(() => {
    db = new InMemoryFirestoreAdapter();
    service = new SourceVersionService(db);
  });

  describe('createSourceVersion', () => {
    it('creates a valid draft record', async () => {
      const input = createTestInput();

      const record = await service.createSourceVersion(input);

      expect(record.id).toBeTruthy();
      expect(record.id.startsWith('sv_')).toBe(true);
      expect(record.profession).toBe('architect');
      expect(record.body).toBe('SACAP');
      expect(record.title).toBe('Board Notice 27 of 2021');
      expect(record.effectiveDate).toBe('2021-03-01');
      expect(record.boardNoticeRef).toBe('BN27/2021');
      expect(record.status).toBe('draft');
      expect(record.payload).toEqual(input.payload);
      expect(record.contentHash).toBeTruthy();
      expect(record.contentHash.length).toBe(8);
      expect(record.createdBy).toBe('admin_user_1');
      expect(record.createdAt).toBeTruthy();
      expect(record.approvedBy).toBeUndefined();
      expect(record.verifiedAt).toBeUndefined();
      expect(record.retiredAt).toBeUndefined();
    });

    it('persists the record to the store', async () => {
      const record = await service.createSourceVersion(createTestInput());

      const stored = await db.get('fee_source_versions', record.id);
      expect(stored).not.toBeNull();
      expect((stored as Record<string, unknown>).id).toBe(record.id);
    });

    it('generates unique IDs for separate creates', async () => {
      const r1 = await service.createSourceVersion(createTestInput());
      const r2 = await service.createSourceVersion(createTestInput());

      expect(r1.id).not.toBe(r2.id);
    });
  });

  describe('transitionStatus', () => {
    it('transitions draft → verified with approvedBy', async () => {
      const record = await service.createSourceVersion(createTestInput());

      const updated = await service.transitionStatus(record.id, 'verified', 'reviewer_1');

      expect(updated.status).toBe('verified');
      expect(updated.approvedBy).toBe('reviewer_1');
      expect(updated.verifiedAt).toBeTruthy();
    });

    it('transitions verified → retired', async () => {
      const record = await service.createSourceVersion(createTestInput());
      await service.transitionStatus(record.id, 'verified', 'reviewer_1');

      const retired = await service.transitionStatus(record.id, 'retired');

      expect(retired.status).toBe('retired');
      expect(retired.retiredAt).toBeTruthy();
    });

    it('transitions demo-seed → draft', async () => {
      // Manually insert a demo-seed record
      const demoRecord: FeeSourceVersionRecord = {
        id: 'sv_demo_1',
        profession: 'architect',
        body: 'SACAP',
        title: 'Demo SACAP Data',
        effectiveDate: '2021-01-01',
        status: 'demo-seed',
        payload: createTestPayload(),
        contentHash: 'abcdef01',
        createdBy: 'system',
        createdAt: new Date().toISOString(),
      };
      await db.set('fee_source_versions', demoRecord.id, demoRecord as unknown as Record<string, unknown>);

      const updated = await service.transitionStatus('sv_demo_1', 'draft');

      expect(updated.status).toBe('draft');
    });

    it('rejects invalid transitions (retired → verified)', async () => {
      const record = await service.createSourceVersion(createTestInput());
      await service.transitionStatus(record.id, 'verified', 'reviewer_1');
      await service.transitionStatus(record.id, 'retired');

      await expect(
        service.transitionStatus(record.id, 'verified', 'reviewer_2'),
      ).rejects.toThrow('Invalid status transition');
    });

    it('rejects invalid transitions (draft → retired)', async () => {
      const record = await service.createSourceVersion(createTestInput());

      await expect(
        service.transitionStatus(record.id, 'retired'),
      ).rejects.toThrow('Invalid status transition');
    });

    it('rejects verification without approvedBy', async () => {
      const record = await service.createSourceVersion(createTestInput());

      await expect(
        service.transitionStatus(record.id, 'verified'),
      ).rejects.toThrow('Verification requires an approvedBy value');
    });

    it('throws when version not found', async () => {
      await expect(
        service.transitionStatus('nonexistent', 'verified', 'user_1'),
      ).rejects.toThrow('Source version not found');
    });
  });

  describe('getActiveVersion', () => {
    it('returns the most recent verified version', async () => {
      // Create two versions for the same profession
      const v1 = await service.createSourceVersion(
        createTestInput({ title: 'Version 1' }),
      );
      await service.transitionStatus(v1.id, 'verified', 'admin_1');

      // Short delay to ensure different createdAt
      const v2 = await service.createSourceVersion(
        createTestInput({ title: 'Version 2' }),
      );
      await service.transitionStatus(v2.id, 'verified', 'admin_1');

      const active = await service.getActiveVersion('architect');

      expect(active).not.toBeNull();
      expect(active!.id).toBe(v2.id);
      expect(active!.status).toBe('verified');
    });

    it('returns null when no verified version exists', async () => {
      // Create only a draft version
      await service.createSourceVersion(createTestInput());

      const active = await service.getActiveVersion('architect');

      expect(active).toBeNull();
    });

    it('returns null for a profession with no versions', async () => {
      const active = await service.getActiveVersion('civilEngineer');

      expect(active).toBeNull();
    });

    it('does not return retired versions', async () => {
      const record = await service.createSourceVersion(createTestInput());
      await service.transitionStatus(record.id, 'verified', 'admin_1');
      await service.transitionStatus(record.id, 'retired');

      const active = await service.getActiveVersion('architect');

      expect(active).toBeNull();
    });
  });

  describe('importFeeTable', () => {
    it('parses and stores JSON fee table data', async () => {
      const record = await service.createSourceVersion(
        createTestInput({ payload: {} }),
      );

      const feeTableData = JSON.stringify([
        {
          complexityLevel: 'high',
          bands: [
            { minValue: 0, maxValue: 2_000_000, feePercentage: 10.0 },
            { minValue: 2_000_001, maxValue: 10_000_000, feePercentage: 8.5 },
          ],
        },
      ]);

      const updated = await service.importFeeTable(record.id, 'json', feeTableData);

      expect(updated.payload.feeTables).toHaveLength(1);
      expect(updated.payload.feeTables![0].complexityLevel).toBe('high');
      expect(updated.payload.feeTables![0].bands).toHaveLength(2);
      expect(updated.contentHash).not.toBe(record.contentHash);
    });

    it('parses and stores CSV fee table data', async () => {
      const record = await service.createSourceVersion(
        createTestInput({ payload: {} }),
      );

      const csvData = [
        'complexityLevel,minValue,maxValue,feePercentage',
        'low,0,1000000,6.5',
        'low,1000001,5000000,5.0',
        'medium,0,1000000,8.0',
        'medium,1000001,5000000,6.5',
      ].join('\n');

      const updated = await service.importFeeTable(record.id, 'csv', csvData);

      expect(updated.payload.feeTables).toHaveLength(2);
      const lowTable = updated.payload.feeTables!.find(t => t.complexityLevel === 'low');
      const medTable = updated.payload.feeTables!.find(t => t.complexityLevel === 'medium');
      expect(lowTable).toBeDefined();
      expect(lowTable!.bands).toHaveLength(2);
      expect(medTable).toBeDefined();
      expect(medTable!.bands).toHaveLength(2);
    });

    it('throws on invalid JSON data', async () => {
      const record = await service.createSourceVersion(createTestInput());

      await expect(
        service.importFeeTable(record.id, 'json', 'not valid json{{{'),
      ).rejects.toThrow('Invalid JSON data');
    });

    it('throws when version not found', async () => {
      await expect(
        service.importFeeTable('nonexistent', 'json', '[]'),
      ).rejects.toThrow('Source version not found');
    });

    it('updates the contentHash after import', async () => {
      const record = await service.createSourceVersion(createTestInput());
      const originalHash = record.contentHash;

      const updated = await service.importFeeTable(
        record.id,
        'json',
        JSON.stringify([{ complexityLevel: 'low', bands: [{ minValue: 0, maxValue: 500000, feePercentage: 9.0 }] }]),
      );

      expect(updated.contentHash).not.toBe(originalHash);
    });
  });

  describe('verification retires previously active version', () => {
    it('retires the previously verified version when a new one is verified', async () => {
      const v1 = await service.createSourceVersion(
        createTestInput({ title: 'Version 1' }),
      );
      await service.transitionStatus(v1.id, 'verified', 'admin_1');

      // Verify v1 is active
      let active = await service.getActiveVersion('architect');
      expect(active!.id).toBe(v1.id);

      // Create and verify v2
      const v2 = await service.createSourceVersion(
        createTestInput({ title: 'Version 2' }),
      );
      await service.transitionStatus(v2.id, 'verified', 'admin_1');

      // v2 should be active now
      active = await service.getActiveVersion('architect');
      expect(active!.id).toBe(v2.id);

      // v1 should be retired
      const v1Doc = await db.get('fee_source_versions', v1.id) as unknown as FeeSourceVersionRecord;
      expect(v1Doc.status).toBe('retired');
      expect(v1Doc.retiredAt).toBeTruthy();
    });

    it('does not retire versions from other professions', async () => {
      const archVersion = await service.createSourceVersion(
        createTestInput({ profession: 'architect', title: 'Architect V1' }),
      );
      await service.transitionStatus(archVersion.id, 'verified', 'admin_1');

      const engVersion = await service.createSourceVersion(
        createTestInput({ profession: 'civilEngineer', body: 'ECSA', title: 'Engineer V1' }),
      );
      await service.transitionStatus(engVersion.id, 'verified', 'admin_1');

      // Architect version should still be active
      const archActive = await service.getActiveVersion('architect');
      expect(archActive!.id).toBe(archVersion.id);
      expect(archActive!.status).toBe('verified');
    });
  });
});
