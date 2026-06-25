# Implementation Plan — Comprehensive Professional Toolboxes

## Overview

Incrementally raise all 54 tools across 17 roles to the Toolbox Capability Standard by building one reusable framework (engine + versioned tables + definition-driven runner + report/run/assign pipeline), proving it end-to-end on the SANS 10400-XA fenestration exemplar, then converting tool groups. Each task is test-driven and ends green on `tsc`, `npm test`, `npm run build`.

## Tasks

- [x] 1. Establish the Toolbox Capability Framework contracts
  - Create `src/services/toolbox/types.ts` with `CalculatorDefinition`, `ClauseCheckDef`, `CalculationResult`, `GuidelineTable`, `ComputeContext`, `CalculatorError`.
  - Wire types into existing `standaloneToolTypes` without breaking current registry.
  - _Requirements: 1.1, 1.2, 3.1_

- [x] 2. Build the calculation engine and method providers
- [x] 2.1 Implement core `runCalculator` + table resolver (latest vs pinned version)
  - _Requirements: 1.2, 3.1, 3.3_
- [x] 2.2 Implement method providers `bracketFee`, `percentageFee`, `stageApportion`, `timeCost`, `areaUnit`, `hybrid` by folding in `professionalFeeCalculatorService`
  - Unit-test each provider against bracket/threshold/stage/VAT edge cases.
  - _Requirements: 5.1, 7.1, 7.2, 10.1_
- [x] 2.3 Implement `evaluateClauseSet` producing pass/fail/advisory + score
  - Unit-test boundary cases and clause citation output.
  - _Requirements: 1.3, 6.1, 6.2, 10.1_

- [x] 3. Versioned guideline/table data layer
- [x] 3.1 Create `GuidelineTable` store (seed JSON + Firestore-backed) with version/effectiveFrom/supersededBy
  - _Requirements: 3.1, 3.2_
- [x] 3.2 Snapshot guideline versions into runs and assert engine reads tables (not constants)
  - Add test for Requirement 10.4.
  - _Requirements: 3.3, 10.4_

- [x] 4. Report and persistence pipeline
- [x] 4.1 Build `ReportTemplate` + PDF (pdf-lib) and CSV exporters from `CalculationResult`
  - Include inputs, clause outcomes, source version, timestamp, disclaimer.
  - _Requirements: 1.4, 1.5, 3.4_
- [x] 4.2 Extend `StandaloneToolRun` with `calculatorDefinitionId`, `scheduleRows`, `guidelineVersions`, `clauseResults`; update `standaloneToolRunService`
  - _Requirements: 9.1, 9.4_
- [x] 4.3 Implement restore-from-saved-run (reopen as new version) and assign-to-project record/document adapter hand-off
  - Integration test: run → save → reopen → assign.
  - _Requirements: 9.2, 9.3_

- [x] 5. Definition-driven UI
- [x] 5.1 Build `DefinitionToolRunner.tsx` rendering form from `inputSchema` (Zod) with accessible, labelled fields
  - _Requirements: 1.1, 10.2_
- [x] 5.2 Build `ScheduleGrid.tsx` (add/edit/duplicate/reorder/remove, live recompute, per-row validation)
  - Component tests for row ops + aggregates + invalid-row isolation.
  - _Requirements: 2.1, 2.2, 2.4, 10.2_
- [x] 5.3 Build `ClauseResultPanel.tsx` and `ToolReportPreview.tsx`; refactor `StandaloneToolRunner` to delegate when `calculatorDefinitionId` exists (legacy fallback otherwise)
  - _Requirements: 1.3, 1.6, 6.3_

- [x] 6. Exemplar end-to-end: SANS 10400-XA fenestration (depth reference)
- [x] 6.1 Author `xa_fenestration_v1` definition: per-opening schema (orientation, area, glazing, U-value, SHGC, shading) + `xa_zone_limits`/`glazing_props` tables
  - _Requirements: 4.1, 4.2_
- [x] 6.2 Implement glazing %, U-value, SHGC, shading clause checks with per-storey + whole-building rollups
  - Unit tests per clause + per-storey aggregation.
  - _Requirements: 4.2, 4.3, 4.4_
- [x] 6.3 Wire submission-ready PDF report; mark advisory + sign-off
  - _Requirements: 4.5, NFR governance_

- [x] 7. Convert energy & thermal group
  - Author definitions for `rvalue_calc`, `fenestration_calc`, `xa_compliance_calc`, `energy_certificate` reusing engine + tables (no duplicate logic).
  - _Requirements: 4.*, 6.4, 8.1_

- [x] 8. Convert fee-calculator group (all fee-bearing roles)
- [x] 8.1 Author `fee_calculator` definitions per council guideline (SACAP, ECSA, SACQSP, SACPLAN, SACPCMP, SACLAP, SAGC) with versioned brackets/stage tables
  - _Requirements: 5.1, 5.2, 3.1_
- [x] 8.2 Author `soft_cost_estimator` and `feasibility_estimator` (multi-discipline + municipal allowances)
  - _Requirements: 5.1, 5.3_
- [x] 8.3 Wire proposal output (scope/assumptions/exclusions/terms + platform-fee disclosure) and convert-to-appointment
  - _Requirements: 5.4_

- [x] 9. Convert compliance checkers (fire, planning, SANS forms, drawing checkers)
  - Author `fire_compliance_check`, `fire_rational_design`, `zoning_check`, `sans_forms`, `ai_drawing_checker`, `cad_upload_check` as `clauseSet` definitions; reuse shared calculators where overlapping.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 8.1_

- [x] 10. Convert construction & commercial group
- [x] 10.1 `boq_takeoff`, `material_procurement` — quantity×rate schedules, rate build-ups, contingencies, totals
  - _Requirements: 7.1_
- [x] 10.2 `valuation_cert`, `payment_claim_builder` — work-done/retention/previous/VAT/certified amount + platform-fee disclosure
  - _Requirements: 7.2, 7.4_
- [x] 10.3 `workforce_timesheet`, `plant_register`, `site_diary_entry`, `hs_compliance` — hours/cost, PAYE/UIF/SDL, hire rates, H&S clause checklist, payroll/CSV export
  - _Requirements: 7.3, 6.1_

- [x] 11. Convert document-control & proposal/governance groups
  - `drawing_register`, `doc_control_issue`, `shop_drawing_submission`, `firm_document_register` as schedule tools with revision states.
  - `proposal_comparison`, `stage_gate_review`, `cpd_standalone`, `staff_cpd_tracker` with scoring/hybrid + cpd body rules.
  - _Requirements: 2.1, 8.1_

- [x] 12. Admin tooling for versioned tables
  - Implement `fee_tariff_editor` and `payment_rate_config` against the `GuidelineTable` store (add/update/supersede, lock issued versions); surface views for `admin_governance`, `audit_trail_viewer`, `user_verification_console`, `platform_settings`, `system_health_monitor`.
  - _Requirements: 3.2, 3.3_

- [x] 13. Coverage sweep — eliminate thin tools
  - Audit all 54 registry tools; ensure each maps to a `CalculatorDefinition` (`status: 'full'`) or is explicitly `preview`-labelled in UI and tracked here.
  - _Requirements: 8.1, 8.2, 8.3_

- [x] 14. Documentation sync
  - Update each `docs/toolbox-specs/<role>.md` to reflect the upgraded tools, methods, and clause coverage; refresh `_CROSS_ROLE_FINDINGS.md` (close the AI-guided-vs-registry divergence item) and `src/navigation/AGENTS.md` if contracts change.
  - _Requirements: 8.4_

- [x] 15. Full verification gate
  - Run and green: `tsc --noEmit -p tsconfig.app.json`, `npm test`, `npm run build`.
  - Add/confirm tests for performance (500-row recompute) and accessibility checks on new forms.
  - _Requirements: 10.1, 10.2, 10.3, 10.4, NFR performance_

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"], "parallel": false, "description": "Framework contracts — prerequisite for all" },
    { "wave": 2, "tasks": ["2", "3"], "parallel": true, "description": "Engine + versioned table data layer (depend on 1)" },
    { "wave": 3, "tasks": ["4", "5"], "parallel": true, "description": "Report/persistence pipeline (4←2,3) and definition-driven UI (5←1)" },
    { "wave": 4, "tasks": ["6"], "parallel": false, "description": "XA fenestration exemplar — first full vertical slice, gates conversions (←2,3,4,5)" },
    { "wave": 5, "tasks": ["7", "8", "9", "10", "11", "12"], "parallel": true, "description": "Group conversions + admin tables (←6; 12←3)" },
    { "wave": 6, "tasks": ["13"], "parallel": false, "description": "Coverage sweep — eliminate thin tools (←7-12)" },
    { "wave": 7, "tasks": ["14", "15"], "parallel": false, "description": "Docs sync then full verification gate" }
  ]
}
```

- Task 1 → prerequisite for all.
- Tasks 2, 3 depend on 1; Task 2.2/2.3 depend on 2.1.
- Task 4 depends on 2 + 3. Task 5 depends on 1 (UI) and consumes 2/4 at runtime.
- Task 6 (exemplar) depends on 2, 3, 4, 5 — it is the first full vertical slice and gates the conversion tasks.
- Tasks 7, 8, 9, 10, 11 (group conversions) depend on 6 and run in parallel once the framework is proven.
- Task 12 (admin tables) depends on 3.
- Task 13 (coverage sweep) depends on 7–12.
- Task 14 (docs) depends on 13. Task 15 (verification gate) runs last and after every group merge.

## Notes

- `status: 'preview'` is the explicit escape hatch (Requirement 8.2): never ship a silent placeholder.
- Reuse over duplication: checkers and calculators that overlap (fenestration, R-value) share one definition (Requirement 6.4).
- Governance is non-negotiable: advisory + sign-off + audit logging on every compliance/financial output; no autonomous money movement.
- Keep `docs/toolbox-specs/` and `src/navigation/AGENTS.md` synchronised with each merged group.
