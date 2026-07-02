import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createApplication,
  getApplication,
  listApplicationsByProject,
  generateReferenceNumber,
  type ActorContext,
  type ApplicationAuditFn,
  type PassportFn,
} from '../services/applicationEngine';
import type { FirestoreDB } from '../services/municipalityConfig';

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function createMockDb(existingDocs: Record<string, unknown>[] = []): FirestoreDB {
  const mockDocRef = {
    get: vi.fn().mockResolvedValue({ exists: false, id: 'doc-1', data: () => undefined }),
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  };

  const mockCollectionRef = {
    doc: vi.fn().mockReturnValue(mockDocRef),
    add: vi.fn().mockResolvedValue({ id: 'app-generated-id' }),
    get: vi.fn().mockResolvedValue({
      docs: existingDocs.map((d, i) => ({
        exists: true,
        id: `existing-${i}`,
        data: () => d,
      })),
      empty: existingDocs.length === 0,
    }),
  };

  return {
    collection: vi.fn().mockReturnValue(mockCollectionRef),
  };
}

function createMockAuditFn(): ApplicationAuditFn {
  return vi.fn().mockResolvedValue(undefined);
}

function createMockPassportFn(): PassportFn {
  return vi.fn().mockResolvedValue(undefined);
}

const validRezoningParams = {
  applicationType: 'rezoning' as const,
  municipalityId: 'mun-001',
  propertyId: 'prop-001',
  applicantName: 'John Smith',
  applicantContact: 'john@example.com',
  description: 'Rezoning from residential to mixed use',
  rezoningDetails: {
    currentZoning: 'Residential 1',
    proposedZoning: 'Mixed Use 2',
    motivation: 'Market demand for mixed-use in the area',
  },
};

const validDepartureParams = {
  applicationType: 'departure' as const,
  municipalityId: 'mun-001',
  propertyId: 'prop-002',
  applicantName: 'Jane Doe',
  applicantContact: 'jane@example.com',
  description: 'Building line departure',
  departureDetails: {
    departureType: 'Building line relaxation',
    extent: '2m from 5m to 3m',
    motivation: 'Constrained erf size',
  },
};

const validSubdivisionParams = {
  applicationType: 'subdivision' as const,
  municipalityId: 'mun-001',
  propertyId: 'prop-003',
  applicantName: 'Dev Corp',
  applicantContact: 'dev@corp.co.za',
  description: 'Subdivide erf into 4 portions',
  subdivisionDetails: {
    numberOfPortions: 4,
    layoutDescription: 'Four equal portions with shared access',
  },
};

const validConsolidationParams = {
  applicationType: 'consolidation' as const,
  municipalityId: 'mun-001',
  propertyId: 'prop-004',
  applicantName: 'Build Co',
  applicantContact: 'build@co.za',
  description: 'Consolidate 2 erven',
  subdivisionDetails: {
    numberOfPortions: 2,
    layoutDescription: 'Consolidation of adjacent erven',
  },
};

const validRemovalParams = {
  applicationType: 'removal_of_restrictive_conditions' as const,
  municipalityId: 'mun-001',
  propertyId: 'prop-005',
  applicantName: 'Owner',
  applicantContact: 'owner@mail.com',
  description: 'Remove height restriction',
  restrictiveConditionDetails: {
    conditionReference: 'T1234/2020',
    conditionText: 'Building height not to exceed 8m',
    reasonForRemoval: 'Amendment to zoning scheme permits higher buildings',
  },
};

const validConsentUseParams = {
  applicationType: 'consent_use' as const,
  municipalityId: 'mun-001',
  propertyId: 'prop-006',
  applicantName: 'Shop Owner',
  applicantContact: 'shop@mail.com',
  description: 'Consent use for home business',
};

const validTownshipParams = {
  applicationType: 'township_establishment' as const,
  municipalityId: 'mun-001',
  propertyId: 'prop-007',
  applicantName: 'Township Dev',
  applicantContact: 'township@dev.co.za',
  description: 'New township establishment',
};

const validAmendmentParams = {
  applicationType: 'amendment_of_scheme' as const,
  municipalityId: 'mun-001',
  propertyId: 'prop-008',
  applicantName: 'Planner',
  applicantContact: 'planner@mail.com',
  description: 'Amend scheme clause 28',
};

const actor: ActorContext = { id: 'user-tp-1', role: 'town_planner' };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('applicationEngine', () => {
  let mockDb: FirestoreDB;
  let mockAuditFn: ApplicationAuditFn;
  let mockPassportFn: PassportFn;

  beforeEach(() => {
    mockDb = createMockDb();
    mockAuditFn = createMockAuditFn();
    mockPassportFn = createMockPassportFn();
  });

  describe('createApplication', () => {
    describe('rezoning', () => {
      it('creates rezoning application with valid params', async () => {
        const result = await createApplication('proj-abc1', validRezoningParams, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.applicationType).toBe('rezoning');
        expect(result.data.stage).toBe('preparation');
        expect(result.data.referenceNumber).toMatch(/^TP-PROJ-\d{3}$/);
        expect(result.data.projectId).toBe('proj-abc1');
      });

      it('rejects rezoning without rezoningDetails', async () => {
        const { rezoningDetails: _, ...params } = validRezoningParams;
        const result = await createApplication('proj-abc1', params, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error).toContain('rezoningDetails is required');
      });
    });

    describe('departure', () => {
      it('creates departure application with valid params', async () => {
        const result = await createApplication('proj-def2', validDepartureParams, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.applicationType).toBe('departure');
        expect(result.data.stage).toBe('preparation');
      });

      it('rejects departure without departureDetails', async () => {
        const { departureDetails: _, ...params } = validDepartureParams;
        const result = await createApplication('proj-def2', params, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error).toContain('departureDetails is required');
      });
    });

    describe('subdivision', () => {
      it('creates subdivision application with valid params', async () => {
        const result = await createApplication('proj-ghi3', validSubdivisionParams, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.applicationType).toBe('subdivision');
        expect(result.data.stage).toBe('preparation');
      });

      it('rejects subdivision without subdivisionDetails', async () => {
        const { subdivisionDetails: _, ...params } = validSubdivisionParams;
        const result = await createApplication('proj-ghi3', params, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error).toContain('subdivisionDetails is required');
      });
    });

    describe('consolidation', () => {
      it('creates consolidation application with valid params', async () => {
        const result = await createApplication('proj-jkl4', validConsolidationParams, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.applicationType).toBe('consolidation');
        expect(result.data.stage).toBe('preparation');
      });

      it('rejects consolidation without subdivisionDetails', async () => {
        const { subdivisionDetails: _, ...params } = validConsolidationParams;
        const result = await createApplication('proj-jkl4', params, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error).toContain('subdivisionDetails is required');
      });
    });

    describe('removal_of_restrictive_conditions', () => {
      it('creates removal application with valid params', async () => {
        const result = await createApplication('proj-mno5', validRemovalParams, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.applicationType).toBe('removal_of_restrictive_conditions');
        expect(result.data.stage).toBe('preparation');
      });

      it('rejects removal without restrictiveConditionDetails', async () => {
        const { restrictiveConditionDetails: _, ...params } = validRemovalParams;
        const result = await createApplication('proj-mno5', params, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error).toContain('restrictiveConditionDetails is required');
      });
    });

    describe('consent_use', () => {
      it('creates consent_use application without extra details', async () => {
        const result = await createApplication('proj-pqr6', validConsentUseParams, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.applicationType).toBe('consent_use');
        expect(result.data.stage).toBe('preparation');
      });
    });

    describe('township_establishment', () => {
      it('creates township_establishment application without extra details', async () => {
        const result = await createApplication('proj-stu7', validTownshipParams, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.applicationType).toBe('township_establishment');
        expect(result.data.stage).toBe('preparation');
      });
    });

    describe('amendment_of_scheme', () => {
      it('creates amendment_of_scheme application without extra details', async () => {
        const result = await createApplication('proj-vwx8', validAmendmentParams, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.applicationType).toBe('amendment_of_scheme');
        expect(result.data.stage).toBe('preparation');
      });
    });

    describe('base field validation', () => {
      it('rejects empty municipalityId', async () => {
        const params = { ...validConsentUseParams, municipalityId: '' };
        const result = await createApplication('proj-001', params, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error).toContain('Municipality ID is required');
      });

      it('rejects empty propertyId', async () => {
        const params = { ...validConsentUseParams, propertyId: '' };
        const result = await createApplication('proj-001', params, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error).toContain('Property ID is required');
      });

      it('rejects empty applicantName', async () => {
        const params = { ...validConsentUseParams, applicantName: '' };
        const result = await createApplication('proj-001', params, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error).toContain('Applicant name is required');
      });

      it('rejects empty applicantContact', async () => {
        const params = { ...validConsentUseParams, applicantContact: '' };
        const result = await createApplication('proj-001', params, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error).toContain('Applicant contact is required');
      });

      it('rejects empty description', async () => {
        const params = { ...validConsentUseParams, description: '' };
        const result = await createApplication('proj-001', params, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error).toContain('Description is required');
      });

      it('rejects empty projectId', async () => {
        const result = await createApplication('', validConsentUseParams, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error).toContain('projectId is required');
      });

      it('rejects invalid applicationType', async () => {
        const params = { ...validConsentUseParams, applicationType: 'invalid_type' };
        const result = await createApplication('proj-001', params, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(result.success).toBe(false);
      });
    });

    describe('reference number generation', () => {
      it('generates reference in format TP-{4chars}-{seq}', async () => {
        const result = await createApplication('project-xyz-long-id', validConsentUseParams, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.referenceNumber).toBe('TP-PROJ-001');
      });

      it('increments sequence for existing applications', async () => {
        const dbWithExisting = createMockDb([
          { applicationType: 'rezoning' },
          { applicationType: 'departure' },
        ]);

        const result = await createApplication('abcd-efgh', validConsentUseParams, actor, {
          db: dbWithExisting,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.referenceNumber).toBe('TP-ABCD-003');
      });

      it('uses first 4 chars of projectId uppercased', async () => {
        const ref = await generateReferenceNumber('test-project-id', createMockDb());
        expect(ref).toBe('TP-TEST-001');
      });
    });

    describe('initial status', () => {
      it('sets stage to preparation on creation', async () => {
        const result = await createApplication('proj-001', validRezoningParams, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.stage).toBe('preparation');
      });
    });

    describe('audit trail', () => {
      it('calls audit function with correct payload', async () => {
        await createApplication('proj-001', validRezoningParams, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(mockAuditFn).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'application_created',
            actorId: 'user-tp-1',
            actorRole: 'town_planner',
            projectId: 'proj-001',
            applicationId: 'app-generated-id',
            applicationType: 'rezoning',
            referenceNumber: expect.stringMatching(/^TP-PROJ-\d{3}$/),
          })
        );
      });

      it('does not call audit on validation failure', async () => {
        await createApplication('proj-001', { applicationType: 'rezoning' }, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(mockAuditFn).not.toHaveBeenCalled();
      });
    });

    describe('passport write', () => {
      it('calls passport function with correct payload', async () => {
        await createApplication('proj-001', validRezoningParams, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(mockPassportFn).toHaveBeenCalledWith(
          expect.objectContaining({
            projectId: 'proj-001',
            applicationId: 'app-generated-id',
            applicationType: 'rezoning',
            status: 'preparation',
            referenceNumber: expect.stringMatching(/^TP-PROJ-\d{3}$/),
          })
        );
      });

      it('does not call passport on validation failure', async () => {
        await createApplication('proj-001', { applicationType: 'rezoning' }, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(mockPassportFn).not.toHaveBeenCalled();
      });
    });

    describe('Firestore persistence', () => {
      it('persists to correct collection path', async () => {
        await createApplication('proj-001', validRezoningParams, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(mockDb.collection).toHaveBeenCalledWith(
          'projects/proj-001/townPlanning/applications'
        );
      });
    });

    describe('multiple concurrent applications', () => {
      it('supports creating multiple applications for same project', async () => {
        const result1 = await createApplication('proj-001', validRezoningParams, actor, {
          db: mockDb,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        // Now simulate one existing doc for the second call
        const dbWithOne = createMockDb([{ applicationType: 'rezoning' }]);
        const result2 = await createApplication('proj-001', validDepartureParams, actor, {
          db: dbWithOne,
          auditFn: mockAuditFn,
          passportFn: mockPassportFn,
        });

        expect(result1.success).toBe(true);
        expect(result2.success).toBe(true);
        if (!result1.success || !result2.success) return;
        expect(result1.data.referenceNumber).not.toBe(result2.data.referenceNumber);
      });
    });
  });

  describe('getApplication', () => {
    it('returns application when found', async () => {
      const appData = {
        projectId: 'proj-001',
        referenceNumber: 'TP-PROJ-001',
        applicationType: 'rezoning',
        stage: 'preparation',
        municipalityId: 'mun-001',
        propertyId: 'prop-001',
        applicantName: 'Test',
        applicantContact: 'test@mail.com',
        description: 'Test app',
        createdBy: 'user-1',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      const mockDocSnap = { exists: true, id: 'app-001', data: () => appData };
      const docRef = { get: vi.fn().mockResolvedValue(mockDocSnap), set: vi.fn(), update: vi.fn() };
      const collRef = { doc: vi.fn().mockReturnValue(docRef), add: vi.fn(), get: vi.fn() };
      const db: FirestoreDB = { collection: vi.fn().mockReturnValue(collRef) };

      const result = await getApplication('app-001', 'proj-001', db);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('app-001');
      expect(result!.referenceNumber).toBe('TP-PROJ-001');
      expect(result!.applicationType).toBe('rezoning');
    });

    it('returns null when not found', async () => {
      const mockDocSnap = { exists: false, id: 'missing', data: () => undefined };
      const docRef = { get: vi.fn().mockResolvedValue(mockDocSnap), set: vi.fn(), update: vi.fn() };
      const collRef = { doc: vi.fn().mockReturnValue(docRef), add: vi.fn(), get: vi.fn() };
      const db: FirestoreDB = { collection: vi.fn().mockReturnValue(collRef) };

      const result = await getApplication('missing', 'proj-001', db);
      expect(result).toBeNull();
    });
  });

  describe('listApplicationsByProject', () => {
    it('returns all applications for a project', async () => {
      const docs = [
        { exists: true, id: 'app-1', data: () => ({ applicationType: 'rezoning', referenceNumber: 'TP-PROJ-001' }) },
        { exists: true, id: 'app-2', data: () => ({ applicationType: 'departure', referenceNumber: 'TP-PROJ-002' }) },
        { exists: true, id: 'app-3', data: () => ({ applicationType: 'subdivision', referenceNumber: 'TP-PROJ-003' }) },
      ];

      const collRef = { doc: vi.fn(), add: vi.fn(), get: vi.fn().mockResolvedValue({ docs, empty: false }) };
      const db: FirestoreDB = { collection: vi.fn().mockReturnValue(collRef) };

      const result = await listApplicationsByProject('proj-001', db);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('app-1');
      expect(result[1].id).toBe('app-2');
      expect(result[2].id).toBe('app-3');
    });

    it('returns empty array when no applications exist', async () => {
      const collRef = { doc: vi.fn(), add: vi.fn(), get: vi.fn().mockResolvedValue({ docs: [], empty: true }) };
      const db: FirestoreDB = { collection: vi.fn().mockReturnValue(collRef) };

      const result = await listApplicationsByProject('proj-001', db);
      expect(result).toEqual([]);
    });

    it('queries correct Firestore path', async () => {
      const collRef = { doc: vi.fn(), add: vi.fn(), get: vi.fn().mockResolvedValue({ docs: [], empty: true }) };
      const db: FirestoreDB = { collection: vi.fn().mockReturnValue(collRef) };

      await listApplicationsByProject('my-project', db);
      expect(db.collection).toHaveBeenCalledWith('projects/my-project/townPlanning/applications');
    });
  });
});
