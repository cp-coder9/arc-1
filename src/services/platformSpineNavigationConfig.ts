/**
 * Architex Platform Spine — Navigation Configuration
 *
 * Defines the top-level navigation zones and project workspace routes
 * with role and phase gating. This is the single source of truth for
 * what appears in the sidebar and inside a project workspace.
 *
 * The existing architexNavigationConfig.ts provides the detailed UI
 * configuration (sections, icons, contextual messaging support).
 * This module provides the foundational role/phase contracts that
 * feature packs should consume when they need to understand navigation
 * visibility rules.
 *
 * @see architexNavigationConfig.ts — detailed navigation UI config
 * @see ARCHITEX_PLATFORM_SPINE_BRIEF.md
 */

import type {
  ArchitexRole,
  NavigationZone,
  ProjectPhase,
  WorkspaceRoute,
} from '@/types/platformSpine';

// ── Role Groups ─────────────────────────────────────────────────────────────

export const ALL_ROLES: ArchitexRole[] = [
  'client_developer',
  'architect',
  'engineer',
  'quantity_surveyor',
  'contractor',
  'supplier',
  'candidate_professional',
  'admin',
];

export const PROFESSIONAL_ROLES: ArchitexRole[] = [
  'architect',
  'engineer',
  'quantity_surveyor',
  'candidate_professional',
];

export const DELIVERY_ROLES: ArchitexRole[] = [
  'contractor',
  'supplier',
];

// ── Top-Level Navigation Zones ──────────────────────────────────────────────

export const NAVIGATION_ZONES: NavigationZone[] = [
  {
    id: 'command_centre',
    label: 'Command Centre',
    description: 'Executive next-best actions, risk and project overview.',
    route: '/command-centre',
    roles: ALL_ROLES,
    badgeSource: 'risk',
  },
  {
    id: 'inbox',
    label: 'Inbox',
    description: 'Actionable workflow events, approvals, alerts and reminders.',
    route: '/inbox',
    roles: ALL_ROLES,
    badgeSource: 'inbox',
  },
  {
    id: 'projects',
    label: 'Projects',
    description: 'Project Passport, lifecycle, tasks, teams and records.',
    route: '/projects',
    roles: ALL_ROLES,
  },
  {
    id: 'toolboxes',
    label: 'Toolboxes',
    description: 'Role-specific built-environment tools, calculators and proposal builders.',
    route: '/toolboxes',
    roles: [...PROFESSIONAL_ROLES, 'client_developer', 'contractor', 'admin'],
  },
  {
    id: 'cpd_learning',
    label: 'CPD & Learning',
    description: 'Professional development, certificates, accreditation and CPD records.',
    route: '/cpd',
    roles: [...PROFESSIONAL_ROLES, 'admin'],
  },
  {
    id: 'documents',
    label: 'Documents',
    description: 'Drawing registers, transmittals, submissions and closeout documentation.',
    route: '/documents',
    roles: ['client_developer', ...PROFESSIONAL_ROLES, 'contractor', 'admin'],
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    description: 'NBR/SANS, municipal notes, templates, clauses and verified practice guidance.',
    route: '/knowledge',
    roles: ALL_ROLES,
  },
  {
    id: 'marketplace',
    label: 'Marketplace',
    description: 'Professionals, candidates, suppliers, subcontractors and resource sharing.',
    route: '/marketplace',
    roles: ALL_ROLES,
  },
  {
    id: 'finance',
    label: 'Finance',
    description: 'Escrow, invoices, payment certificates, retention, variations and ledger.',
    route: '/finance',
    roles: ['client_developer', 'quantity_surveyor', 'contractor', 'supplier', 'admin'],
  },
  {
    id: 'messages',
    label: 'Messages',
    description: 'Contextual project and platform messaging.',
    route: '/messages',
    roles: ALL_ROLES,
    badgeSource: 'messages',
  },
  {
    id: 'settings_admin',
    label: 'Settings / Admin',
    description: 'Profile, company, governance, verification and platform administration.',
    route: '/settings',
    roles: ALL_ROLES,
    badgeSource: 'admin',
  },
];

// ── Project Workspace Routes ────────────────────────────────────────────────

export const WORKSPACE_ROUTES: WorkspaceRoute[] = [
  {
    id: 'passport',
    routeLabel: 'Project Passport',
    path: 'passport',
    phases: [
      'onboarding', 'feasibility', 'appointment', 'concept_design',
      'design_development', 'municipal_submission', 'tender_procurement',
      'construction_execution', 'closeout',
    ],
    roles: ALL_ROLES,
    description: 'Single project truth record.',
  },
  {
    id: 'lifecycle',
    routeLabel: 'Lifecycle',
    path: 'lifecycle',
    phases: [
      'onboarding', 'feasibility', 'appointment', 'concept_design',
      'design_development', 'municipal_submission', 'tender_procurement',
      'construction_execution', 'closeout',
    ],
    roles: ALL_ROLES,
    description: 'Phase tracker and handoff control.',
  },
  {
    id: 'tasks',
    routeLabel: 'Tasks',
    path: 'tasks',
    phases: [
      'onboarding', 'feasibility', 'appointment', 'concept_design',
      'design_development', 'municipal_submission', 'tender_procurement',
      'construction_execution', 'closeout',
    ],
    roles: ALL_ROLES,
    description: 'Project tasks, approvals and accountable actions.',
  },
  {
    id: 'documents',
    routeLabel: 'Documents',
    path: 'documents',
    phases: [
      'concept_design', 'design_development', 'municipal_submission',
      'tender_procurement', 'construction_execution', 'closeout',
    ],
    roles: ['client_developer', ...PROFESSIONAL_ROLES, 'contractor', 'admin'],
    description: 'Drawing register, revisions, submissions and closeout packs.',
  },
  {
    id: 'municipal',
    routeLabel: 'Municipal Readiness',
    path: 'municipal-readiness',
    phases: ['feasibility', 'concept_design', 'design_development', 'municipal_submission'],
    roles: ['client_developer', 'architect', 'engineer', 'admin'],
    description: 'Submission readiness and municipal blockers.',
  },
  {
    id: 'procurement',
    routeLabel: 'Tender / Procurement',
    path: 'procurement',
    phases: ['tender_procurement', 'construction_execution'],
    roles: ['client_developer', 'architect', 'quantity_surveyor', ...DELIVERY_ROLES, 'admin'],
    description: 'RFQs, quotes, comparisons, awards and purchase orders.',
  },
  {
    id: 'site',
    routeLabel: 'Site Execution',
    path: 'site',
    phases: ['construction_execution'],
    roles: [
      'client_developer', 'architect', 'engineer',
      'quantity_surveyor', 'contractor', 'supplier', 'admin',
    ],
    description: 'Site diary, RFIs, instructions, snags and progress records.',
  },
  {
    id: 'finance',
    routeLabel: 'Finance',
    path: 'finance',
    phases: ['appointment', 'tender_procurement', 'construction_execution', 'closeout'],
    roles: ['client_developer', 'quantity_surveyor', 'contractor', 'supplier', 'admin'],
    description: 'Milestones, payment certificates, escrow and variations.',
  },
  {
    id: 'closeout',
    routeLabel: 'Closeout',
    path: 'closeout',
    phases: ['closeout'],
    roles: ['client_developer', ...PROFESSIONAL_ROLES, 'contractor', 'supplier', 'admin'],
    description: 'Snags, completion certificates, warranties and handover packs.',
  },
  {
    id: 'messages',
    routeLabel: 'Messages',
    path: 'messages',
    phases: [
      'onboarding', 'feasibility', 'appointment', 'concept_design',
      'design_development', 'municipal_submission', 'tender_procurement',
      'construction_execution', 'closeout',
    ],
    roles: ALL_ROLES,
    description: 'Contextual project chat and agent suggestions.',
  },
];

// ── Public Query Functions ──────────────────────────────────────────────────

/**
 * Returns the navigation zones visible to a given role.
 */
export function navigationZonesForRole(role: ArchitexRole): NavigationZone[] {
  return NAVIGATION_ZONES.filter((zone) => zone.roles.includes(role));
}

/**
 * Returns the workspace routes available for a role in a given project phase.
 */
export function workspaceRoutesForContext(
  role: ArchitexRole,
  phase: ProjectPhase,
): WorkspaceRoute[] {
  return WORKSPACE_ROUTES.filter(
    (route) => route.roles.includes(role) && route.phases.includes(phase),
  );
}

/**
 * Returns the full set of workspace routes (unfiltered).
 */
export function allWorkspaceRoutes(): WorkspaceRoute[] {
  return [...WORKSPACE_ROUTES];
}

/**
 * Returns the full set of navigation zones (unfiltered).
 */
export function allNavigationZones(): NavigationZone[] {
  return [...NAVIGATION_ZONES];
}
