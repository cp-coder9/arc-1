/**
 * Architex Platform Spine — Shared Domain Types
 *
 * Defines the stable contracts for navigation zones, roles, project phases,
 * project passports, workflow events, inbox items, and agent recommendations.
 *
 * These types form the foundational spine that feature-specific packs layer onto.
 * Future modules (CPD, Toolboxes, Documents, Knowledge, Marketplace, Finance,
 * Project Lifecycle, Agent Orchestration) should consume and extend these types
 * rather than defining competing navigation or event models.
 *
 * @see ARCHITEX_PLATFORM_SPINE_BRIEF.md
 * @see architex_platform_spine_manifest_v0_1.json
 */

// ── Core Domain Value Types ─────────────────────────────────────────────────

/** The eight primary user roles in the Architex platform. */
export type ArchitexRole =
  | 'client_developer'
  | 'architect'
  | 'engineer'
  | 'quantity_surveyor'
  | 'contractor'
  | 'supplier'
  | 'candidate_professional'
  | 'admin'
  | 'platform_admin'
  | 'site_manager';

/** The nine project lifecycle phases. */
export type ProjectPhase =
  | 'onboarding'
  | 'feasibility'
  | 'appointment'
  | 'concept_design'
  | 'design_development'
  | 'municipal_submission'
  | 'tender_procurement'
  | 'construction_execution'
  | 'closeout';

/** Top-level platform navigation zone identifiers. */
export type NavigationZoneId =
  | 'command_centre'
  | 'inbox'
  | 'projects'
  | 'toolboxes'
  | 'cpd_learning'
  | 'documents'
  | 'knowledge'
  | 'marketplace'
  | 'finance'
  | 'messages'
  | 'site'
  | 'settings_admin';

/** Workflow event types that drive inbox items and agent recommendations. */
export type WorkflowEventType =
  | 'document_updated'
  | 'approval_required'
  | 'quote_received'
  | 'payment_due'
  | 'municipal_blocker'
  | 'cpd_certificate_ready'
  | 'task_overdue'
  | 'risk_detected'
  | 'project_phase_changed';

/** Standard priority levels for events, inbox items, and recommendations. */
export type Priority = 'low' | 'medium' | 'high' | 'critical';

// ── Navigation & Workspace ──────────────────────────────────────────────────

/** A top-level sidebar navigation zone with role-based visibility. */
export interface NavigationZone {
  id: NavigationZoneId;
  label: string;
  description: string;
  route: string;
  roles: ArchitexRole[];
  badgeSource?: 'inbox' | 'risk' | 'messages' | 'admin';
}

/** A route within a project workspace, gated by phase and role. */
export interface WorkspaceRoute {
  id: string;
  routeLabel: string;
  path: string;
  phases: ProjectPhase[];
  roles: ArchitexRole[];
  description: string;
}

// ── Project Passport ────────────────────────────────────────────────────────

/**
 * Single source of truth record for a project.
 * Every project has exactly one passport that travels through phases.
 */
export interface ProjectPassport {
  projectId: string;
  projectName: string;
  phase: ProjectPhase;
  municipality: string;
  propertyUse: string;
  riskLevel: Priority;
  leadProfessionalRole: ArchitexRole;
  missingRecords: string[];
}

// ── Workflow Events & Inbox ─────────────────────────────────────────────────

/** A workflow event emitted by any platform module. */
export interface WorkflowEvent {
  id: string;
  type: WorkflowEventType;
  projectId?: string;
  title: string;
  detail: string;
  priority: Priority;
  sourceModule: NavigationZoneId;
  assignedRoles: ArchitexRole[];
  createdAt: string;
  dueAt?: string;
}

/** An actionable inbox item derived from a workflow event for a specific role. */
export interface InboxItem {
  id: string;
  title: string;
  detail: string;
  priority: Priority;
  route: string;
  assignedRoles: ArchitexRole[];
  sourceEventId: string;
}

// ── Agent Recommendations ───────────────────────────────────────────────────

/**
 * A computed recommendation from a user or project agent.
 * Pure computation type — distinct from the Firestore-persisted
 * AgentRecommendation in @/types which carries full audit trail data.
 */
export interface PlatformAgentRecommendation {
  id: string;
  agentScope: 'user' | 'project';
  title: string;
  rationale: string;
  recommendedActionLabel: string;
  priority: Priority;
  requiresApproval: boolean;
  relatedRoute: string;
}

// ── User Context & Snapshot ─────────────────────────────────────────────────

/** Lightweight user context for spine computation. */
export interface UserContext {
  userId: string;
  displayName: string;
  role: ArchitexRole;
  projectIds: string[];
}

/**
 * A complete platform spine snapshot for a user + project combination.
 * This is the primary output contract — the UI shell consumes this snapshot
 * to render role-aware navigation, workspace routes, inbox, and recommendations.
 */
export interface PlatformSpineSnapshot {
  user: UserContext;
  navigationZones: NavigationZone[];
  projectPassport: ProjectPassport;
  workspaceRoutes: WorkspaceRoute[];
  inboxItems: InboxItem[];
  recommendations: PlatformAgentRecommendation[];
}
