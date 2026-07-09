// @vitest-environment node
/**
 * Property-based tests — ProvenanceService correctness.
 *
 * Feature: ai-copilot-workspace
 *
 * Property 9: Provenance Record Creation Invariant
 *   Validates: Requirements 5.1, 5.3
 *
 * Property 10: Provenance Failure Blocks Record Insertion
 *   Validates: Requirements 5.3
 *
 * Property 11: Provenance Immutability
 *   Validates: Requirements 5.7
 *
 * Property 12: Provenance Override Structure
 *   Validates: Requirements 5.8
 *
 * Uses fast-check with minimum 100 iterations per property test.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import type { CopilotCapability, CopilotSource } from '@/services/copilotTypes';
import type { UserRole } from '@/types';

// ─── Mock setup ─────────────────────────────────────────────────────────────────

// Use vi.hoisted to create mocks that are accessible in both the mock factory and tests
const { mockSet, mockUpdate, mockGet, mockDocId } = vi.hoisted(() => ({
  mockSet: vi.fn().mockResolvedValue(undefined),
  mockUpdate: vi.fn().mockResolvedValue(undefined),
  mockGet: vi.fn().mockResolvedValue({ exists: true, data: () => ({ targetRecordId: null }) }),
  mockDocId: 'mock-generated-id-001',
}));

vi.mock('@/lib/firebase-admin', () => {
  // Build mock structure matching the service's usage patterns:
  // 1. createProvenanceRecord: adminDb.collection(path).doc() → { id, set }
  // 2. attachProvenanceToRecord: adminDb.doc(path) → { get, update }
  // 3. createOverride: adminDb.doc(path) → { get, collection('overrides').doc() → { id, set } }
  const mockOverrideDocRef = { id: mockDocId, set: mockSet };
  const mockOverridesCollection = { doc: () => mockOverrideDocRef };
  const mockDocRefForDoc = {
    id: mockDocId,
    set: mockSet,
    update: mockUpdate,
    get: mockGet,
    collection: () => mockOverridesCollection,
  };
  const mockCollectionDocRef = { id: mockDocId, set: mockSet };
  const mockCollectionRef = { doc: () => mockCollectionDocRef };

  return {
    adminDb: {
      collection: () => mockCollectionRef,
      doc: () => mockDocRefForDoc,
    },
  };
});

// ─── Import service functions after mock setup ──────────────────────────────────

import {
  createProvenanceRecord,
  attachProvenanceToRecord,
  createOverride,
  updateProvenanceRecord,
  deleteProvenanceRecord,
} from '@/services/provenanceService';

// ─── Constants ──────────────────────────────────────────────────────────────────

const ALL_CAPABILITIES: CopilotCapability[] = [
  'draft_rfi', 'summarise_status', 'flag_compliance', 'generate_narrative',
  'explain_clause', 'draft_site_instruction', 'summarise_financials', 'flag_risk',
];

const PROFESSIONAL_ROLES: UserRole[] = [
  'client', 'architect', 'freelancer', 'bep', 'contractor', 'subcontractor',
  'supplier', 'engineer', 'quantity_surveyor', 'town_planner',
  'energy_professional', 'fire_engineer', 'site_manager', 'developer',
  'firm_admin', 'land_surveyor', 'health_safety',
];

// ─── Arbitraries ────────────────────────────────────────────────────────────────

/** Generate a valid modelId (1–128 printable ASCII chars, non-empty). */
const arbModelId = fc.array(
  fc.integer({ min: 33, max: 126 }), { minLength: 1, maxLength: 128 },
).map((codes) => codes.map((c) => String.fromCharCode(c)).join(''));

/** Generate a valid ISO 8601 timestamp. */
const arbISOTimestamp = fc.integer({
  min: new Date('2020-01-01T00:00:00Z').getTime(),
  max: new Date('2030-12-31T23:59:59Z').getTime(),
}).map((ms) => new Date(ms).toISOString());

/** Generate a valid UID (non-empty printable string). */
const arbUid = fc.array(
  fc.integer({ min: 33, max: 126 }), { minLength: 1, maxLength: 64 },
).map((codes) => codes.map((c) => String.fromCharCode(c)).join(''));

/** Generate a valid source. */
const arbSource: fc.Arbitrary<CopilotSource> = fc.constantFrom('internal', 'external');

/** Generate a valid capability or null. */
const arbCapabilityOrNull: fc.Arbitrary<CopilotCapability | null> = fc.oneof(
  fc.constantFrom(...ALL_CAPABILITIES), fc.constant(null),
);

/** Generate a valid confidence value (0.00–1.00) or null. */
const arbConfidenceOrNull: fc.Arbitrary<number | null> = fc.oneof(
  fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }), fc.constant(null),
);

/** Generate a valid project ID. */
const arbProjectId = fc.array(
  fc.integer({ min: 33, max: 126 }), { minLength: 1, maxLength: 64 },
).map((codes) => codes.map((c) => String.fromCharCode(c)).join(''));

/** Generate a valid CreateProvenanceParams object. */
const arbCreateProvenanceParams = fc.record({
  projectId: arbProjectId,
  threadId: arbUid,
  messageId: arbUid,
  modelId: arbModelId,
  generatedAt: arbISOTimestamp,
  acceptedBy: arbUid,
  acceptedAt: arbISOTimestamp,
  source: arbSource,
  capability: arbCapabilityOrNull,
  confidence: arbConfidenceOrNull,
});

/** Generate a professional role. */
const arbProfessionalRole: fc.Arbitrary<UserRole> = fc.constantFrom(...PROFESSIONAL_ROLES);

/** Generate a valid declaration (≥20 printable chars, no whitespace-only). */
const arbValidDeclaration = fc.array(
  fc.integer({ min: 33, max: 126 }), { minLength: 20, maxLength: 200 },
).map((codes) => codes.map((c) => String.fromCharCode(c)).join(''));

/** Generate an invalid declaration (<20 chars, at least 1 char to avoid empty). */
const arbInvalidDeclaration = fc.array(
  fc.integer({ min: 33, max: 126 }), { minLength: 1, maxLength: 19 },
).map((codes) => codes.map((c) => String.fromCharCode(c)).join(''));

// ─── Test Setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockSet.mockClear().mockResolvedValue(undefined);
  mockUpdate.mockClear().mockResolvedValue(undefined);
  mockGet.mockClear().mockResolvedValue({ exists: true, data: () => ({ targetRecordId: null }) });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 9: Provenance Record Creation Invariant
// Validates: Requirements 5.1, 5.3
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: ai-copilot-workspace, Property 9: Provenance Record Creation Invariant', () => {
  /**
   * **Validates: Requirements 5.1**
   *
   * For any AI_Output generated by the CopilotService, a ProvenanceRecord must be
   * created containing all required fields: modelId (≤128 chars), generatedAt (ISO 8601),
   * acceptedBy (UID), acceptedAt (ISO 8601), source ('internal'), capability
   * (CopilotCapability or null), and confidence (0.00–1.00 or null).
   */

  it('creates a record with all required fields for any valid input params', () => {
    fc.assert(
      fc.asyncProperty(arbCreateProvenanceParams, async (params) => {
        const record = await createProvenanceRecord(params);

        expect(record.id).toBeDefined();
        expect(typeof record.id).toBe('string');
        expect(record.modelId).toBe(params.modelId);
        expect(record.modelId.length).toBeLessThanOrEqual(128);
        expect(record.generatedAt).toBe(params.generatedAt);
        expect(isNaN(Date.parse(record.generatedAt))).toBe(false);
        expect(record.acceptedBy).toBe(params.acceptedBy);
        expect(record.acceptedAt).toBe(params.acceptedAt);
        expect(isNaN(Date.parse(record.acceptedAt))).toBe(false);
        expect(record.source).toBe(params.source);
        expect(['internal', 'external']).toContain(record.source);
        expect(record.capability).toBe(params.capability);
        if (record.capability !== null) {
          expect(ALL_CAPABILITIES).toContain(record.capability);
        }
        expect(record.confidence).toBe(params.confidence);
        if (record.confidence !== null) {
          expect(record.confidence).toBeGreaterThanOrEqual(0);
          expect(record.confidence).toBeLessThanOrEqual(1);
        }
        expect(record.targetRecordId).toBeNull();
        expect(record.targetRecordType).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('persists the record to Firestore on every creation', () => {
    fc.assert(
      fc.asyncProperty(arbCreateProvenanceParams, async (params) => {
        const callsBefore = mockSet.mock.calls.length;
        await createProvenanceRecord(params);
        expect(mockSet.mock.calls.length).toBeGreaterThan(callsBefore);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects modelId longer than 128 characters', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 33, max: 126 }), { minLength: 129, maxLength: 200 })
          .map((codes) => codes.map((c) => String.fromCharCode(c)).join('')),
        async (longModelId) => {
          await expect(createProvenanceRecord({
            projectId: 'test-project', threadId: 'thread-1', messageId: 'msg-1',
            modelId: longModelId, generatedAt: '2025-01-15T10:00:00.000Z',
            acceptedBy: 'user-123', acceptedAt: '2025-01-15T10:00:01.000Z',
            source: 'internal', capability: null, confidence: null,
          })).rejects.toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects invalid confidence values outside 0.00–1.00', () => {
    fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.double({ min: 1.01, max: 100, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: -100, max: -0.01, noNaN: true, noDefaultInfinity: true }),
        ),
        async (invalidConfidence) => {
          await expect(createProvenanceRecord({
            projectId: 'test-project', threadId: 'thread-1', messageId: 'msg-1',
            modelId: 'gemini-1.5-pro', generatedAt: '2025-01-15T10:00:00.000Z',
            acceptedBy: 'user-123', acceptedAt: '2025-01-15T10:00:01.000Z',
            source: 'internal', capability: null, confidence: invalidConfidence,
          })).rejects.toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects invalid source values', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 97, max: 122 }), { minLength: 1, maxLength: 20 })
          .map((codes) => codes.map((c) => String.fromCharCode(c)).join(''))
          .filter((s) => s !== 'internal' && s !== 'external'),
        async (invalidSource) => {
          await expect(createProvenanceRecord({
            projectId: 'test-project', threadId: 'thread-1', messageId: 'msg-1',
            modelId: 'gemini-1.5-pro', generatedAt: '2025-01-15T10:00:00.000Z',
            acceptedBy: 'user-123', acceptedAt: '2025-01-15T10:00:01.000Z',
            source: invalidSource as CopilotSource, capability: null, confidence: null,
          })).rejects.toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects invalid ISO 8601 timestamps for generatedAt', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 32, max: 126 }), { minLength: 1, maxLength: 30 })
          .map((codes) => codes.map((c) => String.fromCharCode(c)).join(''))
          .filter((s) => isNaN(Date.parse(s))),
        async (invalidTimestamp) => {
          await expect(createProvenanceRecord({
            projectId: 'test-project', threadId: 'thread-1', messageId: 'msg-1',
            modelId: 'gemini-1.5-pro', generatedAt: invalidTimestamp,
            acceptedBy: 'user-123', acceptedAt: '2025-01-15T10:00:01.000Z',
            source: 'internal', capability: null, confidence: null,
          })).rejects.toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 10: Provenance Failure Blocks Record Insertion
// Validates: Requirements 5.3
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: ai-copilot-workspace, Property 10: Provenance Failure Blocks Record Insertion', () => {
  /**
   * **Validates: Requirements 5.3**
   *
   * For any attempt to insert AI-generated content into a project record, if the
   * ProvenanceService fails to create or attach a ProvenanceRecord, the content must
   * NOT be inserted into the target record and an error must be returned to the user.
   */

  it('blocks record insertion when provenance record does not exist', () => {
    fc.assert(
      fc.asyncProperty(arbUid, arbProjectId, arbUid, arbUid,
        async (provenanceId, projectId, targetRecordId, targetRecordType) => {
          mockGet.mockResolvedValue({ exists: false });
          mockUpdate.mockClear();

          await expect(
            attachProvenanceToRecord(provenanceId, projectId, targetRecordId, targetRecordType),
          ).rejects.toThrow();

          expect(mockUpdate).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('blocks record insertion when Firestore write fails during attachment', () => {
    fc.assert(
      fc.asyncProperty(arbUid, arbProjectId, arbUid, arbUid,
        async (provenanceId, projectId, targetRecordId, targetRecordType) => {
          mockGet.mockResolvedValue({ exists: true, data: () => ({ targetRecordId: null }) });
          mockUpdate.mockRejectedValue(new Error('Firestore write failure'));

          await expect(
            attachProvenanceToRecord(provenanceId, projectId, targetRecordId, targetRecordType),
          ).rejects.toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns an error when provenance does not exist — never silently succeeds', () => {
    fc.assert(
      fc.asyncProperty(arbUid, arbProjectId, arbUid, arbUid,
        async (provenanceId, projectId, targetRecordId, targetRecordType) => {
          mockGet.mockResolvedValue({ exists: false });

          await expect(
            attachProvenanceToRecord(provenanceId, projectId, targetRecordId, targetRecordType),
          ).rejects.toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('blocks re-attachment when provenance is already attached to another record', () => {
    fc.assert(
      fc.asyncProperty(arbUid, arbProjectId, arbUid, arbUid, arbUid,
        async (provenanceId, projectId, targetRecordId, targetRecordType, existingTargetId) => {
          mockGet.mockResolvedValue({
            exists: true,
            data: () => ({ targetRecordId: existingTargetId }),
          });
          mockUpdate.mockClear();

          await expect(
            attachProvenanceToRecord(provenanceId, projectId, targetRecordId, targetRecordType),
          ).rejects.toThrow();

          expect(mockUpdate).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 11: Provenance Immutability
// Validates: Requirements 5.7
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: ai-copilot-workspace, Property 11: Provenance Immutability', () => {
  /**
   * **Validates: Requirements 5.7**
   *
   * For any existing ProvenanceRecord, all update and delete operations must be
   * rejected. The record must remain unchanged from its creation state indefinitely.
   */

  it('updateProvenanceRecord always throws regardless of context', () => {
    fc.assert(
      fc.property(fc.anything(), () => {
        expect(() => updateProvenanceRecord()).toThrow();
      }),
      { numRuns: 100 },
    );
  });

  it('deleteProvenanceRecord always throws regardless of context', () => {
    fc.assert(
      fc.property(fc.anything(), () => {
        expect(() => deleteProvenanceRecord()).toThrow();
      }),
      { numRuns: 100 },
    );
  });

  it('update rejection message communicates immutability', () => {
    fc.assert(
      fc.property(fc.anything(), () => {
        try { updateProvenanceRecord(); }
        catch (e: any) { expect(e.message.toLowerCase()).toContain('immutable'); }
      }),
      { numRuns: 100 },
    );
  });

  it('delete rejection message communicates immutability', () => {
    fc.assert(
      fc.property(fc.anything(), () => {
        try { deleteProvenanceRecord(); }
        catch (e: any) { expect(e.message.toLowerCase()).toContain('immutable'); }
      }),
      { numRuns: 100 },
    );
  });

  it('created records preserve all input fields unchanged', () => {
    fc.assert(
      fc.asyncProperty(arbCreateProvenanceParams, async (params) => {
        const record = await createProvenanceRecord(params);

        expect(record.modelId).toBe(params.modelId);
        expect(record.generatedAt).toBe(params.generatedAt);
        expect(record.acceptedBy).toBe(params.acceptedBy);
        expect(record.acceptedAt).toBe(params.acceptedAt);
        expect(record.source).toBe(params.source);
        expect(record.capability).toBe(params.capability);
        expect(record.confidence).toBe(params.confidence);
        expect(record.targetRecordId).toBeNull();
        expect(record.targetRecordType).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 12: Provenance Override Structure
// Validates: Requirements 5.8
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: ai-copilot-workspace, Property 12: Provenance Override Structure', () => {
  /**
   * **Validates: Requirements 5.8**
   *
   * For any professional attestation (override) record, it must contain: the attesting
   * user's UID, their Professional_Role, a signed declaration of at least 20 characters,
   * and an ISO 8601 timestamp.
   */

  it('creates override records containing all required fields for valid input', () => {
    // Set mock so provenance record always exists for this test
    mockGet.mockResolvedValue({ exists: true, data: () => ({}) });

    fc.assert(
      fc.asyncProperty(
        arbProjectId, arbUid, arbUid, arbProfessionalRole, arbValidDeclaration,
        async (projectId, provenanceRecordId, attestedBy, attestedRole, declaration) => {
          const override = await createOverride(projectId, provenanceRecordId, {
            attestedBy, attestedRole, declaration,
          });

          expect(override.attestedBy).toBe(attestedBy);
          expect(override.attestedRole).toBe(attestedRole);
          expect(override.declaration).toBe(declaration);
          expect(override.declaration.length).toBeGreaterThanOrEqual(20);
          expect(override.attestedAt).toBeDefined();
          expect(isNaN(Date.parse(override.attestedAt))).toBe(false);
          expect(override.id).toBeDefined();
          expect(typeof override.id).toBe('string');
          expect(override.provenanceRecordId).toBe(provenanceRecordId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects declarations shorter than 20 characters', () => {
    mockGet.mockResolvedValue({ exists: true, data: () => ({}) });

    fc.assert(
      fc.asyncProperty(
        arbProjectId, arbUid, arbUid, arbProfessionalRole, arbInvalidDeclaration,
        async (projectId, provenanceRecordId, attestedBy, attestedRole, shortDeclaration) => {
          await expect(
            createOverride(projectId, provenanceRecordId, {
              attestedBy, attestedRole, declaration: shortDeclaration,
            }),
          ).rejects.toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects override creation when parent provenance record does not exist', () => {
    mockGet.mockResolvedValue({ exists: false });

    fc.assert(
      fc.asyncProperty(
        arbProjectId, arbUid, arbUid, arbProfessionalRole, arbValidDeclaration,
        async (projectId, provenanceRecordId, attestedBy, attestedRole, declaration) => {
          await expect(
            createOverride(projectId, provenanceRecordId, {
              attestedBy, attestedRole, declaration,
            }),
          ).rejects.toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('attestedAt timestamp is always a valid ISO 8601 date', () => {
    mockGet.mockResolvedValue({ exists: true, data: () => ({}) });

    fc.assert(
      fc.asyncProperty(
        arbProjectId, arbUid, arbUid, arbProfessionalRole, arbValidDeclaration,
        async (projectId, provenanceRecordId, attestedBy, attestedRole, declaration) => {
          const override = await createOverride(projectId, provenanceRecordId, {
            attestedBy, attestedRole, declaration,
          });

          const parsed = Date.parse(override.attestedAt);
          expect(isNaN(parsed)).toBe(false);
          const now = Date.now();
          expect(parsed).toBeLessThanOrEqual(now + 5000);
          expect(parsed).toBeGreaterThan(now - 60000);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('override persists to Firestore subcollection when valid', () => {
    mockGet.mockResolvedValue({ exists: true, data: () => ({}) });

    fc.assert(
      fc.asyncProperty(
        arbProjectId, arbUid, arbUid, arbProfessionalRole, arbValidDeclaration,
        async (projectId, provenanceRecordId, attestedBy, attestedRole, declaration) => {
          const callsBefore = mockSet.mock.calls.length;
          await createOverride(projectId, provenanceRecordId, {
            attestedBy, attestedRole, declaration,
          });
          expect(mockSet.mock.calls.length).toBeGreaterThan(callsBefore);
        },
      ),
      { numRuns: 100 },
    );
  });
});
