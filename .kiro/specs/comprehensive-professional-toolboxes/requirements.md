# Requirements Document

Feature: Comprehensive Professional Toolboxes

## Introduction

Architex currently ships 54 standalone tools across 17 roles (`src/services/tools/standaloneToolRegistry.ts`), but most are thin: a generic form + a reference-number "calc" in `StandaloneToolRunner.tsx`. The goal of this feature is to raise every role's professional toolbox to the depth and rigour of a dedicated compliance product like **fencalc.co.za** (SANS 10400-XA): clause-based calculation logic, dynamic line-item schedules, per-zone/per-storey analysis, source-versioned guideline tables, audit-ready PDF/CSV reports, save/version/run-history, and assign-to-project hand-off.

This is a framework-plus-coverage effort: define one rigorous, reusable toolbox capability standard, then apply it to every tool for every role. It builds on existing foundations: `formulaCalculatorEngine.ts`, `professionalFeeCalculatorService.ts` (sliding-scale/stage/time/area/hybrid methods), `standaloneToolRunService.ts` (run history + assign-to-project), and the per-role specs in `docs/toolbox-specs/`.

Detected stack: React 19 + TypeScript + Vite, Zod validation, existing Vitest suite. Specs use that stack.

### Scope guardrails
- Tools are **decision-support and document-prep aids**, not statutory certification. Professional sign-off and human approval gates are preserved.
- Guideline/tariff values are **admin-editable, source-versioned data**, never hard-coded in UI.
- No autonomous money movement; payment/escrow tools prepare and disclose only.

## Glossary
- **Tool**: a registered entry in `STANDALONE_TOOL_REGISTRY` runnable standalone and assignable to a project.
- **Calculator definition**: versioned spec of inputs, method, tables, outputs for a tool.
- **Run**: a saved execution (input snapshot + output snapshot + guideline version).
- **Schedule**: a dynamic, addable/removable list of line items (e.g. fenestration rows, BoQ items, stages).
- **Clause check**: a pass/fail/advisory evaluation against a cited regulation clause.

## Requirements

### Requirement 1: Toolbox capability standard (the "fencalc bar")
**User Story:** As a built-environment professional, I want every toolbox tool to provide structured, clause-aware calculations with audit-ready output, so that the tool replaces my spreadsheets and is defensible at submission.

#### Acceptance Criteria
1. WHEN a tool is opened THEN the system SHALL render a dedicated, typed input form (Zod-validated) specific to that tool's domain, not a generic free-text form.
2. WHEN required inputs are present THEN the system SHALL compute results using a versioned calculator definition (method type + tables) rather than a placeholder reference number.
3. WHERE a tool involves a regulation THEN the system SHALL display per-clause results as pass / fail / advisory with the cited clause reference and the threshold used.
4. WHEN a calculation completes THEN the system SHALL show inputs used, the source guideline/version, assumptions, exclusions, and a standard disclaimer.
5. WHEN the user exports THEN the system SHALL generate an audit-ready PDF and a CSV containing inputs, results, clause outcomes, source version, and timestamp.
6. WHEN a result is produced THEN the system SHALL allow Save (run history), Export, and Assign-to-Project, consistent with `standaloneToolRunService`.

### Requirement 2: Dynamic schedules
**User Story:** As a professional, I want to build multi-row schedules (rooms, openings, stages, BoQ items, assets) within a tool, so that I can model a whole project, not a single value.

#### Acceptance Criteria
1. WHEN a tool is schedule-based THEN the system SHALL let the user add, edit, duplicate, reorder, and remove line items.
2. WHEN schedule rows change THEN the system SHALL recompute per-row and aggregate (per-storey/per-zone/total) results live.
3. WHEN a schedule is saved THEN the system SHALL persist all rows in the run snapshot.
4. IF a row is invalid THEN the system SHALL flag the specific row and exclude it from aggregates until corrected.

### Requirement 3: Versioned guideline / tariff / clause tables (admin-editable)
**User Story:** As a platform admin, I want calculation tables and clause thresholds stored as versioned data, so that regulation updates don't require code changes and issued outputs stay locked to the version used.

#### Acceptance Criteria
1. WHEN a calculator uses thresholds/tariffs/brackets THEN the system SHALL read them from a versioned data table, never hard-coded constants in components.
2. WHEN an admin edits a table THEN the system SHALL create a new version with effective date and supersede metadata, leaving prior versions intact.
3. WHEN a run is saved THEN the system SHALL snapshot the guideline/table version used.
4. WHEN an output is exported THEN the system SHALL print the source guideline name, version, and "mandatory / recommended / indicative" status.

### Requirement 4: SANS 10400-XA fenestration depth (reference exemplar, energy/architect/BEP)
**User Story:** As an energy professional, I want an XA fenestration tool matching fencalc.co.za depth, so that I can produce a submission-ready compliance pack.

#### Acceptance Criteria
1. WHEN building a fenestration schedule THEN the system SHALL capture per-opening orientation, area, glazing type, U-value, SHGC, and shading.
2. WHEN rows exist THEN the system SHALL compute glazing % against the SANS limit, verify U-value and SHGC against climate-zone prescriptive limits, and assess external shading.
3. WHEN a building has multiple storeys THEN the system SHALL produce per-storey summaries plus a whole-building rollup.
4. WHEN compliance is evaluated THEN the system SHALL report each clause as pass/fail/advisory with the zone-specific threshold.
5. WHEN exported THEN the system SHALL produce a professional PDF report suitable for municipal submission (advisory; professional sign-off required).

### Requirement 5: Professional fee calculators depth (all fee-bearing roles)
**User Story:** As a fee-bearing professional, I want a council-guideline fee calculator with stages, complexity, additional services, disbursements, VAT, and proposal output, so that I can issue a defensible proposal.

#### Acceptance Criteria
1. WHEN calculating a fee THEN the system SHALL support sliding-scale bracket, percentage-of-cost, stage-apportioned, time-based, area/unit, and hybrid methods (per `professionalFeeCalculatorService`).
2. WHEN a role-specific guideline applies (SACAP, ECSA, SACQSP, SACPLAN, SACPCMP, SACLAP, SAGC) THEN the system SHALL use that role's versioned table and show its source.
3. WHEN a fee is computed THEN the system SHALL separate normal vs additional services, disbursements, statutory fees, optional discount (with reason), and VAT.
4. WHEN issuing THEN the system SHALL produce a proposal output with scope, assumptions, exclusions, terms, and the Architex platform-fee disclosure, and SHALL be convertible to an appointment.

### Requirement 6: Compliance checklist & checker depth (design/compliance roles)
**User Story:** As an architect/engineer/fire/town-planner professional, I want clause-by-clause compliance checkers (SANS 10400 K/N/T/C/XA, zoning), so that I get an itemised advisory pre-check before submission.

#### Acceptance Criteria
1. WHEN running a checker THEN the system SHALL present each applicable clause as a discrete check with input(s), threshold, and result.
2. WHEN inputs are entered THEN the system SHALL compute a compliance score and list non-conformances with the clause cited.
3. WHEN complete THEN the system SHALL export an itemised checklist report marked advisory, requiring professional sign-off.
4. WHERE a checker overlaps a calculator (e.g. fenestration, R-value) THEN the system SHALL reuse the same calculator definition, not duplicate logic.

### Requirement 7: Construction & commercial tool depth (contractor/sub/QS/site)
**User Story:** As a contractor/QS/site role, I want BoQ takeoff, valuation certificates, payment claims, timesheets, plant registers, and site diaries with real arithmetic and schedules, so that outputs are usable commercial documents.

#### Acceptance Criteria
1. WHEN building a BoQ/takeoff THEN the system SHALL support quantity × rate line items with rate build-ups, subtotals, contingencies, and totals.
2. WHEN preparing a valuation/claim THEN the system SHALL compute work-done, retention, previous payments, VAT, and certified amount.
3. WHEN logging timesheets/plant THEN the system SHALL compute hours/cost with PAYE/UIF/SDL or hire-rate fields and export to a payroll/CSV format.
4. WHEN producing any commercial document THEN the system SHALL apply the Architex platform-fee disclosure where the output feeds payment.

### Requirement 8: Per-role coverage (no thin tools remain)
**User Story:** As any of the 17 roles, I want every tool in my toolbox to meet the capability standard, so that no tool is a placeholder.

#### Acceptance Criteria
1. WHEN auditing the registry THEN the system SHALL have each of the 54 tools mapped to a typed calculator definition meeting Requirement 1.
2. WHERE a tool cannot meet full depth in this phase THEN the system SHALL clearly label it "preview" and track it in tasks, rather than ship a silent placeholder.
3. WHEN a role opens its toolbox THEN every listed tool SHALL either run to the standard or display the preview label.
4. WHEN tools are added/changed THEN `docs/toolbox-specs/` per-role sheets SHALL be updated to match.

### Requirement 9: Run persistence, versioning, and project hand-off
**User Story:** As a professional, I want to save, revisit, version, and attach tool runs to projects, so that my work is durable and traceable.

#### Acceptance Criteria
1. WHEN a run is saved THEN the system SHALL persist input/output/version snapshots via `standaloneToolRunService` and surface it in run history.
2. WHEN a user re-opens a saved run THEN the system SHALL restore all inputs/schedule rows for editing as a new version.
3. WHEN assigning to a project THEN the system SHALL record project/job reference and create the appropriate project record/document adapter entry.
4. WHEN a run is exported THEN the system SHALL mark it exported with format and timestamp.

### Requirement 10: Quality, accessibility, and verification
**User Story:** As the team, I want every tool covered by tests and accessible, so that depth doesn't regress.

#### Acceptance Criteria
1. WHEN a calculator definition is added THEN the system SHALL include unit tests for its formula/clause logic and edge cases.
2. WHEN UI is added THEN forms SHALL be keyboard-navigable, labelled, and screen-reader friendly.
3. WHEN the suite runs THEN `tsc --noEmit -p tsconfig.app.json`, `npm test`, and `npm run build` SHALL pass.
4. WHEN a guideline value is used THEN a test SHALL assert the engine reads it from the versioned table, not a constant.

## Non-Functional Requirements
- **Performance:** schedule recompute for up to 500 rows SHALL complete < 150 ms on a typical client.
- **Offline-tolerant:** calculators SHALL run client-side without a network round-trip; persistence may sync later.
- **Security/governance:** no tool may certify compliance or release funds; all sensitive outputs carry advisory + sign-off notices and audit logging.
- **Internationalisation/locale:** currency in ZAR, VAT configurable, SANS/SA councils as default jurisdiction.
