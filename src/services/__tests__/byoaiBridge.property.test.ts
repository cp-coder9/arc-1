// @vitest-environment node
/**
 * Property-Based Tests for BYOAIBridgeService — Import Validation, Provenance, Access Control, Audit Trail
 *
 * Feature: ai-copilot-workspace
 *
 * Property 19: BYOAI Import Validation
 *   Validates: Requirements 11.1, 11.6, 11.9
 *   For any import request, the content field must be 1–50,000 characters, the model name
 *   1–100 characters, the content type must be a valid BYOAIContentType enum value, and
 *   the generation timestamp (if provided) must not be more than 5 minutes in the future.
 *
 * Property 20: BYOAI Import Provenance
 *   Validates: Requirements 11.2
 *   For any successfully imported content, a ProvenanceRecord must be created with
 *   source='external', capability=null, and the declared external model name as modelId.
 *
 * Property 21: BYOAI Access Control
 *   Validates: Requirements 11.4
 *   For any user without write access to the target project, the import must be rejected
 *   with an authorization error, and no data (document or provenance record) shall be persisted.
 *
 * Property 22: Import Audit Trail Completeness
 *   Validates: Requirements 11.7
 *   For any import attempt (success or failure), an audit trail entry must be logged
 *   containing: userId, projectId, action, timestamp, contentType, modelName, and status.
 *
 * Uses fast-check with minimum 100 iterations per property test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  importContent,
  BYOAIValidationError,
  BYOAIAuthorizationError,
  type BYOAIServiceDeps,
  type AuditEntry,
} from '@/services/byoaiBridgeService';
import type { BYOAIImportRequest, BYOAIContentType } from '@/services/copilotTypes';

// ─── Mock firebase-admin ───────────────────────────────────────────────────

const mockDocSet = vi.fn().mockResolvedValue(undefined);
const mockDocId = 'mock-doc-id-prop';
const mockDoc = vi.fn().mockReturnValue({ id: mockDocId, set: mockDocSet });
const mockCollection = vi.fn().mockReturnValue({ doc: mockDoc });

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: (...args: unknown[]) => mockCollection(...args),
  },
}));

// ─── Mock provenanceService ────────────────────────────────────────────────

const mockCreateProvenanceRecord = vi.fn();
vi.mock('@/services/provenanceService', () => ({
  createProvenanceRecord: (...args: unknown[]) => mockCreateProvenanceRecord(...args),
}));

// ─── Constants ─────────────────────────────────────────────────────────────

const VALID_CONTENT_TYPES: BYOAIContentType[] = [
  'rfi_draft',
  'narrative',
  'specification',
  'analysis',
  'general',
];

// ─── Arbitraries (Generators) ──────────────────────────────────────────────

/**
 * Generate a valid content string (printable ASCII, 1–200 chars).
 * Uses character codes 33–126 to avoid whitespace-only strings that would
 * be valid per length but might cause unexpected Zod behaviour.
 */
const validContentArb = fc
  .array(fc.integer({ min: 33, max: 126 }), { minLength: 1, maxLength: 200 })
  .map((codes) => codes.map((c) => String.fromCharCode(c)).join(''));

/**
 * Generate a valid external model name (printable ASCII, 1–50 chars).
 */
const validModelNameArb = fc
  .array(fc.integer({ min: 33, max: 126 }), { minLength: 1, maxLength: 50 })
  .map((codes) => codes.map((c) => String.fromCharCode(c)).join(''));

/** Generate a valid BYOAIContentType */
const validContentTypeArb = fc.constantFrom(...VALID_CONTENT_TYPES);

/** Generate an invalid content type (string not in the enum) */
const invalidContentTypeArb = fc
  .string({ minLength: 3, maxLength: 20 })
  .filter((s: string) => !VALID_CONTENT_TYPES.includes(s as BYOAIContentType) && s.trim().length > 0);

/** Generate a valid past/present timestamp (0–4 minutes in the future, safe) */
const validTimestampArb = fc
  .integer({ min: -60 * 60 * 1000, max: 4 * 60 * 1000 })
  .map((offset) => new Date(Date.now() + offset).toISOString());

/** Generate a future timestamp more than 6 minutes ahead (clearly invalid) */
const invalidFutureTimestampArb = fc
  .integer({ min: 6 * 60 * 1000, max: 24 * 60 * 60 * 1000 })
  .map((offset) => new Date(Date.now() + offset).toISOString());

/** Generate a valid full import request */
const validRequestArb: fc.Arbitrary<BYOAIImportRequest> = fc
  .tuple(validContentArb, validModelNameArb, validContentTypeArb)
  .map(([content, externalModelName, contentType]) => ({
    content,
    externalModelName,
    contentType,
  }));

// ─── Helpers ───────────────────────────────────────────────────────────────

function createGrantedDeps(): BYOAIServiceDeps {
  return {
    checkWritePermission: vi.fn().mockResolvedValue(true),
    logAuditEvent: vi.fn().mockResolvedValue(undefined),
  };
}

function createDeniedDeps(): BYOAIServiceDeps {
  return {
    checkWritePermission: vi.fn().mockResolvedValue(false),
    logAuditEvent: vi.fn().mockResolvedValue(undefined),
  };
}

function resetGlobalMocks(): void {
  mockDocSet.mockClear();
  mockDoc.mockClear();
  mockCollection.mockClear();
  mockCreateProvenanceRecord.mockClear();
  mockCreateProvenanceRecord.mockResolvedValue({
    id: 'prov-generated',
    projectId: 'proj',
    source: 'external',
    capability: null,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 19: BYOAI Import Validation
// Feature: ai-copilot-workspace, Property 19: BYOAI Import Validation
// Validates: Requirements 11.1, 11.6, 11.9
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 19: BYOAI Import Validation', () => {
  beforeEach(() => {
    resetGlobalMocks();
  });

  /**
   * **Validates: Requirements 11.1, 11.6, 11.9**
   */
  it('accepts any request with valid content (1–50000 chars), valid model name (1–100 chars), and valid content type', async () => {
    await fc.assert(
      fc.asyncProperty(validRequestArb, async (request) => {
        resetGlobalMocks();
        const deps = createGrantedDeps();
        const result = await importContent('proj-1', 'user-1', request, deps);
        expect(result.status).toBe('imported');
        expect(result.documentId).toBeDefined();
        expect(result.provenanceRecordId).toBeDefined();
      }),
      { numRuns: 100 },
    );
  });

  it('accepts requests with a valid generation timestamp (not more than 5 min in future)', async () => {
    await fc.assert(
      fc.asyncProperty(
        validContentArb,
        validModelNameArb,
        validContentTypeArb,
        validTimestampArb,
        async (content, modelName, contentType, timestamp) => {
          resetGlobalMocks();
          const deps = createGrantedDeps();
          const request: BYOAIImportRequest = {
            content,
            externalModelName: modelName,
            contentType,
            generationTimestamp: timestamp,
          };
          const result = await importContent('proj-1', 'user-1', request, deps);
          expect(result.status).toBe('imported');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects requests with empty content', async () => {
    await fc.assert(
      fc.asyncProperty(validModelNameArb, validContentTypeArb, async (modelName, contentType) => {
        resetGlobalMocks();
        const deps = createGrantedDeps();
        const request: BYOAIImportRequest = {
          content: '',
          externalModelName: modelName,
          contentType,
        };
        try {
          await importContent('proj-1', 'user-1', request, deps);
          expect.fail('Expected BYOAIValidationError to be thrown');
        } catch (err) {
          expect(err).toBeInstanceOf(BYOAIValidationError);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('rejects requests with content exceeding 50000 characters', async () => {
    await fc.assert(
      fc.asyncProperty(validModelNameArb, validContentTypeArb, async (modelName, contentType) => {
        resetGlobalMocks();
        const deps = createGrantedDeps();
        const request: BYOAIImportRequest = {
          content: 'a'.repeat(50001),
          externalModelName: modelName,
          contentType,
        };
        try {
          await importContent('proj-1', 'user-1', request, deps);
          expect.fail('Expected BYOAIValidationError to be thrown');
        } catch (err) {
          expect(err).toBeInstanceOf(BYOAIValidationError);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('rejects requests with empty model name', async () => {
    await fc.assert(
      fc.asyncProperty(validContentArb, validContentTypeArb, async (content, contentType) => {
        resetGlobalMocks();
        const deps = createGrantedDeps();
        const request: BYOAIImportRequest = {
          content,
          externalModelName: '',
          contentType,
        };
        try {
          await importContent('proj-1', 'user-1', request, deps);
          expect.fail('Expected BYOAIValidationError to be thrown');
        } catch (err) {
          expect(err).toBeInstanceOf(BYOAIValidationError);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('rejects requests with model name exceeding 100 characters', async () => {
    await fc.assert(
      fc.asyncProperty(validContentArb, validContentTypeArb, async (content, contentType) => {
        resetGlobalMocks();
        const deps = createGrantedDeps();
        const request: BYOAIImportRequest = {
          content,
          externalModelName: 'x'.repeat(101),
          contentType,
        };
        try {
          await importContent('proj-1', 'user-1', request, deps);
          expect.fail('Expected BYOAIValidationError to be thrown');
        } catch (err) {
          expect(err).toBeInstanceOf(BYOAIValidationError);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('rejects requests with invalid content type', async () => {
    await fc.assert(
      fc.asyncProperty(
        validContentArb,
        validModelNameArb,
        invalidContentTypeArb,
        async (content, modelName, contentType) => {
          resetGlobalMocks();
          const deps = createGrantedDeps();
          const request = {
            content,
            externalModelName: modelName,
            contentType: contentType as BYOAIContentType,
          };
          try {
            await importContent('proj-1', 'user-1', request, deps);
            expect.fail('Expected BYOAIValidationError to be thrown');
          } catch (err) {
            expect(err).toBeInstanceOf(BYOAIValidationError);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects requests with generation timestamp more than 5 minutes in the future', async () => {
    await fc.assert(
      fc.asyncProperty(
        validContentArb,
        validModelNameArb,
        validContentTypeArb,
        invalidFutureTimestampArb,
        async (content, modelName, contentType, timestamp) => {
          resetGlobalMocks();
          const deps = createGrantedDeps();
          const request: BYOAIImportRequest = {
            content,
            externalModelName: modelName,
            contentType,
            generationTimestamp: timestamp,
          };
          try {
            await importContent('proj-1', 'user-1', request, deps);
            expect.fail('Expected BYOAIValidationError to be thrown');
          } catch (err) {
            expect(err).toBeInstanceOf(BYOAIValidationError);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 20: BYOAI Import Provenance
// Feature: ai-copilot-workspace, Property 20: BYOAI Import Provenance
// Validates: Requirements 11.2
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 20: BYOAI Import Provenance', () => {
  beforeEach(() => {
    resetGlobalMocks();
  });

  /**
   * **Validates: Requirements 11.2**
   */
  it('creates a provenance record with source="external", capability=null, and the declared model name as modelId', async () => {
    await fc.assert(
      fc.asyncProperty(
        validContentArb,
        validModelNameArb,
        validContentTypeArb,
        async (content, modelName, contentType) => {
          resetGlobalMocks();
          const deps = createGrantedDeps();
          const request: BYOAIImportRequest = {
            content,
            externalModelName: modelName,
            contentType,
          };

          await importContent('proj-test', 'user-abc', request, deps);

          expect(mockCreateProvenanceRecord).toHaveBeenCalledTimes(1);
          const provCall = mockCreateProvenanceRecord.mock.calls[0][0];
          expect(provCall.source).toBe('external');
          expect(provCall.capability).toBeNull();
          expect(provCall.modelId).toBe(modelName);
          expect(provCall.acceptedBy).toBe('user-abc');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('the provenance record includes a valid generatedAt ISO 8601 timestamp', async () => {
    await fc.assert(
      fc.asyncProperty(validRequestArb, async (request) => {
        resetGlobalMocks();
        const deps = createGrantedDeps();
        await importContent('proj-test', 'user-1', request, deps);

        expect(mockCreateProvenanceRecord).toHaveBeenCalledTimes(1);
        const provCall = mockCreateProvenanceRecord.mock.calls[0][0];
        const timestamp = new Date(provCall.generatedAt);
        expect(timestamp.getTime()).not.toBeNaN();
      }),
      { numRuns: 100 },
    );
  });

  it('uses the provided generationTimestamp in the provenance record when supplied', async () => {
    await fc.assert(
      fc.asyncProperty(
        validContentArb,
        validModelNameArb,
        validContentTypeArb,
        validTimestampArb,
        async (content, modelName, contentType, timestamp) => {
          resetGlobalMocks();
          const deps = createGrantedDeps();
          const request: BYOAIImportRequest = {
            content,
            externalModelName: modelName,
            contentType,
            generationTimestamp: timestamp,
          };

          await importContent('proj-test', 'user-1', request, deps);

          expect(mockCreateProvenanceRecord).toHaveBeenCalledTimes(1);
          const provCall = mockCreateProvenanceRecord.mock.calls[0][0];
          expect(provCall.generatedAt).toBe(timestamp);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('the provenance record confidence is null for external imports', async () => {
    await fc.assert(
      fc.asyncProperty(validRequestArb, async (request) => {
        resetGlobalMocks();
        const deps = createGrantedDeps();
        await importContent('proj-test', 'user-1', request, deps);

        expect(mockCreateProvenanceRecord).toHaveBeenCalledTimes(1);
        const provCall = mockCreateProvenanceRecord.mock.calls[0][0];
        expect(provCall.confidence).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 21: BYOAI Access Control
// Feature: ai-copilot-workspace, Property 21: BYOAI Access Control
// Validates: Requirements 11.4
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 21: BYOAI Access Control', () => {
  beforeEach(() => {
    resetGlobalMocks();
  });

  /**
   * **Validates: Requirements 11.4**
   */
  it('rejects with BYOAIAuthorizationError when user lacks write permission', async () => {
    await fc.assert(
      fc.asyncProperty(validRequestArb, async (request) => {
        resetGlobalMocks();
        const deps = createDeniedDeps();
        try {
          await importContent('proj-denied', 'user-no-access', request, deps);
          expect.fail('Expected BYOAIAuthorizationError to be thrown');
        } catch (err) {
          expect(err).toBeInstanceOf(BYOAIAuthorizationError);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('does not create any provenance record when permission is denied', async () => {
    await fc.assert(
      fc.asyncProperty(validRequestArb, async (request) => {
        resetGlobalMocks();
        const deps = createDeniedDeps();
        try {
          await importContent('proj-denied', 'user-no-access', request, deps);
        } catch {
          // expected
        }
        expect(mockCreateProvenanceRecord).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  it('does not persist any document when permission is denied', async () => {
    await fc.assert(
      fc.asyncProperty(validRequestArb, async (request) => {
        resetGlobalMocks();
        const deps = createDeniedDeps();
        try {
          await importContent('proj-denied', 'user-no-access', request, deps);
        } catch {
          // expected
        }
        expect(mockDocSet).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  it('checks write permission with the correct userId and projectId', async () => {
    await fc.assert(
      fc.asyncProperty(validRequestArb, async (request) => {
        resetGlobalMocks();
        const deps = createDeniedDeps();
        try {
          await importContent('proj-target', 'user-check', request, deps);
        } catch {
          // expected
        }
        expect(deps.checkWritePermission).toHaveBeenCalledWith('user-check', 'proj-target');
      }),
      { numRuns: 100 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 22: Import Audit Trail Completeness
// Feature: ai-copilot-workspace, Property 22: Import Audit Trail Completeness
// Validates: Requirements 11.7
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 22: Import Audit Trail Completeness', () => {
  beforeEach(() => {
    resetGlobalMocks();
  });

  /**
   * **Validates: Requirements 11.7**
   */
  it('logs an audit entry with all required fields on successful import', async () => {
    await fc.assert(
      fc.asyncProperty(
        validContentArb,
        validModelNameArb,
        validContentTypeArb,
        async (content, modelName, contentType) => {
          resetGlobalMocks();
          const deps = createGrantedDeps();
          const request: BYOAIImportRequest = {
            content,
            externalModelName: modelName,
            contentType,
          };

          await importContent('proj-audit', 'user-audit', request, deps);

          const logFn = deps.logAuditEvent as ReturnType<typeof vi.fn>;
          const calls = logFn.mock.calls;
          const successCall = calls.find((c) => (c[0] as AuditEntry).status === 'success');
          expect(successCall).toBeDefined();

          const entry: AuditEntry = successCall![0];
          expect(entry.userId).toBe('user-audit');
          expect(entry.projectId).toBe('proj-audit');
          expect(entry.action).toBeDefined();
          expect(entry.action.length).toBeGreaterThan(0);
          expect(entry.timestamp).toBeDefined();
          expect(new Date(entry.timestamp).getTime()).not.toBeNaN();
          expect(entry.contentType).toBe(contentType);
          expect(entry.modelName).toBe(modelName);
          expect(entry.status).toBe('success');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('logs an audit entry with failure status on validation error', async () => {
    await fc.assert(
      fc.asyncProperty(
        validModelNameArb,
        validContentTypeArb,
        async (modelName, contentType) => {
          resetGlobalMocks();
          const deps = createGrantedDeps();
          const request: BYOAIImportRequest = {
            content: '',
            externalModelName: modelName,
            contentType,
          };

          try {
            await importContent('proj-audit', 'user-audit', request, deps);
          } catch {
            // expected
          }

          const logFn = deps.logAuditEvent as ReturnType<typeof vi.fn>;
          expect(logFn).toHaveBeenCalled();
          const entry: AuditEntry = logFn.mock.calls[0][0];
          expect(entry.userId).toBe('user-audit');
          expect(entry.projectId).toBe('proj-audit');
          expect(entry.action).toBeDefined();
          expect(entry.timestamp).toBeDefined();
          expect(new Date(entry.timestamp).getTime()).not.toBeNaN();
          expect(entry.status).toBe('failure');
          expect(entry.failureReason).toBeDefined();
          expect(entry.failureReason!.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('logs an audit entry with failure status on authorization error', async () => {
    await fc.assert(
      fc.asyncProperty(validRequestArb, async (request) => {
        resetGlobalMocks();
        const deps = createDeniedDeps();

        try {
          await importContent('proj-audit', 'user-denied', request, deps);
        } catch {
          // expected
        }

        const logFn = deps.logAuditEvent as ReturnType<typeof vi.fn>;
        expect(logFn).toHaveBeenCalled();
        const entry: AuditEntry = logFn.mock.calls[0][0];
        expect(entry.userId).toBe('user-denied');
        expect(entry.projectId).toBe('proj-audit');
        expect(entry.action).toBeDefined();
        expect(entry.timestamp).toBeDefined();
        expect(new Date(entry.timestamp).getTime()).not.toBeNaN();
        expect(entry.contentType).toBe(request.contentType);
        expect(entry.modelName).toBe(request.externalModelName);
        expect(entry.status).toBe('failure');
        expect(entry.failureReason).toBeDefined();
      }),
      { numRuns: 100 },
    );
  });

  it('audit trail entry always contains a valid ISO 8601 timestamp', async () => {
    await fc.assert(
      fc.asyncProperty(validRequestArb, async (request) => {
        resetGlobalMocks();
        const deps = createGrantedDeps();
        await importContent('proj-1', 'user-1', request, deps);

        const logFn = deps.logAuditEvent as ReturnType<typeof vi.fn>;
        const calls = logFn.mock.calls;
        for (const call of calls) {
          const entry: AuditEntry = call[0];
          const date = new Date(entry.timestamp);
          expect(date.getTime()).not.toBeNaN();
          expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        }
      }),
      { numRuns: 100 },
    );
  });
});
