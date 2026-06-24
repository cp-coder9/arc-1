# Site Manager Toolbox Spec

**Role key:** `site_manager` · **UserRole:** ✅ · **TOOLBOX_CONFIG:** ✅ · **Nav:** Toolboxes (only)

## 1. Identity
- **Title:** Site Manager Toolbox
- **Subtitle:** Site operations, H&S, programme delivery, and daily site management tools.
- **Scope:** Construction site management tools for daily operations, resource tracking, and quality control.
- **Responsibilities:** Manage site programme and daily operations · Track labour, plant, material resources · Monitor H&S and quality compliance.
- **Handoff boundaries:** Cannot issue design changes · Cannot approve payment releases without contractor sign-off.

## 2. AI-guided toolbox groups
| Group | Tools (→ pageId) |
|-------|------------------|
| Site operations and resources | Staff, Wages & Plant → `contractor-staff` · Programme / Gantt → `programme` · Site Delivery → `construction` |
| Quality and delivery control | Snag List / Defects → `snagging` · BoQ / BoM Procurement → `procurement` · Subcontractor Packages → `packages` |

## 3. Standalone tools (`getToolsForRole('site_manager')` → 13)
ai_drawing_checker, sans_forms, drawing_register, technical_brief, doc_control_issue, cpd_standalone, site_diary_entry, rfi_generator, workforce_timesheet, plant_register, snag_creator, freelancer_resource_centre, hs_compliance.

Categories spanned: drawing, compliance, document_control, briefing, cpd, site_management, resource_centre.

## 4. Lifecycle participation
- **construction_execution:** site_diary_entry, workforce_timesheet, plant_register, rfi_generator, hs_compliance, doc_control_issue — daily operations, resource tracking, H&S monitoring.
- **tender_procurement → construction_execution:** procurement (BoQ/BoM), packages (subcontractor).
- **closeout:** snag_creator, snagging — defect tracking and rectification.
- **continuous:** cpd_standalone, freelancer_resource_centre, drawing_register, sans_forms.

## 5. Governance gates
- No design authority — `ai_drawing_checker` / `sans_forms` advisory and reference only; design changes routed to professionals.
- Payment releases blocked — site manager cannot approve without contractor sign-off.
- `hs_compliance` monitored on-site; statutory H&S accountability stays with the principal contractor.

## 6. Workflow verification & gaps
- ⚠ **#1 Orphaned role.** `site_manager` appears ONLY in the `toolboxes` navigation module — no Command Centre, Inbox, Projects, or Messages. A site-facing role with no project context, action queue, or communication surface is a significant gap, since daily site management is inherently project-bound. Recommend adding Command Centre, Projects, and Inbox nav.
- ✅ AI-guided routes (`contractor-staff`, `programme`, `construction`, `snagging`, `procurement`, `packages`) valid.
- ⚠ AI-guided mode surfaces grouped construction routes, but core standalone field tools — `site_diary_entry`, `workforce_timesheet`, `plant_register`, `rfi_generator`, `hs_compliance` — are reachable only via "All tools". Recommend a "Daily site control" group (site diary / timesheets / plant / H&S) so the role's primary daily workflow is in guided mode.
