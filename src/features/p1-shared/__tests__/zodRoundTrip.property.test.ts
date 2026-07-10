// @vitest-environment node
/**
 * Property-Based Tests: Zod Schema Validation Round-Trip
 *
 * Feature: p1-platform-extensions, Property 24: Zod Schema Validation Round-Trip
 *
 * Validates: Requirements 1.8, 3.9, 5.5, 14.2, 16.5, 17.11, 18.8
 *
 * For any valid domain object that passes its Zod schema validation,
 * serializing to JSON and parsing back through the same schema shall produce
 * an equivalent object. For any object with at least one field violating
 * schema constraints, validation shall reject with a non-empty error.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { insurancePolicySchema, claimsNotificationSchema } from '../../insurance-register/schemas';
import { formalClaimSchema } from '../../dispute-resolution/schemas';
import { inspectionRecordSchema, warrantyClaimSchema, builderVerificationSchema } from '../../nhbrc/schemas';
import { beaconSchema, measurementPairSchema, surveyInstructionSchema, sgDiagramSchema } from '../../survey-geomatics/schemas';

// ─── Arbitraries: Insurance Register ──────────────────────────────────────────

/** Generate a valid ISO date string YYYY-MM-DD in a reasonable range */
const isoDate = fc.date({
  min: new Date(2020, 0, 1),
  max: new Date(2028, 11, 31),
}).map((d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
});

/** Generate a past ISO date (for verification dates that must not be in the future) */
const pastIsoDate = fc.date({
  min: new Date(2020, 0, 1),
  max: new Date(2024, 11, 31),
}).map((d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
});

/** Generate a pair of dates where the second is after the first */
const orderedDatePair = fc.tuple(isoDate, isoDate).filter(([a, b]) => a < b);

/** Generate a pair where discoveryDate >= incidentDate */
const discoveryAfterIncident = fc.tuple(isoDate, isoDate)
  .filter(([inc, disc]) => disc >= inc);

const saPhone = fc.constantFrom('+27821234567', '+27119876543', '0821234567', '0711234567');
/** Generate emails that are valid per Zod's email validation (RFC 5322 subset) */
const email = fc.tuple(
  fc.stringMatching(/^[a-z]{1,10}$/),
  fc.stringMatching(/^[a-z]{1,8}$/),
  fc.constantFrom('com', 'co.za', 'org', 'net', 'io')
).map(([user, domain, tld]) => `${user}@${domain}.${tld}`);
const policyType = fc.constantFrom('CAR', 'PI', 'public_liability', 'SASRIA', 'LDI' as const);
const shortString = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);
const medString = fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0);

// ─── Generators: Insurance Policy ─────────────────────────────────────────────

const validInsurancePolicy = fc.record({
  policyType: policyType,
  insurerName: medString,
  policyNumber: shortString,
  policyholderName: medString,
  inceptionDate: fc.constant('2023-01-01'),
  expiryDate: fc.constant('2025-12-31'),
  sumInsured: fc.double({ min: 1, max: 999_999_999_999.99, noNaN: true }),
  excessAmount: fc.double({ min: 0, max: 999_999_999.99, noNaN: true }),
  brokerContactName: medString,
  brokerPhone: saPhone,
  brokerEmail: email,
});

// ─── Generators: Claims Notification ──────────────────────────────────────────

const claimCategory = fc.constantFrom(
  'property_damage', 'third_party_property_damage', 'third_party_bodily_injury',
  'professional_negligence', 'latent_defect', 'other'
);

const validClaimsNotification = fc.record({
  incidentDate: fc.constant('2024-01-15'),
  discoveryDate: fc.constant('2024-01-20'),
  affectedPolicyId: shortString,
  affectedPolicyType: policyType,
  description: fc.string({ minLength: 1, maxLength: 2000 }).filter(s => s.trim().length > 0),
  estimatedLoss: fc.double({ min: 0.01, max: 999_999_999.99, noNaN: true }),
  locationOnSite: fc.string({ maxLength: 500 }).map(s => s || undefined),
  category: claimCategory,
  evidenceRefs: fc.array(fc.string({ minLength: 1 }), { maxLength: 20 }),
});

// ─── Generators: Formal Claim ─────────────────────────────────────────────────

const claimType = fc.constantFrom('EoT', 'loss_and_expense', 'disruption', 'prolongation' as const);

const validFormalClaim = claimType.chain((type) => {
  const base = {
    claimType: fc.constant(type),
    causativeEventDate: fc.constant('2024-03-01'),
    notificationDate: fc.constant('2024-03-05'),
    contractClauseNumber: shortString,
    contractClauseTitle: shortString,
    briefDescription: fc.string({ minLength: 1, maxLength: 500 }).filter(s => s.trim().length > 0),
    detailedParticulars: fc.string({ maxLength: 5000 }).map(s => s || undefined),
  };

  if (type === 'loss_and_expense' || type === 'disruption') {
    return fc.record({
      ...base,
      amountClaimed: fc.double({ min: 0.01, max: 999_999_999.99, noNaN: true }),
      timeClaimed: fc.constant(undefined),
    });
  }
  // EoT or prolongation
  return fc.record({
    ...base,
    amountClaimed: fc.constant(undefined),
    timeClaimed: fc.integer({ min: 1, max: 999 }),
  });
});

// ─── Generators: Inspection Record ────────────────────────────────────────────

const inspectionStage = fc.constantFrom('foundation', 'wall_plate', 'roof', 'completion' as const);
const inspectionOutcome = fc.constantFrom('passed', 'failed', 'conditionally_passed' as const);

const validInspectionRecord = inspectionOutcome.chain((outcome) => {
  const base = {
    unitId: shortString,
    stage: inspectionStage,
    inspectionDate: isoDate,
    inspectorName: medString,
    outcome: fc.constant(outcome),
    evidenceRefs: fc.array(fc.string({ minLength: 1 }), { maxLength: 20 }),
  };

  if (outcome === 'failed' || outcome === 'conditionally_passed') {
    return fc.record({
      ...base,
      conditionsOrDefects: fc.string({ minLength: 1, maxLength: 2000 }).filter(s => s.trim().length > 0),
      conditionDeadline: isoDate.map(d => d as string | undefined),
    });
  }
  return fc.record({
    ...base,
    conditionsOrDefects: fc.constant(undefined),
    conditionDeadline: fc.constant(undefined),
  });
});

// ─── Generators: Warranty Claim ───────────────────────────────────────────────

const defectCategory = fc.constantFrom('structural', 'roof_waterproofing', 'wall_waterproofing' as const);

const validWarrantyClaim = fc.record({
  unitId: shortString,
  claimantName: medString,
  claimantContact: medString,
  defectDescription: fc.string({ minLength: 1, maxLength: 2000 }).filter(s => s.trim().length > 0),
  defectCategory: defectCategory,
  defectDiscoveredDate: fc.constant('2024-06-15'),
  practicalCompletionDate: fc.constant('2023-01-01'),
  evidenceRefs: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 20 }),
});

// ─── Generators: Builder Verification ─────────────────────────────────────────

const alphanumericRegNum = fc.stringMatching(/^[a-zA-Z0-9]{4,20}$/);

const validBuilderVerification = fc.record({
  builderName: fc.string({ minLength: 2, maxLength: 200 }).filter(s => s.trim().length >= 2),
  registrationNumber: alphanumericRegNum,
  verificationDate: pastIsoDate,
});

// ─── Generators: Beacon ───────────────────────────────────────────────────────

const beaconType = fc.constantFrom(
  'iron_peg', 'concrete_block', 'nail_in_tar', 'reference_mark', 'trigonometric_beacon', 'other' as const
);
const beaconCondition = fc.constantFrom('intact', 'damaged', 'missing', 'replaced' as const);
const beaconIdentifier = fc.stringMatching(/^[a-zA-Z0-9\-_]{1,50}$/);

const validBeaconWGS84 = fc.record({
  identifier: beaconIdentifier,
  beaconType: beaconType,
  coordinateSystem: fc.constant('WGS84' as const),
  latitude: fc.double({ min: -35.0, max: -22.0, noNaN: true }),
  longitude: fc.double({ min: 16.0, max: 33.0, noNaN: true }),
  yCoordinate: fc.constant(undefined),
  xCoordinate: fc.constant(undefined),
  condition: beaconCondition,
  dateLastInspected: isoDate,
  linkedDiagramRef: fc.string({ minLength: 1 }).map(s => s || undefined),
  notes: fc.string({ maxLength: 500 }).map(s => s || undefined),
});

const validBeaconHartebeesthoek = fc.record({
  identifier: beaconIdentifier,
  beaconType: beaconType,
  coordinateSystem: fc.constant('Hartebeesthoek94' as const),
  latitude: fc.constant(undefined),
  longitude: fc.constant(undefined),
  yCoordinate: fc.double({ min: -100000, max: 100000, noNaN: true }),
  xCoordinate: fc.double({ min: -4000000, max: -2000000, noNaN: true }),
  condition: beaconCondition,
  dateLastInspected: isoDate,
  linkedDiagramRef: fc.constant(undefined),
  notes: fc.constant(undefined),
});

const validBeacon = fc.oneof(validBeaconWGS84, validBeaconHartebeesthoek);

// ─── Generators: Measurement Pair ─────────────────────────────────────────────

const validMeasurementPair = fc.record({
  dimensionDescription: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
  approvedDimension: fc.double({ min: 0.001, max: 99999.999, noNaN: true }),
  asBuiltDimension: fc.double({ min: 0.001, max: 99999.999, noNaN: true }),
  toleranceThreshold: fc.double({ min: 0.001, max: 1.000, noNaN: true }),
});

// ─── Generators: Survey Instruction ───────────────────────────────────────────

const surveyType = fc.constantFrom(
  'boundary_determination', 'topographic_survey', 'as_built_survey',
  'sectional_title_survey', 'subdivision_survey', 'consolidation_survey',
  'general_purposes_diagram' as const
);

const validSurveyInstruction = fc.record({
  surveyType: surveyType,
  propertyDescription: fc.string({ minLength: 1, maxLength: 500 }).filter(s => s.trim().length > 0),
  scopeOfWork: fc.string({ minLength: 1, maxLength: 2000 }).filter(s => s.trim().length > 0),
  appointedSurveyorName: medString,
  appointedSurveyorPLATO: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
  appointedSurveyorId: fc.string({ minLength: 1 }).map(s => s || undefined),
  requiredCompletionDate: isoDate,
  linkedDocuments: fc.array(fc.string({ minLength: 1 }), { maxLength: 20 }),
  linkedTownPlanningAppId: fc.string({ minLength: 1 }).map(s => s || undefined),
});

// ─── Generators: SG Diagram ──────────────────────────────────────────────────

const sgDiagramType = fc.constantFrom(
  'general_plan', 'sectional_title', 'subdivision', 'consolidation', 'servitude' as const
);
const lodgementOffice = fc.constantFrom(
  'Cape Town', 'Pretoria', 'Pietermaritzburg', 'Bloemfontein', "King William's Town", 'Mthatha' as const
);

const validSgDiagram = fc.record({
  diagramReference: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  diagramType: sgDiagramType,
  linkedSurveyInstructionId: shortString,
  propertyDescription: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
  lodgementDate: isoDate,
  lodgementOffice: lodgementOffice,
  surveyorName: medString,
  surveyorPLATO: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
  expectedProcessingDays: fc.integer({ min: 1, max: 365 }),
});

// ─── Helper: Round-trip test function ─────────────────────────────────────────

function testRoundTrip<T>(schema: { parse: (data: unknown) => T; safeParse: (data: unknown) => { success: boolean; error?: { issues: unknown[] } } }, input: unknown): void {
  const parsed = schema.parse(input);
  const serialized = JSON.stringify(parsed);
  const deserialized = JSON.parse(serialized);
  const reParsed = schema.parse(deserialized);
  expect(reParsed).toEqual(parsed);
}

function testInvalidRejection(schema: { safeParse: (data: unknown) => { success: boolean; error?: { issues: unknown[] } } }, input: unknown): void {
  const result = schema.safeParse(input);
  expect(result.success).toBe(false);
  if (!result.success && result.error) {
    expect(result.error.issues.length).toBeGreaterThan(0);
  }
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Feature: p1-platform-extensions, Property 24: Zod Schema Validation Round-Trip', () => {

  // ────── Insurance Policy ──────────────────────────────────────────────────

  describe('insurancePolicySchema', () => {
    it('Valid round-trip: parsed insurance policy survives JSON serialization', () => {
      /**
       * **Validates: Requirements 1.8**
       *
       * For any object that passes insurancePolicySchema.parse(),
       * JSON round-trip produces same parse result.
       */
      fc.assert(
        fc.property(validInsurancePolicy, (input) => {
          testRoundTrip(insurancePolicySchema, input);
        }),
        { numRuns: 100 }
      );
    });

    it('Invalid rejection: objects with field violations are rejected with errors', () => {
      /**
       * **Validates: Requirements 1.8**
       *
       * For objects with field violations, schema.safeParse() returns errors.
       */
      fc.assert(
        fc.property(
          fc.record({
            policyType: fc.constant('INVALID_TYPE'),
            insurerName: fc.constant(''),
            policyNumber: fc.constant(''),
            policyholderName: fc.constant(''),
            inceptionDate: fc.constant('not-a-date'),
            expiryDate: fc.constant('also-not-a-date'),
            sumInsured: fc.constant(-1),
            excessAmount: fc.constant(-1),
            brokerContactName: fc.constant(''),
          }),
          (input) => {
            testInvalidRejection(insurancePolicySchema, input);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ────── Claims Notification ───────────────────────────────────────────────

  describe('claimsNotificationSchema', () => {
    it('Valid round-trip: parsed claims notification survives JSON serialization', () => {
      /**
       * **Validates: Requirements 3.9**
       *
       * For any object that passes claimsNotificationSchema.parse(),
       * JSON round-trip produces same parse result.
       */
      fc.assert(
        fc.property(validClaimsNotification, (input) => {
          testRoundTrip(claimsNotificationSchema, input);
        }),
        { numRuns: 100 }
      );
    });

    it('Invalid rejection: objects with field violations are rejected with errors', () => {
      /**
       * **Validates: Requirements 3.9**
       *
       * For objects with field violations, schema.safeParse() returns errors.
       */
      fc.assert(
        fc.property(
          fc.record({
            incidentDate: fc.constant('bad-date'),
            discoveryDate: fc.constant('bad-date'),
            affectedPolicyId: fc.constant(''),
            affectedPolicyType: fc.constant('UNKNOWN'),
            description: fc.constant(''),
            estimatedLoss: fc.constant(0),
          }),
          (input) => {
            testInvalidRejection(claimsNotificationSchema, input);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ────── Formal Claim ──────────────────────────────────────────────────────

  describe('formalClaimSchema', () => {
    it('Valid round-trip: parsed formal claim survives JSON serialization', () => {
      /**
       * **Validates: Requirements 5.5**
       *
       * For any object that passes formalClaimSchema.parse() with
       * type-specific required fields, JSON round-trip produces same result.
       */
      fc.assert(
        fc.property(validFormalClaim, (input) => {
          testRoundTrip(formalClaimSchema, input);
        }),
        { numRuns: 100 }
      );
    });

    it('Invalid rejection: objects with field violations are rejected with errors', () => {
      /**
       * **Validates: Requirements 5.5**
       *
       * For objects with field violations, schema.safeParse() returns errors.
       */
      fc.assert(
        fc.property(
          fc.record({
            claimType: fc.constant('INVALID'),
            causativeEventDate: fc.constant('not-date'),
            notificationDate: fc.constant('not-date'),
            contractClauseNumber: fc.constant(''),
            contractClauseTitle: fc.constant(''),
            briefDescription: fc.constant(''),
          }),
          (input) => {
            testInvalidRejection(formalClaimSchema, input);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ────── Inspection Record ─────────────────────────────────────────────────

  describe('inspectionRecordSchema', () => {
    it('Valid round-trip: parsed inspection record survives JSON serialization', () => {
      /**
       * **Validates: Requirements 14.2**
       *
       * For any object that passes inspectionRecordSchema.parse() with
       * outcome-dependent conditions, JSON round-trip produces same result.
       */
      fc.assert(
        fc.property(validInspectionRecord, (input) => {
          testRoundTrip(inspectionRecordSchema, input);
        }),
        { numRuns: 100 }
      );
    });

    it('Invalid rejection: objects with field violations are rejected with errors', () => {
      /**
       * **Validates: Requirements 14.2**
       *
       * For objects with field violations, schema.safeParse() returns errors.
       */
      fc.assert(
        fc.property(
          fc.record({
            unitId: fc.constant(''),
            stage: fc.constant('invalid_stage'),
            inspectionDate: fc.constant('bad'),
            inspectorName: fc.constant(''),
            outcome: fc.constant('invalid_outcome'),
          }),
          (input) => {
            testInvalidRejection(inspectionRecordSchema, input);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ────── Warranty Claim ────────────────────────────────────────────────────

  describe('warrantyClaimSchema', () => {
    it('Valid round-trip: parsed warranty claim survives JSON serialization', () => {
      /**
       * **Validates: Requirements 14.2**
       *
       * For any object that passes warrantyClaimSchema.parse() with
       * evidence min 1, JSON round-trip produces same result.
       */
      fc.assert(
        fc.property(validWarrantyClaim, (input) => {
          testRoundTrip(warrantyClaimSchema, input);
        }),
        { numRuns: 100 }
      );
    });

    it('Invalid rejection: objects with empty evidence array are rejected', () => {
      /**
       * **Validates: Requirements 14.2**
       *
       * For objects with empty evidenceRefs (min 1 required), safeParse returns errors.
       */
      fc.assert(
        fc.property(
          fc.record({
            unitId: shortString,
            claimantName: medString,
            claimantContact: medString,
            defectDescription: fc.string({ minLength: 1, maxLength: 2000 }).filter(s => s.trim().length > 0),
            defectCategory: defectCategory,
            defectDiscoveredDate: isoDate,
            practicalCompletionDate: isoDate,
            evidenceRefs: fc.constant([]),  // Violates min 1
          }),
          (input) => {
            testInvalidRejection(warrantyClaimSchema, input);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ────── Builder Verification ──────────────────────────────────────────────

  describe('builderVerificationSchema', () => {
    it('Valid round-trip: parsed builder verification survives JSON serialization', () => {
      /**
       * **Validates: Requirements 14.2**
       *
       * For any object that passes builderVerificationSchema.parse() with
       * non-future date, JSON round-trip produces same result.
       */
      fc.assert(
        fc.property(validBuilderVerification, (input) => {
          testRoundTrip(builderVerificationSchema, input);
        }),
        { numRuns: 100 }
      );
    });

    it('Invalid rejection: future verification date is rejected', () => {
      /**
       * **Validates: Requirements 14.2**
       *
       * For objects with a future verification date, safeParse returns errors.
       */
      fc.assert(
        fc.property(
          fc.record({
            builderName: medString,
            registrationNumber: alphanumericRegNum,
            verificationDate: fc.constant('2099-12-31'),  // Far future date
          }),
          (input) => {
            testInvalidRejection(builderVerificationSchema, input);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ────── Beacon ────────────────────────────────────────────────────────────

  describe('beaconSchema', () => {
    it('Valid round-trip: parsed beacon survives JSON serialization', () => {
      /**
       * **Validates: Requirements 18.8**
       *
       * For any object that passes beaconSchema.parse() with coordinate
       * system refinement, JSON round-trip produces same result.
       */
      fc.assert(
        fc.property(validBeacon, (input) => {
          testRoundTrip(beaconSchema, input);
        }),
        { numRuns: 100 }
      );
    });

    it('Invalid rejection: WGS84 beacon without lat/lng is rejected', () => {
      /**
       * **Validates: Requirements 18.8**
       *
       * For WGS84 beacons missing latitude/longitude, safeParse returns errors.
       */
      fc.assert(
        fc.property(
          fc.record({
            identifier: beaconIdentifier,
            beaconType: beaconType,
            coordinateSystem: fc.constant('WGS84' as const),
            latitude: fc.constant(undefined),  // Missing required for WGS84
            longitude: fc.constant(undefined), // Missing required for WGS84
            condition: beaconCondition,
            dateLastInspected: isoDate,
          }),
          (input) => {
            testInvalidRejection(beaconSchema, input);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ────── Measurement Pair ──────────────────────────────────────────────────

  describe('measurementPairSchema', () => {
    it('Valid round-trip: parsed measurement pair survives JSON serialization', () => {
      /**
       * **Validates: Requirements 16.5**
       *
       * For any object that passes measurementPairSchema.parse() with
       * numeric ranges, JSON round-trip produces same result.
       */
      fc.assert(
        fc.property(validMeasurementPair, (input) => {
          testRoundTrip(measurementPairSchema, input);
        }),
        { numRuns: 100 }
      );
    });

    it('Invalid rejection: out-of-range numeric values are rejected', () => {
      /**
       * **Validates: Requirements 16.5**
       *
       * For objects with out-of-range dimensions, safeParse returns errors.
       */
      fc.assert(
        fc.property(
          fc.record({
            dimensionDescription: fc.constant(''),  // min 1 violated
            approvedDimension: fc.constant(0),      // below min 0.001
            asBuiltDimension: fc.constant(100000),  // above max 99999.999
            toleranceThreshold: fc.constant(2.0),   // above max 1.000
          }),
          (input) => {
            testInvalidRejection(measurementPairSchema, input);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ────── Survey Instruction ────────────────────────────────────────────────

  describe('surveyInstructionSchema', () => {
    it('Valid round-trip: parsed survey instruction survives JSON serialization', () => {
      /**
       * **Validates: Requirements 16.5**
       *
       * For any object that passes surveyInstructionSchema.parse() with
       * all field constraints, JSON round-trip produces same result.
       */
      fc.assert(
        fc.property(validSurveyInstruction, (input) => {
          testRoundTrip(surveyInstructionSchema, input);
        }),
        { numRuns: 100 }
      );
    });

    it('Invalid rejection: objects with field violations are rejected with errors', () => {
      /**
       * **Validates: Requirements 16.5**
       *
       * For objects with field violations, schema.safeParse() returns errors.
       */
      fc.assert(
        fc.property(
          fc.record({
            surveyType: fc.constant('invalid_type'),
            propertyDescription: fc.constant(''),
            scopeOfWork: fc.constant(''),
            appointedSurveyorName: fc.constant(''),
            appointedSurveyorPLATO: fc.constant(''),
            requiredCompletionDate: fc.constant('not-a-date'),
          }),
          (input) => {
            testInvalidRejection(surveyInstructionSchema, input);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ────── SG Diagram ────────────────────────────────────────────────────────

  describe('sgDiagramSchema', () => {
    it('Valid round-trip: parsed SG diagram survives JSON serialization', () => {
      /**
       * **Validates: Requirements 17.11**
       *
       * For any object that passes sgDiagramSchema.parse() with
       * lodgement office enum, JSON round-trip produces same result.
       */
      fc.assert(
        fc.property(validSgDiagram, (input) => {
          testRoundTrip(sgDiagramSchema, input);
        }),
        { numRuns: 100 }
      );
    });

    it('Invalid rejection: objects with invalid lodgement office are rejected', () => {
      /**
       * **Validates: Requirements 17.11**
       *
       * For objects with invalid lodgement office, safeParse returns errors.
       */
      fc.assert(
        fc.property(
          fc.record({
            diagramReference: fc.constant(''),
            diagramType: fc.constant('invalid_type'),
            linkedSurveyInstructionId: fc.constant(''),
            propertyDescription: fc.constant(''),
            lodgementDate: fc.constant('bad-date'),
            lodgementOffice: fc.constant('Johannesburg'),  // Not a valid office
            surveyorName: fc.constant(''),
            surveyorPLATO: fc.constant(''),
          }),
          (input) => {
            testInvalidRejection(sgDiagramSchema, input);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
