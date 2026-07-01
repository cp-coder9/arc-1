import type { NavigationItem, WorkspaceSection, LifecycleStage, FieldCaptureCapability, FieldCaptureMode } from './navTypes';
import type { UserRole } from '../types';
import { canPerform, assertFieldAction, type AuthorizationError } from '@/services/fieldAccessService';

export const architexNavigation: NavigationItem[] = [
  {
    key: 'command_centre',
    label: 'Command Centre',
    description: 'Personal daily cockpit curated by the user agent.',
    roles: ['client', 'architect', 'admin', 'freelancer', 'bep', 'contractor', 'subcontractor', 'supplier', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer', 'site_manager', 'developer', 'firm_admin', 'platform_admin'],
    sections: [
      { key: 'today', label: 'Today / Next Actions', description: 'Next actions and daily priorities.' },
      { key: 'active_projects', label: 'Active Projects', description: 'Current project responsibilities.' },
      { key: 'cpd_status', label: 'CPD Status', description: 'Professional learning and compliance summary.' },
      { key: 'priority_messages', label: 'Priority Messages', description: 'Unread project/CPD/finance messages.' },
      { key: 'agent_recommendations', label: 'Agent Recommendations', description: 'Next-best actions from user/project agents.' },
    ],
  },
  {
    key: 'inbox',
    label: 'Inbox / Action Centre',
    description: 'Protected action centre for required work and agent-pushed tasks.',
    roles: ['client', 'architect', 'admin', 'freelancer', 'bep', 'contractor', 'subcontractor', 'supplier', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer', 'site_manager', 'developer', 'firm_admin', 'platform_admin'],
    sections: [
      { key: 'required_actions', label: 'Required Actions', description: 'Tasks requiring user action.', supportsContextualMessaging: true },
      { key: 'approvals', label: 'Approvals', description: 'Items awaiting approval.', supportsContextualMessaging: true },
      { key: 'retakes_resubmissions', label: 'Retakes & Resubmissions', description: 'CPD/project items needing correction.', supportsContextualMessaging: true },
      { key: 'overdue', label: 'Overdue', description: 'Missed or late actions.' },
    ],
  },
  {
    key: 'projects',
    label: 'Projects',
    description: 'Phase-aware project workspace.',
    roles: ['client', 'architect', 'admin', 'bep', 'contractor', 'subcontractor', 'supplier', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer', 'site_manager', 'developer', 'firm_admin', 'platform_admin'],
    sections: [
      { key: 'dashboard', label: 'Project Dashboard', description: 'Project overview.', projectScoped: true, phaseAware: true },
      { key: 'team', label: 'Team', description: 'Project team and responsibilities.', projectScoped: true, supportsContextualMessaging: true },
      { key: 'documents', label: 'Documents', description: 'Project documents.', projectScoped: true, supportsContextualMessaging: true },
      { key: 'rfis', label: 'RFIs', description: 'Requests for information.', projectScoped: true, phaseAware: true, supportsContextualMessaging: true },
      { key: 'instructions', label: 'Instructions', description: 'Site/project instructions.', projectScoped: true, phaseAware: true, supportsContextualMessaging: true },
      { key: 'snags', label: 'Snags', description: 'Snagging and defects.', projectScoped: true, phaseAware: true, supportsContextualMessaging: true, component: 'IssueDashboard', preservesComponents: ['SnagManager'] },
      { key: 'payments', label: 'Payments', description: 'Project financial items.', projectScoped: true, phaseAware: true, supportsContextualMessaging: true },
      { key: 'passport', label: 'Passport', description: 'Single project truth record — health, risks, and stage progress.', projectScoped: true },
      { key: 'audit_trail', label: 'Audit Trail', description: 'Project record and history.', projectScoped: true },
    ],
  },
  {
    key: 'toolboxes',
    label: 'Toolboxes',
    description: 'Role-specific professional tools, not a flat list.',
    roles: ['architect', 'admin', 'freelancer', 'contractor', 'bep', 'subcontractor', 'supplier', 'client', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer', 'site_manager', 'developer', 'firm_admin', 'platform_admin'],
    sections: [
      { key: 'proposal_appointment', label: 'Proposal & Appointment', description: 'Fee calculators, proposals and appointment workflows.' },
      { key: 'design_compliance', label: 'Design & Compliance', description: 'NBR/SANS/municipal/drawing checks.', supportsContextualMessaging: true },
      { key: 'costing_procurement', label: 'Costing & Procurement', description: 'BoQ, BoM, RFQs and quote comparisons.', supportsContextualMessaging: true },
      { key: 'specforge', label: 'SpecForge Specifications', description: 'Pictorial specs, product schedules, approvals, issue and procurement pipeline.', supportsContextualMessaging: true },
      { key: 'construction_admin', label: 'Construction Admin', description: 'Site diary, RFIs, variations and certificates.', supportsContextualMessaging: true, captureStage: 'build', captureCapabilities: ['field_capture', 'checklists', 'field_reporting'] },
      { key: 'closeout', label: 'Closeout', description: 'Snags, handover and closeout packs.', supportsContextualMessaging: true, captureStage: 'closeout', captureCapabilities: ['snag_rectification', 'handover_reporting'] },
      { key: 'full_library', label: 'Full Tool Library', description: 'All available tools with search/filter.' },
    ],
  },
  {
    key: 'cpd_learning',
    label: 'CPD & Learning',
    description: 'Separate CPD platform for learning, assessments and professional records.',
    roles: ['architect', 'admin', 'freelancer'],
    sections: [
      { key: 'cpd_dashboard', label: 'CPD Dashboard', description: 'Role/body-aware CPD status.' },
      { key: 'courses', label: 'Courses & Webinars', description: 'CPD learning content.' },
      { key: 'assessments', label: 'Assessments', description: 'Assessment runner and attempts.', supportsContextualMessaging: true },
      { key: 'certificates', label: 'Certificates', description: 'Issued CPD evidence.', supportsContextualMessaging: true },
      { key: 'manual_submissions', label: 'Manual Submissions', description: 'Professional-body submission tracking.', supportsContextualMessaging: true },
      { key: 'partner_admin', label: 'Partner Admin', description: 'CPD Central/partner administration.', roles: ['admin'] },
    ],
  },
  {
    key: 'documents',
    label: 'Documents / Knowledge Hub',
    description: 'Global document, template and knowledge hub.',
    roles: ['client', 'architect', 'admin', 'bep', 'contractor', 'subcontractor', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer', 'site_manager', 'developer', 'firm_admin', 'platform_admin'],
    sections: [
      { key: 'my_documents', label: 'My Documents', description: 'User documents.' },
      { key: 'project_documents', label: 'Project Documents', description: 'Cross-project document search.', supportsContextualMessaging: true },
      { key: 'templates', label: 'Templates', description: 'Reusable templates.' },
      { key: 'compliance_references', label: 'Compliance References', description: 'Guides and reference material.' },
      { key: 'version_history', label: 'Version History', description: 'Document versions and audit.' },
    ],
  },
  {
    key: 'marketplace',
    label: 'Marketplace / Resource Centre',
    description: 'Industry network, resources, suppliers and opportunities.',
    roles: ['client', 'architect', 'admin', 'bep', 'contractor', 'subcontractor', 'supplier', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer', 'freelancer', 'developer', 'firm_admin'],
    sections: [
      { key: 'professionals', label: 'Professionals', description: 'Find consultants and professionals.' },
      { key: 'contractors', label: 'Contractors', description: 'Find contractors and subcontractors.' },
      { key: 'suppliers', label: 'Suppliers', description: 'Find suppliers.', supportsContextualMessaging: true },
      { key: 'freelancers', label: 'Freelancers', description: 'Candidate professionals and freelancers.' },
      { key: 'resource_sharing', label: 'Resource Sharing', description: 'Plant, equipment and shared resources.' },
      { key: 'opportunities', label: 'Opportunities', description: 'Project opportunities and invitations.', supportsContextualMessaging: true },
    ],
  },
  {
    key: 'finance',
    label: 'Finance & Commercial',
    description: 'Commercial controls, payments, escrow and financial records.',
    roles: ['client', 'admin', 'contractor', 'subcontractor'],
    sections: [
      { key: 'quotes', label: 'Quotes', description: 'Quotes and comparisons.', supportsContextualMessaging: true },
      { key: 'invoices', label: 'Invoices', description: 'Invoices and payments.', supportsContextualMessaging: true },
      { key: 'escrow', label: 'Escrow', description: 'Escrow and drawdown tracking.', supportsContextualMessaging: true },
      { key: 'payment_certificates', label: 'Payment Certificates', description: 'Payment certificate workflow.', supportsContextualMessaging: true },
      { key: 'ledger', label: 'Ledger', description: 'Financial audit trail.' },
    ],
  },
  {
    key: 'analytics',
    label: 'Analytics & Reporting',
    description: 'Role-scoped KPIs computed from real finance, site-execution and verification data.',
    roles: ['client', 'architect', 'admin', 'contractor', 'bep', 'engineer', 'quantity_surveyor', 'town_planner', 'developer', 'firm_admin', 'platform_admin'],
    sections: [
      { key: 'kpi_overview', label: 'KPI Overview', description: 'Schedule variance, cost-to-complete, defect-liability days, retention readiness and compliance-gap count.', projectScoped: true },
      { key: 'project_reports', label: 'Project Reports', description: 'Versioned KPI reports and history per project.', projectScoped: true },
      { key: 'alerts', label: 'Alerts', description: 'KPI threshold and scheduler alerts routed to the action centre.' },
      { key: 'exports', label: 'Exports', description: 'Tenant-isolated CSV and JSON analytics exports with an audit trail.' },
    ],
  },
  {
    key: 'messages',
    label: 'Messages',
    description: 'Full persistent messaging centre linked to project context.',
    roles: ['client', 'architect', 'admin', 'freelancer', 'bep', 'contractor', 'subcontractor', 'supplier', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer', 'site_manager', 'developer', 'firm_admin', 'platform_admin'],
    sections: [
      { key: 'direct', label: 'Direct Messages', description: 'One-to-one messages.' },
      { key: 'project_groups', label: 'Project Groups', description: 'Project group conversations.' },
      { key: 'phase_channels', label: 'Phase Channels', description: 'Phase-specific conversations.' },
      { key: 'cpd_threads', label: 'CPD Threads', description: 'CPD support and course conversations.' },
      { key: 'agent_threads', label: 'Agent Threads', description: 'Personal/project/CPD agent conversations.' },
      { key: 'linked_tasks', label: 'Linked Tasks', description: 'Messages linked to tasks and records.' },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    description: 'User, company, permissions, billing and admin configuration.',
    roles: ['admin'],
    sections: [
      { key: 'profile', label: 'Profile', description: 'Personal profile and preferences.' },
      { key: 'professional_registrations', label: 'Professional Registrations', description: 'Professional body details.' },
      { key: 'company', label: 'Company', description: 'Company/team settings.' },
      { key: 'billing', label: 'Billing', description: 'Subscription and billing.' },
      { key: 'roles_permissions', label: 'Roles & Permissions', description: 'Access control.', roles: ['admin'] },
      { key: 'platform_admin', label: 'Platform Admin', description: 'System configuration.', roles: ['admin'] },
    ],
  },
  {
    key: 'user_settings',
    label: 'My Account',
    description: 'Profile, professional registrations and preferences.',
    roles: ['client', 'architect', 'freelancer', 'contractor', 'subcontractor', 'supplier'],
    sections: [
      { key: 'profile', label: 'Profile', description: 'Personal profile and preferences.' },
      { key: 'professional_registrations', label: 'Professional Registrations', description: 'Professional body details.' },
    ],
  },
];

/**
 * Returns the navigation modules accessible to a given user role.
 *
 * Each top-level module is included if:
 *   - it has no `roles` filter (accessible to all), OR
 *   - the user's role is listed in its `roles` array.
 *
 * Within included modules, sections that carry their own `roles` filter
 * are also filtered by the user's role — sections without a `roles` filter
 * are always included.
 *
 * Preconditions: `role` is a valid UserRole from src/types.ts
 * Postconditions: returns array of NavigationItems visible to that role with
 *   section-level role filtering applied
 */
export function getNavigationForRole(role: UserRole): NavigationItem[] {
  return architexNavigation
    .filter((item) => {
      if (!item.roles || item.roles.length === 0) return true;
      return item.roles.includes(role);
    })
    .map((item) => ({
      ...item,
      sections: item.sections.filter((section) => {
        if (!section.roles || section.roles.length === 0) return true;
        return section.roles.includes(role);
      }),
    }));
}

/**
 * Resolution of the field-capture entry points available for a lifecycle stage.
 *
 * - `mode: 'capture'` — the stage unlocks one or more stage-specific capture
 *   entry points (Build or Close-out). `enabledCapabilities` lists them and
 *   `sectionKey` names the Toolboxes section that surfaces them.
 * - `mode: 'read_reporting'` — every other stage exposes only the read-and-report
 *   Issue Dashboard; `enabledCapabilities` is empty and `sectionKey` is undefined.
 */
export type StageCaptureResolution = {
  stage: LifecycleStage;
  mode: FieldCaptureMode;
  sectionKey?: string;
  enabledCapabilities: FieldCaptureCapability[];
};

/**
 * Resolves the stage-gated field-capture entry points for a lifecycle stage,
 * driven entirely by the declarative `captureStage` / `captureCapabilities`
 * bindings on the Toolboxes sections.
 *
 * Build surfaces field capture, checklists and field reporting through
 * `construction_admin`; Close-out surfaces snag rectification and handover
 * reporting through `closeout`. Every other stage resolves to read-and-report
 * mode with no capture entry points (Requirement 8.2, 8.3, 8.4).
 *
 * Preconditions: `stage` is a valid LifecycleStage
 * Postconditions: returns `mode: 'capture'` with the matching section's
 *   capabilities iff a Toolboxes section declares `captureStage === stage`,
 *   otherwise `mode: 'read_reporting'` with no capabilities
 */
export function resolveStageCapture(stage: LifecycleStage): StageCaptureResolution {
  const toolboxes = architexNavigation.find((item) => item.key === 'toolboxes');
  const match: WorkspaceSection | undefined = toolboxes?.sections.find(
    (section) => section.captureStage === stage && (section.captureCapabilities?.length ?? 0) > 0,
  );

  if (match) {
    return {
      stage,
      mode: 'capture',
      sectionKey: match.key,
      enabledCapabilities: [...(match.captureCapabilities ?? [])],
    };
  }

  return { stage, mode: 'read_reporting', enabledCapabilities: [] };
}

/**
 * Role-aware access level for the field tools surfaced across navigation.
 *
 * - `'full'` — editor roles (site_manager, contractor, subcontractor,
 *   architect, engineer, bep) may capture, edit, transition, and report.
 * - `'read_reporting'` — the client may only view issues, the dashboard, and
 *   field reports; every mutating action is denied.
 * - `'denied'` — any other role is denied access entirely, with an
 *   authorization error.
 */
export type FieldToolsAccessLevel = 'full' | 'read_reporting' | 'denied';

/**
 * Resolution of the field-tools visibility for a user role. Stays config-driven
 * by deferring the permission matrix to `fieldAccessService` (`EDITOR_ROLES` /
 * `canPerform`) rather than duplicating it here.
 */
export type FieldToolsAccessResolution = {
  role: UserRole;
  access: FieldToolsAccessLevel;
  /** Editor roles may create/edit/delete/transition field records. */
  canCapture: boolean;
  /** Editor roles and the client may view the dashboard and field reports. */
  canReport: boolean;
  /** Present only when access is denied (Requirement 6.2, 6.5). */
  error?: AuthorizationError;
};

/**
 * Resolves the role-aware visibility of the field tools across navigation,
 * driven by the `fieldAccessService` permission matrix.
 *
 * Editor roles get full access; the `client` gets read-and-reporting only and
 * is denied every mutating action; all other roles are denied with the
 * authorization error produced by `assertFieldAction` (Requirement 6.1, 6.2).
 *
 * Preconditions: `role` is a valid UserRole
 * Postconditions: returns `access: 'full'` iff `canPerform(role, 'create')`,
 *   `access: 'read_reporting'` for `client`, otherwise `access: 'denied'` with
 *   the authorization error and `canCapture`/`canReport` both false
 */
export function resolveFieldToolsAccess(role: UserRole): FieldToolsAccessResolution {
  // Editor roles: full access — delegate to the shared permission matrix.
  if (canPerform(role, 'create')) {
    return { role, access: 'full', canCapture: true, canReport: true };
  }

  // Client: read-and-reporting only — may view, never mutate.
  if (role === 'client') {
    return { role, access: 'read_reporting', canCapture: false, canReport: true };
  }

  // Any other role: denied, reusing the service's authorization error.
  const decision = assertFieldAction(role, 'create', 'field_tools');
  return {
    role,
    access: 'denied',
    canCapture: false,
    canReport: false,
    error: decision.error,
  };
}
