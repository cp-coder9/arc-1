# Implementation Plan: Municipal Approval Readiness Workspace

## Overview

This implementation plan builds the Municipal Approval Readiness Workspace as a unified module within Module 4 (Compliance & Municipal Readiness). The workspace surfaces existing readiness infrastructure through a tabbed UI while adding four new engines: Land Use Scheme validation, Departmental Circulation Simulation, Submission Pack assembly, and Outcome Tracking. Implementation uses TypeScript with React 19, Vite 6, and the existing Architex platform patterns (shadcn/ui, Tailwind v4, Firebase/Firestore).

## Tasks

- [ ] 1. Set up type system and module scaffold
  - [ ] 1.1 Create `src/types/municipalWorkspace.ts` with all types defined in the design document (ZoneDefinition, DevelopmentParameters, ParkingRequirement, LandUseCheckInput, LandUseCheckResult, LandUseParameterCheck, DepartmentId, DepartmentAssessment, CirculationSimulationResult, SubmissionPackDocument, SubmissionPack, MunicipalReadyCertificate, ProfessionalSignOff, SubmissionOutcomeStatus, SubmissionOutcome)
    - _Requirements: 3.1, 4.1, 4.2, 5.1, 7.2, 8.1_
  - [ ] 1.2 Create empty service files in `src/services/municipal-workspace/` (landUseSchemeService.ts, circulationSimulatorService.ts, submissionPackService.ts, certificateService.ts, outcomeTrackingService.ts, workspaceOrchestratorService.ts) with exported function signatures and placeholder implementations
    - _Requirements: 3.3, 4.1, 5.1, 7.1, 8.1, 9.1_
  - [ ] 1.3 Create empty component files in `src/components/municipal-workspace/` (MunicipalApprovalWorkspace.tsx, OverviewTab.tsx, LandUseCheckTab.tsx, CirculationSimulatorTab.tsx, SubmissionPackTab.tsx, CertificateTab.tsx, OutcomeTrackingTab.tsx) with basic component shells
    - _Requirements: 1.1, 1.2_
  - [ ] 1.4 Verify the scaffold compiles with zero TypeScript errors (`npm run lint`)
    - _Requirements: 1.1_

- [ ] 2. Implement Land Use Scheme data and service
  - [ ] 2.1 Create `src/data/land-use-schemes/index.ts` with the scheme registry lookup function and ZoneDefinition[] storage structure
    - _Requirements: 3.1, 3.2_
  - [ ] 2.2 Create `src/data/land-use-schemes/coj-zones.ts` with structured zoning data for City of Johannesburg (minimum 5 common zone types: Single Residential 1-2, General Residential, General Business, Industrial)
    - _Requirements: 3.1, 3.2_
  - [ ] 2.3 Create `src/data/land-use-schemes/coct-zones.ts` with structured zoning data for City of Cape Town (minimum 5 common zone types)
    - _Requirements: 3.1, 3.2_
  - [ ] 2.4 Create `src/data/land-use-schemes/tshwane-zones.ts` with structured zoning data for City of Tshwane (minimum 5 common zone types)
    - _Requirements: 3.1, 3.2_
  - [ ] 2.5 Implement `landUseSchemeService.ts`: validateLandUse(), findZoneDefinition(), listZones(), calculateRequiredParking()
    - _Requirements: 3.3, 3.4, 3.5, 3.6_
  - [ ]* 2.6 Write unit tests for landUseSchemeService covering: pass case (all within limits), fail case (coverage exceeds), zone_not_found case, parking calculation, consent use detection
    - _Requirements: 3.3, 3.4, 3.5, 3.6_
  - [ ]* 2.7 Write property test for Land Use Validation Invariant
    - **Property 1: Land Use Validation Invariant**
    - **Validates: Requirements 3.3, 3.4, 3.6**
  - [ ]* 2.8 Write property test for Zone Lookup Idempotence
    - **Property 8: Zone Lookup Idempotence**
    - **Validates: Requirements 3.1, 3.2**

- [ ] 3. Checkpoint - Verify land use service
  - Ensure all tests pass (`npm test`), ask the user if questions arise.

- [ ] 4. Implement Departmental Circulation Simulator service
  - [ ] 4.1 Implement Town Planning department assessment (integrates with Land Use check results)
    - _Requirements: 4.1, 4.6_
  - [ ] 4.2 Implement Building Control department assessment (integrates with existing NBR/SANS precheck results)
    - _Requirements: 4.1, 4.5_
  - [ ] 4.3 Implement Fire Department assessment (integrates with existing fire compliance calculator outputs)
    - _Requirements: 4.1, 4.5_
  - [ ] 4.4 Implement Water & Sanitation department assessment (uses drainage/stormwater check results)
    - _Requirements: 4.1_
  - [ ] 4.5 Implement Roads & Transport, Electrical, Environmental, and Heritage department assessments (data-gap-driven with trigger detection)
    - _Requirements: 4.1, 4.3_
  - [ ] 4.6 Implement `simulateCirculation()` orchestrator that runs all 8 departments and computes overall confidence
    - _Requirements: 4.1, 4.2, 4.4_
  - [ ]* 4.7 Write unit tests for circulationSimulatorService covering: full pass scenario, partial data gaps reduce score, department-specific action item generation
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [ ]* 4.8 Write property test for Confidence Score Bounds and Formula
    - **Property 2: Confidence Score Bounds and Formula**
    - **Validates: Requirements 4.2**
  - [ ]* 4.9 Write property test for Data Gap Score Reduction
    - **Property 3: Data Gap Score Reduction**
    - **Validates: Requirements 4.3**

- [ ] 5. Checkpoint - Verify circulation simulator
  - Ensure all tests pass (`npm test`), ask the user if questions arise.

- [ ] 6. Implement Submission Pack Builder service
  - [ ] 6.1 Implement `determineRequiredDocuments()` using existing municipal checklist data from saContextService
    - _Requirements: 5.1_
  - [ ] 6.2 Implement `assembleSubmissionPack()` that maps project scope facts and drawing register to pack documents with status detection
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6_
  - [ ] 6.3 Implement `validateCrossReferences()` for form-to-appointment and drawing-to-index consistency checks
    - _Requirements: 5.9_
  - [ ] 6.4 Implement `exportPack()` that generates the pack manifest with cover sheet and table of contents
    - _Requirements: 5.7, 5.8_
  - [ ]* 6.5 Write unit tests for submissionPackService covering: complete pack assembly, missing document flagging, cross-reference error detection, correct document ordering
    - _Requirements: 5.1, 5.5, 5.6, 5.9_
  - [ ]* 6.6 Write property test for Submission Pack Completeness Invariant
    - **Property 5: Submission Pack Completeness Invariant**
    - **Validates: Requirements 5.4, 5.6**
  - [ ]* 6.7 Write property test for Cross-Reference Consistency
    - **Property 6: Cross-Reference Consistency**
    - **Validates: Requirements 5.9**

- [ ] 7. Implement Certificate and Outcome Tracking services
  - [ ] 7.1 Implement `checkCertificatePrerequisites()` with all four gate conditions (readiness score 100, sign-offs complete, pack complete, department scores ≥ 70)
    - _Requirements: 7.1, 7.6_
  - [ ] 7.2 Implement `generateCertificate()` with unique certificate number generation and advisory disclaimer
    - _Requirements: 7.2, 7.3, 7.4, 7.5_
  - [ ] 7.3 Implement `recordSubmission()` and `updateOutcome()` in outcomeTrackingService
    - _Requirements: 8.1, 8.2, 8.3_
  - [ ] 7.4 Implement `calculateApprovalRate()` and `getProjectOutcomes()` in outcomeTrackingService
    - _Requirements: 8.4, 8.5, 8.6_
  - [ ]* 7.5 Write unit tests for certificateService covering: prerequisites not met (each condition), prerequisites met generates certificate, certificate contains advisory disclaimer
    - _Requirements: 7.1, 7.3, 7.6_
  - [ ]* 7.6 Write unit tests for outcomeTrackingService covering: record/update cycle, approval rate calculation, empty outcomes edge case
    - _Requirements: 8.1, 8.2, 8.4_
  - [ ]* 7.7 Write property test for Certificate Prerequisites Gate
    - **Property 4: Certificate Prerequisites Gate**
    - **Validates: Requirements 7.1, 7.6**
  - [ ]* 7.8 Write property test for Outcome Approval Rate Calculation
    - **Property 7: Outcome Approval Rate Calculation**
    - **Validates: Requirements 8.4**

- [ ] 8. Checkpoint - Verify certificate and outcome services
  - Ensure all tests pass (`npm test`), ask the user if questions arise.

- [ ] 9. Implement Workspace Orchestrator and integration
  - [ ] 9.1 Implement `workspaceOrchestratorService.ts` that coordinates existing readiness pipeline with new land use, circulation, and pack services
    - _Requirements: 2.1, 9.1, 9.2_
  - [ ] 9.2 Implement `persistWorkspaceResults()` that writes assessment snapshots to Project Passport
    - _Requirements: 2.6, 9.2_
  - [ ] 9.3 Implement `generateWorkspaceActions()` that creates Action Centre inbox events from blockers and overdue sign-offs
    - _Requirements: 2.7, 9.3_
  - [ ]* 9.4 Write unit tests for workspaceOrchestratorService covering: full orchestration flow, action generation from blockers, integration with existing readiness pipeline output
    - _Requirements: 2.1, 9.1, 9.3_

- [ ] 10. Implement UI — Main Workspace Component and Overview Tab
  - [ ] 10.1 Implement `MunicipalApprovalWorkspace.tsx` with header card, advisory banner, tab navigation (Overview, Land Use, Simulation, Pack, Certificate, Outcomes), project context resolution, and role-based access guard
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 10.1, 10.3_
  - [ ] 10.2 Implement `OverviewTab.tsx` with overall readiness score display, per-category score cards, blockers list, complexity classification, and professional team routing display
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [ ] 10.3 Wire workspace into App.tsx route configuration at `/compliance/municipal-approval-workspace` with correct role access list
    - _Requirements: 1.1, 1.5_
  - [ ] 10.4 Verify component renders without errors and TypeScript compiles cleanly
    - _Requirements: 1.1_

- [ ] 11. Implement UI — Land Use Check and Circulation Simulator Tabs
  - [ ] 11.1 Implement `LandUseCheckTab.tsx` with input form (municipality, zone code, proposed values), zone selection, results display showing pass/fail per parameter with excess amounts
    - _Requirements: 3.3, 3.4, 3.5, 3.7_
  - [ ] 11.2 Implement `CirculationSimulatorTab.tsx` with horizontal bar chart showing 8 department confidence scores, colour-coded (green ≥70, amber 40–69, red <40), action items per department, and advisory disclaimer
    - _Requirements: 4.7, 4.8_
  - [ ] 11.3 Verify both tabs render correctly with mock data and TypeScript compiles cleanly
    - _Requirements: 3.7, 4.7_

- [ ] 12. Implement UI — Submission Pack, Certificate, and Outcome Tabs
  - [ ] 12.1 Implement `SubmissionPackTab.tsx` with document list (status badges), missing items section, cross-reference errors, cover sheet preview, and export button
    - _Requirements: 5.1, 5.6, 5.7, 5.8, 5.9_
  - [ ] 12.2 Implement `CertificateTab.tsx` with prerequisites checklist, sign-off status panel, generate button (disabled until prerequisites met), and generated certificate display
    - _Requirements: 6.5, 7.1, 7.6_
  - [ ] 12.3 Implement `OutcomeTrackingTab.tsx` with submission recording form, outcome update form, timeline view of submissions, and first-time approval rate statistic
    - _Requirements: 8.1, 8.2, 8.4, 8.5_
  - [ ] 12.4 Verify all tabs render correctly and TypeScript compiles cleanly
    - _Requirements: 5.1, 7.1, 8.1_

- [ ] 13. Create Design Workshop HTML sample
  - [ ] 13.1 Create `MUNICIPAL_APPROVAL_WORKSPACE_SAMPLE.html` at project root — a self-contained design workshop file showing the full workspace UI with all 6 tabs, using the Architex dark theme aesthetic, glass cards, horizontal bar charts for circulation simulation, and realistic South African project data (based on SpecForge UI patterns)
    - _Requirements: 1.2, 4.7, 10.3_
  - [ ] 13.2 Verify the HTML file opens correctly in a browser and displays all tab states
    - _Requirements: 1.2_

- [ ] 14. Final integration and verification
  - [ ] 14.1 Run full type check (`npm run lint`) — zero errors
    - _Requirements: 1.1_
  - [ ] 14.2 Run full test suite (`npm test`) — all tests pass
    - _Requirements: 3.3, 4.1, 5.1, 7.1, 8.1_
  - [ ] 14.3 Run production build (`npm run build`) — builds successfully
    - _Requirements: 1.1_
  - [ ] 14.4 Verify workspace is accessible from navigation and renders all tabs with project data
    - _Requirements: 1.1, 1.2, 1.3_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (using fast-check)
- Unit tests validate specific examples and edge cases (using Vitest)
- All services follow typed error returns (discriminated unions) rather than thrown exceptions
- The design workshop HTML file serves as a visual reference for React implementation
- Integration with Project Passport, Action Centre, and SpecForge is wired through the workspace orchestrator

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4", "2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4"] },
    { "id": 4, "tasks": ["2.5"] },
    { "id": 5, "tasks": ["2.6", "2.7", "2.8"] },
    { "id": 6, "tasks": ["4.1", "4.2", "4.3", "4.4", "4.5"] },
    { "id": 7, "tasks": ["4.6"] },
    { "id": 8, "tasks": ["4.7", "4.8", "4.9", "6.1"] },
    { "id": 9, "tasks": ["6.2", "6.3", "6.4"] },
    { "id": 10, "tasks": ["6.5", "6.6", "6.7", "7.1", "7.3"] },
    { "id": 11, "tasks": ["7.2", "7.4"] },
    { "id": 12, "tasks": ["7.5", "7.6", "7.7", "7.8"] },
    { "id": 13, "tasks": ["9.1"] },
    { "id": 14, "tasks": ["9.2", "9.3"] },
    { "id": 15, "tasks": ["9.4", "10.1", "10.2"] },
    { "id": 16, "tasks": ["10.3"] },
    { "id": 17, "tasks": ["10.4", "11.1", "11.2"] },
    { "id": 18, "tasks": ["11.3", "12.1", "12.2", "12.3"] },
    { "id": 19, "tasks": ["12.4", "13.1"] },
    { "id": 20, "tasks": ["13.2"] },
    { "id": 21, "tasks": ["14.1", "14.2"] },
    { "id": 22, "tasks": ["14.3"] },
    { "id": 23, "tasks": ["14.4"] }
  ]
}
```
