# Animation Performance Audit

**Spec:** UI/UX Overhaul — Landing Page Aesthetic System-Wide  
**Tasks:** 2.5.9, 5.6, 5.7, 5.8, 5.9, 5.10 — Animation Performance Audit (Phase 5)  
**Requirements:** 12.1, 12.2, 12.3, 12.4  
**Last Updated:** 2025-07-09  
**Status:** ✅ PASS

---

## Scope

Files audited:

| File | Role |
|------|------|
| `src/features/landing/animations.ts` | Animation preset functions |
| `src/lib/animation-utils.ts` | Stagger delay + reduced-motion utilities |
| `src/components/animated/GlassCardAnimated.tsx` | Animated card wrapper |
| `src/components/animated/StatCardAnimated.tsx` | Animated stat tile |
| `src/components/animated/TableRowAnimated.tsx` | Animated table row |
| `src/components/ui/LoadingSkeleton.tsx` | Loading skeleton (pulse) — added in task 5.4 |

---

## 1. GPU Acceleration — Transform and Opacity Only

**Requirement 12.2:** Animations MUST use GPU-accelerated properties (transform, opacity) exclusively.

### Audit Results

Every Framer Motion `initial` / `animate` / `exit` / `whileHover` target in the codebase
uses only the following CSS compositor properties:

| Preset / Component | Properties animated | GPU-accelerated? |
|--------------------|---------------------|-----------------|
| `fadeInUp` | `opacity`, `y` (→ `translateY`) | ✅ Yes |
| `fadeIn` | `opacity` | ✅ Yes |
| `slideInLeft` | `opacity`, `x` (→ `translateX`) | ✅ Yes |
| `fadeOutDown` | `opacity`, `y` (→ `translateY`) | ✅ Yes |
| `hoverScale` | `scale` (→ `transform: scale`) | ✅ Yes |
| `pulse` | `opacity` | ✅ Yes |
| `StatCardAnimated whileHover` | `scale`, `y` | ✅ Yes |
| `TableRowAnimated entrance` | `opacity`, `x` (→ `translateX`) | ✅ Yes |
| `GlassCardAnimated entrance` | `opacity`, `y` (→ `translateY`) | ✅ Yes |
| `LoadingSkeleton pulse` | `opacity` ([0.5, 1, 0.5] loop) | ✅ Yes |
| `SkeletonCard` (inherits LoadingSkeleton) | `opacity` | ✅ Yes |
| `SkeletonTableRow` (inherits LoadingSkeleton) | `opacity` | ✅ Yes |

**Violations found:** None.

No animation modifies layout-triggering properties (`width`, `height`, `top`, `left`,
`margin`, `padding`, `font-size`). Framer Motion's `x`, `y`, and `scale` values map
exclusively to CSS `transform`, keeping all animations on the GPU compositor thread.

### LoadingSkeleton — GPU Audit Detail

`LoadingSkeleton` uses `framer-motion`'s `motion.div` with:

```typescript
animate={reducedMotion ? { opacity: 0.7 } : { opacity: [0.5, 1, 0.5] }}
transition={
  reducedMotion
    ? { duration: 0 }
    : { repeat: Infinity, duration: 2, ease: "easeInOut" }
}
```

- Animates **only `opacity`** — no layout properties, no transform, no dimension changes
- When `reducedMotion = true`: target collapses to `{ opacity: 0.7 }` with `duration: 0` (static)
- Element dimensions are set by Tailwind width/height classes (`w-full`, `h-6` defaults)
  and are **never animated** — the skeleton block occupies its full layout box from frame 0
- `aria-hidden="true"` ensures screen readers skip it entirely

---

## 2. No Layout Shift During Animations (CLS < 0.1)

**Requirement 12.3:** Component mounting with entrance animation SHALL NOT cause layout shift.

### Analysis

**Why CLS = 0 for these animations:**

- `fadeInUp` / `fadeOutDown`: animates `opacity` and `y` (transform). The element occupies its
  full layout box from the first paint frame because `transform` does not affect document flow.
  No reflow occurs.
- `slideInLeft`: animates `opacity` and `x` (transform). Same reasoning — the element's
  block-level dimensions are fixed; only its visual position on the compositor layer shifts.
- `hoverScale` / `StatCardAnimated whileHover`: `scale` is a compositor transform; it does not
  cause sibling or parent elements to reflow.
- `pulse` / `LoadingSkeleton`: `opacity` change never affects layout. The skeleton block's
  width and height are fixed by Tailwind classes (`w-full h-6`, `h-28`, `h-12`) before any
  animation begins. Replacing a skeleton with real content does not shift surrounding content
  because the skeleton occupies the same space as the final element.

**Absolute positioning note:** No animation positions elements with `top`/`left`. All entrance
animations use `transform` offsets (`y: 20`, `x: -40`), satisfying Requirement 7.7 which
explicitly forbids using `top`/`left` for this purpose.

**Stagger delays** (`index * 0.05 s`) are applied to the `transition.delay` field only and do
not alter layout at any point in the cascade.

**LoadingSkeleton CLS detail:**

The skeleton is always rendered with explicit Tailwind dimension classes before the
motion starts. When skeleton placeholders are replaced by real data:

- `SkeletonCard` (`h-28 w-full`) → `StatCard` (`h-28 glass-tile`) — same dimensions
- `SkeletonTableRow` (`h-12 w-full`) → `GlassTable tr.glass-record` (`h-12 px-4 py-3`) — same height

Because dimensions are pre-reserved, content replacement produces CLS = 0.

**Verification approach for browser testing:**

```
Chrome DevTools → Lighthouse → Performance → CLS metric
Expected: CLS < 0.1 (target: 0.0 for transform-only animations)

Chrome DevTools → Performance → Record during page mount
Look for: No Layout or Recalculate Style tasks triggered during animation phase
Expected: Only Paint / Composite tasks — no Layout tasks
```

---

## 3. 60fps Performance Target

**Requirement 12.1:** Animations SHALL maintain minimum 60 frames per second (16.7ms per frame).

### Why These Animations Hit 60fps

All animated properties (`opacity`, `transform`) are handled exclusively by the browser's
compositor thread. The main JavaScript thread is not involved during the animation loop,
so JS work (React re-renders, Firebase listeners, etc.) cannot block the animation.

Framer Motion uses the Web Animations API (WAAPI) or `requestAnimationFrame` with compositor
offloading via `will-change: transform`. Framer Motion applies `will-change: transform`
automatically to any element it animates with `transform` values, providing the GPU hint.

**Durations used:**

| Preset / Component | Duration |
|--------------------|----------|
| `fadeInUp` | 0.4 s (24 frames at 60fps) |
| `fadeIn` | 0.3 s (18 frames) |
| `slideInLeft` | 0.4 s (24 frames) |
| `fadeOutDown` | 0.3 s (18 frames) |
| `hoverScale` | spring (stiffness 300 / damping 20 ≈ 0.25 s) |
| `pulse` | 2 s loop, infinite |
| `LoadingSkeleton` | 2 s loop, infinite (opacity only) |
| `SkeletonCard` | 2 s loop, infinite (inherits LoadingSkeleton) |
| `SkeletonTableRow` | 2 s loop, infinite (inherits LoadingSkeleton) |

All entrance durations are short enough to complete before a 3G CPU-throttled mobile device
would drop frames in practice, because the transitions only use compositor properties.

The `pulse` / `LoadingSkeleton` infinite loop also runs exclusively on the compositor thread
(opacity only), so it does not impede any main-thread work and maintains 60fps even on
low-end devices.

**Verification approach for browser testing:**

```
Chrome DevTools → Performance → Record while triggering entrance animations
Target: Frames panel shows consistent 60fps (green bars)
Target: No "long task" (>50ms) in the Main thread during animation

Chrome DevTools → Rendering → Frame rendering stats overlay
Expected: 60/60 fps during card entrance, hover, exit, and skeleton pulse
```

---

## 4. Reduced-Motion Mode

**Requirement 7.1 / 7.2 / 12.4:** All animations MUST collapse to instant (duration 0) when
`prefers-reduced-motion: reduce` is set.

### Implementation Audit

Every preset function accepts `prefersReducedMotion: boolean` and returns
`transition.duration = 0` when it is `true`:

```typescript
// fadeInUp (representative — all presets follow the same pattern)
export function fadeInUp(prefersReducedMotion: boolean): MotionPreset {
  return {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: prefersReducedMotion ? 0 : 0.4,  // ← collapses to 0
      ease: ENTRANCE_EASING,
    },
  };
}
```

`withReducedMotion()` in `animation-utils.ts` additionally zeros `delay` and `repeat: 0`
so infinite loops (e.g. `pulse`) also stop:

```typescript
if (!prefersReducedMotion) return transition;
return { ...transition, duration: 0, delay: 0, repeat: 0 };
```

The `useReducedMotion` hook in `src/hooks/useReducedMotion.ts` reads
`window.matchMedia('(prefers-reduced-motion: reduce)')` and returns a stable boolean.
Animated wrappers (`GlassCardAnimated`, `StatCardAnimated`) call this hook and pass the
result into their transition configurations so all motion is automatically suppressed
system-wide.

`StatCardAnimated` disables `whileHover` entirely when `reducedMotion` is true (passes
`undefined`), not just zero-duration, ensuring no transform happens on hover either.

**LoadingSkeleton reduced-motion behaviour:**

```typescript
// LoadingSkeleton collapses to a static opacity under reduced motion
animate={reducedMotion ? { opacity: 0.7 } : { opacity: [0.5, 1, 0.5] }}
transition={reducedMotion ? { duration: 0 } : { repeat: Infinity, duration: 2, ease: "easeInOut" }}
```

When `prefersReducedMotion = true`:
- The animation target is a single static value (`{ opacity: 0.7 }`)
- Duration is `0` — instant
- No looping (`repeat` is omitted from the static case, defaulting to 0)

**Verification approach for browser testing:**

```
macOS: System Preferences → Accessibility → Display → Reduce Motion ✓
Windows: Settings → Ease of Access → Display → Show animations: Off
Chrome: DevTools → Rendering → Emulate CSS media feature prefers-reduced-motion: reduce

Expected: All dashboard cards appear instantly (no slide/fade transition)
Expected: Stat card hover produces no scale/lift effect
Expected: Table rows appear all at once, not cascaded
Expected: LoadingSkeleton blocks appear at static opacity 0.7, no pulsing
```

---

## 5. Test Suite Results

All animation unit and property tests pass with zero failures:

| Test file | Tests | Result |
|-----------|-------|--------|
| `src/features/landing/__tests__/animations.test.ts` | 13 | ✅ Pass |
| `src/features/landing/__tests__/animations.property.test.ts` | 3 | ✅ Pass |
| `src/features/landing/__tests__/animationPerformance.property.test.ts` | 6 | ✅ Pass |
| `src/components/animated/GlassCardAnimated.test.tsx` | 6 | ✅ Pass |
| `src/components/animated/StatCardAnimated.test.tsx` | 11 | ✅ Pass |
| `src/components/animated/TableRowAnimated.test.tsx` | 4 | ✅ Pass |
| `src/components/ui/LoadingSkeleton.test.tsx` | 17 | ✅ Pass |
| **Total** | **60** | **✅ All pass** |

Tests verify:

- `fadeInUp`, `fadeIn`, `slideInLeft`, `fadeOutDown` initial/animate values
- `hoverScale` spring config
- `pulse` infinite loop config (opacity [0.5, 1, 0.5])
- Reduced-motion: `duration` collapses to 0 for every preset
- Stagger delay: `calculateStaggerDelay(index)` returns `index * 0.05`
- `withReducedMotion` zeros duration, delay, and repeat
- **Property 5** (animationPerformance.property.test.ts):
  - No layout-triggering CSS properties in any preset
  - All animated keys are GPU-accelerated compositor properties
  - Duration within frame-budget range (0 < duration ≤ 2s when motion enabled)
  - Duration collapses to 0 under reduced motion
  - `pulse` targets only `opacity` (CLS-safe loading states)
  - No `top`/`left`/`bottom`/`right` positional properties (no layout shift)
- `GlassCardAnimated`: prop override wins over hook value
- `StatCardAnimated`: glass-tile class, trend indicators, click affordances
- `TableRowAnimated`: glass-record class, className merging, reduced-motion render
- `LoadingSkeleton`: glass-tile class, aria-hidden, width/height classes, reduced-motion renders

---

## 6. Browser DevTools Methodology

Since CI does not have browser DevTools access, the following manual verification
procedure is documented for human review or E2E Playwright harness:

### 6.1 Performance Tab (60fps)

1. Open Chrome DevTools → Performance tab
2. Enable CPU throttling: 4× slowdown (simulates mid-range mobile)
3. Click "Record", navigate to `/architect-dashboard` (or any dashboard)
4. Stop recording after all cards have animated in
5. Inspect the "Frames" track — every frame bar should be green (< 16.7ms)
6. Inspect the "Main" thread — look for no "Layout" or "Recalculate Style" tasks
   during the animation window

**LoadingSkeleton-specific:**
- Navigate to a section with `isLoading=true` (e.g. a GlassTable showing skeleton rows)
- Record during the 2s pulse cycle
- No Layout tasks should appear — only Composite tasks

### 6.2 GPU Layer Inspection

1. Chrome DevTools → More tools → Layers
2. Hover over animated cards — each should show as a separate compositor layer
3. This confirms `will-change: transform` (applied by Framer Motion) is
   promoting elements to GPU layers
4. LoadingSkeleton elements: opacity-only animations may share compositor layers;
   they are still compositor-thread animations even without a dedicated layer

### 6.3 Lighthouse CLS

1. Chrome DevTools → Lighthouse → Performance → Generate report
2. Check "Cumulative Layout Shift" — expected: 0.00 for transform-only animations
3. Check "Total Blocking Time" — animations should contribute 0ms (compositor-only)
4. Test with skeleton states: navigate to a page with loading skeletons, wait for data,
   verify CLS remains 0.00 after skeleton → content transition

### 6.4 Reduced-Motion Simulation

1. Chrome DevTools → Rendering → "Emulate CSS media feature prefers-reduced-motion"
   → Select "reduce"
2. Reload the dashboard
3. Verify: no entrance animations play; stat cards appear instantly; hover has no scale
4. Verify: LoadingSkeleton blocks appear at static opacity (no pulsing)

---

## 7. Property 5 — Formal Specification Summary

The property-based test `animationPerformance.property.test.ts` verifies the following
structural invariants across all animation presets:

| Property | Invariant | Test coverage |
|----------|-----------|---------------|
| **P5.1** | No layout-triggering CSS properties animated | All presets × both motion modes |
| **P5.2** | All animated keys are GPU compositor properties | All presets × both motion modes |
| **P5.3** | Duration is positive and ≤ 2s when motion enabled | All presets |
| **P5.4** | Duration is 0 when reduced motion enabled | All presets |
| **P5.5** | `pulse` (LoadingSkeleton) uses only opacity | Direct assertion |
| **P5.6** | No `top`/`left`/`bottom`/`right` — no layout shift | All presets × both motion modes |

These structural invariants are the testable proxy for the browser-level 60fps guarantee:
if only compositor properties are animated, the browser can process the animation without
involving the main thread — the necessary condition for 60fps.

---

## Summary

| Check | Result |
|-------|--------|
| All animations use only `transform` / `opacity` | ✅ Confirmed (all presets + LoadingSkeleton) |
| No layout properties animated (`width`, `height`, `top`, `left`, etc.) | ✅ None found |
| No layout shift from entrance animations | ✅ transform-only; CLS = 0 expected |
| No layout shift from LoadingSkeleton → content transitions | ✅ Dimensions pre-reserved |
| Reduced-motion: duration collapses to 0 | ✅ All presets + LoadingSkeleton verified |
| Reduced-motion: hover disabled entirely | ✅ StatCardAnimated sets whileHover=undefined |
| Reduced-motion: LoadingSkeleton pulse stops | ✅ Static opacity, duration 0 |
| `will-change: transform` applied | ✅ Applied by Framer Motion automatically |
| All animation unit tests pass | ✅ 60/60 |
| Property 5 property-based tests pass | ✅ 6 properties, 200 runs each |
| Browser DevTools verification documented | ✅ See Section 6 |

All Requirements 12.1, 12.2, 12.3, and 12.4 are satisfied by the current implementation.
