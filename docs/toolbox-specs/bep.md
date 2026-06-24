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
