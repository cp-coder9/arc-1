/**
 * Command Centre URL Encoding Utilities
 *
 * Provides URL building, parsing, and browser history management for the
 * Command Centre's deep-linkable routing scheme.
 *
 * URL format: /command-centre/:projectId/:viewId
 *
 * @module navigation/commandCentreUrlUtils
 */

import type { CommandCentreView } from '@/services/commandCentre/types';

// ── Constants ────────────────────────────────────────────────────────────────

/** Base path prefix for all Command Centre URLs. */
const BASE_PATH = '/command-centre';

/**
 * All registered Command Centre view identifiers.
 * Used to validate parsed viewId values.
 */
export const REGISTERED_VIEWS: readonly CommandCentreView[] = [
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
] as const;

// ── URL Building ─────────────────────────────────────────────────────────────

/**
 * Builds a Command Centre URL path from a project ID and view ID.
 *
 * @param projectId - The Firestore document ID of the active project
 * @param viewId - A registered Command Centre view identifier
 * @returns The URL path string: `/command-centre/:projectId/:viewId`
 *
 * @example
 * buildCommandCentreUrl('abc123', 'tasks')
 * // → '/command-centre/abc123/tasks'
 */
export function buildCommandCentreUrl(projectId: string, viewId: CommandCentreView): string {
  return `${BASE_PATH}/${encodeURIComponent(projectId)}/${encodeURIComponent(viewId)}`;
}

// ── URL Parsing ──────────────────────────────────────────────────────────────

/**
 * Parses a URL path to extract the project ID and view ID.
 *
 * Returns null if the path does not match the expected Command Centre format
 * or if the view ID is not a registered view.
 *
 * @param path - The URL path to parse (e.g. `/command-centre/abc123/tasks`)
 * @returns The extracted `{ projectId, viewId }` pair, or null if invalid
 *
 * @example
 * parseCommandCentreUrl('/command-centre/abc123/tasks')
 * // → { projectId: 'abc123', viewId: 'tasks' }
 *
 * parseCommandCentreUrl('/some/other/path')
 * // → null
 */
export function parseCommandCentreUrl(
  path: string,
): { projectId: string; viewId: CommandCentreView } | null {
  // Strip leading/trailing slashes and split into segments
  const segments = path.replace(/^\/+|\/+$/g, '').split('/');

  // Expect exactly: ['command-centre', projectId, viewId]
  if (segments.length !== 3 || segments[0] !== 'command-centre') {
    return null;
  }

  const projectId = decodeURIComponent(segments[1]);
  const viewId = decodeURIComponent(segments[2]);

  // Validate projectId is non-empty
  if (!projectId) {
    return null;
  }

  // Validate viewId against registered views
  if (!isRegisteredView(viewId)) {
    return null;
  }

  return { projectId, viewId };
}

// ── History State Management ─────────────────────────────────────────────────

/**
 * Pushes a new Command Centre state onto the browser history stack.
 * This enables browser back/forward navigation between previously visited views.
 *
 * Uses `history.pushState` to update the URL without triggering a full page reload.
 *
 * @param projectId - The Firestore document ID of the active project
 * @param viewId - The Command Centre view to navigate to
 */
export function pushCommandCentreState(projectId: string, viewId: CommandCentreView): void {
  const url = buildCommandCentreUrl(projectId, viewId);
  window.history.pushState({ projectId, viewId }, '', url);
}

/**
 * Replaces the current browser history entry with a new Command Centre state.
 * Useful for the initial load or correcting the URL without creating a new
 * history entry (e.g., redirecting to a default view).
 *
 * @param projectId - The Firestore document ID of the active project
 * @param viewId - The Command Centre view being displayed
 */
export function replaceCommandCentreState(projectId: string, viewId: CommandCentreView): void {
  const url = buildCommandCentreUrl(projectId, viewId);
  window.history.replaceState({ projectId, viewId }, '', url);
}

// ── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Type guard to check if a string is a registered Command Centre view ID.
 */
function isRegisteredView(value: string): value is CommandCentreView {
  return (REGISTERED_VIEWS as readonly string[]).includes(value);
}
