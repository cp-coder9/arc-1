/**
 * Navigation-to-Dashboard Mapping Adapter
 *
 * Maps the new architex navigation config keys to existing dashboard page IDs,
 * so the sidebar can render from the config while routing to the existing
 * dashboard components.
 */
import type { ArchitexNavKey } from './navTypes';

/**
 * Maps a top-level navigation key to one or more existing dashboard page IDs.
 * The first entry is the default active tab when the nav item is opened.
 *
 * NOTE: A page ID may legitimately be listed under multiple nav keys
 * (e.g. 'knowledge' under both cpd_learning and documents). The reverse
 * lookup (DASHBOARD_TO_NAV) captures all of them.
 */
const NAV_TO_DASHBOARD: Record<ArchitexNavKey, string[]> = {
  command_centre: ['command'],
  inbox: ['tasks'],
  projects: ['projects', 'journey', 'programme', 'passport'],
  toolboxes: ['toolbox', 'design', 'drawing-register', 'drawing-checker', 'sans-forms', 'technical-brief'],
  cpd_learning: ['cpd-assessment', 'knowledge'],
  documents: ['files', 'resource-centre'],
  marketplace: ['bep-marketplace', 'directory-search', 'bep-team', 'bep-freelancers'],
  finance: ['payments', 'invoicing', 'escrow', 'fees'],
  analytics: ['analytics'],
  messages: ['messages'],
  settings: ['profile', 'admin-console'],
  user_settings: ['profile'],
};

/**
 * Per-section routing overrides. Section keys are scoped by their parent
 * nav key as `${navKey}:${sectionKey}`. When a section has no entry here,
 * the sidebar falls back to `getDefaultPageForNavKey(navKey)`.
 *
 * Keep this table aligned with the sections defined in
 * `architexNavigationConfig.ts` and the canonical page IDs in `App.tsx`.
 */
const SECTION_TO_PAGE: Record<string, string> = {
  // command_centre — all variants land on the command centre dashboard
  'command_centre:today': 'command',
  'command_centre:active_projects': 'projects',
  'command_centre:cpd_status': 'cpd-assessment',
  'command_centre:priority_messages': 'messages',
  'command_centre:agent_recommendations': 'command',

  // inbox — task workflow page
  'inbox:required_actions': 'tasks',
  'inbox:approvals': 'tasks',
  'inbox:retakes_resubmissions': 'tasks',
  'inbox:overdue': 'tasks',

  // projects — real workflow pages
  'projects:dashboard': 'projects',
  'projects:team': 'bep-team',
  'projects:documents': 'files',
  'projects:rfis': 'journey',
  'projects:instructions': 'journey',
  'projects:snags': 'snagging',
  'projects:payments': 'payments',
  'projects:passport': 'passport',
  'projects:audit_trail': 'passport',

  // toolboxes — discipline-specific tool surfaces
  'toolboxes:proposal_appointment': 'packages',
  'toolboxes:design_compliance': 'design',
  'toolboxes:costing_procurement': 'procurement',
  'toolboxes:construction_admin': 'construction',
  'toolboxes:closeout': 'snagging',
  'toolboxes:full_library': 'toolbox',

  // cpd_learning — assessment + knowledge surfaces
  'cpd_learning:cpd_dashboard': 'cpd-assessment',
  'cpd_learning:courses': 'knowledge',
  'cpd_learning:assessments': 'cpd-assessment',
  'cpd_learning:certificates': 'cpd-assessment',
  'cpd_learning:manual_submissions': 'cpd-assessment',
  'cpd_learning:partner_admin': 'admin-console',

  // documents — file manager + resource centre + templates + compliance
  'documents:my_documents': 'files',
  'documents:project_documents': 'files',
  'documents:templates': 'templates',
  'documents:compliance_references': 'compliance',
  'documents:version_history': 'files',

  // marketplace — directory / team / opportunities surfaces
  'marketplace:professionals': 'directory-search',
  'marketplace:contractors': 'directory-search',
  'marketplace:suppliers': 'directory-search',
  'marketplace:freelancers': 'bep-freelancers',
  'marketplace:resource_sharing': 'resource-sharing',
  'marketplace:opportunities': 'bep-marketplace',

  // finance — fee / invoice / escrow surfaces
  'finance:quotes': 'packages',
  'finance:invoices': 'invoicing',
  'finance:escrow': 'escrow',
  'finance:payment_certificates': 'payments',
  'finance:ledger': 'payments',

  // analytics — single dashboard page covers the four sub-views
  'analytics:kpi_overview': 'analytics',
  'analytics:project_reports': 'analytics',
  'analytics:alerts': 'analytics',
  'analytics:exports': 'analytics',

  // messages — single hub page
  'messages:direct': 'messages',
  'messages:project_groups': 'messages',
  'messages:phase_channels': 'messages',
  'messages:cpd_threads': 'messages',
  'messages:agent_threads': 'messages',
  'messages:linked_tasks': 'messages',

  // settings — admin/profile split
  'settings:profile': 'profile',
  'settings:professional_registrations': 'registrations',
  'settings:company': 'admin-console',
  'settings:billing': 'admin-console',
  'settings:roles_permissions': 'admin-console',
  'settings:platform_admin': 'admin-console',

  // user_settings — profile only
  'user_settings:profile': 'profile',
  'user_settings:professional_registrations': 'registrations',
};

/**
 * Resolve the page id for a given (navKey, sectionKey) pair. Falls back to
 * the module default when the section has no explicit mapping.
 */
export function getPageForNavSection(navKey: ArchitexNavKey, sectionKey: string): string {
  return SECTION_TO_PAGE[`${navKey}:${sectionKey}`] ?? getDefaultPageForNavKey(navKey);
}

/**
 * Reverse index: page ID → list of nav keys that contain it.
 * Handles 1:N mappings so pages that belong to multiple nav groups
 * (e.g. 'knowledge' in both cpd_learning and documents) are preserved.
 */
const DASHBOARD_TO_NAV: Record<string, ArchitexNavKey[]> = {};

for (const [navKey, pageIds] of Object.entries(NAV_TO_DASHBOARD)) {
  for (const pageId of pageIds) {
    if (!DASHBOARD_TO_NAV[pageId]) {
      DASHBOARD_TO_NAV[pageId] = [];
    }
    DASHBOARD_TO_NAV[pageId].push(navKey as ArchitexNavKey);
  }
}

export function getNavKeyForActiveTab(activeTab: string): ArchitexNavKey | null {
  const keys = DASHBOARD_TO_NAV[activeTab];
  // If a page belongs to multiple nav groups, return the first one
  // (which corresponds to the first nav key that listed it)
  return keys?.[0] ?? null;
}

export function getAllNavKeysForPage(pageId: string): ArchitexNavKey[] {
  return DASHBOARD_TO_NAV[pageId] ?? [];
}

export function getDefaultPageForNavKey(navKey: ArchitexNavKey): string {
  return NAV_TO_DASHBOARD[navKey]?.[0] ?? 'command';
}

export function getPagesForNavKey(navKey: ArchitexNavKey): string[] {
  return NAV_TO_DASHBOARD[navKey] ?? [];
}

/** Maps each nav key to its icon component name for single-source icon rendering. */
const NAV_KEY_TO_ICON_HINT: Record<ArchitexNavKey, string> = {
  command_centre: 'LayoutDashboard',
  inbox: 'ClipboardCheck',
  projects: 'FileText',
  toolboxes: 'Files',
  cpd_learning: 'BookOpen',
  documents: 'Database',
  marketplace: 'Search',
  finance: 'CreditCard',
  analytics: 'BarChart3',
  messages: 'Mail',
  settings: 'Settings2',
  user_settings: 'UserCog',
};

export function getIconHintForNavKey(navKey: ArchitexNavKey): string {
  return NAV_KEY_TO_ICON_HINT[navKey];
}
