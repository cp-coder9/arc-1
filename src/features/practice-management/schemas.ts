/**
 * Practice Management Module — Zod Validation Schemas (P2.9)
 *
 * Input validation schemas for enquiry creation, timesheet entry,
 * invoice configuration, staff allocation, and compliance records.
 */

import { z } from 'zod';

// ─── Enum Schemas (reused across input schemas) ───────────────────────────────

export const PracticeSubscriptionTierSchema = z.enum(['essentials', 'professional']);
export const EnquirySourceSchema = z.enum(['referral', 'website', 'repeat_client', 'tender_notice', 'other']);
export const EnquiryStageSchema = z.enum(['lead', 'quote_sent', 'quote_accepted', 'appointed', 'active', 'complete', 'on_hold', 'lost']);
export const LossReasonSchema = z.enum(['price', 'scope_mismatch', 'competitor_won', 'client_cancelled', 'timeline', 'relationship', 'other']);
export const PracticeDisciplineSchema = z.enum(['architecture', 'engineering', 'quantity_surveying', 'project_management', 'town_planning', 'multi_discipline']);
export const ActivityCategorySchema = z.enum(['design', 'documentation', 'administration', 'site_visit', 'meeting', 'travel', 'research', 'other']);
export const BillingModelSchema = z.enum(['hourly', 'fixed_fee', 'percentage_of_construction']);
export const TimesheetStatusSchema = z.enum(['draft', 'submitted', 'approved', 'invoiced']);
export const LeaveTypeSchema = z.enum(['annual', 'sick', 'study', 'other']);
export const RegistrationBodySchema = z.enum(['SACAP', 'ECSA', 'SACQSP', 'SACPCMP', 'PLATO', 'other']);

// ─── Input Schemas ────────────────────────────────────────────────────────────

/**
 * Schema for creating a new enquiry in the pipeline.
 * Requirements: 8.1
 */
export const CreateEnquirySchema = z.object({
  source: EnquirySourceSchema,
  clientName: z.string().min(1).max(200),
  clientEmail: z.string().email(),
  clientPhone: z.string().optional(),
  projectDescription: z.string().min(1).max(2000),
  estimatedProjectValueZAR: z.number().min(0.01).max(999_999_999.99),
  estimatedFeeValueZAR: z.number().min(0.01).max(99_999_999.99),
  discipline: PracticeDisciplineSchema,
  expectedStartDate: z.string().optional(),
  enquiryDate: z.string().min(1),
});

/**
 * Schema for creating a timesheet entry.
 * Requirements: 10.1
 */
export const CreateTimesheetEntrySchema = z.object({
  date: z.string().min(1).refine(
    (val) => {
      const entryDate = new Date(val);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      return entryDate <= today;
    },
    { message: 'Timesheet date cannot be in the future' }
  ),
  projectId: z.string().min(1),
  activityCategory: ActivityCategorySchema,
  hours: z.number()
    .min(0.25)
    .max(24)
    .refine(
      (val) => val % 0.25 === 0,
      { message: 'Hours must be in 0.25 increments' }
    ),
  description: z.string().min(1).max(500),
  billable: z.boolean(),
});

/**
 * Schema for invoice generation configuration.
 * Requirements: 10.6
 */
export const InvoiceConfigSchema = z.object({
  projectId: z.string().min(1),
  groupBy: z.enum(['activity_category', 'staff_member']),
  billingModel: BillingModelSchema,
});

/**
 * Schema for creating a staff allocation to a project.
 * Requirements: 12.2
 */
export const CreateAllocationSchema = z.object({
  staffId: z.string().min(1),
  projectId: z.string().min(1),
  hoursPerWeek: z.number().min(1).max(60),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
});

/**
 * Schema for creating a staff compliance record.
 * Requirements: 13.1
 */
export const CreateComplianceRecordSchema = z.object({
  staffId: z.string().min(1),
  registrationBody: RegistrationBodySchema,
  registrationBodyCustomName: z.string().optional(),
  registrationNumber: z.string().min(1).max(50),
  registrationCategory: z.string().min(1),
  registrationExpiryDate: z.string().optional(),
  piInsurancePolicyNumber: z.string().max(100).optional(),
  piInsuranceExpiryDate: z.string().optional(),
  piInsuranceSumInsuredZAR: z.number().min(0).optional(),
});
