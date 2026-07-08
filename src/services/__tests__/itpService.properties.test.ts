// @vitest-environment node
/**
 * Property-based tests — ITP Service core properties.
 *
 * Feature: qaqc-inspection-test-plans
 *
 * Property 1: ITP creation produces valid draft record
 *   Validates: Requirements 1.1, 1.2
 *   For any valid CreateITPInput (title ≤ 200 chars, description ≤ 2000 chars,
 *   valid construction stage), creating an ITP shall produce a record with
 *   status = 'draft', revisionNumber = 1, isDeleted = false, and all input
 *   fields correctly stored.
 *
 * Property 3: Revision creates incremented copy and supersedes original
 *   Validates: Requirements 1.7, 1.9
 *   For any approved ITP with revision number N containing M inspection items,
 *   creating a new revision shall produce a new ITP with revisionNumber = N + 1,
 *   status = 'draft', M copied inspection items with identical content, and the
 *   original ITP's status set to 'superseded'.
 *
 * Uses fast-check with minimum 100 iterations.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import * as firestore from 'firebase/firestore';
import { createITP, createRevision, ITPServiceError, type CreateITPInput } from '@/services/itpService';

import type {
  ITP,
  ITPStatus,
  ITPInspectionItem,
  InspectionType,
  InspectorRole,
  ConstructionStage,
  InspectionItemStatus,
} from '@/types';

const addDocMock = vi.mocked(firestore.addDoc) as any;

// ─── Constants ───────────────────────────────────────────────────────────────

const CONSTRUCTION_STAGES: ConstructionStage[] = [
  'site_establishment', 'earthworks', 'foundations', 'substructure',
  'superstructure', 'roof', 'external_envelope', 'internal_finishes',
  'mechanical_electrical', 'external_works', 'commissioning',
];

const INSPECTION_TYPES: InspectionType[] = ['hold_point', 'witness_point', 'surveillance'];
const INSPECTOR_ROLES: InspectorRole[] = ['engineer', 'architect', 'site_manager'];

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Arbitrary for revision number N (1-10). */
const arbRevisionNumber = fc.integer({ min: 1, max: 10 });

/** Arbitrary for item count M (0-10). */
const arbItemCount = fc.integer({ min: 0, max: 10 });

/** Arbitrary for a construction stage. */
const arbConstructionStage: fc.Arbitrary<ConstructionStage> = fc.constantFrom(...CONSTRUCTION_STAGES);

/** Arbitrary for an inspection type. */
const arbInspectionType: fc.Arbitrary<InspectionType> = fc.constantFrom(...INSPECTION_TYPES);

/** Arbitrary for an inspector role. */
const arbInspectorRole: fc.Arbitrary<InspectorRole> = fc.constantFrom(...INSPECTOR_ROLES);

/** Arbitrary for a spec reference that matches the valid pattern. */
const arbSpecReference = fc.constantFrom(
  'SANS 10400 clause 4.2.1',
  'NHBRC-REQ-001',
  'SPEC-ITEM-123',
);

/** Generate an inspection item with arbitrary content. */
function arbInspectionItem(itpId: string, projectId: string, seqNum: number): fc.Arbitrary<ITPInspectionItem> {
  return fc.record({
    id: fc.uuid(),
    itpId: fc.constant(itpId),
    projectId: fc.constant(projectId),
    sequenceNumber: fc.constant(seqNum),
    title: fc.string({ minLength: 1, maxLength: 200 }),
    description: fc.string({ minLength: 1, maxLength: 500 }),
    inspectionType: arbInspectionType,
    acceptanceCriteria: fc.string({ minLength: 1, maxLength: 500 }),
    responsibleInspectorRole: arbInspectorRole,
    specificationReference: arbSpecReference,
    specificationCategory: fc.option(fc.constantFrom('structural', 'fire_safety', 'geotechnical', 'general'), { nil: undefined }),
    linkedMaterialTestIds: fc.array(fc.uuid(), { minLength: 0, maxLength: 5 }),
    linkedSpecItemId: fc.option(fc.uuid(), { nil: undefined }),
    status: fc.constant('pending' as InspectionItemStatus),
    createdAt: fc.constant('2025-01-01T00:00:00.000Z'),
    updatedAt: fc.constant('2025-01-01T00:00:00.000Z'),
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Set up Firestore mocks for createRevision.
 * - getDoc: returns an approved ITP with revision N
 * - getDocs: returns M inspection items
 * - addDoc: captures created documents and returns mock refs
 * - updateDoc: captures updates to the original ITP
 */
function setupMocks(opts: {
  revisionNumber: number;
  items: ITPInspectionItem[];
  projectId: string;
  itpId: string;
  constructionStage: ConstructionStage;
}) {
  const { revisionNumber, items, projectId, itpId, constructionStage } = opts;

  const createdDocs: Array<{ data: Record<string, unknown> }> = [];
  const updatedDocs: Array<{ data: Record<string, unknown> }> = [];
  let addDocCallCount = 0;

  const mockItp: Omit<ITP, 'id'> = {
    projectId,
    title: `Test ITP Rev ${revisionNumber}`,
    description: 'Test description',
    constructionStage,
    revisionNumber,
    status: 'approved',
    createdBy: 'user-original',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z',
    isDeleted: false,
  };

  // Mock getDoc - returns the ITP
  vi.mocked(firestore.getDoc).mockResolvedValue({
    exists: () => true,
    id: itpId,
    data: () => mockItp,
    ref: { id: itpId },
  } as any);

  // Mock getDocs - returns the inspection items when queried
  vi.mocked(firestore.getDocs).mockResolvedValue({
    empty: items.length === 0,
    size: items.length,
    docs: items.map((item) => ({
      id: item.id,
      data: () => {
        const { id: _id, ...rest } = item;
        return rest;
      },
      ref: { id: item.id },
    })),
    forEach: vi.fn(),
  } as any);

  // Mock addDoc - captures created docs and returns incrementing IDs
  vi.mocked(firestore.addDoc).mockImplementation(async (_colRef: any, data: any) => {
    addDocCallCount++;
    const newId = `new-doc-${addDocCallCount}`;
    createdDocs.push({ data: { ...data } });
    return { id: newId } as any;
  });

  // Mock updateDoc - captures updates
  vi.mocked(firestore.updateDoc).mockImplementation(async (_docRef: any, data: any) => {
    updatedDocs.push({ data: { ...data } });
    return undefined;
  });

  return { createdDocs, updatedDocs, mockItp };
}

// ─── Property 1 Arbitraries ──────────────────────────────────────────────────

/**
 * Generate a valid ITP title (1–200 printable characters).
 * Uses character codes 33–126 to avoid whitespace-only strings.
 */
const arbTitle = fc
  .array(fc.integer({ min: 33, max: 126 }), { minLength: 1, maxLength: 200 })
  .map((codes) => codes.map((c) => String.fromCharCode(c)).join(''));

/**
 * Generate a valid ITP description (0–2000 printable characters).
 * Description can be empty per the schema (default is '').
 */
const arbDescription = fc
  .array(fc.integer({ min: 32, max: 126 }), { minLength: 0, maxLength: 200 })
  .map((codes) => codes.map((c) => String.fromCharCode(c)).join(''));

/**
 * Generate a valid project ID (non-empty lowercase alpha string).
 */
const arbProjectId = fc
  .array(fc.integer({ min: 97, max: 122 }), { minLength: 1, maxLength: 30 })
  .map((codes) => codes.map((c) => String.fromCharCode(c)).join(''));

/**
 * Generate a valid createdBy user ID (non-empty lowercase alpha string).
 */
const arbUserId = fc
  .array(fc.integer({ min: 97, max: 122 }), { minLength: 1, maxLength: 30 })
  .map((codes) => codes.map((c) => String.fromCharCode(c)).join(''));

/**
 * Generate a valid CreateITPInput combining all arbitraries.
 */
const arbCreateITPInput: fc.Arbitrary<CreateITPInput> = fc
  .tuple(arbProjectId, arbTitle, arbDescription, arbConstructionStage, arbUserId)
  .map(([projectId, title, description, constructionStage, createdBy]) => ({
    projectId,
    title,
    description,
    constructionStage,
    createdBy,
  }));

// ══════════════════════════════════════════════════════════════════════════════
// Property 1: ITP creation produces valid draft record
// Validates: Requirements 1.1, 1.2
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: qaqc-inspection-test-plans, Property 1: ITP creation produces valid draft record', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addDocMock.mockImplementation((_colRef: any, data: any) => {
      return Promise.resolve({ id: 'itp-mock-id' });
    });
  });

  /**
   * **Validates: Requirements 1.1, 1.2**
   */
  it('createITP returns a non-empty string ID for any valid input', async () => {
    await fc.assert(
      fc.asyncProperty(arbCreateITPInput, async (input) => {
        addDocMock.mockImplementation((_colRef: any, _data: any) =>
          Promise.resolve({ id: 'itp-gen-id' }),
        );
        const result = await createITP(input);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.1, 1.2**
   */
  it('createITP writes a record with status="draft" for any valid input', async () => {
    await fc.assert(
      fc.asyncProperty(arbCreateITPInput, async (input) => {
        const capturedCalls: Record<string, unknown>[] = [];
        addDocMock.mockImplementation((_colRef: any, data: any) => {
          capturedCalls.push({ ...data });
          return Promise.resolve({ id: `itp-${capturedCalls.length}` });
        });
        await createITP(input);
        // First addDoc call is the ITP record itself
        expect(capturedCalls.length).toBeGreaterThan(0);
        expect(capturedCalls[0].status).toBe('draft');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.1, 1.2**
   */
  it('createITP writes a record with revisionNumber=1 for any valid input', async () => {
    await fc.assert(
      fc.asyncProperty(arbCreateITPInput, async (input) => {
        const capturedCalls: Record<string, unknown>[] = [];
        addDocMock.mockImplementation((_colRef: any, data: any) => {
          capturedCalls.push({ ...data });
          return Promise.resolve({ id: `itp-${capturedCalls.length}` });
        });
        await createITP(input);
        expect(capturedCalls.length).toBeGreaterThan(0);
        expect(capturedCalls[0].revisionNumber).toBe(1);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.1, 1.2**
   */
  it('createITP writes a record with isDeleted=false for any valid input', async () => {
    await fc.assert(
      fc.asyncProperty(arbCreateITPInput, async (input) => {
        const capturedCalls: Record<string, unknown>[] = [];
        addDocMock.mockImplementation((_colRef: any, data: any) => {
          capturedCalls.push({ ...data });
          return Promise.resolve({ id: `itp-${capturedCalls.length}` });
        });
        await createITP(input);
        expect(capturedCalls.length).toBeGreaterThan(0);
        expect(capturedCalls[0].isDeleted).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.1, 1.2**
   */
  it('createITP correctly stores all input fields (projectId, title, constructionStage, createdBy)', async () => {
    await fc.assert(
      fc.asyncProperty(arbCreateITPInput, async (input) => {
        const capturedCalls: Record<string, unknown>[] = [];
        addDocMock.mockImplementation((_colRef: any, data: any) => {
          capturedCalls.push({ ...data });
          return Promise.resolve({ id: `itp-${capturedCalls.length}` });
        });
        await createITP(input);
        expect(capturedCalls.length).toBeGreaterThan(0);
        const itpData = capturedCalls[0];
        expect(itpData.projectId).toBe(input.projectId);
        expect(itpData.title).toBe(input.title);
        expect(itpData.constructionStage).toBe(input.constructionStage);
        expect(itpData.createdBy).toBe(input.createdBy);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.1, 1.2**
   */
  it('createITP correctly stores description (defaults to empty string if undefined)', async () => {
    await fc.assert(
      fc.asyncProperty(arbCreateITPInput, async (input) => {
        const capturedCalls: Record<string, unknown>[] = [];
        addDocMock.mockImplementation((_colRef: any, data: any) => {
          capturedCalls.push({ ...data });
          return Promise.resolve({ id: `itp-${capturedCalls.length}` });
        });
        await createITP(input);
        expect(capturedCalls.length).toBeGreaterThan(0);
        const expectedDesc = input.description ?? '';
        expect(capturedCalls[0].description).toBe(expectedDesc);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.1, 1.2**
   */
  it('createITP writes createdAt and updatedAt as valid ISO timestamps', async () => {
    await fc.assert(
      fc.asyncProperty(arbCreateITPInput, async (input) => {
        const capturedCalls: Record<string, unknown>[] = [];
        addDocMock.mockImplementation((_colRef: any, data: any) => {
          capturedCalls.push({ ...data });
          return Promise.resolve({ id: `itp-${capturedCalls.length}` });
        });
        await createITP(input);
        expect(capturedCalls.length).toBeGreaterThan(0);
        const createdAt = capturedCalls[0].createdAt as string;
        const updatedAt = capturedCalls[0].updatedAt as string;
        expect(new Date(createdAt).getTime()).not.toBeNaN();
        expect(new Date(updatedAt).getTime()).not.toBeNaN();
        // createdAt and updatedAt should be equal at creation time
        expect(createdAt).toBe(updatedAt);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.1, 1.2**
   */
  it('createITP associates the ITP with exactly one project and one construction stage', async () => {
    await fc.assert(
      fc.asyncProperty(arbCreateITPInput, async (input) => {
        const capturedCalls: Record<string, unknown>[] = [];
        addDocMock.mockImplementation((_colRef: any, data: any) => {
          capturedCalls.push({ ...data });
          return Promise.resolve({ id: `itp-${capturedCalls.length}` });
        });
        await createITP(input);
        expect(capturedCalls.length).toBeGreaterThan(0);
        const itpData = capturedCalls[0];
        expect(itpData.projectId).toBe(input.projectId);
        expect(typeof itpData.projectId).toBe('string');
        expect((itpData.projectId as string).length).toBeGreaterThan(0);
        expect(itpData.constructionStage).toBe(input.constructionStage);
        expect(CONSTRUCTION_STAGES).toContain(itpData.constructionStage);
      }),
      { numRuns: 100 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 3: Revision creates incremented copy and supersedes original
// Validates: Requirements 1.7, 1.9
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: qaqc-inspection-test-plans, Property 3: Revision creates incremented copy and supersedes original', () => {
  /**
   * **Validates: Requirements 1.7, 1.9**
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('new revision has revisionNumber = N + 1 and status = draft', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRevisionNumber,
        arbItemCount,
        arbConstructionStage,
        fc.uuid(), // projectId
        fc.uuid(), // itpId
        fc.uuid(), // userId
        async (N, M, stage, projectId, itpId, userId) => {
          vi.clearAllMocks();

          // Generate M items
          const items: ITPInspectionItem[] = [];
          for (let i = 0; i < M; i++) {
            const item = fc.sample(arbInspectionItem(itpId, projectId, i + 1), 1)[0];
            items.push(item);
          }

          const { createdDocs } = setupMocks({
            revisionNumber: N,
            items,
            projectId,
            itpId,
            constructionStage: stage,
          });

          await createRevision(projectId, itpId, userId);

          // First created doc is the new ITP
          const newItpData = createdDocs[0].data;
          expect(newItpData.revisionNumber).toBe(N + 1);
          expect(newItpData.status).toBe('draft');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('original ITP status is updated to superseded', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRevisionNumber,
        arbItemCount,
        arbConstructionStage,
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (N, M, stage, projectId, itpId, userId) => {
          vi.clearAllMocks();

          const items: ITPInspectionItem[] = [];
          for (let i = 0; i < M; i++) {
            const item = fc.sample(arbInspectionItem(itpId, projectId, i + 1), 1)[0];
            items.push(item);
          }

          const { updatedDocs } = setupMocks({
            revisionNumber: N,
            items,
            projectId,
            itpId,
            constructionStage: stage,
          });

          await createRevision(projectId, itpId, userId);

          // The first updateDoc call should set the original ITP to 'superseded'
          const supersededUpdate = updatedDocs[0];
          expect(supersededUpdate.data.status).toBe('superseded');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('M inspection items are copied to the new revision with identical content fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRevisionNumber,
        arbItemCount,
        arbConstructionStage,
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (N, M, stage, projectId, itpId, userId) => {
          vi.clearAllMocks();

          const items: ITPInspectionItem[] = [];
          for (let i = 0; i < M; i++) {
            const item = fc.sample(arbInspectionItem(itpId, projectId, i + 1), 1)[0];
            items.push(item);
          }

          const { createdDocs } = setupMocks({
            revisionNumber: N,
            items,
            projectId,
            itpId,
            constructionStage: stage,
          });

          await createRevision(projectId, itpId, userId);

          // First created doc is the new ITP, subsequent M docs are copied items
          // Total created docs = 1 (ITP) + M (items) + audit records (2)
          // But addDoc is called for: new ITP + M items + audit records
          // We need to check items: positions 1 through M
          const copiedItems = createdDocs.slice(1, 1 + M);
          expect(copiedItems.length).toBe(M);

          for (let i = 0; i < M; i++) {
            const original = items[i];
            const copied = copiedItems[i].data;

            // Content fields should be identical
            expect(copied.title).toBe(original.title);
            expect(copied.description).toBe(original.description);
            expect(copied.inspectionType).toBe(original.inspectionType);
            expect(copied.acceptanceCriteria).toBe(original.acceptanceCriteria);
            expect(copied.responsibleInspectorRole).toBe(original.responsibleInspectorRole);
            expect(copied.specificationReference).toBe(original.specificationReference);
            expect(copied.sequenceNumber).toBe(original.sequenceNumber);
            expect(copied.linkedMaterialTestIds).toEqual(original.linkedMaterialTestIds);

            // Status should be reset to 'pending'
            expect(copied.status).toBe('pending');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects revision creation from non-approved ITP statuses', async () => {
    const nonApprovedStatuses: ITPStatus[] = ['draft', 'completed', 'superseded', 'deleted'];

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...nonApprovedStatuses),
        arbRevisionNumber,
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (status, N, projectId, itpId, userId) => {
          vi.clearAllMocks();

          const mockItp: Omit<ITP, 'id'> = {
            projectId,
            title: 'Test ITP',
            description: 'Test',
            constructionStage: 'foundations',
            revisionNumber: N,
            status,
            createdBy: 'user-original',
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-15T00:00:00.000Z',
            isDeleted: false,
          };

          vi.mocked(firestore.getDoc).mockResolvedValue({
            exists: () => true,
            id: itpId,
            data: () => mockItp,
            ref: { id: itpId },
          } as any);

          await expect(createRevision(projectId, itpId, userId))
            .rejects.toThrow(ITPServiceError);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('new revision preserves the original ITP metadata (title, description, constructionStage)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRevisionNumber,
        arbItemCount,
        arbConstructionStage,
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (N, M, stage, projectId, itpId, userId) => {
          vi.clearAllMocks();

          const items: ITPInspectionItem[] = [];
          for (let i = 0; i < M; i++) {
            const item = fc.sample(arbInspectionItem(itpId, projectId, i + 1), 1)[0];
            items.push(item);
          }

          const { createdDocs, mockItp } = setupMocks({
            revisionNumber: N,
            items,
            projectId,
            itpId,
            constructionStage: stage,
          });

          await createRevision(projectId, itpId, userId);

          const newItpData = createdDocs[0].data;
          expect(newItpData.title).toBe(mockItp.title);
          expect(newItpData.description).toBe(mockItp.description);
          expect(newItpData.constructionStage).toBe(mockItp.constructionStage);
          expect(newItpData.projectId).toBe(projectId);
          expect(newItpData.previousRevisionId).toBe(itpId);
          expect(newItpData.isDeleted).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
