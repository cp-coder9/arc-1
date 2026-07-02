/**
 * SpecForge Zod Validation Schemas
 *
 * Validates data at the repository boundary before Firestore writes.
 * Each schema matches the corresponding type definition in `@/types/specforgeTypes`.
 *
 * Validates: Requirements 1.8, 4.12
 */

import { z } from 'zod';

// ── Enum Schemas ────────────────────────────────────────────────────────────

const specForgeRoleSchema = z.enum([
  'client', 'developer', 'architect', 'bep', 'freelancer',
  'engineer', 'quantity_surveyor', 'energy_professional', 'fire_engineer',
  'contractor', 'subcontractor', 'supplier', 'site_manager',
  'admin', 'platform_admin',
]);

const specItemStatusSchema = z.enum([
  'draft', 'needs_decision', 'approved', 'issued',
  'rfq', 'ordered', 'delivered', 'installed',
  'as_built', 'superseded',
]);

const specSectionStatusSchema = z.enum([
  'draft', 'needs_review', 'approved', 'issued',
]);

const specIssueStatusSchema = z.enum(['draft', 'issued', 'superseded']);

const specApprovalDecisionSchema = z.enum(['pending', 'approved', 'rejected', 'deferred']);

const specSubstitutionStatusSchema = z.enum(['requested', 'under_review', 'approved', 'rejected']);

const procurementStatusSchema = z.enum([
  'not_started', 'rfq_sent', 'quoted', 'ordered',
  'dispatched', 'delivered', 'installed', 'closed',
]);

const specAuditActionSchema = z.enum([
  'created', 'updated', 'status_changed', 'approved',
  'issued', 'substitution_requested', 'substitution_resolved',
  'snapshot_created', 'comment_added',
]);

const readinessSeveritySchema = z.enum(['blocker', 'high', 'medium', 'low']);

// ── Nested Object Schemas ───────────────────────────────────────────────────

const specTeamMemberSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1),
  role: specForgeRoleSchema,
  responsibility: z.string(),
});

const specIssuerSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1),
  role: specForgeRoleSchema,
});

const specIssueRecipientSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1),
  role: specForgeRoleSchema,
  scope: z.string(),
});

const specBudgetSummarySchema = z.object({
  allowance: z.number().min(0),
  estimate: z.number().min(0),
  delta: z.number(),
  deltaPct: z.number().optional(),
  overBudgetItems: z.array(z.string()),
  longLeadItems: z.array(z.string()),
  staleItems: z.array(z.string()),
});

const specReadinessFindingSchema = z.object({
  severity: readinessSeveritySchema,
  itemId: z.string().min(1),
  message: z.string().min(1),
});

// ── Core Schemas ────────────────────────────────────────────────────────────

/**
 * Full SpecSection schema — validates a complete section object for writes.
 */
export const specSectionSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  title: z.string().min(1),
  discipline: z.string().min(1),
  ownerRole: specForgeRoleSchema,
  reviewerRole: specForgeRoleSchema.optional(),
  status: specSectionStatusSchema,
});

/**
 * Partial SpecSection schema for updates — all fields optional except `id` is omitted.
 */
export const specSectionUpdateSchema = specSectionSchema.partial().omit({ id: true });

/**
 * Full SpecItem schema — validates a complete item object for writes.
 */
export const specItemSchema = z.object({
  id: z.string().min(1),
  sectionId: z.string().min(1),
  code: z.string().min(1),
  title: z.string().min(1),
  room: z.string(),
  package: z.string(),
  discipline: z.string().optional(),
  image: z.string().optional(),
  supplier: z.string().optional(),
  model: z.string().optional(),
  finish: z.string().optional(),
  dimensions: z.string().optional(),
  drawingRefs: z.array(z.string()),
  clauseRefs: z.array(z.string()),
  budgetAllowance: z.number().min(0),
  estimatedCost: z.number().min(0),
  leadTimeDays: z.number().int().min(0),
  clientDecision: z.boolean(),
  ownerRole: specForgeRoleSchema,
  reviewerRole: specForgeRoleSchema.optional(),
  approverRole: specForgeRoleSchema.optional(),
  status: specItemStatusSchema,
  sourceRevision: z.string().min(1),
  supersededBy: z.string().nullable().optional(),
  sustainability: z.string().optional(),
  warranty: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Partial SpecItem schema for updates — all fields optional except `id` is omitted.
 */
export const specItemUpdateSchema = specItemSchema.partial().omit({ id: true });

/**
 * Full SpecApproval schema — validates approval records for writes.
 */
export const specApprovalSchema = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
  sectionId: z.string().min(1),
  requestedBy: z.string().min(1),
  requestedAt: z.string().min(1),
  reviewerRole: specForgeRoleSchema,
  decision: specApprovalDecisionSchema,
  decidedBy: z.string().optional(),
  decidedAt: z.string().optional(),
  comments: z.string().optional(),
});

/**
 * Full SpecSubstitution schema — validates substitution records for writes.
 */
export const specSubstitutionSchema = z.object({
  id: z.string().min(1),
  originalItemId: z.string().min(1),
  proposedTitle: z.string().min(1),
  proposedSupplier: z.string().optional(),
  proposedCost: z.number().min(0).optional(),
  reason: z.string().min(1),
  requestedBy: z.string().min(1),
  requestedAt: z.string().min(1),
  status: specSubstitutionStatusSchema,
  reviewedBy: z.string().optional(),
  reviewedAt: z.string().optional(),
  reviewComments: z.string().optional(),
});

/**
 * Full SpecForgeWorkspace schema — validates workspace objects for writes.
 */
export const specWorkspaceSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  municipality: z.string().optional(),
  stage: z.string().min(1),
  profile: z.string().min(1),
  revision: z.string().min(1),
  issueStatus: specIssueStatusSchema,
  sections: z.array(specSectionSchema),
  items: z.array(specItemSchema),
  team: z.array(specTeamMemberSchema).optional(),
});

/**
 * Issue request schema — validates the payload for the POST /issue endpoint.
 */
export const issueRequestSchema = z.object({
  issuer: specIssuerSchema,
  recipients: z.array(specIssueRecipientSchema).min(1).max(200),
});

/**
 * SpecIssueSnapshot schema — validates immutable snapshot records.
 */
export const specIssueSnapshotSchema = z.object({
  snapshotId: z.string().min(1),
  projectId: z.string().min(1),
  workspaceId: z.string().min(1),
  revision: z.string().min(1),
  issuedAt: z.string().min(1),
  issuer: specIssuerSchema,
  professionalResponsibility: z.enum(['confirmed_by_issuer', 'requires_professional_confirmation']),
  projectName: z.string().min(1),
  issueStatus: z.literal('issued_snapshot'),
  sections: z.array(specSectionSchema),
  items: z.array(specItemSchema),
  readinessFindings: z.array(specReadinessFindingSchema),
  budgetSummary: specBudgetSummarySchema,
  auditHash: z.string().min(1),
});

/**
 * SpecAuditEvent schema — validates audit event records for writes.
 */
export const specAuditEventSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  action: specAuditActionSchema,
  targetId: z.string().min(1),
  targetType: z.enum(['item', 'section', 'workspace', 'snapshot']),
  performedBy: z.string().min(1),
  performedAt: z.string().min(1),
  details: z.string().optional(),
  previousValue: z.string().max(10_000).optional(),
  newValue: z.string().max(10_000).optional(),
});

/**
 * SpecProcurementEntry update schema — validates partial procurement updates.
 */
export const specProcurementEntryUpdateSchema = z.object({
  status: procurementStatusSchema.optional(),
  supplier: z.string().optional(),
  rfqSentAt: z.string().optional(),
  quotedAt: z.string().optional(),
  orderedAt: z.string().optional(),
  expectedDelivery: z.string().optional(),
  deliveredAt: z.string().optional(),
  installedAt: z.string().optional(),
  quotedCost: z.number().min(0).optional(),
  notes: z.string().optional(),
}).refine(
  (data) => Object.keys(data).some(k => data[k as keyof typeof data] !== undefined),
  { message: 'At least one field must be provided for update' }
);

/**
 * Full SpecProcurementEntry schema — validates complete procurement entries.
 */
export const specProcurementEntrySchema = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
  itemCode: z.string().min(1),
  itemTitle: z.string().min(1),
  supplier: z.string().optional(),
  status: procurementStatusSchema,
  rfqSentAt: z.string().optional(),
  quotedAt: z.string().optional(),
  orderedAt: z.string().optional(),
  expectedDelivery: z.string().optional(),
  deliveredAt: z.string().optional(),
  installedAt: z.string().optional(),
  quotedCost: z.number().min(0).optional(),
  notes: z.string().optional(),
});
