# Fire Engineer Toolbox Spec

**Role key:** `fire_engineer` · **UserRole:** ✅ · **TOOLBOX_CONFIG:** ✅ · **Nav:** Toolboxes (only)

## 1. Identity
- **Title:** Fire Engineer Toolbox
- **Subtitle:** Fire safety design, SANS 10400-T compliance, and rational fire engineering tools.
- **Scope:** Fire safety engineering tools. Rational designs require registered fire engineer sign-off.
- **Responsibilities:** Design fire safety systems · Prepare rational fire designs · Coordinate SANS 10400-T compliance.
- **Handoff boundaries:** Cannot certify structural stability · Fire compliance requires professional sign-off.

## 2. AI-guided toolbox groups
| Group | Tools (→ pageId) |
|-------|------------------|
| Fire compliance | Design & Compliance → `design` · AI Drawing Checker → `drawing-checker` · SANS / Compliance Forms → `sans-forms` |
| Design coordination | Technical Brief Editor → `technical-brief` · Remote Desktop / Resources → `resource-sharing` · CPD Assessment → `cpd-assessment` |

## 3. Standalone tools (`getToolsForRole('fire_engineer')` → 11)
fee_calculator, ai_drawing_checker, sans_forms, drawing_register, technical_brief, doc_control_issue, cpd_standalone, payment_dashboard, freelancer_resource_centre, fire_rational_design, fire_compliance_check.

Categories spanned: fee_calculator, compliance, drawing, document_control, briefing, cpd, payment, resource_centre.

## 4. Lifecycle participation
- **appointment:** fee_calculator, technical_brief.
- **concept_design / design_development:** ai_drawing_checker, fire_rational_design, drawing_register, doc_control_issue.
- **municipal_submission:** sans_forms, fire_compliance_check (SANS 10400-T).
- **continuous:** cpd_standalone, payment_dashboard, freelancer_resource_centre, resource-sharing.

## 5. Governance gates
- AI drawing/compliance checks advisory only — rational fire designs require registered fire engineer sign-off.
- `fire_compliance_check` prepared, never auto-certified for statutory submission.
- `payment_dashboard` view-only.

## 6. Workflow verification & gaps
- ⚠ **#1 Orphaned role.** `fire_engineer` appears ONLY in the `toolboxes` navigation module — no Command Centre, Inbox, Projects, or Messages. The role can use tools but has no project context, action queue, or communication surface. Recommend adding at least Command Centre + Projects nav for lifecycle participation.
- ✅ AI-guided routes (`design`, `drawing-checker`, `sans-forms`, `technical-brief`, `resource-sharing`, `cpd-assessment`) valid.
- ⚠ AI-guided mode exposes 6 of 11 tools. Missing from guided flow: `fire_rational_design`, `fire_compliance_check`, `drawing_register`, `fee_calculator`. Recommend a "Rational fire design" group (fire_rational_design / fire_compliance_check) so the role's core deliverables are reachable in guided mode.

## 7. Toolbox Framework Status

All fire engineer tools now participate in the Toolbox Capability Framework (`CalculatorDefinition` contract).

### Full-status tools (2)
| Tool | Definition ID | Method | Key clause coverage |
|------|---------------|--------|-------------------|
| fire_compliance_check | `fire_compliance_check_v1` | clauseSet | SANS 10400-T thresholds, occupancy classes |
| fire_rational_design | `fire_rational_design_v1` | clauseSet | Rational fire engineering, performance criteria |

### Preview-status tools (0)
All fire engineer tools have reached full status.

### Framework details
- **Methods used:** clauseSet
- **Versioned tables:** SANS 10400-T thresholds, fire resistance ratings, occupancy classifications
- **Rendering:** `DefinitionToolRunner` for all tools
- **Reports:** PDF/CSV export with clause outcomes (pass/fail/advisory), source versions, disclaimers
