# Implementation Plan: Professional Fee Proposal Builder

## Overview

The Professional Fee Proposal Builder extends the existing fee engine (`src/services/professionalFee/`) with a React workspace UI, Firestore persistence, platform integration, SACAP complexity matrix, client estimation view, and admin source version management. The engine, profiles, proposal builder, terms library, guideline update service, and adapters are already implemented — this plan focuses on the UI layer, persistence wiring, platform spine integration, and property-based test coverage.

## Tasks

- [x] 1. Extend service layer with Firestore persistence and SACAP complexity matrix
  - [x] 1.1 Create Firestore persistence types and schemas for runs, proposals, source versions, and terms
    - Create `src/services/professionalFee/persistence/types.ts` with `FeeProposalRun`, `FeeProposalRecord`, `FeeSourceVersionRecord`, `FeeTermsTemplateRecord` interfaces matching the design data models
    - Create `src/services/professionalFee/persistence/schemas.ts` with Zod validation schemas for all persistence records
    - _Requirements: 1.10, 1.11, 5.1, 8.1, 8.5_

  - [x] 1.2 Implement the RunPersistenceService for saving, reopening, assigning, and exporting runs
    - Create `src/services/professionalFee/persistence/runPersistenceService.ts`
    - Implement `saveRun(input, result, userId, profession, sourceVersionId)` — creates immutable `FeeProposalRun` in Firestore `fee_proposal_runs/`
    - Implement `reopenRun(runId)` — creates new run with `version = original.version + 1`, `previousRunId = original.runId`, pre-populated inputs
    - Implement `assignToProject(runId, projectId)` — writes ProjectRecord entry via platform spine
    - Implement `exportRun(runId, format: 'pdf' | 'csv' | 'json')` — generates export file
    - Implement `listRuns(userId, profession?, projectId?)` — filtered listing
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ]* 1.3 Write property test for FeeInput serialization round-trip (Property 1)
    - **Property 1: FeeInput Serialization Round-Trip**
    - For any valid FeeInput (valid profession, non-negative projectValue, workCategorySplits summing to 1.0, well-formed stage/hourly/unit lines), JSON.stringify then JSON.parse produces deeply equivalent object
    - Use fast-check arbitrary to generate random valid FeeInput objects
    - **Validates: Requirements 1.11**

  - [ ]* 1.4 Write property test for RunRecord serialization round-trip (Property 2)
    - **Property 2: RunRecord Serialization Round-Trip**
    - For any valid FeeProposalRun (complete input/result, timestamps, source version ref), serializing to JSON and back produces deeply equivalent record
    - Use fast-check arbitrary building on FeeInput generator + metadata fields
    - **Validates: Requirements 8.5**

  - [ ]* 1.5 Write property test for stage weights sum invariant (Property 3)
    - **Property 3: Stage Weights Sum Invariant**
    - For any ProfessionProfile in the registry, sum of all stage.defaultWeight values equals 1.0 (within ±0.001 tolerance)
    - Iterate all 12 professions from ProfessionProfileRegistry
    - **Validates: Requirements 2.1**

  - [x] 1.6 Implement the SACAP complexity matrix data model and lookup service
    - Create `src/services/professionalFee/sacapComplexityMatrix.ts`
    - Implement `SACAPComplexityMatrix` type with categories containing building types mapped to complexity levels
    - Implement `lookupComplexity(categoryId, typeId): 'low' | 'medium' | 'high'` — single deterministic result
    - Implement `getCategories()` and `getTypesForCategory(categoryId)` for UI population
    - Seed demo-data matrix with categories: Residential Domestic, Residential Multi-Unit, Commercial, Industrial, Medical Social Services, Educational, Recreational, Religious, Agricultural
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 1.7 Write property test for SACAP complexity matrix total coverage (Property 10)
    - **Property 10: SACAP Complexity Matrix Total Coverage**
    - For any (categoryId, typeId) pair present in the matrix, lookup returns exactly one complexity level from {'low', 'medium', 'high'}
    - No valid pair produces undefined or multiple results
    - **Validates: Requirements 3.1, 3.3, 3.4**

  - [x] 1.8 Implement the SACAP gazetted fee table lookup with interpolation
    - Extend `src/services/professionalFee/feeEngine.ts` or create `src/services/professionalFee/sacapFeeTable.ts`
    - Implement `SACAPFeeTable` structured data: construction value bands mapped to fee percentages per complexity level (low, medium, high)
    - Implement `lookupFeePercentage(constructionValue, complexityLevel)` with linear interpolation within bands
    - Implement clamping to nearest band boundary when value exceeds published range (with warning)
    - Compute both "Project Fee" (full scope 100%) and "Scope of Work Fee" (selected stages proportion)
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.6_

  - [ ]* 1.9 Write property test for sliding scale monotonicity and interpolation (Property 4)
    - **Property 4: Sliding Scale Monotonicity and Interpolation**
    - For any two construction values a < b, the sliding scale fee for a ≤ fee for b (monotonically non-decreasing)
    - For any value v between two published breakpoints lo and hi, the fee at v is between fees at lo and hi
    - **Validates: Requirements 1.2, 15.2, 15.3**

  - [ ]* 1.10 Write property test for formula type consistency (Property 5)
    - **Property 5: Formula Type Consistency**
    - For any valid FeeInput and its corresponding ProfessionProfile, FeeCalculatorEngine.calculate() result has formulaType matching profile.preferredFormula
    - The guidelineProfessionalFee is non-negative
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9**

  - [ ]* 1.11 Write property test for stage weighting proportional calculation (Property 6)
    - **Property 6: Stage Weighting Proportional Calculation**
    - For any valid calculation where a subset of stages is selected, stageAdjustedFee = guidelineFee × sum(selectedStageWeights)
    - Matches SACAP "Scope of Work Fee" = "Project Fee" × stage proportion
    - **Validates: Requirements 2.2, 15.4**

  - [ ]* 1.12 Write property test for edited stage weights override defaults (Property 7)
    - **Property 7: Edited Stage Weights Override Defaults**
    - For any FeeInput where selectedStages[stageId].reductionPercentage > 0, resulting fee is strictly less than fee with reductionPercentage = 0 (all else equal)
    - **Validates: Requirements 2.4, 2.5**

- [x] 2. Checkpoint — Ensure engine-layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement discount validation, proposal persistence, and terms versioning
  - [x] 3.1 Implement discount validation logic in engine and proposal generation guard
    - Extend existing `FeeCalculatorEngine.calculate()` to explicitly throw when `discount.percentage > 0` and `discount.reason` is empty/whitespace
    - Implement proposal generation guard: reject proposal creation when discount has no reason
    - _Requirements: 3.8, 3.9, 3.10_

  - [ ]* 3.2 Write property test for discount reduces fee proportionally (Property 8)
    - **Property 8: Discount Reduces Fee Proportionally**
    - For any valid calculation where discount.percentage = p (0 < p ≤ 1) and non-empty reason, professionalFeeAfterDiscount = professionalFeeBeforeDiscount × (1 - p) within ±0.01
    - **Validates: Requirements 3.8**

  - [ ]* 3.3 Write property test for discount without reason rejected (Property 9)
    - **Property 9: Discount Without Reason Rejected**
    - For any FeeInput where discount.percentage > 0 and discount.reason is empty/whitespace, FeeCalculatorEngine.calculate() throws an error
    - **Validates: Requirements 3.9, 3.10**

  - [x] 3.4 Implement proposal persistence with immutability and versioning
    - Create `src/services/professionalFee/persistence/proposalPersistenceService.ts`
    - Implement `createDraft(runId, proposalInput)` — stores draft in Firestore `fee_proposals/`
    - Implement `issueProposal(proposalId, responsibilityConfirmed)` — sets status to 'issued', seals with audit hash, records issuedAt timestamp; rejects if responsibilityConfirmed is false
    - Implement `reviseProposal(proposalId)` — creates new version with `previousVersionId`, supersedes original
    - Implement `acceptProposal(proposalId)` — sets status to 'accepted', triggers platform spine events
    - Ensure issued proposals are immutable (no field mutations after issue)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [ ]* 3.5 Write property test for proposal immutability (Property 11)
    - **Property 11: Proposal Immutability**
    - For any issued ProposalDocument (status = 'issued'), auditHash is non-empty
    - Creating a revision produces a new document with different id while original fields remain unchanged
    - **Validates: Requirements 6.5, 6.6, 6.7**

  - [ ]* 3.6 Write property test for run immutability on reopen (Property 12)
    - **Property 12: Run Immutability on Reopen**
    - For any saved FeeProposalRun, reopening creates a new run with different runId, version = original.version + 1, previousRunId = original.runId
    - Original run fields remain unchanged
    - **Validates: Requirements 8.1, 8.2**

  - [ ]* 3.7 Write property test for professional responsibility gate (Property 13)
    - **Property 13: Professional Responsibility Gate**
    - For any proposal where responsibilityConfirmed = false, issuing is rejected (throws or returns error)
    - Only when responsibilityConfirmed = true does the issue action succeed
    - **Validates: Requirements 6.8, 13.3, 13.4**

  - [x] 3.8 Implement terms library persistence with versioning
    - Create `src/services/professionalFee/persistence/termsPersistenceService.ts`
    - Implement `getTemplates(professionTags?)` — list templates filtered by profession
    - Implement `editClause(templateId, clauseId, newText)` — creates new version with version + 1, previousVersionId = old id
    - Implement `setLegalReviewFlag(templateId, reviewedBy)` — marks template as legally reviewed
    - Preserve previous version as retrievable record
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 3.9 Write property test for terms versioning preserves history (Property 14)
    - **Property 14: Terms Versioning Preserves History**
    - For any terms template edit, a new version record is created with version = previous.version + 1, previousVersionId = previous.id
    - Previous version record remains retrievable and unchanged
    - **Validates: Requirements 7.3**

  - [x] 3.10 Implement source version management service
    - Create `src/services/professionalFee/persistence/sourceVersionService.ts`
    - Implement `createSourceVersion(data)` — creates new record with status 'draft' in Firestore `fee_source_versions/`
    - Implement `transitionStatus(id, newStatus, approvedBy?)` — handles demo-seed → draft → verified → retired transitions
    - Implement `importFeeTable(id, format: 'csv' | 'json', data)` — parses and validates structured fee table data
    - Implement `getActiveVersion(profession)` — returns most recent verified version
    - On verification, retire previously active version; on retirement, prevent use for new calculations
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10_

  - [ ]* 3.11 Write property test for source version recorded in every calculation (Property 15)
    - **Property 15: Source Version Recorded in Every Calculation**
    - For any FeeCalculationResult produced by the engine, sourceVersionId is non-empty and references an existing source version from the active ProfessionProfile
    - **Validates: Requirements 5.3**

- [-] 4. Checkpoint — Ensure persistence and validation tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement platform integration adapters
  - [ ] 5.1 Extend platform adapters for Project Passport, Action Centre, Appointment, and SpecForge
    - Extend `src/services/professionalFee/adapters.ts` with full platform spine integration
    - Implement `writeProposalToPassport(proposal, projectId)` — creates ProjectRecord entry in project's passport
    - Implement `createProposalInboxEvent(proposal, clientId)` — creates Action Centre inbox event with "Review and accept" action type
    - Implement `createAppointmentFromProposal(proposal, projectFacts)` — creates Appointment Draft and routes to Appointment workflow
    - Implement `seedSpecForgeFromProposal(proposal, projectId)` — seeds SpecForge specification items from proposal scope/stages
    - Implement `writeProposalAuditEntry(action, proposal)` — audit trail for create, issue, revise, accept
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ] 5.2 Implement guideline update monitoring Firestore persistence
    - Extend `src/services/professionalFee/guidelineUpdateService.ts` with Firestore persistence
    - Persist watch registry to Firestore `fee_guideline_watch/`
    - Persist change candidates to Firestore `fee_guideline_candidates/`
    - Wire approval flow to create inbox item for admin review
    - On approval, call `sourceVersionService.transitionStatus(id, 'verified', approvedBy)`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [ ] 6. Build the workspace shell and React context
  - [ ] 6.1 Create the FeeProposalBuilder root component and React context
    - Create `src/components/tools/FeeProposalBuilder/index.tsx` — accepts `user: UserProfile` and optional `projectId` prop
    - Create `src/components/tools/FeeProposalBuilder/FeeProposalBuilderContext.tsx` with `FeeProposalBuilderContextValue`: activeProfession, activeSourceVersion, calculatorState (useReducer), isDemoSeed flag
    - Implement calculator state reducer handling all input changes, stage toggles, weight edits, disbursement adds/removes
    - Default active profession based on user's registered role; fallback to no selection when role unrecognised
    - _Requirements: 10.1, 10.2, 10.3, 12.1, 12.2_

  - [ ] 6.2 Create the ProfessionSidebar navigation component
    - Create `src/components/tools/FeeProposalBuilder/ProfessionSidebar.tsx`
    - List all 12 professions with icons and display names
    - Include tool sections: Proposal Builder, Terms Library, Run History
    - Highlight active profession; handle profession switching via context
    - Use dark green glass panels, Space Grotesk headings, backdrop blur per SpecForge aesthetic
    - _Requirements: 12.3, 12.6_

  - [ ] 6.3 Create shared calculator UI components
    - Create `src/components/tools/FeeProposalBuilder/shared/DisclaimerBanner.tsx` — persistent "guideline calculator, not legal fee advice" banner
    - Create `src/components/tools/FeeProposalBuilder/shared/SourceVersionBadge.tsx` — demo-seed indicator with warning styling
    - Create `src/components/tools/FeeProposalBuilder/shared/ResultSummaryCard.tsx` — fee breakdown display with all result fields
    - Create `src/components/tools/FeeProposalBuilder/shared/DiscountPanel.tsx` — discount % input + mandatory reason field
    - Create `src/components/tools/FeeProposalBuilder/shared/DisbursementsEditor.tsx` — add/edit/remove disbursement line items
    - Create `src/components/tools/FeeProposalBuilder/shared/StatutoryFeesEditor.tsx` — add/edit/remove statutory fee line items
    - Create `src/components/tools/FeeProposalBuilder/shared/TariffOverridePanel.tsx` — editable hourly rates, discipline factors, percentages
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.4, 13.1, 13.2_

  - [ ] 6.4 Create shared StageWeightingPanel and SubTaskPanel components
    - Create `src/components/tools/FeeProposalBuilder/shared/StageWeightingPanel.tsx` — toggle stages on/off, edit weight percentages, show sum indicator
    - Create `src/components/tools/FeeProposalBuilder/shared/SubTaskPanel.tsx` — sub-task weights within architect stages per IDoW deliverable breakdown
    - Dispatch calculator state updates on toggle/edit; recalculate fee via engine on every change
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 7. Build profession-specific calculator workspace components
  - [ ] 7.1 Create the ArchitectCalculator workspace with SACAP complexity matrix
    - Create `src/components/tools/FeeProposalBuilder/calculators/ArchitectCalculator.tsx`
    - Implement SACAPComplexityMatrix UI: Building Category dropdown → Building Type dropdown → auto-determined complexity level display
    - Show complexity level description per IDoW (Low/Medium/High)
    - Allow complexity override with mandatory justification field
    - Include sub-task weighting panel (IDoW deliverable breakdown within stages)
    - Display "Project Fee Rate %" and "Scope of Work Fee Rate %" in results per SACAP terminology
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 15.4, 15.6_

  - [ ] 7.2 Create the EngineerCalculator workspace (shared for structural/civil/electrical/mechanical)
    - Create `src/components/tools/FeeProposalBuilder/calculators/EngineerCalculator.tsx`
    - Percentage-of-discipline-portion formula with configurable discipline percentage
    - Include editable discipline factor field with default from profile
    - Complexity selection appropriate to ECSA guidelines
    - Stage weighting panel with engineering stages
    - _Requirements: 1.3, 3.7, 4.2_

  - [ ] 7.3 Create the FireEngineerCalculator workspace
    - Create `src/components/tools/FeeProposalBuilder/calculators/FireEngineerCalculator.tsx`
    - Hybrid formula: base assessment fee + hourly rate for rational design work
    - Hourly line items editor for rational design hours
    - _Requirements: 1.4_

  - [ ] 7.4 Create the QuantitySurveyorCalculator workspace
    - Create `src/components/tools/FeeProposalBuilder/calculators/QuantitySurveyorCalc.tsx`
    - Three fee basis toggle: percentage of contract value, percentage of architect fee, time-based
    - Switching fee basis recalculates with appropriate formula
    - QS-specific stages from profile
    - _Requirements: 1.5_

  - [ ] 7.5 Create remaining profession calculators (TownPlanner, LandSurveyor, InteriorDesigner, CPM, LandscapeArchitect)
    - Create `src/components/tools/FeeProposalBuilder/calculators/TownPlannerCalculator.tsx` — hybrid: application-type fees + time-based
    - Create `src/components/tools/FeeProposalBuilder/calculators/LandSurveyorCalculator.tsx` — area/unit rates + beacon rates
    - Create `src/components/tools/FeeProposalBuilder/calculators/InteriorDesignerCalc.tsx` — design fee % + procurement markup on FF&E
    - Create `src/components/tools/FeeProposalBuilder/calculators/CPMCalculator.tsx` — three fee basis: % of construction value, % of team fees, monthly retainer
    - Create `src/components/tools/FeeProposalBuilder/calculators/LandscapeArchCalc.tsx` — percentage of cost formula
    - Each calculator uses shared StageWeightingPanel, DiscountPanel, DisbursementsEditor, ResultSummaryCard
    - _Requirements: 1.6, 1.7, 1.8, 1.9_

- [ ] 8. Checkpoint — Ensure workspace components render correctly
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Build the Proposal Builder, Terms Library, and Run History views
  - [ ] 9.1 Create the ProposalBuilderView with assembly workflow and responsibility gate
    - Create `src/components/tools/FeeProposalBuilder/proposal/ProposalBuilderView.tsx`
    - Implement proposal form: project details, client details, professional details, assumptions, exclusions, notes
    - Implement terms template selection from Terms Library
    - Implement custom clauses addition
    - Implement validity period (days) input
    - Create `src/components/tools/FeeProposalBuilder/proposal/ResponsibilityGate.tsx` — modal dialog requiring acknowledgement before issue
    - Create `src/components/tools/FeeProposalBuilder/proposal/ProposalPreview.tsx` — formatted preview before issue
    - Create `src/components/tools/FeeProposalBuilder/proposal/ProposalHistoryList.tsx` — versioned proposal list with status badges
    - Disable "Generate Proposal" button when discount applied without reason
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 13.3, 13.4_

  - [ ] 9.2 Create the TermsLibraryView with template browser and clause editor
    - Create `src/components/tools/FeeProposalBuilder/terms/TermsLibraryView.tsx` — template list filtered by profession
    - Create `src/components/tools/FeeProposalBuilder/terms/ClauseEditor.tsx` — inline clause text editing
    - Create `src/components/tools/FeeProposalBuilder/terms/TermsVersionHistory.tsx` — version timeline per template
    - Show legal review flag badge; allow marking as reviewed
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ] 9.3 Create the RunHistoryView with saved runs list, detail card, and export
    - Create `src/components/tools/FeeProposalBuilder/history/RunHistoryView.tsx` — list with filters (profession, date, project)
    - Create `src/components/tools/FeeProposalBuilder/history/RunDetailCard.tsx` — full input/output display for a saved run
    - Create `src/components/tools/FeeProposalBuilder/history/ExportDialog.tsx` — PDF/CSV/JSON export format selection
    - Implement "Reopen" action that creates new version pre-populated from saved run
    - Implement "Assign to Project" action linking run to a project passport
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [ ] 10. Build the Client Estimation View
  - [ ] 10.1 Create the ClientEstimationView with simplified inputs and aggregated results
    - Create `src/components/tools/FeeProposalBuilder/client/ClientEstimationView.tsx`
    - Implement simplified input form: estimated construction value, project type (residential/commercial/industrial/mixed-use), estimated area (m²), municipality
    - Delegate calculations to existing `feeEstimatorService.ts` soft-cost estimator logic
    - Display aggregated fee ranges per profession as summary table with individual line items + total
    - Display clear "indicative planning estimates only" disclaimer
    - Create `src/components/tools/FeeProposalBuilder/client/FeeComparisonTable.tsx` — show actual proposed fees alongside original estimate when proposals exist
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

- [ ] 11. Build the Admin Source Version Management views
  - [ ] 11.1 Create admin source version management UI
    - Create `src/components/tools/FeeProposalBuilder/admin/SourceVersionManager.tsx` — list source versions with status badges, create/verify/retire actions
    - Create `src/components/tools/FeeProposalBuilder/admin/FeeTableImporter.tsx` — CSV/JSON file upload, validation, preview before import
    - Create `src/components/tools/FeeProposalBuilder/admin/GuidelineMonitorPanel.tsx` — watch registry display, scan trigger, change candidate approval/dismiss
    - Display gazette reference (Board Notice number), effective date, content hash for each version
    - Admin-only access gating (platform_admin and admin roles)
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 11.1, 11.2, 11.3, 11.4_

- [ ] 12. Wire responsive layout, VAT toggle, and SpecForge aesthetic styling
  - [ ] 12.1 Implement responsive layout and SpecForge V2 aesthetic
    - Apply two-column form layouts collapsing to single-column below 900px viewport width
    - Apply SpecForge aesthetic throughout: dark green glass panels, Space Grotesk headings, subtle grid overlay, glass borders (`bg-surface-800/70 backdrop-blur border-surface-700/50`)
    - Implement VAT toggle (15% / 0%) in all calculator workspaces
    - Ensure tool renders inside Architex OS shell (header, mini-nav, content area) — no standalone shell
    - _Requirements: 4.6, 12.1, 12.2, 12.4, 12.5_

- [ ] 13. Register tool and wire API routes
  - [ ] 13.1 Register the Fee Proposal Builder in the toolbox registry and navigation
    - Add registry entry in `src/services/tools/` with `calculatorDefinitionId`, module grouping under "Proposal & Appointment", role access list
    - Add route entry in `src/navigation/architexNavigationConfig.ts` under Toolboxes > Proposal & Appointment
    - Wire lazy-loaded import in `App.tsx` for the FeeProposalBuilder component
    - _Requirements: 12.1, 12.3_

  - [ ] 13.2 Create Express API routes for fee proposal operations
    - Create `src/lib/fee-proposal-api-router.ts` (or extend api-router.ts) with all endpoints from design:
    - Source version routes: POST create, PATCH status transition, POST import (admin only)
    - Run routes: POST save, GET list, GET single, POST reopen, POST assign, POST export
    - Proposal routes: POST create draft, PATCH issue, PATCH accept, POST revise
    - Terms routes: GET list, POST create, PATCH edit
    - Guideline monitoring routes: GET watch list, POST scan trigger, POST approve (admin only)
    - Client estimation route: POST calculate
    - Wire into Express app in `api-server.ts` and `server.ts`
    - _Requirements: 5.6, 5.9, 8.1, 8.4, 6.1, 6.5, 7.1, 7.2, 11.1, 14.3_

- [ ] 14. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- The fee engine (`FeeCalculatorEngine`, `ProfessionProfileRegistry`, `ProposalBuilderService`, `TermsLibraryService`, adapters) already exists at `src/services/professionalFee/` — tasks extend rather than rewrite
- Property tests validate the 15 universal correctness properties defined in the design using `fast-check`
- Checkpoints ensure incremental validation at key boundaries
- The client estimation view delegates to the existing `feeEstimatorService.ts` per Requirement 14.6
- All components render inside the Architex OS shell and follow the SpecForge V2 aesthetic
- Source version management is admin-only; calculator workspaces serve all professional roles


## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.6"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5", "1.7", "1.8"] },
    { "id": 2, "tasks": ["1.9", "1.10", "1.11", "1.12"] },
    { "id": 3, "tasks": ["3.1", "3.4", "3.8", "3.10"] },
    { "id": 4, "tasks": ["3.2", "3.3", "3.5", "3.6", "3.7", "3.9", "3.11"] },
    { "id": 5, "tasks": ["5.1", "5.2"] },
    { "id": 6, "tasks": ["6.1", "6.2", "6.3", "6.4"] },
    { "id": 7, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5"] },
    { "id": 8, "tasks": ["9.1", "9.2", "9.3", "10.1"] },
    { "id": 9, "tasks": ["11.1", "12.1"] },
    { "id": 10, "tasks": ["13.1", "13.2"] }
  ]
}
```
