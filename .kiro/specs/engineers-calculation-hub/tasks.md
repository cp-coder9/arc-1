# Implementation Plan: Engineer's Calculation Hub

## Overview

Implement the Engineer's Calculation Hub as a multi-discipline engineering calculator workspace within the Architex Compliance Hub module. The implementation follows a bottom-up approach: core types and interfaces first, then data constants, engine functions per discipline, service layer (persistence, PDF, integration), and finally the workspace UI component. Property-based tests validate correctness properties alongside each implementation step.

## Tasks

- [x] 1. Set up project structure, core types, and interfaces
  - [x] 1.1 Create core types and interfaces module
    - Create `src/services/calcHub/types.ts` with all shared types: `PassFailStatus`, `DerivationStep`, `CalculatorOutput`, `DisciplineGroup`, `CalcHubCalculatorMeta`, `CalcHubCalculator<TInput>`, `CalcHubSessionState`
    - Export the `SteelSection` interface for typed section data
    - _Requirements: 3.1, 3.4, 3.5, 3.6, 3.7, 3.8, 1.4_

  - [x] 1.2 Create directory structure and barrel exports
    - Create directories: `src/services/calcHub/engines/`, `src/services/calcHub/schemas/`, `src/services/calcHub/data/`
    - Create `src/services/calcHub/index.ts` barrel export
    - _Requirements: 3.1_

  - [x] 1.3 Create calculator registry module
    - Create `src/services/calcHub/calcHubRegistry.ts` implementing a registry that stores `CalcHubCalculator` objects and provides lookup by ID, filter by discipline
    - Include `registerCalculator()`, `getCalculator()`, `getCalculatorsByDiscipline()` functions
    - _Requirements: 19.1, 19.4, 19.5_

  - [ ] 1.4 Write unit tests for core types and registry
    - Test registry registration, lookup, and filtering
    - Test that registry rejects duplicate IDs
    - _Requirements: 19.4, 19.5_

- [x] 2. Implement data constants
  - [x] 2.1 Create steel section data
    - Create `src/services/calcHub/data/steelSections.ts` with SA Red Book I/H section properties (203x133UB25 through 610x229UB125) as a typed `SteelSection[]` constant
    - Include all required properties: d, bf, tf, tw, Ix, Iy, Zx, Sx, rx, ry, A, mass
    - _Requirements: 2.5, 8.1, 8.6_

  - [x] 2.2 Create material and structural data constants
    - Create `src/services/calcHub/data/materialDensities.ts` with 20+ construction materials
    - Create `src/services/calcHub/data/concreteGrades.ts` with Grade 25–50 characteristic strengths
    - Create `src/services/calcHub/data/imposedLoads.ts` with SANS 10160-2 occupancy loads table
    - _Requirements: 12.4, 18.2_

  - [x] 2.3 Create pipe, fire, and fixture data constants
    - Create `src/services/calcHub/data/pipeSizes.ts` with standard pipe diameters (copper, steel, PVC)
    - Create `src/services/calcHub/data/fireDistances.ts` with SANS 10400-T travel distance limits
    - Create `src/services/calcHub/data/fixtureUnits.ts` with SANS 10252-1 fixture unit values
    - _Requirements: 15.1, 17.1, 17.4_

  - [x] 2.4 Create unit conversion data
    - Create `src/services/calcHub/data/unitConversions.ts` with conversion factors for 18+ categories (length, area, volume, mass, force, pressure, moment, velocity, flow, temperature, density, power, etc.)
    - _Requirements: 18.1_

  - [ ] 2.5 Write unit tests for data constants
    - Verify steel sections array contains all required sections
    - Verify material densities has 20+ entries
    - Verify unit conversion covers 18+ categories
    - _Requirements: 2.5, 18.1, 18.2_

- [x] 3. Implement Zod input schemas
  - [x] 3.1 Create structural steel and concrete schemas
    - Create `src/services/calcHub/schemas/steelDesign.ts` with schemas for beam, column, bolt, weld, base plate, profile comparator inputs
    - Create `src/services/calcHub/schemas/concreteDesign.ts` with schemas for beam, slab, column, anchorage, crack width, min rebar inputs
    - Include SA-standard defaults, min/max ranges, step increments
    - _Requirements: 2.1, 2.2, 2.5, 2.6, 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 3.2 Create timber, geotechnical, and loading schemas
    - Create `src/services/calcHub/schemas/timberDesign.ts` with beam, compression, connection schemas
    - Create `src/services/calcHub/schemas/geotechnical.ts` with bearing capacity, pad footing, retaining wall, pile schemas
    - Create `src/services/calcHub/schemas/loading.ts` with wind, seismic, load combinations, imposed load schemas
    - _Requirements: 2.1, 2.2, 10.1, 10.2, 10.3, 11.1, 11.2, 11.3, 11.4, 12.1, 12.2, 12.3, 12.4_

  - [x] 3.3 Create stormwater, HVAC, and fire schemas
    - Create `src/services/calcHub/schemas/stormwater.ts` with rational method, pipe sizing, attenuation schemas
    - Create `src/services/calcHub/schemas/ductSizing.ts` with round/rect duct, chilled water pipe, fan, heat gain/loss schemas
    - Create `src/services/calcHub/schemas/fireEngineering.ts` with travel distance, exit width, occupant load, fire rating, fire flow, hydrant, pump schemas
    - _Requirements: 2.1, 2.2, 13.1, 13.2, 13.3, 14.1, 14.2, 14.3, 14.4, 14.5, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7_

  - [x] 3.4 Create electrical, wet services, and utilities schemas
    - Create `src/services/calcHub/schemas/electrical.ts` with cable sizing, voltage drop, short circuit, max demand schemas
    - Create `src/services/calcHub/schemas/wetServices.ts` with cold/hot water pipe, pressure drop, drainage, vents, geyser, solar, circulation schemas
    - Create `src/services/calcHub/schemas/utilities.ts` with unit conversion, material density lookup, section properties schemas
    - _Requirements: 2.1, 2.2, 16.1, 16.2, 16.3, 16.4, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 17.9, 18.1, 18.2, 18.3_

  - [ ] 3.5 Write property tests for input schema validation
    - **Property 3: Input Validation Rejects Invalid Values**
    - Generate arbitrary invalid inputs (out-of-range numbers, missing fields, wrong types) and verify Zod rejects them
    - **Validates: Requirements 2.2, 2.3, 2.4**

- [x] 4. Implement structural calculator engines
  - [x] 4.1 Implement steel design engine
    - Create `src/services/calcHub/engines/steelDesign.ts` with pure compute functions for: beam (Mu, Mr, Vr, deflection), column buckling (KL/r, Fe, λn, Cr with n=1.34), bolted connections, weld capacity, base plate, profile comparator
    - Each function returns `CalculatorOutput` with full derivation steps and SANS 10162-1 references
    - Register each calculator with the hub registry
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ] 4.2 Write property tests for steel beam moment resistance
    - **Property 7: Steel Beam Moment Resistance Follows Formula**
    - For any valid steel beam input, verify Mr = φ·fy·Sx/1000 within 0.01 kNm tolerance
    - **Validates: Requirements 8.1**

  - [ ] 4.3 Write property tests for column buckling formula
    - **Property 10: Column Buckling Uses Correct Curve Parameter**
    - For any valid column input with hot-rolled W-shape, verify n=1.34 and Cr follows SANS 10162-1 §13.3
    - **Validates: Requirements 8.2**

  - [x] 4.4 Implement concrete design engine
    - Create `src/services/calcHub/engines/concreteDesign.ts` with pure compute functions for: beam (Mu, z, As), slab (one-way/two-way), column (short/slender classification, interaction), anchorage/lap lengths, crack width (acr method), minimum reinforcement
    - Each function returns `CalculatorOutput` with SANS 10100-1 references
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 4.5 Implement timber design engine
    - Create `src/services/calcHub/engines/timberDesign.ts` with pure compute functions for: beam (bending, shear, deflection, bearing), compression members (buckling), connections (bolt/nail capacities)
    - Each function returns `CalculatorOutput` with SANS 10163-1 references
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 10.1, 10.2, 10.3_

  - [x] 4.6 Implement geotechnical engine
    - Create `src/services/calcHub/engines/geotechnical.ts` with pure compute functions for: bearing capacity (Terzaghi + Meyerhof), pad footing design, retaining wall stability, pile capacity
    - Each function returns `CalculatorOutput` with derivation steps
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 11.1, 11.2, 11.3, 11.4_

- [x] 5. Checkpoint - Ensure structural engines pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement civil, mechanical, and fire engines
  - [x] 6.1 Implement loading engine
    - Create `src/services/calcHub/engines/loading.ts` with: wind loads (SANS 10160-3), seismic base shear (SANS 10160-4), load combinations (SANS 10160-1 Table 3), imposed load lookup (SANS 10160-2 Table 1)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 12.1, 12.2, 12.3, 12.4_

  - [x] 6.2 Implement stormwater engine
    - Create `src/services/calcHub/engines/stormwater.ts` with: rational method (Q = C·I·A/3.6), pipe sizing (Manning's equation), attenuation tank sizing (triangular hydrograph)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 13.1, 13.2, 13.3_

  - [ ] 6.3 Write property test for rational method flow calculation
    - **Property 9: Rational Method Flow Calculation**
    - For any valid inputs (C ∈ [0,1], I > 0, A > 0), verify Q = C·I·A/3.6 within floating-point tolerance
    - **Validates: Requirements 13.1**

  - [x] 6.4 Implement duct sizing / HVAC engine
    - Create `src/services/calcHub/engines/ductSizing.ts` with: round/rect duct sizing, chilled water pipe, fan selection, heat gain, heat loss
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 14.1, 14.2, 14.3, 14.4, 14.5_

  - [x] 6.5 Implement fire engineering engine
    - Create `src/services/calcHub/engines/fireEngineering.ts` with: travel distance check, exit width, occupant load, fire resistance rating, fire flow rate, hydrant spacing, fire pump sizing
    - All referencing SANS 10400-T
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7_

- [ ] 7. Implement electrical, wet services, and utility engines
  - [x] 7.1 Implement electrical engine
    - Create `src/services/calcHub/engines/electrical.ts` with: cable sizing (derating per SANS 10142-1), voltage drop check, short circuit current, maximum demand with diversity
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 16.1, 16.2, 16.3, 16.4_

  - [x] 7.2 Implement wet services engine
    - Create `src/services/calcHub/engines/wetServices.ts` with: cold water pipe sizing (loading units → diameter), hot water pipe sizing, pressure drop (Hazen-Williams), drainage pipe sizing (Manning's), vent sizing, geyser sizing, solar pre-heat, circulation return
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 17.9_

  - [x] 7.3 Implement utilities engine
    - Create `src/services/calcHub/engines/utilities.ts` with: unit conversion (18+ categories), material density lookup, section properties calculator (rect, circular, I, T, L shapes)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 18.1, 18.2, 18.3_

  - [ ] 7.4 Write property test for unit conversion round-trip
    - **Property 8: Unit Conversion Round-Trip**
    - For any category and unit pair (A, B), converting A→B→A returns original within 1e-10 tolerance
    - **Validates: Requirements 18.1**

- [x] 8. Checkpoint - Ensure all engines compile and basic tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Write cross-cutting engine property tests
  - [ ] 9.1 Write property test for engine determinism
    - **Property 1: Engine Determinism**
    - For any calculator engine and valid input, calling compute twice produces byte-identical JSON
    - **Validates: Requirements 3.2, 3.3**

  - [ ] 9.2 Write property test for pass/fail status consistency
    - **Property 2: Pass/Fail Status Consistency with Utilisation Ratio**
    - For any engine output: status="pass" when ratio<0.9, "warning" when 0.9≤ratio≤1.0, "fail" when ratio>1.0
    - **Validates: Requirements 3.5, 3.6, 3.7**

  - [ ] 9.3 Write property test for derivation step completeness
    - **Property 4: Derivation Step Completeness**
    - For any engine output, derivation has ≥1 step with non-empty formula, substitution, and result
    - **Validates: Requirements 3.4, 4.5**

  - [ ] 9.4 Write property test for SANS references present
    - **Property 5: SANS References Present in Output**
    - For any engine output, sansReferences contains ≥1 string matching `SANS \d+(-\d+)? §[\d.]+`
    - **Validates: Requirements 3.8, 4.6**

- [ ] 10. Implement service layer (persistence, PDF, integration)
  - [x] 10.1 Implement run persistence service
    - Create `src/services/calcHub/calcHubIntegration.ts` with `persistCalcRun()`, `assignRunToProject()`, `pushRunToSpecForge()`, `auditCalcEvent()` functions
    - Use existing `StandaloneToolRun` interface and audit trail patterns
    - _Requirements: 5.1, 5.2, 5.6, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ] 10.2 Write property test for run persistence round-trip
    - **Property 6: Run Persistence Round-Trip**
    - Persist a run, restore it, re-run engine with restored input → identical output
    - **Validates: Requirements 5.1, 5.4, 5.6**

  - [x] 10.3 Implement PDF export service
    - Create `src/services/calcHub/calcHubPdfExport.ts` generating A4 calculation sheets with: Architex logo, header (project, calculator, SANS ref, date, engineer), input/output tables, derivation steps (monospace), pass/fail badge, advisory disclaimer, runId footer
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ] 10.4 Write unit tests for integration and PDF services
    - Test `persistCalcRun` produces valid StandaloneToolRun shape
    - Test `auditCalcEvent` formats events correctly
    - Test `assignRunToProject` updates fields
    - Test PDF export includes required sections
    - _Requirements: 5.1, 5.2, 6.1, 7.4, 7.5, 7.6_

- [ ] 11. Implement workspace UI component
  - [x] 11.1 Create main EngineersCalcHub component with sidebar navigation
    - Create `src/components/tools/EngineersCalcHub.tsx` with: 240px left sidebar, discipline group sections, calculator navigation items, active state management
    - Accept `user: UserProfile` prop and enforce role-based visibility
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7, 19.3_

  - [x] 11.2 Implement dynamic input form and sub-tab navigation
    - Render calculator sub-tabs when a discipline group has multiple calculators
    - Render dynamic input forms from Zod schemas with field labels, units, defaults
    - Implement real-time Zod validation with inline error messages within 100ms
    - Disable Calculate button when validation fails
    - _Requirements: 1.5, 2.1, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 11.3 Implement results panel and derivation display
    - Render pass/fail/warning badge with correct colours (green/amber/red)
    - Display result values with labels and units in a labelled list
    - Render utilisation ratio as percentage with colour coding
    - Format derivation steps in monospace (JetBrains Mono) with SANS clause highlights (#aeefe3)
    - Mark failing steps with ✗ indicator
    - Two-column layout >900px, stacked on narrow viewports
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [x] 11.4 Implement run history panel and session state
    - Display run history ordered by date descending with calculator name, date, pass/fail badge, key values
    - Support filtering by discipline, status, date range
    - Implement click-to-restore (loads input into form, shows output)
    - Cache inputs per calculator for session restore on re-navigation
    - Track run lineage via previousRunId when modifying restored runs
    - _Requirements: 2.8, 5.3, 5.4, 5.5, 5.6_

  - [x] 11.5 Implement export, project assignment, and platform integration UI
    - Add Export PDF button triggering calcHubPdfExport
    - Add "Assign to Project" flow with project selection interface
    - Add "Push to SpecForge" action
    - Handle persistence errors with non-blocking amber toast (Req 5.7)
    - Wire audit trail events on run creation, assignment, and export
    - _Requirements: 5.7, 6.1, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ] 11.6 Write component tests for EngineersCalcHub
    - Test sidebar renders all discipline groups
    - Test calculator switching updates content
    - Test input form renders from schema
    - Test Calculate button disabled on validation failure
    - Test pass/fail badge rendering
    - Test session state restore
    - Test role-based access denial
    - _Requirements: 1.2, 1.3, 1.7, 2.4, 4.2, 2.8, 19.3_

- [ ] 12. Register tool in platform and wire routing
  - [x] 12.1 Register Calculator Hub in standalone tool registry
    - Add entry to `STANDALONE_TOOL_REGISTRY` with id "engineers_calc_hub", category "compliance", route "standalone/engineers-calc-hub", canExport true, canAssignToProject true, calculatorDefinitionId
    - Set roles array: engineer, architect, bep, energy_professional, fire_engineer, quantity_surveyor, site_manager
    - Wire route in App.tsx to render EngineersCalcHub component
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

  - [ ] 12.2 Write integration tests for tool registration
    - Verify registry entry resolves correctly
    - Verify role access array matches requirements
    - Verify calculatorDefinitionId is set
    - Verify route renders the EngineersCalcHub component
    - _Requirements: 19.1, 19.2, 19.5_

- [-] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties defined in the design document (Properties 1–10)
- Unit tests validate specific examples and edge cases
- All engine functions are pure TypeScript — no I/O, no global state, no randomness
- Steel section data is bundled as static constants for offline availability and deterministic computation
- The implementation uses fast-check for property-based testing (already available in the project)
- All UI follows dark theme conventions with shadcn/ui components per workspace steering rules

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1", "2.2", "2.3", "2.4"] },
    { "id": 2, "tasks": ["1.4", "2.5", "3.1", "3.2", "3.3", "3.4"] },
    { "id": 3, "tasks": ["3.5", "4.1", "4.4", "4.5", "4.6"] },
    { "id": 4, "tasks": ["4.2", "4.3", "6.1", "6.2", "6.4", "6.5"] },
    { "id": 5, "tasks": ["6.3", "7.1", "7.2", "7.3"] },
    { "id": 6, "tasks": ["7.4", "9.1", "9.2", "9.3", "9.4"] },
    { "id": 7, "tasks": ["10.1", "10.3"] },
    { "id": 8, "tasks": ["10.2", "10.4", "11.1"] },
    { "id": 9, "tasks": ["11.2", "11.3", "11.4"] },
    { "id": 10, "tasks": ["11.5", "12.1"] },
    { "id": 11, "tasks": ["11.6", "12.2"] }
  ]
}
```
