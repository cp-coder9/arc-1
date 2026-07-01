# Implementation Plan: Professional Fee Proposal Builder

## Overview

The Professional Fee Proposal Builder extends the existing fee engine (`src/services/professionalFee/`) with a React workspace UI, Firestore persistence, platform integration, SACAP complexity matrix, client estimation view, and admin source version management.

## Tasks

- [x] 1. Extend service layer with Firestore persistence and SACAP complexity matrix
  - [x] 1.1 Create Firestore persistence types and schemas for runs, proposals, source versions, and terms
  - [x] 1.2 Implement the RunPersistenceService for saving, reopening, assigning, and exporting runs
  - [x] 1.6 Implement the SACAP complexity matrix data model and lookup service
  - [x] 1.8 Implement the SACAP gazetted fee table lookup with interpolation

- [x] 2. Checkpoint — Ensure engine-layer tests pass

- [x] 3. Implement discount validation, proposal persistence, and terms versioning
  - [x] 3.1 Implement discount validation logic in engine and proposal generation guard
  - [x] 3.4 Implement proposal persistence with immutability and versioning
  - [x] 3.8 Implement terms library persistence with versioning
  - [x] 3.10 Implement source version management service

- [x] 4. Checkpoint — Ensure persistence and validation tests pass

- [x] 5. Implement platform integration adapters
  - [x] 5.1 Extend platform adapters for Project Passport, Action Centre, Appointment, and SpecForge
  - [x] 5.2 Implement guideline update monitoring Firestore persistence

- [x] 6. Build the workspace shell and React context
  - [x] 6.1 Create the FeeProposalBuilder root component and React context
  - [x] 6.2 Create the ProfessionSidebar navigation component
  - [x] 6.3 Create shared calculator UI components
  - [x] 6.4 Create shared StageWeightingPanel and SubTaskPanel components

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

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 7, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5"] },
    { "id": 8, "tasks": ["9.1", "9.2", "9.3", "10.1"] },
    { "id": 9, "tasks": ["11.1", "12.1"] },
    { "id": 10, "tasks": ["13.1", "13.2"] }
  ]
}
```
