# Implementation Plan: UI/UX Overhaul — Landing Page Aesthetic System-Wide

## Overview

This implementation plan breaks down the glass-morphism design system into 6 coordinated phases:
1. **Foundation** — Theme tokens and CSS glass classes
2. **Tier 1 Primitives** — Atomic components (buttons, inputs, cards, modals)
3. **Animation Presets** — Framer Motion entrance/exit animations with reduced-motion support
4. **Tier 2 Composites** — Dashboard panels, stat cards, tables, navigation
5. **Dashboard Refactoring** — Apply glass system to all 39 dashboards
6. **Accessibility & Validation** — WCAG AA compliance and performance testing

Each phase builds on prior work with clear dependencies. Tasks are organized to minimize file conflicts and enable parallel execution.

---

## Tasks

## Phase 1: Foundation (Theme & Glass System)

### Objective
Establish the foundational theme tokens and frosted glass CSS classes that all components inherit.

- [x] 1.1 Verify and export theme tokens from src/design-system/tokens.ts
  - Export all semantic tokens (--landing-bg, --landing-accent, --glass-blur, etc.)
  - Ensure tokens match design spec: Dark_Theme defaults (#0d2520, #aeefe3)
  - Create fallback values for missing tokens in development
  - _Requirements: 1.1, 1.2, 15.1, 15.2_

- [x] 1.2 Write property test for theme token round-trip serialization
  - **Property 1: Token round-trip consistency**
  - **Validates: Requirements 16.1, 16.3, 16.6**
  - Test: parse(serialize(tokens)) === original tokens for all token types

- [x] 1.3 Create glass-* CSS classes in src/index.css
  - Define .glass base class (backdrop-filter blur + saturate, border, box-shadow)
  - Define 12+ glass variants: glass-card, glass-panel, glass-modal, glass-tile, glass-input, glass-button, glass-button-solid, glass-nav, glass-record, glass-pill, glass-icon-box, glass-drawer, glass-sheet
  - Each variant applies color-mix for transparency hierarchy
  - Apply inset glow + outer shadow for depth
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12_

- [x] 1.4 Create fallback handling for unsupported browsers
  - Add @supports rule for backdrop-filter detection
  - Define fallback background (var(--landing-bg-deep)) for browsers without backdrop-filter support
  - Test in Firefox (oldest supported version) and Safari 14
  - _Requirements: 2.5, 15.4, 15.5_

- [x] 1.5 Write property test for glass CSS fallback consistency
  - **Property 2: Glass fallback renders without layout shift**
  - **Validates: Requirements 2.5, 12.3, 12.4**
  - Test: glass-* elements render identical dimensions in fallback mode

- [x] 1.6 Implement theme switching (Dark_Theme ↔ Light_Theme)
  - Create useTheme hook in src/hooks/useTheme.ts
  - Implement localStorage persistence for theme preference
  - Update CSS custom properties on theme change
  - Update App.tsx to initialize theme from user preference or browser media query
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

- [x] 1.7 Write property test for theme switching consistency
  - **Property 3: Theme switch updates all custom properties**
  - **Validates: Requirements 13.5, 13.6_**
  - Test: Switching themes updates all var(--token) values dynamically

- [x] 1.8 Ensure contrast compliance for both themes
  - Verify Dark_Theme text contrast: white on #0d2520 = 15.8:1 (WCAG AAA)
  - Verify Dark_Theme muted text: rgba(255,255,255,0.62) on #0d2520 = 4.8:1 (WCAG AA)
  - Verify Light_Theme contrast ratios meet minimums
  - Document contrast ratios in contrast-matrix.md
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

- [x] 1.9 Checkpoint - Ensure all theme tokens load and CSS is valid
  - Verify all 40+ CSS custom properties resolve
  - Run browser DevTools CSS audit
  - Test theme switching in browser console
  - _Requirements: 1.1, 1.2_

---

## Phase 2: Tier 1 Primitive Components

### Objective
Create reusable atomic components with glass styling as default.

- [x] 2.1 Create GlassButton.tsx component
  - Support variant prop: 'solid' | 'outline'
  - Support size prop: 'sm' | 'md' | 'lg'
  - Implement focus-visible-ring for keyboard navigation
  - Render with glass-button or glass-button-solid class
  - Disabled state: opacity-50, cursor-not-allowed
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 10.3, 11.4_
  - Files: `src/components/ui/GlassButton.tsx`

- [x] 2.2 Create GlassInput.tsx component
  - Support placeholder, type, value, disabled props
  - Apply glass-input class
  - Implement focus state: border-color shift + ring shadow
  - Keyboard accessible via Tab
  - _Requirements: 3.5, 3.6, 3.7, 10.1, 10.2, 10.3_
  - Files: `src/components/ui/GlassInput.tsx`

- [x] 2.3 Create GlassCard.tsx component
  - Render children with glass-card class
  - Support optional className, onClick, role, aria-label props
  - Implement onClick handler with stopPropagation
  - _Requirements: 3.8, 3.9, 10.3_
  - Files: `src/components/ui/GlassCard.tsx`

- [x] 2.4 Create GlassPanel.tsx component
  - Similar to GlassCard but uses glass-panel for larger sections
  - Support title, children, className
  - Render semantic section element
  - _Requirements: 3.8, 3.9, 11.1, 11.2_
  - Files: `src/components/ui/GlassPanel.tsx`

- [x] 2.5 Create GlassModal.tsx component
  - Implement focus trap (Tab cycles within modal, doesn't escape)
  - Implement Escape key close behavior
  - Render backdrop overlay with glass-modal class
  - Restore focus to previously active element on close
  - Support isOpen, onClose, children, aria-label props
  - _Requirements: 3.9, 3.10, 3.11, 10.6, 10.7, 11.5_
  - Files: `src/components/ui/GlassModal.tsx`

- [x] 2.6 Write unit tests for GlassButton
  - Test variant prop: solid and outline apply correct classes
  - Test size prop: sm, md, lg apply correct padding
  - Test disabled state: opacity-50, cursor-not-allowed, click prevented
  - Test focus-visible-ring renders on keyboard focus
  - Test aria-label for icon-only buttons
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 2.7 Write unit tests for GlassInput
  - Test placeholder and value props
  - Test focus state: border and ring apply
  - Test disabled state: opacity-50, input disabled
  - Test keyboard navigation: Tab navigates through inputs
  - _Requirements: 3.5, 3.6, 3.7_

- [x] 2.8 Write unit tests for GlassCard
  - Test children render inside glass-card
  - Test onClick handler invoked on click
  - Test stopPropagation prevents event bubbling
  - Test role and aria-label props applied
  - _Requirements: 3.8, 3.9_

- [x] 2.9 Write unit tests for GlassPanel
  - Test title renders as h2 with font-heading
  - Test children render inside glass-panel
  - Test semantic section element
  - _Requirements: 3.8, 3.9_

- [x] 2.10 Write unit tests for GlassModal
  - Test focus trap: Tab cycles within modal
  - Test Escape key closes modal
  - Test onClose callback invoked
  - Test backdrop renders with glass-modal class
  - Test focus restored to previous element on close
  - _Requirements: 3.9, 3.10, 3.11, 10.7_

- [x] 2.11 Create additional primitives: GlassPill, GlassIconBox, GlassDrawer
  - GlassPill: Rounded pill-shaped container (glass-pill class)
  - GlassIconBox: Square icon container (glass-icon-box class)
  - GlassDrawer: Slide-in drawer from left with focus trap (glass-drawer class)
  - All with keyboard navigation and ARIA support
  - _Requirements: 2.10, 3.11_
  - Files: `src/components/ui/GlassPill.tsx`, `src/components/ui/GlassIconBox.tsx`, `src/components/ui/GlassDrawer.tsx`

- [x] 2.12 Write unit tests for additional primitives
  - Test GlassPill renders with glass-pill class and border-radius
  - Test GlassIconBox renders square with glass-icon-box class
  - Test GlassDrawer: focus trap, Escape close, slide animation
  - _Requirements: 2.10_

- [x] 2.13 Checkpoint - Ensure all Tier 1 primitives pass tests with 90%+ coverage
  - Run `npm test src/components/ui/Glass*.test.tsx`
  - Verify coverage > 90% for each component
  - Ensure all accessibility tests pass
  - _Requirements: 3.11_

---

## Phase 2.5: Animation Presets

### Objective
Define reusable animation presets that respect prefers-reduced-motion and support staggered entrance animations.

- [x] 2.5.1 Export animation presets from src/features/landing/animations.ts
  - Export animated preset functions: fadeInUp, fadeIn, slideInLeft, fadeOutDown, hoverScale, pulse
  - Each preset accepts prefersReducedMotion boolean
  - All presets set duration: 0 if prefersReducedMotion = true
  - Use cubic-bezier(0.2, 0.8, 0.2, 1) easing for entrance animations
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
  - Files: `src/features/landing/animations.ts`

- [x] 2.5.2 Implement useReducedMotion hook
  - Detect prefers-reduced-motion media query
  - Cache value in state to avoid re-computing on every render
  - Return boolean value
  - _Requirements: 7.1, 7.2_
  - Files: `src/hooks/useReducedMotion.ts`

- [x] 2.5.3 Write property test for reduced-motion consistency
  - **Property 4: Animations respect prefers-reduced-motion setting**
  - **Validates: Requirements 7.1, 7.2, 7.8_**
  - Test: When prefers-reduced-motion = true, all animation durations are 0

- [x] 2.5.4 Create animation utility helpers
  - Export calculateStaggerDelay(index: number): number function
  - Default stagger: index * 0.05 (50ms per item)
  - Export withReducedMotion wrapper for transition configs
  - _Requirements: 7.6, 12.8_
  - Files: `src/lib/animation-utils.ts`

- [x] 2.5.5 Implement GlassCardAnimated wrapper component
  - Wraps GlassCard with Framer Motion entrance
  - Entrance: fadeInUp animation
  - Support delay prop for staggering
  - _Requirements: 7.4, 7.7, 12.1_
  - Files: `src/components/animated/GlassCardAnimated.tsx`

- [x] 2.5.6 Implement StatCardAnimated wrapper component
  - Wraps StatCard with fadeInUp entrance
  - Implements whileHover: { scale: 1.02, y: -4 } (respects prefersReducedMotion)
  - Support delay prop
  - _Requirements: 5.4, 7.5, 12.1_
  - Files: `src/components/animated/StatCardAnimated.tsx`

- [x] 2.5.7 Implement TableRowAnimated wrapper component
  - Wraps table row with slideInLeft entrance
  - Applies stagger delay: index * 0.05
  - _Requirements: 7.6, 12.1_
  - Files: `src/components/animated/TableRowAnimated.tsx`

- [x] 2.5.8 Write unit tests for animation presets
  - Test fadeInUp: opacity 0→1, y 20→0
  - Test fadeIn: opacity 0→1
  - Test slideInLeft: opacity 0→1, x -40→0
  - Test prefersReducedMotion: duration becomes 0
  - Test stagger calculation: index * 0.05
  - _Requirements: 7.3, 7.4, 7.5, 7.6_

- [x] 2.5.9 Checkpoint - Ensure animations render at 60fps target
  - Test animations in browser DevTools Performance tab
  - Verify GPU acceleration (transform, opacity only)
  - Verify no layout shifts (CLS < 0.1)
  - Test in reduced-motion mode
  - _Requirements: 12.1, 12.2, 12.3, 12.4_

---

## Phase 3: Tier 2 Composite Components

### Objective
Compose Tier 1 primitives into reusable dashboard sections, cards, and tables.

- [x] 3.1 Create DashboardSection.tsx component
  - Accept title (required), description, icon, children, action props
  - Render h2 with font-heading font-bold
  - Wrap content in glass-panel
  - Render icon in glass-icon-box if provided
  - Render action button/element aligned to right
  - _Requirements: 4.1, 4.2, 11.1, 11.2_
  - Files: `src/components/composite/DashboardSection.tsx`

- [x] 3.2 Create StatCard.tsx component
  - Accept label, value, icon, trend props
  - Apply glass-tile class
  - Render label (small text), value (2xl bold), trend indicator if provided
  - Trend indicator: ↑ for up (green), ↓ for down (red)
  - _Requirements: 4.3, 4.4_
  - Files: `src/components/composite/StatCard.tsx`

- [x] 3.3 Create GlassTable.tsx component
  - Generic component with Column<T> type
  - Render thead with th elements (font-semibold, text-foreground-muted)
  - Render tbody with tr.glass-record rows
  - Support onRowClick callback
  - Support isLoading state: render "Loading..."
  - Support emptyState prop or default "No records found"
  - _Requirements: 4.5, 4.6, 4.7, 4.8_
  - Files: `src/components/composite/GlassTable.tsx`

- [x] 3.4 Write unit tests for DashboardSection
  - Test title renders as h2 with font-heading
  - Test description renders if provided
  - Test icon renders in glass-icon-box
  - Test action renders aligned to right
  - Test children render inside glass-panel
  - _Requirements: 4.1, 4.2_

- [x] 3.5 Write unit tests for StatCard
  - Test label and value render
  - Test trend indicator: ↑ up (green), ↓ down (red)
  - Test glass-tile class applied
  - Test icon renders if provided
  - _Requirements: 4.3, 4.4_

- [x] 3.6 Write unit tests for GlassTable
  - Test columns render in thead
  - Test rows render in tbody
  - Test onRowClick callback invoked
  - Test isLoading state
  - Test emptyState renders when no rows
  - Test custom render function for columns
  - _Requirements: 4.5, 4.6, 4.7, 4.8_

- [x] 3.7 Create GlassChart.tsx component
  - Accept title, chartType ('line'|'bar'|'pie'|'area'), data, height props
  - Wrap chart library (e.g., Chart.js or Recharts) in glass-panel
  - Apply CSS custom properties for colors: --foreground for text, --glass-bg for tooltip
  - Legend uses glass-pill styling
  - _Requirements: 4.9, 4.10_
  - Files: `src/components/composite/GlassChart.tsx`

- [x] 3.8 Create RoleAwareSidebar.tsx component
  - Import navigation from architexNavigationConfig.ts
  - Call getNavigationForRole(user.role) to filter modules
  - Render modules with collapsible sections
  - Highlight current page with bg-primary/20 and text-landing-accent
  - Apply glass-nav class to sidebar
  - Render fixed left: 0 top: 0 h-screen w-64 on desktop
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_
  - Files: `src/components/navigation/RoleAwareSidebar.tsx`

- [x] 3.9 Create Breadcrumbs.tsx component
  - Call useBreadcrumbs() hook to get breadcrumb array
  - Render ChevronRight separator between crumbs
  - Make non-current crumbs clickable links
  - Apply text-foreground-muted for secondary text
  - Apply text-foreground for current page (last crumb)
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - Files: `src/components/navigation/Breadcrumbs.tsx`

- [x] 3.10 Create useBreadcrumbs hook
  - Extract breadcrumb logic from route/location data
  - Return array of { id, label, href } objects
  - _Requirements: 6.1_
  - Files: `src/hooks/useBreadcrumbs.ts`

- [x] 3.11 Create MobileMenuTrigger.tsx component
  - Hamburger icon button (3 horizontal lines)
  - On click, toggle drawer menu visibility
  - Drawer slides in from left with glass-drawer styling
  - Only visible on mobile (md: hidden)
  - _Requirements: 5.8_
  - Files: `src/components/navigation/MobileMenuTrigger.tsx`

- [x] 3.12 Create GlassKanbanBoard.tsx component (optional MVP)
  - Drag-drop implementation using react-beautiful-dnd or @dnd-kit
  - Cards styled with glass-tile
  - Support onDragEnd callback to update state
  - _Requirements: 4.10_
  - Files: `src/components/composite/GlassKanbanBoard.tsx`

- [x] 3.13 Write unit tests for GlassChart
  - Test title renders
  - Test chart data renders inside glass-panel
  - Test CSS custom properties applied to chart colors
  - _Requirements: 4.9, 4.10_

- [x] 3.14 Write unit tests for RoleAwareSidebar
  - Test modules filtered by role
  - Test modules collapsible/expandable
  - Test current page highlighted
  - Test glass-nav class applied
  - Test Help & Support button renders
  - Test Sign Out button renders
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_

- [x] 3.15 Write unit tests for Breadcrumbs
  - Test breadcrumbs render from useBreadcrumbs hook
  - Test ChevronRight separator renders
  - Test non-current crumbs are links
  - Test current crumb (last) is not a link
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 3.16 Write unit tests for MobileMenuTrigger
  - Test hamburger button renders
  - Test drawer opens on click
  - Test drawer closes on click outside or Escape
  - Test hidden on desktop (md: hidden)
  - _Requirements: 5.8_

- [x] 3.17 Checkpoint - Ensure all Tier 2 composites pass tests
  - Run `npm test src/components/composite/*.test.tsx`
  - Verify all components render correctly
  - Ensure accessibility tests pass
  - _Requirements: 4.10_

---

## Phase 4: Dashboard Page Refactoring

### Objective
Refactor all 39 canonical dashboard pages to use glass components consistently.

- [x] 4.1 Refactor ArchitectDashboard.tsx
  - Replace legacy layout with new structure using RoleAwareSidebar, Breadcrumbs
  - Replace content panels with glass-panel and glass-tile
  - Replace tables with GlassTable using glass-record rows
  - Replace stat displays with StatCard (or StatCardAnimated)
  - Apply entrance animations with calculated stagger delays
  - Ensure responsive layout (grid-cols-1 md:grid-cols-2 lg:grid-cols-3)
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 8.1, 8.2, 8.3, 8.4_
  - Files: `src/components/ArchitectDashboard.tsx`

- [x] 4.2 Refactor AdminDashboard.tsx
  - Same refactoring pattern as ArchitectDashboard
  - Use glass components and animations
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_
  - Files: `src/components/AdminDashboard.tsx`

- [x] 4.3 Refactor ClientDashboard.tsx
  - Same refactoring pattern as ArchitectDashboard
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_
  - Files: `src/components/ClientDashboard.tsx`

- [x] 4.4 Refactor remaining 36 dashboards
  - BEPDashboard, ContractorDashboard, SubcontractorDashboard, SupplierDashboard, FreelancerDashboard
  - DeveloperDashboard, FirmAdminDashboard, PlatformAdminDashboard, EngineerDashboard
  - QuantitySurveyorDashboard, SiteManagerDashboard, TownPlannerDashboard, EnergyProfessionalDashboard
  - FireEngineerDashboard, and remaining 22+ role-specific dashboards
  - Apply identical glass aesthetic and responsive layout structure
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

- [x] 4.5 Apply entrance animations to all dashboard sections
  - Use GlassCardAnimated for main content sections
  - Use StatCardAnimated for stat cards with stagger delay: index * 0.05
  - Use TableRowAnimated for table rows with stagger delay: index * 0.05
  - Respect prefersReducedMotion for all animations
  - _Requirements: 5.1, 7.3, 7.4, 7.5, 7.6, 12.1_

- [x] 4.6 Ensure responsive layout across all dashboards
  - Mobile (< 768px): single-column layout, hide sidebar, show MobileMenuTrigger
  - Tablet (768px–1023px): two-column grid, sidebar as drawer
  - Desktop (≥ 1024px): three-column grid, sidebar fixed left
  - Wide (≥ 1440px): 4+ columns if content warrants
  - Test with viewport sizes: 320px, 768px, 1024px, 1440px, 2560px, 3840px
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10_

- [x] 4.7 Write integration tests for ArchitectDashboard
  - Test sidebar renders with correct modules for architect role
  - Test all sections render with glass-panel class
  - Test stat cards render with glass-tile class
  - Test tables render with glass-record rows
  - Test animations apply with stagger delays
  - _Requirements: 14.1, 14.2, 14.3, 14.4_

- [x] 4.8 Write integration tests for responsive layouts
  - Test mobile layout: single column, sidebar hidden
  - Test tablet layout: two columns, sidebar drawer
  - Test desktop layout: three columns, sidebar fixed
  - Verify no horizontal overflow at all sizes
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 4.9 Checkpoint - Ensure all dashboards render with glass aesthetic
  - Visual inspection: all dashboards use glass components
  - Verify no ad-hoc styling outside glass-* classes
  - Test responsive breakpoints on each dashboard
  - _Requirements: 14.1, 14.2, 14.3, 14.4_

---

## Phase 5: Animations & Micro-Interactions

### Objective
Implement smooth entrance animations, hover states, and loading states across all dashboards.

- [x] 5.1 Implement staggered entrance animations for stat card grids
  - Calculate stagger delay: index * 0.05 (50ms per item)
  - Apply fadeInUp entrance to each StatCardAnimated
  - Test with 3-column grid on desktop, 1-column on mobile
  - _Requirements: 7.5, 7.6, 12.1_

- [x] 5.2 Add hover elevation to stat cards
  - On hover: scale(1.02), translateY(-4px)
  - Apply smooth transition: 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)
  - Test hover response time < 100ms
  - _Requirements: 5.4, 12.5_

- [x] 5.3 Add hover elevation to table rows (glass-record)
  - On hover: background opacity increase, elevation increase
  - Transform: translateY(-2px)
  - Apply smooth transition
  - _Requirements: 12.5_

- [x] 5.4 Implement loading skeleton animations
  - Create LoadingSkeleton component with pulse effect
  - Apply pulse animation: opacity 0.5 → 1 → 0.5, repeat infinite, duration 2s
  - Use in tables, charts, and data-loading sections
  - _Requirements: 7.7, 12.1_

- [x] 5.5 Implement page entrance animations
  - All dashboard pages fade in on mount with 0.3s duration
  - Sections cascade in with 0.05s stagger delay
  - _Requirements: 7.3, 7.4_

- [x] 5.6 Test animation performance (60fps target)
  - Use browser DevTools Performance tab to measure frame rate
  - Test on target devices: Nexus 5 (mobile), MacBook Air (desktop)
  - Verify animations maintain 60fps minimum
  - Verify no jank or frame drops
  - _Requirements: 12.1, 12.2_

- [x] 5.7 Write performance tests for animation frame rate
  - **Property 5: All animations render at 60fps minimum**
  - **Validates: Requirements 12.1, 12.2_**
  - Measure frame rate during entrance animations, hover states, loading states

- [x] 5.8 Verify animations use GPU-accelerated properties only
  - Audit all animations: use only transform (translate, scale) and opacity
  - Never animate: width, height, top, left, margin, padding, font-size
  - Use will-change: transform on animated elements for GPU hint
  - _Requirements: 12.2, 12.4_

- [x] 5.9 Verify no layout shift during animations (CLS < 0.1)
  - Use Lighthouse CLS audit
  - Test entrance animations, hover states, and loading states
  - Ensure no elements reflow during animations
  - _Requirements: 12.3, 12.4_

- [x] 5.10 Checkpoint - Ensure all animations perform smoothly
  - Run performance tests for all animation types
  - Verify 60fps on target devices
  - Verify CLS < 0.1 for all scenarios
  - _Requirements: 12.1, 12.2, 12.3, 12.4_

---

## Phase 6: Accessibility Testing & Validation

### Objective
Verify WCAG AA compliance, keyboard navigation, focus management, and screen reader support across all 39 dashboards.

- [x] 6.1 Run axe-core automated accessibility audit on all dashboards
  - Install @axe-core/react or pa11y CLI
  - Run audit on each of 39 dashboards
  - Verify zero accessibility errors, zero violations
  - Document any warnings and remediate if possible
  - Export audit reports to docs/accessibility-audit-results/
  - _Requirements: 17.1_

- [x] 6.2 Verify keyboard Tab/Shift+Tab navigation
  - Test navigation: Tab moves forward, Shift+Tab moves backward
  - Verify focus order: top-to-bottom, left-to-right in DOM order
  - Test across all 39 dashboards
  - Document any focus order issues
  - _Requirements: 10.1, 10.2, 10.3_

- [x] 6.3 Test focus trap in modals (Escape closes)
  - Open GlassModal
  - Tab through focusable elements: focus should cycle within modal
  - Press Escape: modal closes, focus restores to previously active element
  - Test on all dashboards with modals
  - _Requirements: 10.6, 10.7_

- [x] 6.4 Validate contrast ratios (4.5:1 text, 3:1 graphics)
  - Use Lighthouse contrast audit or manual testing
  - Test all text: body, headings, secondary, muted
  - Verify Dark_Theme: white on #0d2520 = 15.8:1 ✓
  - Verify Dark_Theme muted: rgba(255,255,255,0.62) on #0d2520 = 4.8:1 ✓
  - Test Light_Theme contrast ratios
  - Test interactive elements: buttons, links, icons
  - Document all contrast measurements in contrast-matrix.md
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

- [x] 6.5 Test with screen readers (NVDA, JAWS, VoiceOver)
  - Install NVDA (Windows) and test ArchitectDashboard
  - Test macOS with VoiceOver
  - Verify:
    - Page title announced correctly
    - Heading hierarchy announced (h1 > h2 > h3)
    - Landmarks announced (<nav>, <main>, <aside>, <footer>)
    - Button labels announced (aria-label for icon-only buttons)
    - Modal dialog role announced with aria-modal
    - Form labels associated with inputs
  - Document any screen reader issues
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10_

- [x] 6.6 Verify semantic HTML (heading hierarchy, landmarks, ARIA)
  - Audit each dashboard:
    - Exactly one h1 (page title)
    - Multiple h2 (sections), h3/h4 (subsections) in hierarchical order
    - Semantic elements: <header>, <main>, <aside>, <footer>, <nav>, <section>
    - Form inputs have <label for="inputId"> or aria-label
    - Links with target="_blank" have aria-label="Opens in new window"
    - Icons-only buttons have aria-label
    - Tables have <thead> with <th scope="col"> and <tbody>
  - Use Firefox Accessibility Inspector to verify
  - Document any missing semantic elements
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9_

- [x] 6.7 Test focus ring visibility and focus management
  - Verify focus-visible-ring (outline: 3px solid var(--landing-accent)) renders
  - Verify focus ring contrast: accent on background >= 3:1
  - Test on all interactive elements: buttons, links, inputs, table rows, cards
  - Verify focus ring is never outline: none without alternative indicator
  - _Requirements: 10.3, 10.5, 10.9_

- [x] 6.8 Test minimum touch target size (44x44px on mobile)
  - Audit all interactive elements on mobile viewport (320px)
  - Verify buttons, links, inputs meet 44x44px minimum
  - Use DevTools touch simulation to verify
  - Document any elements below minimum
  - _Requirements: 8.9_

- [x] 6.9 Test for zero horizontal overflow at all viewport widths
  - Test viewports: 320px, 375px, 768px, 1024px, 1440px, 2560px, 3840px
  - Verify overflow-x: hidden or max-width: 100vw
  - No horizontal scrollbar at any size
  - _Requirements: 8.10_

- [x] 6.10 Write automated accessibility tests using jest-axe
  - Create test suite: src/__tests__/accessibility.test.ts
  - Test all 39 dashboards with axe-core
  - Verify zero errors, zero violations in each test
  - Test keyboard navigation with @testing-library/user-event
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

- [x] 6.11 Document accessibility findings and remediation plan
  - Create docs/ACCESSIBILITY_AUDIT_REPORT.md
  - List all findings (errors, warnings, manual tests)
  - Document contrast matrix (all color pairs, ratios, WCAG levels)
  - Include screenshots of axe-core results
  - List any known issues with remediation status
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

- [x] 6.12 Final checkpoint - Ensure all dashboards pass WCAG AA compliance
  - Run full accessibility audit on all 39 dashboards
  - Verify axe-core results: zero errors, zero violations
  - Verify keyboard navigation: Tab/Shift+Tab works
  - Verify contrast ratios: all >= 4.5:1 for text, 3:1 for graphics
  - Verify focus trap: Escape closes modals, focus restored
  - Verify semantic HTML: proper heading hierarchy and landmarks
  - Sign off on accessibility compliance
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

---

## Notes

### Task Organization
- Tasks are organized by phase with clear dependencies
- Tier 1 primitives (Phase 2) must complete before Tier 2 composites (Phase 3)
- Animations (Phase 2.5) can run in parallel with Phase 2 after Phase 1 completes
- Phase 3 must complete before Phase 4 (dashboard refactoring)
- Phase 4 and 5 can overlap after Phase 3 completes
- Phase 6 (accessibility) runs last after all components complete

### Testing Strategy
- Unit tests for each component (marked with `*` as optional sub-tasks)
- Property tests for critical system behavior (token round-trip, animation performance)
- Integration tests for dashboard-level functionality
- Accessibility tests using axe-core and manual screen reader testing
- Performance tests for 60fps animation target

### Optional vs. Required
- Core implementation tasks (no `*`) are required and will be executed
- All test sub-tasks are marked optional (`*`) and can be skipped for faster MVP
- Accessibility testing (Phase 6) is required for compliance

### Correctness Properties
The design document defines universal properties that enable property-based testing:

1. **Token round-trip consistency**: Tokens serialize and deserialize without data loss
2. **Glass fallback renders without layout shift**: Fallback glass styling matches original layout
3. **Theme switch updates all properties**: Theme toggle updates all CSS custom properties
4. **Animations respect prefers-reduced-motion**: Animations skip when user prefers reduced motion
5. **All animations render at 60fps minimum**: Animation performance meets 60fps target

### Files to Create
All component files follow the shadcn/ui pattern and are placed in `src/components/`:
- `ui/Glass*.tsx` — Tier 1 primitives (8 components)
- `animated/Glass*Animated.tsx` — Animated wrappers (3 components)
- `composite/Dashboard*.tsx` — Tier 2 composites (7 components)
- `navigation/RoleAware*.tsx`, `Breadcrumbs.tsx` — Navigation (3 components)
- `*Dashboard.tsx` — Dashboard pages (39 components, existing files being refactored)

### Related Requirements Coverage
- Requirement 1: Theme tokens ✓ (Phase 1.1, 1.2)
- Requirement 2: Glass system ✓ (Phase 1.3, 1.4)
- Requirement 3: Tier 1 primitives ✓ (Phase 2)
- Requirement 4: Tier 2 composites ✓ (Phase 3)
- Requirement 5: Role-aware sidebar ✓ (Phase 3.8, 3.9)
- Requirement 6: Breadcrumbs ✓ (Phase 3.9, 3.10)
- Requirement 7: Animations ✓ (Phase 2.5, Phase 5)
- Requirement 8: Responsive layout ✓ (Phase 4.6)
- Requirement 9: Contrast compliance ✓ (Phase 1.8, Phase 6.4)
- Requirement 10: Keyboard navigation ✓ (Phase 6.2, 6.3, 6.7)
- Requirement 11: Semantic HTML & ARIA ✓ (Phase 6.6)
- Requirement 12: Performance ✓ (Phase 5.6, 5.8, 5.9)
- Requirement 13: Light theme ✓ (Phase 1.6)
- Requirement 14: All 39 dashboards ✓ (Phase 4)
- Requirement 15: Error handling ✓ (Phase 1.4)
- Requirement 16: Token serialization ✓ (Phase 1.1)
- Requirement 17: Accessibility testing ✓ (Phase 6)

### Dependency Management
The dependency graph below shows execution waves for parallel task scheduling. Tasks within the same wave are independent and can run in parallel. Tasks in wave N depend only on tasks in waves 0..N-1.

---

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5"],
      "description": "Foundation: Theme tokens, glass CSS classes, fallback handling"
    },
    {
      "id": 1,
      "tasks": ["1.6", "1.7", "1.8", "2.5.1", "2.5.2", "2.5.3", "2.5.4"],
      "description": "Phase 1 completion: Theme switching, animation presets"
    },
    {
      "id": 2,
      "tasks": ["1.9", "2.1", "2.2", "2.3", "2.4", "2.5.5", "2.5.6", "2.5.7"],
      "description": "Tier 1 primitives: Buttons, inputs, cards, modals + animated wrappers"
    },
    {
      "id": 3,
      "tasks": ["2.6", "2.7", "2.8", "2.9", "2.10", "2.11", "2.5.8"],
      "description": "Unit tests for Tier 1 primitives and animations"
    },
    {
      "id": 4,
      "tasks": ["2.12", "2.13", "2.5.9", "3.1", "3.2", "3.3", "3.7", "3.8"],
      "description": "Additional primitives + Tier 2 composites start: dashboard sections, stat cards, charts"
    },
    {
      "id": 5,
      "tasks": ["3.4", "3.5", "3.6", "3.9", "3.10", "3.11", "3.12"],
      "description": "Unit tests and remaining Tier 2 components: navigation, breadcrumbs, Kanban"
    },
    {
      "id": 6,
      "tasks": ["3.13", "3.14", "3.15", "3.16", "3.17"],
      "description": "Tier 2 testing checkpoint"
    },
    {
      "id": 7,
      "tasks": ["4.1", "4.2", "4.3"],
      "description": "Refactor major dashboards: Architect, Admin, Client"
    },
    {
      "id": 8,
      "tasks": ["4.4", "4.5", "4.6"],
      "description": "Refactor remaining 36 dashboards + animations + responsive layouts"
    },
    {
      "id": 9,
      "tasks": ["4.7", "4.8", "4.9"],
      "description": "Dashboard integration testing checkpoint"
    },
    {
      "id": 10,
      "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5"],
      "description": "Animation micro-interactions: stagger, hover, loading, page entrance"
    },
    {
      "id": 11,
      "tasks": ["5.6", "5.7", "5.8", "5.9", "5.10"],
      "description": "Animation performance validation: 60fps, GPU acceleration, CLS"
    },
    {
      "id": 12,
      "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5"],
      "description": "Accessibility testing: axe-core, keyboard nav, focus trap, contrast, screen readers"
    },
    {
      "id": 13,
      "tasks": ["6.6", "6.7", "6.8", "6.9", "6.10"],
      "description": "Accessibility: semantic HTML, focus rings, touch targets, overflow"
    },
    {
      "id": 14,
      "tasks": ["6.11", "6.12"],
      "description": "Accessibility audit report + final compliance checkpoint"
    }
  ]
}
```

### Wave Summary

| Wave | Count | Phase | Focus |
|------|-------|-------|-------|
| 0-1 | 12 | Phase 1 | Foundation: tokens, glass CSS, theme switching |
| 2-4 | 15 | Phase 2 + 2.5 | Tier 1 primitives + animation presets |
| 5-6 | 9 | Phase 3 | Tier 2 composites + navigation |
| 7-9 | 9 | Phase 4 | Dashboard refactoring (all 39 pages) |
| 10-11 | 10 | Phase 5 | Animations & micro-interactions |
| 12-14 | 10 | Phase 6 | Accessibility testing & compliance |

**Total Leaf Tasks: 65** (including optional test sub-tasks)

### Critical Dependencies

1. **Phase 1 → Phase 2**: Theme tokens and glass CSS must exist before primitives
2. **Phase 2 → Phase 3**: Tier 1 primitives required before composing Tier 2
3. **Phase 2.5 → Phase 4**: Animation presets ready before dashboard entrance animations
4. **Phase 3 → Phase 4**: Tier 2 composites ready before dashboard refactoring
5. **Phase 4 → Phase 5**: Dashboards built before applying micro-interactions
6. **Phase 4 + 5 → Phase 6**: All components complete before accessibility testing

### Parallelization Strategy

- **Waves 0-1 (Foundation)**: Must run sequentially (tokens before glass, theme before animations)
- **Wave 2**: All Tier 1 components can build in parallel (no inter-component dependencies)
- **Wave 3**: All unit tests run in parallel
- **Wave 4**: Tier 2 components can build in parallel (depend only on Tier 1)
- **Wave 5-6**: Tier 2 testing in parallel
- **Waves 7-8**: Dashboard refactoring can run in parallel (each dashboard is independent)
- **Wave 10-11**: Micro-interactions can run in parallel
- **Waves 12-14**: Accessibility testing runs sequentially (builds on earlier testing)

### Estimated Effort

- **Phase 1**: 9 tasks × ~4 hours = ~36 hours
- **Phase 2**: 13 tasks × ~3 hours = ~39 hours
- **Phase 2.5**: 9 tasks × ~2 hours = ~18 hours
- **Phase 3**: 17 tasks × ~2.5 hours = ~42.5 hours
- **Phase 4**: 9 tasks × ~3 hours = ~27 hours
- **Phase 5**: 10 tasks × ~2 hours = ~20 hours
- **Phase 6**: 12 tasks × ~3 hours = ~36 hours

**Total: ~218.5 hours (~5.5 weeks at 40 hours/week with typical team velocity)**

---

## Success Criteria

✓ All theme tokens export and resolve correctly  
✓ All glass-* CSS classes render with proper backdrop-filter and fallbacks  
✓ All Tier 1 primitives pass unit tests with 90%+ coverage  
✓ All animations render at 60fps with no layout shift (CLS < 0.1)  
✓ All 39 dashboards use glass components consistently  
✓ All dashboards respond correctly at all viewport widths (320px–3840px)  
✓ Keyboard navigation works across all pages (Tab/Shift+Tab, Escape closes modals)  
✓ All text meets WCAG AA contrast minimum (4.5:1, Light & Dark themes)  
✓ Focus rings visible and consistent across all interactive elements  
✓ Semantic HTML correct (heading hierarchy, landmarks, ARIA labels)  
✓ Screen reader compatible (heading hierarchy, form labels, modal roles announced)  
✓ axe-core audit passes with zero errors, zero violations on all dashboards  
✓ Accessibility audit report documented  

