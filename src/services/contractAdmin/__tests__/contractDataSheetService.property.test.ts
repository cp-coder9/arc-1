/**
 * Property-Based Tests for ContractDataSheetService — Data Sheet Completeness
 *
 * **Property 3: Contract Data Sheet Completeness**
 * For any valid ContractConfig with N parties and M parameters, verify output
 * contains all N parties and all M parameters.
 *
 * **Validates: Requirements 2.1, 2.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  getNamedPersons,
  getKeyDates,
  getCommercialRates,
  getDataSheet,
} from '../contractDataSheetService';
import type {
  ContractConfig,
  ContractForm,
  ContractParty,
  ClauseElection,
  JbccParams,
  NecParams,
  GccParams,
  FidicParams,
  FormSpecificParams,
  ContractProjectAssignment,
} from '../contractTypes';
import type { UserRole } from '@/types';

// ══════════════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════════════

const CONTRACT_FORMS: ContractForm[] = ['jbcc_pba', 'nec_ecc', 'gcc_2025', 'fidic'];

const PARTY_ROLES = [
  'employer',
  'contractor',
  'principal_agent',
  'employer_agent',
  'quantity_surveyor',
  'subcontractor',
] as const;

// ══════════════════════════════════════════════════════════════════════════════
// Arbitraries (Generators)
// ══════════════════════════════════════════════════════════════════════════════

/** Generate a random contract party */
const partyArb: fc.Arbitrary<ContractParty> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  role: fc.constantFrom(...PARTY_ROLES),
  userId: fc.option(fc.uuid(), { nil: undefined }),
  contactEmail: fc.option(fc.emailAddress(), { nil: undefined }),
});

/** Generate 2–10 random parties (min 2: employer + contractor per spec) */
const partiesArb: fc.Arbitrary<ContractParty[]> = fc
  .array(partyArb, { minLength: 2, maxLength: 10 })
  .map((parties) => {
    // Ensure at least employer and contractor roles are present
    if (!parties.some((p) => p.role === 'employer')) {
      parties[0] = { ...parties[0], role: 'employer' };
    }
    if (!parties.some((p) => p.role === 'contractor')) {
      parties[1] = { ...parties[1], role: 'contractor' };
    }
    return parties;
  });

/** Generate JBCC-specific params within valid ranges */
const jbccParamsArb: fc.Arbitrary<JbccParams> = fc.record({
  interimPaymentPeriodDays: fc.integer({ min: 1, max: 90 }),
  penaltyRatePerDay: fc.double({ min: 0.01, max: 100000, noNaN: true }),
  retentionPercentage: fc.double({ min: 0.0, max: 10.0, noNaN: true }),
  defectsLiabilityMonths: fc.integer({ min: 3, max: 24 }),
});

/** Generate NEC-specific params within valid ranges */
const necParamsArb: fc.Arbitrary<NecParams> = fc.record({
  earlyWarningWeeks: fc.integer({ min: 1, max: 12 }),
  compensationEventNotificationWeeks: fc.integer({ min: 1, max: 12 }),
  programmeSubmissionIntervalWeeks: fc.integer({ min: 1, max: 8 }),
});

/** Generate GCC-specific params within valid ranges */
const gccParamsArb: fc.Arbitrary<GccParams> = fc.record({
  advanceWarningWorkingDays: fc.integer({ min: 1, max: 60 }),
  penaltyRatePerDay: fc.double({ min: 0.01, max: 100000, noNaN: true }),
  firstStageClaimWorkingDays: fc.integer({ min: 5, max: 60 }),
  secondStageClaimWorkingDays: fc.integer({ min: 5, max: 60 }),
  deemedRejectionWorkingDays: fc.integer({ min: 5, max: 60 }),
});

/** Generate FIDIC-specific params within valid ranges */
const fidicParamsArb: fc.Arbitrary<FidicParams> = fc.record({
  timeForCompletionDays: fc.integer({ min: 1, max: 3650 }),
  defectsNotificationDays: fc.integer({ min: 365, max: 1095 }),
  dabComposition: fc.constantFrom(1 as const, 3 as const),
});

/** Generate form-specific params based on selected form */
function formSpecificParamsArb(form: ContractForm): fc.Arbitrary<FormSpecificParams> {
  switch (form) {
    case 'jbcc_pba':
      return jbccParamsArb;
    case 'nec_ecc':
      return necParamsArb;
    case 'gcc_2025':
      return gccParamsArb;
    case 'fidic':
      return fidicParamsArb;
  }
}

/** Generate random clause elections (0–5 elected) */
const clauseElectionsArb: fc.Arbitrary<ClauseElection[]> = fc.array(
  fc.record({
    clauseNumber: fc.stringMatching(/^\d{1,2}\.\d{1,2}$/),
    clauseTitle: fc.string({ minLength: 5, maxLength: 80 }),
    elected: fc.boolean(),
    parameters: fc.option(
      fc.dictionary(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.oneof(fc.integer(), fc.string({ minLength: 1, maxLength: 20 }))
      ),
      { nil: undefined }
    ),
  }),
  { minLength: 0, maxLength: 5 }
);

/** Generate an ISO date string in a reasonable range */
const isoDateArb: fc.Arbitrary<string> = fc
  .integer({ min: 0, max: 3650 })
  .map((daysOffset) => {
    const base = new Date('2020-01-01T00:00:00Z');
    base.setUTCDate(base.getUTCDate() + daysOffset);
    return base.toISOString().split('T')[0];
  });

/**
 * Generate a valid ContractConfig with varying parties, form, and parameters.
 * The contract form is chosen first, then form-specific params are generated
 * to match that form.
 */
const contractConfigArb: fc.Arbitrary<ContractConfig> = fc
  .constantFrom(...CONTRACT_FORMS)
  .chain((form) =>
    fc.tuple(
      fc.constant(form),
      partiesArb,
      formSpecificParamsArb(form),
      clauseElectionsArb,
      isoDateArb,
      isoDateArb,
      fc.double({ min: 1.0, max: 999_999_999_999.99, noNaN: true }),
    ).map(([contractForm, parties, formSpecificParams, clauseElections, commencement, completion, contractSum]) => {
      // Ensure completion is after commencement
      const startDate = new Date(commencement);
      const endDate = new Date(completion);
      const practicalCompletionDate =
        endDate > startDate
          ? completion
          : new Date(startDate.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const config: ContractConfig = {
        id: 'config-test',
        projectId: 'proj-test',
        contractForm,
        parties,
        commencementDate: commencement,
        practicalCompletionDate,
        contractSum,
        clauseElections,
        formSpecificParams,
        status: 'active',
        setupBy: 'user-test',
        setupAt: new Date().toISOString(),
      };
      return config;
    })
  );

/** Generate a project assignment for an architect with full team member access */
const assignmentArb: fc.Arbitrary<ContractProjectAssignment> = fc.constant({
  projectId: 'proj-test',
  userId: 'user-test',
  roles: ['architect'] as UserRole[],
  isAssignedTeamMember: true,
  isAssignedContractor: false,
  isAssignedSubcontractor: false,
  isProjectOwner: false,
  isAssignedSiteManager: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// Property Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 3: Contract Data Sheet Completeness', () => {
  it('getNamedPersons returns exactly N parties matching the input', () => {
    fc.assert(
      fc.property(contractConfigArb, (config) => {
        const result = getNamedPersons(config);

        // Must contain exactly N parties
        expect(result.parties.length).toBe(config.parties.length);
        expect(result.totalParties).toBe(config.parties.length);

        // Every input party must appear in the output by id
        for (const inputParty of config.parties) {
          const found = result.parties.find((p) => p.id === inputParty.id);
          expect(found).toBeDefined();
          expect(found!.name).toBe(inputParty.name);
          expect(found!.role).toBe(inputParty.role);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('getKeyDates returns all 5 date fields (configured or pending)', () => {
    fc.assert(
      fc.property(contractConfigArb, (config) => {
        const result = getKeyDates(config);

        // All 5 key date fields must be present in the output
        expect(result.commencementDate).toBeDefined();
        expect(result.commencementDate.label).toBe('Commencement Date');

        expect(result.practicalCompletionDate).toBeDefined();
        expect(result.practicalCompletionDate.label).toBe('Practical Completion Date');

        expect(result.revisedCompletionDate).toBeDefined();
        expect(result.revisedCompletionDate.label).toBe('Revised Completion Date');

        expect(result.defectsLiabilityEndDate).toBeDefined();
        expect(result.defectsLiabilityEndDate.label).toBe('Defects Liability End Date');

        expect(result.finalAccountDate).toBeDefined();
        expect(result.finalAccountDate.label).toBe('Final Account Date');

        // Each field has a `configured` indicator (never omitted from display)
        for (const field of [
          result.commencementDate,
          result.practicalCompletionDate,
          result.revisedCompletionDate,
          result.defectsLiabilityEndDate,
          result.finalAccountDate,
        ]) {
          expect(typeof field.configured).toBe('boolean');
        }
      }),
      { numRuns: 200 }
    );
  });

  it('getCommercialRates returns all 4 rate fields (configured or pending)', () => {
    fc.assert(
      fc.property(contractConfigArb, (config) => {
        const result = getCommercialRates(config);

        // All 4 commercial rate fields must be present
        expect(result.penaltyRatePerDay).toBeDefined();
        expect(result.penaltyRatePerDay.label).toBe('Penalty Rate per Day (ZAR)');

        expect(result.retentionPercentage).toBeDefined();
        expect(result.retentionPercentage.label).toBe('Retention Percentage (%)');

        expect(result.performanceGuaranteePercentage).toBeDefined();
        expect(result.performanceGuaranteePercentage.label).toBe('Performance Guarantee (%)');

        expect(result.insuranceRequirements).toBeDefined();
        expect(result.insuranceRequirements.label).toBe('Insurance Requirements');

        // Each field has a `configured` indicator (never omitted)
        for (const field of [
          result.penaltyRatePerDay,
          result.retentionPercentage,
          result.performanceGuaranteePercentage,
          result.insuranceRequirements,
        ]) {
          expect(typeof field.configured).toBe('boolean');
        }
      }),
      { numRuns: 200 }
    );
  });

  it('getDataSheet never omits any party or parameter field', () => {
    fc.assert(
      fc.property(contractConfigArb, assignmentArb, (config, assignment) => {
        const userRole: UserRole = 'architect';
        const dataSheet = getDataSheet(config, userRole, assignment);

        // Contract form field is present
        expect(dataSheet.contractForm).toBeDefined();
        expect(dataSheet.contractForm.label).toBe('Contract Form');

        // Contract sum field is present
        expect(dataSheet.contractSum).toBeDefined();
        expect(dataSheet.contractSum.label).toBe('Contract Sum (ZAR)');

        // Status field is present
        expect(dataSheet.status).toBeDefined();
        expect(dataSheet.status.label).toBe('Contract Status');

        // All N parties present in namedPersons
        expect(dataSheet.namedPersons.parties.length).toBe(config.parties.length);
        expect(dataSheet.namedPersons.totalParties).toBe(config.parties.length);

        // Every party from input appears in output
        for (const inputParty of config.parties) {
          const found = dataSheet.namedPersons.parties.find((p) => p.id === inputParty.id);
          expect(found).toBeDefined();
        }

        // All 5 key dates present
        expect(dataSheet.keyDates.commencementDate).toBeDefined();
        expect(dataSheet.keyDates.practicalCompletionDate).toBeDefined();
        expect(dataSheet.keyDates.revisedCompletionDate).toBeDefined();
        expect(dataSheet.keyDates.defectsLiabilityEndDate).toBeDefined();
        expect(dataSheet.keyDates.finalAccountDate).toBeDefined();

        // All 4 commercial rates present
        expect(dataSheet.commercialRates.penaltyRatePerDay).toBeDefined();
        expect(dataSheet.commercialRates.retentionPercentage).toBeDefined();
        expect(dataSheet.commercialRates.performanceGuaranteePercentage).toBeDefined();
        expect(dataSheet.commercialRates.insuranceRequirements).toBeDefined();

        // Elected clauses count field is present
        expect(dataSheet.electedClausesCount).toBeDefined();
        expect(dataSheet.electedClausesCount.label).toBe('Elected Optional Clauses');

        // canEdit flag is present (boolean)
        expect(typeof dataSheet.canEdit).toBe('boolean');
      }),
      { numRuns: 200 }
    );
  });

  it('configured values from input are never omitted — every party name and role appear in output', () => {
    fc.assert(
      fc.property(contractConfigArb, (config) => {
        const result = getNamedPersons(config);

        // Key invariant: no configured value from input is ever omitted
        for (const inputParty of config.parties) {
          const outputParty = result.parties.find((p) => p.id === inputParty.id);
          expect(outputParty).toBeDefined();

          // Name is never omitted
          expect(outputParty!.name).toBe(inputParty.name);

          // Role is never omitted
          expect(outputParty!.role).toBe(inputParty.role);

          // Contact email: if configured in input, must appear configured in output
          if (inputParty.contactEmail) {
            expect(outputParty!.contactEmail.configured).toBe(true);
            expect(outputParty!.contactEmail.value).toBe(inputParty.contactEmail);
          }

          // UserId: if configured in input, must appear configured in output
          if (inputParty.userId) {
            expect(outputParty!.userId.configured).toBe(true);
            expect(outputParty!.userId.value).toBe(inputParty.userId);
          }
        }
      }),
      { numRuns: 200 }
    );
  });
});
