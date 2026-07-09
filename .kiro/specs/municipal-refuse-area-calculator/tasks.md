# Implementation Plan: Municipal Refuse Area Calculator

## Overview

Implement the Municipal Refuse Area Calculator as a workspace tool within Module 4 (Compliance + Municipal Readiness). The implementation proceeds from data models and pure calculation engine, through UI workspace components, to platform integration and PDF export. Property-based tests validate the calculation engine's correctness properties throughout.

## Tasks

- [x] 1. Set up project structure, interfaces, and data models
  - [x] 1.1 Create TypeScript interfaces and types for the refuse area calculator
    - Create `src/services/refuseArea/types.ts` with all interfaces: `Municipality_Profile`, `BinSize`, `BuildingInputs`, `ResidentialInputs`, `CommercialInputs`, `IndustrialInputs`, `MixedUseInputs`, `MixedUseComponent`, `BuildingType`, `WasteCategory`, `Refuse_Area_Result`, `ComponentArea`, `BinAllocation`, `VehicleAccessResult`, `VentilationResult`, `DrainageResult`, `Professional_Sign_Off_Record`
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 4.1, 4.4, 5.1, 6.1, 8.3_

  - [x] 1.2 Create Zod validation schemas for building inputs
    - Create `src/services/refuseArea/schemas.ts` with Zod schemas enforcing: numeric > 0, max 2 decimal places, within bounds (unit count 1–10,000, occupants 1–20, floor area 1–500,000, employees 1–50,000, occupant count 1–100,000), mixed-use requires at least 2 components
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

- [x] 2. Implement municipality profile service
  - [x] 2.1 Create municipality profile service with Firestore integration
    - Create `src/services/refuseArea/municipalityProfileService.ts`
    - Implement `listMunicipalities()` — fetches names + IDs from `refuse_municipality_profiles` collection
    - Implement `filterMunicipalities(searchText: string)` — case-insensitive substring filter (minimum 2 chars)
    - Implement `loadProfile(municipalityId: string)` — loads a single profile with 5-second timeout, retry support, and error handling
    - Implement fallback profile logic: when municipality not listed, offer generic fallback with notice
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [ ]* 2.2 Write property test for municipality filter
    - **Property 1: Municipality filter returns only matching results**
    - **Validates: Requirements 1.1**

  - [ ]* 2.3 Write unit tests for municipality profile service
    - Test profile loading, timeout/error handling, retry action, fallback profile selection, loading state management
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 3. Implement core calculation engine
  - [x] 3.1 Implement waste volume computation
    - Create `src/services/refuseArea/refuseAreaCalculatorService.ts`
    - Implement `computeRefuseArea(profile, inputs): Refuse_Area_Result` as a pure function
    - Implement Step 1: total waste volume calculation for residential (unitCount × litresPerUnitPerCycle), commercial (grossFloorArea × litresPerSqmPerCycle), industrial (grossFloorArea × category rate), and mixed-use (sum of component volumes)
    - _Requirements: 3.4, 3.5_

  - [ ]* 3.2 Write property test for volume computation
    - **Property 3: Volume computation follows rate formula**
    - **Validates: Requirements 3.4**

  - [x] 3.3 Implement bin calculation service
    - Create `src/services/refuseArea/binCalculationService.ts`
    - Implement bin count calculation: divide total volume by bin capacity, round up to ceiling
    - Implement bin size optimization: select size producing fewest bins within maxBinsPerCollectionPoint constraint
    - Implement waste stream separation: 70% general / 30% recyclable when profile.binStandards.separateWasteStreams is true
    - Compute floor space from bin count × per-bin footprint dimensions
    - Handle error case: zero volume or no bin sizes defined
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ]* 3.4 Write property tests for bin calculation
    - **Property 8: Bin count is ceiling of volume divided by capacity**
    - **Property 9: Bin size optimization selects fewest bins within constraint**
    - **Property 10: Waste stream separation conditional on profile**
    - **Property 11: Bin floor space equals sum of bin footprints**
    - **Validates: Requirements 4.1, 4.2, 4.4, 4.5**

  - [x] 3.5 Implement area and dimension computation
    - Implement Step 3: floor area = max(binFloorSpace × 1.3, profile.areaRequirements.minimumFloorArea), enforce 4.0 m² absolute minimum with `minimumApplied` flag
    - Implement Step 4: height = profile clearance height ?? 2.4m, width = ceil(sqrt(area) × 10) / 10, length = ceil((area / width) × 10) / 10
    - Implement mixed-use: sum individual component areas, return both component-level and combined total
    - Round total area to 2 decimal places, dimensions to nearest 0.1m
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6_

  - [ ]* 3.6 Write property tests for area computation
    - **Property 4: Mixed-use area is additive**
    - **Property 5: Minimum area enforcement**
    - **Property 6: Height default fallback**
    - **Property 7: Output precision**
    - **Validates: Requirements 2.5, 3.1, 3.2, 3.3, 3.5, 3.6**

  - [x] 3.7 Implement vehicle access, ventilation, drainage pass-through
    - Implement Step 5: direct pass-through of vehicle access fields from Municipality_Profile with `missingFields` array tracking null values
    - Implement ventilation pass-through with missingFields tracking
    - Implement drainage pass-through with missingFields tracking
    - Include pest control requirements (null = not specified)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 3.8 Write property tests for pass-through and missing fields
    - **Property 12: Profile pass-through correctness**
    - **Property 13: Missing profile fields are tracked**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5**

- [x] 4. Checkpoint — Ensure all calculation engine tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement input validation and formatting utilities
  - [x] 5.1 Implement input validation logic with inline error messages
    - Create `src/services/refuseArea/validationService.ts`
    - Implement field-level validation returning inline error messages: "Required", "Must be between X and Y", "Maximum 2 decimal places"
    - Validate that mixed-use has at least 2 components before allowing submission
    - _Requirements: 2.6, 2.7, 2.8, 2.9_

  - [ ]* 5.2 Write property test for input validation
    - **Property 2: Input validation accepts valid inputs and rejects invalid inputs**
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.6**

  - [x] 5.3 Implement date formatting utility
    - Create a utility function to format ISO 8601 dates as "DD MMM YYYY" (e.g., "30 Apr 2026")
    - Include in `src/services/refuseArea/formatUtils.ts`
    - _Requirements: 7.4_

  - [ ]* 5.4 Write property test for date formatting
    - **Property 14: Profile date formatted as DD MMM YYYY**
    - **Validates: Requirements 7.4**

- [x] 6. Implement professional sign-off and audit trail
  - [x] 6.1 Create sign-off service with audit trail integration
    - Create `src/services/refuseArea/signOffService.ts`
    - Implement `createSignOff(user, result, acknowledgementStatement)` → writes `Professional_Sign_Off_Record` to Firestore `refuse_sign_offs` collection
    - Emit immutable audit trail entry via `auditTrailService.createAuditEntry()` with: actorId, action ('refuse_area_sign_off'), sourceObjectId, metadata (municipalityName, buildingType, areaSqm, signOffTimestamp)
    - Gate downstream actions (save to Passport, export to SpecForge, export PDF) behind sign-off completion
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 6.2 Write property test for sign-off audit record completeness
    - **Property 15: Sign-off audit record completeness**
    - **Validates: Requirements 8.3**

  - [ ]* 6.3 Write unit tests for sign-off service
    - Test sign-off creation, audit trail emission, gate blocking when sign-off incomplete, gate allowing when completed
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 7. Implement platform integration service
  - [x] 7.1 Create refuse integration service for Project Passport and SpecForge
    - Create `src/services/refuseArea/refuseIntegrationService.ts`
    - Implement `saveToProjectPassport(result, signOff, projectId)` — writes ProjectRecord with recordType 'refuse_area_calculation', phase 'comply', within 5 seconds
    - Implement `pushToSpecForge(result, signOff, projectId)` — creates spec item with elementType 'refuse_room', specCategory 'compliance', within 5 seconds
    - Implement retry strategy: 3 attempts with exponential backoff (1s, 2s, 4s)
    - On final failure: create Action Centre alert with type 'failed_sync', targetModule, toolSource, message, resultId
    - Handle no active project context: disable Passport/SpecForge actions
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ]* 7.2 Write unit tests for integration service
    - Mock `projectPassportService.writeRecord()` and `specForgeService.addSpecItem()`, verify record shape and retry behaviour
    - Test Action Centre alert creation on failure after 3 retries
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 8. Implement PDF export service
  - [x] 8.1 Create refuse report PDF generation service
    - Create `src/services/refuseArea/refuseReportService.ts`
    - Implement `generateRefuseAreaPdf(result, signOff): Promise<Uint8Array>` using `pdf-lib`
    - Include all sections: header, project info, area summary, bin schedule table, vehicle access, ventilation, drainage, pest control, advisory disclaimer, sign-off record, footer with page numbers
    - Include full Advisory_Disclaimer text in the PDF
    - Handle export failure gracefully: return error, retain result panel state
    - _Requirements: 7.5, 7.6, 8.1_

  - [ ]* 8.2 Write unit tests for PDF export service
    - Verify generated PDF is valid (non-empty Uint8Array), verify content section inclusion
    - Test error handling on PDF generation failure
    - _Requirements: 7.5, 7.6_

- [x] 9. Checkpoint — Ensure all service-layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement UI workspace component
  - [x] 10.1 Create RefuseCalculatorWorkspace main component
    - Create `src/components/RefuseCalculatorWorkspace.tsx`
    - Accept props: `{ user: UserProfile; projectId?: string }`
    - Implement `useReducer` state management with `CalculatorState` interface
    - Render inside AppShell content area following Hero → Stat Row → Panels pattern
    - Hero: eyebrow "REFUSE AREA CALCULATOR", h1 project name or "New Calculation"
    - Stat Row: computed metrics (area m², bins, access width) — visible after computation
    - Use CSS token system (`.panel`, `.pill`, `.btn`, `.hero`, `.stat-card` classes)
    - _Requirements: 9.5, 9.8_

  - [x] 10.2 Implement MunicipalitySelector sub-component
    - Create searchable dropdown filtering municipality list (case-insensitive, min 2 chars)
    - Show loading indicator while profile loads, prevent form submission during load
    - Display error message with retry action on load failure/timeout
    - Display fallback profile notice when municipality not listed
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6_

  - [x] 10.3 Implement BuildingInputForm sub-component with conditional fields
    - Render Building_Type selector: Residential, Commercial, Industrial, Mixed-Use
    - Conditional input fields per type: residential (unit count, avg occupants), commercial (floor area, occupant count), industrial (floor area, employees, waste category), mixed-use (repeatable component groups, min 2)
    - Inline validation messages adjacent to invalid fields
    - Disable Calculate button when required fields empty or invalid
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

  - [x] 10.4 Implement ResultSummaryPanel sub-component
    - Display AreaDimensionsCard: total area (m²), dimensions (L×W×H), minimum applied notice
    - Display BinQuantityCard: bin quantity, capacity, total volume per waste stream, floor space
    - Display VehicleAccessCard: road width, turning circle, gradient, carry distance, hardstand
    - Display VentilationDrainageCard: type, sizing value, drainage gradient/diameter/wash-down
    - Display pest control requirements if specified
    - Display "not specified" notices with advisory language for missing profile fields
    - Display Advisory_Disclaimer persistently visible without scrolling
    - Display source municipality name and profile last updated date (DD MMM YYYY format)
    - _Requirements: 3.1, 3.2, 3.5, 3.6, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4_

  - [x] 10.5 Implement SignOffModal sub-component
    - Render as modal dialog blocking save/export actions until completed
    - Display mandatory checkbox with full acknowledgement text: (a) output is advisory only, (b) user has reviewed results, (c) professional verification remains user's responsibility
    - Confirm button disabled until checkbox selected
    - On dismiss without completion: display persistent notice that save/export unavailable
    - On completion: trigger sign-off record creation and enable downstream actions
    - _Requirements: 8.1, 8.2, 8.4, 8.5_

  - [x] 10.6 Implement ActionBar with Calculate, Export PDF, Save to Passport, Push to SpecForge
    - Calculate button triggers computation via `computeRefuseArea`
    - Export PDF button triggers `generateRefuseAreaPdf`, initiates download; show toast error on failure
    - Save to Passport button triggers `saveToProjectPassport`; show error badge on failure
    - Push to SpecForge button triggers `pushToSpecForge`; show error badge on failure
    - All export/save actions gated behind Professional_Sign_Off completion
    - Display project selection prompt when no active project context; disable Passport/SpecForge
    - _Requirements: 7.5, 7.6, 8.1, 8.4, 9.1, 9.2, 9.3, 9.4_

- [x] 11. Platform registration and routing
  - [x] 11.1 Register tool in platform navigation and lazy-load in App.tsx
    - Register in `src/navigation/toolNavRegistry.ts` with sections: Input, Calculation, Results
    - Register in `architexNavigationConfig.ts` under Compliance Hub / Toolboxes module
    - Add lazy-loaded route in `App.tsx` via `lazyWithChunkRetry`
    - _Requirements: 9.6, 9.7, 9.8_

- [x] 12. Checkpoint — Ensure all tests pass and UI renders correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Create design workshop HTML sample
  - [x] 13.1 Create self-contained design workshop HTML file
    - Create `MUNICIPAL_REFUSE_AREA_CALCULATOR_SAMPLE.html` at project root
    - Self-contained single file: all CSS and JS inlined, no external dependencies
    - Use Architex CSS token system (`:root` custom properties for colors, spacing, font)
    - Render 3-column AppShell grid (OS Nav 56px, Tool Nav 200px, Top Bar 36px, Content Area)
    - Place Calculator layout in Content Area following Hero → Stat Row → Panels pattern
    - Demonstrate full populated results state: municipality selector (City of Johannesburg selected), input form (24 units, 4 occupants/unit), results panel (computed dimensions, bin count, access/ventilation requirements), advisory disclaimer, professional sign-off gate
    - Must render correctly at minimum 1200px viewport width
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

- [x] 14. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (15 properties across 8 sub-tasks)
- Unit tests validate specific examples and edge cases
- The calculation engine is fully pure (no side effects) enabling comprehensive property-based testing
- All UI components use the Architex CSS token system and render inside the AppShell content area
- `pdf-lib` is already in the dependency tree — no new dependency installation needed
- `fast-check` + `vitest` used for property-based tests (minimum 100 iterations per property)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.5", "3.7"] },
    { "id": 4, "tasks": ["3.4", "3.6", "3.8", "5.1", "5.3"] },
    { "id": 5, "tasks": ["5.2", "5.4", "6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3", "7.1"] },
    { "id": 7, "tasks": ["7.2", "8.1"] },
    { "id": 8, "tasks": ["8.2", "10.1"] },
    { "id": 9, "tasks": ["10.2", "10.3"] },
    { "id": 10, "tasks": ["10.4", "10.5", "10.6"] },
    { "id": 11, "tasks": ["11.1", "13.1"] }
  ]
}
```
