# Developer Toolbox Spec

**Role key:** `developer` · **UserRole:** ✅ · **TOOLBOX_CONFIG:** ✅ · **Nav modules:** Toolboxes only ⚠ (orphaned — no Command Centre, Projects, Finance, etc.)

## 1. Identity
- **Title:** Developer Toolbox
- **Subtitle:** Portfolio oversight, project governance, and investment decision tools.
- **Scope:** Development governance and portfolio oversight. Project-level decisions remain with appointed professionals.
- **Primary responsibilities:** Monitor portfolio health and programme strategy · Review project feasibility and budgets · Approve stage gates and milestones.
- **Handoff boundaries:** Cannot certify compliance or issue professional sign-offs · Payment releases require verified evidence.

## 2. AI-guided toolbox groups
| Group | Tools (→ pageId) |
|-------|------------------|
| Portfolio and project oversight | Guided Brief Wizard → `client-intake` · BEP Proposals → `client-proposals` · Progress Reports → `client-progress` |
| Financial controls | Payment Status Dashboard → `payments` · BoQ / BoM Procurement → `procurement` · Resource Centre → `resource-centre` |

## 3. Standalone tools (`getToolsForRole('developer')` → 10)
drawing_register, technical_brief, doc_control_issue, cpd_standalone, soft_cost_estimator, payment_dashboard, freelancer_resource_centre, feasibility_estimator, stage_gate_review, zoning_check

Categories spanned: drawing, briefing, document_control, cpd, fee_calculator, payment, resource_centre, estimating, general.

## 4. Lifecycle participation
- **feasibility/appointment:** feasibility_estimator, soft_cost_estimator, zoning_check, technical_brief → portfolio go/no-go and budget baseline.
- **design/procure:** drawing_register, doc_control_issue, BoQ / BoM Procurement → governance over design and procurement evidence.
- **build/pay → closeout:** payment_dashboard, stage_gate_review, Progress Reports → milestone approval against verified evidence.
- **continuous:** cpd_standalone, freelancer_resource_centre.

## 5. Governance gates
- Stage gate and milestone approvals are decisions only — no professional certification (`stage_gate_review`).
- Payment view-only (`payment_dashboard`); release blocked until evidence verified.

## 6. Workflow verification & gaps
- ⚠ **Workflow finding #1 — orphaned role.** `developer` appears ONLY in the `toolboxes` navigation module. No Command Centre, Projects, or Finance modules route to this role, so tools are reachable solely through the Toolboxes shell.
- ⚠ AI-guided mode surfaces 6 tools across 2 groups; tiles mode surfaces 10 standalone tools. Gap of 4 (`drawing_register`, `technical_brief`, `doc_control_issue`, `cpd_standalone`) reachable only via "All tools" toggle.
- ✅ Financial-control + oversight grouping aligns with portfolio-governance scope; project-level execution correctly deferred to appointed professionals.
