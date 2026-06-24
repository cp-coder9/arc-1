# QS Toolbox Spec

**Role key:** `quantity_surveyor` · **UserRole:** ✅ · **TOOLBOX_CONFIG:** ✅ · **Nav:** Toolboxes only ⚠

## 1. Identity
- **Title:** QS Toolbox
- **Subtitle:** Cost planning, bills of quantities, valuations, and commercial governance tools.
- **Scope:** Commercial management tools for cost control from feasibility through final account.
- **Responsibilities:** Prepare cost plans and BoQ · Conduct valuations and payment certifications · Manage variations and final accounts.
- **Handoff boundaries:** Cannot certify professional design compliance · Valuations require contractor/client evidence.

## 2. AI-guided toolbox groups
| Group | Tools (→ pageId) |
|-------|------------------|
| Cost planning and BoQ | BoQ / BoM Takeoff Tool → `procurement` · Professional Fee Calculator → `design` · Subcontractor Packages → `packages` |
| Valuations and payments | Payment Status Dashboard → `payments` · CPD Assessment → `cpd-assessment` |

## 3. Standalone tools (`getToolsForRole('quantity_surveyor')` → 7)
fee_calculator, sans_forms, drawing_register, doc_control_issue, cpd_standalone, boq_takeoff, valuation_cert

Categories spanned: fee_calculator, compliance, drawing, document_control, cpd, estimating, payment.

## 4. Lifecycle participation
- **feasibility/appointment:** fee_calculator, boq_takeoff → produces cost plans.
- **design_development:** drawing_register, doc_control_issue, boq_takeoff (BoQ refinement).
- **tender_procurement:** boq_takeoff (packages), fee_calculator.
- **construction_execution → closeout:** valuation_cert (valuations/payment certification, final account).
- **continuous:** cpd_standalone.

## 5. Governance gates
- Valuations (`valuation_cert`) require contractor/client evidence; payment release stays human-confirmed.
- Cannot certify professional design compliance — `sans_forms` prepared only.

## 6. Workflow verification & gaps
- ⚠ **Workflow finding #1 — orphaned role:** `quantity_surveyor` appears **only** in the `toolboxes` nav module — no Command Centre, Inbox, Projects, or Messages. The role has full `TOOLBOX_CONFIG` and 7 registry tools but cannot reach a project, inbox, or messages through nav. Either add `quantity_surveyor` to the relevant nav modules or treat it as a `bep`/`admin` subtype at the auth layer. See `_CROSS_ROLE_FINDINGS.md`.
- ⚠ AI-guided mode exposes 5 curated tools across 2 groups; tiles mode surfaces 7. Document tools (`drawing_register`, `doc_control_issue`, `sans_forms`) only reachable via "All tools" toggle.
- ⚠ AI-guided group routes (`procurement`, `design`, `packages`, `payments`, `cpd-assessment`) — verify each pageId resolves, especially given the orphaned nav.
