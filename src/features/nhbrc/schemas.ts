/**
 * NHBRC Enrolment Module — Zod Validation Schemas
 *
 * Validation schemas for enrolment inputs, inspection records,
 * warranty claims, and builder verification inputs.
 * Requirements: 12.2, 13.1, 13.2, 14.1, 14.2
 */

import { z } from 'zod';

// ─── Enrolment Input Schema ──────────────────────────────────────────────────

export const enrolmentInputSchema = z.object({
  builderRegistrationNumber: z.string().regex(/^[a-zA-Z0-9]+$/).min(4).max(20).optional(),
  numberOfUnits: z.number().int().min(1).max(10000),
  estimatedValuePerUnit: z.number().min(0.01).max(999_999_999.99),
});

// ─── Inspection Record Schema ─────────────────────────────────────────────────

export const inspectionRecordSchema = z.object({
  unitId: z.string().min(1),
  stage: z.enum(['foundation', 'wall_plate', 'roof', 'completion']),
  inspectionDate: z.string().date(),
  inspectorName: z.string().min(1).max(200),
  outcome: z.enum(['passed', 'failed', 'conditionally_passed']),
  conditionsOrDefects: z.string().max(2000).optional(),
  evidenceRefs: z.array(z.string()).max(20).default([]),
  conditionDeadline: z.string().date().optional(),
}).refine(data => {
  if (data.outcome === 'failed' || data.outcome === 'conditionally_passed') {
    return data.conditionsOrDefects !== undefined && data.conditionsOrDefects.length > 0;
  }
  return true;
}, { message: 'Conditions/defects description is required when outcome is failed or conditionally passed' });

// ─── Warranty Claim Schema ────────────────────────────────────────────────────

export const warrantyClaimSchema = z.object({
  unitId: z.string().min(1),
  claimantName: z.string().min(1).max(200),
  claimantContact: z.string().min(1).max(200),
  defectDescription: z.string().min(1).max(2000),
  defectCategory: z.enum(['structural', 'roof_waterproofing', 'wall_waterproofing']),
  defectDiscoveredDate: z.string().date(),
  practicalCompletionDate: z.string().date(),
  evidenceRefs: z.array(z.string()).min(1).max(20),
});

// ─── Builder Verification Schema ──────────────────────────────────────────────

export const builderVerificationSchema = z.object({
  builderName: z.string().min(2).max(200),
  registrationNumber: z.string().regex(/^[a-zA-Z0-9]+$/).min(4).max(20),
  verificationDate: z.string().date(),
}).refine(data => new Date(data.verificationDate) <= new Date(), {
  message: 'Verification date must not be in the future',
});

// ─── Inferred Types ───────────────────────────────────────────────────────────

/** Validated input type for NHBRC enrolment creation. */
export type EnrolmentInput = z.infer<typeof enrolmentInputSchema>;

/** Validated input type for inspection record creation. */
export type InspectionRecordInput = z.infer<typeof inspectionRecordSchema>;

/** Validated input type for warranty claim registration. */
export type WarrantyClaimInput = z.infer<typeof warrantyClaimSchema>;

/** Validated input type for builder verification. */
export type BuilderVerificationInput = z.infer<typeof builderVerificationSchema>;
