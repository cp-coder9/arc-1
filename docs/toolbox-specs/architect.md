# Architect Toolbox Spec

**Role key:** `architect` · **UserRole:** ✅ · **TOOLBOX_CONFIG:** ✅ · **Nav:** Command Centre, Inbox, Projects, Toolboxes, CPD & Learning, Documents, Marketplace, Messages, My Account

## 1. Identity
- **Title:** Architect / Design-Team Toolbox
- **Subtitle:** Architectural delivery tools aligned to the BEP professional workflow.
- **Scope:** Architect is treated as a BEP subtype for authorization while keeping familiar role labels in the UI.
- **Responsibilities:** Refine architectural scope/drawings · Coordinate design review evidence · Prepare statutory package inputs.
- **Handoff boundaries:** No AI-generated compliance certification · No statutory release without accountable sign-off.

## 2. AI-guided toolbox groups
| Group | Tools (→ pageId) |
|-------|------------------|
| Architectural compliance | Technical Brief Editor → `technical-brief` · AI Drawing Checker → `drawing-checker` · SANS / Compliance Forms → `sans-forms` |
| Delivery resources | Remote Desktop / Resources → `resource-sharing` |

## 3. Standalone tools (`getToolsForRole('architect')` → 19)
fee_calculator, fenestration_calc, rvalue_calc, ai_drawing_checker, sans_forms, drawing_register, technical_brief, doc_control_issue, cpd_standalone, boq_takeoff, rfi_generator, snag_creator, freelancer_resource_centre, xa_compliance_calc, fire_rational_design, fire_compliance_check, firm_document_register, valuation_cert, zoning_check

Categories spanned: fee_calculator, compliance, drawing, document_control, briefing, cpd, estimating, site_management, resource_centre, payment.

## 4. Lifecycle participation (broadest professional role)
- **feasibility/appointment:** fee_calculator, technical_brief, zoning_check.
- **concept/design_development:** fenestration_calc, rvalue_calc, ai_drawing_checker, xa/fire calcs, drawing_register, doc_control_issue.
- **municipal_submission:** sans_forms, firm_document_register.
- **tender/construction:** boq_takeoff, rfi_generator, valuation_cert.
- **closeout:** snag_creator.
- **continuous:** cpd_standalone, freelancer_resource_centre.

## 5. Governance gates
- AI drawing checks advisory only (`ai_drawing_checker.standaloneOnly`, supervisor/sign-off gate).
- Compliance forms prepared, never auto-certified.

## 6. Workflow verification & gaps
- ✅ AI-guided routes (`technical-brief`, `drawing-checker`, `sans-forms`, `resource-sharing`) valid.
- ⚠ AI-guided mode exposes only 4 of 19 tools. Strong candidates missing from guided flow: `fee_calculator` (proposal stage), `drawing_register`, `boq_takeoff`, `valuation_cert`, `zoning_check`, `snag_creator`. Recommend a "Proposal & fees", "Costing", and "Closeout" group to match the registry breadth.
- ✅ Architect↔BEP equivalence: registry gives architect a superset of BEP tools (adds boq_takeoff, rfi_generator, snag_creator, valuation_cert, zoning_check). Confirm auth layer treats architect as BEP subtype as the scope claims.

## 7. Toolbox Framework Status

All architect tools now participate in the Toolbox Capability Framework (`CalculatorDefinition` contract).

### Full-status tools (10)
| Tool | Definition ID | Method | Key clause coverage |
|------|---------------|--------|-------------------|
| fee_calculator | `fee_calculator_v1` | bracket | SACAP fee brackets, stage apportionment |
| xa_compliance_calc | `xa_energy_compliance_v1` | clauseSet | SANS 10400-XA energy compliance |
| fenestration_calc | `fenestration_n_v1` | clauseSet + area | SANS 10400-N ventilation/lighting |
| rvalue_calc | `rvalue_calc_v1` | clauseSet + area | SANS 10400-XA thermal resistance |
| energy_certificate | `energy_certificate_v1` | clauseSet | XA rating bands, certification |
| drawing_register | `drawing_register_v1` | schedule | Revision states, superseded detection |
| doc_control_issue | `doc_control_issue_v1` | schedule | Issue/revision governance |
| proposal_comparison | `proposal_comparison_v1` | hybrid | Scope/fee/term scoring |
| stage_gate_review | `stage_gate_review_v1` | hybrid | Gate criteria pass/fail |
| cpd_standalone | `cpd_standalone_v1` | hybrid | CPD body rules, credit accumulation |

### Preview-status tools (2)
| Tool | Status | Notes |
|------|--------|-------|
| technical_brief | `preview` | Guided AI workflow — no calculator definition yet |
| progress_viewer | `preview` | Read-only dashboard — no calculation path |

### Framework details
- **Methods used:** bracket, clauseSet, area, schedule, hybrid
- **Versioned tables:** SACAP brackets, XA zone limits, glazing properties, material R-values, CPD body rules
- **Rendering:** `DefinitionToolRunner` for full tools; legacy fallback for preview stubs
- **Reports:** PDF/CSV export with clause outcomes, source versions, disclaimers

## 8. Forma Build Field Tools (Stage 6 Build / Stage 8 Close-out)
<!-- forma-build-site-tools:field-tools -->

Extends Pack 9 site execution with Autodesk Build / Forma-style mobile field capture. Reuses the existing snag state machine (`open → allocated → ready_for_reinspection → closed / rejected`) and payment-blocker governance unchanged.

**Granted capabilities (editor role):**
- **Issue review** — view and edit field issues, review pin-on-drawing locations and attached photo/annotation evidence, drive allowed status transitions through the snag state machine, and assign responsible parties.
- **Field reporting** — generate and export dated field reports (issue summary with identifier, status, severity; evidence references; payment-blocking and close-out handover counts).
- **Issue Dashboard** — AND-filtered by status, severity, responsible party, and lifecycle stage, with per-status counts and drawing-pin display.

**Governance:** Issue review and reporting do not grant payment-release authority or compliance certification — statutory sign-off remains explicit. Every field action is audited via `SiteAuditRecord` with a permitted/denied outcome.

_Spec: `forma-build-site-tools` · Requirements 1, 5, 6, 7._
