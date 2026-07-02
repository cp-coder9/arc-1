/**
 * Property Intelligence Register — Unit Tests
 *
 * Covers:
 * - Create property record
 * - Get existing / non-existent property
 * - Field-level update with audit trail
 * - Restrictive condition add / remove (soft delete)
 * - Servitude add
 * - Surveyor linking
 * - Compliance hub exposure
 * - Role enforcement (authorized succeed, unauthorized rejected)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserRole } from '@/types';
import type {
  FirestoreDB,
  AuditFn,
  Actor,
  PropertyDeps,
  PropertyAuditEntry,
  ComplianceHubFn,
  CreatePropertyInput,
} from '../services/propertyRegister';
import {
  createPropertyRecord,
  getPropertyData,
  updatePropertyField,
  addRestrictiveCondition,
  removeRestrictiveCondition,
  addServitude,
  linkSurveyor,
  exposeZoningToComplianceHub,
} from '../services/propertyRegister';
import type { ZoningParameters } from '../types';

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function createMockDocSnapshot(
  exists: boolean,
  id: string,
  data?: Record<string, unknown>
) {
  return {
    exists,
    id,
    data: () => data,
  };
}

function createMockDocRef(snapshot?: ReturnType<typeof createMockDocSnapshot>) {
  const ref = {
    get: vi.fn().mockResolvedValue(snapshot ?? createMockDocSnapshot(false, 'main')),
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    collection: vi.fn(),
  };
  return ref;
}

function createMockCollectionRef(
  docRef?: ReturnType<typeof createMockDocRef>,
  addId = 'generated-id'
) {
  const col = {
    doc: vi.fn().mockReturnValue(docRef ?? createMockDocRef()),
    add: vi.fn().mockResolvedValue({ id: addId }),
    get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
  };
  return col;
}

function createMockDb(collectionMap?: Record<string, ReturnType<typeof createMockCollectionRef>>): FirestoreDB {
  return {
    collection: vi.fn((path: string) => {
      if (collectionMap && collectionMap[path]) {
        return collectionMap[path];
      }
      return createMockCollectionRef();
    }),
  };
}

function createMockAuditFn(): AuditFn & { calls: PropertyAuditEntry[] } {
  const calls: PropertyAuditEntry[] = [];
  const fn = vi.fn(async (entry: PropertyAuditEntry) => {
    calls.push(entry);
  }) as unknown as AuditFn & { calls: PropertyAuditEntry[] };
  (fn as any).calls = calls;
  return fn;
}

const SAMPLE_ZONING: ZoningParameters = {
  currentZoning: 'Residential 1',
  proposedZoning: 'General Business',
  coveragePercentage: 60,
  floorAreaRatio: 1.5,
  height: 12,
  buildingLines: { front: 3, rear: 2, side1: 1.5, side2: 1.5 },
  parkingRequired: 4,
  densityUnitsPerHa: 50,
};

const SAMPLE_INPUT: CreatePropertyInput = {
  erfNumber: 'Erf 1234',
  portionNumber: 'Portion 1',
  township: 'Sandton',
  registrationDivision: 'JR',
  province: 'Gauteng',
  municipality: 'City of Johannesburg',
  titleDeedNumber: 'T12345/2024',
  extent: 1500,
  zoning: SAMPLE_ZONING,
};

const SAMPLE_PROPERTY_DATA: Record<string, unknown> = {
  projectId: 'proj-1',
  erfNumber: 'Erf 1234',
  portionNumber: 'Portion 1',
  township: 'Sandton',
  registrationDivision: 'JR',
  province: 'Gauteng',
  municipality: 'City of Johannesburg',
  titleDeedNumber: 'T12345/2024',
  extent: 1500,
  zoning: SAMPLE_ZONING,
  restrictiveConditions: [],
  servitudes: [],
  surveyorName: undefined,
  surveyorPlatoNumber: undefined,
  createdBy: 'user-1',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('propertyRegister', () => {
  let auditFn: AuditFn & { calls: PropertyAuditEntry[] };

  beforeEach(() => {
    auditFn = createMockAuditFn();
  });

  // ─── createPropertyRecord ────────────────────────────────────────────────

  describe('createPropertyRecord', () => {
    it('creates a property record with valid input and authorized role', async () => {
      const docRef = createMockDocRef();
      const col = createMockCollectionRef(docRef);
      const db = createMockDb({ 'projects/proj-1/townPlanning/property': col });
      const actor: Actor = { id: 'user-1', role: 'town_planner' };
      const deps: PropertyDeps = { db, auditFn };

      const result = await createPropertyRecord('proj-1', SAMPLE_INPUT, actor, deps);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.erfNumber).toBe('Erf 1234');
        expect(result.data.projectId).toBe('proj-1');
        expect(result.data.id).toBe('main');
        expect(result.data.zoning.currentZoning).toBe('Residential 1');
        expect(result.data.createdBy).toBe('user-1');
      }
      expect(col.doc).toHaveBeenCalledWith('main');
      expect(docRef.set).toHaveBeenCalled();
      expect(auditFn.calls).toHaveLength(1);
      expect(auditFn.calls[0].action).toBe('property_created');
    });

    it('rejects unauthorized roles', async () => {
      const db = createMockDb();
      const actor: Actor = { id: 'user-1', role: 'client' };
      const deps: PropertyDeps = { db, auditFn };

      const result = await createPropertyRecord('proj-1', SAMPLE_INPUT, actor, deps);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Unauthorized');
        expect(result.error).toContain('client');
      }
    });
  });

  // ─── getPropertyData ─────────────────────────────────────────────────────

  describe('getPropertyData', () => {
    it('returns property when it exists', async () => {
      const docRef = createMockDocRef(
        createMockDocSnapshot(true, 'main', SAMPLE_PROPERTY_DATA)
      );
      const col = createMockCollectionRef(docRef);
      const db = createMockDb({ 'projects/proj-1/townPlanning/property': col });

      const result = await getPropertyData('proj-1', db);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('main');
      expect(result!.erfNumber).toBe('Erf 1234');
    });

    it('returns null when property does not exist', async () => {
      const docRef = createMockDocRef(createMockDocSnapshot(false, 'main'));
      const col = createMockCollectionRef(docRef);
      const db = createMockDb({ 'projects/proj-1/townPlanning/property': col });

      const result = await getPropertyData('proj-1', db);

      expect(result).toBeNull();
    });
  });

  // ─── updatePropertyField ─────────────────────────────────────────────────

  describe('updatePropertyField', () => {
    it('updates a field and records audit trail with old/new values', async () => {
      const docRef = createMockDocRef(
        createMockDocSnapshot(true, 'main', SAMPLE_PROPERTY_DATA)
      );
      const col = createMockCollectionRef(docRef);
      const db = createMockDb({ 'projects/proj-1/townPlanning/property': col });
      const actor: Actor = { id: 'user-2', role: 'architect' };
      const deps: PropertyDeps = { db, auditFn };

      const result = await updatePropertyField('proj-1', 'erfNumber', 'Erf 5678', actor, deps);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.erfNumber).toBe('Erf 5678');
      }
      expect(docRef.update).toHaveBeenCalledWith(
        expect.objectContaining({ erfNumber: 'Erf 5678' })
      );
      expect(auditFn.calls).toHaveLength(1);
      expect(auditFn.calls[0].action).toBe('property_field_updated');
      expect(auditFn.calls[0].field).toBe('erfNumber');
      expect(auditFn.calls[0].oldValue).toBe('Erf 1234');
      expect(auditFn.calls[0].newValue).toBe('Erf 5678');
    });

    it('returns error if property does not exist', async () => {
      const docRef = createMockDocRef(createMockDocSnapshot(false, 'main'));
      const col = createMockCollectionRef(docRef);
      const db = createMockDb({ 'projects/proj-1/townPlanning/property': col });
      const actor: Actor = { id: 'user-1', role: 'town_planner' };
      const deps: PropertyDeps = { db, auditFn };

      const result = await updatePropertyField('proj-1', 'erfNumber', 'Erf 5678', actor, deps);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('not found');
      }
    });

    it('rejects unauthorized roles', async () => {
      const db = createMockDb();
      const actor: Actor = { id: 'user-1', role: 'contractor' };
      const deps: PropertyDeps = { db, auditFn };

      const result = await updatePropertyField('proj-1', 'erfNumber', 'Erf 5678', actor, deps);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Unauthorized');
      }
    });
  });

  // ─── addRestrictiveCondition ─────────────────────────────────────────────

  describe('addRestrictiveCondition', () => {
    it('adds a condition to the sub-collection and records audit', async () => {
      const mainDocRef = createMockDocRef(
        createMockDocSnapshot(true, 'main', SAMPLE_PROPERTY_DATA)
      );
      const subColRef = createMockCollectionRef(undefined, 'cond-1');
      const mainCol = createMockCollectionRef(mainDocRef);

      const db: FirestoreDB = {
        collection: vi.fn((path: string) => {
          if (path === 'projects/proj-1/townPlanning/property') {
            return mainCol;
          }
          if (path === 'projects/proj-1/townPlanning/property/main/restrictiveConditions') {
            return subColRef;
          }
          return createMockCollectionRef();
        }),
      };

      const actor: Actor = { id: 'user-1', role: 'town_planner' };
      const deps: PropertyDeps = { db, auditFn };

      const result = await addRestrictiveCondition(
        'proj-1',
        {
          titleDeedReference: 'T12345/2024',
          conditionText: 'No commercial use permitted',
          status: 'active',
        },
        actor,
        deps
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('cond-1');
        expect(result.data.conditionText).toBe('No commercial use permitted');
        expect(result.data.status).toBe('active');
      }
      expect(subColRef.add).toHaveBeenCalled();
      expect(auditFn.calls).toHaveLength(1);
      expect(auditFn.calls[0].action).toBe('restrictive_condition_added');
    });

    it('returns error if property does not exist', async () => {
      const mainDocRef = createMockDocRef(createMockDocSnapshot(false, 'main'));
      const mainCol = createMockCollectionRef(mainDocRef);
      const db = createMockDb({ 'projects/proj-1/townPlanning/property': mainCol });
      const actor: Actor = { id: 'user-1', role: 'town_planner' };
      const deps: PropertyDeps = { db, auditFn };

      const result = await addRestrictiveCondition(
        'proj-1',
        {
          titleDeedReference: 'T12345/2024',
          conditionText: 'No commercial use',
          status: 'active',
        },
        actor,
        deps
      );

      expect(result.success).toBe(false);
    });
  });

  // ─── removeRestrictiveCondition ──────────────────────────────────────────

  describe('removeRestrictiveCondition', () => {
    it('marks a condition as inactive (soft delete)', async () => {
      const condDocRef = createMockDocRef(
        createMockDocSnapshot(true, 'cond-1', {
          titleDeedReference: 'T12345/2024',
          conditionText: 'No commercial use',
          status: 'active',
        })
      );
      const subColRef = createMockCollectionRef(condDocRef);

      const mainDocRef = createMockDocRef(
        createMockDocSnapshot(true, 'main', SAMPLE_PROPERTY_DATA)
      );
      const mainCol = createMockCollectionRef(mainDocRef);

      const db: FirestoreDB = {
        collection: vi.fn((path: string) => {
          if (path === 'projects/proj-1/townPlanning/property') {
            return mainCol;
          }
          if (path === 'projects/proj-1/townPlanning/property/main/restrictiveConditions') {
            return subColRef;
          }
          return createMockCollectionRef();
        }),
      };

      const actor: Actor = { id: 'user-1', role: 'land_surveyor' };
      const deps: PropertyDeps = { db, auditFn };

      const result = await removeRestrictiveCondition('proj-1', 'cond-1', actor, deps);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('removed');
        expect(result.data.id).toBe('cond-1');
      }
      expect(condDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'removed' })
      );
      expect(auditFn.calls[0].action).toBe('restrictive_condition_removed');
    });

    it('returns error if condition not found', async () => {
      const condDocRef = createMockDocRef(createMockDocSnapshot(false, 'cond-1'));
      const subColRef = createMockCollectionRef(condDocRef);
      const mainDocRef = createMockDocRef(
        createMockDocSnapshot(true, 'main', SAMPLE_PROPERTY_DATA)
      );
      const mainCol = createMockCollectionRef(mainDocRef);

      const db: FirestoreDB = {
        collection: vi.fn((path: string) => {
          if (path === 'projects/proj-1/townPlanning/property') {
            return mainCol;
          }
          if (path === 'projects/proj-1/townPlanning/property/main/restrictiveConditions') {
            return subColRef;
          }
          return createMockCollectionRef();
        }),
      };

      const actor: Actor = { id: 'user-1', role: 'town_planner' };
      const deps: PropertyDeps = { db, auditFn };

      const result = await removeRestrictiveCondition('proj-1', 'cond-1', actor, deps);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('not found');
      }
    });
  });

  // ─── addServitude ────────────────────────────────────────────────────────

  describe('addServitude', () => {
    it('adds a servitude to the sub-collection and records audit', async () => {
      const mainDocRef = createMockDocRef(
        createMockDocSnapshot(true, 'main', SAMPLE_PROPERTY_DATA)
      );
      const subColRef = createMockCollectionRef(undefined, 'serv-1');
      const mainCol = createMockCollectionRef(mainDocRef);

      const db: FirestoreDB = {
        collection: vi.fn((path: string) => {
          if (path === 'projects/proj-1/townPlanning/property') {
            return mainCol;
          }
          if (path === 'projects/proj-1/townPlanning/property/main/servitudes') {
            return subColRef;
          }
          return createMockCollectionRef();
        }),
      };

      const actor: Actor = { id: 'user-1', role: 'bep' };
      const deps: PropertyDeps = { db, auditFn };

      const result = await addServitude(
        'proj-1',
        {
          type: 'pipeline',
          width: 3,
          beneficiary: 'Rand Water',
          description: '3m pipeline servitude along northern boundary',
        },
        actor,
        deps
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('serv-1');
        expect(result.data.type).toBe('pipeline');
        expect(result.data.beneficiary).toBe('Rand Water');
      }
      expect(subColRef.add).toHaveBeenCalled();
      expect(auditFn.calls[0].action).toBe('servitude_added');
    });

    it('returns error if property does not exist', async () => {
      const mainDocRef = createMockDocRef(createMockDocSnapshot(false, 'main'));
      const mainCol = createMockCollectionRef(mainDocRef);
      const db = createMockDb({ 'projects/proj-1/townPlanning/property': mainCol });
      const actor: Actor = { id: 'user-1', role: 'town_planner' };
      const deps: PropertyDeps = { db, auditFn };

      const result = await addServitude(
        'proj-1',
        { type: 'power', description: 'Eskom servitude' },
        actor,
        deps
      );

      expect(result.success).toBe(false);
    });
  });

  // ─── linkSurveyor ───────────────────────────────────────────────────────

  describe('linkSurveyor', () => {
    it('updates surveyor fields and records audit', async () => {
      const docRef = createMockDocRef(
        createMockDocSnapshot(true, 'main', SAMPLE_PROPERTY_DATA)
      );
      const col = createMockCollectionRef(docRef);
      const db = createMockDb({ 'projects/proj-1/townPlanning/property': col });
      const actor: Actor = { id: 'user-1', role: 'land_surveyor' };
      const deps: PropertyDeps = { db, auditFn };

      const result = await linkSurveyor(
        'proj-1',
        'John Smith',
        'PLS-12345',
        actor,
        deps
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.surveyorName).toBe('John Smith');
        expect(result.data.surveyorPlatoNumber).toBe('PLS-12345');
      }
      expect(docRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          surveyorName: 'John Smith',
          surveyorPlatoNumber: 'PLS-12345',
        })
      );
      expect(auditFn.calls[0].action).toBe('surveyor_linked');
      expect(auditFn.calls[0].newValue).toEqual({
        surveyorName: 'John Smith',
        surveyorPlatoNumber: 'PLS-12345',
      });
    });

    it('returns error if property does not exist', async () => {
      const docRef = createMockDocRef(createMockDocSnapshot(false, 'main'));
      const col = createMockCollectionRef(docRef);
      const db = createMockDb({ 'projects/proj-1/townPlanning/property': col });
      const actor: Actor = { id: 'user-1', role: 'town_planner' };
      const deps: PropertyDeps = { db, auditFn };

      const result = await linkSurveyor('proj-1', 'John', 'PLS-1', actor, deps);

      expect(result.success).toBe(false);
    });
  });

  // ─── exposeZoningToComplianceHub ─────────────────────────────────────────

  describe('exposeZoningToComplianceHub', () => {
    it('reads zoning and passes to compliance hub callback', async () => {
      const docRef = createMockDocRef(
        createMockDocSnapshot(true, 'main', SAMPLE_PROPERTY_DATA)
      );
      const col = createMockCollectionRef(docRef);
      const db = createMockDb({ 'projects/proj-1/townPlanning/property': col });
      const complianceHubFn: ComplianceHubFn = vi.fn().mockResolvedValue(undefined);

      const result = await exposeZoningToComplianceHub('proj-1', db, complianceHubFn);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currentZoning).toBe('Residential 1');
      }
      expect(complianceHubFn).toHaveBeenCalledWith('proj-1', SAMPLE_ZONING);
    });

    it('returns error if property does not exist', async () => {
      const docRef = createMockDocRef(createMockDocSnapshot(false, 'main'));
      const col = createMockCollectionRef(docRef);
      const db = createMockDb({ 'projects/proj-1/townPlanning/property': col });
      const complianceHubFn: ComplianceHubFn = vi.fn().mockResolvedValue(undefined);

      const result = await exposeZoningToComplianceHub('proj-1', db, complianceHubFn);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('not found');
      }
      expect(complianceHubFn).not.toHaveBeenCalled();
    });
  });

  // ─── Role Enforcement ────────────────────────────────────────────────────

  describe('role enforcement', () => {
    const authorizedRoles: UserRole[] = [
      'town_planner',
      'land_surveyor',
      'architect',
      'bep',
      'admin',
      'platform_admin',
    ];

    const unauthorizedRoles: UserRole[] = [
      'client',
      'contractor',
      'subcontractor',
      'supplier',
      'engineer',
      'quantity_surveyor',
      'energy_professional',
      'fire_engineer',
      'site_manager',
      'developer',
      'freelancer',
      'firm_admin',
      'cpm',
    ];

    it.each(authorizedRoles)('allows %s to create property records', async (role) => {
      const docRef = createMockDocRef();
      const col = createMockCollectionRef(docRef);
      const db = createMockDb({ 'projects/proj-1/townPlanning/property': col });
      const actor: Actor = { id: 'user-1', role };
      const deps: PropertyDeps = { db, auditFn };

      const result = await createPropertyRecord('proj-1', SAMPLE_INPUT, actor, deps);

      expect(result.success).toBe(true);
    });

    it.each(unauthorizedRoles)('rejects %s from creating property records', async (role) => {
      const db = createMockDb();
      const actor: Actor = { id: 'user-1', role };
      const deps: PropertyDeps = { db, auditFn };

      const result = await createPropertyRecord('proj-1', SAMPLE_INPUT, actor, deps);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Unauthorized');
      }
    });

    it.each(unauthorizedRoles)('rejects %s from updating property fields', async (role) => {
      const db = createMockDb();
      const actor: Actor = { id: 'user-1', role };
      const deps: PropertyDeps = { db, auditFn };

      const result = await updatePropertyField('proj-1', 'erfNumber', 'X', actor, deps);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Unauthorized');
      }
    });

    it.each(unauthorizedRoles)('rejects %s from adding restrictive conditions', async (role) => {
      const db = createMockDb();
      const actor: Actor = { id: 'user-1', role };
      const deps: PropertyDeps = { db, auditFn };

      const result = await addRestrictiveCondition(
        'proj-1',
        { titleDeedReference: 'T1', conditionText: 'Test', status: 'active' },
        actor,
        deps
      );

      expect(result.success).toBe(false);
    });

    it.each(unauthorizedRoles)('rejects %s from adding servitudes', async (role) => {
      const db = createMockDb();
      const actor: Actor = { id: 'user-1', role };
      const deps: PropertyDeps = { db, auditFn };

      const result = await addServitude(
        'proj-1',
        { type: 'test', description: 'Test' },
        actor,
        deps
      );

      expect(result.success).toBe(false);
    });

    it.each(unauthorizedRoles)('rejects %s from linking surveyor', async (role) => {
      const db = createMockDb();
      const actor: Actor = { id: 'user-1', role };
      const deps: PropertyDeps = { db, auditFn };

      const result = await linkSurveyor('proj-1', 'Test', 'PLS-1', actor, deps);

      expect(result.success).toBe(false);
    });
  });
});
