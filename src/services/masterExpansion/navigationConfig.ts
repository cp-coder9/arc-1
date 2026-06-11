import { ArchitexRole, ProductModuleKey, ProjectPhase } from '@/types/architexMasterTypes';

export type SidebarZoneKey =
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
  | 'settings_admin';

export interface NavigationZone {
  key: SidebarZoneKey;
  label: string;
  purpose: string;
  moduleKeys: ProductModuleKey[];
  primaryRoles: ArchitexRole[];
  phaseSensitive: boolean;
}

export interface WorkspaceRoute {
  zoneKey: SidebarZoneKey;
  routeLabel: string;
  routePath: string;
  moduleKey: ProductModuleKey;
  phases?: ProjectPhase[];
  roles?: ArchitexRole[];
}

export const sidebarZones: NavigationZone[] = [
  {
    key: 'command_centre',
    label: 'Command Centre',
    purpose: 'Executive overview, next-best actions, client/developer control and risk summary.',
    moduleKeys: ['client_command_centre', 'risk_engine', 'project_passport'],
    primaryRoles: ['client', 'developer', 'architect', 'platform_admin'],
    phaseSensitive: true,
  },
  {
    key: 'inbox',
    label: 'Inbox',
    purpose: 'Approvals, overdue tasks, agent prompts, payment releases and risk alerts.',
    moduleKeys: ['risk_engine', 'project_lifecycle', 'finance', 'documents', 'municipal_readiness'],
    primaryRoles: ['client', 'developer', 'architect', 'contractor', 'platform_admin'],
    phaseSensitive: true,
  },
  {
    key: 'projects',
    label: 'Projects',
    purpose: 'Project Passport, lifecycle phases, procurement, site execution, closeout and project records.',
    moduleKeys: ['project_lifecycle', 'project_passport', 'procurement', 'site_execution', 'closeout', 'municipal_readiness', 'risk_engine'],
    primaryRoles: ['client', 'developer', 'architect', 'engineer', 'quantity_surveyor', 'contractor', 'site_manager'],
    phaseSensitive: true,
  },
  {
    key: 'toolboxes',
    label: 'Toolboxes',
    purpose: 'Role-specific calculators, proposal builders and professional workflow utilities.',
    moduleKeys: ['practice_management'],
    primaryRoles: ['architect', 'engineer', 'quantity_surveyor', 'town_planner', 'contractor'],
    phaseSensitive: true,
  },
  {
    key: 'cpd_learning',
    label: 'CPD & Learning',
    purpose: 'CPD assessments, certificates, accreditation workflows and professional learning records.',
    moduleKeys: ['knowledge'],
    primaryRoles: ['architect', 'engineer', 'quantity_surveyor', 'town_planner', 'candidate_professional'],
    phaseSensitive: false,
  },
  {
    key: 'documents',
    label: 'Documents',
    purpose: 'Document register, drawing intelligence, revisions, transmittals and submission/closeout packs.',
    moduleKeys: ['documents'],
    primaryRoles: ['architect', 'engineer', 'town_planner', 'contractor', 'platform_admin'],
    phaseSensitive: true,
  },
  {
    key: 'knowledge',
    label: 'Knowledge',
    purpose: 'Source-linked NBR/SANS, municipal, land-use, template and professional-body knowledge.',
    moduleKeys: ['knowledge', 'municipal_readiness'],
    primaryRoles: ['client', 'developer', 'architect', 'engineer', 'quantity_surveyor', 'town_planner', 'contractor', 'platform_admin'],
    phaseSensitive: false,
  },
  {
    key: 'marketplace',
    label: 'Marketplace',
    purpose: 'Professionals, candidate professionals, suppliers, subcontractors, resources and bookings.',
    moduleKeys: ['marketplace', 'trust_verification'],
    primaryRoles: ['client', 'developer', 'architect', 'contractor', 'supplier', 'candidate_professional', 'platform_admin'],
    phaseSensitive: true,
  },
  {
    key: 'finance',
    label: 'Finance',
    purpose: 'Escrow, payment certificates, invoices, retention, variations and platform-fee ledger.',
    moduleKeys: ['finance'],
    primaryRoles: ['client', 'developer', 'quantity_surveyor', 'contractor', 'platform_admin'],
    phaseSensitive: true,
  },
  {
    key: 'messages',
    label: 'Messages',
    purpose: 'Direct, project, CPD and agent conversations plus linked contextual message history.',
    moduleKeys: ['project_lifecycle', 'project_passport'],
    primaryRoles: ['client', 'developer', 'architect', 'contractor', 'platform_admin'],
    phaseSensitive: true,
  },
  {
    key: 'settings_admin',
    label: 'Settings / Admin',
    purpose: 'Profiles, verification, practice settings, governance, moderation, POPIA and platform admin.',
    moduleKeys: ['admin_governance', 'trust_verification', 'practice_management'],
    primaryRoles: ['platform_admin', 'architect', 'engineer', 'quantity_surveyor', 'contractor'],
    phaseSensitive: false,
  },
];

export const workspaceRoutes: WorkspaceRoute[] = [
  { zoneKey: 'projects', routeLabel: 'Project Passport', routePath: '/projects/:projectId/passport', moduleKey: 'project_passport' },
  { zoneKey: 'projects', routeLabel: 'Lifecycle', routePath: '/projects/:projectId/lifecycle', moduleKey: 'project_lifecycle' },
  { zoneKey: 'projects', routeLabel: 'Municipal Readiness', routePath: '/projects/:projectId/municipal-readiness', moduleKey: 'municipal_readiness', phases: ['municipal_submission'] },
  { zoneKey: 'projects', routeLabel: 'Tender & Procurement', routePath: '/projects/:projectId/procurement', moduleKey: 'procurement', phases: ['tender_procurement', 'construction_execution'] },
  { zoneKey: 'projects', routeLabel: 'Site Execution', routePath: '/projects/:projectId/site', moduleKey: 'site_execution', phases: ['construction_execution'] },
  { zoneKey: 'projects', routeLabel: 'Closeout & Handover', routePath: '/projects/:projectId/closeout', moduleKey: 'closeout', phases: ['closeout', 'defects_liability', 'operations_post_occupancy'] },
  { zoneKey: 'documents', routeLabel: 'Document Register', routePath: '/documents/register', moduleKey: 'documents' },
  { zoneKey: 'documents', routeLabel: 'Drawing Intelligence', routePath: '/documents/drawing-intelligence', moduleKey: 'documents' },
  { zoneKey: 'knowledge', routeLabel: 'Knowledge Hub', routePath: '/knowledge', moduleKey: 'knowledge' },
  { zoneKey: 'knowledge', routeLabel: 'Municipal Knowledge', routePath: '/knowledge/municipal', moduleKey: 'municipal_readiness' },
  { zoneKey: 'marketplace', routeLabel: 'Resource Marketplace', routePath: '/marketplace/resources', moduleKey: 'marketplace' },
  { zoneKey: 'marketplace', routeLabel: 'Verification', routePath: '/marketplace/verification', moduleKey: 'trust_verification' },
  { zoneKey: 'finance', routeLabel: 'Escrow & Milestones', routePath: '/finance/escrow', moduleKey: 'finance' },
  { zoneKey: 'finance', routeLabel: 'Payment Certificates', routePath: '/finance/payment-certificates', moduleKey: 'finance' },
  { zoneKey: 'settings_admin', routeLabel: 'Governance Console', routePath: '/admin/governance', moduleKey: 'admin_governance', roles: ['platform_admin'] },
];

export function navigationZonesForRole(role: ArchitexRole): NavigationZone[] {
  if (role === 'platform_admin') return sidebarZones;
  return sidebarZones.filter((zone) => zone.primaryRoles.includes(role));
}

export function workspaceRoutesForPhase(phase: ProjectPhase): WorkspaceRoute[] {
  return workspaceRoutes.filter((route) => !route.phases || route.phases.includes(phase));
}

export function workspaceRoutesForContext(phase: ProjectPhase, role: ArchitexRole): WorkspaceRoute[] {
  return workspaceRoutesForPhase(phase).filter((route) => !route.roles || route.roles.includes(role));
}
