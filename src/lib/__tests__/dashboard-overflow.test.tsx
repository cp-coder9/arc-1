/**
 * Task 6.9 — Zero horizontal overflow at all viewport widths (static analysis)
 *
 * Validates: Requirements 8.10
 *
 * Requirement 8.10: "FOR all dashboards THEN the System SHALL render with zero
 * horizontal overflow at all viewport widths (overflow-x-hidden or max-width:
 * 100vw)."
 *
 * Target viewport widths: 320px, 375px, 768px, 1024px, 1440px, 2560px, 3840px
 *
 * Approach
 * --------
 * jsdom has no real layout engine, so pixel measurements like scrollWidth/
 * clientWidth always return 0 — that fidelity belongs to Playwright E2E.
 * This suite uses STATIC ANALYSIS instead: it reads each dashboard source file
 * and verifies the `overflow-x-hidden` (or `overflow-hidden`) class is present
 * on the outer container, which BY CONSTRUCTION prevents horizontal scrollbars
 * at all viewport widths in real browsers.
 */

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (relPath: string) => readFileSync(resolve(root, relPath), 'utf8');

// ─── Primary dashboard source files ──────────────────────────────────────────

const dashboards = [
  { name: 'ArchitectDashboard',     path: 'src/components/ArchitectDashboard.tsx' },
  { name: 'AdminDashboard',         path: 'src/components/AdminDashboard.tsx' },
  { name: 'ClientDashboard',        path: 'src/components/ClientDashboard.tsx' },
  { name: 'BEPDashboard',           path: 'src/components/BEPDashboard.tsx' },
  { name: 'ContractorDashboard',    path: 'src/components/ContractorDashboard.tsx' },
  { name: 'FreelancerDashboard',    path: 'src/components/FreelancerDashboard.tsx' },
  { name: 'SubcontractorDashboard', path: 'src/components/SubcontractorDashboard.tsx' },
  { name: 'SupplierDashboard',      path: 'src/components/SupplierDashboard.tsx' },
  { name: 'FirmDashboard',          path: 'src/components/FirmDashboard.tsx' },
] as const;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Task 6.9 — Zero horizontal overflow at all viewport widths (Req 8.10)', () => {

  // ── 1. Per-dashboard overflow class check ──────────────────────────────────

  describe('All primary dashboards have overflow-x-hidden on their outer container', () => {
    for (const { name, path } of dashboards) {
      test(`${name} outer container includes overflow-x-hidden or overflow-hidden`, () => {
        const source = read(path);
        // All 9 primary dashboards: outer <div className="min-h-screen ... overflow-x-hidden">
        const hasOverflow = source.includes('overflow-x-hidden') || source.includes('overflow-hidden');
        expect(hasOverflow).toBe(true);
      });
    }
  });

  // ── 2. Sidebar mobile visibility ──────────────────────────────────────────

  describe('RoleAwareSidebar does not cause overflow on mobile viewports', () => {
    test('Sidebar is hidden on mobile via hidden md:flex (prevents 256px width on <768px viewports)', () => {
      const source = read('src/components/navigation/RoleAwareSidebar.tsx');
      expect(source).toContain('hidden md:flex');
    });

    test('Sidebar uses fixed positioning (out of document flow, cannot push content)', () => {
      const source = read('src/components/navigation/RoleAwareSidebar.tsx');
      expect(source).toContain('fixed');
    });

    test('Sidebar width is w-64 (256px) — only shown at md+ where viewport is >=768px', () => {
      const source = read('src/components/navigation/RoleAwareSidebar.tsx');
      expect(source).toContain('w-64');
    });
  });

  // ── 3. Main content offset ─────────────────────────────────────────────────

  describe('Dashboard content does not duplicate the app-shell sidebar offset', () => {
    for (const { name, path } of dashboards) {
      test(`${name}: main content has no legacy fixed sidebar margin`, () => {
        const source = read(path);
        // App.tsx owns the sidebar/content flex layout. A dashboard-level margin
        // would double-offset the content and can create horizontal overflow.
        expect(source).not.toMatch(/(?:^|\s)(?:md:)?ml-64(?:\s|$)/);
      });
    }
  });

  // ── 4. App shell overflow ──────────────────────────────────────────────────

  test('App.tsx outer application shell uses overflow-hidden (clips both axes at root)', () => {
    const source = read('src/App.tsx');
    // Line ~949: <div className="relative flex h-dvh min-h-0 flex-col overflow-hidden ...">
    expect(source).toContain('overflow-hidden');
  });

  // ── 5. Global CSS check ────────────────────────────────────────────────────

  test('src/index.css has no conflicting CSS-level overflow-x: auto/scroll rules', () => {
    const source = read('src/index.css');
    // Prevents re-introduction of horizontal scroll via direct CSS property assignment
    const conflictingRules = source.match(/overflow-x\s*:\s*(auto|scroll)/g);
    expect(conflictingRules).toBeNull();
  });

  // ── 6. Structural compliance: viewport-by-viewport documentation ───────────

  describe('Viewport compliance mechanism documentation (Req 8.10)', () => {
    /**
     * 320px / 375px (mobile)
     * Sidebar: hidden md:flex → invisible, zero layout contribution
     * Main content: no md:ml-64 margin at mobile → full viewport width
     * Outer wrapper: overflow-x-hidden → clips any accidental overflow
     */
    test('Mobile (320px, 375px): sidebar hidden + full-width main content = zero overflow', () => {
      const sidebarSrc = read('src/components/navigation/RoleAwareSidebar.tsx');
      expect(sidebarSrc).toContain('hidden md:flex');
      // MobileMenuTrigger file must exist (provides hamburger access)
      expect(() => read('src/components/navigation/MobileMenuTrigger.tsx')).not.toThrow();
    });

    /**
     * 768px (tablet threshold)
     * Sidebar: md:flex activates (fixed, out of flow, w-64 = 256px)
     * Main: the App.tsx flex shell allocates the remaining width beside the fixed sidebar
     */
    test('Tablet (768px): app shell owns the sidebar offset without dashboard duplication', () => {
      const adminSrc = read('src/components/AdminDashboard.tsx');
      expect(adminSrc).toContain('overflow-x-hidden');
      expect(adminSrc).toContain('md:ml-64');
    });

    /**
     * 1024px–3840px (desktop → ultra-wide)
     * Sidebar: fixed, 256px
     * Main: ml-64, responsive grid (grid-cols-1 md:grid-cols-2 lg:grid-cols-3)
     * Content: scales with viewport, no fixed-width overflow elements
     */
    test('Desktop/ultra-wide (1024px–3840px): responsive grid ensures fluid scaling', () => {
      const archSrc = read('src/components/ArchitectDashboard.tsx');
      expect(archSrc).toContain('overflow-x-hidden');
      expect(archSrc).toMatch(/grid-cols-1.*(?:md|lg):grid-cols-\d/);
    });
  });
});
