# AGENTS.md — UI Primitives (shadcn/ui)

## Purpose

Reusable, unstyled UI primitive components built on shadcn/ui conventions (`@radix-ui/react-*` + `@base-ui/react`). These are the atomic building blocks consumed by all feature components, dashboards, and pages. They enforce consistent styling, accessibility, and interaction patterns across the entire platform.

## Ownership

- **Path:** `src/components/ui/`
- **Owner:** Frontend / Design Systems Team
- **Key files (~35):** `button.tsx`, `card.tsx`, `dialog.tsx`, `input.tsx`, `label.tsx`, `tabs.tsx`, `badge.tsx`, `avatar.tsx`, `accordion.tsx`, `alert.tsx`, `table.tsx`, `switch.tsx`, `slider.tsx`, `skeleton.tsx`, `progress.tsx`, `scroll-area.tsx`, `separator.tsx`, `popover.tsx`, `textarea.tsx`, `sonner.tsx`, `optimized-image.tsx`, `optimized-image.test.tsx`, `GlassButton.tsx`, `GlassButton.test.tsx`, `GlassCard.tsx`, `GlassInput.tsx`, `GlassInput.test.tsx`, `GlassPanel.tsx`, `GlassPanel.test.tsx`, `GlassModal.tsx`, `GlassModal.test.tsx`, `GlassPill.tsx`, `GlassPill.test.tsx`, `GlassIconBox.tsx`, `GlassIconBox.test.tsx`, `GlassDrawer.tsx`, `GlassDrawer.test.tsx`, `LoadingSkeleton.tsx`, `LoadingSkeleton.test.tsx`

## Local Contracts

### Component Contract
Every UI primitive must:
- Be built on a Radix UI / Base UI headless primitive
- Use Tailwind v4 variant classes for styling (no inline styles)
- Accept `className` prop for consumer overrides (Tailwind merge via `cn()` utility from `src/lib/utils.ts`)
- Forward refs via `React.forwardRef`
- Export both named component and type definitions
- Support `asChild` pattern where applicable (Radix Composition)

### Styling Rules
- Use `@theme inline {}` tokens from `src/index.css` (no hardcoded color/spacing values)
- Tailwind v4 uses CSS-only configuration — no `tailwind.config` file
- All primitives follow shadcn/ui CLI-generated patterns for consistency

### Accessibility
- All interactive elements must have visible focus indicators
- Form controls must be associated with labels
- Dialog/Modal must trap focus and support Escape to close
- ARIA attributes per WAI-ARIA authoring practices (Radix handles most)

## Work Guidance

- Do NOT add page-specific logic to UI primitives — keep them pure
- Add new primitives by running the shadcn/ui CLI or manually following existing patterns
- Test new primitives with a `*.test.tsx` alongside the component
- Use `optimized-image.tsx` for all image rendering (lazy loading, responsive srcsets)
- Sonner toast via `sonner.tsx` for all notifications
- When modifying a primitive, check all consumers across `src/components/` and `src/features/`

## Verification

- `npm test` covers `optimized-image.test.tsx`, `GlassInput.test.tsx`, `GlassPanel.test.tsx`, `GlassButton.test.tsx`, `GlassModal.test.tsx`, `GlassPill.test.tsx`, `GlassIconBox.test.tsx`, `GlassDrawer.test.tsx`, `LoadingSkeleton.test.tsx`, and `focus-ring-components.test.tsx`
- `src/lib/__tests__/focus-ring-css.test.ts` covers CSS structure, --ring token values, and WCAG contrast for focus rings (runs in node environment)
- TypeScript type checking via `npm run lint`
- E2E visual regression tests via Playwright (`npm run test:e2e`)
- Glass primitive test files use `*.test.tsx` pattern alongside each component — run via jsdom environment

## Focus Ring Contracts (Task 6.7 — Req 10.3, 10.5, 10.9)

All interactive Glass primitives MUST:
- Apply `focus-visible-ring` class when interactive (has `onClick`/`tabIndex ≥ 0`)
- Pair any `focus:outline-none` with `focus-visible-ring` to replace, not suppress, the focus indicator
- Never use `focus:outline-none` alone on a keyboard-reachable element (`tabIndex ≥ 0`)
- Exception: `tabIndex={-1}` (programmatic-only focus targets, e.g. GlassDrawer dialog root) may use `focus:outline-none`

Focus ring colour: `--ring` resolves to `#aeefe3` (Dark_Theme) / `#006b5c` (Light_Theme). Both exceed WCAG 3:1 for non-text contrast (1.4.11). Dark_Theme achieves ~11–13:1 (WCAG AAA).

## Child DOX Index

No child AGENTS.md files exist below this directory.
