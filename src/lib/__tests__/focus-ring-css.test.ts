/**
 * Task 6.7 — Focus Ring CSS Structure Tests (Node environment)
 *
 * Validates Requirements: 10.3, 10.5, 10.9
 *
 * These tests verify the focus-visible-ring CSS definition, --ring token values,
 * and contrast ratios without requiring a DOM environment.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// ─── Contrast helper ──────────────────────────────────────────────────────────

/** WCAG 2.1 relative luminance for a 6-digit hex colour. */
function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const ch = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** WCAG contrast ratio between two hex colours. */
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ─── CSS source ───────────────────────────────────────────────────────────────

const cssSource = readFileSync(join(process.cwd(), "src", "index.css"), "utf-8");

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("Task 6.7 — Focus Ring CSS & Contrast (Req 10.3, 10.5, 10.9)", () => {

  it("1. .focus-visible-ring utility class is defined in src/index.css (Req 10.3)", () => {
    // The class must exist so components can apply keyboard focus rings.
    expect(cssSource).toContain(".focus-visible-ring");
  });

  it("2. .focus-visible-ring uses focus-visible:outline utilities (Req 10.3)", () => {
    // The class must set an outline only on keyboard focus (:focus-visible),
    // NOT globally suppress outlines.
    expect(cssSource).toMatch(/\.focus-visible-ring\s*\{[^}]*focus-visible:outline/s);
  });

  it("3. Global :focus-visible rule in @layer base covers all interactive elements (Req 10.3)", () => {
    // index.css has a base :where(a, button, input, ...) :focus-visible rule
    // that provides a default ring for all interactive elements.
    expect(cssSource).toContain(":where(a, button, input, textarea, select");
    expect(cssSource).toContain("focus-visible");
  });

  it("4. Dark_Theme --ring resolves to #aeefe3 (mint accent = --landing-accent, Req 10.3, 10.5)", () => {
    // In [data-theme='dark'] / .dark, --ring: #aeefe3 ensures the focus outline
    // uses the mint accent colour.
    expect(cssSource).toContain("--ring: #aeefe3");
  });

  it("5. Dark_Theme --landing-accent is defined as var(--secondary) which resolves to mint (Req 10.5)", () => {
    // --landing-accent: var(--secondary) and --secondary: #aeefe3 — the same mint.
    expect(cssSource).toContain("--landing-accent: var(--secondary)");
    expect(cssSource).toContain("--secondary: #aeefe3");
  });

  it("6. Focus ring contrast Dark_Theme: #aeefe3 on #0d2520 meets WCAG 3:1 for non-text indicators (Req 10.5)", () => {
    // WCAG 1.4.11 Non-text Contrast: focus rings must achieve 3:1 against adjacent colours.
    // Dark_Theme: ring colour = #aeefe3 (mint), background = #0d2520 (dark teal).
    const ratio = contrastRatio("#aeefe3", "#0d2520");
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it("7. Focus ring contrast Dark_Theme: #aeefe3 on #0d2520 exceeds WCAG AAA 7:1 (Req 10.5)", () => {
    // The mint-on-dark-teal combination provides exceptional contrast (~11–13:1),
    // well above AAA. The design doc's '7.2:1' estimate was conservative.
    const ratio = contrastRatio("#aeefe3", "#0d2520");
    expect(ratio).toBeGreaterThanOrEqual(7);
    expect(ratio).toBeLessThan(22); // sanity: white-on-black is 21:1
  });

  it("8. Focus ring contrast Light_Theme: #006b5c on #f5faf7 meets WCAG 3:1 minimum (Req 10.5)", () => {
    // Light_Theme: --ring: #006b5c (dark teal) on --landing-bg: #f5faf7.
    const ratio = contrastRatio("#006b5c", "#f5faf7");
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it("9. src/index.css has no bare 'outline: none' that would globally suppress focus rings (Req 10.9)", () => {
    // Component-level focus:outline-none is acceptable ONLY when paired with
    // focus-visible-ring providing an equivalent visible indicator.
    // A global outline: none in index.css would violate Req 10.9 for all elements.
    expect(cssSource).not.toContain("outline: none");
  });

  it("10. GlassDrawer: focus:outline-none is on the dialog root (tabIndex=-1, programmatic target — acceptable, Req 10.9)", () => {
    // GlassDrawer panel has tabIndex={-1}: not reachable via Tab key.
    // Suppressing outline on tabIndex=-1 elements is acceptable per WCAG 2.4.7/2.4.11
    // because those elements cannot be keyboard-navigated to by the user.
    const drawerSource = readFileSync(
      join(process.cwd(), "src", "components", "ui", "GlassDrawer.tsx"),
      "utf-8"
    );
    // Panel is programmatic-only focus target
    expect(drawerSource).toContain("tabIndex={-1}");
    // The outline suppression is present
    expect(drawerSource).toContain("focus:outline-none");
    // The FOCUSABLE_SELECTOR ensures child interactive elements remain reachable
    expect(drawerSource).toContain("FOCUSABLE_SELECTOR");
  });

  it("11. ArchitectDashboard tabpanel (tabIndex=0): focus:outline-none replaced with focus-visible-ring (Req 10.9)", () => {
    // A role='tabpanel' with tabIndex={0} IS reachable via keyboard Tab.
    // Previously had className='focus:outline-none' which suppressed focus rings
    // via the :focus pseudo-class (broader than :focus-visible), creating an
    // accessibility gap. Fixed by replacing with focus-visible-ring.
    const dashSource = readFileSync(
      join(process.cwd(), "src", "components", "ArchitectDashboard.tsx"),
      "utf-8"
    );
    expect(dashSource).toContain('role="tabpanel"');
    expect(dashSource).toContain("tabIndex={0}");
    // The bare className="focus:outline-none" must be gone
    expect(dashSource).not.toContain('className="focus:outline-none"');
    // focus-visible-ring must now be present on the tabpanel
    expect(dashSource).toContain("focus-visible-ring");
  });
});
