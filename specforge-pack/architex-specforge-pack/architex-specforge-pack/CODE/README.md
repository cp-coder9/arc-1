# SpecForge Codebase

Working standalone implementation pack for the Architex specification tool.

## Run

```bash
npm test
npm run build
npm run serve
```

Then open the printed local URL, or open `dist/index.html` directly.

No external package install is required for tests/build/serve. This pack is intentionally dependency-light so Greg/Amy can inspect the domain logic before merging into `arc-1`.

## What is implemented

- Role-aware specification permissions.
- Sample architectural + interiors project spec.
- Pictorial document generator.
- Issue snapshot generation.
- Stale source / superseded item detection.
- Budget and lead-time risk summaries.
- OpenProject work-package payload mapper.
- Browser demo with filters, role view, approval panel and printable spec.

## Integration strategy

Use the standalone domain modules as the first pass. Then port to React/TypeScript using the drop-in files in `architex-dropins/`.

Recommended `arc-1` paths:

- `src/types/specforgeTypes.ts`
- `src/services/specforge/specforgeService.ts`
- `src/services/specforge/openProjectSpecBridge.ts`
- `src/components/specforge/SpecForgeWorkspace.tsx`
- `src/components/specforge/SpecForgePictorialDocument.tsx`
- `src/components/specforge/SpecForgeApprovalPanel.tsx`
- add registry entry in `src/services/tools/standaloneToolRegistry.ts`
- add route/page entry in `src/App.tsx` / navigation config where appropriate

## Test coverage

Run:

```bash
npm test
```

Tests cover permissions, immutable issue snapshots, stale source warnings, budget/lead-time summaries and OpenProject payload mapping.
