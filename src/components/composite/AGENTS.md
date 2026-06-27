# AGENTS.md — Tier 2 Composite Components

## Purpose

Dashboard-specific composite components that compose Tier 1 primitives (`src/components/ui/`) into reusable panels, stat cards, tables, and data displays. These are the building blocks used directly by the 39 canonical dashboard pages.

## Ownership

- **Path:** `src/components/composite/`
- **Owner:** Frontend / Design Systems Team
- **Key files:**
  - `DashboardSection.tsx` — Titled glass-panel section container with optional icon and action
  - `DashboardSection.test.tsx` — Unit tests for DashboardSection
  - `StatCard.tsx` — Metric tile with glass-tile class, trend indicator, and hover elevation
  - `StatCard.test.tsx` — Unit tests for StatCard
  - `GlassTable.tsx` — Generic data table with `glass-record` rows, loading, and empty states
  - `GlassTable.test.tsx` — Unit tests for GlassTable (jsdom environment)
  - `GlassChart.tsx` — SVG-based chart (line/bar/area/pie) wrapped in glass-panel with CSS custom property colors and glass-pill legend
  - `GlassChart.test.tsx` — Unit tests for GlassChart (18 tests, jsdom environment)
  - `GlassKanbanBoard.tsx` — Horizontal kanban board with glass-panel columns and glass-tile cards; non-DnD MVP (DnD wiring instructions in file comments)
  - `GlassKanbanBoard.test.tsx` — Unit tests for GlassKanbanBoard (17 tests, jsdom environment)

## Local Contracts

### Component Contract

Every composite component must:
- Compose Tier 1 primitives from `src/components/ui/` rather than re-implementing atomic styles
- Be generic where data types vary (e.g., `GlassTable<T>`)
- Accept and forward `className` for consumer overrides (via `cn()`)
- Support `isLoading` and `emptyState` patterns for async data
- Be keyboard-navigable and ARIA-compliant (interactive elements have roles, labels, and key handlers)

### GlassTable Contract

- `Column<T>` descriptor: `key`, `label`, optional `render` callback
- `GlassTableProps<T>`: `columns`, `rows`, `rowKey`, `onRowClick?`, `isLoading?`, `emptyState?`, `className?`
- Loading state: renders `"Loading..."` centered text with `aria-busy="true"` — no `<table>` rendered
- Empty state: renders `emptyState` prop or `"No records found"` — no `<table>` rendered
- Table: `<thead>` with `<th scope="col" class="font-semibold text-foreground-muted">`, `<tbody>` with `<tr class="glass-record">`
- Clickable rows: `role="button"`, `tabIndex=0`, Enter/Space keyboard handlers

### GlassChart Contract

- `GlassChartProps`: `title`, `chartType` (`'line'|'bar'|'pie'|'area'`), `data`, `height?` (default 300), `keys?` (default `['value']`), `className?`
- `GlassChartDataPoint`: `{ name: string; value: number; [key: string]: string | number }`
- Outer wrapper: `glass-panel` + `rounded-2xl` + `p-6`
- Title: `<h3>` with `font-heading font-semibold text-foreground`
- Chart region: `role="img"` with `aria-label` describing title and chart type
- Empty data: renders "No data available" message — no SVG rendered
- Colors reference CSS custom properties: `var(--secondary)`, `var(--primary)`, `var(--foreground)`, `var(--glass-border)`, `var(--card)`
- Legend: `role="list"` with `glass-pill` `role="listitem"` entries — one per series key (cartesian) or one per data point (pie)
- No external charting library required — uses lightweight inline SVG; can be replaced with Recharts or similar without API changes

### GlassKanbanBoard Contract

- `KanbanItem`: `{ id: string; title: string; description?: string; tag?: string }`
- `KanbanColumn`: `{ id: string; title: string; items: KanbanItem[] }`
- `KanbanDragResult`: `{ itemId: string; fromColumnId: string; toColumnId: string; newIndex: number }`
- `GlassKanbanBoardProps`: `columns`, `onDragEnd?`, `className?`
- Board: `role="region" aria-label="Kanban board"`, horizontal scroll wrapper
- Columns: `<section class="glass-panel">` with `<h3 class="font-heading font-bold">` header
- Cards: `<article class="glass-tile">` with `tabIndex=0` for keyboard focus
- Tags: rendered as `glass-pill` spans
- Empty column: renders "No items" placeholder
- Empty board: renders "No columns configured." message
- `onDragEnd` is accepted but no-op until a DnD library is installed (see file comments for wiring instructions for `@dnd-kit` or `react-beautiful-dnd`)

### Styling Rules

- Use `glass-*` CSS classes from `src/index.css` — no ad-hoc styling
- Follow Tailwind v4 conventions (tokens via CSS custom properties)

## Work Guidance

- Add new composites following the existing GlassTable pattern (generic, accessible, glass-styled)
- Test files live alongside components as `*.test.tsx`, run in jsdom via the component test batch
- Do not add Firebase/Firestore logic — composites are purely presentational
- Phase 3 of the UI/UX Overhaul spec (`.kiro/specs/ui-ux-overhaul-landing-aesthetic/`) defines all composites to be built here

## Verification

- `npx vitest run --environment jsdom src/components/composite/GlassTable.test.tsx`
- `npx vitest run --environment jsdom src/components/composite/GlassChart.test.tsx`
- All test files use `@testing-library/react` + `@testing-library/user-event` in jsdom

## Child DOX Index

No child AGENTS.md files below this directory.
