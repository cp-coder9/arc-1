# Energy Professional Toolbox Spec

**Role key:** `energy_professional` · **UserRole:** ✅ · **TOOLBOX_CONFIG:** ✅ · **Nav:** Toolboxes (only)

## 1. Identity
- **Title:** Energy Toolbox
- **Subtitle:** SANS 10400-XA energy compliance, modelling, and sustainability assessment tools.
- **Scope:** Energy compliance and sustainability design tools. Professional sign-off required for statutory submissions.
- **Responsibilities:** Energy modelling and SANS 10400-XA compliance · Prepare energy compliance certificates · Coordinate sustainability strategy.
- **Handoff boundaries:** Cannot issue structural or fire sign-off · AI compliance checks advisory only.

## 2. AI-guided toolbox groups
| Group | Tools (→ pageId) |
|-------|------------------|
| Energy compliance | SANS / Compliance Forms → `sans-forms` · Design & Compliance → `design` · AI Drawing Checker → `drawing-checker` |
| Professional development | Technical Brief Editor → `technical-brief` · CPD Assessment → `cpd-assessment` |

## 3. Standalone tools (`getToolsForRole('energy_professional')` → 13)
fee_calculator, fenestration_calc, rvalue_calc, ai_drawing_checker, sans_forms, drawing_register, technical_brief, doc_control_issue, cpd_standalone, payment_dashboard, freelancer_resource_centre, xa_compliance_calc, energy_certificate.

Categories spanned: fee_calculator, compliance, drawing, document_control, briefing, cpd, payment, resource_centre.

## 4. Lifecycle participation
- **appointment:** fee_calculator, technical_brief.
- **concept_design / design_development:** fenestration_calc, rvalue_calc, xa_compliance_calc, ai_drawing_checker, drawing_register, doc_control_issue.
- **municipal_submission:** sans_forms, energy_certificate (XA compliance certificate).
- **continuous:** cpd_standalone, payment_dashboard, freelancer_resource_centre.

## 5. Governance gates
- AI drawing/compliance checks advisory only — XA certification requires accountable professional sign-off.
- `energy_certificate` prepared, never auto-issued for statutory submission.
- `payment_dashboard` view-only.

## 6. Workflow verification & gaps
- ⚠ **#1 Orphaned role.** `energy_professional` appears ONLY in the `toolboxes` navigation module — no Command Centre, Inbox, Projects, or Messages. The role can use tools but has no project context, action queue, or communication surface. Recommend adding at least Command Centre + Projects nav for lifecycle participation.
- ✅ AI-guided routes (`sans-forms`, `design`, `drawing-checker`, `technical-brief`, `cpd-assessment`) valid.
- ⚠ AI-guided mode exposes 5 of 13 tools. Missing from guided flow: `fenestration_calc`, `rvalue_calc`, `xa_compliance_calc`, `energy_certificate`, `drawing_register`. Recommend an "Energy modelling" group (R-value / fenestration / XA calc) and a "Certification" group (energy_certificate) to match registry breadth.
