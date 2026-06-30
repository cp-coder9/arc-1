# BEP / Professional Toolbox Spec

**Role key:** `bep` · **UserRole:** ✅ · **TOOLBOX_CONFIG:** ✅ · **Nav:** Command Centre, Inbox, Projects, Toolboxes, Documents, Marketplace, Messages

## 1. Identity
- **Title:** BEP / Professional Toolbox
- **Subtitle:** Technical brief, design coordination, compliance, municipal, freelancer, and delivery tools.
- **Scope:** BEP tools prepare and coordinate professional work; statutory sign-off remains explicit and auditable.
- **Responsibilities:** Convert client brief into technical scope · Coordinate design-team deliverables · Prepare compliance and municipal evidence.
- **Handoff boundaries:** AI checks advisory only · Municipal and compliance submissions require verified human sign-off.

## 2. AI-guided toolbox groups
| Group | Tools (→ pageId) |
|-------|------------------|
| Technical brief and compliance | Technical Brief Editor → `technical-brief` · Design & Compliance → `design` |
| Drawing delivery and resourcing | Drawing Register → `drawing-register` · Freelancer Jobs → `bep-freelancers` |

## 3. Standalone tools (`getToolsForRole('bep')` → 14)
fee_calculator, fenestration_calc, rvalue_calc, ai_drawing_checker, sans_forms, drawing_register, technical_brief, doc_control_issue, cpd_standalone, freelancer_resource_centre, xa_compliance_calc, fire_rational_design, fire_compliance_check, firm_document_register

Categories spanned: fee_calculator, compliance, drawing, document_control, briefing, cpd, resource_centre.

## 4. Lifecycle participation
- **feasibility/appointment:** fee_calculator, technical_brief → converts brief into technical scope.
- **concept/design_development:** fenestration_calc, rvalue_calc, ai_drawing_checker, xa_compliance_calc, fire_rational_design, drawing_register, doc_control_issue.
- **municipal_submission:** sans_forms, fire_compliance_check, firm_document_register.
- **continuous:** cpd_standalone, freelancer_resource_centre.

## 5. Governance gates
- AI drawing/compliance checks advisory only — never auto-certified.
- Municipal/SANS submissions (`sans_forms`, `fire_compliance_check`) require verified human professional sign-off.

## 6. Workflow verification & gaps
- ✅ AI-guided routes (`technical-brief`, `design`, `drawing-register`, `bep-freelancers`) valid pageId targets.
- ⚠ AI-guided mode exposes 4 curated tools across 2 groups; tiles mode surfaces 14. Costing/energy/fire calcs (`fee_calculator`, `xa_compliance_calc`, `fire_rational_design`, `fire_compliance_check`) only reachable via "All tools" toggle — consider a "Compliance & calcs" guided group.
- ✅ Lifecycle alignment: BEP owns brief→coordination→municipal evidence; matches `lifecycleDefinitions`.

## 7. Toolbox Framework Status

All BEP tools now participate in the Toolbox Capability Framework (`CalculatorDefinition` contract).

### Full-status tools (10)
| Tool | Definition ID | Method | Key clause coverage |
|------|---------------|--------|-------------------|
| fee_calculator | `fee_calculator_v1` | bracket | SACAP/ECSA/SACQSP fee brackets, stage % |
| proposal_comparison | `proposal_comparison_v1` | hybrid | Scope/fee/term scoring |
| stage_gate_review | `stage_gate_review_v1` | hybrid | Gate criteria pass/fail |
| soft_cost_estimator | `soft_cost_estimator_v1` | hybrid | Multi-discipline + municipal allowances |
| feasibility_estimator | `feasibility_estimator_v1` | hybrid | Budget baseline, go/no-go |

### Preview-status tools (1)
| Tool | Status | Notes |
|------|--------|-------|
| brief_wizard | `preview` | Guided AI wizard — no calculator definition yet |

### Framework details
- **Methods used:** bracket, clauseSet, area, hybrid, schedule
- **Versioned tables:** Council fee brackets, stage apportionment, XA zone limits, glazing properties, CPD body rules
- **Rendering:** `DefinitionToolRunner` for full tools; legacy fallback for preview stubs
- **Reports:** PDF/CSV export with clause outcomes, source versions, disclaimers

## 8. Forma Build Field Tools (Stage 6 Build / Stage 8 Close-out)
<!-- forma-build-site-tools:field-tools -->

Extends Pack 9 site execution with Autodesk Build / Forma-style mobile field capture. Reuses the existing snag state machine (`open → allocated → ready_for_reinspection → closed / rejected`) and payment-blocker governance unchanged.

**Granted capabilities (editor role):**
- **Checklist templates** — author and validate reusable inspection checklist templates (1–200 items, prompts 1–500 chars, response types pass_fail_na / numeric / text); templates round-trip without loss and seed checklist instances for site teams.
- **Field reporting** — generate and export dated field reports (issue summary with identifier, status, severity; evidence references; payment-blocking and close-out handover counts).
- **Issue review & Dashboard** — view/edit field issues and the AND-filtered Issue Dashboard with per-status counts and drawing-pin display.

**Governance:** Checklist authoring and reporting are coordination activities; compliance and municipal sign-off remain explicit and human-verified. Every field action is audited via `SiteAuditRecord` with a permitted/denied outcome.

_Spec: `forma-build-site-tools` · Requirements 3, 5, 6, 7._
