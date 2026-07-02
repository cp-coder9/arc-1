/**
 * Property-Based Tests for ContractEngineService — Validation Rejection
 *
 * **Property 2: Validation Rejects Incomplete Submissions**
 * For any ContractSetupInput where one or more mandatory fields are missing,
 * empty, or outside their defined valid range, validateContractSetup SHALL
 * reject the submission and return error indicators identifying every invalid field.
 *
 * **Validates: Requirements 1.10, 5.2, 6.5, 8.8**
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';

// Mock firebase-admin before importing the service
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          doc: vi.fn(() => ({
            set: vi.fn(),
            get: vi.fn(),
          })),
        })),
        set: vi.fn(),
        get: vi.fn(),
        update: vi.fn(),
      })),
    })),
  },
}));

import { validateContractSetup } from '../contractEngineService';
import type {
  ContractSetupInput,
  ContractForm,
  ContractParty,
  FormSpecificParams,
  JbccParams,
  NecParams,
  GccParams,
  FidicParams,
} from '../contractTypes';

// ══════════════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════════════

const VALID_CONTRACT_FORMS: ContractForm[] = ['jbcc_pba', 'nec_ecc', 'gcc_2025', 'fidic'];

// ══════════════════════════════════════════════════════════════════════════════
// Generators — Valid Baseline
// ══════════════════════════════════════════════════════════════════════════════

/** Generate a valid project ID */
const validProjectIdArb = fc.string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0);

/** Generate a valid setupBy user ID */
const validSetupByArb = fc.string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0);

/** Generate a valid contract form */
const validContractFormArb = fc.constantFrom(...VALID_CONTRACT_FORMS);

/** Generate a valid contract party */
const validPartyArb = (role: string): fc.Arbitrary<ContractParty> =>
  fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    role: fc.constant(role),
  });

/** Generate valid parties (employer + contractor + optional extras) */
const validPartiesArb: fc.Arbitrary<ContractParty[]> = fc.tuple(
  validPartyArb('employer'),
  validPartyArb('contractor'),
  fc.array(validPartyArb('quantity_surveyor'), { minLength: 0, maxLength: 2 }),
).map(([employer, contractor, extras]) => [employer, contractor, ...extras]);

/** Generate a valid commencement date in 2024-2026 range */
const validCommencementDateArb = fc
  .tuple(
    fc.integer({ min: 2024, max: 2026 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

/**
 * Generate a valid practical completion date that is always after the
 * commencement date. Adds 30-365 days to commencement.
 */
function validCompletionDateAfter(commencementDate: string): fc.Arbitrary<string> {
  return fc.integer({ min: 30, max: 365 }).map((daysAfter) => {
    const [y, m, d] = commencementDate.split('-').map(Number);
    const date = new Date(y, m - 1, d + daysAfter);
    const fy = date.getFullYear();
    const fm = String(date.getMonth() + 1).padStart(2, '0');
    const fd = String(date.getDate()).padStart(2, '0');
    return `${fy}-${fm}-${fd}`;
  });
}

/** Generate a valid contract sum in range */
const validContractSumArb = fc.double({ min: 1.0, max: 999_999_999_999.99, noNaN: true });

/** Generate valid JBCC params */
const validJbccParamsArb: fc.Arbitrary<JbccParams> = fc.record({
  interimPaymentPeriodDays: fc.integer({ min: 1, max: 90 }),
  penaltyRatePerDay: fc.double({ min: 0.01, max: 10000, noNaN: true }),
  retentionPercentage: fc.double({ min: 0, max: 10, noNaN: true }),
  defectsLiabilityMonths: fc.integer({ min: 3, max: 24 }),
});

/** Generate valid NEC params */
const validNecParamsArb: fc.Arbitrary<NecParams> = fc.record({
  earlyWarningWeeks: fc.integer({ min: 1, max: 12 }),
  compensationEventNotificationWeeks: fc.integer({ min: 1, max: 12 }),
  programmeSubmissionIntervalWeeks: fc.integer({ min: 1, max: 8 }),
});

/** Generate valid GCC params */
const validGccParamsArb: fc.Arbitrary<GccParams> = fc.record({
  advanceWarningWorkingDays: fc.integer({ min: 1, max: 60 }),
  penaltyRatePerDay: fc.double({ min: 0.01, max: 10000, noNaN: true }),
  firstStageClaimWorkingDays: fc.integer({ min: 5, max: 60 }),
  secondStageClaimWorkingDays: fc.integer({ min: 5, max: 60 }),
  deemedRejectionWorkingDays: fc.integer({ min: 5, max: 60 }),
});

/** Generate valid FIDIC params */
const validFidicParamsArb: fc.Arbitrary<FidicParams> = fc.record({
  timeForCompletionDays: fc.integer({ min: 1, max: 3650 }),
  defectsNotificationDays: fc.integer({ min: 365, max: 1095 }),
  dabComposition: fc.constantFrom(1, 3) as fc.Arbitrary<1 | 3>,
});

/** Generate valid form-specific params matching a given contract form */
function validFormParamsForForm(form: ContractForm): fc.Arbitrary<FormSpecificParams> {
  switch (form) {
    case 'jbcc_pba': return validJbccParamsArb;
    case 'nec_ecc': return validNecParamsArb;
    case 'gcc_2025': return validGccParamsArb;
    case 'fidic': return validFidicParamsArb;
  }
}

/** Generate a fully valid ContractSetupInput */
const validInputArb: fc.Arbitrary<ContractSetupInput> = validContractFormArb.chain((form) =>
  validCommencementDateArb.chain((commencementDate) =>
    fc.tuple(
      validProjectIdArb,
      validPartiesArb,
      validCompletionDateAfter(commencementDate),
      validContractSumArb,
      validFormParamsForForm(form),
      validSetupByArb,
    ).map(([projectId, parties, completionDate, contractSum, formParams, setupBy]) => ({
      projectId,
      contractForm: form,
      parties,
      commencementDate,
      practicalCompletionDate: completionDate,
      contractSum,
      clauseElections: [],
      formSpecificParams: formParams,
      setupBy,
    }))
  )
);

// ══════════════════════════════════════════════════════════════════════════════
// Generators — Invalid Field Mutations
// ══════════════════════════════════════════════════════════════════════════════

/** Mutation strategies that make specific fields invalid */
type Mutation = {
  name: string;
  expectedField: string | string[];
  apply: (input: ContractSetupInput) => ContractSetupInput;
};

const mutations: Mutation[] = [
  // ── projectId invalid ─────────────────────────────────────────────────
  {
    name: 'empty projectId',
    expectedField: 'projectId',
    apply: (input) => ({ ...input, projectId: '' }),
  },
  {
    name: 'whitespace-only projectId',
    expectedField: 'projectId',
    apply: (input) => ({ ...input, projectId: '   ' }),
  },
  // ── contractForm invalid ──────────────────────────────────────────────
  {
    name: 'invalid contract form',
    expectedField: 'contractForm',
    apply: (input) => ({ ...input, contractForm: 'invalid_form' as ContractForm }),
  },
  // ── parties invalid ───────────────────────────────────────────────────
  {
    name: 'fewer than 2 parties',
    expectedField: 'parties',
    apply: (input) => ({ ...input, parties: [input.parties[0]] }),
  },
  {
    name: 'missing employer role',
    expectedField: 'parties',
    apply: (input) => ({
      ...input,
      parties: input.parties.map((p) =>
        p.role === 'employer' ? { ...p, role: 'observer' } : p
      ),
    }),
  },
  {
    name: 'missing contractor role',
    expectedField: 'parties',
    apply: (input) => ({
      ...input,
      parties: input.parties.map((p) =>
        p.role === 'contractor' ? { ...p, role: 'observer' } : p
      ),
    }),
  },
  // ── commencementDate invalid ──────────────────────────────────────────
  {
    name: 'invalid commencement date format',
    expectedField: 'commencementDate',
    apply: (input) => ({ ...input, commencementDate: '2024/01/15' }),
  },
  {
    name: 'empty commencement date',
    expectedField: 'commencementDate',
    apply: (input) => ({ ...input, commencementDate: '' }),
  },
  // ── practicalCompletionDate invalid ───────────────────────────────────
  {
    name: 'completion date before commencement',
    expectedField: 'practicalCompletionDate',
    apply: (input) => ({
      ...input,
      commencementDate: '2025-06-15',
      practicalCompletionDate: '2025-06-15', // equal, not after
    }),
  },
  {
    name: 'invalid completion date format',
    expectedField: 'practicalCompletionDate',
    apply: (input) => ({ ...input, practicalCompletionDate: 'not-a-date' }),
  },
  // ── contractSum invalid ───────────────────────────────────────────────
  {
    name: 'contract sum below minimum',
    expectedField: 'contractSum',
    apply: (input) => ({ ...input, contractSum: 0.5 }),
  },
  {
    name: 'contract sum above maximum',
    expectedField: 'contractSum',
    apply: (input) => ({ ...input, contractSum: 1_000_000_000_000 }),
  },
  // ── setupBy invalid ────────────────────────────────────────────────────
  {
    name: 'empty setupBy',
    expectedField: 'setupBy',
    apply: (input) => ({ ...input, setupBy: '' }),
  },
  {
    name: 'whitespace-only setupBy',
    expectedField: 'setupBy',
    apply: (input) => ({ ...input, setupBy: '   ' }),
  },
  // ── formSpecificParams invalid ────────────────────────────────────────
  {
    name: 'missing formSpecificParams',
    expectedField: 'formSpecificParams',
    apply: (input) => ({ ...input, formSpecificParams: undefined as unknown as FormSpecificParams }),
  },
];

// ══════════════════════════════════════════════════════════════════════════════
// Generators — Form-Specific Invalid Params
// ══════════════════════════════════════════════════════════════════════════════

/** Generate invalid JBCC params (at least one param out of range) */
const invalidJbccParamsArb: fc.Arbitrary<JbccParams> = fc.oneof(
  fc.record({
    interimPaymentPeriodDays: fc.integer({ min: -100, max: 0 }),
    penaltyRatePerDay: fc.double({ min: 0.01, max: 100, noNaN: true }),
    retentionPercentage: fc.double({ min: 0, max: 10, noNaN: true }),
    defectsLiabilityMonths: fc.integer({ min: 3, max: 24 }),
  }),
  fc.record({
    interimPaymentPeriodDays: fc.integer({ min: 1, max: 90 }),
    penaltyRatePerDay: fc.double({ min: -100, max: 0.009, noNaN: true }),
    retentionPercentage: fc.double({ min: 0, max: 10, noNaN: true }),
    defectsLiabilityMonths: fc.integer({ min: 3, max: 24 }),
  }),
  fc.record({
    interimPaymentPeriodDays: fc.integer({ min: 1, max: 90 }),
    penaltyRatePerDay: fc.double({ min: 0.01, max: 100, noNaN: true }),
    retentionPercentage: fc.double({ min: 11, max: 100, noNaN: true }),
    defectsLiabilityMonths: fc.integer({ min: 3, max: 24 }),
  }),
  fc.record({
    interimPaymentPeriodDays: fc.integer({ min: 1, max: 90 }),
    penaltyRatePerDay: fc.double({ min: 0.01, max: 100, noNaN: true }),
    retentionPercentage: fc.double({ min: 0, max: 10, noNaN: true }),
    defectsLiabilityMonths: fc.oneof(fc.integer({ min: -10, max: 2 }), fc.integer({ min: 25, max: 100 })),
  }),
);

/** Generate invalid NEC params (at least one param out of range) */
const invalidNecParamsArb: fc.Arbitrary<NecParams> = fc.oneof(
  fc.record({
    earlyWarningWeeks: fc.oneof(fc.integer({ min: -10, max: 0 }), fc.integer({ min: 13, max: 100 })),
    compensationEventNotificationWeeks: fc.integer({ min: 1, max: 12 }),
    programmeSubmissionIntervalWeeks: fc.integer({ min: 1, max: 8 }),
  }),
  fc.record({
    earlyWarningWeeks: fc.integer({ min: 1, max: 12 }),
    compensationEventNotificationWeeks: fc.oneof(fc.integer({ min: -10, max: 0 }), fc.integer({ min: 13, max: 100 })),
    programmeSubmissionIntervalWeeks: fc.integer({ min: 1, max: 8 }),
  }),
  fc.record({
    earlyWarningWeeks: fc.integer({ min: 1, max: 12 }),
    compensationEventNotificationWeeks: fc.integer({ min: 1, max: 12 }),
    programmeSubmissionIntervalWeeks: fc.oneof(fc.integer({ min: -10, max: 0 }), fc.integer({ min: 9, max: 100 })),
  }),
);

/** Generate invalid GCC params (at least one param out of range) */
const invalidGccParamsArb: fc.Arbitrary<GccParams> = fc.oneof(
  fc.record({
    advanceWarningWorkingDays: fc.oneof(fc.integer({ min: -10, max: 0 }), fc.integer({ min: 61, max: 200 })),
    penaltyRatePerDay: fc.double({ min: 0.01, max: 100, noNaN: true }),
    firstStageClaimWorkingDays: fc.integer({ min: 5, max: 60 }),
    secondStageClaimWorkingDays: fc.integer({ min: 5, max: 60 }),
    deemedRejectionWorkingDays: fc.integer({ min: 5, max: 60 }),
  }),
  fc.record({
    advanceWarningWorkingDays: fc.integer({ min: 1, max: 60 }),
    penaltyRatePerDay: fc.double({ min: -100, max: 0.009, noNaN: true }),
    firstStageClaimWorkingDays: fc.integer({ min: 5, max: 60 }),
    secondStageClaimWorkingDays: fc.integer({ min: 5, max: 60 }),
    deemedRejectionWorkingDays: fc.integer({ min: 5, max: 60 }),
  }),
  fc.record({
    advanceWarningWorkingDays: fc.integer({ min: 1, max: 60 }),
    penaltyRatePerDay: fc.double({ min: 0.01, max: 100, noNaN: true }),
    firstStageClaimWorkingDays: fc.oneof(fc.integer({ min: -10, max: 4 }), fc.integer({ min: 61, max: 200 })),
    secondStageClaimWorkingDays: fc.integer({ min: 5, max: 60 }),
    deemedRejectionWorkingDays: fc.integer({ min: 5, max: 60 }),
  }),
);

/** Generate invalid FIDIC params (at least one param out of range) */
const invalidFidicParamsArb: fc.Arbitrary<FidicParams> = fc.oneof(
  fc.record({
    timeForCompletionDays: fc.oneof(fc.integer({ min: -10, max: 0 }), fc.integer({ min: 3651, max: 10000 })),
    defectsNotificationDays: fc.integer({ min: 365, max: 1095 }),
    dabComposition: fc.constantFrom(1, 3) as fc.Arbitrary<1 | 3>,
  }),
  fc.record({
    timeForCompletionDays: fc.integer({ min: 1, max: 3650 }),
    defectsNotificationDays: fc.oneof(fc.integer({ min: 0, max: 364 }), fc.integer({ min: 1096, max: 5000 })),
    dabComposition: fc.constantFrom(1, 3) as fc.Arbitrary<1 | 3>,
  }),
  fc.record({
    timeForCompletionDays: fc.integer({ min: 1, max: 3650 }),
    defectsNotificationDays: fc.integer({ min: 365, max: 1095 }),
    dabComposition: fc.constantFrom(2, 4, 5, 0) as unknown as fc.Arbitrary<1 | 3>,
  }),
);

/** Generate an invalid form-specific params for the given form */
function invalidFormParamsForForm(form: ContractForm): fc.Arbitrary<FormSpecificParams> {
  switch (form) {
    case 'jbcc_pba': return invalidJbccParamsArb;
    case 'nec_ecc': return invalidNecParamsArb;
    case 'gcc_2025': return invalidGccParamsArb;
    case 'fidic': return invalidFidicParamsArb;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 2: Validation Rejects Incomplete Submissions
// **Validates: Requirements 1.10, 5.2, 6.5, 8.8**
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 2: Validation Rejects Incomplete Submissions', () => {
  it('rejects any input where a single mandatory field is invalid, identifying the field', () => {
    fc.assert(
      fc.property(validInputArb, fc.constantFrom(...mutations), (validInput, mutation) => {
        const invalidInput = mutation.apply(validInput);
        const result = validateContractSetup(invalidInput);

        // Must be rejected
        expect(result.valid).toBe(false);

        // Must have at least one error
        expect(result.errors.length).toBeGreaterThan(0);

        // The expected invalid field must be reported in the errors
        const errorFields = result.errors.map((e) => e.field);
        const expectedFields = Array.isArray(mutation.expectedField)
          ? mutation.expectedField
          : [mutation.expectedField];
        for (const field of expectedFields) {
          expect(errorFields).toContain(field);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('rejects inputs with invalid form-specific parameters and reports the specific param field', () => {
    fc.assert(
      fc.property(
        validContractFormArb.chain((form) =>
          fc.tuple(
            fc.constant(form),
            validCommencementDateArb.chain((commDate) =>
              fc.tuple(
                fc.constant(commDate),
                validCompletionDateAfter(commDate),
              )
            ),
            validProjectIdArb,
            validPartiesArb,
            validContractSumArb,
            invalidFormParamsForForm(form),
            validSetupByArb,
          )
        ),
        ([form, [commDate, compDate], projectId, parties, contractSum, invalidParams, setupBy]) => {
          const input: ContractSetupInput = {
            projectId,
            contractForm: form,
            parties,
            commencementDate: commDate,
            practicalCompletionDate: compDate,
            contractSum,
            clauseElections: [],
            formSpecificParams: invalidParams,
            setupBy,
          };

          const result = validateContractSetup(input);

          // Must be rejected
          expect(result.valid).toBe(false);

          // Must report at least one error in formSpecificParams
          const errorFields = result.errors.map((e) => e.field);
          const hasFormParamError = errorFields.some((f) => f.startsWith('formSpecificParams.'));
          expect(hasFormParamError).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('a fully valid input passes validation', () => {
    fc.assert(
      fc.property(validInputArb, (input) => {
        const result = validateContractSetup(input);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }),
      { numRuns: 200 },
    );
  });

  it('reports multiple errors when multiple fields are invalid simultaneously', () => {
    fc.assert(
      fc.property(
        validInputArb,
        fc.uniqueArray(fc.integer({ min: 0, max: mutations.length - 1 }), { minLength: 2, maxLength: 4 }),
        (validInput, mutationIndices) => {
          // Apply multiple mutations
          let invalidInput = { ...validInput };
          const appliedFields = new Set<string>();

          for (const idx of mutationIndices) {
            const mutation = mutations[idx];
            invalidInput = mutation.apply(invalidInput);
            const fields = Array.isArray(mutation.expectedField)
              ? mutation.expectedField
              : [mutation.expectedField];
            for (const f of fields) {
              appliedFields.add(f);
            }
          }

          const result = validateContractSetup(invalidInput);

          // Must be rejected
          expect(result.valid).toBe(false);

          // Must report at least as many errors as distinct invalid fields
          // (some mutations may cause additional cascading errors)
          expect(result.errors.length).toBeGreaterThanOrEqual(1);

          // At least one of the expected fields must appear in errors
          const errorFields = new Set(result.errors.map((e) => e.field));
          const hasAtLeastOneExpected = [...appliedFields].some((f) => errorFields.has(f));
          expect(hasAtLeastOneExpected).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('every error has a non-empty field name and message', () => {
    fc.assert(
      fc.property(validInputArb, fc.constantFrom(...mutations), (validInput, mutation) => {
        const invalidInput = mutation.apply(validInput);
        const result = validateContractSetup(invalidInput);

        for (const error of result.errors) {
          expect(error.field).toBeDefined();
          expect(error.field.length).toBeGreaterThan(0);
          expect(error.message).toBeDefined();
          expect(error.message.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});
