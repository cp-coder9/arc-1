/**
 * Role-View Access Matrix and Complexity Mode Gating
 *
 * Determines which Command Centre views are accessible to each role,
 * applies complexity mode filtering (Simple/Full), and derives default
 * complexity mode based on contract value threshold.
 *
 * @module commandCentre/roleViewMatrix
 */

import type { CommandCentreView, ComplexityMode } from '@/services/commandCentre/types';
import type { UserRole } from '@/types';

// ── Constants ────────────────────────────────────────────────────────────────

/** Contract value threshold for default complexity mode (R 5,000,000). */
const CONTRACT_VALUE_THRESHOLD = 5_000_000;

/** Views available in Simple mode — a focused subset for smaller projects. */
export const SIMPLE_MODE_VIEWS: CommandCentreView[] = [
  'dashboard',
  'tasks',
  'milestones',
  'budget',
  'site-diary',
  'quality',
  'documents',
  'actions',
];

/** All navigable views within the Command Centre. */
export const ALL_VIEWS: CommandCentreView[] = [
  'dashboard',
  'programme',
  'tasks',
  'milestones',
  'calendar',
  'team',
  'site-diary',
  'rfis',
  'issues',
  'quality',
  'budget',
  'valuations',
  'procurement',
  'contracts',
  'analytics',
  'ai-advisor',
  'documents',
  'settings',
  'actions',
  'notifications',
  'passport',
  'form-system',
  'audit-trail',
];

// ── Role-View Matrix ─────────────────────────────────────────────────────────

/**
 * Maps each UserRole to the set of views they are permitted to access
 * in Full complexity mode. Roles not explicitly listed here get no views.
 */
const ROLE_VIEW_MAP: Record<UserRole, CommandCentreView[]> = {
  // Client: high-level overview only
  client: ['dashboard', 'milestones', 'budget', 'documents', 'notifications'],

  // Full-access roles
  architect: [...ALL_VIEWS],
  bep: [...ALL_VIEWS],

  // Site manager: execution-focused
  site_manager: ['dashboard', 'programme', 'tasks', 'site-diary', 'rfis', 'quality', 'team'],

  // Quantity surveyor: commercial-focused
  quantity_surveyor: ['dashboard', 'budget', 'valuations', 'procurement', 'contracts', 'milestones', 'analytics'],

  // Contractor and subcontractor: field execution + own procurement
  contractor: ['dashboard', 'tasks', 'programme', 'site-diary', 'rfis', 'quality', 'procurement'],
  subcontractor: ['dashboard', 'tasks', 'programme', 'site-diary', 'rfis', 'quality', 'procurement'],

  // Supplier: minimal — own orders/RFQs and relevant documents
  supplier: ['procurement', 'documents'],

  // Engineer: technical execution
  engineer: ['dashboard', 'programme', 'tasks', 'rfis', 'quality', 'documents'],

  // Admin / platform roles: full access
  admin: [...ALL_VIEWS],
  platform_admin: [...ALL_VIEWS],
  firm_admin: [...ALL_VIEWS],

  // Developer (property developer): broad project visibility
  developer: ['dashboard', 'programme', 'tasks', 'milestones', 'budget', 'valuations', 'procurement', 'contracts', 'analytics', 'documents', 'notifications'],

  // Town planner: design and compliance views
  town_planner: ['dashboard', 'programme', 'tasks', 'milestones', 'documents', 'quality'],

  // Energy professional: compliance and quality
  energy_professional: ['dashboard', 'programme', 'tasks', 'quality', 'documents'],

  // Fire engineer: compliance and quality
  fire_engineer: ['dashboard', 'programme', 'tasks', 'quality', 'documents'],

  // Freelancer: task and document access
  freelancer: ['dashboard', 'tasks', 'documents', 'notifications'],

  // Land surveyor: survey and document access
  land_surveyor: ['dashboard', 'programme', 'tasks', 'documents', 'quality'],

  // H&S Officer: safety-focused execution views
  health_safety: ['dashboard', 'programme', 'tasks', 'site-diary', 'quality', 'documents', 'notifications'],

  // Construction Project Manager: execution-focused
  cpm: ['dashboard', 'programme', 'tasks', 'site-diary', 'rfis', 'quality', 'procurement', 'documents'],
};

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the list of Command Centre views accessible to a given role,
 * filtered by the active complexity mode.
 *
 * - In Full mode, the role's full view set is returned.
 * - In Simple mode, only views in the SIMPLE_MODE_VIEWS subset are returned
 *   (intersected with the role's permitted views).
 */
export function getViewsForRole(role: UserRole, mode: ComplexityMode): CommandCentreView[] {
  const roleViews = ROLE_VIEW_MAP[role] ?? [];

  if (mode === 'full') {
    return roleViews;
  }

  // Simple mode: intersect role views with the simple subset
  return roleViews.filter((view) => SIMPLE_MODE_VIEWS.includes(view));
}

/**
 * Checks whether a specific view is accessible for a given role and mode.
 */
export function isViewAccessible(
  role: UserRole,
  view: CommandCentreView,
  mode: ComplexityMode,
): boolean {
  const views = getViewsForRole(role, mode);
  return views.includes(view);
}

/**
 * Derives the default complexity mode based on contract value.
 *
 * - Contract value < R 5,000,000 → Simple
 * - Contract value ≥ R 5,000,000 → Full
 */
export function getDefaultComplexityMode(contractValue: number): ComplexityMode {
  return contractValue >= CONTRACT_VALUE_THRESHOLD ? 'full' : 'simple';
}
