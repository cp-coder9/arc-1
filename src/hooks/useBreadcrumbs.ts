/**
 * useBreadcrumbs Hook
 *
 * Derives the current breadcrumb trail from window.location.pathname and maps
 * path segments to human-readable labels. Always includes "Home" as the first
 * item. Accepts an optional `overrides` parameter for callers that need to
 * supply an exact breadcrumb trail (e.g. deep project pages).
 *
 * Usage:
 *   const breadcrumbs = useBreadcrumbs();
 *   // [{ id: 'home', label: 'Home', href: '/' }, { id: 'projects', label: 'Projects', href: '/projects' }]
 *
 *   const breadcrumbs = useBreadcrumbs([
 *     { id: 'home',     label: 'Home',    href: '/' },
 *     { id: 'projects', label: 'Projects', href: '/projects' },
 *     { id: 'abc123',   label: 'Sea Side Villa', href: '/projects/abc123' },
 *   ]);
 *
 * Requirements: 6.1
 */

import { useState, useEffect } from 'react';

/**
 * A single breadcrumb navigation item.
 *
 * @property id    - Unique identifier for this crumb (used as React key).
 * @property label - Human-readable display label.
 * @property href  - Navigation target; the last crumb's href equals the current URL.
 */
export interface BreadcrumbItem {
  id: string;
  label: string;
  href: string;
}

/**
 * Mapping of known route segments to human-readable labels.
 * Keys are lowercase path segments (e.g. "dashboard").
 * Dynamic segments (UUIDs / alphanumeric IDs) fall back to their raw value.
 */
const SEGMENT_LABELS: Readonly<Record<string, string>> = {
  dashboard: 'Dashboard',
  projects: 'Projects',
  settings: 'Settings',
  profile: 'Profile',
  team: 'Team',
  documents: 'Documents',
  rfis: 'RFIs',
  instructions: 'Instructions',
  snags: 'Snags',
  payments: 'Payments',
  passport: 'Passport',
  audit_trail: 'Audit Trail',
  toolboxes: 'Toolboxes',
  cpd: 'CPD & Learning',
  inbox: 'Inbox',
  marketplace: 'Marketplace',
  compliance: 'Compliance',
  people: 'People',
  admin: 'Admin',
  help: 'Help & Support',
  finance: 'Finance',
  reports: 'Reports',
  analytics: 'Analytics',
  notifications: 'Notifications',
  account: 'Account',
  billing: 'Billing',
  verify: 'Verify',
};

/**
 * Convert a raw URL path segment into a human-readable label.
 *
 * Known segments map to SEGMENT_LABELS. Unknown segments that look like IDs
 * (alphanumeric without word-separator characters) are returned as-is so
 * callers can override them with meaningful names via the `overrides`
 * parameter. Human-readable slugs (containing hyphens or underscores) are
 * title-cased.
 */
function segmentToLabel(segment: string): string {
  const lower = segment.toLowerCase();
  if (SEGMENT_LABELS[lower]) {
    return SEGMENT_LABELS[lower];
  }
  // Treat as a raw ID when the segment is purely alphanumeric (no separators)
  // — e.g. "abc123", "proj001", UUIDs with hyphens (full UUID pattern), or
  // pure-numeric strings. Callers should use `overrides` to substitute a
  // meaningful display name for these.
  const isId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) || // UUID
    /^\d+$/.test(segment) || // pure numeric
    /^[a-zA-Z0-9]+$/.test(segment); // alphanumeric without separators → ID-like
  if (isId) {
    return segment;
  }
  // Title-case human-readable slug (e.g. "firm-admin" → "Firm Admin")
  return segment
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Build a breadcrumb array from a pathname string.
 *
 * Preconditions:
 *   - pathname starts with '/' (standard window.location.pathname format)
 *
 * Postconditions:
 *   - Always returns at least one item: the "Home" crumb for '/'
 *   - Each crumb's href is the cumulative path up to that segment
 *   - Empty segments (trailing slash, double slash) are filtered out
 */
export function buildBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [
    { id: 'home', label: 'Home', href: '/' },
  ];

  const segments = pathname
    .split('/')
    .filter(Boolean); // remove empty strings from leading/trailing slashes

  let cumulativePath = '';
  for (const segment of segments) {
    cumulativePath += `/${segment}`;
    crumbs.push({
      id: segment,
      label: segmentToLabel(segment),
      href: cumulativePath,
    });
  }

  return crumbs;
}

/**
 * useBreadcrumbs — React hook that returns the current breadcrumb trail.
 *
 * Preconditions:
 *   - Called inside a React component
 *   - window.location.pathname is available (browser environment)
 *
 * Postconditions:
 *   - Returns overrides array unchanged when overrides is provided and non-empty
 *   - Otherwise derives crumbs from the current pathname via buildBreadcrumbs()
 *   - Updates automatically when the pathname changes (popstate / pushState)
 *   - Always includes "Home" as the first item in auto-generated crumbs
 *
 * @param overrides - Optional explicit breadcrumb trail that replaces auto-generation.
 * @returns Array of BreadcrumbItem objects representing the navigation hierarchy.
 */
export function useBreadcrumbs(overrides?: BreadcrumbItem[]): BreadcrumbItem[] {
  const [pathname, setPathname] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname;
    }
    return '/';
  });

  useEffect(() => {
    if (overrides && overrides.length > 0) {
      // No need to track pathname changes when overrides are provided
      return;
    }

    const handleLocationChange = () => {
      setPathname(window.location.pathname);
    };

    // Listen for browser back/forward navigation
    window.addEventListener('popstate', handleLocationChange);

    // Patch history.pushState and history.replaceState so SPA navigations
    // (React Router, Wouter, manual pushState calls) trigger updates too.
    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);

    history.pushState = function (...args) {
      originalPushState(...args);
      handleLocationChange();
    };

    history.replaceState = function (...args) {
      originalReplaceState(...args);
      handleLocationChange();
    };

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  }, [overrides]);

  // When overrides are provided and non-empty, use them directly
  if (overrides && overrides.length > 0) {
    return overrides;
  }

  return buildBreadcrumbs(pathname);
}

export default useBreadcrumbs;
