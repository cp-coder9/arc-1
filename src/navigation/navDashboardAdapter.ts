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
 */
const NAV_TO_DASHBOARD: Record<ArchitexNavKey, string[]> = {
  command_centre: ['command'],
  inbox: ['tasks'],
  projects: ['projects', 'journey', 'programme'],
  toolboxes: ['toolbox', 'design', 'drawing-register', 'drawing-checker', 'sans-forms', 'technical-brief'],
  cpd_learning: ['cpd-assessment', 'knowledge'],
  documents: ['knowledge', 'resource-centre'],
  marketplace: ['bep-marketplace', 'directory-search', 'bep-team', 'bep-freelancers'],
  finance: ['payments', 'invoicing', 'escrow', 'fees'],
  messages: ['messages'],
  settings: ['profile', 'admin-console'],
};

/** Maps each nav key to its icon component name for dynamic rendering. */
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
};

/**
 * Maps an in-route nav-key suffix to the canonical nav key.
 * Used when the URL or active-tab lookup lands on a page ID that belongs
 * to a specific nav-key group.
 */
const DASHBOARD_TO_NAV: Record<string, ArchitexNavKey> = {};

for (const [navKey, pageIds] of Object.entries(NAV_TO_DASHBOARD)) {
  for (const pageId of pageIds) {
    DASHBOARD_TO_NAV[pageId] = navKey as ArchitexNavKey;
  }
}

export function getNavKeyForActiveTab(activeTab: string): ArchitexNavKey | null {
  return DASHBOARD_TO_NAV[activeTab] ?? null;
}

export function getDefaultPageForNavKey(navKey: ArchitexNavKey): string {
  return NAV_TO_DASHBOARD[navKey]?.[0] ?? 'command';
}

export function getPagesForNavKey(navKey: ArchitexNavKey): string[] {
  return NAV_TO_DASHBOARD[navKey] ?? [];
}

export function getIconHintForNavKey(navKey: ArchitexNavKey): string {
  return NAV_KEY_TO_ICON_HINT[navKey];
}
