/**
 * Project Command Centre — Zod Validation Schemas
 *
 * Runtime validation schemas for all entity creation forms within the
 * Command Centre subsystems. Each schema validates the minimum required
 * fields for creating a new record.
 *
 * @module commandCentre/schemas
 */

import { z } from 'zod';

// ── Shared Enums ─────────────────────────────────────────────────────────────

export const TaskPriorityEnum = z.enum(['low', 'medium', 'high', 'critical']);

export const RiskCategoryEnum = z.enum([
  'supply_chain',
  'resource',
  'quality',
  'compliance',
  'commercial',
  'safety',
]);

export const RiskSeverityEnum = z.enum(['critical', 'high', 'medium', 'low']);

export const SnagSeverityEnum = z.enum(['high', 'medium', 'low']);

export const ContractFormEnum = z.enum([
  'jbcc_pba',
  'jbcc_ns',
  'jbcc_mwa',
  'nec_ecc',
  'nec_psc',
  'nec_tsc',
  'custom',
]);

export const MilestoneCategoryEnum = z.enum([
  'general',
  'nhbrc_inspection',
  'municipal_submission',
]);

// ── ISO Date String Validator ────────────────────────────────────────────────

/** Validates an ISO 8601 date string (YYYY-MM-DD). */
const isoDateString = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  'Must be a valid ISO date (YYYY-MM-DD)',
);

// ── 1. Task Creation Schema ──────────────────────────────────────────────────

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Task title is required'),
  assigneeId: z.string().min(1, 'Assignee is required'),
  priority: TaskPriorityEnum,
  dueDate: isoDateString,
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

// ── 2. Milestone Creation Schema ─────────────────────────────────────────────

export const createMilestoneSchema = z.object({
  name: z.string().min(1, 'Milestone name is required'),
  plannedDate: isoDateString,
  linkedCertificateId: z.string().optional(),
  linkedActivityId: z.string().optional(),
  category: MilestoneCategoryEnum.optional(),
});

export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;

// ── 3. Risk Creation Schema ──────────────────────────────────────────────────

export const createRiskSchema = z.object({
  description: z.string().min(1, 'Risk description is required'),
  category: RiskCategoryEnum,
  severity: RiskSeverityEnum,
  ownerId: z.string().min(1, 'Risk owner is required'),
});

export type CreateRiskInput = z.infer<typeof createRiskSchema>;

// ── 4. Snag Creation Schema ──────────────────────────────────────────────────

export const createSnagSchema = z.object({
  description: z.string().min(1, 'Snag description is required'),
  location: z.string().min(1, 'Location is required'),
  severity: SnagSeverityEnum,
  assignedPartyId: z.string().min(1, 'Assigned party is required'),
});

export type CreateSnagInput = z.infer<typeof createSnagSchema>;

// ── 5. RFI Creation Schema ───────────────────────────────────────────────────

export const createRFISchema = z.object({
  subject: z.string().min(1, 'RFI subject is required'),
  description: z.string().min(1, 'RFI description is required'),
  addresseeId: z.string().min(1, 'Addressee is required'),
  priority: TaskPriorityEnum,
});

export type CreateRFIInput = z.infer<typeof createRFISchema>;

// ── 6. Procurement Order Creation Schema ─────────────────────────────────────

export const createProcurementOrderSchema = z.object({
  description: z.string().min(1, 'Order description is required'),
  supplierId: z.string().min(1, 'Supplier is required'),
  value: z.number().positive('Value must be greater than 0'),
  expectedDeliveryDate: isoDateString,
});

export type CreateProcurementOrderInput = z.infer<typeof createProcurementOrderSchema>;

// ── 7. Contract Creation Schema ──────────────────────────────────────────────

export const createContractSchema = z.object({
  contractorSupplier: z.string().min(1, 'Contractor/Supplier is required'),
  scope: z.string().min(1, 'Scope is required'),
  value: z.number().positive('Value must be greater than 0'),
  form: ContractFormEnum,
  startDate: isoDateString,
  expiryDate: isoDateString,
});

export type CreateContractInput = z.infer<typeof createContractSchema>;

// ── 8. Project Creation Schema ───────────────────────────────────────────────

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  clientId: z.string().min(1, 'Client is required'),
  estimatedValue: z.number().positive('Estimated value must be greater than 0'),
  projectType: z.string().min(1, 'Project type is required'),
  location: z.string().min(1, 'Location is required'),
  estimatedDuration: z.string().min(1, 'Estimated duration is required'),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

// ── 9. Variation Creation Schema ─────────────────────────────────────────────

export const createVariationSchema = z.object({
  description: z.string().min(1, 'Variation description is required'),
  value: z.number({ required_error: 'Value is required' }),
  approvedBy: z.string().min(1, 'Approved by is required'),
});

export type CreateVariationInput = z.infer<typeof createVariationSchema>;

// ── 10. Payment Certificate Creation Schema ──────────────────────────────────

export const createPaymentCertificateSchema = z.object({
  grossValue: z.number().positive('Gross value must be greater than 0'),
  retentionPercent: z.number().min(0, 'Retention cannot be negative').max(100, 'Retention cannot exceed 100%'),
  period: z.string().min(1, 'Period is required'),
});

export type CreatePaymentCertificateInput = z.infer<typeof createPaymentCertificateSchema>;

// ── 11. Diary Entry Creation Schema ──────────────────────────────────────────

export const createDiaryEntrySchema = z.object({
  weather: z.string().min(1, 'Weather condition is required'),
  workforceCount: z.number().int().min(0, 'Workforce count cannot be negative'),
  workCompleted: z.string().min(1, 'Work completed is required'),
  issuesDelays: z.string().optional(),
});

export type CreateDiaryEntryInput = z.infer<typeof createDiaryEntrySchema>;

// ── 12. Activity Creation Schema ─────────────────────────────────────────────

export const createActivitySchema = z.object({
  name: z.string().min(1, 'Activity name is required'),
  startDate: isoDateString,
  endDate: isoDateString,
  assigneeId: z.string().min(1, 'Assignee is required'),
});

export type CreateActivityInput = z.infer<typeof createActivitySchema>;
