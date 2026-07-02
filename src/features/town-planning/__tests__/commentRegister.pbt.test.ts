/**
 * Property-Based Tests for Comment Register (Property 8)
 *
 * Feature: town-planning-workflow
 *
 * **Validates: Requirements 1.2**
 *
 * Property 8:
 * For any (dateReceived, advertisingEndDate) pair, registerComment() sets
 * isLateSubmission = true if and only if dateReceived > advertisingEndDate
 * (strict string comparison on ISO date format YYYY-MM-DD).
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import {
  registerComment,
  type CommentActor,
  type CommentDeps,
  type CommentAuditFn,
} from '../services/commentRegister';
import type { FirestoreDB } from '../services/municipalityConfig';

// ─── Generators ──────────────────────────────────────────────────────────────

/** Generates a valid ISO date string (YYYY-MM-DD) within a reasonable range */
const arbDate = fc.integer({ min: 0, max: 3650 }).map((daysOffset) => {
  const base = new Date('2020-01-01T00:00:00.000Z');
  base.setUTCDate(base.getUTCDate() + daysOffset);
  const year = base.getUTCFullYear();
  const month = String(base.getUTCMonth() + 1).padStart(2, '0');
  const day = String(base.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
});

/** Generates a valid comment input with a given dateReceived */
function arbCommentInput(dateReceived: string) {
  return {
    type: 'objection' as const,
    submitterName: 'Test Submitter',
    submitterContact: 'test@example.com',
    content: 'Test comment content',
    dateReceived,
  };
}

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function createMockDb(): FirestoreDB {
  let addCounter = 0;
  return {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: false, id: 'x', data: () => null }),
        set: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      }),
      add: vi.fn().mockImplementation(() => {
        addCounter++;
        return Promise.resolve({ id: `pbt-comment-${addCounter}` });
      }),
      get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
    }),
  };
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Comment Register — Property-Based Tests', () => {
  describe('Property 8: Late submission flag correctness', () => {
    it('isLateSubmission is true iff dateReceived > advertisingEndDate', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbDate,
          arbDate,
          async (dateReceived, advertisingEndDate) => {
            const db = createMockDb();
            const auditFn: CommentAuditFn = vi.fn().mockResolvedValue(undefined);
            const deps: CommentDeps = { db, auditFn };
            const actor: CommentActor = { id: 'pbt-actor', role: 'town_planner' };

            const input = arbCommentInput(dateReceived);

            const result = await registerComment(
              'app-pbt', 'proj-pbt',
              input,
              advertisingEndDate,
              actor,
              deps
            );

            // Should always succeed with valid input
            expect(result.success).toBe(true);

            if (result.success) {
              const expectedLate = dateReceived > advertisingEndDate;
              expect(result.data.isLateSubmission).toBe(expectedLate);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
