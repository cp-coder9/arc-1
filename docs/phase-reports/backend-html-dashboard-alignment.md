# Backend HTML Dashboard Alignment Review

Date: 2026-05-15  
Agent: Dashboard Reference Review swarm agent  
Canonical reference: `backend.html`

## Executive summary

`backend.html` defines a broad role-based dashboard shell with shared workflow pages plus role-specific client, BEP/design-team, contractor, subcontractor/supplier, freelancer, and admin tools. The current React implementation only partially matches this reference. It has working dashboard components for client, architect, BEP, contractor, freelancer, admin, and firm workspace, but the sidebar/page model is much narrower and uses legacy role naming (`architect`) alongside newer `bep`.

Most gaps are frontend/product-surface gaps rather than isolated widget bugs: the implementation does not expose the canonical shared pages (`Command Centre`, `Project Toolbox`, `Project Journey`, `Tasks & Approvals`, `Project Messenger`, `Programme / Gantt`, `Dispute Resolution`, `Payments`, `Contracts`, `Escrow`, `AI Co-Pilot`) as first-class dashboard pages. Several components exist that could support these pages, but they are not wired into the same role/page matrix from `backend.html`.

No backend/API files were edited.

## Files inspected

Reference:
- `backend.html`

Routing/navigation:
- `src/App.tsx`

Role dashboards:
- `src/components/ClientDashboard.tsx`
- `src/components/ArchitectDashboard.tsx`
- `src/components/BEPDashboard.tsx`
- `src/components/ContractorDashboard.tsx`
- `src/components/FreelancerDashboard.tsx`
- `src/components/AdminDashboard.tsx`
- `src/components/FirmDashboard.tsx`

Supporting components observed:
- `src/components/ProfileEditor.tsx`
- `src/components/InvoiceManagement.tsx`
- `src/components/FileManager.tsx`
- `src/components/Chat.tsx`
- `src/components/GanttChart.tsx`
- `src/components/MunicipalTracker.tsx`
- `src/components/SiteLogManager.tsx`
- `src/components/TeamBuilder.tsx`
- `src/components/ResponsibilityMatrix.tsx`
- `src/components/RFIManager.tsx`
- `src/components/CloseoutWizard.tsx`
- `src/components/FeeEstimator.tsx`
- `src/components/KnowledgeSources.tsx`
- `src/components/AdminKnowledgeUploader.tsx`
- `src/components/MunicipalSettingsAdmin.tsx`
- `src/components/FinancialDashboard.tsx`

## Visual inspection notes

Attempted browser rendering of `backend.html` via the Jcode browser bridge. The bridge binaries were installed but the live bridge was not responding. Attempted Chrome DevTools MCP with the local file URL, but the target closed during page creation. Because of that, this review used source-level extraction of the static HTML sections, role nav buttons, headings, and page descriptions.

Source-level inspection still shows the reference dashboard structure clearly:
- A left nav with role-filtered buttons using `data-page` and `data-roles`.
- Shared workflow pages for all user roles.
- Role-specific groups for client, BEP, contractor, freelancer, and admin tools.
- `subcontractor` is grouped with supplier in the role selector and procurement/package pages.

No screenshot was produced because browser automation was unavailable.

## Canonical role/page matrix from `backend.html`

### Shared pages for client, BEP, contractor, subcontractor/supplier, freelancer, admin

| Page id | Label | Canonical requirement |
|---|---|---|
| `profile` | Profile Editor | Complete editable profile reused for verification, contracts, invoices, SANS/compliance forms, procurement, escrow, AI matching, and governance. |
| `command` | Command Centre | Role-aware command landing page. Present in nav as active default, although no matching `<section id="command">` was extracted. |
| `toolbox` | Project Toolbox | Layman-friendly walkthrough/tooling, especially to help clients describe projects without technical knowledge. |
| `journey` | Project Journey | Lifecycle navigation across the project, role-aware rather than isolated modules. |
| `tasks` | Tasks & Approvals | Prioritised action clarity, filterable by role, risk, deadline, approval type, and project stage. |
| `messages` | Project Messenger | Job-linked communication for instructions, comments, queries, decisions, summaries, and notifications. |
| `programme` | Programme / Gantt | Shared project programme engine with role-specific views. |
| `disputes` | Dispute Resolution | Disputes/issues raised from workflow items and linked to project, contract, message, payment, or deliverable context. |
| `payments` | Payments & Governance | Pay buttons, payment gateway, escrow routing, payable party clarity, governance state. |
| `contracts` | Contracts & Signing | Contract generation/signing from project scopes, accepted proposals, tender outcomes, work packages, and packages. |
| `escrow` | Escrow Service | Cross-workflow escrow allocations for professional milestones, freelancers, contractor progress, and package payments. |
| `ai` | AI Co-Pilot | Contextual AI explanations, routing, reminders, preparation, and approval prompts. |

Additional shared/common pages:
- `invoicing`: BEP, contractor, freelancer, admin.
- `knowledge`: BEP, contractor, subcontractor, freelancer, admin.

### Client required pages/tools

| Page id | Label | Implementation status |
|---|---|---|
| `profile` | Profile Editor | Partially available as `My Settings` via `UserSettings`; BEP-style `ProfileEditor` is not the canonical first-class page for client. |
| `command` / dashboard | Command Centre | Partial. `ClientDashboard` has a welcome hero, active jobs, and portfolio. It does not match the canonical command centre module set. |
| `client-intake` | Guided Brief Wizard | Missing as canonical guided brief wizard. Current client flow has `Post New Job`, title/description/category/budget/deadline style posting. |
| `client-proposals` | BEP Proposal Comparison | Partial/missing. Client job cards can show applications and accept an architect, but not the canonical comparison table with fit, fee, timeline, risk notes, AI summary. |
| `directory-search` | Directory Search | Missing from sidebar/client dashboard. Supporting marketplace/search concepts exist elsewhere but not client-visible manual directory invite. |
| `municipal-tracker` | Municipal Status | Missing from client nav/dashboard as a clean read-only municipal status window. `MunicipalTracker` component exists. |
| `client-progress` | Progress Reports | Missing first-class plain-language progress reports page. |
| `messages` | Project Messenger | Partial. Job cards expose `Chat`, but no project messenger page. |
| `programme` | Programme / Gantt | Missing first-class client programme/progress view. `GanttChart` exists. |
| `disputes` | Dispute Resolution | Partial. Client can file disputes from job cards, but no dispute centre page. |
| `payments` / `contracts` / `escrow` | Financial/legal workflow | Partial/missing. `Invoices` exists globally, but canonical payments, contracts, escrow governance pages are not surfaced. |
| `ai` | AI Co-Pilot | Missing first-class page. |

### BEP / architect / design-team required pages/tools

`backend.html` uses role `bep` for the design team. Current code has both `architect` and `bep`, with significantly different dashboards. This is a major alignment issue.

| Page id | Label | Implementation status |
|---|---|---|
| `profile` | Profile Editor | Partial. `BEPDashboard` has a profile visibility card and `ProfileEditor` trigger. `ArchitectDashboard` has marketplace profile/application flows. Not unified as canonical profile page. |
| `design` | Design & Compliance | Partial. `ArchitectDashboard` has coordination/construction/closeout tabs and supporting components; `BEPDashboard` is lighter and task/marketplace focused. No canonical `design` page id in sidebar. |
| `drawing-checker` | AI Drawing Checker | Missing. No first-class drawing checker page found in dashboard nav. |
| `municipal-tracker` | Municipal Tracker | Partial. `MunicipalTracker` component exists, admin has municipal tab, BEP/architect nav does not expose canonical municipal tracker page. |
| `sans-forms` | SANS / Compliance Forms | Missing first-class form autofill page. |
| `bep-marketplace` | Client Marketplace | Partial. `BEPDashboard` has marketplace/recommended jobs. `ArchitectDashboard` also has marketplace/applications. Naming and route ids do not match. |
| `bep-team` | Design Team Matrix | Partial. `ArchitectDashboard` exposes Team & Freelancers and coordination. `BEPDashboard` does not expose the full matrix. |
| `technical-brief` | Technical Brief Editor | Missing first-class BEP technical brief editor. |
| `bep-freelancers` | Freelancer Jobs | Partial. `ArchitectDashboard` has delegated tasks/team flows. `BEPDashboard` does not expose a canonical freelancer jobs page. |
| `snagging` | Snagging / Close-Out | Partial. `ArchitectDashboard` has closeout tab. BEP dashboard does not expose canonical snagging/close-out page. |
| `procurement` | BoQ / BoM Procurement | Missing/unclear. No first-class BEP procurement route in app sidebar. |
| `invoicing` | Invoicing | Partial. Global `Invoices` nav exists. |
| `knowledge`, `resource-sharing`, `resource-centre`, `cpd-assessment` | Knowledge/resources/CPD | Partial/missing. Knowledge components exist, but resource sharing, resource centre, CPD assessment pages are not exposed for BEP. |

### Contractor required pages/tools

| Page id | Label | Implementation status |
|---|---|---|
| `command` / dashboard | Command Centre | Partial. `ContractorDashboard` has a contractor portal, tender marketplace, and firm-ready/compliance readiness cards. Very narrow versus reference. |
| `directory-search` | Directory Search | Missing. |
| `municipal-tracker` | Municipal Status | Missing first-class contractor municipal status page. |
| `construction` | Construction OS | Partial/missing. Current contractor page mentions tender marketplace and readiness but does not provide a construction operating system. `SiteLogManager`, `RFIManager`, `GanttChart`, and closeout components could help. |
| `contractor-staff` | Staff, Wages, Plant & Resources | Missing. |
| `procurement` | BoQ / BoM Procurement | Missing first-class page. |
| `packages` | Subcontractor Packages | Missing first-class page. |
| `snagging` | Snagging / Close-Out | Missing first-class contractor snagging/rectification page. |
| `invoicing` | Invoicing | Partial via global `Invoices`. |
| `knowledge` | Knowledge / CPD | Missing from contractor sidebar. |
| Shared payments/contracts/escrow/disputes/AI/programme/messages/tasks | Shared workflows | Mostly missing or only indirectly available through active jobs, files, invoices, audit logs. |

### Subcontractor / supplier required pages/tools

| Page id | Label | Implementation status |
|---|---|---|
| Role availability | Subcontractor / Supplier | Missing. Current `App.tsx` does not route `subcontractor` or `supplier` to a dashboard. No `SubcontractorDashboard.tsx` or `SupplierDashboard.tsx` found. |
| `procurement` | BoQ / BoM Procurement | Missing. |
| `packages` | Subcontractor Packages | Missing. |
| Shared pages | Profile, command, toolbox, journey, tasks, messages, programme, disputes, payments, contracts, escrow, AI, knowledge | Missing because role has no dashboard route/navigation. |

This is the largest role coverage gap. `backend.html` treats subcontractor/supplier as a first-class role group for package-level delivery and procurement interaction. Current implementation appears not to support it at the dashboard layer.

### Freelancer required pages/tools

| Page id | Label | Implementation status |
|---|---|---|
| `freelancer-work` | Assigned Work | Partial. `FreelancerDashboard` shows active job cards from assigned tasks and allows status updates. |
| `freelancer-submissions` | Submissions & Feedback | Partial/missing. Status updates and file/task context exist, but no dedicated submissions/revisions/feedback page. |
| `design` | Design & Compliance | Missing from freelancer dashboard/sidebar. |
| `drawing-checker` | AI Drawing Checker | Missing. |
| `resource-sharing` | Remote Desktop / Resources | Missing. |
| `resource-centre` | Resource Centre / Checklists | Missing. |
| `invoicing` | Invoicing | Partial via global `Invoices`. |
| `knowledge` | Knowledge / CPD | Missing from freelancer sidebar. |
| Shared payments/contracts/escrow/disputes/AI/programme/messages/tasks | Shared workflows | Mostly missing; `Chat` exists inside job cards but no shared messenger/tasks/programme pages. |

### Admin required pages/tools

| Page id | Label | Implementation status |
|---|---|---|
| `admin-console` | Admin Whole-System Governance Console | Partial. `AdminDashboard` is broad and includes submissions, agents, users, jobs, reviews, knowledge, disputes, logs, municipal, fees, financial, firms, etc. It is closest to reference but uses different tab names/page ids. |
| `design` | Design & Compliance | Missing as admin-exposed canonical page. |
| `sans-forms` | SANS / Compliance Forms | Missing first-class admin page. |
| `technical-brief` | Technical Brief Editor | Missing first-class admin page. |
| `snagging` | Snagging / Close-Out | Missing/unclear. Closeout not visible as admin page. |
| `construction` | Construction OS | Missing as admin page. |
| `procurement` | BoQ / BoM Procurement | Missing first-class admin page. |
| `packages` | Subcontractor Packages | Missing first-class admin page. |
| Shared pages | Profile, command, toolbox, journey, tasks, messages, programme, disputes, payments, invoicing, contracts, escrow, AI, knowledge | Partial. Admin has disputes, knowledge, logs, fees, financial, but not the canonical shared page matrix. |

## Current implementation routing/nav mismatches

Current `src/App.tsx` sidebar exposes:
- All roles: `Overview`, `Active Projects`, `Audit Logs`, `Invoices`, `Files`, `My Settings`.
- Client: `Post a Job`, `Fee Estimator`.
- Architect: `Firm Workspace`, `Marketplace`, `My Applications`, `Team & Freelancers`, `Coordination`, `Fee Estimator`.
- Contractor: `Tender Marketplace`.
- Admin: `Compliance Hub`, `User Management`, `LLM Settings`, `Knowledge Base`, `Fees`, `Financial`, `Firms`.

Canonical `backend.html` expects many more role-filtered pages and labels. The implementation currently lacks a data-driven nav matrix equivalent to the HTML's `data-page` / `data-roles` configuration.

Specific mismatches:
1. `command` nav exists in `backend.html` but current app uses `overview`.
2. `profile` exists in `backend.html`; current app uses `profile-settings`/`My Settings` and sometimes embedded `ProfileEditor`.
3. `client-intake` is not equivalent to current `post-job`.
4. `bep` and `architect` are split roles in current app. Canonical reference uses `bep` for design team. A migration/alias strategy is needed.
5. No first-class `subcontractor`/`supplier` dashboard route exists.
6. Many support components exist but are not assembled into canonical pages.
7. Global tools such as `Files`, `Invoices`, and `Audit Logs` are exposed, but canonical financial/governance pages require more granular `payments`, `contracts`, `escrow`, and `invoicing` flows.

## Recommended frontend alignment plan

1. Introduce a data-driven dashboard page registry mirroring `backend.html`:
   - page id
   - label
   - role allow-list
   - component or placeholder component
   - feature flag / backend readiness metadata

2. Normalize role naming:
   - Decide whether `architect` becomes a BEP subtype, or whether `bep` and `architect` remain separate but share the same canonical BEP toolset.
   - Add routing behavior so both `architect` and `bep` can access BEP/design-team pages where appropriate.

3. Add `subcontractor`/`supplier` dashboard support:
   - Add route/render branch in `App.tsx`.
   - Create `SubcontractorDashboard.tsx` or package-focused dashboard.
   - Expose shared pages plus `procurement` and `packages`.

4. Convert current dashboards from isolated role landing pages into page-aware components:
   - `ClientDashboard` already accepts `activeTab`, but only implements limited cases.
   - `ArchitectDashboard` accepts `activeTab` and has many internal tabs.
   - `BEPDashboard`, `ContractorDashboard`, and `FreelancerDashboard` should accept `activeTab` and map canonical page ids to sections.

5. Reuse existing components for canonical pages:
   - `Chat` -> `messages`
   - `GanttChart` -> `programme`
   - `MunicipalTracker` -> `municipal-tracker`
   - `InvoiceManagement` -> `invoicing`, with separate `payments`/`escrow` later
   - `KnowledgeSources`/`AdminKnowledgeUploader` -> `knowledge`
   - `SiteLogManager`, `RFIManager`, `CloseoutWizard` -> `construction`/`snagging`
   - `TeamBuilder`, `ResponsibilityMatrix` -> `bep-team`/`design`

6. Add intentional placeholder pages for missing backend-dependent tools rather than hiding them:
   - Drawing checker
   - SANS/compliance form autofill
   - Technical brief editor
   - Staff/wages/plant
   - Procurement/package workflows
   - Remote desktop/resource sharing
   - CPD assessment
   - Contracts/signing
   - Escrow
   - AI co-pilot

## Recommended backend/API dependencies

The following backend capabilities appear necessary to fully implement `backend.html`:

- Role/profile projection API that distinguishes client, BEP, contractor, subcontractor/supplier, freelancer, admin, firms, professional registrations, tax/payment data, verification state.
- Guided client brief persistence and AI interpretation output.
- Technical brief editor persistence and client-brief-to-BEP refinement workflow.
- Proposal comparison data model: fit, fee, timeline, risk notes, AI summary, status, appointment action.
- Directory search/invitation API across verified individuals and firms.
- Municipal tracker data model with role-specific read/write views and evidence uploads.
- Programme/task engine with role-specific filtering and approval state.
- Project messenger with message decisions, instructions, linked workflow items, AI summaries.
- Drawing checker file upload/review API and standards/configuration model.
- SANS/compliance form autofill templates and generated document storage.
- Design team matrix/responsibility dependencies.
- Freelancer work package lifecycle, submissions, revisions, feedback, and payment milestones.
- Contractor operating system domain: site logs, RFIs, inspections, staff/wages/plant/resources, productivity.
- BoQ/BoM procurement and package models, separated from subcontractor package management.
- Subcontractor/supplier package acceptance, progress, claim, procurement, and payment states.
- Snagging/close-out list, rectification, evidence, professional sign-off.
- Payments, gateway, escrow ledger, invoices, claims, payable-party routing, payout governance.
- Contract generation/signing from scopes/proposals/packages.
- AI co-pilot orchestration, explainability, user approval, and audit logs.
- Knowledge/CPD/resource centre content, assessments, and role-targeted onboarding.

## Safe frontend fixes considered

I did not edit frontend files because this task requested coordination before safe fixes and the current repo has multiple uncommitted changes from other agents, including backend/API-owned files. The safest immediate change would be report-only.

Good next frontend PRs would be:
1. Add `docs`-driven page registry with disabled/placeholder statuses.
2. Add `SubcontractorDashboard` placeholder and nav exposure.
3. Rename or alias BEP/architect dashboard labels so `backend.html` terminology is reflected.
4. Wire existing support components into canonical page ids where possible.

## Tests/build checks

Performed:
- `wc -l backend.html`
- Extracted canonical section ids/headings/descriptions from `backend.html` with a Python script.
- Extracted canonical nav role matrix from `backend.html` with a Python script.
- Inspected dashboard component outlines with `agentgrep`.
- Inspected `src/App.tsx` sidebar/rendering logic.
- Checked `package.json` scripts and `git status --short`.

Not run:
- `npm run lint` or `npm run build`, because no code changes were made and the working tree already contains unrelated in-progress changes owned by other agents. Running full validation would not validate this documentation-only report and could conflate existing unrelated failures.

## Blockers and follow-ups

Blockers:
- Browser visual inspection was blocked by unavailable browser bridge and Chrome DevTools target closure.
- Working tree contains uncommitted changes by other agents, including files explicitly out of scope for this agent.
- Canonical role model conflict remains unresolved: `backend.html` uses `bep`; current app uses both `architect` and `bep`.
- No dashboard implementation exists for `subcontractor`/`supplier`.

Follow-ups:
1. Product/architecture decision: map `architect` to BEP, keep both, or migrate all design-team users to `bep` with discipline metadata.
2. Create dashboard page registry and role matrix tests that compare app nav coverage against `backend.html`-derived expectations.
3. Add visual regression/manual browser review once browser tooling is available.
4. Coordinate with API/backend owners on missing endpoints before implementing payments, contracts, escrow, drawing checker, SANS forms, procurement, package, and CPD workflows.
