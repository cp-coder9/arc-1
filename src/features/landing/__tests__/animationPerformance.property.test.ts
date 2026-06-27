// Feature: ui-ux-overhaul-landing-aesthetic, Property 5
//
// **Property 5: All animations render at 60fps minimum**
// **Validates: Requirements 12.1, 12.2**
//
// This property-based test verifies the structural invariants that guarantee
// 60fps performance for all animation presets and animated wrappers:
//
//   1. Every animation exclusively targets GPU-accelerated CSS compositor
//      properties (opacity, transform via x/y/scale). It NEVER targets
//      layout-triggering properties (width, height, top, left, margin,
//      padding, font-size, etc.).
//
//   2. When a duration is present it is short enough (≤ 2 s) to complete
//      before any realistic device would drop frames during a compositor
//      animation.
//
//   3. The `pulse` (loading skeleton) animation uses a long looping duration
//      but still exclusively uses opacity, keeping it on the compositor thread.
//
// Browser-level frame measurement (Chrome DevTools Performance → Frames)
// cannot run in a headless test environment. The structural guarantees below
// are the testable proxy: if only compositor properties are animated, the
// browser compositor can handle the animation without involving the main
// thread, which is the necessary condition for 60fps.
//
// DevTools manual verification procedure is documented in:
//   docs/ANIMATION_PERFORMANCE_AUDIT.md — Section 6

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  fadeInUp,
  fadeIn,
  slideInLeft,
  fadeOutDown,
  hoverScale,
  pulse,
} from '@/features/landing/animations';
import type { Variants } from 'framer-motion';

// ── Constants ────────────────────────────────────────────────────────────────

const RUNS = { numRuns: 200 } as const;

/**
 * CSS properties whose mutation triggers a layout reflow (main-thread work).
 * Animating ANY of these prevents 60fps compositor-thread animations.
 */
const LAYOUT_TRIGGERING_PROPERTIES = new Set([
  'width',
  'height',
  'top',
  'left',
  'right',
  'bottom',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontSize',
  'lineHeight',
  'borderWidth',
  'outlineWidth',
  'maxWidth',
  'minWidth',
  'maxHeight',
  'minHeight',
  'flexBasis',
  'gridTemplateColumns',
  'gridTemplateRows',
]);

/**
 * Extract all key names from a Framer Motion state object (initial / animate /
 * exit / whileHover) so we can assert they are exclusively compositor properties.
 */
function collectAnimatedKeys(obj: unknown): string[] {
  if (obj === null || typeof obj !== 'object') return [];
  return Object.keys(obj as Record<string, unknown>);
}

/**
 * Flatten all animated property keys found in a Variants object across
 * initial, animate, exit, whileHover, and transition fields.
 */
function allAnimatedProperties(variant: Variants): string[] {
  const keys: string[] = [];

  // Framer Motion Variants — each key may hold a TargetAndTransition
  for (const [stageName, stageValue] of Object.entries(variant)) {
    if (stageName === 'transition') continue; // timing config, not a property
    keys.push(...collectAnimatedKeys(stageValue));
  }

  return keys;
}

/**
 * GPU-accelerated "compositor" properties.
 * These are the ONLY ones that may appear in our animation targets.
 */
const GPU_ACCELERATED_PROPERTIES = new Set([
  'opacity',
  'x',         // Framer Motion shorthand → translateX
  'y',         // Framer Motion shorthand → translateY
  'z',         // Framer Motion shorthand → translateZ
  'scale',     // Framer Motion shorthand → scale()
  'scaleX',
  'scaleY',
  'rotate',    // transform: rotate — compositor
  'rotateX',
  'rotateY',
  'rotateZ',
  'skewX',
  'skewY',
  'originX',
  'originY',
  'filter',    // compositor in modern browsers
]);

// ── Test Fixtures ─────────────────────────────────────────────────────────────

const ALL_PRESETS: ReadonlyArray<{
  name: string;
  makeVariant: (prefersReducedMotion: boolean) => Variants;
}> = [
  { name: 'fadeInUp',     makeVariant: (p) => fadeInUp(p) },
  { name: 'fadeIn',       makeVariant: (p) => fadeIn(p) },
  { name: 'slideInLeft',  makeVariant: (p) => slideInLeft(p) },
  { name: 'fadeOutDown',  makeVariant: (p) => fadeOutDown(p) },
];

const PARAMETERLESS_PRESETS: ReadonlyArray<{
  name: string;
  variant: Variants;
}> = [
  { name: 'hoverScale', variant: hoverScale() },
  { name: 'pulse',      variant: pulse() },
];

// ── Property 5 Tests ──────────────────────────────────────────────────────────

describe(
  'Property 5: All animations render at 60fps minimum (GPU-accelerated properties only)',
  () => {
    // ── 5.1: No layout-triggering properties in any preset ────────────────────

    it(
      'no animation targets layout-triggering CSS properties (Req 12.2)',
      () => {
        fc.assert(
          fc.property(
            fc.constantFrom(...ALL_PRESETS),
            fc.boolean(),
            ({ name, makeVariant }, prefersReducedMotion) => {
              const variant = makeVariant(prefersReducedMotion);
              const animatedKeys = allAnimatedProperties(variant);

              const violations = animatedKeys.filter((k) =>
                LAYOUT_TRIGGERING_PROPERTIES.has(k),
              );

              expect(violations, `${name} animates layout property: ${violations}`).toHaveLength(0);
            },
          ),
          RUNS,
        );
      },
    );

    it(
      'parameterless presets (hoverScale, pulse) use only GPU properties (Req 12.2)',
      () => {
        for (const { name, variant } of PARAMETERLESS_PRESETS) {
          const animatedKeys = allAnimatedProperties(variant);
          const violations = animatedKeys.filter((k) =>
            LAYOUT_TRIGGERING_PROPERTIES.has(k),
          );
          expect(violations, `${name} animates layout property: ${violations}`).toHaveLength(0);
        }
      },
    );

    // ── 5.2: All animated properties are in the GPU allow-list ───────────────

    it(
      'every animated key is a known GPU-accelerated compositor property (Req 12.2)',
      () => {
        fc.assert(
          fc.property(
            fc.constantFrom(...ALL_PRESETS),
            fc.boolean(),
            ({ name, makeVariant }, prefersReducedMotion) => {
              const variant = makeVariant(prefersReducedMotion);
              const animatedKeys = allAnimatedProperties(variant);

              const unknownKeys = animatedKeys.filter(
                (k) => !GPU_ACCELERATED_PROPERTIES.has(k),
              );

              expect(
                unknownKeys,
                `${name} animates unknown/non-GPU property: ${unknownKeys}`,
              ).toHaveLength(0);
            },
          ),
          RUNS,
        );
      },
    );

    // ── 5.3: Duration is within frame-rate-safe range ─────────────────────────

    it(
      'when motion is enabled, duration is positive and ≤ 2s so animations complete within frame budget (Req 12.1)',
      () => {
        fc.assert(
          fc.property(
            fc.constantFrom(...ALL_PRESETS),
            ({ name, makeVariant }) => {
              const variant = makeVariant(false); // motion enabled
              const transition = (variant as { transition?: { duration?: number } })
                .transition;

              if (transition?.duration !== undefined) {
                expect(
                  transition.duration,
                  `${name} duration should be > 0`,
                ).toBeGreaterThan(0);

                expect(
                  transition.duration,
                  `${name} duration should be ≤ 2s (compositor-only animations complete within 120 frames)`,
                ).toBeLessThanOrEqual(2);
              }
            },
          ),
          RUNS,
        );
      },
    );

    // ── 5.4: Reduced motion collapses all timing to zero ─────────────────────

    it(
      'when reduced motion is enabled, duration collapses to 0 for all presets (Req 12.4)',
      () => {
        fc.assert(
          fc.property(
            fc.constantFrom(...ALL_PRESETS),
            ({ name, makeVariant }) => {
              const variant = makeVariant(true);
              const transition = (variant as { transition?: { duration?: number } })
                .transition;

              expect(
                transition?.duration,
                `${name} should have duration 0 under reduced motion`,
              ).toBe(0);
            },
          ),
          RUNS,
        );
      },
    );

    // ── 5.5: Pulse (LoadingSkeleton) uses only opacity ────────────────────────

    it(
      'pulse animation (LoadingSkeleton) targets only opacity — confirming CLS-safe loading states (Req 12.1, 12.3)',
      () => {
        const variant = pulse();
        const animatedKeys = allAnimatedProperties(variant);

        // Pulse must ONLY use opacity
        expect(animatedKeys).toEqual(
          expect.arrayContaining(['opacity']),
        );
        const nonOpacity = animatedKeys.filter((k) => k !== 'opacity');
        expect(
          nonOpacity,
          `pulse animates non-opacity properties: ${nonOpacity}`,
        ).toHaveLength(0);
      },
    );

    // ── 5.6: No layout shift invariant — transforms do not affect document flow

    it(
      'animated y/x offsets use transform space not document flow — no layout shift (Req 12.3)',
      () => {
        fc.assert(
          fc.property(
            fc.constantFrom(...ALL_PRESETS),
            fc.boolean(),
            ({ makeVariant }, prefersReducedMotion) => {
              const variant = makeVariant(prefersReducedMotion);

              // Collect all animated keys from the variant
              const allKeys = allAnimatedProperties(variant);

              // Positional movement should use x/y (Framer Motion transform shortcuts),
              // never top/left/bottom/right (document-flow properties)
              const badPositionalKeys = allKeys.filter((k) =>
                ['top', 'left', 'bottom', 'right'].includes(k),
              );

              expect(
                badPositionalKeys,
                'animations must not use top/left/bottom/right — use x/y for CLS-safe motion',
              ).toHaveLength(0);
            },
          ),
          RUNS,
        );
      },
    );
  },
);
