# Autonomous Implementation Log

Start: 2026-05-16 00:55 UTC
Branch: phase-2-verification-workflows
Scope source: BACKEND_HTML_OUTSTANDING_ITEMS.md
Domain target: architex.co.za
Hosting target: shared hosting with MySQL

## Operating constraints
- Stay within BACKEND_HTML_OUTSTANDING_ITEMS.md scope.
- Production code only. No fake completed workflows, mock data, placeholders, or simulated integrations.
- If external credentials or hosting details are required and unavailable, document blockers here.
- Keep this file updated with tasks completed, tests run, and blockers.

## Timeline
- 00:55 UTC: Started autonomous 5-hour implementation window.
- 00:56 UTC: Read outstanding-items scope and inspected repo/scripts. Identified DashboardPageShell and canonical matrix as key implementation surface.

## Completed tasks
- Created goal and visible todo list.
- Read BACKEND_HTML_OUTSTANDING_ITEMS.md.
- Checked git branch/status.
- Confirmed `backend.html` is only a role/tool requirements reference, not an implementation source.
- Added `ProjectCommandCentre` component backed by live Firestore `jobs` and `projects` subscriptions with role-specific Next Best Action, current stage, approvals/requirements, risk, documents, budget/payments, AI summary, key dates, and recent activity.
- Wired the `command` page to the new `ProjectCommandCentre` for all roles instead of the advisory shell/legacy role dashboard fallback.
- Added login role cards for subcontractor and supplier and corrected BEP wording to design-team/professional meaning.
- Fixed `api/index.ts` syntax regression and completed role-aware profile sanitization for client, BEP/architect, contractor, subcontractor, supplier, freelancer, and admin.
- Added directory profile projection on first auth sync for searchable role/profile discovery.
- Added subcontractor and supplier onboarding paths with package/trade/supply, service region, warranty/support, and close-out evidence fields.
- Added `docs/deployment/shared-hosting-architex-co-za.md` documenting Node shared-hosting deployment, static fallback, DNS/Firebase checklist, and the honest MySQL migration gap.
- Added production `npm start` script for Node-capable shared hosting.
- Validation passed: `npm run lint`.
- Validation passed: `npx vitest run src/lib/__tests__/dashboard-registry.static.test.ts` (11 tests).
- Validation passed: `npm run build`.
- Added role-aware sidebar group headings: Account, Project, Client Tools, BEP Tools, Contractor Tools, Freelancer Tools, System.
- Added deterministic nav test IDs for canonical dashboard pages.
- Added `ProjectWorkflowPage` and routed implemented shared pages (`journey`, `messages`, `programme`, `disputes`, `payments`, `contracts`, `escrow`, `municipal-tracker`, `construction`, `snagging`) to production composed modules instead of the generic shell.
- Composed workflow pages from existing live services/components: `StageProgressTracker`, `GanttChart`, `RFIManager`, `SiteLogManager`, `CloseoutWizard`, `FinancialDashboard`, `MunicipalTracker`, and `InvoiceManagement` where applicable.
- Validation passed after workflow routing: `npm run lint`.
- Validation passed after workflow routing: `npx vitest run src/lib/__tests__/dashboard-registry.static.test.ts` (12 tests).
- Validation passed after workflow routing: `npm run build`.
- Added production `GuidedBriefWizard` for `client-intake`, persisting `project_briefs`, authenticated evidence uploads, attachment metadata, advisory interpretation, and optional `marketplace_opportunities` publication.
- Extended uploaded file context typing to include `brief` evidence uploads.
- Validation passed after guided brief routing: `npm run lint`.
- Validation passed after guided brief routing: `npx vitest run src/lib/__tests__/dashboard-registry.static.test.ts src/services/__tests__/briefWorkflowService.test.ts` (19 tests).
- Validation passed after guided brief routing: `npm run build`.

## In progress
- Continuing scoped implementation with remaining shell-to-production workflow conversions.

## Validation notes

- Login workflow hotfix: removed `Workflow unavailable` failure path from shared workflow/command projections by replacing composite-index-dependent `where + orderBy` reads and broad project reads with Firestore rules-safe/default-index-safe queries plus client-side recent sorting. Validation passed: `npm run lint`, dashboard registry static tests (34 tests), `npm run build`, Chromium sidebar harness (5 passed), direct `api-router.security` rerun (62 passed), and clean FTP staging asset scan. Full `npm test` hit the known suite-level `api-router.security` timeout once, while the direct file rerun passed.
- Full unit suite `npm test`: 53 test files passed, 396/396 tests passed after prioritizing `sameOriginGuard` before `apiLimiter` for cross-origin state-changing requests.
- Targeted e2e `npm run test:e2e -- e2e/auth.spec.ts e2e/sidebar-harness.spec.ts`: 8 passed before host dependency failures for WebKit/Mobile Safari (`libgtk-4.so.1`, `libgraphene-1.0.so.0`, etc.) and Playwright report server timeout. Not treated as product pass.
- Contractor bid flow: connected `ContractorDashboard` Prepare Bid to the real `BidSubmission` component and `tenderService.submitBid`, with attachment upload support via existing upload service. Validation passed: `npm run lint && npm run build`.
- Deployment prep: added `.env.production.example`, `scripts/predeploy-check.mjs`, and `npm run predeploy:check`. Validation passed: `npm run lint && npm run predeploy:check`.
- Client proposal comparison: added `ClientProposalComparison` for `client-proposals`, loading real client jobs/applications, building advisory comparison records via `marketplaceWorkflowService`, and using the existing human-confirmed `/api/jobs/:jobId/applications/:applicationId/accept` appointment/project-initiation API. Validation passed: `npm run lint`, `npx vitest run src/lib/__tests__/dashboard-registry.static.test.ts src/services/__tests__/marketplaceWorkflowService.test.ts` (20 tests), and `npm run build`.
- Upload bundle: added `npm run deploy:bundle` and generated `release/architex-co-za-upload-bundle.tgz` (1.5 MB) after successful build and predeploy checks.
- BEP technical brief: added `TechnicalBriefEditor` for `technical-brief`, loading published `marketplace_opportunities`, writing `technical_briefs`, adding advisory interpretation records under `project_briefs/{briefId}/interpretations`, and marking opportunity technical brief status. Validation passed: `npm run lint`, `npx vitest run src/lib/__tests__/dashboard-registry.static.test.ts src/services/__tests__/briefWorkflowService.test.ts` (21 tests), and `npm run build`.
- Directory search: added `DirectorySearch` for `directory-search`, querying real `directoryProfiles`, filtering by role/region/free text, and writing human-review `directoryInvitations` for proposal/package/supplier/team invite flows. Validation passed: `npm run lint`, `npx vitest run src/lib/__tests__/dashboard-registry.static.test.ts src/services/__tests__/roleProfileService.test.ts` (18 tests), and `npm run build`.
- API security: moved `sameOriginGuard` before `apiLimiter` so cross-origin state-changing requests are rejected before route handlers and rate-limit side effects. Validation passed: targeted security test and full `npm run lint && npm test`.
- Package/procurement workspace: added `PackageProcurementWorkspace` and routed `packages`/`procurement` to it. It subscribes to live `tender_packages`, bids, package procurement commitments, delivery evidence, RFIs, programme tasks, site logs, inspections, and snags; computes readiness through `assessContractorWorkflow`; supports BEP/admin tender creation through `TenderWizard`; and writes human-review procurement request records without issuing orders/payments/contracts automatically. Validation passed: `npm run lint`, targeted dashboard/package/contractor workflow tests (26 tests), and `npm run build`.
- Client progress reports: added `ClientProgressReports` for `client-progress`, projecting plain-language report status from live `jobs`, `projects`, `gantt_tasks`, and `council_submissions`; added PDF download via `pdf-lib`; and persisted `project_progress_reports` audit snapshots with human approval required. Validation passed: `npm run lint`, dashboard registry static tests (18 tests), and `npm run build`.
- AI drawing checker: added `AIDrawingChecker` for `drawing-checker`, combining the production file upload/quick-scan path with live `jobs/*/submissions` review archive, review metrics, sign-off counts, visual report links, and clear freelancer pre-check vs BEP professional review wording. Validation passed: `npm run lint`, targeted dashboard/FileManager/gemini tests (33 tests), and `npm run build`.
- Tasks & approvals: added `TasksApprovalsPage` for `tasks`, subscribing to live visible job task cards and project approvals, allowing BEP/admin/architect task creation and persisted task status updates while keeping approvals/payments/signatures in dedicated human-confirmed workflows. Validation passed: `npm run lint`, dashboard registry static tests (20 tests), `npm run build`, and full `npm test` exit 0.
- Resource centre/checklists: added `ResourceCentre` for `resource-centre`, loading active `agent_knowledge`, filtering by search/discipline, persisting `resource_checklists`, and allowing checklist status tracking for submission readiness. Validation passed: `npm run lint`, dashboard registry static tests (21 tests), and `npm run build`.
- Admin console routing: routed `admin-console` directly to the production `AdminDashboard` governance console instead of the generic shell. Validation passed: `npm run lint` and dashboard registry static tests (22 tests).
- Design & compliance: added `DesignCompliancePage` for `design`, reusing production `ResponsibilityMatrix`, `TeamBuilder`, `subscribeToProjectByJobId`, `subscribeToTeam`, and `getDisciplineCoverage` to show live discipline gaps and team invitations. Validation passed: `npm run lint`, dashboard/team tests (28 tests), and `npm run build`.
- Knowledge route: routed `knowledge` to the production `ResourceCentre` so role users see live `agent_knowledge` and checklist records instead of the generic shell. Validation passed: `npm run lint` and dashboard registry static tests (24 tests).
- Project toolbox: added `ProjectToolboxPage` for `toolbox`, wrapping the production `FileManager` with role/governance context for traceable files, evidence, and drawing quick scans. Validation passed: `npm run lint` and dashboard/FileManager tests (27 tests).
- Freelancer submissions: added `FreelancerSubmissionsPage` for `freelancer-submissions`, subscribing to live assigned task cards by `assigneeId`, persisting task status changes, and embedding production `FileManager` for deliverable uploads/evidence. Validation passed: `npm run lint`, dashboard/FileManager tests (28 tests), and `npm run build`.
- Deployment bundle refreshed after latest committed UI changes: `npm run deploy:bundle` completed successfully and produced `release/architex-co-za-upload-bundle.tgz`; predeploy check passed and listed required production environment variables.
- Full unit regression after latest route/workspace conversions: `npm test` completed successfully with Vitest exit 0. The stderr output is from expected negative-path AI parsing tests, not a product failure.

- BEP freelancer jobs: added `BEPFreelancerJobsPage` for `bep-freelancers`, using live selected BEP jobs, live freelancer `directoryProfiles`, and persisted task records under both `jobs/{jobId}/tasks` and `delegatedTasks` with human approval required for agreements/payments/sign-off. Validation passed: `npm run lint`, dashboard registry static tests (31 tests), and `npm run build`.
- Contractor staff/wages/plant: added `ContractorStaffPlantPage` for `contractor-staff`, backed by live `contractor_staff_records`, `contractor_plant_records`, and `contractor_wage_records`, with wage entries explicitly marked for human review and no payroll/payment release triggered. Validation passed: `npm run lint`, dashboard registry static tests (30 tests), and `npm run build`.
- AI co-pilot: added `AICoPilotPage` for `ai`, exposing active `agent_knowledge`, admin pending-review governance through `AgentKnowledgeManager`, and direct routing to governed AI drawing checker/tasks/resource workflows without simulated chatbot output. Validation passed: `npm run lint`, dashboard registry static tests (29 tests), and `npm run build`.
- Freelancer assigned work: routed `freelancer-work` to the existing production `FreelancerDashboard`, exposing live assigned job cards, task status updates, and project chat instead of the generic shell. Validation passed: `npm run lint`, dashboard registry static tests (28 tests), and `npm run build`.
- Resource sharing: added `ResourceSharingPage` for `resource-sharing`, backed by live `resource_listings`, `resource_bookings`, and `resource_usage_logs`, using the production `resourceBookingService` for conflict audits and usage billing ledger entries. Booking confirmation, usage logging, and payment release remain human-governed. Validation passed: `npm run lint`, dashboard/resource booking tests (38 tests), and `npm run build`.

- CPD assessment: split browser-safe scoring into `cpdScoring`, kept certificate hashing in the Node-only `cpdService`, and added `CPDAssessmentPage` for `cpd-assessment` using live `cpd_assessments` and persisted `cpd_attempts`; passed attempts are marked for human/statutory certificate review, with no auto-sync. Validation passed: `npm run lint`, dashboard/CPD tests (40 tests), and `npm run build`.
- SANS/compliance forms: added `SANSComplianceFormsPage` for `sans-forms`, showing live stored `jobs/*/submissions` AI review records, findings, sign-off checklists, trace logs, and `ComplianceReport` output without auto-certifying forms. Validation passed: `npm run lint`, dashboard registry static tests (32 tests), and `npm run build`.
- Final validation after latest workflow conversions: full `npm test` completed successfully with Vitest exit 0. Expected stderr/stdout appears from negative-path service tests.
- Final validation after SANS forms register: full `npm test` completed successfully with Vitest exit 0.
- Final deployment artifact refreshed after SANS forms register: `npm run deploy:bundle` completed successfully after building 3045 modules, passing `predeploy:check`, and regenerating `release/architex-co-za-upload-bundle.tgz` for architex.co.za upload preparation.
- Final deployment artifact refreshed: `npm run deploy:bundle` completed successfully after building 3044 modules, passing `predeploy:check`, and regenerating `release/architex-co-za-upload-bundle.tgz` for architex.co.za upload preparation.

- Final validation after CPD assessment workflow: full `npm test` completed successfully with Vitest exit 0.
- Final deployment artifact refreshed after CPD assessment workflow: `npm run deploy:bundle` completed successfully after building 3047 modules, passing `predeploy:check`, and regenerating `release/architex-co-za-upload-bundle.tgz` for architex.co.za upload preparation.

- Additional OS validation: `npm run docs:api-contracts` completed successfully (58 routes mentioned, 12 contract docs, 118 JSON blocks validated, no uncovered documented routes requiring examples).
- Additional OS validation: `npm run lint:tests` completed successfully with full project TypeScript `tsc --noEmit` exit 0.

- Registry cleanup: removed stale “shell pending” summary text from implemented routes. Validation passed: `npm run lint`, dashboard registry static tests (33 tests), and `npm run build`.

- Browser OS testing found a Chromium sidebar harness failure on Municipal Status because Vite fallback HTML was parsed as JSON by municipal API calls. Patched `MunicipalTracker` to only parse JSON responses when the content type is JSON and to treat unavailable API endpoints as a non-console-error empty state. Validation passed: `npm run lint`, dashboard registry static tests (33 tests), and `npm run build`.
- Deployment artifact refreshed after registry cleanup: `npm run deploy:bundle` completed successfully after building 3047 modules, passing `predeploy:check`, and regenerating `release/architex-co-za-upload-bundle.tgz`.

- Browser OS validation after MunicipalTracker guard: `PLAYWRIGHT_HTML_OPEN=never npx playwright test --project=chromium e2e/sidebar-harness.spec.ts --reporter=line` completed successfully with 5/5 Chromium sidebar harness checks passing.
- Final deployment artifact refreshed after MunicipalTracker guard and browser validation: `npm run deploy:bundle` completed successfully after building 3047 modules, passing `predeploy:check`, and regenerating `release/architex-co-za-upload-bundle.tgz` for architex.co.za upload preparation.

- Broader browser OS validation: `PLAYWRIGHT_HTML_OPEN=never npx playwright test --project=chromium --reporter=line` completed successfully with 18/18 Chromium e2e tests passing.
- Final unit regression after browser OS sweep: `npm test` completed successfully with 53 test files and 413/413 tests passing. Expected stderr/stdout appears from negative-path service tests only.


- Role navigation matrix coverage: added a static registry invariant that pins all 38 canonical dashboard pages for all 8 canonical roles, closing the backend.html testing backlog item for role/page navigation coverage and guarding against accidental role exposure or removal. Validation passed: `npm run lint -- --pretty false`, `npx vitest run src/lib/__tests__/dashboard-registry.static.test.ts`, `npm run build`, and direct `npx vitest run src/lib/__tests__/api-router.security.test.ts`. Full `npm test` reached the known suite-level `api-router.security` cross-origin timeout once, while the direct file rerun passed 62/62.

## Blockers / items requiring owner input later
- Shared-hosting control panel, MySQL credentials, domain DNS/FTP/cPanel access are not present in this workspace. I will prepare deploy artifacts and instructions, but cannot upload without credentials.
- CPD statutory certificate issuance/sync still requires real professional-body provider credentials and configuration. The browser UI now records attempts with certificate review pending, but does not auto-issue or auto-sync certificates.

- Uploaded media optimization pass: introduced a reusable `OptimizedImage` wrapper with default lazy loading, async decoding, responsive `sizes`, fetch-priority handling, no-referrer policy, and safe error marking; applied it to architect portfolio galleries, profile-editor portfolio thumbnails, File Manager image cards, and site-log photo thumbnails. Marked the portfolio/uploaded-media image optimization backlog item complete. Targeted validation passed: `npm run lint -- --pretty false` and `npx vitest run src/components/ui/optimized-image.test.tsx src/components/__tests__/FileManager.quickscan.test.tsx` (5 tests).
- Dashboard keyboard navigation: added role-aware Alt-key shortcuts for logged-in workspaces (Alt+1-9 for the first visible canonical pages, Alt+K command, Alt+A AI, Alt+P profile, Alt+F files, Alt+I invoicing where permitted), ignored shortcuts while typing in editable fields, surfaced a sidebar shortcut legend, and marked the keyboard-shortcut UX backlog item complete. Validation passed: npm run lint -- --pretty false; npx vitest run src/lib/__tests__/dashboard-registry.static.test.ts (47 tests); npm run build; and full npm test (57 files, 449 tests).

- Onboarding role taxonomy alignment: added explicit `architect` signup/onboarding cards alongside BEP/design-team, subcontractor, supplier, freelancer, client, and contractor paths; reused the existing architect-specific SACAP onboarding form; clarified BEP copy to broader design-team roles; and pinned static coverage so every non-admin onboarding role remains visible while admin remains `/admin` only. Validation passed: `npm run lint -- --pretty false`, `npx vitest run src/lib/__tests__/dashboard-registry.static.test.ts` (48 tests), `npm run build`, and full `npm test` (58 files, 454 tests). Expected stderr/stdout appears from negative-path service tests only.


- Canonical profile workspace: routed the shared `profile` dashboard page to a production workspace that combines `UserSettings` with the real `ProfileEditor` modal for display name, bio, SACAP/profile data, and portfolio media. Added static registry coverage to keep the profile route pinned to the production workspace instead of regressing to the generic shell. Validation passed: `npm run lint -- --pretty false`, `npx vitest run src/lib/__tests__/dashboard-registry.static.test.ts`, `npm run build`, `npm run lint:tests -- --pretty false`, and direct rerun of the 12 files that full `npm test` could not start because of Vitest fork worker timeouts. Full `npm test` executed 48 files/346 tests successfully before 12 worker-start timeouts; those 12 files passed on direct rerun (114 tests).


- Quiet-hours implementation pass (2026-05-20 05:55 SAST): hardened directory/resource production UX by windowing Directory Search results behind an incremental load-more control for large profile sets, adding result-count feedback, and separating Resource Centre checklist discipline input from the library discipline filter so creating a checklist no longer changes the active resource filter. Validation passed: `npm run lint -- --pretty false`, `npm run build`, `npm run lint:tests -- --pretty false`, and `npm run predeploy:check`. Targeted Vitest reruns were blocked by the current WSL/Windows-mount Vitest worker startup timeout before any tests loaded.

## Hermes oversight directive — 2026-05-20 late SAST

# Hermes Oversight Directive — Overnight PRD Completion

Timestamp: 2026-05-20 late SAST
Owner instruction: finish the Architex PRD overnight and keep JCode/agents on goal.

## Non-negotiables

- Stay aligned to `prdnew.md`, `FULL_SCOPE_IMPLEMENTATION_PLAN_2026-05-20.md`, `Full_scope.md`, `backend.html`, and `BACKEND_HTML_OUTSTANDING_ITEMS.md`.
- Production code only: no fake integrations, no simulated success, no UI-only placeholders claiming backend completion.
- If an external provider, legal credential, professional body, payment gateway, municipal integration, or hosting feature is missing, implement a safe governance/readiness abstraction and document the blocker.
- Keep AI outputs advisory and human-gated. Do not auto-certify, auto-sign, auto-release funds, auto-approve compliance, or auto-sync statutory certificates.
- Keep commits small and safe. Run targeted tests and lint before committing.
- Do not push or deploy without explicit owner approval.
- Do not expose secrets in logs, commits, reports, or chat.

## Current verified state

- Branch: `phase-2-verification-workflows`.
- JCode is active with coordinator `bird` and worker sessions on P2/P3 resource sharing, CPD/statutory sync, and validation.
- Latest committed PRD slices:
  - `f47e2f73 test resource sharing governance`
  - `03f4aee3 feat: add CPD certificate sync governance`
- Focused verification passed after those commits:
  - `npx vitest run src/services/__tests__/resourceBookingService.test.ts src/services/__tests__/cpdService.test.ts` — 23 tests passed.
  - `npm run lint -- --pretty false` — passed.
- API subdomain has a temporary cPanel PHP health endpoint. Full Node API remains blocked because cPanel Passenger/Node apps are disabled on the package.

## Overnight focus order

1. Re-read JCode goal/todos and repo status before editing.
2. Finish P2/P3 governance/readiness primitives that are still realistically implementable without vendor credentials.
3. For each slice:
   - inspect existing service/tests first,
   - implement the smallest production-safe primitive,
   - add or extend targeted tests,
   - run focused tests and `npm run lint -- --pretty false`,
   - commit only if clean and validated,
   - append concise entry to `AUTONOMOUS_IMPLEMENTATION_LOG.md`.
4. If JCode is still actively editing, supervise instead of racing it. Only intervene when it is idle, blocked, looping, or drifting.
5. Before morning report, run a final live status: git status, latest commits, active JCode sessions, targeted tests for overnight commits, and live smoke checks.

## Suggested remaining PRD areas to inspect next

- Marketplace analytics and directory governance/readiness.
- Supplier/RFQ lifecycle beyond prequalification if provider-neutral primitives are missing.
- Resource booking payout/readiness and dispute/audit boundaries.
- CPD statutory sync provider readiness, verification evidence, expiry/revocation handling.
- Admin governance visibility for pending human approvals, disputes, payments, AI actions, statutory sync and audit queues.
- API deployment package/readiness now that `api.architex.co.za` has isolated FTP access but Node hosting is blocked.

## 2026-05-21T00:04:23+02:00 Hermes oversight run
- Observed JCode coordinator processes active, but no active repo edits/tests in progress; branch phase-2-verification-workflows was clean and ahead of origin.
- Implemented smallest PRD-safe marketplace analytics/readiness slice: provider-neutral marketplace analytics snapshot with category/location demand buckets, proposal/status counts, and explicit governance flags preventing AI auto-appointment and excluding personal data.
- Extended marketplaceWorkflowService focused coverage for advisory analytics aggregation and no PII leakage.
- Validation: npx vitest run src/services/__tests__/marketplaceWorkflowService.test.ts - 7 tests passed; npm run lint -- --pretty false - passed.
- Blockers: none for this local slice; no push/deploy performed.

## 2026-05-21T00:34:35+02:00 Hermes oversight run
- Observed JCode coordinator processes active, with clean tracked worktree before intervention and no repo edits/tests in progress; branch remained phase-2-verification-workflows ahead of origin.
- Implemented smallest PRD-safe supplier/RFQ lifecycle slice: provider-neutral RFQ quote response award-readiness ranking with shortlist/prequalification checks, expiry/budget/exclusion warnings, explicit human award gate, and AI award prohibition.
- Extended procurementWorkflowService focused coverage for ready award review and blocked/non-shortlisted/expired/prequalification-blocked responses.
- Validation: npx vitest run src/services/__tests__/procurementWorkflowService.test.ts - 10 tests passed; npm run lint -- --pretty false - passed.
- Blockers: no external credentials required for this local governance slice; no push/deploy performed.


## 2026-05-21T00:59:58+02:00 Hermes oversight run
- Observed JCode coordinator/server processes active, with no active repo edits/tests in progress; branch phase-2-verification-workflows was clean before this slice and ahead of origin.
- Implemented smallest PRD-safe admin governance visibility slice: provider-neutral admin queue summary for human approvals/disputes/payments/AI reviews/statutory sync/audit exceptions with overdue/blocked/critical counts, human-gate flags, AI non-resolution guard, and PII-redaction default.
- Extended governanceService focused coverage for queue aggregation, redaction defaults, closed-item exclusion, and non-sensitive unredacted summaries.
- Validation: npx vitest run src/services/__tests__/governanceService.test.ts - 7 tests passed; npm run lint -- --pretty false - passed.
- Blockers: no external credentials required for this local governance slice; no push/deploy performed.
