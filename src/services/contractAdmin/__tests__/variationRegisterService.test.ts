/**
 * Unit tests for Variation Register Service
 *
 * Tests: full variation lifecycle, rejection path, invalid transitions,
 * valuation recording, cumulative summary with mixed additions/omissions.
 *
 * Requirements: 5.1–5.9
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ══════════════════════════════════════════════════════════════════════════════
// Mocks
// ══════════════════════════════════════════════════════════════════════════════

// In-memory Firestore mock store
const mockData: Record<string, any> = {};

vi.mock('@/lib/firebase-admin', () => {
  return {
    adminDb: {
      collection: vi.fn((path: string) => ({
        doc: vi.fn((id: string) => ({
          set: vi.fn(async (data: any) => {
            mockData[`${path}/${id}`] = { ...data };
          }),
          get: vi.fn(async () => {
            const d = mockData[`${path}/${id}`];
            return { exists: !!d, data: () => (d ? { ...d } : undefined) };
          }),
          update: vi.fn(async (data: any) => {
            if (mockData[`${path}/${id}`]) {
              Object.assign(mockData[`${path}/${id}`], data);
            }
          }),
        })),
        where: vi.fn((_field: string, _op: string, value: string) => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => {
              // Search mock data for a matching variation number in this collection
              const matches = Object.entries(mockData)
                .filter(([key, doc]) => key.startsWith(path) && doc.variationNumber === value);
              return {
                empty: matches.length === 0,
                docs: matches.map(([, doc]) => ({ data: () => ({ ...doc }) })),
              };
            }),
          })),
          get: vi.fn(async () => {
            const matches = Object.entries(mockData)
              .filter(([key, doc]) => key.startsWith(path) && doc.variationNumber === value);
            return {
              empty: matches.length === 0,
              docs: matches.map(([, doc]) => ({ data: () => ({ ...doc }) })),
            };
          }),
        })),
        get: vi.fn(async () => {
          // Return all docs in this collection path
          const docs = Object.entries(mockData)
            .filter(([key]) => key.startsWith(path + '/') && key.split('/').length === path.split('/').length + 1)
            .map(([, doc]) => ({ data: () => ({ ...doc }) }));
          return { docs, size: docs.length };
        }),
      })),
    },
  };
});

// Mock RBAC service — assertAccess is a no-op for unit tests
vi.mock('../contractRbacService', () => ({
  assertAccess: vi.fn(),
}));

// Mock Integration service — avoid real Firestore writes and retry backoff in tests
vi.mock('../contractIntegrationService', () => ({
  writeToAuditTrail: vi.fn(async () => ({ success: true, targetModule: 'AuditTrail', retryCount: 0 })),
  surfaceToActionCentre: vi.fn(async () => ({ success: true, targetModule: 'ActionCentre', retryCount: 0 })),
  writeToSpecForge: vi.fn(async () => ({ success: true, targetModule: 'SpecForge', retryCount: 0 })),
  createRiskEvent: vi.fn(async () => ({ success: true, targetModule: 'RiskEngine', retryCount: 0 })),
  writeToProjectPassport: vi.fn(async () => ({ success: true, targetModule: 'ProjectPassport', retryCount: 0 })),
  retryWithBackoff: vi.fn(async (fn: () => Promise<any>) => fn()),
}));

import {
  createVariation,
  isValidVariationTransition,
  transitionVariation,
  valueVariation,
  getCumulativeSummary,
} from '../variationRegisterService';
import type {
  VariationInput,
  VariationStatus,
  ContractProjectAssignment,
} from '../contractTypes';

// ══════════════════════════════════════════════════════════════════════════════
// Test Helpers
// ══════════════════════════════════════════════════════════════════════════════

/** Minimal project assignment for RBAC (passes because assertAccess is mocked) */
const mockProjectAssignment: ContractProjectAssignment = {
  projectId: 'proj-1',
  userId: 'user-qs',
  roles: ['quantity_surveyor'],
  isAssignedTeamMember: true,
  isAssignedContractor: false,
  isAssignedSubcontractor: false,
  isProjectOwner: false,
  isAssignedSiteManager: false,
};

/** Valid variation input factory */
function validVariationInput(overrides?: Partial<VariationInput>): VariationInput {
  return {
    projectId: 'proj-1',
    variationNumber: 'VO-001',
    description: 'Additional brickwork to boundary wall per revised drawings',
    originatingInstruction: 'SI-2025-014',
    dateInstructed: '2025-06-10',
    linkedSiteInstructionId: 'si-014',
    createdBy: 'user-qs',
    ...overrides,
  };
}

/** Seed a variation record directly into mock Firestore */
function seedVariation(projectId: string, variationId: string, data: any): void {
  mockData[`projects/${projectId}/contractVariations/${variationId}`] = data;
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

beforeEach(() => {
  // Clear all stored mock data between tests
  for (const key of Object.keys(mockData)) {
    delete mockData[key];
  }
});

describe('variationRegisterService', () => {
  // ────────────────────────────────────────────────────────────────────────
  // createVariation
  // ────────────────────────────────────────────────────────────────────────

  describe('createVariation', () => {
    it('creates a variation in instructed status with valid input', async () => {
      const input = validVariationInput();
      const result = await createVariation(input, mockProjectAssignment);

      expect(result.variation).toBeDefined();
      expect(result.variation.status).toBe('instructed');
      expect(result.variation.projectId).toBe('proj-1');
      expect(result.variation.variationNumber).toBe('VO-001');
      expect(result.variation.description).toBe('Additional brickwork to boundary wall per revised drawings');
      expect(result.variation.originatingInstruction).toBe('SI-2025-014');
      expect(result.variation.dateInstructed).toBe('2025-06-10');
      expect(result.variation.linkedSiteInstructionId).toBe('si-014');
      expect(result.variation.createdBy).toBe('user-qs');
      expect(result.variation.id).toBeDefined();
      expect(result.variation.createdAt).toBeDefined();
      expect(result.variation.updatedAt).toBeDefined();

      // Should have created an audit record
      expect(result.auditRecord).toBeDefined();
      expect(result.auditRecord.entityType).toBe('variation');
      expect(result.auditRecord.action).toBe('variation_created');
      expect(result.auditRecord.actorId).toBe('user-qs');
    });

    it('rejects missing mandatory fields (variationNumber, description, dateInstructed)', async () => {
      // Missing variationNumber
      const inputNoNumber = validVariationInput({ variationNumber: '' });
      await expect(createVariation(inputNoNumber, mockProjectAssignment)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { invalidFields: expect.arrayContaining(['variationNumber']) },
      });

      // Missing description
      const inputNoDesc = validVariationInput({ description: '' });
      await expect(createVariation(inputNoDesc, mockProjectAssignment)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { invalidFields: expect.arrayContaining(['description']) },
      });

      // Missing dateInstructed
      const inputNoDate = validVariationInput({ dateInstructed: '' });
      await expect(createVariation(inputNoDate, mockProjectAssignment)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { invalidFields: expect.arrayContaining(['dateInstructed']) },
      });
    });

    it('rejects duplicate variation number within a project', async () => {
      // Seed an existing variation with the same number
      seedVariation('proj-1', 'existing-var-id', {
        id: 'existing-var-id',
        projectId: 'proj-1',
        variationNumber: 'VO-001',
        description: 'Existing variation',
        status: 'instructed',
        createdBy: 'user-qs',
      });

      const input = validVariationInput({ variationNumber: 'VO-001' });
      await expect(createVariation(input, mockProjectAssignment)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('VO-001'),
        details: { invalidFields: expect.arrayContaining(['variationNumber']) },
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // isValidVariationTransition
  // ────────────────────────────────────────────────────────────────────────

  describe('isValidVariationTransition', () => {
    it('returns true for all valid transitions', () => {
      const validTransitions: [VariationStatus, VariationStatus][] = [
        ['instructed', 'valued'],
        ['valued', 'approved'],
        ['valued', 'rejected'],
        ['approved', 'implemented'],
      ];

      for (const [from, to] of validTransitions) {
        expect(isValidVariationTransition(from, to)).toBe(true);
      }
    });

    it('returns false for invalid transitions', () => {
      const invalidTransitions: [VariationStatus, VariationStatus][] = [
        ['instructed', 'approved'],
        ['instructed', 'rejected'],
        ['instructed', 'implemented'],
        ['valued', 'instructed'],
        ['valued', 'implemented'],
        ['approved', 'instructed'],
        ['approved', 'valued'],
        ['approved', 'rejected'],
        ['rejected', 'instructed'],
        ['rejected', 'valued'],
        ['rejected', 'approved'],
        ['rejected', 'implemented'],
        ['implemented', 'instructed'],
        ['implemented', 'valued'],
        ['implemented', 'approved'],
        ['implemented', 'rejected'],
      ];

      for (const [from, to] of invalidTransitions) {
        expect(isValidVariationTransition(from, to)).toBe(false);
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // transitionVariation
  // ────────────────────────────────────────────────────────────────────────

  describe('transitionVariation', () => {
    it('valued → approved succeeds', async () => {
      seedVariation('proj-1', 'var-1', {
        id: 'var-1',
        projectId: 'proj-1',
        variationNumber: 'VO-002',
        status: 'valued',
        createdBy: 'user-qs',
        createdAt: '2025-06-10T00:00:00.000Z',
        updatedAt: '2025-06-10T00:00:00.000Z',
      });

      const result = await transitionVariation(
        'proj-1',
        'var-1',
        'approved',
        'user-pa',
        mockProjectAssignment
      );

      expect(result.auditRecord).toBeDefined();
      expect(result.auditRecord.action).toBe('variation_transitioned_to_approved');
      expect(result.auditRecord.previousValue).toEqual({ status: 'valued' });
      expect(result.auditRecord.newValue).toEqual({ status: 'approved' });
      expect(result.auditRecord.actorId).toBe('user-pa');

      // Verify Firestore was updated
      const updatedVariation = mockData['projects/proj-1/contractVariations/var-1'];
      expect(updatedVariation.status).toBe('approved');
    });

    it('instructed → approved fails (INVALID_TRANSITION)', async () => {
      seedVariation('proj-1', 'var-2', {
        id: 'var-2',
        projectId: 'proj-1',
        variationNumber: 'VO-003',
        status: 'instructed',
        createdBy: 'user-qs',
        createdAt: '2025-06-10T00:00:00.000Z',
        updatedAt: '2025-06-10T00:00:00.000Z',
      });

      await expect(
        transitionVariation('proj-1', 'var-2', 'approved', 'user-pa', mockProjectAssignment)
      ).rejects.toMatchObject({
        code: 'INVALID_TRANSITION',
        message: expect.stringContaining('instructed'),
        details: {
          currentStatus: 'instructed',
          attemptedStatus: 'approved',
          permittedTransitions: ['valued'],
        },
      });

      // Status should remain unchanged
      const unchangedVariation = mockData['projects/proj-1/contractVariations/var-2'];
      expect(unchangedVariation.status).toBe('instructed');
    });

    it('full lifecycle: instructed → valued → approved → implemented', async () => {
      // Create a variation
      const input = validVariationInput({ variationNumber: 'VO-LIFECYCLE' });
      const { variation } = await createVariation(input, mockProjectAssignment);
      expect(variation.status).toBe('instructed');

      // Value the variation (transitions to 'valued')
      await valueVariation(
        'proj-1',
        variation.id,
        { type: 'addition', amount: 150000 },
        10,
        'user-qs',
        mockProjectAssignment
      );
      const valued = mockData[`projects/proj-1/contractVariations/${variation.id}`];
      expect(valued.status).toBe('valued');

      // Transition to approved
      await transitionVariation('proj-1', variation.id, 'approved', 'user-pa', mockProjectAssignment);
      const approved = mockData[`projects/proj-1/contractVariations/${variation.id}`];
      expect(approved.status).toBe('approved');

      // Transition to implemented
      await transitionVariation('proj-1', variation.id, 'implemented', 'user-sm', mockProjectAssignment);
      const implemented = mockData[`projects/proj-1/contractVariations/${variation.id}`];
      expect(implemented.status).toBe('implemented');
    });

    it('rejection path: valued → rejected', async () => {
      seedVariation('proj-1', 'var-reject', {
        id: 'var-reject',
        projectId: 'proj-1',
        variationNumber: 'VO-REJECT',
        status: 'valued',
        createdBy: 'user-qs',
        createdAt: '2025-06-10T00:00:00.000Z',
        updatedAt: '2025-06-10T00:00:00.000Z',
      });

      const result = await transitionVariation(
        'proj-1',
        'var-reject',
        'rejected',
        'user-pa',
        mockProjectAssignment
      );

      expect(result.auditRecord.action).toBe('variation_transitioned_to_rejected');
      expect(result.auditRecord.previousValue).toEqual({ status: 'valued' });
      expect(result.auditRecord.newValue).toEqual({ status: 'rejected' });

      const rejectedVariation = mockData['projects/proj-1/contractVariations/var-reject'];
      expect(rejectedVariation.status).toBe('rejected');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // valueVariation
  // ────────────────────────────────────────────────────────────────────────

  describe('valueVariation', () => {
    it('records cost and time impact, transitions to valued', async () => {
      seedVariation('proj-1', 'var-val', {
        id: 'var-val',
        projectId: 'proj-1',
        variationNumber: 'VO-VAL',
        status: 'instructed',
        createdBy: 'user-qs',
        createdAt: '2025-06-10T00:00:00.000Z',
        updatedAt: '2025-06-10T00:00:00.000Z',
      });

      const result = await valueVariation(
        'proj-1',
        'var-val',
        { type: 'addition', amount: 250000 },
        15,
        'user-qs',
        mockProjectAssignment
      );

      expect(result.auditRecord).toBeDefined();
      expect(result.auditRecord.action).toBe('variation_valued');
      expect(result.auditRecord.newValue).toMatchObject({
        status: 'valued',
        costImpact: { type: 'addition', amount: 250000 },
        timeImpactDays: 15,
      });

      // Verify Firestore was updated
      const updatedVariation = mockData['projects/proj-1/contractVariations/var-val'];
      expect(updatedVariation.status).toBe('valued');
      expect(updatedVariation.costImpact).toEqual({ type: 'addition', amount: 250000 });
      expect(updatedVariation.timeImpactDays).toBe(15);
    });

    it('rejects valuation when not in instructed status', async () => {
      seedVariation('proj-1', 'var-wrong-status', {
        id: 'var-wrong-status',
        projectId: 'proj-1',
        variationNumber: 'VO-WS',
        status: 'valued', // already valued
        createdBy: 'user-qs',
        createdAt: '2025-06-10T00:00:00.000Z',
        updatedAt: '2025-06-10T00:00:00.000Z',
      });

      await expect(
        valueVariation(
          'proj-1',
          'var-wrong-status',
          { type: 'addition', amount: 100000 },
          5,
          'user-qs',
          mockProjectAssignment
        )
      ).rejects.toMatchObject({
        code: 'INVALID_TRANSITION',
        message: expect.stringContaining('valued'),
        details: {
          currentStatus: 'valued',
          attemptedStatus: 'valued',
        },
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // getCumulativeSummary
  // ────────────────────────────────────────────────────────────────────────

  describe('getCumulativeSummary', () => {
    it('computes correct totals with mixed additions and omissions', async () => {
      // Seed multiple variations with different cost impacts
      seedVariation('proj-1', 'var-a1', {
        id: 'var-a1',
        projectId: 'proj-1',
        variationNumber: 'VO-A1',
        status: 'approved',
        costImpact: { type: 'addition', amount: 150000 },
        timeImpactDays: 10,
      });

      seedVariation('proj-1', 'var-a2', {
        id: 'var-a2',
        projectId: 'proj-1',
        variationNumber: 'VO-A2',
        status: 'valued',
        costImpact: { type: 'addition', amount: 75000 },
        timeImpactDays: 5,
      });

      seedVariation('proj-1', 'var-o1', {
        id: 'var-o1',
        projectId: 'proj-1',
        variationNumber: 'VO-O1',
        status: 'approved',
        costImpact: { type: 'omission', amount: 50000 },
        timeImpactDays: 0,
      });

      seedVariation('proj-1', 'var-o2', {
        id: 'var-o2',
        projectId: 'proj-1',
        variationNumber: 'VO-O2',
        status: 'implemented',
        costImpact: { type: 'omission', amount: 30000 },
        timeImpactDays: 3,
      });

      // One variation without cost impact yet (instructed, no valuation)
      seedVariation('proj-1', 'var-nc', {
        id: 'var-nc',
        projectId: 'proj-1',
        variationNumber: 'VO-NC',
        status: 'instructed',
      });

      const summary = await getCumulativeSummary('proj-1');

      expect(summary.totalVariations).toBe(5);
      expect(summary.totalAdditions).toBe(225000); // 150000 + 75000
      expect(summary.totalOmissions).toBe(80000);  // 50000 + 30000
      expect(summary.netCostDelta).toBe(145000);   // 225000 - 80000
      expect(summary.totalTimeImpactDays).toBe(18); // 10 + 5 + 0 + 3
    });
  });
});
