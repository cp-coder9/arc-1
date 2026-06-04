/**
 * Architex Navigation Config
 *
 * Single source of truth for the top-level sidebar and workspace sections.
 * Adapted from the architex-navigation-framework-pack for the arc-1 codebase.
 *
 * @see ARCHITEX_NAVIGATION_FRAMEWORK.md
 */

import type { NavigationItem } from '@/types/navigation';

export const ARCHITEX_NAVIGATION: NavigationItem[] = [
  {
    key: 'command_centre',
    label: 'Command Centre',
    iconHint: 'home/dashboard',
    defaultVisible: true,
    description: 'Personal daily cockpit curated by the user agent.',
    sections: [
      { key: 'today', label: 'Today', description: 'Next actions and daily priorities.' },
      { key: 'active_projects', label: 'Active Projects', description: 'Current project responsibilities.' },
      { key: 'cpd_status', label: 'CPD Status', description: 'Professional learning and compliance summary.' },
      { key: 'priority_messages', label: 'Priority Messages', description: 'Unread project/CPD/finance messages.' },
      { key: 'agent_recommendations', label: 'Agent Recommendations', description: 'Next-best actions from user/project agents.' },
    ],
  },
  {
    key: 'inbox',
    label: 'Inbox',
    iconHint: 'inbox/checklist',
    defaultVisible: true,
    description: 'Protected action centre for required work and agent-pushed tasks.',
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
    iconHint: 'folder/building',
    defaultVisible: true,
    description: 'Phase-aware project workspace.',
    sections: [
      { key: 'dashboard', label: 'Project Dashboard', description: 'Project overview.', projectScoped: true, phaseAware: true },
      { key: 'team', label: 'Team', description: 'Project team and responsibilities.', projectScoped: true, supportsContextualMessaging: true },
      { key: 'documents', label: 'Documents', description: 'Project documents.', projectScoped: true, supportsContextualMessaging: true },
      { key: 'rfis', label: 'RFIs', description: 'Requests for information.', projectScoped: true, phaseAware: true, supportsContextualMessaging: true },
      { key: 'instructions', label: 'Instructions', description: 'Site/project instructions.', projectScoped: true, phaseAware: true, supportsContextualMessaging: true },
      { key: 'snags', label: 'Snags', description: 'Snagging and defects.', projectScoped: true, phaseAware: true, supportsContextualMessaging: true },
      { key: 'payments', label: 'Payments', description: 'Project financial items.', projectScoped: true, phaseAware: true, supportsContextualMessaging: true },
      { key: 'audit_trail', label: 'Audit Trail', description: 'Project record and history.', projectScoped: true },
    ],
  },
  {
    key: 'toolboxes',
    label: 'Toolboxes',
    iconHint: 'tools',
    defaultVisible: true,
    description: 'Role-specific professional tools, not a flat list.',
    sections: [
      { key: 'proposal_appointment', label: 'Proposal & Appointment', description: 'Fee calculators, proposals and appointment workflows.' },
      { key: 'design_compliance', label: 'Design & Compliance', description: 'NBR/SANS/municipal/drawing checks.', supportsContextualMessaging: true },
      { key: 'costing_procurement', label: 'Costing & Procurement', description: 'BoQ, BoM, RFQs and quote comparisons.', supportsContextualMessaging: true },
      { key: 'construction_admin', label: 'Construction Admin', description: 'Site diary, RFIs, variations and certificates.', supportsContextualMessaging: true },
      { key: 'closeout', label: 'Closeout', description: 'Snags, handover and closeout packs.', supportsContextualMessaging: true },
      { key: 'full_library', label: 'Full Tool Library', description: 'All available tools with search/filter.' },
    ],
  },
  {
    key: 'cpd_learning',
    label: 'CPD & Learning',
    iconHint: 'graduation-cap/certificate',
    defaultVisible: true,
    description: 'Separate CPD platform for learning, assessments and professional records.',
    sections: [
      { key: 'cpd_dashboard', label: 'CPD Dashboard', description: 'Role/body-aware CPD status.' },
      { key: 'courses', label: 'Courses & Webinars', description: 'CPD learning content.' },
      { key: 'assessments', label: 'Assessments', description: 'Assessment runner and attempts.', supportsContextualMessaging: true },
      { key: 'certificates', label: 'Certificates', description: 'Issued CPD evidence.', supportsContextualMessaging: true },
      { key: 'manual_submissions', label: 'Manual Submissions', description: 'Professional-body submission tracking.', supportsContextualMessaging: true },
      { key: 'partner_admin', label: 'Partner Admin', description: 'CPD Central/partner administration.', roles: ['architect', 'bep', 'admin'] },
    ],
  },
  {
    key: 'documents',
    label: 'Documents',
    iconHint: 'file/search',
    defaultVisible: true,
    description: 'Global document, template and knowledge hub.',
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
    label: 'Marketplace',
    iconHint: 'users/store',
    defaultVisible: true,
    description: 'Industry network, resources, suppliers and opportunities.',
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
    label: 'Finance',
    iconHint: 'wallet/ledger',
    defaultVisible: true,
    description: 'Commercial controls, payments, escrow and financial records.',
    sections: [
      { key: 'quotes', label: 'Quotes', description: 'Quotes and comparisons.', supportsContextualMessaging: true },
      { key: 'invoices', label: 'Invoices', description: 'Invoices and payments.', supportsContextualMessaging: true },
      { key: 'escrow', label: 'Escrow', description: 'Escrow and drawdown tracking.', supportsContextualMessaging: true },
      { key: 'payment_certificates', label: 'Payment Certificates', description: 'Payment certificate workflow.', supportsContextualMessaging: true },
      { key: 'ledger', label: 'Ledger', description: 'Financial audit trail.' },
    ],
  },
  {
    key: 'messages',
    label: 'Messages',
    iconHint: 'message-circle',
    defaultVisible: true,
    description: 'Full persistent messaging centre linked to mobile messaging and project context.',
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
    iconHint: 'settings',
    defaultVisible: true,
    description: 'User, company, permissions, billing and admin configuration.',
    sections: [
      { key: 'profile', label: 'Profile', description: 'Personal profile and preferences.' },
      { key: 'professional_registrations', label: 'Professional Registrations', description: 'Professional body details.' },
      { key: 'company', label: 'Company', description: 'Company/team settings.' },
      { key: 'billing', label: 'Billing', description: 'Subscription and billing.' },
      { key: 'roles_permissions', label: 'Roles & Permissions', description: 'Access control.', roles: ['admin'] },
      { key: 'platform_admin', label: 'Platform Admin', description: 'System configuration.', roles: ['admin'] },
    ],
  },
];

/**
 * Returns the navigation items visible to a given user role.
 * Items without a `roles` constraint are visible to everyone.
 */
export function navigationForRole(role: string): NavigationItem[] {
  return ARCHITEX_NAVIGATION.filter(
    (item) => !item.roles || item.roles.includes(role as NavigationItem['roles'][number]),
  );
}

/**
 * Look up a single navigation item by its key.
 */
export function navigationByKey(key: string): NavigationItem | undefined {
  return ARCHITEX_NAVIGATION.find((item) => item.key === key);
}
