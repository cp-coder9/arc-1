# Architex Amy/Greg Toolset Review — Implementation Design

Date: 2026-06-04
Source pack: `e:/arc-1/packs/architex-amy-greg-toolset-review-implementation-pack (1)`
Target repo: `e:/arc-1/arc-1` (branch: `feature/amy-greg-toolset-implementation`)

## Summary

Implement the full Amy/Greg toolset review pack: 15 discipline calculators, 15 comprehensive tool definitions, a role/phase-aware tool registry, agentic tool routing, ToolRun persistence, and integration into all existing role dashboards.

## Architecture

Three layers, all registry-driven:

```
UI Layer:  ToolboxCalculatorPanel, BEPToolboxPage, ContractorBidCalcPanel,
           ToolRunHistoryPanel, ToolLauncher (inline), ProjectToolboxPage (extended)
           ─────────────────────────────────────────
Agent Layer: toolboxAgentService, workflowToolAgentService,
             comprehensiveToolRegistryService
           ─────────────────────────────────────────
Engine Layer: toolboxCalculatorService (15 calculators),
              ToolRun persistence, Export routing
           ─────────────────────────────────────────
Types Layer: toolboxCalculators.ts, comprehensiveToolset.ts
```

## New Files (18)

| File | Purpose |
|---|---|
| `src/types/toolboxCalculators.ts` | Calculator types, input interfaces, run envelope, context |
| `src/types/comprehensiveToolset.ts` | Tool definition, tool context, recommendation, payload types |
| `src/services/toolboxCalculatorService.ts` | 15 calculator implementations, factory registry |
| `src/services/comprehensiveToolRegistryService.ts` | 15 tool definitions, role/phase filtering, recommendation scoring |
| `src/services/workflowToolAgentService.ts` | suggestNextTools, createToolRun, routeToolRunToProjectObject, staff/plant/procurement wrappers |
| `src/services/toolboxAgentService.ts` | Calculator-specific recommendations, post-run compliance review |
| `src/components/ToolboxCalculatorPanel.tsx` | Reusable calculator widget (selector → input → result → export) |
| `src/components/BEPToolboxPage.tsx` | BEP full toolbox page (discipline calculators + comprehensive tools) |
| `src/components/ContractorBidCalculatorPanel.tsx` | Contractor bid workflow stepper |
| `src/components/ToolRunHistoryPanel.tsx` | Versioned tool run history table with filters |
| `src/components/__tests__/toolboxCalculatorPanel.test.tsx` | Calculator panel component tests |
| `src/services/__tests__/toolboxCalculatorService.test.ts` | Calculator engine tests |
| `src/services/__tests__/comprehensiveToolRegistryService.test.ts` | Registry filtering and recommendation tests |
| `src/services/__tests__/workflowToolAgentService.test.ts` | Workflow agent routing and persistence tests |

## Files to Modify (7)

| File | Change |
|---|---|
| `src/types.ts` | Add ToolRun, CalculatorRun references; extend UserRole with engineer, quantity_surveyor, town_planner |
| `src/components/BEPDashboard.tsx` | Add `'toolbox'` activeView, toolbox tab button, render BEPToolboxPage |
| `src/components/ContractorDashboard.tsx` | Wire "Prepare Bid" → ContractorBidCalculatorPanel; add Quick Calc inline buttons to tender list |
| `src/components/ClientToolbox.tsx` | Add budget sanity tool launcher, calculator links |
| `src/components/ProjectToolboxPage.tsx` | Extend TOOLBOX_CONFIG with comprehensive tool definitions |
| `src/components/FreelancerDashboard.tsx` | Add toolbox tab with freelancer-relevant tools |
| `src/App.tsx` | Add routes `/bep-toolbox`, `/contractor-calculator` |

## Integration Points with Existing Services

| ToolRun Export Target | Routes To |
|---|---|
| `site_log` | `constructionService.ts` — daily site record |
| `tender_boq`, `bid_line` | `tenderService.ts` — bid/BOQ line items |
| `payment_valuation`, `invoice` | `paymentService.ts`, `financialLedgerService.ts` |
| `compliance_report` | `councilSubmissionService.ts`, `ComplianceReport.tsx` |
| `rfi` | `constructionService.ts` — RFI creation |
| `escrow_release` | `escrowGovernanceService.ts` |
| `snag_item` | `closeoutService.ts` |
| `resource_listing`, `resource_booking` | `firmService.ts`, `teamService.ts` |
| Context prefill | `prdRoleStageRegistryService.ts` — stage/role validation |

## Type System

### Calculator Types (toolboxCalculators.ts)

Reuse existing `UserRole` from `src/types.ts`. Pack's additional roles (`engineer`, `quantity_surveyor`, `town_planner`, `energy_professional`, `fire_engineer`) added to the union. Pack's 10 phases map to existing 8 `ProjectStage` values; `lead` and `operations_post_occupancy` added as needed.

```
CalculatorDefinition<TInputs, TResult> {
  id, version, familyId, label, description, useClass
  applicableRoles, defaultExportTargets
  requiredInputs, optionalInputs, referenceNotes
  professionalSignoffRequired: boolean
  run: (context, inputs) => CalculatorRun<TResult>
}

CalculatorRun<TResult> {
  id, calculatorId, calculatorVersion, context
  inputs, assumptions, results, riskStatus
  referenceNotes, professionalSignoffRequired
  nextRecommendedActions, exportTargets, createdAt
}
```

### Comprehensive Toolset Types (comprehensiveToolset.ts)

```
ToolDefinition {
  id, label, category, description
  roles, phases, exportTargets
  benchmarkInspiration?, existingArchitexHooks?
  requiresHumanApproval?, southAfricanContext?
}

ToolContext { projectId?, jobId?, tenderPackageId?, bidId?, userId, role, phase, municipality?, discipline?, trade?, costCode?, locationZone?, sourceReferences? }

ToolRecommendation { id, toolId, score, agentId, reason, nextAction, exportTargets, requiresHumanApproval }

ToolRunEnvelope<TPayload> {
  id, toolId, context, payload
  sourceSnapshot { drawingRevisions?, documentIds?, assumptions? }
  approvalState: 'draft' | 'needs_review' | 'approved' | 'rejected' | 'exported'
  exportTargets, createdAt
}
```

## 15 Discipline Calculators

| # | Calculator ID | Family | Use Class | Sign-off |
|---|---|---|---|---|
| 1 | `xa_fenestration_quick_check` | XA Energy | compliance_support | Yes |
| 2 | `xa_rvalue_check` | XA Energy | compliance_support | Yes |
| 3 | `rational_method_runoff` | Civil/Stormwater | coordination_check | Yes |
| 4 | `manning_pipe_flow` | Civil/Stormwater | coordination_check | Yes |
| 5 | `pipe_gradient_invert` | Civil/Stormwater | coordination_check | Yes |
| 6 | `voltage_drop` | Electrical | coordination_check | Yes |
| 7 | `duct_sizing` | Mechanical/HVAC | coordination_check | Yes |
| 8 | `ventilation_air_change` | Mechanical/HVAC | coordination_check | Yes |
| 9 | `fixture_unit_water_demand` | Wet Services | coordination_check | Yes |
| 10 | `occupant_load` | Fire/Life Safety | coordination_check | Yes |
| 11 | `concrete_order` | Contractor Trade | contractor_quantity | No |
| 12 | `brick_blockwork` | Contractor Trade | contractor_quantity | No |
| 13 | `paint_coverage` | Contractor Trade | contractor_quantity | No |
| 14 | `tender_rate_buildup` | Contractor Trade | tender_estimate | No |
| 15 | `labour_productivity` | Contractor Trade | tender_estimate | No |

## 15 Comprehensive Tool Definitions

| # | Tool ID | Category | Key Roles |
|---|---|---|---|
| 1 | `brief_builder` | briefing | client, developer, architect |
| 2 | `document_control_register` | document_control | architect, bep, engineer, contractor |
| 3 | `tender_bid_workbench` | tendering | architect, contractor, subcontractor, supplier |
| 4 | `supplier_rfq_order_portal` | supplier_portal | contractor, subcontractor, supplier |
| 5 | `site_diary_resource_log` | site_management | contractor, subcontractor, site_manager |
| 6 | `workforce_attendance_timesheet` | workforce | contractor, subcontractor, site_manager |
| 7 | `plant_equipment_manager` | plant_equipment | contractor, subcontractor, site_manager |
| 8 | `practice_resource_profitability` | resource_planning | architect, bep, engineer, firm_admin |
| 9 | `ai_drawing_compliance_reader` | drawing_ai_review | architect, bep, engineer, contractor |
| 10 | `bom_boq_programme_drawdown_builder` | estimating_quantities | contractor, subcontractor, qs |
| 11 | `lead_consultant_snag_walk` | site_management | architect, bep, site_manager, contractor |
| 12 | `resource_sharing_freelancer_centre` | resource_marketplace | architect, bep, freelancer, firm_admin |
| 13 | `payment_valuation_escrow` | finance_payments | client, architect, qs, contractor |
| 14 | `closeout_handover_pack` | closeout | all roles |
| 15 | `proposal_builder` | proposal | architect, bep, contractor |

## Agentic Workflow

1. **Context detection** — Toolbox Router Agent suggests calculators/tools based on role, phase, chat message, or project event
2. **Input completion** — Input Completion Agent checks missing dimensions, zones, assumptions
3. **Compliance caution** — Compliance Caution Agent adds SANS/NBR/municipal caveats and sign-off labels
4. **Calculation run** — Engine executes calculator with versioned snapshot
5. **Risk check** — Agent reviews output for pass/warning/fail and suggest next actions
6. **Save** — Versioned ToolRun persisted to Firestore `projects/{id}/tool_runs/{runId}`
7. **Export** — User chooses target; agent routes to appropriate existing service
8. **Downstream monitoring** — Agent flags changes when inputs/drawings/revisions change

## Guardrails (Non-Negotiable)

- AI compliance results are pre-checks only, not certification
- Professional sign-off required flag on all engineering/fire/electrical/XA/statutory calculators
- Candidate professional/freelancer outputs must route to registered professional review
- Quantities from calculators must be editable and review-gated before commercial reliance
- All tool outputs snapshot source version, drawing revision, assumptions, and user identity
- Human approval gates enforced on all statutory, financial, and safety-critical exports

## Data Flow (Example: BEP runs XA calculator)

```
User opens BEPDashboard → clicks "Toolbox" tab
  → BEPToolboxPage queries getToolsForContext({role:'bep', phase:'design_coordination'})
  → Displays filtered tool cards
  → User clicks "XA Fenestration Check"
  → ToolboxCalculatorPanel renders input form (prefilled from project context)
  → User enters glazing area, orientation
  → runCalculator('xa_fenestration_quick_check', context, inputs)
  → Returns CalculatorRun with results, risk status, sign-off flag
  → reviewCalculatorRun() adds compliance warnings
  → User chooses export target (compliance_report)
  → createToolRun() persists to Firestore
  → routeToolRunToProjectObject() routes to councilSubmissionService
```

## Testing Strategy

- **Unit tests**: Each calculator function tested with known inputs/expected outputs; registry filtering correctness; recommendation scoring edge cases
- **Component tests**: CalculatorPanel renders all 3 views; input validation; export action menu
- **Integration tests**: ToolRun persistence round-trip; export routing to existing services
