# Engineer Toolbox Spec

**Role key:** `engineer` · **UserRole:** ✅ · **TOOLBOX_CONFIG:** ✅ · **Nav:** Toolboxes only ⚠

## 1. Identity
- **Title:** Engineer Toolbox
- **Subtitle:** Structural, civil, and engineering design tools with compliance and document management.
- **Scope:** Engineering design and compliance tools. Sign-off remains with the registered professional.
- **Responsibilities:** Design structural/civil elements · Prepare compliance evidence · Coordinate with design team.
- **Handoff boundaries:** Cannot issue architectural compliance · AI checks advisory only.

## 2. AI-guided toolbox groups
| Group | Tools (→ pageId) |
|-------|------------------|
| Engineering design and compliance | Fee Calculator → `design` · AI Drawing Checker → `drawing-checker` · SANS / Compliance Forms → `sans-forms` |
| Document control and coordination | Drawing Register → `drawing-register` · Technical Brief Editor → `technical-brief` · Remote Desktop / Resources → `resource-sharing` |

## 3. Standalone tools (`getToolsForRole('engineer')` → 14)
fee_calculator, fenestration_calc, rvalue_calc, ai_drawing_checker, sans_forms, drawing_register, technical_brief, doc_control_issue, cpd_standalone, boq_takeoff, rfi_generator, freelancer_resource_centre, fire_compliance_check, firm_document_register

Categories spanned: fee_calculator, compliance, drawing, document_control, briefing, cpd, estimating, resource_centre.

## 4. Lifecycle participation
- **appointment:** fee_calculator, technical_brief.
- **concept/design_development:** fenestration_calc, rvalue_calc, ai_drawing_checker, drawing_register, doc_control_issue.
- **municipal_submission:** sans_forms, fire_compliance_check, firm_document_register.
- **tender/construction:** boq_takeoff, rfi_generator.
- **continuous:** cpd_standalone, freelancer_resource_centre.

## 5. Governance gates
- AI drawing checks advisory only — supervisor/professional sign-off gate.
- SANS/fire compliance forms prepared, never auto-certified; cannot issue architectural compliance.

## 6. Workflow verification & gaps
- ⚠ **Workflow finding #1 — orphaned role:** `engineer` appears **only** in the `toolboxes` nav module — no Command Centre, Inbox, Projects, or Messages. The role has full `TOOLBOX_CONFIG` and 14 registry tools but cannot reach a project, inbox, or messages through nav. Either add `engineer` to the relevant nav modules or treat it as a `bep` subtype at the auth layer. See `_CROSS_ROLE_FINDINGS.md`.
- ⚠ AI-guided mode exposes 6 curated tools across 2 groups; tiles mode surfaces 14. Costing/closeout tools (`boq_takeoff`, `rfi_generator`, `fenestration_calc`, `rvalue_calc`) only reachable via "All tools" toggle.
- ✅ AI-guided routes (`design`, `drawing-checker`, `sans-forms`, `drawing-register`, `technical-brief`, `resource-sharing`) are valid pageId targets — verify they resolve given the orphaned nav.

## 7. Toolbox Framework Status

All engineer tools now participate in the Toolbox Capability Framework (`CalculatorDefinition` contract).

### Full-status tools (4)
| Tool | Definition ID | Method | Key clause coverage |
|------|---------------|--------|-------------------|
| fee_calculator | `fee_calculator_v1` | bracket | ECSA fee brackets, stage apportionment |
| fire_compliance_check | `fire_compliance_check_v1` | clauseSet | SANS 10400-T thresholds |
| fire_rational_design | `fire_rational_design_v1` | clauseSet | Rational fire engineering |
| rvalue_calc | `rvalue_calc_v1` | clauseSet + area | SANS 10400-XA thermal resistance |

### Preview-status tools (2)
| Tool | Status | Notes |
|------|--------|-------|
| rfi_generator | `preview` | Document workflow — no calculator definition yet |
| rfi_response | `preview` | Document workflow — no calculator definition yet |

### Framework details
- **Methods used:** bracket, clauseSet, area
- **Versioned tables:** ECSA brackets, SANS 10400-T thresholds, material R-values
- **Rendering:** `DefinitionToolRunner` for full tools; legacy fallback for preview stubs
- **Reports:** PDF/CSV export with clause outcomes, source versions, disclaimers

## 8. Forma Build Field Tools (Stage 6 Build / Stage 8 Close-out)
<!-- forma-build-site-tools:field-tools -->

Extends Pack 9 site execution with Autodesk Build / Forma-style mobile field capture. Reuses the existing snag state machine (`open → allocated → ready_for_reinspection → closed / rejected`) and payment-blocker governance unchanged.

**Granted capabilities (editor role):**
- **Issue review** — view and edit field issues, review pin-on-drawing locations and attached photo/annotation evidence, drive allowed status transitions through the snag state machine, and assign responsible parties.
- **Field reporting** — generate and export dated field reports (issue summary with identifier, status, severity; evidence references; payment-blocking and close-out handover counts).
- **Issue Dashboard** — AND-filtered by status, severity, responsible party, and lifecycle stage, with per-status counts and drawing-pin display.

**Governance:** Issue review and reporting do not grant payment-release authority or compliance certification — statutory sign-off remains with the registered professional. Every field action is audited via `SiteAuditRecord` with a permitted/denied outcome.

_Spec: `forma-build-site-tools` · Requirements 1, 5, 6, 7._
