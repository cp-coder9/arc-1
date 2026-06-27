import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBreadcrumbs, buildBreadcrumbs } from './useBreadcrumbs';
import type { BreadcrumbItem } from './useBreadcrumbs';

/**
 * Tests for useBreadcrumbs hook and buildBreadcrumbs utility.
 *
 * Validates:
 *   Requirement 6.1 — useBreadcrumbs() hook returns array of breadcrumb objects
 */

// ---------------------------------------------------------------------------
// buildBreadcrumbs (pure function) tests
// ---------------------------------------------------------------------------

describe('buildBreadcrumbs', () => {
  it('returns only the Home crumb for root path', () => {
    const crumbs = buildBreadcrumbs('/');
    expect(crumbs).toHaveLength(1);
    expect(crumbs[0]).toEqual({ id: 'home', label: 'Home', href: '/' });
  });

  it('returns Home + one crumb for a single-segment path', () => {
    const crumbs = buildBreadcrumbs('/dashboard');
    expect(crumbs).toHaveLength(2);
    expect(crumbs[0]).toEqual({ id: 'home', label: 'Home', href: '/' });
    expect(crumbs[1]).toEqual({ id: 'dashboard', label: 'Dashboard', href: '/dashboard' });
  });

  it('builds correct cumulative hrefs for /projects/:id', () => {
    const crumbs = buildBreadcrumbs('/projects/abc123');
    expect(crumbs).toHaveLength(3);
    expect(crumbs[0].href).toBe('/');
    expect(crumbs[1]).toEqual({ id: 'projects', label: 'Projects', href: '/projects' });
    expect(crumbs[2]).toEqual({ id: 'abc123', label: 'abc123', href: '/projects/abc123' });
  });

  it('maps known route segments to human-readable labels', () => {
    const cases: Array<[string, string]> = [
      ['/settings', 'Settings'],
      ['/projects', 'Projects'],
      ['/inbox', 'Inbox'],
      ['/toolboxes', 'Toolboxes'],
      ['/cpd', 'CPD & Learning'],
      ['/finance', 'Finance'],
    ];

    for (const [path, expectedLabel] of cases) {
      const crumbs = buildBreadcrumbs(path);
      const leaf = crumbs[crumbs.length - 1];
      expect(leaf.label, `segment "${path}" should map to "${expectedLabel}"`).toBe(expectedLabel);
    }
  });

  it('title-cases unknown slug segments (hyphens and underscores)', () => {
    const crumbs = buildBreadcrumbs('/my-custom-page');
    expect(crumbs[1].label).toBe('My Custom Page');
  });

  it('returns raw ID value for UUID-like segments', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const crumbs = buildBreadcrumbs(`/projects/${uuid}`);
    expect(crumbs[2].label).toBe(uuid);
  });

  it('ignores trailing slashes (no empty crumbs)', () => {
    const crumbs = buildBreadcrumbs('/projects/');
    expect(crumbs).toHaveLength(2);
    expect(crumbs[1].href).toBe('/projects');
  });

  it('builds deep paths correctly', () => {
    const crumbs = buildBreadcrumbs('/projects/abc123/snags');
    expect(crumbs).toHaveLength(4);
    expect(crumbs[3]).toEqual({ id: 'snags', label: 'Snags', href: '/projects/abc123/snags' });
  });

  it('each crumb id matches the path segment', () => {
    const crumbs = buildBreadcrumbs('/toolboxes/design_compliance');
    expect(crumbs[1].id).toBe('toolboxes');
    expect(crumbs[2].id).toBe('design_compliance');
  });
});

// ---------------------------------------------------------------------------
// useBreadcrumbs (hook) tests
// ---------------------------------------------------------------------------

describe('useBreadcrumbs', () => {
  beforeEach(() => {
    // Reset pathname to root before each test
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns Home crumb for root path on mount', () => {
    const { result } = renderHook(() => useBreadcrumbs());
    expect(result.current[0]).toEqual({ id: 'home', label: 'Home', href: '/' });
  });

  it('returns breadcrumbs derived from window.location.pathname', () => {
    window.history.replaceState({}, '', '/projects');
    const { result } = renderHook(() => useBreadcrumbs());
    expect(result.current).toHaveLength(2);
    expect(result.current[1]).toEqual({ id: 'projects', label: 'Projects', href: '/projects' });
  });

  it('returns overrides array unchanged when provided', () => {
    const overrides: BreadcrumbItem[] = [
      { id: 'home', label: 'Home', href: '/' },
      { id: 'projects', label: 'Projects', href: '/projects' },
      { id: 'villa', label: 'Sea Side Villa', href: '/projects/villa' },
    ];
    const { result } = renderHook(() => useBreadcrumbs(overrides));
    expect(result.current).toStrictEqual(overrides);
  });

  it('falls back to auto-generation when overrides is undefined', () => {
    window.history.replaceState({}, '', '/settings');
    const { result } = renderHook(() => useBreadcrumbs(undefined));
    expect(result.current).toHaveLength(2);
    expect(result.current[1].label).toBe('Settings');
  });

  it('falls back to auto-generation when overrides is an empty array', () => {
    window.history.replaceState({}, '', '/dashboard');
    const { result } = renderHook(() => useBreadcrumbs([]));
    expect(result.current).toHaveLength(2);
    expect(result.current[1].label).toBe('Dashboard');
  });

  it('updates breadcrumbs when pathname changes via popstate', () => {
    window.history.replaceState({}, '', '/dashboard');
    const { result } = renderHook(() => useBreadcrumbs());

    expect(result.current[result.current.length - 1].label).toBe('Dashboard');

    act(() => {
      window.history.replaceState({}, '', '/projects');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(result.current[result.current.length - 1].label).toBe('Projects');
  });

  it('updates breadcrumbs when pathname changes via history.pushState', () => {
    window.history.replaceState({}, '', '/settings');
    const { result } = renderHook(() => useBreadcrumbs());

    expect(result.current[result.current.length - 1].label).toBe('Settings');

    act(() => {
      window.history.pushState({}, '', '/inbox');
    });

    expect(result.current[result.current.length - 1].label).toBe('Inbox');
  });

  it('always includes Home as the first crumb', () => {
    const paths = ['/dashboard', '/projects/abc', '/settings', '/'];
    for (const p of paths) {
      window.history.replaceState({}, '', p);
      const { result, unmount } = renderHook(() => useBreadcrumbs());
      expect(result.current[0]).toEqual({ id: 'home', label: 'Home', href: '/' });
      unmount();
    }
  });

  it('returns BreadcrumbItem objects with id, label, and href fields', () => {
    window.history.replaceState({}, '', '/projects/proj-1');
    const { result } = renderHook(() => useBreadcrumbs());
    for (const crumb of result.current) {
      expect(crumb).toHaveProperty('id');
      expect(crumb).toHaveProperty('label');
      expect(crumb).toHaveProperty('href');
      expect(typeof crumb.id).toBe('string');
      expect(typeof crumb.label).toBe('string');
      expect(typeof crumb.href).toBe('string');
    }
  });
});
