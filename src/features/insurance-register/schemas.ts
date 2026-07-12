/**
 * Insurance Register Module — Zod Validation Schemas
 *
 * Validates insurance policy registration and claims notification inputs.
 * Requirements: 1.1, 1.8, 3.1, 3.9
 */

import { z } from 'zod';

// ─── Shared Patterns ──────────────────────────────────────────────────────────

/** South African phone number: +27 or 0 prefix, followed by 9 digits (first non-zero). */
const saPhoneRegex = /^(\+27|0)[1-9]\d{8}$/;

// ─── Insurance Policy Schema ──────────────────────────────────────────────────

export const insurancePolicySchema = z.object({
  policyType: z.enum(['CAR', 'PI', 'public_liability', 'SASRIA', 'LDI']),
  insurerName: z.string().min(1).max(200),
  policyNumber: z.string().min(1).max(100),
  policyholderName: z.string().min(1).max(200),
  inceptionDate: z.string().date(),
  expiryDate: z.string().date(),
  sumInsured: z.number().min(1).max(999_999_999_999.99),
  excessAmount: z.number().min(0).max(999_999_999.99),
  brokerContactName: z.string().min(1).max(200),
  brokerPhone: z.string().regex(saPhoneRegex).optional(),
  brokerEmail: z.string().email().optional(),
  notificationPeriodDays: z.number().int().min(1).max(365).optional(),
}).refine(data => new Date(data.expiryDate) > new Date(data.inceptionDate), {
  message: 'Expiry date must be after inception date',
}).refine(data => data.brokerPhone || data.brokerEmail, {
  message: 'At least one broker contact method (phone or email) is required',
});

// ─── Claims Notification Schema ───────────────────────────────────────────────

export const claimsNotificationSchema = z.object({
  incidentDate: z.string().date(),
  discoveryDate: z.string().date(),
  affectedPolicyId: z.string().min(1),
  affectedPolicyType: z.enum(['CAR', 'PI', 'public_liability', 'SASRIA', 'LDI']),
  description: z.string().min(1).max(2000),
  estimatedLoss: z.number().min(0.01).max(999_999_999.99),
  locationOnSite: z.string().max(500).optional(),
  category: z.enum([
    'property_damage',
    'third_party_property_damage',
    'third_party_bodily_injury',
    'professional_negligence',
    'latent_defect',
    'other',
  ]).optional(),
  evidenceRefs: z.array(z.string()).max(20).default([]),
  linkedRiskEventId: z.string().optional(),
}).refine(data => new Date(data.discoveryDate) >= new Date(data.incidentDate), {
  message: 'Discovery date must be on or after incident date',
});

// ─── Inferred Types ───────────────────────────────────────────────────────────

/** Validated input type for insurance policy registration. */
export type InsurancePolicyInput = z.infer<typeof insurancePolicySchema>;

/** Validated input type for claims notification registration. */
export type ClaimsNotificationInput = z.infer<typeof claimsNotificationSchema>;
