/**
 * Town Planning Workflow — Zod Validation Schemas
 *
 * Runtime validation for API inputs and form data.
 */

import { z } from 'zod';

// ─── Application Creation ─────────────────────────────────────────────────────

export const ApplicationTypeEnum = z.enum([
  'rezoning',
  'subdivision',
  'consolidation',
  'consent_use',
  'departure',
  'removal_of_restrictive_conditions',
  'township_establishment',
  'site_development_plan',
  'building_line_relaxation',
  'amendment_of_scheme',
]);

export const CreateApplicationParamsSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  applicationType: ApplicationTypeEnum,
  municipality: z.string().min(1, 'Municipality is required'),
  erfNumber: z.string().min(1, 'ERF number is required'),
  townshipName: z.string().min(1, 'Township name is required'),
  province: z.string().min(1, 'Province is required'),
  applicantId: z.string().min(1, 'Applicant ID is required'),
  ownerId: z.string().min(1, 'Owner ID is required'),
  townPlannerId: z.string().optional(),
  description: z.string().min(10, 'Description must be at least 10 characters').max(5000),
  currentZoning: z.string().optional(),
  proposedZoning: z.string().optional(),
  currentLandUse: z.string().optional(),
  proposedLandUse: z.string().optional(),
  erfSize: z.number().positive().optional(),
});

export type CreateApplicationParams = z.infer<typeof CreateApplicationParamsSchema>;

// ─── Condition Input ──────────────────────────────────────────────────────────

export const ConditionInputSchema = z.object({
  applicationId: z.string().min(1, 'Application ID is required'),
  conditionNumber: z.number().int().positive('Condition number must be a positive integer'),
  description: z.string().min(5, 'Description must be at least 5 characters').max(2000),
  responsibleParty: z.string().min(1, 'Responsible party is required'),
  dueDate: z.string().optional(),
});

export type ConditionInput = z.infer<typeof ConditionInputSchema>;

// ─── Comment Input ────────────────────────────────────────────────────────────

export const CommentTypeEnum = z.enum(['objection', 'support', 'comment', 'representation']);

export const CommentInputSchema = z.object({
  applicationId: z.string().min(1, 'Application ID is required'),
  commentType: CommentTypeEnum,
  submitterName: z.string().min(2, 'Submitter name is required'),
  submitterAddress: z.string().optional(),
  submitterContact: z.string().optional(),
  content: z.string().min(10, 'Comment must be at least 10 characters').max(10000),
  attachments: z.array(z.string()).default([]),
});

export type CommentInput = z.infer<typeof CommentInputSchema>;

// ─── Municipality Profile Input ───────────────────────────────────────────────

export const MunicipalityProfileInputSchema = z.object({
  name: z.string().min(2, 'Municipality name is required'),
  province: z.string().min(2, 'Province is required'),
  districtMunicipality: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  physicalAddress: z.string().optional(),
  postalAddress: z.string().optional(),
  zoningScheme: z.string().min(1, 'Zoning scheme is required'),
  sdpRequired: z.boolean().default(true),
  advertisingPeriodDays: z.number().int().min(14).max(90).default(30),
  commentPeriodDays: z.number().int().min(14).max(90).default(30),
  decisionTimelineDays: z.number().int().min(30).max(365).default(60),
  tribunalName: z.string().optional(),
  appealAuthority: z.string().optional(),
  onlinePortalUrl: z.string().url().optional(),
  specialRequirements: z.array(z.string()).optional(),
});

export type MunicipalityProfileInput = z.infer<typeof MunicipalityProfileInputSchema>;

// ─── Stage Transition ─────────────────────────────────────────────────────────

export const ApplicationStageEnum = z.enum([
  'preparation',
  'submission',
  'acknowledgement',
  'circulation',
  'advertising',
  'comment_period',
  'hearing',
  'decision',
  'conditions_compliance',
  'appeal',
  'withdrawn',
]);

export const StageTransitionParamsSchema = z.object({
  applicationId: z.string().min(1, 'Application ID is required'),
  targetStage: ApplicationStageEnum,
  triggeredBy: z.string().min(1, 'Triggered by user ID is required'),
  notes: z.string().max(2000).optional(),
});

export type StageTransitionParams = z.infer<typeof StageTransitionParamsSchema>;

// ─── Appeal Input ─────────────────────────────────────────────────────────────

export const AppealInputSchema = z.object({
  applicationId: z.string().min(1, 'Application ID is required'),
  appellantId: z.string().min(1, 'Appellant ID is required'),
  appellantName: z.string().min(2, 'Appellant name is required'),
  groundsOfAppeal: z.string().min(20, 'Grounds of appeal must be at least 20 characters').max(10000),
  appealAuthority: z.string().min(1, 'Appeal authority is required'),
});

export type AppealInput = z.infer<typeof AppealInputSchema>;

// ─── Checklist Item Update ────────────────────────────────────────────────────

export const ChecklistItemUpdateSchema = z.object({
  itemId: z.string().min(1, 'Checklist item ID is required'),
  isComplete: z.boolean(),
  notes: z.string().max(1000).optional(),
});

export type ChecklistItemUpdate = z.infer<typeof ChecklistItemUpdateSchema>;
