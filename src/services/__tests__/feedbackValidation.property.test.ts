// @vitest-environment node
/**
 * Property-based tests — Feedback validation correctness.
 *
 * Feature: intelligent-feedback-loop
 *
 * Property 1: Description validation correctness
 *   Validates: Requirements 2.3, 2.6
 *   For any string input, validateDescription(text) accepts iff it contains
 *   at least 10 non-whitespace characters AND has at most 2000 total characters.
 *
 * Property 2: Attachment validation correctness
 *   Validates: Requirements 2.4, 2.9, 8.6
 *   For any file with a given MIME type and byte size, and for any current
 *   attachment count, the attachment validator should accept the file if and only
 *   if the type is `image/png` or `image/jpeg`, the size is ≤5,242,880 bytes,
 *   and the current attachment count is less than 3.
 *
 * Uses fast-check with minimum 100 iterations per property test.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateDescription, validateAttachment } from '@/services/feedbackValidation';

// ══════════════════════════════════════════════════════════════════════════════
// Property 1: Description validation correctness
// Validates: Requirements 2.3, 2.6
// ══════════════════════════════════════════════════════════════════════════════

/** Count non-whitespace characters in a string (matches the validator logic). */
function countNonWhitespace(text: string): number {
  return text.replace(/\s/g, '').length;
}

/** Reference oracle: determine if a description should be valid. */
function shouldBeValidDescription(text: string): boolean {
  return countNonWhitespace(text) >= 10 && text.length <= 2000;
}

describe('Feature: intelligent-feedback-loop, Property 1: Description validation correctness', () => {
  /**
   * **Validates: Requirements 2.3, 2.6**
   *
   * For any string input, validateDescription(text) accepts iff:
   * - text has at least 10 non-whitespace characters, AND
   * - text has at most 2000 total characters.
   */

  it('accepts any string with ≥10 non-whitespace chars and ≤2000 total chars', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 33, max: 126 }), { minLength: 10, maxLength: 100 }),
        fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 0, maxLength: 50 }),
        (nonWsCodes, wsChars) => {
          const text = nonWsCodes.map((c) => String.fromCharCode(c)).join('') + wsChars.join('');
          fc.pre(text.length <= 2000);
          const result = validateDescription(text);
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects any string with fewer than 10 non-whitespace characters', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 33, max: 126 }), { minLength: 0, maxLength: 9 }),
        fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 0, maxLength: 100 }),
        (nonWsCodes, wsChars) => {
          const text = nonWsCodes.map((c) => String.fromCharCode(c)).join('') + wsChars.join('');
          fc.pre(text.length <= 2000);
          const result = validateDescription(text);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects any string exceeding 2000 total characters', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 33, max: 126 }), { minLength: 10, maxLength: 200 }),
        fc.integer({ min: 1801, max: 2800 }),
        (nonWsCodes, paddingLen) => {
          const nonWs = nonWsCodes.map((c) => String.fromCharCode(c)).join('');
          const text = nonWs + ' '.repeat(paddingLen);
          fc.pre(text.length > 2000);
          const result = validateDescription(text);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects strings of only whitespace (0 non-whitespace chars)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(' ', '\t', '\n', '\r', '\f', '\v'), { minLength: 1, maxLength: 500 }),
        (wsChars) => {
          const text = wsChars.join('');
          const result = validateDescription(text);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('validation result matches the acceptance criteria for any arbitrary string', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 2500 }), (text) => {
        const result = validateDescription(text);
        const expected = shouldBeValidDescription(text);
        expect(result.valid).toBe(expected);
        if (!expected) {
          expect(result.error).toBeDefined();
        } else {
          expect(result.error).toBeUndefined();
        }
      }),
      { numRuns: 200 },
    );
  });

  // ── Boundary edge cases ──────────────────────────────────────────────────

  it('accepts strings at exactly 10 non-whitespace characters', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 33, max: 126 }), { minLength: 10, maxLength: 10 }),
        (codes) => {
          const text = codes.map((c) => String.fromCharCode(c)).join('');
          const result = validateDescription(text);
          expect(result.valid).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects strings at exactly 9 non-whitespace characters', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 33, max: 126 }), { minLength: 9, maxLength: 9 }),
        (codes) => {
          const text = codes.map((c) => String.fromCharCode(c)).join('');
          const result = validateDescription(text);
          expect(result.valid).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('accepts strings at exactly 2000 total characters with ≥10 non-whitespace', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 33, max: 126 }), { minLength: 10, maxLength: 50 }),
        (codes) => {
          const nonWs = codes.map((c) => String.fromCharCode(c)).join('');
          const padding = ' '.repeat(2000 - nonWs.length);
          const text = nonWs + padding;
          expect(text.length).toBe(2000);
          const result = validateDescription(text);
          expect(result.valid).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects strings at exactly 2001 total characters', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 33, max: 126 }), { minLength: 10, maxLength: 50 }),
        (codes) => {
          const nonWs = codes.map((c) => String.fromCharCode(c)).join('');
          const padding = ' '.repeat(2001 - nonWs.length);
          const text = nonWs + padding;
          expect(text.length).toBe(2001);
          const result = validateDescription(text);
          expect(result.valid).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 2: Attachment validation correctness
// Validates: Requirements 2.4, 2.9, 8.6
// ══════════════════════════════════════════════════════════════════════════════

const VALID_MIME_TYPES = ['image/png', 'image/jpeg'] as const;
const INVALID_MIME_TYPES = ['application/pdf', 'image/gif', 'text/plain'] as const;
const MAX_SIZE = 5_242_880;
const MAX_ATTACHMENTS = 3;

function shouldAccept(type: string, size: number, currentCount: number): boolean {
  const validType = type === 'image/png' || type === 'image/jpeg';
  const validSize = size <= MAX_SIZE;
  const validCount = currentCount < MAX_ATTACHMENTS;
  return validType && validSize && validCount;
}

describe('Feature: intelligent-feedback-loop, Property 2: Attachment validation correctness', () => {
  it('accepts the file if and only if type is image/png or image/jpeg, size ≤5,242,880, and currentCount < 3', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constantFrom(...VALID_MIME_TYPES),
          fc.constantFrom(...INVALID_MIME_TYPES),
          fc.string({ minLength: 1, maxLength: 50 }),
        ),
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 5 }),
        (type, size, currentCount) => {
          const result = validateAttachment({ type, size }, currentCount);
          const expected = shouldAccept(type, size, currentCount);
          expect(result.valid).toBe(expected);
          if (!expected) {
            expect(result.error).toBeDefined();
            expect(typeof result.error).toBe('string');
            expect(result.error!.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('always rejects when currentCount >= 3, regardless of type and size', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constantFrom(...VALID_MIME_TYPES), fc.string({ minLength: 1, maxLength: 50 })),
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 3, max: 5 }),
        (type, size, currentCount) => {
          const result = validateAttachment({ type, size }, currentCount);
          expect(result.valid).toBe(false);
          expect(result.error).toContain('Maximum of 3');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('always rejects invalid MIME types when count and size are valid', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constantFrom(...INVALID_MIME_TYPES),
          fc.string({ minLength: 1, maxLength: 50 }),
        ),
        fc.integer({ min: 0, max: MAX_SIZE }),
        fc.integer({ min: 0, max: 2 }),
        (type, size, currentCount) => {
          fc.pre(type !== 'image/png' && type !== 'image/jpeg');
          const result = validateAttachment({ type, size }, currentCount);
          expect(result.valid).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('always rejects files exceeding 5MB when type and count are valid', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_MIME_TYPES),
        fc.integer({ min: MAX_SIZE + 1, max: 10_000_000 }),
        fc.integer({ min: 0, max: 2 }),
        (type, size, currentCount) => {
          const result = validateAttachment({ type, size }, currentCount);
          expect(result.valid).toBe(false);
          expect(result.error).toContain('5MB');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('always accepts valid type, valid size, and count < 3', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_MIME_TYPES),
        fc.integer({ min: 0, max: MAX_SIZE }),
        fc.integer({ min: 0, max: 2 }),
        (type, size, currentCount) => {
          const result = validateAttachment({ type, size }, currentCount);
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });
});
