# Freelancer Toolbox Spec

**Role key:** `freelancer` · **UserRole:** ✅ · **TOOLBOX_CONFIG:** ✅ · **Nav:** Command Centre, Inbox, Toolboxes, CPD & Learning, Messages, My Account (NO Projects, NO Documents, NO Marketplace, NO Finance)

## 1. Identity
- **Title:** Freelancer Work Toolbox
- **Subtitle:** Assigned tasks, submissions, feedback, drawing checks, resources, and invoice preparation.
- **Scope:** Freelancer tools are task-scoped and do not grant project-owner, contractor, or statutory authority.
- **Responsibilities:** Complete assigned deliverables · Submit revisions and feedback evidence · Use resource/checklist support for quality control.
- **Handoff boundaries:** Cannot appoint project team members · Cannot certify statutory compliance or release invoices.

## 2. AI-guided toolbox groups
| Group | Tools (→ pageId) |
|-------|------------------|
| Assigned deliverables | Assigned Work → `freelancer-work` · Submissions & Feedback → `freelancer-submissions` |
| Quality and resources | AI Drawing Checker → `drawing-checker` · Resource Centre → `resource-centre` |

## 3. Standalone tools (`getToolsForRole('freelancer')` → 6)
ai_drawing_checker, payment_claim_builder, cad_upload_check, freelancer_timesheet, deliverable_submission, freelancer_resource_centre.

Categories spanned: drawing, payment, site_management, resource_centre.

## 4. Lifecycle participation
- **design_development:** ai_drawing_checker, cad_upload_check, deliverable_submission (drawing/CAD deliverables + revisions).
- **construction_execution:** freelancer_timesheet (logged effort against assigned tasks).
- **closeout / invoice prep:** payment_claim_builder (invoice preparation, not release).
- **continuous:** freelancer_resource_centre (checklists and quality-control resources).

## 5. Governance gates
- AI drawing checks advisory only (`ai_drawing_checker`); supervisor/sign-off gate applies.
- Task-scoped — cannot appoint team members or certify statutory compliance.
- Invoice preparation only (`payment_claim_builder`); release requires accountable approval.

## 6. Workflow verification & gaps
- ✅ AI-guided routes (`freelancer-submissions`, `drawing-checker`, `resource-centre`) valid.
- ⚠ Verify the AI-guided pageId `freelancer-work` exists as a route — the registry's `deliverable_submission` tool uses `freelancer-submissions`. Possible drift between the guided group route and the standalone tool route.
- ⚠ AI-guided mode surfaces 4 curated tools of 6 standalone. Missing from guided flow: `payment_claim_builder` (invoice prep), `cad_upload_check`, `freelancer_timesheet`. Consider an "Invoice & timesheet" group to match registry breadth.
- ✅ Scope alignment: freelancer registry omits Projects/Documents/Marketplace/Finance nav — consistent with task-scoped claim.
