# Design Document: Professional Fee Proposal Builder

## Overview

The Professional Fee Proposal Builder is a multi-profession fee calculator and proposal generation tool that integrates into the Architex OS platform. It extends existing engine code from `src/services/professionalFee/` with a React workspace UI, Firestore persistence, platform integration, and SACAP complexity matrix.

## Architecture

Service Layer: `src/services/professionalFee/`
Component Layer: `src/components/tools/FeeProposalBuilder/`
Persistence: Firestore collections under `fee_proposal/` prefix

## Key Files

- `src/services/professionalFee/persistence/types.ts` — Firestore persistence types
- `src/services/professionalFee/persistence/schemas.ts` — Zod validation schemas
- `src/services/professionalFee/persistence/runPersistenceService.ts` — Run CRUD
- `src/services/professionalFee/persistence/proposalPersistenceService.ts` — Proposal lifecycle
- `src/services/professionalFee/persistence/termsPersistenceService.ts` — Terms versioning
- `src/services/professionalFee/persistence/sourceVersionService.ts` — Source version management
- `src/services/professionalFee/persistence/guidelineWatchPersistence.ts` — Guideline monitoring
- `src/services/professionalFee/sacapComplexityMatrix.ts` — SACAP complexity matrix
- `src/services/professionalFee/sacapFeeTable.ts` — SACAP fee table lookup
- `src/services/professionalFee/proposalGuard.ts` — Proposal eligibility validation
- `src/services/professionalFee/adapters.ts` — Platform spine integration
- `src/components/tools/FeeProposalBuilder/index.tsx` — Root component
- `src/components/tools/FeeProposalBuilder/FeeProposalBuilderContext.tsx` — React context
- `src/components/tools/FeeProposalBuilder/ProfessionSidebar.tsx` — Sidebar navigation
- `src/components/tools/FeeProposalBuilder/shared/` — Shared UI components
