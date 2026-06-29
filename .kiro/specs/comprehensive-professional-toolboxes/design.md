# Design — Comprehensive Professional Toolboxes

## Overview

Introduce a **Toolbox Capability Framework**: a single, typed contract every tool implements, backed by a reusable calculation engine, versioned data tables, dynamic schedule support, and a unified report/run/assign pipeline. Tools become data-driven *calculator definitions* rendered by a generic-but-rich runner, instead of bespoke thin forms. This lets all 54 tools reach "fencalc depth" by authoring definitions + tables + report templates, reusing one engine and one persistence path.

Builds directly on existing modules:
- `src/services/formulaCalculatorEngine.ts` — extend with method types + clause evaluation.
- `src/services/professionalFeeCalculatorService.ts` — fold into the engine as the fee method provider.
- `src/services/tools/standaloneToolRegistry.ts` / `standaloneToolRunService.ts` — registry + run persistence.
- `src/components/tools/StandaloneToolRunner.tsx` — refactor into a definition-driven renderer.
- `src/services/projectRecordAdapter.ts` / `documentAdapter.ts` — assign-to-project hand-off.

## Architecture

```
ToolDefinition (registry entry)
   └─ calculatorDefinitionId ──► CalculatorDefinition (versioned)
                                   ├─ inputSchema (Zod)
                                   ├─ scheduleSchema? (rows)
                                   ├─ method: bracket | percentage | stage | time | area | hybrid | clauseSet
                                   ├─ tableRefs ──► GuidelineTable (versioned data)
                                   ├─ clauseSet? ──► ClauseCheck[] (regulation refs + thresholds)
                                   └─ reportTemplateId ──► ReportTemplate

CalculationEngine.run(definition, input, schedule) -> CalculationResult
   ├─ resolves table versions
   ├─ runs method provider(s)
   ├─ evaluates clause checks (pass/fail/advisory)
   └─ returns { lineResults, aggregates, clauseResults, sourceVersions, disclaimers }

ToolRunner (UI)  -> renders inputSchema + schedule editor, calls engine live,
                    shows clause panel, exports PDF/CSV, Save/Assign via runService.
```

### Layers
1. **Definition layer** (`src/services/toolbox/definitions/**`): one file per tool exporting a `CalculatorDefinition`.
2. **Engine layer** (`src/services/toolbox/engine/**`): method providers + clause evaluator + aggregation.
3. **Data layer** (`src/services/toolbox/tables/**`): versioned `GuidelineTable` JSON + admin CRUD.
4. **Report layer** (`src/services/toolbox/report/**`): PDF (pdf-lib) + CSV builders from `CalculationResult`.
5. **UI layer** (`src/components/tools/**`): definition-driven runner + schedule grid + clause panel.
6. **Persistence/hand-off**: `standaloneToolRunService` + project/document adapters.

## Components and Interfaces

### CalculatorDefinition (core contract)
```typescript
type MethodType = 'bracket' | 'percentage' | 'stage' | 'time' | 'area' | 'hybrid' | 'clauseSet';

interface CalculatorDefinition<TInput = Record<string, unknown>, TRow = Record<string, unknown>> {
  id: string;                       // e.g. 'xa_fenestration_v1'
  toolId: string;                   // FK to STANDALONE_TOOL_REGISTRY
  title: string;
  method: MethodType;
  inputSchema: ZodSchema<TInput>;   // typed top-level inputs
  scheduleSchema?: ZodSchema<TRow>; // per-row schema when schedule-based
  tableRefs: string[];             // GuidelineTable ids consumed
  clauseSet?: ClauseCheckDef[];     // regulation checks
  compute: (ctx: ComputeContext<TInput, TRow>) => CalculationResult;
  reportTemplateId: string;
  source: { guideline: string; version: string; status: 'mandatory'|'recommended'|'indicative'; url?: string };
  disclaimers: string[];
  status: 'full' | 'preview';
}
```

### ClauseCheck
```typescript
interface ClauseCheckDef {
  clauseRef: string;                // 'SANS 10400-XA 4.3.2'
  label: string;
  evaluate: (ctx) => { outcome: 'pass'|'fail'|'advisory'; threshold: string; actual: string; note?: string };
}
```

### CalculationResult
```typescript
interface CalculationResult {
  lineResults: Array<Record<string, number | string>>;   // per schedule row
  aggregates: Record<string, number | string>;           // per-storey/zone/total rollups
  clauseResults: Array<{ clauseRef: string; label: string; outcome: string; threshold: string; actual: string; note?: string }>;
  complianceScore?: number;
  sourceVersions: Array<{ guideline: string; version: string }>;
  disclaimers: string[];
  warnings: string[];
}
```

### GuidelineTable (versioned data)
```typescript
interface GuidelineTable {
  id: string;                       // 'xa_zone_limits', 'sacqsp_brackets'
  version: string;                  // semver or gazette ref
  effectiveFrom: string;
  supersededBy?: string;
  jurisdiction: string;             // 'ZA'
  rows: unknown[];                  // bracket rows / zone limits / stage % / clause thresholds
}
```

### Engine API
- `runCalculator(def, input, rows): CalculationResult` — resolves tables (latest unless pinned), executes method provider, evaluates clauses, aggregates.
- Method providers: `bracketFee`, `percentageFee`, `stageApportion`, `timeCost`, `areaUnit`, `hybrid`, plus `evaluateClauseSet`. The fee providers wrap existing `professionalFeeCalculatorService` logic.

### UI components
- `DefinitionToolRunner.tsx` — replaces ad-hoc branches in `StandaloneToolRunner`; renders form from `inputSchema`, schedule from `scheduleSchema`.
- `ScheduleGrid.tsx` — add/edit/duplicate/reorder/remove rows; live recompute; per-row validation badges.
- `ClauseResultPanel.tsx` — pass/fail/advisory list with clause refs and thresholds.
- `ToolReportPreview.tsx` — renders the report template; triggers PDF/CSV export.
- Reused: `StandaloneToolRunHistory`, `AssignToProjectDialog`.

## Tool → definition mapping (coverage plan)

Tools are grouped so one method + table set serves many. Each group ships a definition module and tables.

| Group | Tools (registry ids) | Method | Key tables |
|-------|----------------------|--------|------------|
| Fee calculators | fee_calculator, soft_cost_estimator, feasibility_estimator | bracket/percentage/hybrid | sacap/ecsa/sacqsp/sacplan/sacpcmp/saclap brackets, stage %, municipal fees |
| Energy/thermal | xa_compliance_calc, rvalue_calc, fenestration_calc, energy_certificate | clauseSet + area | xa_zone_limits, material_r_values, glazing_props |
| Fire | fire_compliance_check, fire_rational_design | clauseSet | sans_10400_t_thresholds |
| Planning | zoning_check | clauseSet + area | zoning_schemes (coverage/FAR/height) |
| Compliance forms | sans_forms, ai_drawing_checker, cad_upload_check | clauseSet | sans_form_defs |
| Estimating/commercial | boq_takeoff, material_procurement, valuation_cert, payment_claim_builder, soft_cost | area/hybrid | rate_libraries, retention/vat config |
| Workforce/plant/site | workforce_timesheet, plant_register, site_diary_entry, hs_compliance | time/area/clauseSet | paye_uif_sdl, plant_rates, hs_checklist |
| Document control | drawing_register, doc_control_issue, shop_drawing_submission, firm_document_register | schedule (no calc) | revision_states |
| Proposal/governance | proposal_comparison, stage_gate_review, cpd_standalone, staff_cpd_tracker | hybrid/score | cpd_body_rules |
| Admin/platform | fee_tariff_editor, payment_rate_config, admin_governance, audit_trail_viewer, user_verification_console, platform_settings, system_health_monitor | table-CRUD/views | (admin tables) |

> Tools beyond full depth this phase carry `status: 'preview'` and remain tracked in tasks (Requirement 8.2).

## Data Models

Extend run persistence (no breaking change to `StandaloneToolRun`):
```typescript
interface StandaloneToolRun {
  // existing: runId, userId, role, toolId, toolLabel, category, input, output, createdAt, exported...
  calculatorDefinitionId?: string;
  scheduleRows?: unknown[];
  guidelineVersions?: Array<{ guideline: string; version: string }>;
  clauseResults?: CalculationResult['clauseResults'];
}
```
GuidelineTables persisted as versioned JSON (Firestore collection `guidelineTables` / local seed). Admin edits append versions; runs pin the version used.

## Error Handling
- Input validation via Zod at form and engine boundaries; engine returns `warnings[]` for soft issues, throws typed `CalculatorError` for hard failures (missing table version).
- Invalid schedule rows are isolated (flagged, excluded from aggregates) rather than failing the whole run.
- Missing/expired guideline table version → block compute with an actionable admin message; never silently use a default.
- Export failures surface a toast and keep the run intact.

## Testing Strategy
- **Unit**: each method provider + each `clauseSet` (pass/fail/advisory boundaries, zone edges, bracket thresholds, VAT/retention math). Table-driven fixtures.
- **Engine**: golden-master `CalculationResult` snapshots per definition; assert version pinning (Requirement 10.4).
- **Component**: ScheduleGrid add/remove/reorder + live aggregate; ClauseResultPanel rendering; runner restore-from-saved-run.
- **Integration**: run → save → reopen → assign-to-project record creation.
- **Regression gate**: `tsc -p tsconfig.app.json`, `npm test`, `npm run build` all green.

## Migration / Rollout
1. Land framework + engine + one exemplar (XA fenestration) end-to-end behind the existing runner.
2. Refactor `StandaloneToolRunner` to delegate to `DefinitionToolRunner` when a `calculatorDefinitionId` exists; fall back to legacy path otherwise (zero-downtime).
3. Convert tool groups iteratively; mark unconverted as `preview`.
4. Keep `docs/toolbox-specs/` in lockstep.

## Correctness Properties

### Property 1: Version pinning (determinism)
For any saved run R, recomputing R with its pinned `guidelineVersions` SHALL reproduce identical `clauseResults` and aggregates.
**Validates: Requirements 3.3, 10.4**

### Property 2: No hidden constants
Every numeric threshold/tariff used in a `CalculationResult` SHALL be traceable to a `GuidelineTable` row id present in `sourceVersions`.
**Validates: Requirements 3.1, 10.4**

### Property 3: Schedule isolation
An invalid row never alters another row's result; aggregates equal the sum/rollup of valid rows only.
**Validates: Requirements 2.2, 2.4**

### Property 4: Monotonic fees
For percentage/bracket fee methods, increasing `valueForFeePurposes` SHALL never decrease the computed base fee.
**Validates: Requirements 5.1**

### Property 5: Advisory invariant
No `CalculationResult` for a compliance/fee tool SHALL be emitted without at least one disclaimer, and a sign-off flag where statutory.
**Validates: Requirements 1.4, 6.3**

### Property 6: Commercial conservation
For valuation/claim outputs, `certified = workDone − retention − previousPaid` and `clientIntoEscrow = base + clientFee` SHALL hold exactly (no rounding drift beyond cents).
**Validates: Requirements 7.2, 7.4**
