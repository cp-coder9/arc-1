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
  projects: ['projects', 'journey', 'programme'],
  toolboxes: ['toolbox', 'design', 'drawing-register', 'drawing-checker', 'sans-forms', 'technical-brief'],
  cpd_learning: ['cpd-assessment', 'knowledge'],
  documents: ['documents', 'resource-centre'],
  marketplace: ['bep-marketplace', 'directory-search', 'bep-team', 'bep-freelancers'],
  finance: ['payments', 'invoicing', 'escrow', 'fees'],
  messages: ['messages'],
  settings: ['profile', 'admin-console'],
  user_settings: ['profile'],
};

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
  messages: 'Mail',
  settings: 'Settings2',
  user_settings: 'UserCog',
};

export function getIconHintForNavKey(navKey: ArchitexNavKey): string {
  return NAV_KEY_TO_ICON_HINT[navKey];
}
