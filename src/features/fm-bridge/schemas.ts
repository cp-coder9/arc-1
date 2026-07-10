/**
 * FM Bridge Module — Zod Validation Schemas
 *
 * Input validation schemas for FM Bridge API boundary operations.
 * These validate user-submitted data (creation/mutation), not full domain models.
 */

import { z } from 'zod';

// ─── Enum Schemas (reusable) ──────────────────────────────────────────────────

export const WarrantyCategorySchema = z.enum([
  'structural', 'mechanical', 'electrical', 'plumbing', 'finishes', 'equipment', 'other',
]);

export const AssetCategorySchema = z.enum([
  'structural', 'mechanical', 'electrical', 'plumbing', 'fire_protection', 'lifts', 'security', 'finishes', 'landscaping', 'other',
]);

export const AssetConditionSchema = z.enum([
  'excellent', 'good', 'fair', 'poor', 'failed',
]);

export const DefectCategorySchema = z.enum([
  'structural', 'mechanical', 'electrical', 'plumbing', 'finishes', 'external', 'other',
]);

export const DefectSeveritySchema = z.enum([
  'critical', 'major', 'minor', 'cosmetic',
]);

export const MaintenanceFrequencySchema = z.enum([
  'daily', 'weekly', 'monthly', 'quarterly', 'semi_annually', 'annually', 'custom',
]);

export const MaintenancePrioritySchema = z.enum([
  'critical', 'high', 'medium', 'low',
]);

export const ClaimUrgencySchema = z.enum([
  'routine', 'urgent', 'emergency',
]);

// ─── Input Validation Schemas ─────────────────────────────────────────────────

/**
 * Schema for creating a new warranty item manually (Requirement 3.7).
 * Validates: description, category, warrantyPeriodMonths, startDate, supplierName.
 */
export const CreateWarrantyItemSchema = z.object({
  description: z.string().min(1).max(500),
  category: WarrantyCategorySchema,
  warrantyPeriodMonths: z.number().int().min(1).max(240),
  startDate: z.string().min(1),
  supplierName: z.string().min(1).max(200),
});

/**
 * Schema for creating a new asset item (Requirement 4.1).
 * Validates all required and optional fields with specified ranges.
 */
export const CreateAssetItemSchema = z.object({
  description: z.string().min(1).max(500),
  category: AssetCategorySchema,
  locationInBuilding: z.string().min(1).max(200),
  manufacturer: z.string().max(200).optional(),
  modelNumber: z.string().max(100).optional(),
  serialNumber: z.string().max(100).optional(),
  installationDate: z.string().optional(),
  expectedUsefulLifeYears: z.number().int().min(1).max(100).optional(),
  replacementCostZAR: z.number().min(0.01).max(999_999_999.99).optional(),
  condition: AssetConditionSchema,
});

/**
 * Schema for logging a defect during DLP (Requirement 5.3).
 * Validates: description, location, category, severity, evidence, date, trade.
 */
export const LogDefectSchema = z.object({
  description: z.string().min(1).max(2000),
  locationInBuilding: z.string().min(1).max(500),
  category: DefectCategorySchema,
  severity: DefectSeveritySchema,
  photographicEvidence: z.array(z.string()).min(0).max(10),
  dateDiscovered: z.string().min(1),
  responsibleTrade: z.string().max(200).optional(),
});

/**
 * Schema for creating a PPM schedule entry (Requirement 6.1).
 * Validates: assetId, taskDescription, frequency, interval, party, duration, cost, priority.
 */
export const CreatePPMScheduleSchema = z.object({
  assetId: z.string().min(1),
  taskDescription: z.string().min(1).max(500),
  frequency: MaintenanceFrequencySchema,
  customIntervalDays: z.number().int().min(1).max(3650).optional(),
  responsibleParty: z.string().min(1).max(200),
  estimatedDurationHours: z.number().min(0.25).max(999),
  estimatedCostZAR: z.number().min(0.01).max(999_999.99),
  priority: MaintenancePrioritySchema,
});

/**
 * Schema for lodging a warranty claim (Requirement 3.5).
 * Validates: defectDescription, location, evidence, urgency.
 */
export const LodgeWarrantyClaimSchema = z.object({
  defectDescription: z.string().min(1).max(2000),
  locationInBuilding: z.string().min(1).max(500),
  photographicEvidence: z.array(z.string()).min(0).max(10),
  urgency: ClaimUrgencySchema,
});
