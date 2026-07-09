import type { NavigationItem, WorkspaceSection, LifecycleStage, FieldCaptureCapability, FieldCaptureMode } from './navTypes';
import type { UserRole, AuthzUser } from '../types';
import { canPerform, assertFieldAction, type AuthorizationError } from '@/services/fieldAccessService';

export const architexNavigation: NavigationItem[] = [
  {
    key: 'command_centre',
    label: 'Command Centre',
    description: 'Personal daily cockpit curated by the user agent.',
    roles: ['client', 'architect', 'freelancer', 'bep', 'contractor', 'subcontractor', 'supplier', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer', 'site_manager', 'developer', 'firm_admin', 'platform_admin'],
    sections: [
      { key: 'today', label: 'Today / Next Actions', description: 'Next actions and daily priorities.' },
      { key: 'active_projects', label: 'Active Projects', description: 'Current project responsibilities.' },
      { key: 'wingman', label: 'Wingman', description: 'AI Copilot — role-aware project assistant.' },
      { key: 'cpd_status', label: 'CPD Status', description: 'Professional learning and compliance summary.' },
      { key: 'priority_messages', label: 'Priority Messages', description: 'Unread project/CPD/finance messages.' },
      { key: 'agent_recommendations', label: 'Agent Recommendations', description: 'Next-best actions from user/project agents.' },
      // Legacy project module sections merged into Command Centre (Requirements 2.2, 2.3, 2.5)
      { key: 'dashboard', label: 'Project Dashboard', description: 'Project overview.', projectScoped: true, phaseAware: true },
      { key: 'team', label: 'Team', description: 'Project team and responsibilities.', projectScoped: true, supportsContextualMessaging: true },
      { key: 'documents', label: 'Documents', description: 'Project documents.', projectScoped: true, supportsContextualMessaging: true },
      { key: 'rfis', label: 'RFIs', description: 'Requests for information.', projectScoped: true, phaseAware: true, supportsContextualMessaging: true },
      { key: 'instructions', label: 'Instructions', description: 'Site/project instructions.', projectScoped: true, phaseAware: true, supportsContextualMessaging: true },
      { key: 'snags', label: 'Snags', description: 'Snagging and defects.', projectScoped: true, phaseAware: true, supportsContextualMessaging: true, component: 'IssueDashboard', preservesComponents: ['SnagManager'] },
      { key: 'payments', label: 'Payments', description: 'Project financial items.', projectScoped: true, phaseAware: true, supportsContextualMessaging: true },
      { key: 'passport', label: 'Passport', description: 'Single project truth record — health, risks, and stage progress.', projectScoped: true },
      { key: 'form-system', label: 'Forms', description: 'Auto-fill project forms and manage construction documents.', projectScoped: true },
      { key: 'audit_trail', label: 'Audit Trail', description: 'Project record and history.', projectScoped: true },
    ],
  },
  {
    key: 'inbox',
    label: 'Inbox / Action Centre',
    description: 'Protected action centre for required work and agent-pushed tasks.',
    roles: ['client', 'architect', 'freelancer', 'bep', 'contractor', 'subcontractor', 'supplier', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer', 'site_manager', 'developer', 'firm_admin', 'platform_admin'],
    sections: [
      { key: 'required_actions', label: 'Required Actions', description: 'Tasks requiring user action.', supportsContextualMessaging: true },
      { key: 'approvals', label: 'Approvals', description: 'Items awaiting approval.', supportsContextualMessaging: true },
      { key: 'retakes_resubmissions', label: 'Retakes & Resubmissions', description: 'CPD/project items needing correction.', supportsContextualMessaging: true },
      { key: 'overdue', label: 'Overdue', description: 'Missed or late actions.' },
    ],
  },
  {
    key: 'toolboxes',
    label: 'Toolboxes',
    description: 'Role-specific professional tools, not a flat list.',
    roles: ['architect', 'freelancer', 'contractor', 'bep', 'subcontractor', 'supplier', 'client', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer', 'site_manager', 'developer', 'firm_admin', 'health_safety'],
    sections: [
      { key: 'proposal_appointment', label: 'Proposal & Appointment', description: 'Fee calculators, proposals and appointment workflows.' },
      { key: 'design_compliance', label: 'Design & Compliance', description: 'NBR/SANS/municipal/drawing checks.', supportsContextualMessaging: true },
      { key: 'council-navigator', label: 'Council Drawing Navigator', description: 'Municipality-specific drawing submission requirements.' },
      { key: 'form-system', label: 'Form System', description: 'Auto-fill & manage construction documents — templates, drafts, export, and audit.', supportsContextualMessaging: true },
      { key: 'costing_procurement', label: 'Costing & Procurement', description: 'BoQ, BoM, RFQs and quote comparisons.', supportsContextualMessaging: true },
      { key: 'rfq-marketplace', label: 'RFQ Marketplace', description: 'Supplier RFQ creation, quoting, comparison, and award — Module 6 procurement.', supportsContextualMessaging: true, roles: ['architect', 'quantity_surveyor', 'contractor', 'supplier', 'platform_admin'] },
      { key: 'bim-quantity-extraction', label: 'BIM Quantities', description: 'IFC model extraction, ASAQS/JBCC BoQ generation, and procurement package feed.', supportsContextualMessaging: true },
      { key: 'specforge', label: 'SpecForge Specifications', description: 'Pictorial specs, product schedules, approvals, issue and procurement pipeline.', supportsContextualMessaging: true },
      { key: 'town-planning', label: 'Town Planning Tracker', description: 'SPLUMA application lifecycle — rezoning, subdivision, consent use, conditions, appeals.', supportsContextualMessaging: true },
      { key: 'eia-workspace', label: 'EIA & Environmental', description: 'NEMA EIA lifecycle, screening, authorization, EMPr, public participation, and green building certification.', supportsContextualMessaging: true },
      { key: 'construction_admin', label: 'Construction Admin', description: 'Site diary, RFIs, variations and certificates.', supportsContextualMessaging: true, captureStage: 'build', captureCapabilities: ['field_capture', 'checklists', 'field_reporting'] },
      { key: 'ncr-manager', label: 'NCR Manager', description: 'Non-conformance report management and resolution.' },
      { key: 'site-instructions', label: 'Site Instructions', description: 'Site instruction issuance and tracking.' },
      { key: 'contract-admin', label: 'Contract Administration', description: 'Claims, variations, EoT, notices, and payment schedules.' },
      { key: 'contractor-compliance', label: 'Contractor Compliance', description: 'Contractor and supplier compliance gate dashboard.' },
      { key: 'disputes', label: 'Dispute Resolution', description: 'Cross-project dispute management.' },
      { key: 'health_safety', label: 'Health & Safety', description: 'Safety file, permits, HIRA, inductions, incidents, H&S plans and fall protection — Construction Regulations 2014.', supportsContextualMessaging: true, captureStage: 'build', captureCapabilities: ['field_capture', 'checklists'] },
      { key: 'itp-workspace', label: 'Inspection Test Plans', description: 'QA/QC inspection test plans, hold points, material testing, and compliance reporting.' },
      { key: 'municipal-refuse-area-calculator', label: 'Refuse Area Calculator', description: 'Municipal refuse storage area computation — advisory compliance tool for bin quantities, room dimensions, and vehicle access.' },
      { key: 'closeout', label: 'Closeout', description: 'Snags, handover and closeout packs.', supportsContextualMessaging: true, captureStage: 'closeout', captureCapabilities: ['snag_rectification', 'handover_reporting'] },
      { key: 'full_library', label: 'Full Tool Library', description: 'All available tools with search/filter.' },
    ],
  },
  {
    key: 'cpd_learning',
    label: 'CPD & Learning',
    description: 'Separate CPD platform for learning, assessments and professional records.',
    roles: ['architect', 'freelancer'],
    sections: [
      { key: 'cpd_dashboard', label: 'CPD Dashboard', description: 'Role/body-aware CPD status.' },
      { key: 'courses', label: 'Courses & Webinars', description: 'CPD learning content.' },
      { key: 'assessments', label: 'Assessments', description: 'Assessment runner and attempts.', supportsContextualMessaging: true },
      { key: 'certificates', label: 'Certificates', description: 'Issued CPD evidence.', supportsContextualMessaging: true },
      { key: 'manual_submissions', label: 'Manual Submissions', description: 'Professional-body submission tracking.', supportsContextualMessaging: true },
      { key: 'partner_admin', label: 'Partner Admin', description: 'CPD Central/partner administration.', roles: ['platform_admin'] },
    ],
  },
  {
    key: 'documents',
    label: 'Documents / Knowledge Hub',
    description: 'Global document, template and knowledge hub.',
    roles: ['client', 'architect', 'bep', 'contractor', 'subcontractor', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer', 'site_manager', 'developer', 'firm_admin'],
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
    roles: ['client', 'architect', 'bep', 'contractor', 'supplier'],
    sections: [
      { key: 'professionals', label: 'Professionals', description: 'Find consultants and professionals.' },
      { key: 'contractors', label: 'Contractors', description: 'Find contractors and subcontractors.' },
      { key: 'suppliers', label: 'Suppliers', description: 'Find suppliers.', supportsContextualMessaging: true },
      { key: 'freelancers', label: 'Freelancers', description: 'Candidate professionals and freelancers.' },
      { key: 'resource_sharing', label: 'Resource Sharing', description: 'Plant, equipment and shared resources.' },
      { key: 'remote_desktop_marketplace', label: 'Marketplace', description: 'Browse, filter, and book remote desktop resources.', roles: ['freelancer', 'contractor', 'subcontractor', 'bep', 'architect', 'firm_admin', 'platform_admin'] },
      { key: 'remote_desktop_viewer', label: 'Remote Desktop Viewer', description: 'Live remote desktop session viewer for active bookings.', roles: ['freelancer', 'contractor', 'subcontractor', 'bep', 'architect', 'firm_admin', 'platform_admin'] },
      { key: 'opportunities', label: 'Opportunities', description: 'Project opportunities and invitations.', supportsContextualMessaging: true },
    ],
  },
  {
    key: 'finance',
    label: 'Finance & Commercial',
    description: 'Commercial controls, payments, escrow and financial records.',
    roles: ['client', 'contractor', 'subcontractor'],
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
    roles: ['client', 'architect', 'contractor', 'bep', 'engineer', 'quantity_surveyor', 'town_planner', 'developer', 'firm_admin'],
    sections: [
      { key: 'kpi_overview', label: 'KPI Overview', description: 'Schedule variance, cost-to-complete, defect-liability days, retention readiness and compliance-gap count.', projectScoped: true },
      { key: 'project_reports', label: 'Project Reports', description: 'Versioned KPI reports and history per project.', projectScoped: true },
      { key: 'alerts', label: 'Alerts', description: 'KPI threshold and scheduler alerts routed to the action centre.' },
      { key: 'exports', label: 'Exports', description: 'Tenant-isolated CSV and JSON analytics exports with an audit trail.' },
    ],
  },
  {
    key: 'practice_management',
    label: 'Practice Management',
    description: 'Firm-level practice management — timesheets, expenses, billing, WIP, profitability, invoicing, resource planning, leave, and income forecasting.',
    roles: ['architect', 'bep', 'freelancer', 'contractor', 'subcontractor', 'engineer', 'quantity_surveyor', 'firm_admin'],
    sections: [
      { key: 'pm-timesheets', label: 'Timesheets', description: 'Weekly time capture and submission.' },
      { key: 'pm-expenses', label: 'Expenses', description: 'Expense claim management.' },
      { key: 'pm-fee-tracker', label: 'Fee Tracker', description: 'Project fee health by SACAP stage.', roles: ['architect', 'bep', 'firm_admin'] },
      { key: 'pm-wip', label: 'WIP Report', description: 'Work-in-progress position.', roles: ['architect', 'bep', 'firm_admin'] },
      { key: 'pm-profitability', label: 'Profitability', description: 'Project and firm profitability.', roles: ['architect', 'bep', 'firm_admin'] },
      { key: 'pm-invoicing', label: 'Invoicing', description: 'Practice invoice lifecycle.', roles: ['architect', 'bep', 'firm_admin'] },
      { key: 'pm-resources', label: 'Resource Planning', description: 'Team capacity and allocation.', roles: ['architect', 'bep', 'firm_admin'] },
      { key: 'pm-leave', label: 'Leave', description: 'Leave requests and calendar.' },
      { key: 'pm-forecast', label: 'Income Forecast', description: 'Rolling 12-month forecast.', roles: ['firm_admin'] },
      { key: 'pm-pipeline', label: 'Pipeline', description: 'CRM pipeline opportunities.', roles: ['architect', 'bep', 'firm_admin'] },
      { key: 'pm-firm-dashboard', label: 'Firm Dashboard', description: 'Firm Command Centre.', roles: ['firm_admin'] },
    ],
  },
  {
    key: 'messages',
    label: 'Messages',
    description: 'Full persistent messaging centre linked to project context.',
    roles: ['client', 'architect', 'freelancer', 'bep', 'contractor', 'subcontractor', 'supplier', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer', 'site_manager', 'developer', 'firm_admin'],
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
    roles: ['platform_admin'],
    sections: [
      { key: 'profile', label: 'Profile', description: 'Personal profile and preferences.' },
      { key: 'professional_registrations', label: 'Professional Registrations', description: 'Professional body details.' },
      { key: 'company', label: 'Company', description: 'Company/team settings.' },
      { key: 'billing', label: 'Billing', description: 'Subscription and billing.' },
      { key: 'roles_permissions', label: 'Roles & Permissions', description: 'Access control.', roles: ['platform_admin'] },
      { key: 'platform_admin', label: 'Platform Admin', description: 'System configuration.', roles: ['platform_admin'] },
    ],
  },
  {
    key: 'verification_queue',
    label: 'Verification Queue',
    description: 'User and professional verification queue for platform operators.',
    roles: ['platform_admin'],
    sections: [
      { key: 'pending', label: 'Pending Verifications', description: 'Users awaiting identity and credential verification.' },
      { key: 'in_progress', label: 'In Progress', description: 'Verifications currently under review.' },
      { key: 'completed', label: 'Completed', description: 'Resolved verification decisions.' },
    ],
  },
  {
    key: 'ai_review_queue',
    label: 'AI Review Queue',
    description: 'Review AI-generated outputs requiring human confirmation before release.',
    roles: ['platform_admin'],
    sections: [
      { key: 'pending_review', label: 'Pending Review', description: 'AI outputs awaiting human confirmation.' },
      { key: 'flagged', label: 'Flagged', description: 'AI outputs flagged for specialist review.' },
      { key: 'resolved', label: 'Resolved', description: 'Reviewed and released or rejected AI outputs.' },
    ],
  },
  {
    key: 'system_health',
    label: 'System Health',
    description: 'Platform health monitoring, service status and audit metrics.',
    roles: ['platform_admin'],
    sections: [
      { key: 'services', label: 'Service Status', description: 'Live service health and response metrics.' },
      { key: 'error_rates', label: 'Error Rates', description: 'Error rate trends and alerts.' },
      { key: 'audit_metrics', label: 'Audit Metrics', description: 'Audit trail density and compliance metrics.' },
    ],
  },
  {
    key: 'feedback_intelligence',
    label: 'Feedback Intelligence',
    description: 'AI-powered feedback pipeline — clusters, trends, severity scoring, and closed-loop notifications.',
    roles: ['platform_admin'],
    sections: [
      { key: 'overview', label: 'Overview', description: 'Summary of feedback clusters, activity, and key metrics.' },
      { key: 'clusters', label: 'Clusters', description: 'Feedback clusters sorted by severity with filtering and pagination.' },
      { key: 'trends', label: 'Trends', description: 'Feedback volume trend chart by category over time.' },
      { key: 'friction_signals', label: 'Friction Signals', description: 'Implicit friction detections from user sessions.' },
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
 * Professional roles used to detect dual-role users.
 * Mirrors the authoritative list in permissionService.ts.
 */
const PROFESSIONAL_ROLES: readonly string[] = [
  'client', 'architect', 'freelancer', 'bep', 'contractor', 'subcontractor',
  'supplier', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional',
  'fire_engineer', 'site_manager', 'developer', 'firm_admin', 'land_surveyor', 'health_safety',
];

/**
 * Returns the navigation modules accessible to a normalized AuthzUser,
 * supporting dual-role users who hold both a Professional_Role and
 * `platform_admin` privileges (via `admin: true` or `isPlatformAdmin: true`).
 *
 * For dual-role users, returns the UNION of:
 *   - Modules accessible to the user's Professional_Role
 *   - Modules accessible to `platform_admin`
 *
 * Modules appearing in both sets are deduplicated (by key). Section-level
 * filtering is applied for BOTH roles — sections with `roles: ['platform_admin']`
 * are visible to dual-role users.
 *
 * For single-role users (only a Professional_Role or only platform_admin),
 * delegates to `getNavigationForRole`.
 *
 * Preconditions: `user` is a normalized AuthzUser (via normalizeUserForAuthz)
 * Postconditions: returns deduplicated array of NavigationItems with merged
 *   section visibility for dual-role users
 *
 * Validates: Requirements 2.7
 */
export function getNavigationForUser(user: AuthzUser | null | undefined): NavigationItem[] {
  if (!user) return [];

  const role = user.role as UserRole | undefined;
  const isDualRole = user.isPlatformAdmin === true &&
    typeof role === 'string' &&
    PROFESSIONAL_ROLES.includes(role);

  // Single-role: delegate to existing function
  if (!isDualRole) {
    if (user.isPlatformAdmin || role === 'platform_admin') {
      return getNavigationForRole('platform_admin');
    }
    if (role) {
      return getNavigationForRole(role as UserRole);
    }
    return [];
  }

  // Dual-role: compute union of both module sets
  const professionalRole = role as UserRole;
  const professionalModules = getNavigationForRole(professionalRole);
  const platformModules = getNavigationForRole('platform_admin');

  // Merge: start with professional modules, add platform-only modules
  const mergedMap = new Map<string, NavigationItem>();

  for (const mod of professionalModules) {
    mergedMap.set(mod.key, mod);
  }

  for (const mod of platformModules) {
    if (!mergedMap.has(mod.key)) {
      // Platform-only module (settings, verification_queue, etc.) — add directly
      mergedMap.set(mod.key, mod);
    } else {
      // Module exists in both sets — merge section visibility
      const existing = mergedMap.get(mod.key)!;
      const mergedSections = mergeSections(existing.sections, mod.sections);
      mergedMap.set(mod.key, { ...existing, sections: mergedSections });
    }
  }

  return Array.from(mergedMap.values());
}

/**
 * Merges two section arrays by key, deduplicating and preferring the version
 * that includes more permissive role visibility (i.e. if a section appears in
 * the platform set, it's included even if the professional set filtered it out).
 */
function mergeSections(professionalSections: WorkspaceSection[], platformSections: WorkspaceSection[]): WorkspaceSection[] {
  const sectionMap = new Map<string, WorkspaceSection>();

  for (const section of professionalSections) {
    sectionMap.set(section.key, section);
  }

  for (const section of platformSections) {
    if (!sectionMap.has(section.key)) {
      // Section only visible to platform_admin — include it for dual-role user
      sectionMap.set(section.key, section);
    }
    // If already present, keep the existing (professional) version — both roles have access
  }

  return Array.from(sectionMap.values());
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
