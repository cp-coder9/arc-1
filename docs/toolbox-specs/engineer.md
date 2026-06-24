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
