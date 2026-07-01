import { TermsPersistenceService } from '../persistence/termsPersistenceService';
import { InMemoryFirestoreAdapter } from '../persistence/runPersistenceService';
import type { FeeTermsTemplateRecord, TermsClause } from '../persistence/types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function createTestClauses(): TermsClause[] {
  return [
    { id: 'clause_1', text: 'Services limited to agreed scope.', editable: true },
    { id: 'clause_2', text: 'Client responsible for accurate instructions.', editable: true },
    { id: 'clause_3', text: 'Fees exclude statutory charges.', editable: false },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TermsPersistenceService', () => {
  let db: InMemoryFirestoreAdapter;
  let service: TermsPersistenceService;

  beforeEach(() => {
    db = new InMemoryFirestoreAdapter();
    service = new TermsPersistenceService(db);
  });

  describe('createTemplate', () => {
    it('creates a valid record with version 1', async () => {
      const template = await service.createTemplate(
        'Standard SA Terms',
        ['architect', 'engineer'],
        createTestClauses(),
        'admin_user',
      );

      expect(template.id).toBeTruthy();
      expect(template.id.startsWith('tmpl_')).toBe(true);
      expect(template.name).toBe('Standard SA Terms');
      expect(template.professionTags).toEqual(['architect', 'engineer']);
      expect(template.version).toBe(1);
      expect(template.clauses).toHaveLength(3);
      expect(template.legalReviewFlag).toBe(false);
      expect(template.createdBy).toBe('admin_user');
      expect(template.createdAt).toBeTruthy();
      expect(template.updatedAt).toBeTruthy();
      expect(template.previousVersionId).toBeUndefined();
    });

    it('persists the template to the store', async () => {
      const template = await service.createTemplate(
        'Test Template',
        ['architect'],
        createTestClauses(),
        'user_1',
      );

      const stored = await db.get('fee_terms_templates', template.id);
      expect(stored).not.toBeNull();
      expect((stored as Record<string, unknown>).id).toBe(template.id);
      expect((stored as Record<string, unknown>).version).toBe(1);
    });
  });

  describe('getTemplates', () => {
    it('returns templates matching profession tags', async () => {
      await service.createTemplate('Arch Terms', ['architect'], createTestClauses(), 'u1');
      await service.createTemplate('Eng Terms', ['engineer'], createTestClauses(), 'u1');
      await service.createTemplate('QS Terms', ['quantitySurveyor'], createTestClauses(), 'u1');

      const results = await service.getTemplates(['architect']);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Arch Terms');
    });

    it('returns templates matching any of multiple query tags', async () => {
      await service.createTemplate('Arch Terms', ['architect'], createTestClauses(), 'u1');
      await service.createTemplate('Eng Terms', ['engineer'], createTestClauses(), 'u1');
      await service.createTemplate('QS Terms', ['quantitySurveyor'], createTestClauses(), 'u1');

      const results = await service.getTemplates(['architect', 'engineer']);

      expect(results).toHaveLength(2);
      const names = results.map((t) => t.name);
      expect(names).toContain('Arch Terms');
      expect(names).toContain('Eng Terms');
    });

    it('returns templates where any profession tag matches', async () => {
      await service.createTemplate('Multi-Profession', ['architect', 'engineer', 'quantitySurveyor'], createTestClauses(), 'u1');

      const results = await service.getTemplates(['engineer']);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Multi-Profession');
    });

    it('returns empty array when no match', async () => {
      await service.createTemplate('Arch Terms', ['architect'], createTestClauses(), 'u1');
      await service.createTemplate('Eng Terms', ['engineer'], createTestClauses(), 'u1');

      const results = await service.getTemplates(['townPlanner']);

      expect(results).toHaveLength(0);
    });

    it('returns all templates when no filter is provided', async () => {
      await service.createTemplate('Template A', ['architect'], createTestClauses(), 'u1');
      await service.createTemplate('Template B', ['engineer'], createTestClauses(), 'u1');
      await service.createTemplate('Template C', ['quantitySurveyor'], createTestClauses(), 'u1');

      const results = await service.getTemplates();

      expect(results).toHaveLength(3);
    });
  });

  describe('editClause', () => {
    it('creates a new version with version + 1', async () => {
      const original = await service.createTemplate(
        'Standard Terms',
        ['architect'],
        createTestClauses(),
        'user_1',
      );

      const newVersion = await service.editClause(original.id, 'clause_1', 'Updated clause text.');

      expect(newVersion.version).toBe(original.version + 1);
      expect(newVersion.version).toBe(2);
      expect(newVersion.id).not.toBe(original.id);
    });

    it('preserves previousVersionId pointing to old record', async () => {
      const original = await service.createTemplate(
        'Standard Terms',
        ['architect'],
        createTestClauses(),
        'user_1',
      );

      const newVersion = await service.editClause(original.id, 'clause_1', 'Edited text.');

      expect(newVersion.previousVersionId).toBe(original.id);
    });

    it('does not mutate the original record', async () => {
      const original = await service.createTemplate(
        'Standard Terms',
        ['architect'],
        createTestClauses(),
        'user_1',
      );

      const originalSnapshot: FeeTermsTemplateRecord = {
        ...original,
        clauses: original.clauses.map((c) => ({ ...c })),
        professionTags: [...original.professionTags],
      };

      await service.editClause(original.id, 'clause_1', 'Completely different text.');

      // Re-read original from the store
      const storedOriginal = await service.getTemplate(original.id);
      expect(storedOriginal).not.toBeNull();
      expect(storedOriginal!.version).toBe(originalSnapshot.version);
      expect(storedOriginal!.id).toBe(originalSnapshot.id);
      expect(storedOriginal!.clauses[0].text).toBe(originalSnapshot.clauses[0].text);
      expect(storedOriginal!.previousVersionId).toBeUndefined();
    });

    it('updates the clause text in the new version', async () => {
      const original = await service.createTemplate(
        'Standard Terms',
        ['architect'],
        createTestClauses(),
        'user_1',
      );

      const newVersion = await service.editClause(original.id, 'clause_2', 'New clause 2 text.');

      const editedClause = newVersion.clauses.find((c) => c.id === 'clause_2');
      expect(editedClause).toBeDefined();
      expect(editedClause!.text).toBe('New clause 2 text.');
      expect(editedClause!.editedAt).toBeTruthy();
    });

    it('resets legalReviewFlag on new version', async () => {
      const original = await service.createTemplate(
        'Standard Terms',
        ['architect'],
        createTestClauses(),
        'user_1',
      );

      // Mark as legally reviewed first
      await service.setLegalReviewFlag(original.id, 'lawyer_1');

      // Edit should reset the flag
      const newVersion = await service.editClause(original.id, 'clause_1', 'Modified clause.');

      expect(newVersion.legalReviewFlag).toBe(false);
      expect(newVersion.legalReviewedAt).toBeUndefined();
      expect(newVersion.legalReviewedBy).toBeUndefined();
    });

    it('throws when template not found', async () => {
      await expect(
        service.editClause('nonexistent', 'clause_1', 'Text'),
      ).rejects.toThrow('Template not found');
    });

    it('throws when clause not found', async () => {
      const template = await service.createTemplate(
        'Standard Terms',
        ['architect'],
        createTestClauses(),
        'user_1',
      );

      await expect(
        service.editClause(template.id, 'nonexistent_clause', 'Text'),
      ).rejects.toThrow('Clause not found');
    });
  });

  describe('setLegalReviewFlag', () => {
    it('updates the template correctly', async () => {
      const template = await service.createTemplate(
        'Standard Terms',
        ['architect'],
        createTestClauses(),
        'user_1',
      );

      const updated = await service.setLegalReviewFlag(template.id, 'legal_counsel_1');

      expect(updated.legalReviewFlag).toBe(true);
      expect(updated.legalReviewedBy).toBe('legal_counsel_1');
      expect(updated.legalReviewedAt).toBeTruthy();
    });

    it('persists the legal review flag to the store', async () => {
      const template = await service.createTemplate(
        'Standard Terms',
        ['architect'],
        createTestClauses(),
        'user_1',
      );

      await service.setLegalReviewFlag(template.id, 'lawyer_1');

      const stored = await db.get('fee_terms_templates', template.id) as Record<string, unknown>;
      expect(stored.legalReviewFlag).toBe(true);
      expect(stored.legalReviewedBy).toBe('lawyer_1');
      expect(stored.legalReviewedAt).toBeTruthy();
    });

    it('throws when template not found', async () => {
      await expect(
        service.setLegalReviewFlag('nonexistent', 'lawyer_1'),
      ).rejects.toThrow('Template not found');
    });
  });

  describe('version chain (multiple edits)', () => {
    it('creates proper version chain across multiple edits', async () => {
      const v1 = await service.createTemplate(
        'Standard Terms',
        ['architect'],
        createTestClauses(),
        'user_1',
      );

      const v2 = await service.editClause(v1.id, 'clause_1', 'Version 2 text.');
      const v3 = await service.editClause(v2.id, 'clause_2', 'Version 3 text.');
      const v4 = await service.editClause(v3.id, 'clause_1', 'Version 4 text.');

      // Version numbers increment
      expect(v1.version).toBe(1);
      expect(v2.version).toBe(2);
      expect(v3.version).toBe(3);
      expect(v4.version).toBe(4);

      // Chain links are correct
      expect(v1.previousVersionId).toBeUndefined();
      expect(v2.previousVersionId).toBe(v1.id);
      expect(v3.previousVersionId).toBe(v2.id);
      expect(v4.previousVersionId).toBe(v3.id);

      // All versions remain retrievable
      const storedV1 = await service.getTemplate(v1.id);
      const storedV2 = await service.getTemplate(v2.id);
      const storedV3 = await service.getTemplate(v3.id);
      const storedV4 = await service.getTemplate(v4.id);

      expect(storedV1).not.toBeNull();
      expect(storedV2).not.toBeNull();
      expect(storedV3).not.toBeNull();
      expect(storedV4).not.toBeNull();

      // Original is unchanged
      expect(storedV1!.version).toBe(1);
      expect(storedV1!.clauses[0].text).toBe('Services limited to agreed scope.');

      // Each version has its specific edit
      expect(storedV2!.clauses[0].text).toBe('Version 2 text.');
      expect(storedV3!.clauses[1].text).toBe('Version 3 text.');
      expect(storedV4!.clauses[0].text).toBe('Version 4 text.');
    });
  });
});
