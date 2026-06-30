/**
 * SpecForge Types — Comprehensive type definitions for the SpecForge Specification Engine.
 *
 * Covers: workspace, sections, items, approvals, substitutions, issue snapshots,
 * audit events, library items, procurement pipeline, and BoM/BoQ.
 */

import type { UserRole } from '@/types';

// ── Role & Status Enumerations ──────────────────────────────────────────────

export type SpecForgeRole =
  | 'client' | 'developer' | 'architect' | 'bep' | 'freelancer'
  | 'engineer' | 'quantity_surveyor' | 'energy_professional' | 'fire_engineer'
  | 'contractor' | 'subcontractor' | 'supplier' | 'site_manager'
  | 'admin' | 'platform_admin';

export type SpecItemStatus =
  | 'draft' | 'needs_decision' | 'approved' | 'issued'
  | 'rfq' | 'ordered' | 'delivered' | 'installed'
  | 'as_built' | 'superseded';

export type SpecSectionStatus = 'draft' | 'needs_review' | 'approved' | 'issued';

export type SpecIssueStatus = 'draft' | 'issued' | 'superseded';

export type SpecApprovalDecision = 'pending' | 'approved' | 'rejected' | 'deferred';

export type SpecSubstitutionStatus = 'requested' | 'under_review' | 'approved' | 'rejected';

export type ProcurementStatus = 'not_started' | 'rfq_sent' | 'quoted' | 'ordered' | 'dispatched' | 'delivered' | 'installed' | 'closed';

export type SpecAuditAction =
  | 'created' | 'updated' | 'status_changed' | 'approved'
  | 'issued' | 'substitution_requested' | 'substitution_resolved'
  | 'snapshot_created' | 'comment_added';

// ── Core Workspace Structures ───────────────────────────────────────────────

export interface SpecForgeWorkspace {
  id: string;
  projectId: string;
  projectName: string;
  municipality?: string;
  stage: string;
  profile: string;
  revision: string;
  issueStatus: SpecIssueStatus;
  sections: SpecSection[];
  items: SpecItem[];
  team?: SpecTeamMember[];
}

export interface SpecTeamMember {
  userId: string;
  name: string;
  role: SpecForgeRole;
  responsibility: string;
}

export interface SpecSection {
  id: string;
  code: string;
  title: string;
  discipline: string;
  ownerRole: SpecForgeRole;
  reviewerRole?: SpecForgeRole;
  status: SpecSectionStatus;
}

export interface SpecItem {
  id: string;
  sectionId: string;
  code: string;
  title: string;
  room: string;
  package: string;
  discipline?: string;
  image?: string;
  supplier?: string;
  model?: string;
  finish?: string;
  dimensions?: string;
  drawingRefs: string[];
  clauseRefs: string[];
  budgetAllowance: number;
  estimatedCost: number;
  leadTimeDays: number;
  clientDecision: boolean;
  ownerRole: SpecForgeRole;
  reviewerRole?: SpecForgeRole;
  approverRole?: SpecForgeRole;
  status: SpecItemStatus;
  sourceRevision: string;
  supersededBy?: string | null;
  sustainability?: string;
  warranty?: string;
  notes?: string;
}

// ── Issue Snapshot (Immutable) ──────────────────────────────────────────────

export interface SpecIssueSnapshot {
  snapshotId: string;
  projectId: string;
  workspaceId: string;
  revision: string;
  issuedAt: string;
  issuer: SpecIssuer;
  professionalResponsibility: 'confirmed_by_issuer' | 'requires_professional_confirmation';
  projectName: string;
  issueStatus: 'issued_snapshot';
  sections: SpecSection[];
  items: SpecItem[];
  readinessFindings: SpecReadinessFinding[];
  budgetSummary: SpecBudgetSummary;
  auditHash: string;
}

export interface SpecIssuer {
  userId: string;
  name: string;
  role: SpecForgeRole;
}

export interface SpecIssueRecipient {
  userId: string;
  name: string;
  role: SpecForgeRole;
  scope: string;
}

// ── Approvals ───────────────────────────────────────────────────────────────

export interface SpecApproval {
  id: string;
  itemId: string;
  sectionId: string;
  requestedBy: string;
  requestedAt: string;
  reviewerRole: SpecForgeRole;
  decision: SpecApprovalDecision;
  decidedBy?: string;
  decidedAt?: string;
  comments?: string;
}

// ── Substitutions ───────────────────────────────────────────────────────────

export interface SpecSubstitution {
  id: string;
  originalItemId: string;
  proposedTitle: string;
  proposedSupplier?: string;
  proposedCost?: number;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  status: SpecSubstitutionStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewComments?: string;
}

// ── Audit Events ────────────────────────────────────────────────────────────

export interface SpecAuditEvent {
  id: string;
  workspaceId: string;
  action: SpecAuditAction;
  targetId: string;
  targetType: 'item' | 'section' | 'workspace' | 'snapshot';
  performedBy: string;
  performedAt: string;
  details?: string;
  previousValue?: string;
  newValue?: string;
}

// ── Library ─────────────────────────────────────────────────────────────────

export type SpecLibraryScope = 'personal' | 'practice' | 'platform' | 'manufacturer' | 'standards';

export interface SpecLibraryItem {
  id: string;
  title: string;
  category: string;
  scope: SpecLibraryScope;
  typicalSupplier?: string;
  typicalCostRange?: { min: number; max: number };
  leadTimeRange?: { min: number; max: number };
  commonFinishes?: string[];
  sustainabilityNotes?: string;
  clauseRefs?: string[];
  tags?: string[];
  usageCount: number;
  lastUsedAt?: string;
}

// ── Budget & Readiness ──────────────────────────────────────────────────────

export interface SpecBudgetSummary {
  allowance: number;
  estimate: number;
  delta: number;
  deltaPct?: number;
  overBudgetItems: string[];
  longLeadItems: string[];
  staleItems: string[];
}

export type ReadinessSeverity = 'blocker' | 'high' | 'medium' | 'low';

export interface SpecReadinessFinding {
  severity: ReadinessSeverity;
  itemId: string;
  message: string;
}

// ── Procurement Pipeline ────────────────────────────────────────────────────

export interface SpecProcurementEntry {
  id: string;
  itemId: string;
  itemCode: string;
  itemTitle: string;
  supplier?: string;
  status: ProcurementStatus;
  rfqSentAt?: string;
  quotedAt?: string;
  orderedAt?: string;
  expectedDelivery?: string;
  deliveredAt?: string;
  installedAt?: string;
  quotedCost?: number;
  notes?: string;
}

// ── BoM / BoQ ───────────────────────────────────────────────────────────────

export interface SpecBoMLineItem {
  id: string;
  itemId: string;
  itemCode: string;
  title: string;
  section: string;
  room: string;
  supplier?: string;
  unit: string;
  quantity: number;
  rate: number;
  total: number;
  leadTimeDays: number;
  status: SpecItemStatus;
}

// ── Role Capability Map Type ────────────────────────────────────────────────

export type SpecCapability =
  | 'view_all' | 'view_client_items' | 'view_issued' | 'view_assigned' | 'view_package'
  | 'edit_spec' | 'edit_assigned_draft' | 'edit_templates'
  | 'issue_spec' | 'approve_substitution' | 'approve_client_decision' | 'approve_technical_section'
  | 'confirm_responsibility' | 'assign_roles' | 'submit_for_review'
  | 'review_budget' | 'flag_cost_delta' | 'export_cost_schedule'
  | 'view_budget_summary' | 'comment'
  | 'request_clarification' | 'request_substitution' | 'price_package' | 'update_procurement_status'
  | 'submit_shop_drawing' | 'update_installed_status'
  | 'quote_item' | 'confirm_lead_time' | 'upload_warranty' | 'suggest_alternative'
  | 'upload_site_evidence' | 'flag_site_conflict'
  | 'govern_library' | 'override_with_audit' | 'manage_permissions';

/**
 * Utility: convert a UserRole to SpecForgeRole when applicable.
 * Returns undefined for roles that don't map to SpecForge.
 */
export function toSpecForgeRole(role: UserRole): SpecForgeRole | undefined {
  const mapping: Partial<Record<UserRole, SpecForgeRole>> = {
    client: 'client',
    developer: 'developer',
    architect: 'architect',
    bep: 'bep',
    freelancer: 'freelancer',
    engineer: 'engineer',
    quantity_surveyor: 'quantity_surveyor',
    energy_professional: 'energy_professional',
    fire_engineer: 'fire_engineer',
    contractor: 'contractor',
    subcontractor: 'subcontractor',
    supplier: 'supplier',
    site_manager: 'site_manager',
    admin: 'admin',
    platform_admin: 'platform_admin',
  };
  return mapping[role];
}
