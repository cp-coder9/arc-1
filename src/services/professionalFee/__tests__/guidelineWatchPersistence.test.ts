import { GuidelineWatchPersistence } from '../persistence/guidelineWatchPersistence';
import type { PersistedCandidate } from '../persistence/guidelineWatchPersistence';
import { SourceVersionService } from '../persistence/sourceVersionService';
import { InMemoryFirestoreAdapter } from '../persistence/runPersistenceService';
import type { FeeGuideWatchSource, FeeGuideChangeCandidate } from '../guidelineUpdateService';
import type { Profession } from '../types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function createWatchSources(): FeeGuideWatchSource[] {
  return [
    {
      id: 'sacap-fees',
      profession: 'architect' as Profession,
      body: 'SACAP',
      officialUrl: 'https://www.sacapsa.com/',
      keywords: ['fee', 'guideline', 'board notice'],
      lastKnownHash: 'source-fnv1a32:aabbccdd',
      lastCheckedAt: '2025-01-15T10:00:00.000Z',
      status: 'active',
    },
    {
      id: 'ecsa-fees',
      profession: 'civilEngineer' as Profession,
      body: 'ECSA',
      officialUrl: 'https://www.ecsa.co.za/',
      keywords: ['guideline', 'fees', 'professional services'],
      status: 'active',
    },
  ];
}

function createCandidate(overrides?: Partial<FeeGuideChangeCandidate>): FeeGuideChangeCandidate {
  return {
    sourceId: 'sacap-fees',
    profession: 'architect' as Profession,
    body: 'SACAP',
    officialUrl: 'https://www.sacapsa.com/',
    previousHash: 'source-fnv1a32:aabbccdd',
    newHash: 'source-fnv1a32:11223344',
    matchedKeywords: ['fee', 'guideline'],
    reviewStatus: 'pending-human-review',
    message: 'SACAP possible fee-guide/source update detected. Human review required before calculator activation.',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GuidelineWatchPersistence', () => {
  let db: InMemoryFirestoreAdapter;
  let sourceVersionService: SourceVersionService;
  let persistence: GuidelineWatchPersistence;

  beforeEach(() => {
    db = new InMemoryFirestoreAdapter();
    sourceVersionService = new SourceVersionService(db);
    persistence = new GuidelineWatchPersistence(db, sourceVersionService);
  });

  describe('persistWatchRegistry', () => {
    it('stores all watch sources to Firestore', async () => {
      const sources = createWatchSources();

      await persistence.persistWatchRegistry(sources);

      const stored1 = await db.get('fee_guideline_watch', 'sacap-fees');
      const stored2 = await db.get('fee_guideline_watch', 'ecsa-fees');

      expect(stored1).not.toBeNull();
      expect((stored1 as Record<string, unknown>).body).toBe('SACAP');
      expect((stored1 as Record<string, unknown>).profession).toBe('architect');

      expect(stored2).not.toBeNull();
      expect((stored2 as Record<string, unknown>).body).toBe('ECSA');
      expect((stored2 as Record<string, unknown>).profession).toBe('civilEngineer');
    });

    it('overwrites existing sources with the same id', async () => {
      const sources = createWatchSources();
      await persistence.persistWatchRegistry(sources);

      // Update SACAP source status
      sources[0].status = 'needs-review';
      await persistence.persistWatchRegistry(sources);

      const stored = await db.get('fee_guideline_watch', 'sacap-fees');
      expect((stored as Record<string, unknown>).status).toBe('needs-review');
    });
  });

  describe('loadWatchRegistry', () => {
    it('retrieves stored watch sources', async () => {
      const sources = createWatchSources();
      await persistence.persistWatchRegistry(sources);

      const loaded = await persistence.loadWatchRegistry();

      expect(loaded).toHaveLength(2);
      const sacap = loaded.find((s) => s.id === 'sacap-fees');
      const ecsa = loaded.find((s) => s.id === 'ecsa-fees');
      expect(sacap).toBeDefined();
      expect(sacap!.body).toBe('SACAP');
      expect(sacap!.profession).toBe('architect');
      expect(ecsa).toBeDefined();
      expect(ecsa!.body).toBe('ECSA');
    });

    it('returns empty array when no sources are stored', async () => {
      const loaded = await persistence.loadWatchRegistry();
      expect(loaded).toEqual([]);
    });
  });

  describe('persistCandidate', () => {
    it('stores a change candidate with pending status', async () => {
      const candidate = createCandidate();

      const persisted = await persistence.persistCandidate(candidate);

      expect(persisted.id).toBeTruthy();
      expect(persisted.id.startsWith('gc_')).toBe(true);
      expect(persisted.status).toBe('pending');
      expect(persisted.candidate).toEqual(candidate);
      expect(persisted.createdAt).toBeTruthy();
    });

    it('persists to the fee_guideline_candidates collection', async () => {
      const candidate = createCandidate();
      const persisted = await persistence.persistCandidate(candidate);

      const stored = await db.get('fee_guideline_candidates', persisted.id);
      expect(stored).not.toBeNull();
      expect((stored as Record<string, unknown>).status).toBe('pending');
    });
  });

  describe('listCandidates', () => {
    it('returns all pending candidates', async () => {
      await persistence.persistCandidate(createCandidate());
      await persistence.persistCandidate(
        createCandidate({ sourceId: 'ecsa-fees', body: 'ECSA', profession: 'civilEngineer' as Profession }),
      );

      const candidates = await persistence.listCandidates();

      expect(candidates).toHaveLength(2);
      expect(candidates.every((c) => c.status === 'pending')).toBe(true);
    });

    it('does not return dismissed candidates', async () => {
      const persisted = await persistence.persistCandidate(createCandidate());
      await persistence.dismissCandidate(persisted.id);

      const candidates = await persistence.listCandidates();

      expect(candidates).toHaveLength(0);
    });

    it('does not return approved candidates', async () => {
      const persisted = await persistence.persistCandidate(createCandidate());
      await persistence.approveCandidate(
        persisted.id,
        'admin_1',
        'Board Notice 30 of 2025',
        '2025-07-01',
      );

      const candidates = await persistence.listCandidates();

      expect(candidates).toHaveLength(0);
    });

    it('returns empty array when no candidates exist', async () => {
      const candidates = await persistence.listCandidates();
      expect(candidates).toEqual([]);
    });
  });

  describe('approveCandidate', () => {
    it('transitions source version to verified via sourceVersionService', async () => {
      const persisted = await persistence.persistCandidate(createCandidate());

      await persistence.approveCandidate(
        persisted.id,
        'admin_user',
        'SACAP Board Notice 30 of 2025',
        '2025-07-01',
      );

      // Check that a verified source version was created for the architect profession
      const active = await sourceVersionService.getActiveVersion('architect');
      expect(active).not.toBeNull();
      expect(active!.status).toBe('verified');
      expect(active!.approvedBy).toBe('admin_user');
      expect(active!.title).toBe('SACAP Board Notice 30 of 2025');
      expect(active!.effectiveDate).toBe('2025-07-01');
    });

    it('marks the candidate as approved', async () => {
      const persisted = await persistence.persistCandidate(createCandidate());

      await persistence.approveCandidate(
        persisted.id,
        'admin_user',
        'Board Notice 30 of 2025',
        '2025-07-01',
      );

      const doc = await db.get('fee_guideline_candidates', persisted.id);
      const updated = doc as unknown as PersistedCandidate;
      expect(updated.status).toBe('approved');
      expect(updated.resolvedBy).toBe('admin_user');
      expect(updated.resolvedAt).toBeTruthy();
    });

    it('throws when candidate not found', async () => {
      await expect(
        persistence.approveCandidate('nonexistent', 'admin', 'Title', '2025-01-01'),
      ).rejects.toThrow('Candidate not found');
    });

    it('throws when candidate is not pending', async () => {
      const persisted = await persistence.persistCandidate(createCandidate());
      await persistence.dismissCandidate(persisted.id);

      await expect(
        persistence.approveCandidate(persisted.id, 'admin', 'Title', '2025-01-01'),
      ).rejects.toThrow('Candidate is not pending');
    });
  });

  describe('dismissCandidate', () => {
    it('removes the candidate from pending without creating a source version', async () => {
      const persisted = await persistence.persistCandidate(createCandidate());

      await persistence.dismissCandidate(persisted.id);

      const doc = await db.get('fee_guideline_candidates', persisted.id);
      const updated = doc as unknown as PersistedCandidate;
      expect(updated.status).toBe('dismissed');
      expect(updated.resolvedAt).toBeTruthy();

      // No source version should be created
      const active = await sourceVersionService.getActiveVersion('architect');
      expect(active).toBeNull();
    });

    it('throws when candidate not found', async () => {
      await expect(
        persistence.dismissCandidate('nonexistent'),
      ).rejects.toThrow('Candidate not found');
    });

    it('throws when candidate is not pending', async () => {
      const persisted = await persistence.persistCandidate(createCandidate());
      await persistence.dismissCandidate(persisted.id);

      await expect(
        persistence.dismissCandidate(persisted.id),
      ).rejects.toThrow('Candidate is not pending');
    });
  });

  describe('createAdminInboxItem', () => {
    it('creates an inbox event for admin review', async () => {
      const persisted = await persistence.persistCandidate(createCandidate());

      const inboxItem = await persistence.createAdminInboxItem(persisted);

      expect(inboxItem.id).toBeTruthy();
      expect(inboxItem.id.startsWith('inbox_')).toBe(true);
      expect(inboxItem.type).toBe('GUIDELINE_CHANGE_DETECTED');
      expect(inboxItem.title).toContain('SACAP');
      expect(inboxItem.message).toContain('Human review required');
      expect(inboxItem.candidateId).toBe(persisted.id);
      expect(inboxItem.profession).toBe('architect');
      expect(inboxItem.body).toBe('SACAP');
      expect(inboxItem.read).toBe(false);
    });

    it('persists the inbox item to Firestore', async () => {
      const persisted = await persistence.persistCandidate(createCandidate());
      const inboxItem = await persistence.createAdminInboxItem(persisted);

      const stored = await db.get('admin_inbox', inboxItem.id);
      expect(stored).not.toBeNull();
      expect((stored as Record<string, unknown>).type).toBe('GUIDELINE_CHANGE_DETECTED');
      expect((stored as Record<string, unknown>).candidateId).toBe(persisted.id);
    });
  });
});
