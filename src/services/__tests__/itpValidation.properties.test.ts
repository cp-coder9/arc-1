// @vitest-environment node
/**
 * Property-based tests — Inspection item validation enforces field constraints.
 *
 * Feature: qaqc-inspection-test-plans
 *
 * Property 4: Inspection item validation enforces field constraints
 *   **Validates: Requirements 2.1, 2.5, 2.6, 2.8**
 *
 *   For any inspection item input, the service shall accept it only when:
 *   - title is 1–200 chars
 *   - description is 1–2000 chars
 *   - inspectionType is one of the three valid values
 *   - acceptanceCriteria is 1–2000 chars
 *   - responsibleInspectorRole is valid
 *   - specificationReference matches SANS/NHBRC/project format
 *   - linkedMaterialTestIds has ≤ 20 entries
 *   Invalid input shall be rejected with an error identifying the failing fields.
 *
 * Uses fast-check with minimum 100 iterations per property test.
 */

import { vi } from 'vitest';
import fc from 'fast-check';

vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-user' } },
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'CREATE', READ: 'READ', UPDATE: 'UPDATE', DELETE: 'DELETE', LIST: 'LIST', UPLOAD: 'UPLOAD', GET: 'GET', WRITE: 'WRITE' },
}));

vi.mock('@/demo-seed/demoFirestore', () => ({
  getDemoDoc: vi.fn(),
  getDemoCol: vi.fn(),
  useDemoMode: vi.fn(() => false),
}));

import { createInspectionItemSchema, specificationReferenceSchema } from '@/lib/schemas';

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_INSPECTION_TYPES = ['hold_point', 'witness_point', 'surveillance'] as const;
const VALID_INSPECTOR_ROLES = ['engineer', 'architect', 'site_manager'] as const;

// ── Generators ────────────────────────────────────────────────────────────────

/** Generate a valid string of specified length range (non-empty printable chars) */
function arbStringInRange(min: number, max: number): fc.Arbitrary<string> {
  return fc.string({ minLength: min, maxLength: max }).filter((s) => s.trim().length >= min);
}

/** Generate a valid SANS specification reference */
function arbValidSANSRef(): fc.Arbitrary<string> {
  return fc.tuple(
    fc.integer({ min: 1000, max: 99999 }),
    fc.integer({ min: 1, max: 30 }),
    fc.option(fc.integer({ min: 1, max: 20 }), { nil: undefined }),
  ).map(([sansNum, clause, subClause]) =>
    subClause !== undefined
      ? `SANS ${sansNum} clause ${clause}.${subClause}`
      : `SANS ${sansNum} clause ${clause}`
  );
}

/** Generate a valid NHBRC specification reference */
function arbValidNHBRCRef(): fc.Arbitrary<string> {
  return fc.stringMatching(/^[A-Z0-9\-]{1,20}$/).map((suffix) => `NHBRC-${suffix}`);
}

/** Generate a valid SpecForge project specification reference */
function arbValidSpecForgeRef(): fc.Arbitrary<string> {
  return fc.stringMatching(/^[A-Za-z0-9\-]{1,50}$/).map((suffix) => `SPEC-${suffix}`);
}

/** Generate any valid specification reference */
function arbValidSpecRef(): fc.Arbitrary<string> {
  return fc.oneof(arbValidSANSRef(), arbValidNHBRCRef(), arbValidSpecForgeRef());
}

/** Generate an invalid specification reference */
function arbInvalidSpecRef(): fc.Arbitrary<string> {
  return fc.oneof(
    // Doesn't start with SANS/NHBRC-/SPEC-
    fc.string({ minLength: 1, maxLength: 100 }).filter(
      (s) => !(/^SANS \d{4,5} clause \d+(\.\d+)*$/.test(s)) &&
             !(/^NHBRC-/.test(s)) &&
             !s.startsWith('SPEC-')
    ),
    // SANS without proper clause format
    fc.integer({ min: 1000, max: 99999 }).map((n) => `SANS ${n}`),
    // SANS with non-numeric clause
    fc.integer({ min: 1000, max: 99999 }).map((n) => `SANS ${n} clause abc`),
  );
}

/** Generate a valid complete inspection item input */
function arbValidInspectionItem(): fc.Arbitrary<Record<string, unknown>> {
  return fc.record({
    title: fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.length >= 1),
    description: fc.string({ minLength: 1, maxLength: 2000 }).filter((s) => s.length >= 1),
    inspectionType: fc.constantFrom(...VALID_INSPECTION_TYPES),
    acceptanceCriteria: fc.string({ minLength: 1, maxLength: 2000 }).filter((s) => s.length >= 1),
    responsibleInspectorRole: fc.constantFrom(...VALID_INSPECTOR_ROLES),
    specificationReference: arbValidSpecRef(),
    linkedMaterialTestIds: fc.array(fc.uuid(), { minLength: 0, maxLength: 20 }),
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 4: Inspection item validation enforces field constraints
// **Validates: Requirements 2.1, 2.5, 2.6, 2.8**
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: qaqc-inspection-test-plans, Property 4: Inspection item validation enforces field constraints', () => {

  // ── Valid inputs are accepted ─────────────────────────────────────────────

  it('accepts any inspection item with all fields within valid constraints', () => {
    fc.assert(
      fc.property(
        arbValidInspectionItem(),
        (input) => {
          const result = createInspectionItemSchema.safeParse(input);
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── Title validation ──────────────────────────────────────────────────────

  it('rejects when title is empty (0 chars)', () => {
    fc.assert(
      fc.property(
        arbValidInspectionItem(),
        (input) => {
          const invalid = { ...input, title: '' };
          const result = createInspectionItemSchema.safeParse(invalid);
          expect(result.success).toBe(false);
          if (!result.success) {
            const paths = result.error.errors.map((e) => e.path.join('.'));
            expect(paths).toContain('title');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects when title exceeds 200 characters', () => {
    fc.assert(
      fc.property(
        arbValidInspectionItem(),
        fc.integer({ min: 201, max: 500 }),
        (input, len) => {
          const invalid = { ...input, title: 'a'.repeat(len) };
          const result = createInspectionItemSchema.safeParse(invalid);
          expect(result.success).toBe(false);
          if (!result.success) {
            const paths = result.error.errors.map((e) => e.path.join('.'));
            expect(paths).toContain('title');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('accepts title at boundary lengths (1 and 200)', () => {
    fc.assert(
      fc.property(
        arbValidInspectionItem(),
        fc.constantFrom(1, 200),
        (input, len) => {
          const valid = { ...input, title: 'x'.repeat(len) };
          const result = createInspectionItemSchema.safeParse(valid);
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── Description validation ────────────────────────────────────────────────

  it('rejects when description is empty (0 chars)', () => {
    fc.assert(
      fc.property(
        arbValidInspectionItem(),
        (input) => {
          const invalid = { ...input, description: '' };
          const result = createInspectionItemSchema.safeParse(invalid);
          expect(result.success).toBe(false);
          if (!result.success) {
            const paths = result.error.errors.map((e) => e.path.join('.'));
            expect(paths).toContain('description');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects when description exceeds 2000 characters', () => {
    fc.assert(
      fc.property(
        arbValidInspectionItem(),
        fc.integer({ min: 2001, max: 3000 }),
        (input, len) => {
          const invalid = { ...input, description: 'd'.repeat(len) };
          const result = createInspectionItemSchema.safeParse(invalid);
          expect(result.success).toBe(false);
          if (!result.success) {
            const paths = result.error.errors.map((e) => e.path.join('.'));
            expect(paths).toContain('description');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('accepts description at boundary lengths (1 and 2000)', () => {
    fc.assert(
      fc.property(
        arbValidInspectionItem(),
        fc.constantFrom(1, 2000),
        (input, len) => {
          const valid = { ...input, description: 'y'.repeat(len) };
          const result = createInspectionItemSchema.safeParse(valid);
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── inspectionType validation ─────────────────────────────────────────────

  it('rejects when inspectionType is not one of the three valid values', () => {
    fc.assert(
      fc.property(
        arbValidInspectionItem(),
        fc.string({ minLength: 1, maxLength: 50 }).filter(
          (s) => !VALID_INSPECTION_TYPES.includes(s as any)
        ),
        (input, invalidType) => {
          const invalid = { ...input, inspectionType: invalidType };
          const result = createInspectionItemSchema.safeParse(invalid);
          expect(result.success).toBe(false);
          if (!result.success) {
            const paths = result.error.errors.map((e) => e.path.join('.'));
            expect(paths).toContain('inspectionType');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('accepts all three valid inspection types', () => {
    fc.assert(
      fc.property(
        arbValidInspectionItem(),
        fc.constantFrom(...VALID_INSPECTION_TYPES),
        (input, validType) => {
          const valid = { ...input, inspectionType: validType };
          const result = createInspectionItemSchema.safeParse(valid);
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── acceptanceCriteria validation ─────────────────────────────────────────

  it('rejects when acceptanceCriteria is empty', () => {
    fc.assert(
      fc.property(
        arbValidInspectionItem(),
        (input) => {
          const invalid = { ...input, acceptanceCriteria: '' };
          const result = createInspectionItemSchema.safeParse(invalid);
          expect(result.success).toBe(false);
          if (!result.success) {
            const paths = result.error.errors.map((e) => e.path.join('.'));
            expect(paths).toContain('acceptanceCriteria');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects when acceptanceCriteria exceeds 2000 characters', () => {
    fc.assert(
      fc.property(
        arbValidInspectionItem(),
        fc.integer({ min: 2001, max: 3000 }),
        (input, len) => {
          const invalid = { ...input, acceptanceCriteria: 'c'.repeat(len) };
          const result = createInspectionItemSchema.safeParse(invalid);
          expect(result.success).toBe(false);
          if (!result.success) {
            const paths = result.error.errors.map((e) => e.path.join('.'));
            expect(paths).toContain('acceptanceCriteria');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── responsibleInspectorRole validation ───────────────────────────────────

  it('rejects when responsibleInspectorRole is not a valid role', () => {
    fc.assert(
      fc.property(
        arbValidInspectionItem(),
        fc.string({ minLength: 1, maxLength: 50 }).filter(
          (s) => !VALID_INSPECTOR_ROLES.includes(s as any)
        ),
        (input, invalidRole) => {
          const invalid = { ...input, responsibleInspectorRole: invalidRole };
          const result = createInspectionItemSchema.safeParse(invalid);
          expect(result.success).toBe(false);
          if (!result.success) {
            const paths = result.error.errors.map((e) => e.path.join('.'));
            expect(paths).toContain('responsibleInspectorRole');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('accepts all three valid inspector roles', () => {
    fc.assert(
      fc.property(
        arbValidInspectionItem(),
        fc.constantFrom(...VALID_INSPECTOR_ROLES),
        (input, validRole) => {
          const valid = { ...input, responsibleInspectorRole: validRole };
          const result = createInspectionItemSchema.safeParse(valid);
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── specificationReference validation ─────────────────────────────────────

  it('accepts valid SANS specification references', () => {
    fc.assert(
      fc.property(
        arbValidSANSRef(),
        (ref) => {
          const result = specificationReferenceSchema.safeParse(ref);
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('accepts valid NHBRC specification references', () => {
    fc.assert(
      fc.property(
        arbValidNHBRCRef(),
        (ref) => {
          const result = specificationReferenceSchema.safeParse(ref);
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('accepts valid SpecForge (SPEC-) specification references', () => {
    fc.assert(
      fc.property(
        arbValidSpecForgeRef(),
        (ref) => {
          const result = specificationReferenceSchema.safeParse(ref);
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects specification references that do not match SANS/NHBRC/SPEC formats', () => {
    fc.assert(
      fc.property(
        arbInvalidSpecRef(),
        (ref) => {
          const result = specificationReferenceSchema.safeParse(ref);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects empty specification reference', () => {
    const result = specificationReferenceSchema.safeParse('');
    expect(result.success).toBe(false);
  });

  it('rejects specification reference exceeding 500 characters', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 501, max: 700 }),
        (len) => {
          const ref = 'SANS ' + '1'.repeat(len);
          const result = specificationReferenceSchema.safeParse(ref);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── linkedMaterialTestIds validation ──────────────────────────────────────

  it('accepts linkedMaterialTestIds with 0 to 20 entries', () => {
    fc.assert(
      fc.property(
        arbValidInspectionItem(),
        fc.integer({ min: 0, max: 20 }),
        (input, count) => {
          const ids = Array.from({ length: count }, (_, i) => `test-id-${i}`);
          const valid = { ...input, linkedMaterialTestIds: ids };
          const result = createInspectionItemSchema.safeParse(valid);
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects linkedMaterialTestIds with more than 20 entries', () => {
    fc.assert(
      fc.property(
        arbValidInspectionItem(),
        fc.integer({ min: 21, max: 25 }),
        (input, count) => {
          const ids = Array.from({ length: count }, (_, i) => `test-id-${i}`);
          const invalid = { ...input, linkedMaterialTestIds: ids };
          const result = createInspectionItemSchema.safeParse(invalid);
          expect(result.success).toBe(false);
          if (!result.success) {
            const paths = result.error.errors.map((e) => e.path.join('.'));
            expect(paths.some((p) => p.startsWith('linkedMaterialTestIds'))).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── Multiple field failures ───────────────────────────────────────────────

  it('reports all failing fields when multiple fields are invalid', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_INSPECTION_TYPES),
        fc.constantFrom(...VALID_INSPECTOR_ROLES),
        (validType, validRole) => {
          const invalid = {
            title: '', // too short
            description: '', // too short
            inspectionType: validType,
            acceptanceCriteria: '', // too short
            responsibleInspectorRole: validRole,
            specificationReference: 'SANS 10400 clause 5.1',
            linkedMaterialTestIds: [],
          };
          const result = createInspectionItemSchema.safeParse(invalid);
          expect(result.success).toBe(false);
          if (!result.success) {
            const paths = result.error.errors.map((e) => e.path.join('.'));
            expect(paths).toContain('title');
            expect(paths).toContain('description');
            expect(paths).toContain('acceptanceCriteria');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── Integration: full schema validates correctly for random valid+invalid combos

  it('schema accepts iff ALL field constraints are satisfied simultaneously', () => {
    fc.assert(
      fc.property(
        // Generate a possibly-invalid input by randomly mutating one field
        arbValidInspectionItem(),
        fc.constantFrom(
          'title_empty', 'title_too_long',
          'desc_empty', 'desc_too_long',
          'type_invalid', 'criteria_empty', 'criteria_too_long',
          'role_invalid', 'spec_invalid', 'linked_too_many',
          'valid',
        ),
        (input, mutation) => {
          let testInput = { ...input };
          let shouldBeValid = true;

          switch (mutation) {
            case 'title_empty':
              testInput = { ...testInput, title: '' };
              shouldBeValid = false;
              break;
            case 'title_too_long':
              testInput = { ...testInput, title: 'a'.repeat(201) };
              shouldBeValid = false;
              break;
            case 'desc_empty':
              testInput = { ...testInput, description: '' };
              shouldBeValid = false;
              break;
            case 'desc_too_long':
              testInput = { ...testInput, description: 'd'.repeat(2001) };
              shouldBeValid = false;
              break;
            case 'type_invalid':
              testInput = { ...testInput, inspectionType: 'not_a_type' };
              shouldBeValid = false;
              break;
            case 'criteria_empty':
              testInput = { ...testInput, acceptanceCriteria: '' };
              shouldBeValid = false;
              break;
            case 'criteria_too_long':
              testInput = { ...testInput, acceptanceCriteria: 'c'.repeat(2001) };
              shouldBeValid = false;
              break;
            case 'role_invalid':
              testInput = { ...testInput, responsibleInspectorRole: 'janitor' };
              shouldBeValid = false;
              break;
            case 'spec_invalid':
              testInput = { ...testInput, specificationReference: 'INVALID-REF' };
              shouldBeValid = false;
              break;
            case 'linked_too_many':
              testInput = { ...testInput, linkedMaterialTestIds: Array.from({ length: 21 }, (_, i) => `id-${i}`) };
              shouldBeValid = false;
              break;
            case 'valid':
              // keep as-is
              break;
          }

          const result = createInspectionItemSchema.safeParse(testInput);
          expect(result.success).toBe(shouldBeValid);
        },
      ),
      { numRuns: 200 },
    );
  });
});
