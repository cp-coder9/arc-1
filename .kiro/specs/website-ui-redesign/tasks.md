# Implementation Plan: Website UI Redesign (Liquid Glass)

## Overview

This plan delivers the Architex "liquid glass" redesign as a **strictly additive, isolated** layer over the existing React 19 + TypeScript + Vite 6 app, so it can land alongside concurrent functional work without merge conflicts:

- **New code only** under `src/design-system/` and `src/features/landing/`. No existing component, service, or route file is rewritten.
- **`src/index.css` edits are additive** — new Theme_Tokens, theme scopes, and the `.glass` utility are appended; no existing token name is renamed or removed (Req 10.4).
- **`App.tsx` touch points are minimal** — a single landing mount + wrapping the tree in `ThemeProvider`.
- **`public/logo.png` is used directly** as the Bird_Mark and Agent_Shard source (no SVG conversion).

The build order is bottom-up and test-driven: the Design System layer (tokens, glass, bird, theme) first, then pure logic (copy clamp, flock geometry), then background and animation, then landing composition, then App integration, then the cross-cutting accessibility/behavior tests. Property-based tests use **fast-check + Vitest** (≥100 iterations, tagged `// Feature: website-ui-redesign, Property N`).

Stack constraints: Tailwind v4 CSS-only (`@theme inline` / `:root` in `src/index.css`, no `tailwind.config`), shadcn/ui + Radix, framer-motion, lucide-react, path alias `@/`. Verify every change with `npm run lint` and `npm test`.

## Tasks

- [ ] 1. Design System foundation — Theme_Tokens, CSS, and token guard
  - [ ] 1.1 Add fast-check dependency and additive Theme_Tokens + `.glass` utility to `src/index.css`
    - Add `fast-check` to `devDependencies` in `package.json` (the only tooling gap; Vitest + testing-library already present).
    - In `src/index.css`, **append only** (no renames/removals of existing tokens): the `:root` block becomes the Light_Theme set (keep existing names, tune values for contrast), and add a default-applied `[data-theme="dark"], .dark` Dark_Theme scope overriding the same semantic token NAMES with dark teal values.
    - Define landing/glass semantic tokens in both scopes: `--landing-bg` (`#0d2520` dark), `--landing-bg-deep`, `--landing-text` (`#ffffff` dark), `--landing-text-muted`, `--landing-accent` (`#aeefe3`, canonical mint == `--secondary`), `--glass-bg`, `--glass-border`, `--glass-glow`, `--glass-blur`, and `--grid-step` (declared once, theme-invariant).
    - Reuse `--primary`/`--primary-light`/`--primary-dark`/`--secondary` as-is (Req 1.2). Add `@theme inline` `--color-landing-*` mappings so utilities resolve from tokens.
    - Define the `.glass` utility with exactly four named layers (backdrop blur, layered translucency, light border, outer glow) plus a `@supports not (backdrop-filter ...)` opaque deep-teal fallback that preserves ≥4.5:1 text contrast.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 2.1, 2.5, 10.1, 10.4, 14.1, 14.6, 14.8_

  - [ ] 1.2 Create token name constants + runtime resolve guard (`src/design-system/tokens.ts`)
    - Centralize every Theme_Token name as exported string constants so markup references are typo-safe and undefined tokens surface at compile time (Req 1.7).
    - Add a `resolveToken(name)` guard that returns a documented fallback style and emits a development-time `console.warn` naming any unresolved token (Req 10.5).
    - _Requirements: 1.5, 1.7, 10.1, 10.5_

  - [ ]* 1.3 Write unit tests for the token resolve guard
    - Assert the guard warns (dev) and returns the documented fallback for an undefined token, and resolves cleanly for a defined token.
    - _Requirements: 10.5_

- [ ] 2. Glass and Bird_Mark primitives
  - [ ] 2.1 Implement `GlassSurface` primitive (`src/design-system/GlassSurface.tsx`)
    - Polymorphic `as` element with `variant: 'card' | 'pill'`; applies the `.glass` class + variant radius. Styling derives entirely from `--glass-*` tokens (no literal colors) so it re-skins on theme flip and is reusable by app screens.
    - Ensure content behind glass is blurred-not-occluded (obscured glazing) for the Agent_Field-behind-glass behavior.
    - _Requirements: 2.2, 2.3, 2.6, 2.7, 10.2, 10.3_

  - [ ]* 2.2 Write unit tests for GlassSurface layers and fallback
    - Assert all four named glass layers are present (Req 2.1) and the `@supports` opaque fallback path is applied/legible when `backdrop-filter` is unsupported (Req 2.5).
    - _Requirements: 2.1, 2.5_

  - [ ] 2.3 Implement `BirdMark` primitive (`src/design-system/BirdMark.tsx`)
    - Source `public/logo.png` directly (no SVG); `size: 'topbar' | 'hero' | 'shard' | number`; high-DPI `srcset` for crispness from topbar to hero size.
    - `alt="Architex"` on meaningful instances; `decorative` shards are `aria-hidden`.
    - On load error or >3s timeout, swap to Wordmark "ARCHITEX" in the same placement, retaining the "Architex" accessible name (3s timer races `onLoad`).
    - `interactive` instances render as a focusable `role="button"` activator (`tabIndex=0`, pointer cursor) with an accessible name indicating it enters the Architex OS, Enter/Space handling, and a subtle hover scale.
    - _Requirements: 4.8, 4.9, 6.1, 6.2, 6.3, 6.4, 6.5, 8.6, 9.9, 10.2_

  - [ ]* 2.4 Write unit tests for BirdMark fallback, alt text, and interactivity
    - Cover the wordmark fallback branch (load error + timeout), the "Architex" accessible name in both states, decorative `aria-hidden` shards, and interactive role/keyboard wiring.
    - _Requirements: 6.3, 6.4, 6.5, 4.8, 9.9_

- [ ] 3. Theme system (Dark default + Light option)
  - [ ] 3.1 Implement `ThemeProvider` + `useTheme` + pre-paint bootstrap
    - `src/design-system/theme/ThemeProvider.tsx` + `useTheme.ts`: context owns the active `ThemeMode`, applies it to `document.documentElement` as both `data-theme` and the `.dark` class (so the existing `@custom-variant dark` keeps working).
    - `resolveInitialTheme()` order: stored `localStorage['architex-theme']` → `prefers-color-scheme: light` (only when no stored value) → Dark_Theme default. Wrap storage reads/writes in try/catch; corrupt/missing/unavailable storage falls back to Dark_Theme without crashing.
    - `setTheme`/`toggleTheme` re-apply on the root within 200 ms and persist the choice.
    - Add an inline pre-paint bootstrap script to `index.html` that sets the attribute/class before hydration to prevent a theme flash.
    - _Requirements: 14.2, 14.4, 14.5_

  - [ ] 3.2 Implement `ThemeToggle` (`src/design-system/theme/ThemeToggle.tsx`)
    - Keyboard-focusable button operable via Enter/Space; non-empty accessible name indicating it switches the color theme; `aria-pressed`/state reflects the active mode; sun/moon lucide-react icon; colors from tokens only.
    - _Requirements: 14.3, 14.9_

  - [ ]* 3.3 Write property test for theme persistence round-trip
    - **Property 16: Theme persistence round-trip and complete token resolution**
    - **Validates: Requirements 14.2, 14.4, 14.5**
    - Under jsdom with mocked `localStorage` + `matchMedia`; generate mode selections and stored/system-preference states; assert apply→persist→fresh-init restores the same mode, no preference yields Dark_Theme, and the active mode's full semantic token set resolves. `{ numRuns: 100 }`.
    - File: `src/design-system/__tests__/theme.property.test.ts`

  - [ ]* 3.4 Write example tests for ThemeToggle and theme application
    - Toggle flips the active mode and applies within 200 ms (Req 14.3, 14.4); both scopes resolve the full semantic token set (Req 14.1); a single shared component renders under both modes via the same code path so only token-derived styles differ (Req 14.7); light-mode `.glass` tokens resolve to light values while `backdrop-filter` is still present (Req 14.8).
    - File: `src/design-system/__tests__/theme.test.tsx`
    - _Requirements: 14.1, 14.3, 14.4, 14.7, 14.8_

- [ ] 4. Design System invariant property tests
  - [ ]* 4.1 Write property test for token integrity
    - **Property 1: Token integrity**
    - **Validates: Requirements 1.5, 10.1, 10.4**
    - For all Theme_Tokens referenced by Landing_Page markup, each resolves to exactly one canonical `src/index.css` definition, every pre-existing token name still resolves, and no inline hex literal appears in Landing markup. `{ numRuns: 100 }`.
    - File: `src/design-system/__tests__/tokens.property.test.ts`

  - [ ]* 4.2 Write property test for text contrast in every Theme_Mode
    - **Property 2: Text contrast on every background, in every Theme_Mode**
    - **Validates: Requirements 1.3, 2.4, 9.5, 14.6, 14.8**
    - For both modes and all Landing text (including over Glass_Surface), foreground/effective-background contrast ≥4.5:1 body / ≥3:1 large text and focus indicators, resolved under the active mode. `{ numRuns: 100 }`.
    - File: `src/design-system/__tests__/contrast.property.test.ts`

- [ ] 5. Checkpoint — Design System layer
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Landing copy module
  - [ ] 6.1 Implement `copy.ts` with `HERO_COPY` and `clampCopy` (`src/features/landing/copy.ts`)
    - `HERO_COPY` headline "The Operating System for the Built Environment" (≤60) and subline "Simplify complexity. Deliver with confidence." (≤160); `clampCopy(str, limit)` truncates over-limit copy and returns within-limit input unchanged.
    - _Requirements: 11.1, 11.4_

  - [ ]* 6.2 Write property test for copy clamp
    - **Property 12: Copy clamp**
    - **Validates: Requirements 11.1, 11.4**
    - For any string + limit, output length ≤ limit and unchanged when already within limit. `{ numRuns: 100 }`.
    - File: `src/features/landing/__tests__/copy.property.test.ts`

- [ ] 7. Flock geometry (pure functions)
  - [ ] 7.1 Implement `geometry.ts` (`src/features/landing/flock/geometry.ts`)
    - Pure, DOM-free `buildNodeLattice(grid)` (junctions every 2 grid steps), `planFlock(grid, count, seed)` (30–60 Agent_Shards, sizes within bounds, divergent burst targets, closed rectangular node loops, mixed clockwise/counter-clockwise, uniform speed), and `pointOnLoop(loop, t)` (point traveling node-to-node along grid lines with direction).
    - _Requirements: 12.2, 12.4, 12.5, 13.2, 13.5_

  - [ ]* 7.2 Write property test for flock plan bounds and settle opacity
    - **Property 13: Flock plan bounds and settle opacity**
    - **Validates: Requirements 12.2, 12.4**
    - For any grid + seed, 30–60 shards, each size within bounds with a divergent target; after settling every opacity ≤0.25 and stacking order below the OS_Reveal card. `{ numRuns: 100 }`.
    - File: `src/features/landing/__tests__/flockPlan.property.test.ts`

  - [ ]* 7.3 Write property test for agent paths staying on the grid
    - **Property 14: Agent paths stay on the grid**
    - **Validates: Requirements 12.5, 13.2, 13.5**
    - For any loop + t in [0,1], `pointOnLoop` lies on a grid line between two nodes; nodes sit at junctions; direction changes only at nodes; uniform speed; at any instant both vertical and horizontal travel are present across agents. `{ numRuns: 100 }`.
    - File: `src/features/landing/__tests__/agentPath.property.test.ts`

- [ ] 8. Background layers
  - [ ] 8.1 Implement `GridBackground` + `NetworkNodes`
    - `src/features/landing/background/GridBackground.tsx`: checkered grid via layered gradients at `--grid-step`; dims after activation.
    - `src/features/landing/background/NetworkNodes.tsx`: twinkling dots at grid junctions across the viewport; 2–8s opacity-pulse loop; dims after activation; static under reduced motion.
    - _Requirements: 8.2, 13.1, 13.2, 13.3, 13.4, 13.6_

  - [ ] 8.2 Implement `AmbientBlobs` + `Scrim`
    - `AmbientBlobs.tsx`: drifting color the glass refracts (Liquid Glass), static under reduced motion. `Scrim.tsx`: darkens the background during/after activation.
    - _Requirements: 8.3, 12.3_

- [ ] 9. Flock activation engine
  - [ ] 9.1 Implement `useFlockActivation` state machine + watchdog (`src/features/landing/flock/useFlockActivation.ts`)
    - Phases `landing → activating → dispersing → settling → osReveal`; `activate()`, geometry-driven advance callbacks, and `restoreLanding()`.
    - Total sequence 1500–3500 ms; 5000 ms activation watchdog sets `actionError` and keeps `phase='landing'` on failure; reduced motion jumps straight to `osReveal` (no dispersal/patrol).
    - _Requirements: 3.6, 4.7, 12.1, 12.8, 12.9, 12.10_

  - [ ] 9.2 Implement `AgentField` render + animation (`src/features/landing/flock/AgentField.tsx`)
    - Render `count` Agent_Shards as mini `BirdMark size="shard"`; explode from hero center to burst targets; settle to ≤0.25 opacity; run indefinite WAAPI patrol loops along node loops at uniform speed with mixed directions; visible-but-blurred beneath the OS_Reveal glass; static end-state under reduced motion.
    - _Requirements: 12.2, 12.3, 12.4, 12.5, 12.6, 12.9_

  - [ ]* 9.3 Write property test for activation round-trip
    - **Property 15: Activation round-trip restores the landing**
    - **Validates: Requirements 12.10**
    - For any initial Landing state, activate then return restores Bird_Mark, Hero copy, and Quick_Nav to exact pre-activation state. `{ numRuns: 100 }`.
    - File: `src/features/landing/__tests__/activation.property.test.ts`

- [ ] 10. Checkpoint — pure logic and animation engine
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Landing UI components
  - [ ] 11.1 Implement `TopBar` (`src/features/landing/TopBar.tsx`)
    - Leading: `BirdMark size="topbar"` + Wordmark "ARCHITEX". Trailing: `ThemeToggle` + `Sign_Up_Action` + `Primary_CTA` as `GlassSurface variant="pill"`.
    - `Sign up` → signup route (no flock); `Enter OS` → `onActivate` (begins Flock_Activation within 1000 ms); action failure-to-start within 5000 ms shows error and keeps the user on-page. ≤767px: all actions visible, no horizontal scroll, ≥44×44px targets.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 14.3_

  - [ ] 11.2 Implement `Hero` + `OrbitRing` (`src/features/landing/Hero.tsx`)
    - `BirdMark size="hero"` centered within 2px tolerance, largest footprint, wrapped by a 1–3px stroke `OrbitRing`; single `<h1>` headline in `--font-heading` (Space Grotesk); subline in `--font-sans` (Inter); exactly one `Primary_CTA` "Enter OS" → `onActivate`; Bird_Mark activation identical to CTA; copy fed through `clampCopy`; framer-motion entrance 200–1000 ms; CTA + Bird_Mark hover transitions 100–300 ms.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 8.1, 8.4, 8.5, 8.6, 9.6, 11.1, 11.4_

  - [ ] 11.3 Implement `QuickNav` (`src/features/landing/QuickNav.tsx`)
    - Exactly four items (People, Projects, Approvals, Payments) from `QUICK_NAV_ITEMS`, each a lucide-react icon + label; pointer/Enter/Space navigates to the item's route within 1000 ms; failed/unavailable route retains the view + shows error; ≤767px all four visible, no overlap or truncation.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ] 11.4 Implement `OSRevealCard` (`src/features/landing/OSRevealCard.tsx`)
    - `GlassSurface variant="card"` with Bird_Mark, "Welcome to Architex OS", email + password fields, and a sign-in control; Agent_Field remains visible-but-blurred behind it.
    - _Requirements: 12.6, 12.7_

- [ ] 12. Landing composition (responsive + reduced motion + z-order)
  - [ ] 12.1 Implement `LandingPage` (`src/features/landing/LandingPage.tsx`)
    - Compose background layers (AmbientBlobs z0, Grid z1, Scrim z1, NetworkNodes z2, AgentField z3), Hero/QuickNav (z4, dissolve on activation), TopBar (z6), OSRevealCard (z7); wire `useFlockActivation` and `restoreLanding` affordance.
    - Thread `prefersReducedMotion` (from framer-motion `useReducedMotion()`); reduced motion renders the static final state and jumps straight to OS_Reveal.
    - Responsive: desktop ≥1024px centers Hero; 320–767px single column (TopBar→Hero→QuickNav); 768–1023px no overlap/clip; re-render across breakpoints within 200 ms; no horizontal scroll 320–3840px.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.3, 9.6, 9.7, 12.3, 13.3, 13.4_

- [ ] 13. App integration
  - [ ] 13.1 Wire `ThemeProvider` and mount `LandingPage` in `App.tsx`
    - Minimal, well-contained touch points: wrap the app tree in `ThemeProvider` (Dark_Theme default app-wide) and mount `LandingPage` as the unauthenticated home view.
    - `Enter OS`/Bird_Mark drive in-page Flock_Activation → OS_Reveal; `Sign up` routes to the existing signup placeholder; Quick_Nav items navigate to their routes; existing `/login` Sign_In_Page and Workspaces import only from `src/design-system/` (no flock/moving grid).
    - _Requirements: 3.4, 3.5, 10.6, 10.7_

- [ ] 14. Accessibility and behavior property tests
  - [ ]* 14.1 Write property test for Bird_Mark activation equals Primary_CTA
    - **Property 3: Bird_Mark activation equals Primary_CTA**
    - **Validates: Requirements 4.8**
    - For pointer click / Enter / Space on the interactive Bird_Mark, the resulting state transition equals activating the Primary_CTA. `{ numRuns: 100 }`.
    - File: `src/features/landing/__tests__/birdMarkActivation.property.test.tsx`

  - [ ]* 14.2 Write property test for Quick_Nav routing
    - **Property 4: Quick_Nav routing**
    - **Validates: Requirements 5.3**
    - For all items and any activation input, navigation targets exactly that item's configured route. `{ numRuns: 100 }`.
    - File: `src/features/landing/__tests__/quickNav.property.test.tsx`

  - [ ]* 14.3 Write property test for responsive no horizontal overflow
    - **Property 5: Responsive layout has no horizontal overflow**
    - **Validates: Requirements 7.4, 7.5**
    - For all widths 320–3840px, rendered content width ≤ viewport width and Bird_Mark/headline/subline/CTA remain present and uncut. `{ numRuns: 100 }`.
    - File: `src/features/landing/__tests__/responsive.property.test.tsx`

  - [ ]* 14.4 Write property test for reduced-motion static final state
    - **Property 6: Reduced motion yields a static final state**
    - **Validates: Requirements 8.3, 12.9, 13.6**
    - For all animated elements, with reduced motion preferred each renders in its final resting state (no entrance/loop/parallax/dispersal/patrol) and activation transitions directly to OS_Reveal. `{ numRuns: 100 }`.
    - File: `src/features/landing/__tests__/reducedMotion.property.test.tsx`

  - [ ]* 14.5 Write property test for keyboard reachability without a trap
    - **Property 7: Keyboard reachability without a trap**
    - **Validates: Requirements 9.1, 9.8, 14.9**
    - For all controls in Top_Bar (incl. Theme_Toggle), Hero, and Quick_Nav, each is reachable via Tab/Shift+Tab and focus can always move away in both directions. `{ numRuns: 100 }`.
    - File: `src/features/landing/__tests__/keyboardReach.property.test.tsx`

  - [ ]* 14.6 Write property test for keyboard activation
    - **Property 8: Keyboard activation**
    - **Validates: Requirements 9.2, 14.9**
    - For all interactive button controls (incl. Theme_Toggle), Enter (and Space) while focused invokes activation. `{ numRuns: 100 }`.
    - File: `src/features/landing/__tests__/keyboardActivation.property.test.tsx`

  - [ ]* 14.7 Write property test for accessible name present
    - **Property 9: Accessible name present**
    - **Validates: Requirements 9.4, 14.9**
    - For Sign_Up_Action, Primary_CTA, each Quick_Nav item, the Bird_Mark activator, and the Theme_Toggle, a non-empty accessible name conveys purpose. `{ numRuns: 100 }`.
    - File: `src/features/landing/__tests__/accessibleName.property.test.tsx`

  - [ ]* 14.8 Write property test for visible focus indicator
    - **Property 10: Visible focus indicator**
    - **Validates: Requirements 9.3**
    - For all controls, on keyboard focus a focus indicator fully encloses the control, persists while focused, and maintains ≥3:1 contrast against the adjacent background. `{ numRuns: 100 }`.
    - File: `src/features/landing/__tests__/focusIndicator.property.test.tsx`

  - [ ]* 14.9 Write property test for focus order follows reading order
    - **Property 11: Focus order follows reading order**
    - **Validates: Requirements 9.7**
    - For all keyboard traversals, focus visits controls grouped Top_Bar → Hero_Section → Quick_Nav. `{ numRuns: 100 }`.
    - File: `src/features/landing/__tests__/focusOrder.property.test.tsx`

- [ ] 15. Example and snapshot tests
  - [ ]* 15.1 Write example/unit tests for counts, labels, timings, and error branches
    - Glass four-layer composition (2.1), exactly four Quick_Nav items (5.1), single `h1` containing the headline (9.6), CTA/activation timing bounds (3.5, 4.6, 8.1, 12.8), Bird_Mark asset-fallback branch (6.4), undefined-token dev warning (10.5), `@supports` opaque fallback (2.5), and the elemental separation of Sign_In_Page / Workspaces (no flock/moving grid) (10.6, 10.7).
    - _Requirements: 2.1, 2.5, 3.5, 4.6, 5.1, 6.4, 8.1, 9.6, 10.5, 10.6, 10.7, 12.8_

  - [ ]* 15.2 Write snapshot/visual tests for layout and material fidelity
    - Responsive stacking (7.2, 7.3), glass appearance, and PNG crispness across rendered sizes (6.2), aligned to the two `mockups/` references.
    - _Requirements: 6.2, 7.2, 7.3_

- [ ] 16. Final checkpoint — verify the full suite
  - Run `npm run lint` and `npm test`; ensure all tests pass and the build is clean. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP; core implementation tasks are never optional.
- Every task references the specific requirements (and property tests reference the design Correctness Property they validate) for traceability.
- All work is strictly additive: new files under `src/design-system/` and `src/features/landing/`, additive-only `src/index.css` edits, and minimal `App.tsx` + `index.html` touch points — chosen to rebase cleanly against concurrent functional work.
- Property-based tests use fast-check + Vitest at ≥100 iterations (`{ numRuns: 100 }`), tagged `// Feature: website-ui-redesign, Property N`. Pure-logic properties (P12, P13, P14) run headless; DOM properties (P3–P11) use testing-library + jsdom; the theme round-trip (P16) mocks `localStorage` + `matchMedia`.
- Verify with `npm run lint` (tsc) and `npm test` (Vitest) at each checkpoint.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "6.1", "7.1"] },
    { "id": 1, "tasks": ["1.2", "6.2", "7.2", "7.3"] },
    { "id": 2, "tasks": ["1.3", "2.1", "2.3", "8.1", "8.2"] },
    { "id": 3, "tasks": ["2.2", "2.4", "3.1", "9.1"] },
    { "id": 4, "tasks": ["3.2", "3.3", "3.4", "4.2", "9.2", "9.3"] },
    { "id": 5, "tasks": ["11.1", "11.2", "11.3", "11.4"] },
    { "id": 6, "tasks": ["12.1"] },
    { "id": 7, "tasks": ["13.1"] },
    { "id": 8, "tasks": ["4.1", "14.1", "14.2", "14.3", "14.4", "14.5", "14.6", "14.7", "14.8", "14.9", "15.1", "15.2"] }
  ]
}
```
