# Field Execution Feature Module

This module consolidates site execution and construction management tools (Site Diary, RFIs, Snags, Field Evidence, etc.).

## Structure

- `adapters/`: Adapters for reconciling tool outputs to project records.
- `components/`: UI components for field tools.
- `services/`: Business logic and data services.
- `types.ts`: Domain-specific type definitions.

## Migration Plan (Post 121-branch merge)

Existing site/forma tools currently in `src/components` and `src/services` will be moved here incrementally to establish clear module boundaries.

### Target Tools for Migration
- `SnagManager.tsx`
- `SiteDiaryService.ts`
- `FieldEvidenceService.ts`
- `RFIManager.tsx`
- `SiteInstructionManager.tsx`
