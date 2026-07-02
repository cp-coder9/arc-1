import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMunicipalityProfile,
  getMunicipalityProfile,
  updateMunicipalityProfile,
  listMunicipalities,
  getRequirementsForApplicationType,
  type FirestoreDB,
  type AuditFn,
  type Actor,
  type AuditEntry,
} from '../services/municipalityConfig';
import type { MunicipalityProfile } from '../types';

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function createMockDb(overrides?: Partial<FirestoreDB>): FirestoreDB {
  const mockDocRef = {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  };

  const mockCollectionRef = {
    doc: vi.fn().mockReturnValue(mockDocRef),
    add: vi.fn().mockResolvedValue({ id: 'generated-id-123' }),
    get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
  };

  return {
    collection: vi.fn().mockReturnValue(mockCollectionRef),
    ...overrides,
  };
}

function createMockAuditFn(): AuditFn & { mock: { calls: AuditEntry[][] } } {
  return vi.fn().mockResolvedValue(undefined) as unknown as AuditFn & { mock: { calls: AuditEntry[][] } };
}

const validInput = {
  name: 'City of Cape Town',
  province: 'Western Cape',
  districtMunicipality: 'Cape Winelands',
  contactEmail: 'planning@capetown.gov.za',
  contactPhone: '021-400-1234',
  typicalProcessingDays: 90,
  advertisingPeriodDays: 30,
  appealPeriodDays: 180,
  requiredDocuments: ['Heritage Impact Assessment', 'Traffic Impact Study'],
  additionalSDPComponents: ['Stormwater Management Plan', 'Landscaping Plan'],
  additionalFields: { ward_number: 'Ward number for the property' },
  notes: 'Special requirements for coastal properties',
};

const authorizedActor: Actor = { id: 'user-tp-1', role: 'town_planner' };
const adminActor: Actor = { id: 'user-admin-1', role: 'admin' };
const platformAdminActor: Actor = { id: 'user-pa-1', role: 'platform_admin' };
const unauthorizedActor: Actor = { id: 'user-client-1', role: 'client' };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('municipalityConfig', () => {
  let mockDb: FirestoreDB;
  let mockAuditFn: ReturnType<typeof createMockAuditFn>;

  beforeEach(() => {
    mockDb = createMockDb();
    mockAuditFn = createMockAuditFn();
  });

  describe('createMunicipalityProfile', () => {
    it('creates a profile with valid input and authorized role', async () => {
      const result = await createMunicipalityProfile(validInput, authorizedActor, mockDb, mockAuditFn);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.id).toBe('generated-id-123');
      expect(result.data.name).toBe('City of Cape Town');
      expect(result.data.province).toBe('Western Cape');
      expect(result.data.typicalProcessingDays).toBe(90);
      expect(result.data.advertisingPeriodDays).toBe(30);
      expect(result.data.appealPeriodDays).toBe(180);
      expect(result.data.requiredDocuments).toEqual(['Heritage Impact Assessment', 'Traffic Impact Study']);
      expect(result.data.additionalSDPComponents).toEqual(['Stormwater Management Plan', 'Landscaping Plan']);
      expect(result.data.createdBy).toBe('user-tp-1');
      expect(result.data.createdAt).toBeDefined();
      expect(result.data.updatedAt).toBeDefined();
    });

    it('persists to Firestore municipalityProfiles collection', async () => {
      await createMunicipalityProfile(validInput, authorizedActor, mockDb, mockAuditFn);

      expect(mockDb.collection).toHaveBeenCalledWith('municipalityProfiles');
      const collRef = (mockDb.collection as ReturnType<typeof vi.fn>).mock.results[0].value;
      expect(collRef.add).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'City of Cape Town',
          province: 'Western Cape',
          createdBy: 'user-tp-1',
        })
      );
    });

    it('records audit trail on creation', async () => {
      await createMunicipalityProfile(validInput, authorizedActor, mockDb, mockAuditFn);

      expect(mockAuditFn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'municipality_profile_created',
          actorId: 'user-tp-1',
          actorRole: 'town_planner',
          municipalityId: 'generated-id-123',
        })
      );
    });

    it('rejects invalid input (missing required name)', async () => {
      const invalidInput = { ...validInput, name: '' };
      const result = await createMunicipalityProfile(invalidInput, authorizedActor, mockDb, mockAuditFn);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toContain('Validation failed');
      expect(result.error).toContain('Municipality name is required');
    });

    it('rejects invalid input (invalid email format)', async () => {
      const invalidInput = { ...validInput, contactEmail: 'not-an-email' };
      const result = await createMunicipalityProfile(invalidInput, authorizedActor, mockDb, mockAuditFn);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toContain('Validation failed');
      expect(result.error).toContain('Invalid email format');
    });

    it('rejects invalid input (typicalProcessingDays < 1)', async () => {
      const invalidInput = { ...validInput, typicalProcessingDays: 0 };
      const result = await createMunicipalityProfile(invalidInput, authorizedActor, mockDb, mockAuditFn);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toContain('Validation failed');
    });

    it('rejects unauthorized role (client)', async () => {
      const result = await createMunicipalityProfile(validInput, unauthorizedActor, mockDb, mockAuditFn);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toContain('Unauthorized');
      expect(result.error).toContain('client');
    });

    it('allows admin role', async () => {
      const result = await createMunicipalityProfile(validInput, adminActor, mockDb, mockAuditFn);
      expect(result.success).toBe(true);
    });

    it('allows platform_admin role', async () => {
      const result = await createMunicipalityProfile(validInput, platformAdminActor, mockDb, mockAuditFn);
      expect(result.success).toBe(true);
    });

    it('sets default arrays when not provided', async () => {
      const minimalInput = {
        name: 'Test Municipality',
        province: 'Gauteng',
        typicalProcessingDays: 60,
        advertisingPeriodDays: 21,
        appealPeriodDays: 180,
      };

      const result = await createMunicipalityProfile(minimalInput, authorizedActor, mockDb, mockAuditFn);
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.requiredDocuments).toEqual([]);
      expect(result.data.additionalSDPComponents).toEqual([]);
      expect(result.data.additionalFields).toEqual({});
    });
  });

  describe('getMunicipalityProfile', () => {
    it('returns profile when found', async () => {
      const existingData: Omit<MunicipalityProfile, 'id'> = {
        name: 'City of Johannesburg',
        province: 'Gauteng',
        typicalProcessingDays: 120,
        advertisingPeriodDays: 28,
        appealPeriodDays: 180,
        requiredDocuments: [],
        additionalSDPComponents: [],
        additionalFields: {},
        createdBy: 'admin-1',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      const mockDocSnap = {
        exists: true,
        id: 'jhb-001',
        data: () => existingData as unknown as Record<string, unknown>,
      };

      const docRef = { get: vi.fn().mockResolvedValue(mockDocSnap), set: vi.fn(), update: vi.fn() };
      const collRef = { doc: vi.fn().mockReturnValue(docRef), add: vi.fn(), get: vi.fn() };
      const db: FirestoreDB = { collection: vi.fn().mockReturnValue(collRef) };

      const result = await getMunicipalityProfile('jhb-001', db);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('jhb-001');
      expect(result!.name).toBe('City of Johannesburg');
      expect(result!.province).toBe('Gauteng');
    });

    it('returns null when not found', async () => {
      const mockDocSnap = {
        exists: false,
        id: 'non-existent',
        data: () => undefined,
      };

      const docRef = { get: vi.fn().mockResolvedValue(mockDocSnap), set: vi.fn(), update: vi.fn() };
      const collRef = { doc: vi.fn().mockReturnValue(docRef), add: vi.fn(), get: vi.fn() };
      const db: FirestoreDB = { collection: vi.fn().mockReturnValue(collRef) };

      const result = await getMunicipalityProfile('non-existent', db);
      expect(result).toBeNull();
    });
  });

  describe('updateMunicipalityProfile', () => {
    const existingProfile: MunicipalityProfile = {
      id: 'cpt-001',
      name: 'City of Cape Town',
      province: 'Western Cape',
      typicalProcessingDays: 90,
      advertisingPeriodDays: 30,
      appealPeriodDays: 180,
      requiredDocuments: ['Heritage Impact Assessment'],
      additionalSDPComponents: ['Stormwater Plan'],
      additionalFields: { ward_number: 'Ward number' },
      createdBy: 'admin-1',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };

    function createDbWithExistingProfile(): FirestoreDB {
      const mockDocSnap = {
        exists: true,
        id: 'cpt-001',
        data: () => {
          const { id: _id, ...rest } = existingProfile;
          return rest as unknown as Record<string, unknown>;
        },
      };

      const docRef = {
        get: vi.fn().mockResolvedValue(mockDocSnap),
        set: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      };

      const collRef = {
        doc: vi.fn().mockReturnValue(docRef),
        add: vi.fn(),
        get: vi.fn(),
      };

      return { collection: vi.fn().mockReturnValue(collRef) };
    }

    it('updates a profile with valid partial input', async () => {
      const db = createDbWithExistingProfile();
      const updates = { typicalProcessingDays: 120, notes: 'Updated processing time' };

      const result = await updateMunicipalityProfile('cpt-001', updates, authorizedActor, db, mockAuditFn);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.typicalProcessingDays).toBe(120);
      expect(result.data.notes).toBe('Updated processing time');
      expect(result.data.name).toBe('City of Cape Town'); // unchanged
    });

    it('records field-level audit trail', async () => {
      const db = createDbWithExistingProfile();
      const updates = { typicalProcessingDays: 120 };

      await updateMunicipalityProfile('cpt-001', updates, authorizedActor, db, mockAuditFn);

      expect(mockAuditFn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'municipality_profile_updated',
          actorId: 'user-tp-1',
          actorRole: 'town_planner',
          municipalityId: 'cpt-001',
          fieldsChanged: expect.arrayContaining([
            { field: 'typicalProcessingDays', oldValue: 90, newValue: 120 },
          ]),
        })
      );
    });

    it('does not include unchanged fields in audit trail', async () => {
      const db = createDbWithExistingProfile();
      // Updating with same value — should not appear in audit
      const updates = { typicalProcessingDays: 90, notes: 'New note' };

      await updateMunicipalityProfile('cpt-001', updates, authorizedActor, db, mockAuditFn);

      const auditCall = (mockAuditFn as ReturnType<typeof vi.fn>).mock.calls[0][0] as AuditEntry;
      // typicalProcessingDays is unchanged (90→90), so only notes should appear
      expect(auditCall.fieldsChanged).not.toContainEqual(
        expect.objectContaining({ field: 'typicalProcessingDays' })
      );
      expect(auditCall.fieldsChanged).toContainEqual(
        expect.objectContaining({ field: 'notes' })
      );
    });

    it('returns error when profile not found', async () => {
      const mockDocSnap = { exists: false, id: 'missing', data: () => undefined };
      const docRef = { get: vi.fn().mockResolvedValue(mockDocSnap), set: vi.fn(), update: vi.fn() };
      const collRef = { doc: vi.fn().mockReturnValue(docRef), add: vi.fn(), get: vi.fn() };
      const db: FirestoreDB = { collection: vi.fn().mockReturnValue(collRef) };

      const result = await updateMunicipalityProfile('missing', { name: 'New Name' }, authorizedActor, db, mockAuditFn);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toContain('not found');
    });

    it('rejects unauthorized role', async () => {
      const db = createDbWithExistingProfile();
      const result = await updateMunicipalityProfile('cpt-001', { name: 'New' }, unauthorizedActor, db, mockAuditFn);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toContain('Unauthorized');
    });

    it('rejects invalid update (email format)', async () => {
      const db = createDbWithExistingProfile();
      const result = await updateMunicipalityProfile(
        'cpt-001',
        { contactEmail: 'bad-email' },
        authorizedActor,
        db,
        mockAuditFn
      );

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toContain('Validation failed');
    });

    it('persists update to Firestore', async () => {
      const db = createDbWithExistingProfile();
      await updateMunicipalityProfile('cpt-001', { typicalProcessingDays: 100 }, authorizedActor, db, mockAuditFn);

      const collRef = (db.collection as ReturnType<typeof vi.fn>).mock.results[0].value;
      const docRef = collRef.doc.mock.results[0].value;
      expect(docRef.update).toHaveBeenCalledWith(
        expect.objectContaining({ typicalProcessingDays: 100, updatedAt: expect.any(String) })
      );
    });
  });

  describe('listMunicipalities', () => {
    it('returns all profiles', async () => {
      const docs = [
        {
          exists: true,
          id: 'mun-1',
          data: () => ({ name: 'Municipality A', province: 'Gauteng', typicalProcessingDays: 60, advertisingPeriodDays: 21, appealPeriodDays: 180, requiredDocuments: [], additionalSDPComponents: [], additionalFields: {}, createdBy: 'a', createdAt: '2025-01-01', updatedAt: '2025-01-01' }),
        },
        {
          exists: true,
          id: 'mun-2',
          data: () => ({ name: 'Municipality B', province: 'KZN', typicalProcessingDays: 90, advertisingPeriodDays: 28, appealPeriodDays: 180, requiredDocuments: [], additionalSDPComponents: [], additionalFields: {}, createdBy: 'b', createdAt: '2025-02-01', updatedAt: '2025-02-01' }),
        },
      ];

      const collRef = { doc: vi.fn(), add: vi.fn(), get: vi.fn().mockResolvedValue({ docs, empty: false }) };
      const db: FirestoreDB = { collection: vi.fn().mockReturnValue(collRef) };

      const result = await listMunicipalities(db);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('mun-1');
      expect(result[0].name).toBe('Municipality A');
      expect(result[1].id).toBe('mun-2');
      expect(result[1].name).toBe('Municipality B');
    });

    it('returns empty array when no profiles exist', async () => {
      const collRef = { doc: vi.fn(), add: vi.fn(), get: vi.fn().mockResolvedValue({ docs: [], empty: true }) };
      const db: FirestoreDB = { collection: vi.fn().mockReturnValue(collRef) };

      const result = await listMunicipalities(db);
      expect(result).toEqual([]);
    });
  });

  describe('getRequirementsForApplicationType', () => {
    const municipalityData: Omit<MunicipalityProfile, 'id'> = {
      name: 'City of Tshwane',
      province: 'Gauteng',
      typicalProcessingDays: 90,
      advertisingPeriodDays: 28,
      appealPeriodDays: 180,
      requiredDocuments: ['Environmental Clearance', 'Heritage Survey'],
      additionalSDPComponents: ['Traffic Impact Plan'],
      additionalFields: { ward: 'Ward number', precinct: 'Precinct name' },
      createdBy: 'admin-1',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };

    function createDbWithProfile(): FirestoreDB {
      const mockDocSnap = {
        exists: true,
        id: 'tsh-001',
        data: () => municipalityData as unknown as Record<string, unknown>,
      };
      const docRef = { get: vi.fn().mockResolvedValue(mockDocSnap), set: vi.fn(), update: vi.fn() };
      const collRef = { doc: vi.fn().mockReturnValue(docRef), add: vi.fn(), get: vi.fn() };
      return { collection: vi.fn().mockReturnValue(collRef) };
    }

    it('returns correct requirements for rezoning application', async () => {
      const db = createDbWithProfile();
      const result = await getRequirementsForApplicationType('tsh-001', 'rezoning', db);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.forms).toContain('Application for Rezoning (Form A)');
      expect(result.data.forms).toContain('Motivation Report');
      expect(result.data.documents).toContain('Title Deed');
      expect(result.data.documents).toContain('SG Diagram');
      expect(result.data.documents).toContain('Site Development Plan');
      // Municipality-specific documents merged in
      expect(result.data.documents).toContain('Environmental Clearance');
      expect(result.data.documents).toContain('Heritage Survey');
      expect(result.data.additionalFields).toEqual({ ward: 'Ward number', precinct: 'Precinct name' });
      expect(result.data.sdpComponents).toEqual(['Traffic Impact Plan']);
    });

    it('returns correct requirements for subdivision application', async () => {
      const db = createDbWithProfile();
      const result = await getRequirementsForApplicationType('tsh-001', 'subdivision', db);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.forms).toContain('Application for Subdivision (Form C)');
      expect(result.data.documents).toContain('Surveyor Layout Plan');
      // Municipality extras are still merged
      expect(result.data.documents).toContain('Environmental Clearance');
    });

    it('returns error when municipality not found', async () => {
      const mockDocSnap = { exists: false, id: 'missing', data: () => undefined };
      const docRef = { get: vi.fn().mockResolvedValue(mockDocSnap), set: vi.fn(), update: vi.fn() };
      const collRef = { doc: vi.fn().mockReturnValue(docRef), add: vi.fn(), get: vi.fn() };
      const db: FirestoreDB = { collection: vi.fn().mockReturnValue(collRef) };

      const result = await getRequirementsForApplicationType('missing', 'rezoning', db);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toContain('not found');
    });

    it('returns empty municipality extras when profile has none', async () => {
      const emptyData = {
        ...municipalityData,
        requiredDocuments: [],
        additionalSDPComponents: [],
        additionalFields: {},
      };
      const mockDocSnap = { exists: true, id: 'empty-mun', data: () => emptyData as unknown as Record<string, unknown> };
      const docRef = { get: vi.fn().mockResolvedValue(mockDocSnap), set: vi.fn(), update: vi.fn() };
      const collRef = { doc: vi.fn().mockReturnValue(docRef), add: vi.fn(), get: vi.fn() };
      const db: FirestoreDB = { collection: vi.fn().mockReturnValue(collRef) };

      const result = await getRequirementsForApplicationType('empty-mun', 'consent_use', db);

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Should only have standard docs, no extras
      expect(result.data.documents).toEqual(['Title Deed', 'SG Diagram', 'Power of Attorney', 'Proof of Payment']);
      expect(result.data.additionalFields).toEqual({});
      expect(result.data.sdpComponents).toEqual([]);
    });
  });

  describe('role enforcement', () => {
    it('town_planner can create profiles', async () => {
      const result = await createMunicipalityProfile(validInput, authorizedActor, mockDb, mockAuditFn);
      expect(result.success).toBe(true);
    });

    it('admin can create profiles', async () => {
      const result = await createMunicipalityProfile(validInput, adminActor, mockDb, mockAuditFn);
      expect(result.success).toBe(true);
    });

    it('platform_admin can create profiles', async () => {
      const result = await createMunicipalityProfile(validInput, platformAdminActor, mockDb, mockAuditFn);
      expect(result.success).toBe(true);
    });

    it('client cannot create profiles', async () => {
      const result = await createMunicipalityProfile(validInput, { id: 'c1', role: 'client' }, mockDb, mockAuditFn);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toContain('Unauthorized');
    });

    it('architect cannot create profiles', async () => {
      const result = await createMunicipalityProfile(validInput, { id: 'a1', role: 'architect' }, mockDb, mockAuditFn);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toContain('Unauthorized');
    });

    it('engineer cannot create profiles', async () => {
      const result = await createMunicipalityProfile(validInput, { id: 'e1', role: 'engineer' }, mockDb, mockAuditFn);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toContain('Unauthorized');
    });

    it('contractor cannot update profiles', async () => {
      const existingProfile = {
        exists: true,
        id: 'cpt-001',
        data: () => ({ ...validInput, createdBy: 'admin', createdAt: '2025-01-01', updatedAt: '2025-01-01' }),
      };
      const docRef = { get: vi.fn().mockResolvedValue(existingProfile), set: vi.fn(), update: vi.fn() };
      const collRef = { doc: vi.fn().mockReturnValue(docRef), add: vi.fn(), get: vi.fn() };
      const db: FirestoreDB = { collection: vi.fn().mockReturnValue(collRef) };

      const result = await updateMunicipalityProfile(
        'cpt-001',
        { name: 'Hack' },
        { id: 'c1', role: 'contractor' },
        db,
        mockAuditFn
      );
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toContain('Unauthorized');
    });
  });
});
