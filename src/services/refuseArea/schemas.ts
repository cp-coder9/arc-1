/**
 * Municipal Refuse Area Calculator — Zod Validation Schemas
 *
 * Runtime validation for building inputs: numeric bounds, decimal precision,
 * required fields, and mixed-use component count.
 *
 * Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9
 */

import { z } from 'zod';
import type {
  ResidentialInputs,
  CommercialInputs,
  IndustrialInputs,
  MixedUseComponent,
  MixedUseInputs,
  BuildingInputs,
} from './types';

// --- Helpers ---

/**
 * Check that a number has at most 2 decimal places.
 */
function hasMaxTwoDecimalPlaces(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  // Multiply by 100 and check if the result is effectively an integer
  const scaled = Math.round(value * 100);
  return Math.abs(scaled - value * 100) < 1e-9;
}

/**
 * Creates a numeric field schema that enforces:
 * - Required (not undefined/null/NaN)
 * - Greater than zero
 * - Within [min, max] bounds
 * - Maximum 2 decimal places
 */
function numericField(min: number, max: number) {
  return z
    .number({
      required_error: 'Required',
      invalid_type_error: 'Required',
    })
    .refine((val) => val >= min && val <= max, {
      message: `Must be between ${min} and ${max}`,
    })
    .refine((val) => hasMaxTwoDecimalPlaces(val), {
      message: 'Maximum 2 decimal places',
    });
}

// --- Residential ---

export const residentialInputsSchema = z.object({
  unitCount: numericField(1, 10_000),
  averageOccupantsPerUnit: numericField(1, 20),
}) as unknown as z.ZodType<ResidentialInputs>;

// --- Commercial ---

export const commercialInputsSchema = z.object({
  grossFloorArea: numericField(1, 500_000),
  estimatedOccupantCount: numericField(1, 100_000),
}) as unknown as z.ZodType<CommercialInputs>;

// --- Industrial ---

export const industrialInputsSchema = z.object({
  grossFloorArea: numericField(1, 500_000),
  numberOfEmployees: numericField(1, 50_000),
  wasteGenerationCategory: z.enum(['light', 'medium', 'heavy'], {
    required_error: 'Required',
    invalid_type_error: 'Required',
  }),
}) as unknown as z.ZodType<IndustrialInputs>;

// --- Mixed-Use Component ---

export const mixedUseComponentSchema: z.ZodType<MixedUseComponent> = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('residential'),
    inputs: residentialInputsSchema,
  }),
  z.object({
    type: z.literal('commercial'),
    inputs: commercialInputsSchema,
  }),
  z.object({
    type: z.literal('industrial'),
    inputs: industrialInputsSchema,
  }),
]) as unknown as z.ZodType<MixedUseComponent>;

// --- Mixed-Use Inputs ---

export const mixedUseInputsSchema = z.object({
  components: z
    .array(mixedUseComponentSchema)
    .min(2, { message: 'At least two usage components required' }),
}) as unknown as z.ZodType<MixedUseInputs>;

// --- Building Inputs (discriminated union) ---

export const buildingInputsSchema: z.ZodType<BuildingInputs> = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('residential'),
    data: residentialInputsSchema,
  }),
  z.object({
    type: z.literal('commercial'),
    data: commercialInputsSchema,
  }),
  z.object({
    type: z.literal('industrial'),
    data: industrialInputsSchema,
  }),
  z.object({
    type: z.literal('mixed-use'),
    data: mixedUseInputsSchema,
  }),
]) as unknown as z.ZodType<BuildingInputs>;
