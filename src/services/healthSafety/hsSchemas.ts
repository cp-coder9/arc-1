/**
 * Zod validation schemas for Health & Safety module inputs.
 * All service inputs are validated using these schemas before business logic executes.
 */

import { z } from 'zod';

// ─── HIRA Engine ────────────────────────────────────────────────────────────

export const HazardEntrySchema = z.object({
  projectId: z.string().min(1),
  description: z.string().min(1).max(2000),
  activity: z.string().min(1),
  location: z.string().min(1),
  likelihood: z.number().int().min(1).max(5),
  severity: z.number().int().min(1).max(5),
  existingControls: z.array(z.string()),
  additionalControls: z.array(z.string()),
  responsiblePerson: z.string().min(1),
});

// ─── Permit System ──────────────────────────────────────────────────────────

export const PermitRequestSchema = z.object({
  projectId: z.string().min(1),
  type: z.enum(['excavation', 'scaffolding', 'hot_work', 'confined_space']),
  location: z.string().min(1),
  hazards: z.array(z.string()).min(1),
  precautions: z.array(z.string()).min(1),
  responsiblePersons: z.array(z.string()).min(1),
  requestedBy: z.string().min(1),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime(),
});

// ─── Incident Reporter ──────────────────────────────────────────────────────

export const IncidentReportSchema = z.object({
  projectId: z.string().min(1),
  date: z.string().min(1),
  time: z.string().min(1),
  location: z.string().min(1),
  personsInvolved: z.array(z.string()).min(1),
  injuryClassification: z.enum(['first_aid', 'medical_treatment', 'lost_time', 'fatality']),
  description: z.string().min(10).max(5000),
  immediateActions: z.string().min(1),
  reportedBy: z.string().min(1),
});

// ─── Induction Tracker ──────────────────────────────────────────────────────

export const ToolboxTalkSchema = z.object({
  projectId: z.string().min(1),
  date: z.string().min(1),
  topic: z.string().min(1),
  presenter: z.string().min(1),
  duration: z.number().int().positive(),
  attendees: z.array(z.string()).min(1),
});

export const InductionSchema = z.object({
  projectId: z.string().min(1),
  inducteeId: z.string().min(1),
  inducteeName: z.string().min(1),
  type: z.enum(['site', 'task_specific', 'visitor']),
  date: z.string().min(1),
  acknowledged: z.boolean(),
  conductedBy: z.string().min(1),
});

// ─── Fall Protection Service ────────────────────────────────────────────────

export const FallProtectionPlanSchema = z.object({
  projectId: z.string().min(1),
  methods: z.array(z.enum(['guardrails', 'safety_nets', 'harnesses', 'exclusion_zones'])).min(1),
  workAreas: z.array(z.string()).min(1),
  responsiblePersons: z.array(z.string()).min(1),
  inspectionSchedule: z.object({
    frequency: z.enum(['daily', 'weekly', 'fortnightly', 'monthly']),
    nextDue: z.string().min(1),
  }),
});

// ─── Client Specification Engine ────────────────────────────────────────────

export const ClientHSSpecificationSchema = z.object({
  projectId: z.string().min(1),
  projectDescription: z.string().min(1),
  scopeOfWork: z.string().min(1),
  knownHazards: z.array(z.string()),
  minimumHSRequirements: z.array(z.string()),
  complianceMonitoringArrangements: z.string().min(1),
});

// ─── Designer Risk Capture ──────────────────────────────────────────────────

export const DesignerRiskAssessmentSchema = z.object({
  projectId: z.string().min(1),
  designDiscipline: z.string().min(1),
  hazardDescription: z.string().min(1),
  associatedDesignElement: z.string().min(1),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
  recommendedControls: z.array(z.string()),
  createdBy: z.string().min(1),
});

// ─── H&S Plan Workflow ──────────────────────────────────────────────────────

export const HSPlanSchema = z.object({
  projectId: z.string().min(1),
  version: z.number().int().positive(),
  documentUrl: z.string().optional(),
  submittedBy: z.string().min(1),
});
