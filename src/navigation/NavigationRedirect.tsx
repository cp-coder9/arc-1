/**
 * Navigation Redirect — Legacy Route → Command Centre Route Mapping
 *
 * Intercepts legacy project URLs (e.g. `/projects/:id/documents`) and
 * performs a client-side redirect to the corresponding Command Centre URL
 * (`/command-centre/:id/documents`), preserving the projectId and all
 * query string parameters.
 *
 * Unmapped legacy routes redirect to the Command Centre root (dashboard)
 * with a notification indicating the page has moved.
 *
 * @module navigation/NavigationRedirect
 * @see Requirements 1.4, 2.6, 2.7, 13.1, 13.2, 13.6
 */

import type { CommandCentreView } from '@/services/commandCentre/types';

// ── Interfaces ───────────────────────────────────────────────────────────────

/**
 * Maps a legacy URL path pattern to a Command Centre view.
 */
export interface RouteMapping {
  /** Legacy route path segment (e.g. 'documents', 'snags') */
  legacyPattern: string;
  /** Target Command Centre view identifier */
  commandCentreView: CommandCentreView;
  /** Whether to preserve query string parameters in the redirect */
  preserveParams: boolean;
}

/**
 * Configuration for the redirect system including TTL and fallback behavior.
 */
export interface RedirectConfig {
  /** All registered legacy route → Command Centre view mappings */
  mappings: RouteMapping[];
  /** Minimum months to maintain redirect mappings after deployment */
  ttlMonths: number;
  /** View to redirect to when no mapping exists for a legacy route */
  fallbackView: CommandCentreView;
}

// ── Route Mappings ───────────────────────────────────────────────────────────

/**
 * Complete set of legacy route pattern mappings.
 *
 * Each entry maps a legacy `/projects/:id/<section>` path segment
 * to the equivalent Command Centre view.
 */
export const LEGACY_ROUTE_MAPPINGS: RouteMapping[] = [
  { legacyPattern: 'documents', commandCentreView: 'documents', preserveParams: true },
  { legacyPattern: 'snags', commandCentreView: 'quality', preserveParams: true },
  { legacyPattern: 'instructions', commandCentreView: 'rfis', preserveParams: true },
  { legacyPattern: 'team', commandCentreView: 'team', preserveParams: true },
  { legacyPattern: 'payments', commandCentreView: 'budget', preserveParams: true },
  { legacyPattern: 'passport', commandCentreView: 'dashboard', preserveParams: true },
  { legacyPattern: 'form-system', commandCentreView: 'documents', preserveParams: true },
  { legacyPattern: 'audit-trail', commandCentreView: 'dashboard', preserveParams: true },
  { legacyPattern: 'rfis', commandCentreView: 'rfis', preserveParams: true },
  { legacyPattern: 'dashboard', commandCentreView: 'dashboard', preserveParams: true },
];

// ── Redirect Configuration ───────────────────────────────────────────────────

/**
 * Active redirect configuration.
 *
 * - ttlMonths: 6 — redirects remain active for 6 months post-deployment
 *   (Requirement 13.1)
 * - fallbackView: 'dashboard' — unmapped routes land on the Command Centre
 *   root with a notification (Requirement 13.6)
 */
export const REDIRECT_CONFIG: RedirectConfig = {
  mappings: LEGACY_ROUTE_MAPPINGS,
  ttlMonths: 6,
  fallbackView: 'dashboard',
};

// ── Redirect Logic ───────────────────────────────────────────────────────────

/**
 * Result of resolving a legacy route against the redirect configuration.
 */
export interface RedirectResult {
  /** The target Command Centre URL path */
  targetUrl: string;
  /** The matched Command Centre view (or fallback) */
  targetView: CommandCentreView;
  /** Whether a mapping was found (false = unmapped, fell back to dashboard) */
  mapped: boolean;
  /** Whether to show a notification to the user about the redirect */
  showNotification: boolean;
  /** Notification message (present when showNotification is true) */
  notificationMessage?: string;
}

/**
 * Parses a legacy project URL path to extract projectId and section.
 *
 * Expected format: `/projects/:projectId/:section`
 *
 * @returns parsed components or null if the path doesn't match the legacy pattern
 */
export function parseLegacyRoute(path: string): { projectId: string; section: string } | null {
  // Normalise: remove trailing slash, trim whitespace
  const normalised = path.replace(/\/+$/, '').trim();

  // Match /projects/:projectId/:section (with optional leading slash)
  const match = normalised.match(/^\/projects\/([^/]+)\/([^/]+)$/);
  if (!match) return null;

  const [, projectId, section] = match;
  if (!projectId || !section) return null;

  return { projectId, section };
}

/**
 * Resolves a legacy project route to a Command Centre redirect target.
 *
 * Preserves the projectId and all query string parameters from the original
 * URL. If no mapping exists for the legacy section, redirects to the
 * fallback view (dashboard) with a notification.
 *
 * @param path - The legacy URL path (e.g. `/projects/abc123/documents`)
 * @param queryString - The original query string (without leading `?`), or empty string
 * @param config - Redirect configuration (defaults to REDIRECT_CONFIG)
 * @returns RedirectResult with the target URL and notification state
 *
 * @example
 * ```ts
 * resolveLegacyRedirect('/projects/abc123/snags', 'status=open&page=2')
 * // → { targetUrl: '/command-centre/abc123/quality?status=open&page=2', ... }
 * ```
 */
export function resolveLegacyRedirect(
  path: string,
  queryString: string = '',
  config: RedirectConfig = REDIRECT_CONFIG,
): RedirectResult | null {
  const parsed = parseLegacyRoute(path);
  if (!parsed) return null;

  const { projectId, section } = parsed;

  // Find matching mapping
  const mapping = config.mappings.find(
    (m) => m.legacyPattern === section,
  );

  if (mapping) {
    // Mapped route — redirect to the corresponding Command Centre view
    const qs = mapping.preserveParams && queryString ? `?${queryString}` : '';
    const targetUrl = `/command-centre/${projectId}/${mapping.commandCentreView}${qs}`;

    return {
      targetUrl,
      targetView: mapping.commandCentreView,
      mapped: true,
      showNotification: false,
    };
  }

  // Unmapped route — fallback to dashboard with notification (Requirement 13.6)
  const qs = queryString ? `?${queryString}` : '';
  const targetUrl = `/command-centre/${projectId}/${config.fallbackView}${qs}`;

  return {
    targetUrl,
    targetView: config.fallbackView,
    mapped: false,
    showNotification: true,
    notificationMessage: `The page "/projects/${projectId}/${section}" has moved. You have been redirected to the Command Centre.`,
  };
}

/**
 * Checks whether a given URL path is a legacy project route that should
 * be intercepted for redirection.
 *
 * @param path - The current URL path
 * @returns true if the path matches the legacy `/projects/:id/:section` pattern
 */
export function isLegacyProjectRoute(path: string): boolean {
  return parseLegacyRoute(path) !== null;
}

/**
 * Checks whether the redirect configuration is still within its TTL window.
 *
 * @param deploymentDate - The date the unified Command Centre was deployed
 * @param currentDate - The current date (defaults to now)
 * @param config - Redirect configuration (defaults to REDIRECT_CONFIG)
 * @returns true if redirects are still within the TTL window
 */
export function isRedirectActive(
  deploymentDate: Date,
  currentDate: Date = new Date(),
  config: RedirectConfig = REDIRECT_CONFIG,
): boolean {
  const ttlMs = config.ttlMonths * 30 * 24 * 60 * 60 * 1000; // Approximate months in ms
  const elapsed = currentDate.getTime() - deploymentDate.getTime();
  return elapsed <= ttlMs;
}

/**
 * Performs the client-side redirect for a legacy project route.
 *
 * Uses `history.replaceState` for seamless navigation without adding
 * the legacy URL to the browser history stack. Does NOT trigger a full
 * page reload (Requirement 1.4: within 1 second, no intermediate page).
 *
 * @param result - The resolved redirect result
 * @returns true if the redirect was performed, false if not applicable
 */
export function performRedirect(result: RedirectResult): boolean {
  if (typeof window === 'undefined') return false;

  // Replace the legacy URL in the history (don't push — avoids back-button loop)
  window.history.replaceState(null, '', result.targetUrl);
  return true;
}
