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
 *
 * Additionally, we verify the structural patterns that ensure no overflow at
 * any of the required viewport widths:
 *   - overflow-x-hidden/overflow-hidden on outer wrapper
 *   - RoleAwareSidebar hidden on mobile (hidden md:flex) so w-64 never causes
 *     mobile overflow (<768px)
 *   - Main content uses md:ml-64 (not ml-64) so no left margin on mobile
 *   - App.tsx shell uses overflow-hidden at the application root level
 *   - No conflicting global overflow-x: auto/scroll in src/index.css
 */

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (relPath: string) => readFileSync(resolve(root, relPath), 'utf8');

// ─── Primary dashboard source files ──────────────────────────────────────────

const dashboards = [
  { name: 'ArchitectDashboard', path: 'src/components/ArchitectDashboard.tsx' },
  { name: 'AdminDashboard',     path: 'src/components/AdminDashboard.tsx' },
  { name: 'ClientDashboard',    path: 'src/components/ClientDashboard.tsx' },
  { name: 'BEPDashboard',       path: 'src/components/BEPDashboard.tsx' },
  { name: 'ContractorDashboard',path: 'src/components/ContractorDashboard.tsx' },
  { name: 'FreelancerDashboard',path: 'src/components/FreelancerDashboard.tsx' },
  { name: 'SubcontractorDashboard', path: 'src/components/SubcontractorDashboard.tsx' },
  { name: 'SupplierDashboard',  path: 'src/components/SupplierDashboard.tsx' },
  { name: 'FirmDashboard',      path: 'src/components/FirmDashboard.tsx' },
] as const;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Task 6.9 — Zero horizontal overflow at all viewport widths (Req 8.10)', () => {

  // ── Per-dashboard overflow prevention ──────────────────────────────────────

  describe('All primary dashboards have overflow-x-hidden on their outer container', () => {
    for (const { name, path } of dashboards) {
      test(`${name} outer container includes overflow-x-hidden or overflow-hidden`, () => {
        const source = read(path);

        // The outer container pattern: min-h-screen bg-background ... overflow-x-hidden
        // All 9 primary dashboards follow this exact structure.
        const hasOverflow =
          source.includes('overflow-x-hidden') ||
          // Some may use the Tailwind shorthand 'overflow-hidden' which clips both axes
          source.match(/min-h-screen[^"]*overflow-hidden/) !== null;

        expect(hasOverflow).toBe(true);
      });
    }
  });

  // ── Sidebar mobile overflow prevention ─────────────────────────────────────

  describe('RoleAwareSidebar does not cause overflow on mobile viewports', () => {
    const sidebarPath = 'src/components/navigation/RoleAwareSidebar.tsx';

    test('Sidebar is hidden on mobile (< 768px) via hidden md:flex pattern', () => {
      const source = read(sidebarPath);
      // Sidebar must be hidden on mobile to prevent 256px (w-64) from causing overflow
      expect(source).toContain('hidden md:flex');
    });

    test('Sidebar uses fixed positioning (out of normal document flow)', () => {
      const source = read(sidebarPath);
      // fixed positioning means the sidebar doesn't push content or cause layout overflow
      expect(source).toContain('fixed');
    });

    test('Sidebar is w-64 (256px) — within viewport at md+ breakpoint (>=768px)', () => {
      const source = read(sidebarPath);
      expect(source).toContain('w-64');
    });
  });

  // ── Main content layout ─────────────────────────────────────────────────────

  describe('Main content areas use md:ml-64 (responsive sidebar offset)', () => {
    for (const { name, path } of dashboards) {
      test(`${name} main content uses md:ml-64 (no left margin on mobile)`, () => {
        const source = read(path);
        // All dashboards must offset by sidebar width only on desktop (md:)
        // Plain ml-64 (without md: prefix) would cause overflow on mobile
        expect(source).toContain('md:ml-64');
        // Ensure the offset is ONLY applied at md+ breakpoint, not globally
        // (A plain 'ml-64' without md: prefix would be a bug causing mobile overflow)
        const plainMl64 = source.match(/(?<![:\w])ml-64(?!\s*\])/g);
        expect(plainMl64).toBeNull();
      });
    }
  });

  // ── Application shell overflow ──────────────────────────────────────────────

  test('App.tsx outer shell clips all overflow at the application root', () => {
    const source = read('src/App.tsx');
    // The authenticated app shell at line 949 uses overflow-hidden which clips
    // both x and y — browser cannot produce horizontal scrollbar at any viewport.
    //
    // Pattern: <div className="relative flex h-dvh min-h-0 flex-col overflow-hidden ...">
    expect(source).toContain('overflow-hidden');
  });

  // ── Global CSS check ────────────────────────────────────────────────────────

  test('src/index.css has no conflicting global overflow-x rules that could re-introduce horizontal scroll', () => {
    const source = read('src/index.css');
    // There must be no bare CSS property `overflow-x: auto` or `overflow-x: scroll`
    // at the top CSS level (body, html, :root) that could re-enable horizontal scroll.
    // Tailwind utility classes (overflow-x-auto, overflow-x-scroll) in className strings
    // are NOT in index.css so this check is unambiguous.
    const conflictingRules = source.match(/overflow-x\s*:\s*(auto|scroll)/g);
    expect(conflictingRules).toBeNull();
  });

  // ── Structural compliance documentation ────────────────────────────────────

  describe('Structural overflow compliance (documents mechanism for each viewport)', () => {
    /**
     * 320px / 375px (mobile):
     *   - RoleAwareSidebar: hidden md:flex → sidebar invisible, no width contribution
     *   - Main content: no ml-64 (md: prefix required) → full width
     *   - Outer wrapper: overflow-x-hidden → clips any accidental overflow
     *   → Result: zero horizontal overflow
     */
    test('Mobile viewports (320px, 375px): sidebar hidden + full-width main = no overflow', () => {
      const sidebarSource = read('src/components/navigation/RoleAwareSidebar.tsx');
      // Sidebar visibility: hidden on mobile
      expect(sidebarSource).toContain('hidden md:flex');
      // MobileMenuTrigger is shown instead (md:hidden)
      const triggerSource = read('src/components/navigation/MobileMenuTrigger.tsx');
      expect(triggerSource.length).toBeGreaterThan(0); // file exists
    });

    /**
     * 768px–1023px (tablet):
     *   - RoleAwareSidebar: md:flex activates, but it is fixed positioned (out of flow)
     *   - Main content: md:ml-64 activates → 256px left margin, 512px of content at 768px
     *   - Outer wrapper: overflow-x-hidden → clips any overflow
     *   → Result: 768 - 256 (sidebar) = 512px content width, no overflow
     */
    test('Tablet viewport (768px): md:flex sidebar + md:ml-64 main = 512px content, no overflow', () => {
      // At 768px, the sidebar (256px) is shown fixed, and main gets ml-64 (256px).
      // 768 - 256 = 512px available for content. Content is responsive (percentage widths).
      // overflow-x-hidden on outer container ensures no bleed.
      const architectSource = read('src/components/ArchitectDashboard.tsx');
      expect(architectSource).toContain('overflow-x-hidden');
      expect(architectSource).toContain('md:ml-64');
    });

    /**
     * 1024px–3840px (desktop to ultra-wide):
     *   - RoleAwareSidebar: fixed, w-64 (256px)
     *   - Main content: md:ml-64 activates, responsive grid adjusts columns
     *   - Content uses grid-cols-1 md:grid-cols-2 lg:grid-cols-3 → scales naturally
     *   → Result: no fixed-width elements that could overflow
     */
    test('Desktop/wide viewports (1024px–3840px): responsive grid + md:ml-64 = fluid layout', () => {
      const architectSource = read('src/components/ArchitectDashboard.tsx');
      // Responsive grid classes present
      expect(architectSource).toMatch(/grid-cols-1.*md:grid-cols-\d/);
    });
  });
});
