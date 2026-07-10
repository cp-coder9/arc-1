# Implementation Plan: Toolbox Depth Audit Spine

## Overview

This plan implements the full audit spine infrastructure: automated classification of all 54 toolbox tiles, placeholder enforcement in the ToolboxEngine, Firestore-backed ToolRun persistence with cursor pagination, export/reporting pipeline, project assignment, downstream writeback with retry/backoff, input validation, versioned guideline resolution, audit snapshot immutability, South African context formatting, priority tool group wiring (Professional Fees, SANS Compliance, BoQ/BoM, Contractor Commercial), and the bidirectional coverage test suite.

## Tasks

- [x] 1. Core types, error codes, and shared infrastructure
  - [x] 1.1 Define ToolRunError class and extended error codes in `src/services/toolboxEngine/types.ts`
    - Add `ToolRunErrorCode` type union with all codes: NO_DEFINITION, INVALID_INPUT, INVALID_SCHEDULE_ROW, GENERIC_OUTPUT_DETECTED, COMPUTE_FAILED, UNSUPPORTED_JURISDICTION, RUN_LOCKED, REASSIGNMENT_NOT_PERMITTED
    - Implement `ToolRunError` class extending Error with code, message, details
    - Add `ToolRunStatus` type: draft, completed, issued, superseded, failed
    - Add `ProjectAssignment` interface with mode, projectId, projectName, externalReference, notes
    - Add `GovernanceProfile` interface with downstreamWriteBack array
    - _Requirements: 2.1, 2.5, 2.6, 5.1, 5.4, 6.1, 7.4, 8.3, 9.2, 10.3_

  - [x] 1.2 Define ClassificationGrade type and ClassificationEntry interface in `src/services/toolbox/auditClassificationService.ts`
    - Export `ClassificationGrade` type: production, partial, placeholder, metadata-only, route-shell, missing
    - Export `ClassificationEntry` interface: toolId, label, grade, reasons, missingCapabilities
    - Export `ClassificationReport` type alias
    - _Requirements: 1.1, 1.9_

  - [x] 1.3 Add `formatZAR` utility and South African locale helpers
    - Create `src/services/toolboxEngine/zaFormatting.ts`
    - Implement `formatZAR(amount: number): string` using `Intl.NumberFormat('en-ZA', ...)`
    - Implement `formatClauseRef(sans: string, part: string, clause: string): string` producing `SANS {number}-{part} {clause}`
    - Implement `formatTariffRef(body: string, year: number, gazetteNo: string): string`
    - _Requirements: 9.3, 9.4, 9.6_


  - [x] 1.4 Update ToolRun interface in `src/services/toolboxEngine/types.ts`
    - Add fields: locked, previewDisclaimer, supersedesRunId, issuedAt, auditSnapshot, error
    - Add `PaginatedResult<T>` interface with items, cursor, hasMore
    - Add `ListByToolParams`, `ListByProjectParams` interfaces with pageSize/cursor
    - _Requirements: 3.1, 3.2, 3.6, 10.2_

  - [x] 1.5 Add `ExportRecord` interface to `src/services/toolboxEngine/exportService.ts`
    - Define ExportRecord: id, format, filename, mimeType, content, createdAt
    - Define ExportContext: userName, userRole, projectAssignment
    - Define filename pattern: `{toolId}_{runId}_{timestamp}.{ext}`
    - _Requirements: 4.5_

- [x] 2. Classification Audit Service
  - [x] 2.1 Implement `AuditClassificationService` in `src/services/toolbox/auditClassificationService.ts`
    - Implement `classifyAll()` scanning STANDALONE_TOOL_REGISTRY
    - Implement `classifyTool(toolId)` with decision tree logic:
      - No calculatorDefinitionId → missing
      - ID doesn't resolve → metadata-only
      - Only route, no compute/inputSchema → route-shell
      - Preview + empty compute → placeholder
      - Full/preview but missing clauseSet/tableRefs/reportTemplateId → partial
      - Full with all capabilities → production
    - Handle errors gracefully: continue on failure, report with grade missing
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_


  - [ ]* 2.2 Write property test: Classification Completeness
    - **Property 1: Classification Completeness**
    - Every tool in STANDALONE_TOOL_REGISTRY receives exactly one valid grade; report length equals registry length
    - **Validates: Requirements 1.1, 1.9**

  - [ ]* 2.3 Write property test: Classification Determinism
    - **Property 2: Classification Determinism**
    - For fixed registry/definition state, classifyAll() produces identical output across multiple invocations
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8**

  - [ ]* 2.4 Write unit tests for AuditClassificationService
    - Test each grade path with mock registry and definitions
    - Test error handling when definition resolution fails
    - Test that missingCapabilities array is populated correctly for partial grade
    - _Requirements: 1.1–1.10_

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Enhanced ToolboxEngine — Validation gates and enforcement
  - [x] 4.1 Implement input validation gate in `src/services/toolboxEngine/engine.ts`
    - Add Zod inputSchema validation before compute
    - Add scheduleSchema per-row validation
    - Return structured error with field path, expected type, actual value for each failure
    - Use error codes INVALID_INPUT and INVALID_SCHEDULE_ROW with row index
    - Store validated (parsed) input in ToolRun, not raw input
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 4.2 Implement definition resolution gate and placeholder enforcement
    - Refuse execution when no Calculator_Definition matches toolId → NO_DEFINITION error
    - Inject previewDisclaimer when definition status is 'preview'
    - Emit PLACEHOLDER_DETECTED Integration_Event for non-full/preview definitions
    - _Requirements: 2.1, 2.2, 2.4_


  - [x] 4.3 Implement generic output detection
    - After compute, check if lineResults is empty AND clauseResults is empty AND all aggregates equal zero
    - If generic output detected, set ToolRun status to failed with GENERIC_OUTPUT_DETECTED
    - On unhandled compute exception, set status failed with COMPUTE_FAILED, preserve input and schedule rows
    - _Requirements: 2.5, 2.6_

  - [x] 4.4 Add jurisdiction validation to table resolution
    - Enhance `src/services/toolbox/engine/tableResolver.ts`
    - If input supplies jurisdiction not in any table's available set, throw UNSUPPORTED_JURISDICTION
    - Default jurisdiction to 'ZA' when not supplied
    - _Requirements: 9.1, 9.2, 8.1_

  - [ ]* 4.5 Write property test: Validation Gate Soundness
    - **Property 3: Validation Gate Soundness**
    - For random invalid inputs (Zod schema negation), engine rejects with INVALID_INPUT and never invokes compute
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

  - [ ]* 4.6 Write property test: Generic Output Rejection
    - **Property 4: Generic Output Rejection**
    - ToolRun with completed status never has all-empty/zero results; such output is caught and run is marked failed
    - **Validates: Requirements 2.5**

  - [ ]* 4.7 Write unit tests for ToolboxEngine validation gates
    - Test NO_DEFINITION error path
    - Test preview disclaimer injection
    - Test INVALID_INPUT with field-level errors
    - Test INVALID_SCHEDULE_ROW with row index
    - Test GENERIC_OUTPUT_DETECTED for all-zero results
    - Test COMPUTE_FAILED on exception
    - Test UNSUPPORTED_JURISDICTION
    - _Requirements: 2.1–2.6, 7.1–7.5, 9.1–9.2_

- [x] 5. Firestore ToolRun Repository
  - [x] 5.1 Implement `FirestoreToolRunRepository` in `src/services/toolboxEngine/firestoreRepository.ts`
    - Implement save with retry logic (1s delay, one retry on failure)
    - Collection path: `tenants/{tenantId}/toolRuns/{runId}`
    - Demo mode path: `demo/{uid}/toolRuns/{runId}`
    - Implement getById
    - Persist failed runs with same structure as successful runs
    - _Requirements: 3.1, 3.2, 3.5, 3.7, 3.8_


  - [x] 5.2 Implement cursor-based pagination queries
    - Implement `listByTool(params)` filtered by tenantId, userId, toolId, ordered by createdAt DESC
    - Implement `listByProject(params)` filtered by tenantId, assignment.projectId, ordered by createdAt DESC
    - Default page size 20, max 50
    - Use Firestore `startAfter` with createdAt cursor value
    - Return PaginatedResult with items, cursor (createdAt of last item), hasMore
    - _Requirements: 3.3, 3.4, 3.6_

  - [ ]* 5.3 Write property test: Pagination Consistency
    - **Property 7: Pagination Consistency**
    - Insert N runs, paginate through all with pageSize=5, collect all items, assert count=N and no duplicates
    - **Validates: Requirements 3.3, 3.4, 3.6**

  - [ ]* 5.4 Write property test: Retry Idempotency
    - **Property 8: Retry Idempotency**
    - Simulate first-write failure, assert retry produces same document content
    - **Validates: Requirements 3.8**

  - [ ]* 5.5 Write unit tests for FirestoreToolRunRepository
    - Test save/getById round-trip
    - Test demo path switching
    - Test retry on first failure
    - Test pagination cursor handling
    - Test failed run persistence
    - _Requirements: 3.1–3.8_

- [x] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Export and Reporting Pipeline
  - [x] 7.1 Enhance `ExportService` in `src/services/toolboxEngine/exportService.ts`
    - Implement `createJson(run)` producing JSON ExportRecord
    - Implement `createCsv(run, definition)` producing one row per schedule line item with headers
    - Include JBCC/GCC section reference field for BoQ tools
    - Filename pattern: `{toolId}_{runId}_{ISO-timestamp}.{ext}`
    - _Requirements: 4.1, 4.3, 4.4, 4.5_

  - [x] 7.2 Implement HTML export with Architex branding
    - Implement `createHtml(run, definition, context)` using reportTemplateId
    - Include: tool name, run date, user name/role, project assignment, input params, results, clause outcomes, source versions, disclaimers
    - Format monetary values using `formatZAR`
    - Include standard disclaimer as final block: "Results are advisory only..."
    - Display cited Guideline_Table references with version and status
    - _Requirements: 4.2, 8.6, 9.5, 9.6_


  - [ ]* 7.3 Write property test: Export Filename Uniqueness
    - **Property 9: Export Filename Uniqueness**
    - No two ExportRecords for the same ToolRun have the same filename
    - **Validates: Requirements 4.5**

  - [ ]* 7.4 Write unit tests for ExportService
    - Test JSON export structure
    - Test CSV header row and data row per line item
    - Test HTML template rendering with branding
    - Test ZAR formatting in HTML output
    - Test disclaimer presence
    - _Requirements: 4.1–4.5, 9.5, 9.6_

- [x] 8. Project Assignment Service
  - [x] 8.1 Enhance `ProjectAssignmentService` in `src/services/toolboxEngine/projectAssignment.ts`
    - Implement `validate(assignment, ctx)` for internal-project mode: check project exists + user has read access
    - For external-reference: validate 1–200 char externalReference, optional 0–500 char notes
    - Reject assignment on invalid project or missing access, preserve ToolRun with mode none
    - Implement `canReassign(currentMode)`: allow from none, reject from internal-project/external-reference
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7_

  - [ ]* 8.2 Write unit tests for ProjectAssignmentService
    - Test internal-project validation with access
    - Test internal-project rejection (not found, no access)
    - Test external-reference length validation
    - Test reassignment rules (none → allowed, non-none → rejected)
    - _Requirements: 5.1–5.7_

- [x] 9. Integration Event Bus with Retry/Backoff
  - [x] 9.1 Enhance `IntegrationEventBus` in `src/services/toolboxEngine/integrationEvents.ts`
    - Implement `emitForRun(run, governance, message)` respecting downstreamWriteBack array
    - Write ProjectRecord entry when target is ProjectRecord and run has internal-project assignment
    - Create inbox action items (project team or executing user based on assignment)
    - Write immutable AuditTrail record with userId, toolId, runId, action, timestamp, snapshot hash
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 9.2 Implement retry with exponential backoff
    - On Firestore write error: retry up to 3 times at 1s, 2s, 4s intervals
    - Mark event as pending_retry during retries
    - After 3 failed retries: mark failed, emit Action Centre alert for triggering user
    - Preserve event payload for manual reprocessing
    - _Requirements: 6.6, 6.7_


  - [ ]* 9.3 Write unit tests for IntegrationEventBus
    - Test ProjectRecord writeback on completed/issued status
    - Test Inbox action item creation for project team vs solo user
    - Test AuditTrail immutable record
    - Test retry backoff timing (1s, 2s, 4s)
    - Test failure escalation after 3 retries
    - _Requirements: 6.1–6.7_

- [x] 10. Audit Snapshot and Immutability
  - [x] 10.1 Upgrade `AuditSnapshotService` in `src/services/toolboxEngine/auditSnapshot.ts`
    - Compute SHA-256 of: `runId|toolId|toolVersion|sortedInput|sortedOutput|issuedAt`
    - Input/output: JSON.stringify with keys sorted alphabetically
    - issuedAt in ISO 8601 UTC
    - Store hash and set locked=true in same atomic operation
    - _Requirements: 10.1, 10.2_

  - [x] 10.2 Implement lock enforcement and revision workflow
    - Reject modification of locked ToolRun fields (except status → superseded) with RUN_LOCKED
    - Implement revision: create new ToolRun with status draft, set supersedesRunId, update original to superseded
    - Emit AuditTrail Integration_Event with snapshot hash on successful lock
    - _Requirements: 10.3, 10.4, 10.5_

  - [ ]* 10.3 Write property test: Immutability After Issue
    - **Property 5: Immutability After Issue**
    - Once locked=true, no mutation other than status→superseded is permitted; all attempts return RUN_LOCKED
    - **Validates: Requirements 10.2, 10.3, 10.4**

  - [ ]* 10.4 Write property test: Audit Hash Determinism
    - **Property 6: Audit Hash Determinism**
    - For given (runId, toolId, toolVersion, input, output, issuedAt), SHA-256 hash is always identical across 100 invocations
    - **Validates: Requirements 10.1, 10.5**

  - [ ]* 10.5 Write unit tests for AuditSnapshotService
    - Test SHA-256 hash computation with known inputs
    - Test lock enforcement rejects mutations
    - Test revision workflow creates new run
    - Test AuditTrail event emission
    - _Requirements: 10.1–10.5_

- [x] 11. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.


- [x] 12. Versioned Guideline Table Resolution
  - [x] 12.1 Enhance table resolution with jurisdiction validation in `src/services/toolbox/engine/tableResolver.ts`
    - Resolve by id + jurisdiction, select most recent version where effectiveFrom ≤ computation date and supersededBy absent
    - If multiple versions share same effectiveFrom, select highest version number
    - Fail with MISSING_TABLE if no version resolves; fail with UNSUPPORTED_JURISDICTION if jurisdiction not in any table
    - On re-execution, resolve against original run's sourceVersions (pinned replay)
    - _Requirements: 8.1, 8.3, 8.4, 9.1, 9.2_

  - [x] 12.2 Add sourceVersions to CalculationResult
    - For every Guideline_Table consumed during compute, record table id, version, effectiveFrom, status (mandatory/recommended/indicative)
    - _Requirements: 8.2, 8.5_

  - [ ]* 12.3 Write unit tests for table resolution
    - Test resolution logic with multiple versions
    - Test jurisdiction defaulting to ZA
    - Test UNSUPPORTED_JURISDICTION error
    - Test MISSING_TABLE error
    - Test pinned version replay
    - _Requirements: 8.1–8.5, 9.1–9.2_

- [x] 13. Priority Tool Group — Professional Fees & Proposals (Req 11)
  - [x] 13.1 Enhance `feeCalculator.ts` to production grade
    - Implement bracket interpolation across SACAP, ECSA, SACQSP, SACPLAN, SACPCMP, SACLAP, SAGC tariff tables
    - Apply stage-based apportionment from fee_stages table
    - Include disbursements and statutory fees as separate line items
    - Consume minimum 8 Guideline_Table references with version and effectiveFrom
    - Produce per-stage fee breakdown in lineResults (label, amount, category)
    - Produce aggregates: baseFee, stageShare, professionalFee, discountAmount, feeAfterDiscount, disbursements, statutoryFees, vatAmount, total
    - Throw MISSING_TABLE if bracket/fee_stages table not found or empty
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [x] 13.2 Enhance `proposalComparison.ts` to production grade
    - Accept multiple proposal schedule rows
    - Produce comparative matrix with weighted normalised scoring (1–10 scale, lower fee/shorter timeline = higher score)
    - Validate weights sum to exactly 100% across fee, timeline, experience, methodology, references
    - _Requirements: 11.5_


  - [x] 13.3 Enhance `softCostEstimator.ts` to production grade
    - Combine professional fee estimates from selected discipline bracket tables
    - Add municipal cost estimates from municipal_fee_allowances table (rate-per-m² or flat-fee)
    - Add contingency line item at user-specified 0–100%
    - Produce aggregates: totalProfessionalFees, totalMunicipalFees, contingencyAmount, vatAmount, totalSoftCost, softCostPercentage
    - _Requirements: 11.6_

  - [ ]* 13.4 Write unit tests for Professional Fees group
    - Test fee_calculator bracket interpolation and stage apportionment
    - Test proposal_comparison weighted scoring normalization
    - Test soft_cost_estimator combined fee + municipal + contingency
    - Test MISSING_TABLE errors when tables absent
    - _Requirements: 11.1–11.6_

- [ ] 14. Priority Tool Group — SANS/NBR Compliance Calculators (Req 12)
  - [x] 14.1 Enhance `fenestrationN.ts` to production grade
    - Compute per-room ventilation openings (min 5% floor area) and natural lighting (min 10% floor area)
    - Produce pass/fail/advisory ClauseResult per room from sans_10400_n_requirements table
    - Cite SANS 10400-N clause references in format SANS {number}-{part} {clause}
    - _Requirements: 12.1, 12.4_

  - [x] 14.2 Enhance `rvalue.ts` to production grade
    - Compute total thermal resistance (R-value in m²·K/W) for wall/roof/floor assemblies
    - Sum individual material layer R-values from schedule
    - Compare against deemed-to-satisfy minimum from xa_rvalue_minimums table for climate zone (1–7) and element type
    - _Requirements: 12.2, 12.4_

  - [x] 14.3 Enhance `xaEnergyCompliance.ts` to production grade
    - Evaluate whole-building envelope: roof R-value, wall R-value vs zone minimums
    - Check glazing-to-floor-area ratio against xa_zone_limits maximum
    - Produce per-component ClauseResult (roof, walls, glazing)
    - _Requirements: 12.3, 12.4_

  - [x] 14.4 Enhance `fireComplianceCheck.ts` to production grade
    - Evaluate SANS 10400-T: escape route travel distance, exit width, fire resistance rating, compartment area, sprinkler requirement
    - Resolve thresholds from sans_10400_t_thresholds table for specified occupancy class
    - Throw MISSING_TABLE/MISSING_TABLE_VERSION if table not resolvable
    - _Requirements: 12.5, 12.6_


  - [ ]* 14.5 Write unit tests for SANS Compliance group
    - Test fenestration per-room pass/fail with threshold data
    - Test rvalue layer summation and zone comparison
    - Test xa_energy per-component clause results
    - Test fire_compliance occupancy-class threshold resolution
    - Test MISSING_TABLE errors for all compliance calculators
    - Test clauseRef format compliance (SANS {number}-{part} {clause})
    - _Requirements: 12.1–12.6_

- [ ] 15. Priority Tool Group — BoQ/BoM/Takeoff Tools (Req 13)
  - [x] 15.1 Enhance `boqTakeoff.ts` to production grade
    - Accept schedule rows: description, unit (m², m³, m, nr, kg, item), quantity, rate, optional rate build-up (labour, material, plant)
    - Validate each row via Zod scheduleSchema; exclude invalid rows with warning, continue processing valid rows
    - Compute per-line: amount = quantity × rate; with build-up: labourCost, materialCost, plantCost
    - Aggregates: subtotal, contingency amount (0–100%, default 10%), grand total
    - CSV export with JBCC/GCC section codes, header + data rows
    - If all rows invalid: return empty lineResults, zero aggregates, warning
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.6_

  - [x] 15.2 Enhance `materialProcurement.ts` to production grade
    - Accept material line items: description, unit, quantity, unit rate, priority (high/medium/low), optional supplier/lead time
    - Compute per-row cost = quantity × unit rate
    - Produce subtotal, contingency, VAT at 15%, total order value
    - Group output by priority level
    - If all rows invalid: return empty lineResults, zero aggregates, warning
    - _Requirements: 13.5, 13.6_

  - [ ]* 15.3 Write unit tests for BoQ/BoM group
    - Test boq_takeoff rate build-up computation
    - Test invalid row exclusion with warning
    - Test contingency calculation
    - Test all-invalid-rows edge case
    - Test materialProcurement priority grouping
    - Test CSV export structure with JBCC/GCC sections
    - _Requirements: 13.1–13.6_

- [x] 16. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.


- [x] 17. Priority Tool Group — Contractor Commercial Tools (Req 14)
  - [x] 17.1 Enhance `paymentClaimBuilder.ts` to production grade
    - Accept contract value, previous certified, current claim, retention %, platform fee %
    - Compute per-certificate: netClaim (current minus previous), retention, platformFee, amountDue
    - Include clauseResults with pass/fail/advisory for negative net claim
    - Include sourceVersions and disclaimers
    - _Requirements: 14.1, 14.4_

  - [x] 17.2 Enhance `workforceTimesheet.ts` to production grade
    - Accept schedule rows: workerName, grade (labourer/artisan/foreman/supervisor), normalHours, overtimeHours, hourlyRate
    - Top-level inputs: projectName, weekEnding, payePercent (default 25), uifPercent (default 1), sdlPercent (default 1)
    - Compute per-row: normalCost, overtimeCost (rate × 1.5 × OT hours), totalCost
    - Aggregates: totalHours, totalCost, payeAmount, uifAmount, sdlAmount, netPayable (rounded 2dp)
    - Advisory clause for overtime exceeding 10 hours
    - _Requirements: 14.2, 14.4, 14.7_

  - [x] 17.3 Enhance `plantRegister.ts` to production grade
    - Accept schedule rows: description, registrationNumber, hireType (internal/external), dailyRate, daysOnSite, standbyDays
    - Top-level inputs: projectName, period, standbyRate (default 50%)
    - Compute per-row: activeCost (dailyRate × daysOnSite), standbyCost (dailyRate × standbyRate% × standbyDays), totalCost
    - Aggregates: totalActiveCost, totalStandbyCost, totalPlantCost, itemCount (rounded 2dp)
    - Advisory clause for standby rate outside 40–60%
    - _Requirements: 14.3, 14.4, 14.7_

  - [x] 17.4 Create `tenderBidBench.ts` Calculator_Definition
    - Accept BoQ pricing rows with descriptions and amounts, plus project identification and margin params
    - Produce aggregates: total bid price, item count
    - Set status to preview or full, register calculatorDefinitionId = tender_bid_bench_v1
    - Link to toolId tender_bid_bench in registry
    - _Requirements: 14.5_

  - [ ]* 17.5 Write unit tests for Contractor Commercial group
    - Test payment_claim net claim and retention computation
    - Test workforce_timesheet OT at 1.5× and statutory deductions
    - Test plant_register active/standby cost calculations
    - Test tender_bid_bench aggregates
    - Test invalid row exclusion with warning continuation (Req 14.6)
    - Test advisory clause outcomes for threshold breaches (Req 14.7)
    - _Requirements: 14.1–14.7_


- [x] 18. Coverage Test Suite — Registry Integrity
  - [x] 18.1 Enhance `coverage.test.ts` in `src/services/toolbox/definitions/coverage.test.ts`
    - Verify every registry entry with calculatorDefinitionId resolves to a definition with matching id
    - Verify every registered definition has a corresponding registry tile
    - Fail if any tile lacks calculatorDefinitionId unless in admin_governance exclusion array
    - Verify each definition's compute runs with sample inputs within 5000ms without throwing
    - Detect new tile additions and fail until wired
    - Report specific toolId/calculatorDefinitionId in assertion messages
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

  - [ ]* 18.2 Write property test: Coverage Integrity
    - **Property 10: Coverage Integrity**
    - Every registry entry with calculatorDefinitionId resolves to a definition, and every definition has a registry entry — bidirectional invariant
    - **Validates: Requirements 15.1, 15.2, 15.3**

  - [x] 18.3 Verify tile count matches full+preview definition count
    - Assert Tool_Registry tile count equals count of full + preview definitions
    - Fail on mismatch per Requirement 2.3
    - _Requirements: 2.3_

- [x] 19. Wire engine pipeline end-to-end
  - [x] 19.1 Wire full execution pipeline in `src/services/toolboxEngine/engine.ts`
    - Connect: resolve definition → validate input → resolve tables → compute → preview check → persist → generate exports → emit events → issue/lock
    - Wire Firestore repository at composition root (`src/services/toolboxEngine/index.ts`)
    - Wire feature flag `USE_FIRESTORE_RUNS` for production toggle
    - Expose `runTool`, `reviseRun`, `reassignRun`, `issueRun` methods
    - _Requirements: 2.1–2.6, 3.1, 4.1, 5.5, 6.1, 7.1, 8.1, 10.1_

  - [x] 19.2 Add API routes in `src/lib/api-router.ts`
    - POST /api/toolbox/run
    - GET /api/toolbox/history/:toolId (with pageSize, cursor query params)
    - GET /api/toolbox/history/project/:projectId
    - GET /api/toolbox/runs/:runId
    - GET /api/toolbox/runs/:runId/export/:format
    - POST /api/toolbox/runs/:runId/issue
    - POST /api/toolbox/runs/:runId/revise
    - PATCH /api/toolbox/runs/:runId/assignment
    - GET /api/toolbox/audit/classification
    - _Requirements: 1.1, 3.3, 3.4, 4.4, 5.6, 10.4_


  - [ ]* 19.3 Write integration tests for end-to-end pipeline
    - Test full run lifecycle: input → validation → compute → persist → export → events
    - Test issue flow: complete → issue → locked
    - Test revision flow: locked → revise → new draft + original superseded
    - Test reassignment flow: none → internal-project
    - Test classification audit endpoint
    - _Requirements: 2.1–2.6, 3.1, 4.1, 5.5, 6.1, 10.1–10.5_

- [x] 20. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (Properties 1–10)
- Unit tests validate specific examples and edge cases
- The tech stack is React 19 + TypeScript + Vite 6, Express 5, Firebase/Firestore, Vitest with fast-check for property tests
- Files live in `src/services/toolbox/` and `src/services/toolboxEngine/`
- All monetary formatting uses South African Rand (ZAR) with en-ZA locale
- Firestore persistence uses `USE_FIRESTORE_RUNS` feature flag for phased rollout

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["1.4", "1.5"] },
    { "id": 2, "tasks": ["2.1", "4.1", "4.2", "4.4", "12.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "4.3", "4.5", "4.6", "4.7", "12.2"] },
    { "id": 4, "tasks": ["5.1", "5.2", "7.1", "8.1", "12.3"] },
    { "id": 5, "tasks": ["5.3", "5.4", "5.5", "7.2", "8.2"] },
    { "id": 6, "tasks": ["7.3", "7.4", "9.1"] },
    { "id": 7, "tasks": ["9.2", "9.3", "10.1"] },
    { "id": 8, "tasks": ["10.2", "10.3", "10.4", "10.5"] },
    { "id": 9, "tasks": ["13.1", "13.2", "13.3", "14.1", "14.2", "14.3", "14.4"] },
    { "id": 10, "tasks": ["13.4", "14.5", "15.1", "15.2"] },
    { "id": 11, "tasks": ["15.3", "17.1", "17.2", "17.3", "17.4"] },
    { "id": 12, "tasks": ["17.5", "18.1", "18.2", "18.3"] },
    { "id": 13, "tasks": ["19.1"] },
    { "id": 14, "tasks": ["19.2"] },
    { "id": 15, "tasks": ["19.3"] }
  ]
}
```
