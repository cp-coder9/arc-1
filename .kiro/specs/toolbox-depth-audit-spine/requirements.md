# Requirements Document

## Introduction

Sprint 5 of the Architex production-depth review requires a full audit of the toolbox tile registry, classification of every tool's implementation depth, removal or labelling of placeholders, and construction of a reusable ToolRun persistence/export/audit spine that every production tool must implement. The registry currently lists 54 tools with 54 definitions, but only 16 of the 37 "full" definitions are connected via `calculatorDefinitionId` — the remaining 21 likely fall back to a legacy generic runner, producing silent placeholder output in production.

This feature delivers: (1) an automated classification audit, (2) placeholder enforcement rules, (3) the reusable ToolRun spine contract, and (4) prioritised wiring of the seven highest-value tool groups into the spine.

## Glossary

- **Audit_Spine**: The reusable infrastructure layer that enforces structured inputs, validation, domain logic, persistence, export, run history, project assignment, and downstream writeback for every production tool.
- **Tool_Registry**: The `STANDALONE_TOOL_REGISTRY` array in `src/services/tools/standaloneToolRegistry.ts` that defines all 54 toolbox tile entries displayed to users.
- **Calculator_Definition**: A typed `CalculatorDefinition` object registered in `src/services/toolbox/definitions/definitionRegistry.ts` implementing Zod-validated inputs, versioned guideline tables, a `compute` function, clause checks, and report template references.
- **Definition_Registry**: The in-memory Map in `definitionRegistry.ts` where `CalculatorDefinition` objects are registered and looked up by `calculatorDefinitionId`.
- **Legacy_Runner**: The fallback execution path taken when a tool tile has no matching `calculatorDefinitionId` in the Definition_Registry — produces generic/placeholder output with no domain logic.
- **ToolRun**: A persisted record of a single tool execution containing tenant, user, tool version, assignment, status, validated input, computed output, exports, audit snapshot, and timestamps (defined in `src/services/toolboxEngine/types.ts`).
- **Project_Assignment**: The association of a ToolRun to either an internal Architex project, an external job reference, or no project (standalone mode).
- **Integration_Event**: A downstream notification emitted by the Audit_Spine to ProjectRecord, Inbox, or AuditTrail upon ToolRun state changes.
- **Governance_Profile**: Per-tool configuration declaring whether a tool requires professional confirmation, allows AI drafting, locks on issue, and which downstream writebacks it triggers.
- **Guideline_Table**: A versioned data table (tariff brackets, SANS thresholds, rate tables) consumed by Calculator_Definitions, pinned by version into each ToolRun result.
- **Toolbox_Engine**: The orchestration class (`src/services/toolboxEngine/engine.ts`) that executes validated tool runs through the spine pipeline.
- **Classification_Grade**: One of: `production` (real domain logic), `partial` (some logic, missing persistence/export), `placeholder` (generic runner fallback), `metadata-only` (registry entry with no definition), `route-shell` (route exists but renders empty/generic UI), `missing` (definition file absent or unwired).

## Requirements

### Requirement 1: Automated Tool Classification Audit

**User Story:** As a platform administrator, I want an automated audit that classifies every tool in the registry by implementation depth, so that I can identify which tools are production-ready and which are placeholders.

#### Acceptance Criteria

1. WHEN the audit service is invoked, THE Audit_Spine SHALL scan every entry in the Tool_Registry and produce a classification report assigning each tool exactly one Classification_Grade from: production, partial, placeholder, metadata-only, route-shell, or missing.
2. WHEN classifying a tool, THE Audit_Spine SHALL check whether the tool's `calculatorDefinitionId` resolves to a registered Calculator_Definition in the Definition_Registry by calling the registry lookup function.
3. WHEN a tool has a registered Calculator_Definition with status `full`, a `compute` function that returns a CalculationResult containing at least one entry in `lineResults` or `aggregates` when given valid input, a Zod-validated `inputSchema`, at least one entry in `tableRefs`, and a non-empty `reportTemplateId`, THE Audit_Spine SHALL classify the tool as `production`.
4. WHEN a tool has a registered Calculator_Definition with status `full` or `preview` but is missing one or more of: a `clauseSet` array with at least one ClauseCheckDef, at least one entry in `tableRefs`, or a non-empty `reportTemplateId`, THE Audit_Spine SHALL classify the tool as `partial` and list each missing capability in the `missingCapabilities` array.
5. WHEN a tool has a registered Calculator_Definition with status `preview` and has no `compute` function that produces results beyond empty defaults, THE Audit_Spine SHALL classify the tool as `placeholder`.
6. WHEN a tool has a `calculatorDefinitionId` in its Tool_Registry entry that does not resolve to any registered Calculator_Definition in the Definition_Registry, THE Audit_Spine SHALL classify the tool as `metadata-only`.
7. WHEN a tool has a `calculatorDefinitionId` that resolves to a Calculator_Definition containing only a route string and no `compute` function or `inputSchema`, THE Audit_Spine SHALL classify the tool as `route-shell`.
8. WHEN a tool has no `calculatorDefinitionId` field in its Tool_Registry entry, THE Audit_Spine SHALL classify the tool as `missing`.
9. THE Audit_Spine SHALL produce the classification report as a structured JSON array where each element contains: `toolId` (string, matching the Tool_Registry entry id), `label` (string, the tool's display name), `grade` (string, one of the six Classification_Grade values), `reasons` (string array with at least one entry explaining the classification logic applied), and `missingCapabilities` (string array, empty when grade is `production`).
10. IF the audit service encounters an error resolving a Calculator_Definition or accessing the Tool_Registry during classification, THEN THE Audit_Spine SHALL continue processing remaining tools and include the failed tool in the report with grade `missing` and a `reasons` entry indicating the resolution failure.

### Requirement 2: Placeholder Enforcement and Fallback Prevention

**User Story:** As a platform administrator, I want production tools to never silently produce generic placeholder output, so that users always receive real domain-specific results or a clear "preview/unavailable" indication.

#### Acceptance Criteria

1. IF a tool has no registered Calculator_Definition matching its toolId, THEN THE Toolbox_Engine SHALL refuse to execute the tool and SHALL return a structured error with code `NO_DEFINITION` and a user-facing message indicating the tool is not yet available.
2. WHEN a tool's Calculator_Definition has `status: 'preview'`, THE Toolbox_Engine SHALL execute the tool but SHALL include a `previewDisclaimer` field in the ToolRun output stating "This tool is in preview. Results are indicative only and must not be relied upon for professional decisions."
3. THE Tool_Registry tile count SHALL equal the count of registered Calculator_Definitions with `status: 'full'` plus the count of Calculator_Definitions with `status: 'preview'`; any mismatch between the tile count and the total definition count SHALL cause the coverage test to fail.
4. WHEN the audit identifies a tool whose Calculator_Definition has `status` set to a value other than `'full'` or `'preview'`, or whose registry entry lacks a `calculatorDefinitionId`, THE Audit_Spine SHALL flag the tool for remediation by emitting a governance Integration_Event to the AuditTrail with action type `PLACEHOLDER_DETECTED`.
5. IF a tool's Calculator_Definition `compute` function returns a CalculationResult where `lineResults` is an empty array AND `clauseResults` is an empty array AND every value in `aggregates` equals zero, THEN THE Toolbox_Engine SHALL reject the output and set the ToolRun status to `failed` with error code `GENERIC_OUTPUT_DETECTED`.
6. IF a tool's Calculator_Definition `compute` function throws an unhandled exception during execution, THEN THE Toolbox_Engine SHALL set the ToolRun status to `failed` with error code `COMPUTE_FAILED` and SHALL preserve the original input and schedule rows in the ToolRun record for diagnostic purposes.

### Requirement 3: ToolRun Persistence and Run History

**User Story:** As a built environment professional, I want every tool execution to be persisted with full context so that I can recall, revise, and audit past calculations.

#### Acceptance Criteria

1. WHEN a tool execution completes successfully, THE Toolbox_Engine SHALL persist the ToolRun to Firestore under the collection path `tenants/{tenantId}/toolRuns/{runId}`.
2. THE ToolRun document SHALL contain: id, tenantId, userId, toolId, toolVersion, role, assignment (ProjectAssignment), status, validated input, computed output, exports array, auditSnapshot, createdAt, updatedAt, and issuedAt (when applicable).
3. WHEN a user requests run history for a specific tool, THE Toolbox_Engine SHALL return ToolRun documents filtered by tenantId, userId, and toolId, ordered by `createdAt` descending, with a default page size of 20 documents and a maximum page size of 50 documents.
4. WHEN a user requests run history for a specific project, THE Toolbox_Engine SHALL return all ToolRun documents where `assignment.projectId` matches the requested projectId AND `tenantId` matches the requesting user's tenantId, ordered by `createdAt` descending, with a default page size of 20 documents and a maximum page size of 50 documents.
5. WHILE the application is in demo mode (`VITE_DEMO_MODE=true`), THE Toolbox_Engine SHALL persist ToolRun documents under the demo-scoped path `demo/{uid}/toolRuns/{runId}` using the demo Firestore wrapper.
6. THE Toolbox_Engine SHALL support cursor-based pagination of run history queries using Firestore `startAfter`, where the cursor value is the `createdAt` field of the last document in the previous page.
7. IF a tool execution completes with a failure status, THEN THE Toolbox_Engine SHALL persist the ToolRun with status `failed` and the `error` field populated, using the same collection path and document structure as successful runs.
8. IF persistence of a ToolRun to Firestore fails, THEN THE Toolbox_Engine SHALL retry the write once after a 1-second delay, and if the retry also fails, SHALL return an error indication to the caller while preserving the computed output in memory for the duration of the user session.

### Requirement 4: Export and Reporting Pipeline

**User Story:** As a built environment professional, I want to export tool results in multiple formats so that I can attach them to project documentation, proposals, and compliance submissions.

#### Acceptance Criteria

1. WHEN a ToolRun reaches `completed` or `issued` status, THE Toolbox_Engine SHALL generate export records in three formats: JSON (machine-readable), CSV (spreadsheet-compatible), and HTML (printable report with Architex branding).
2. THE HTML export SHALL render using the tool's `reportTemplateId` and SHALL include: tool name, run date, user name and role, project assignment details, all input parameters, computed results, clause outcomes, source versions cited, and standard disclaimers.
3. THE CSV export SHALL contain one row per schedule line item (or one summary row for non-schedule tools) with all numeric results and a header row with column labels.
4. WHEN a user requests an export for a specific ToolRun, THE Toolbox_Engine SHALL return the pre-generated ExportRecord matching the requested format without re-executing the computation.
5. THE ExportRecord SHALL include: id, format, filename (following pattern `{toolId}_{runId}_{timestamp}.{ext}`), mimeType, content (string), and createdAt timestamp.

### Requirement 5: Project Assignment Including External Jobs

**User Story:** As a built environment professional, I want to assign tool runs to Architex projects or external job references so that results are traceable to the correct engagement.

#### Acceptance Criteria

1. WHEN executing a tool, THE Toolbox_Engine SHALL accept a ProjectAssignment with mode `none`, `internal-project`, or `external-reference`.
2. WHEN mode is `internal-project`, THE Toolbox_Engine SHALL validate that the projectId exists and that the user has at least read access to the project before persisting the assignment.
3. IF mode is `internal-project` and the projectId does not exist or the user lacks access, THEN THE Toolbox_Engine SHALL reject the assignment, return an error indicating the reason (project not found or access denied), and preserve the ToolRun with mode `none`.
4. WHEN mode is `external-reference`, THE Toolbox_Engine SHALL accept a freeform `externalReference` string (minimum 1 character, maximum 200 characters) and an optional `notes` field (maximum 500 characters) for non-Architex jobs.
5. WHEN a ToolRun is assigned to an internal project, THE Toolbox_Engine SHALL write the run identifier, tool name, execution timestamp, and outcome status to ProjectRecord via an Integration_Event of type `ProjectRecord` within 5 seconds of assignment completion.
6. THE Toolbox_Engine SHALL allow reassignment of a completed ToolRun from mode `none` to either `internal-project` or `external-reference` without re-executing the computation.
7. IF a completed ToolRun is already assigned to `internal-project` or `external-reference`, THEN THE Toolbox_Engine SHALL reject a reassignment request and return an error indicating that re-assignment from a non-`none` mode is not permitted.

### Requirement 6: Downstream Writeback and Integration Events

**User Story:** As a platform user, I want tool results to automatically surface in my project record, inbox, and audit trail so that the project spine stays current without manual data entry.

#### Acceptance Criteria

1. WHEN a ToolRun reaches `completed` or `issued` status, THE Toolbox_Engine SHALL emit Integration_Events to all targets specified in the tool's Governance_Profile `downstreamWriteBack` array within 5 seconds of the status transition.
2. WHEN `ProjectRecord` is in the downstreamWriteBack array and the run has an internal-project assignment, THE Toolbox_Engine SHALL write a ProjectRecord entry containing tool name, run status, a result summary of no more than 500 characters, and a link to the full ToolRun.
3. WHEN `Inbox` is in the downstreamWriteBack array and the run has an internal-project assignment, THE Toolbox_Engine SHALL create an inbox action item for all users assigned to the project team with subject, tool name, and a link to the ToolRun.
4. IF `Inbox` is in the downstreamWriteBack array and the run has no internal-project assignment, THEN THE Toolbox_Engine SHALL create an inbox action item only for the user who executed the ToolRun.
5. WHEN `AuditTrail` is in the downstreamWriteBack array, THE Toolbox_Engine SHALL write an immutable audit record containing userId, toolId, runId, action performed, timestamp, and audit snapshot hash.
6. IF an Integration_Event fails to deliver (Firestore write error), THEN THE Toolbox_Engine SHALL log the failure, mark the event as `pending_retry`, and retry delivery up to 3 times with exponential backoff at intervals of 1 second, 2 seconds, and 4 seconds.
7. IF an Integration_Event remains undelivered after 3 retry attempts, THEN THE Toolbox_Engine SHALL mark the event as `failed`, emit an alert to the Action Centre for the user who triggered the ToolRun, and preserve the event payload for manual reprocessing.

### Requirement 7: Structured Input Validation

**User Story:** As a built environment professional, I want tool inputs to be validated against a schema before computation so that I receive clear error messages rather than incorrect results.

#### Acceptance Criteria

1. WHEN a tool execution is initiated, THE Toolbox_Engine SHALL validate the input against the Calculator_Definition's `inputSchema` (Zod schema) before invoking the `compute` function.
2. IF input validation fails, THEN THE Toolbox_Engine SHALL return a structured validation error containing the field path, expected type/constraint, and actual value for each failing field.
3. WHEN a Calculator_Definition includes a `scheduleSchema`, THE Toolbox_Engine SHALL validate each schedule row against the schema and SHALL reject the entire execution if any row fails validation.
4. THE validation error response SHALL use error code `INVALID_INPUT` for top-level input failures and `INVALID_SCHEDULE_ROW` for schedule row failures, with the row index included in the error details.
5. WHEN input validation succeeds, THE Toolbox_Engine SHALL store the validated (parsed) input in the ToolRun record, not the raw user-submitted input.

### Requirement 8: Versioned Source and Guideline Data

**User Story:** As a built environment professional, I want every calculation to cite the exact version of tariff tables, SANS clauses, and regulatory data used so that results are auditable and reproducible.

#### Acceptance Criteria

1. THE Toolbox_Engine SHALL resolve Guideline_Tables by id and jurisdiction, selecting the most recent version where `effectiveFrom` is on or before the computation date and `supersededBy` is absent; IF multiple versions share the same `effectiveFrom` date, THEN THE Toolbox_Engine SHALL select the version with the highest version number.
2. WHEN a ToolRun completes, THE CalculationResult SHALL include a `sourceVersions` array listing, for every Guideline_Table consumed during the computation, the table id, version identifier, `effectiveFrom` date, and status.
3. IF a required Guideline_Table cannot be resolved (missing or all versions superseded), THEN THE Toolbox_Engine SHALL fail the run with an error indication identifying the unresolved table id and jurisdiction, and SHALL NOT produce a partial CalculationResult.
4. WHEN a previously completed ToolRun is re-executed, THE Toolbox_Engine SHALL resolve Guideline_Tables against the versions recorded in the original run's `sourceVersions` array rather than re-resolving from current data, preserving identical output.
5. THE Guideline_Table version data SHALL include a `status` field with one of the values: mandatory, recommended, or indicative.
6. WHEN generating an HTML export of a CalculationResult, THE Toolbox_Engine SHALL display each cited Guideline_Table reference together with its version identifier and status value.

### Requirement 9: South African Built-Environment Context

**User Story:** As a South African built environment professional, I want tools to apply jurisdiction-specific rules, tariffs, and regulatory references relevant to the South African construction industry so that results are locally applicable.

#### Acceptance Criteria

1. THE Toolbox_Engine SHALL default jurisdiction to `ZA` (South Africa) for all Guideline_Table resolutions unless the ToolRun input explicitly supplies a `jurisdiction` field with a valid ISO 3166-1 alpha-2 country code.
2. IF a ToolRun input supplies a `jurisdiction` value that does not match any Guideline_Table's available jurisdiction set, THEN THE Toolbox_Engine SHALL fail the run with error code `UNSUPPORTED_JURISDICTION` and a message identifying the unsupported value and listing available jurisdictions.
3. WHEN a compliance tool evaluates clauses, THE Calculator_Definition SHALL cite SANS/NBR clause references in the format `SANS {number}-{part} {clause}` (e.g., "SANS 10400-XA 4.3.2") and SHALL include at least one clause reference per evaluated regulation in the `clauseResults` array.
4. WHEN a fee calculator tool computes fees, THE Calculator_Definition SHALL reference the applicable South African professional body tariff (SACAP, ECSA, SACQSP, or SACPLAN) in the `sourceVersions` array with the gazetted year and Government Gazette number (e.g., "SACAP 2024 GG No. 12345").
5. THE HTML export SHALL include a standard disclaimer as the final content block before the document closes, stating "Results are advisory only. Professional sign-off is required before regulatory submission. This tool does not constitute certification."
6. WHEN a tool references monetary values, THE Toolbox_Engine SHALL format amounts in South African Rand with the symbol `R`, thousands separators (space), decimal separator (comma), and 2 decimal places using the locale `en-ZA` (e.g., "R 1 250 000,00").

### Requirement 10: Audit Snapshot and Immutability

**User Story:** As a platform administrator, I want issued tool runs to be tamper-evident so that audit records can be independently verified.

#### Acceptance Criteria

1. WHEN a ToolRun status transitions to `issued`, THE Toolbox_Engine SHALL compute an audit snapshot containing a SHA-256 hash of the UTF-8 encoded concatenation of runId, toolId, toolVersion, input (JSON-stringified with keys sorted alphabetically), output (JSON-stringified with keys sorted alphabetically), and issuedAt timestamp (ISO 8601 UTC format), joined by a pipe (`|`) delimiter.
2. WHEN the audit snapshot is computed, THE Toolbox_Engine SHALL store the snapshot hash within the ToolRun document and set the document's `locked` field to `true` within the same atomic operation.
3. IF a user or system attempts to modify any field of a ToolRun with `locked: true`, other than a status change to `superseded` performed by the Toolbox_Engine via the revision workflow, THEN THE Toolbox_Engine SHALL reject the modification and return error code `RUN_LOCKED`.
4. WHEN an authorized user requests a revision of a ToolRun with `locked: true`, THE Toolbox_Engine SHALL create a new ToolRun with status `draft`, set its `supersedesRunId` field to the locked run's runId, and update the original run's status to `superseded`.
5. WHEN the audit snapshot is stored successfully, THE Toolbox_Engine SHALL emit an AuditTrail Integration_Event that includes the audit snapshot hash so that downstream systems can independently verify integrity.

### Requirement 11: Tool Group Priority Wiring — Professional Fees and Proposals

**User Story:** As an architect or BEP, I want the professional fee calculator and proposal builder tools to operate with full production-depth logic so that I can generate accurate fee calculations and client proposals.

#### Acceptance Criteria

1. THE fee_calculator Calculator_Definition SHALL implement bracket interpolation against SACAP, ECSA, SACQSP, SACPLAN, SACPCMP, SACLAP, and SAGC tariff tables, apply stage-based apportionment from a shared fee_stages table, and include disbursements and statutory fees as separate line items in the result.
2. THE fee_calculator Calculator_Definition SHALL consume a minimum of 8 Guideline_Table references (one bracket table per professional body plus a fee_stages table), each carrying a version string and an effectiveFrom date traceable to gazetted source provenance.
3. WHEN the fee calculator produces a CalculationResult, THE CalculationResult SHALL include per-stage fee breakdown entries in `lineResults` (each with a label, amount, and category), and an `aggregates` record containing at minimum: baseFee, stageShare, professionalFee, discountAmount, feeAfterDiscount, disbursements, statutoryFees, vatAmount, and total.
4. IF a required bracket table or fee_stages table is not found or contains zero rows, THEN THE fee_calculator SHALL throw a CalculatorError with code MISSING_TABLE identifying the missing table id.
5. THE proposal_comparison Calculator_Definition SHALL accept multiple proposal schedule rows and produce a comparative matrix with weighted normalised scoring (scores inverted to 1–10 scale where lower fee or shorter timeline yields a higher score) across fee, timeline, experience, methodology, and references, with weights validated to sum to exactly 100%.
6. THE soft_cost_estimator Calculator_Definition SHALL combine professional fee estimates from at least one selected discipline's bracket table with municipal cost estimates (computed from a municipal_fee_allowances Guideline_Table using rate-per-m² or flat-fee rows), add a contingency line item at a user-specified percentage between 0% and 100%, and produce an `aggregates` record containing totalProfessionalFees, totalMunicipalFees, contingencyAmount, vatAmount, totalSoftCost, and softCostPercentage of construction cost.

### Requirement 12: Tool Group Priority Wiring — SANS/NBR Compliance Calculators

**User Story:** As a built environment professional, I want SANS compliance calculators to perform real regulatory checks against cited clause references so that I can assess building compliance before submission.

#### Acceptance Criteria

1. THE fenestration_n Calculator_Definition SHALL compute per-room ventilation openings (minimum 5% of room floor area) and natural lighting openings (minimum 10% of room floor area) per SANS 10400-N, producing a pass/fail/advisory ClauseResult for each room evaluated against the `sans_10400_n_requirements` guideline table.
2. THE rvalue_calc Calculator_Definition SHALL compute total thermal resistance (R-value in m²·K/W) for wall, roof, or floor assemblies per SANS 10400-XA by summing individual material layer R-values from the schedule, then comparing the total against the deemed-to-satisfy minimum from the `xa_rvalue_minimums` guideline table for the specified climate zone (1–7) and element type.
3. THE xa_energy_compliance Calculator_Definition SHALL evaluate whole-building envelope compliance per SANS 10400-XA by checking achieved roof and wall R-values against zone minimums, glazing-to-floor-area ratio against the `xa_zone_limits` guideline table maximum, and producing a per-component ClauseResult for each assessed element (roof, walls, glazing).
4. WHEN any compliance calculator produces clause results, THE CalculationResult `clauseResults` array SHALL contain at least one ClauseResult per evaluated regulation clause, each with a non-empty `clauseRef` citing the SANS section, an `outcome` of pass, fail, or advisory, a `threshold` string describing the required limit, and an `actual` string describing the measured value.
5. THE fire_compliance_check Calculator_Definition SHALL evaluate SANS 10400-T fire safety requirements by checking escape route travel distance against the occupancy-class maximum, exit width against the per-person minimum, fire resistance rating against the occupancy-class minimum (in minutes), compartment floor area against the occupancy-class limit, and sprinkler requirement — all thresholds resolved from the `sans_10400_t_thresholds` guideline table for the specified occupancy class.
6. IF a compliance calculator cannot resolve a required guideline table version referenced in its `tableRefs`, THEN THE calculator SHALL throw a CalculatorError with code `MISSING_TABLE` or `MISSING_TABLE_VERSION` rather than producing a partial or incorrect result.

### Requirement 13: Tool Group Priority Wiring — BoQ/BoM/Takeoff Tools

**User Story:** As a contractor or quantity surveyor, I want the BoQ/BoM takeoff tool to compute quantities with rate build-ups and produce export-ready schedules so that I can price jobs and issue procurement lists.

#### Acceptance Criteria

1. THE boq_takeoff Calculator_Definition SHALL accept schedule rows containing item description, unit (one of m², m³, m, nr, kg, item), quantity, rate, and an optional rate build-up object with labour, material, and plant components, and SHALL compute per-line amounts as quantity × rate and a grand total as the sum of all line amounts plus a contingency percentage (0–100%, default 10%).
2. THE boq_takeoff Calculator_Definition SHALL validate each schedule row individually against a Zod `scheduleSchema` enforcing non-negative quantities and rates, and IF a row fails validation, THEN THE system SHALL exclude that row from computation, include a warning identifying the invalid row by index and description, and continue processing remaining valid rows.
3. WHEN the BoQ computation completes, THE CalculationResult `aggregates` SHALL include subtotal (sum of line amounts ex VAT), contingency amount, grand total (subtotal + contingency), and WHEN rate build-up data is present on rows, THE lineResults SHALL include labourCost, materialCost, and plantCost computed as the respective build-up component × quantity for each line.
4. THE CSV export for boq_takeoff SHALL produce a schedule of quantities with columns for item number, description, unit, quantity, rate, and amount, and SHALL include a section reference field supporting JBCC/GCC section codes, with a header row and one data row per valid schedule item.
5. THE material_procurement Calculator_Definition SHALL accept material line items each containing description, unit, quantity, unit rate, priority (high/medium/low), and optional supplier name and lead time in days, and SHALL compute per-row cost as quantity × unit rate, a subtotal, a contingency amount, VAT at 15%, and a total order value, with results grouped in the output by priority level.
6. IF all schedule rows submitted to the boq_takeoff or material_procurement Calculator_Definition fail validation, THEN THE system SHALL return a CalculationResult with an empty lineResults array, zero-value aggregates, and a warning indicating that no valid rows were provided.

### Requirement 14: Tool Group Priority Wiring — Contractor Commercial Tools

**User Story:** As a contractor, I want commercial tools (payment claims, workforce timesheets, plant registers) to compute real values and persist auditable records so that I can manage construction finances.

#### Acceptance Criteria

1. THE payment_claim_builder Calculator_Definition SHALL accept schedule rows each containing description (string, 1–200 characters), claimAmount (0.01–999,999,999.99), previouslyPaid (≥ 0), and retentionHeld (≥ 0), along with top-level inputs of projectName, claimNumber (integer ≥ 1), claimDate, retentionPercent (0–100, default 10), vatRate (0–1, default 0.15), and platformFeePercent (0–100, default 5), and SHALL compute per-row netClaimThisCert (claimAmount − previouslyPaid − retentionHeld) and aggregates including totalClaimed, totalPreviouslyPaid, totalRetention, netClaim, vatAmount, totalDue, platformFee, and clientIntoEscrow using cents-based rounding to 2 decimal places.
2. THE workforce_timesheet Calculator_Definition SHALL accept schedule rows each containing workerName, grade (one of labourer, artisan, foreman, supervisor), normalHours (≥ 0), overtimeHours (≥ 0), and hourlyRate (≥ 0), along with top-level inputs of projectName, weekEnding, payePercent (0–100, default 25), uifPercent (0–100, default 1), and sdlPercent (0–100, default 1), and SHALL compute per-row normalCost, overtimeCost (hourlyRate × 1.5 × overtimeHours), and totalCost, and aggregates including totalHours, totalCost, payeAmount, uifAmount, sdlAmount, and netPayable (totalCost minus all statutory deductions) rounded to 2 decimal places.
3. THE plant_register Calculator_Definition SHALL accept schedule rows each containing description, registrationNumber, hireType (internal or external), dailyRate (≥ 0), daysOnSite (≥ 0), and standbyDays (≥ 0), along with top-level inputs of projectName, period, and standbyRate (0–100, default 50), and SHALL compute per-row activeCost (dailyRate × daysOnSite), standbyCost (dailyRate × standbyRate% × standbyDays), and totalCost, and aggregates including totalActiveCost, totalStandbyCost, totalPlantCost, and itemCount rounded to 2 decimal places.
4. WHEN any contractor commercial tool produces results, THE CalculationResult SHALL include an `aggregates` object containing total rand amounts as numeric values rounded to 2 decimal places, and SHALL include `clauseResults` with pass, fail, or advisory outcomes for each evaluated clause, `sourceVersions` identifying the guideline and version consumed, and `disclaimers` containing at least one advisory-only notice.
5. THE tender_bid_bench Calculator_Definition SHALL accept BoQ pricing rows with item descriptions and amounts, along with top-level inputs for project identification and margin parameters, and SHALL produce aggregates including a total bid price and item count, and SHALL have status set to either preview or full with a registered calculatorDefinitionId of tender_bid_bench_v1 linked to toolId tender_bid_bench.
6. IF a schedule row fails schema validation in any contractor commercial tool, THEN THE Calculator_Definition SHALL exclude that row from computation, SHALL emit a warning string identifying the invalid row by index and description, and SHALL continue processing remaining valid rows without throwing an error.
7. IF a contractor commercial tool computes a per-row value that indicates a potential issue (negative net claim, overtime exceeding 10 hours, or standby rate outside 40–60%), THEN THE Calculator_Definition SHALL record a clause outcome of advisory or fail and SHALL include a note describing the specific threshold breach.

### Requirement 15: Coverage Test and Registry Integrity

**User Story:** As a developer, I want automated tests that enforce registry-to-definition wiring integrity so that no tool can silently fall back to placeholder behaviour after deployment.

#### Acceptance Criteria

1. THE coverage test SHALL verify that every entry in the Tool_Registry with a `calculatorDefinitionId` resolves to a registered Calculator_Definition in the Definition_Registry whose `id` field matches the `calculatorDefinitionId` value exactly.
2. THE coverage test SHALL verify that every registered Calculator_Definition has a corresponding entry in the Tool_Registry with a `calculatorDefinitionId` matching that definition's `id`.
3. THE coverage test SHALL fail if any Tool_Registry entry lacks a `calculatorDefinitionId` unless the tool's `id` is present in a code-maintained exclusion array exported from the test module, and every entry in that exclusion array SHALL have a `category` value of `admin_governance`.
4. THE coverage test SHALL verify that each registered Calculator_Definition's `compute` function can be invoked with the definition's `requiredInputs` populated with valid sample values and returns a result within 5000 milliseconds without throwing an exception.
5. WHEN a new tool is added to the Tool_Registry, THE coverage test SHALL detect the addition and fail until a corresponding Calculator_Definition is registered or the tool's `id` is added to the exclusion array.
6. IF any assertion in the coverage test fails, THEN THE coverage test SHALL report the specific `toolId` or `calculatorDefinitionId` that caused the failure in the assertion message.
