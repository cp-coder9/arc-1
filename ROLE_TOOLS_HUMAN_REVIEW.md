# Role Tools Human Review

Date: 2026-05-17 15:05 UTC  
Branch: `phase-2-verification-workflows`  
Scope source: `backend.html` role-tool reference  
Production target verified: `https://test.architex.co.za/`

## Summary

This autonomous pass created and deployed additional production role tools required by `backend.html`, focusing on the highest-impact pages still missing first-class implementations. All implemented pages use live Firestore collections, existing services, and human-confirmed governance boundaries. No mock, placeholder, or simulated production data was added.

## Completed implementation slices

### 1. Shared role workflow tools
Commit: `bc7493ed Implement shared role workflow tools`

- Added `ProjectMessengerPage` for job-linked live messages.
- Added `ContractSigningPage` for read-only contract, milestone, and escrow readiness tracking.
- Added `DisputeResolutionPage` for participant-visible dispute filing and monitoring.
- Routed `messages`, `contracts`, and `disputes` through `ProjectWorkflowPage`.
- Updated Firestore rules for participant access to disputes, appointment contracts, and escrow-related records.

### 2. Package construction operations
Commit: `558ff0c5 Implement package construction operations workspace`

- Added `PackageConstructionOpsPage` for contractor, subcontractor, and supplier construction workflows.
- Reads live package-linked records from:
  - `rfis`
  - `site_logs`
  - `gantt_tasks`
  - `site_inspections`
  - `package_snags`
- Allows eligible roles to create real package-linked RFIs, site logs, and programme tasks.
- Routed package-led `construction` view for contractor-side roles instead of dead-ending on project-only lifecycle data.

### 3. BEP Client Marketplace and Design Team Matrix
Commit: `33c8648d Implement BEP marketplace and team matrix tools`

- Added `BEPClientMarketplacePage`.
  - Reads live open `jobs`.
  - Reads the current BEP/architect user's applications from `jobs/{jobId}/applications`.
  - Lets BEP/architect users submit real proposal applications into the same client comparison workflow.
  - Keeps appointment, contract, and escrow steps separate and human-confirmed.
- Added `DesignTeamMatrixPage`.
  - Reads live `projects` where the current user is lead architect/design professional, or all projects for admin.
  - Reads linked `jobs` and registered professional profiles.
  - Reuses production `ResponsibilityMatrix`, `TeamBuilder`, and `teamService` discipline coverage logic.
  - Shows real missing/filled disciplines and invitation workflow, without synthetic team data.
- Added canonical dashboard entries for:
  - `bep-marketplace` / Client Marketplace
  - `bep-team` / Design Team Matrix

### 4. Canonical Invoicing and Package Close-Out/Snagging
Commit: `a025cb01 Implement package closeout and invoicing route`

- Added the missing `backend.html` canonical `invoicing` dashboard page for BEP/design-team, contractor, freelancer, and admin users.
- Routed `invoicing` through the existing production `InvoiceManagement` component instead of leaving it as a non-canonical legacy bottom-nav item.
- Added `PackageCloseoutPage` for contractor-side package snagging and close-out workflows.
- Reads live package-linked records from:
  - `tender_packages`
  - `package_snags`
  - `package_delivery_evidence`
  - `rfis`
  - `gantt_tasks`
  - `site_inspections`
- Evaluates real close-out readiness with `evaluatePackageReadiness` so open RFIs, incomplete programme tasks, missing evidence, failed inspections, and open snags become explicit blockers/warnings.
- Allows only the package creator, awarded contractor, or admin to create snag/evidence records.
- Stores submitted close-out evidence as `status: submitted` with `humanReviewRequired: true`; evidence is never auto-approved.
- Allows snag status updates only by admin, creator, or assigned/assignee user, with Firestore `assignedTo` ownership support added for package-linked records.

## Firestore rules deployment

The current local `firestore.rules` was deployed through the Firebase Rules API because the Firebase CLI deploy path still lacks Service Usage permission.

- Project: `gen-lang-client-0880960511`
- Database: `ai-studio-2ae3d9c3-70e6-4323-8a95-9d566bd24635`
- Active release: `projects/gen-lang-client-0880960511/releases/cloud.firestore/ai-studio-2ae3d9c3-70e6-4323-8a95-9d566bd24635`
- Active ruleset after latest pass: `projects/gen-lang-client-0880960511/rulesets/91b33553-e81d-48a4-b25e-8d95d01a7bc1`
- Deployed rules SHA256: `f696ebe6753632375252ccca923ef750bc86b22f51d50bd4d7115849eafb2129`
- Verification: deployed rules content SHA matched local `firestore.rules`.

Note: an earlier direct PATCH attempt created ruleset `f413f40b-cd4d-4d52-b164-dc6bd0f177f4` but did not attach it to the release due to an incorrect payload shape. The close-out/invoicing pass deployed the corrected release to `91b33553-e81d-48a4-b25e-8d95d01a7bc1`.

## Production deployment

- Built with relative Vite base: `npx vite build --base ./`
- Uploaded 74 production files by explicit FTPS from `release/ftp-upload` after adding `PackageCloseoutPage`.
- Live verification passed for:
  - `https://test.architex.co.za/`
  - `https://test.architex.co.za/admin`
  - `https://architex.co.za/architex.co.za/ai/`
- Browser verification found `BAD_RESOURCES none`.

## Validation results

All validation below passed after the role-tool changes:

1. Focused package construction validation
   - `npm run lint`
   - `npx vitest run src/lib/__tests__/dashboard-registry.static.test.ts src/lib/__tests__/firestore-rules.static.test.ts`
   - Result: 48 focused tests passed.

2. Focused BEP marketplace/team validation
   - `npm run lint`
   - `npx vitest run src/lib/__tests__/dashboard-registry.static.test.ts src/lib/__tests__/firestore-rules.static.test.ts`
   - Result: 49 focused tests passed.

3. Full TypeScript validation
   - `npm run lint:tests`
   - Result: passed.

4. Full unit regression
   - `npm test -- --testTimeout 20000`
   - Result: 55 test files passed, 426 tests passed.
   - Some expected negative-path stderr appears in tests for invalid AI JSON, PDF data missing, OCR no key, etc. Test suite exit was 0.

5. Role sidebar Playwright harness
   - `npx playwright test e2e/sidebar-harness.spec.ts --project=chromium --reporter=line`
   - Result: 8 passed.

6. Full Chromium Playwright E2E
   - `npx playwright test --project=chromium --reporter=line`
   - Result: 22 passed.

7. Live browser verification
   - Test root loaded.
   - Admin route loaded.
   - Existing architex AI path loaded.
   - No failed 4xx static resources.

8. Focused invoicing and package close-out validation
   - `npm run lint`
   - `npx vitest run src/lib/__tests__/dashboard-registry.static.test.ts src/lib/__tests__/firestore-rules.static.test.ts`
   - Result: 50 focused tests passed.

9. Latest close-out pass full validation and deployment
   - `npm run lint:tests`: passed.
   - `npm test -- --testTimeout 20000`: 55 test files passed, 426 tests passed.
   - `npx playwright test e2e/admin-review.spec.ts --project=chromium --reporter=line`: 3 passed after isolating an admin-route timing flake.
   - `npx playwright test --project=chromium --reporter=line`: 22 passed.
   - `npx vite build --base ./`: passed, 3058 modules transformed.
   - FTPS upload: 74 files uploaded to `https://test.architex.co.za/`.
   - Live browser verification: `https://test.architex.co.za/` loaded with `BAD_RESOURCES none`.
   - Firestore rules release patched to `projects/gen-lang-client-0880960511/rulesets/91b33553-e81d-48a4-b25e-8d95d01a7bc1`; deployed SHA matched local.

## Files intentionally not committed

These remain user/reference or generated artifacts and were intentionally not committed as production source changes:

- `BACKEND_HTML_OUTSTANDING_ITEMS.md`
- `backend.html`
- `12/`
- `release/`
- `dist/`
- `test-results/.last-run.json`

## Human follow-up / remaining known scope

No blocker stopped this pass.

Remaining large `backend.html` scope still worth future passes:

1. Convert any remaining generic shell-style surfaces into deeper end-to-end workflows only where a safe production service/rules path exists.
2. Continue deepening payment release, digital signing, and escrow actions behind explicit human confirmations and provider integration checks.
3. Reconcile long-term role taxonomy between `architect` and `bep`; this pass preserved compatibility by treating both as design-team roles.
4. Remove obsolete FTP/rules temp scripts if they are no longer useful, but do not delete credentials or deployment helpers without human confirmation.

## 2026-05-17 admin AI review and package close-out access pass

Scope followed from `backend.html`: keep AI outputs governed by a human/admin queue and expose package close-out tooling to the package delivery roles without changing existing workflow semantics.

Implemented:

1. Admin AI output review queue
   - Added `src/components/AdminAIReviewQueue.tsx` as a live admin-only queue for `ai_review_queue` records with `status == open`.
   - Reads linked immutable `ai_action_logs` for context and sorts client-side to avoid composite-index dependency.
   - Resolves queue items only through the production server endpoint `POST /api/admin/ai-review/:itemId/resolve` using the current Firebase ID token.
   - Optional human sign-off capture posts `humanSignOff` to the server endpoint; the browser still does not write directly to `ai_review_queue`, `ai_action_logs`, or `human_signoffs`.
   - Embedded the queue in the admin AI co-pilot above the existing admin knowledge review manager.

2. Package close-out access alignment
   - Expanded the canonical `Snagging / Close-Out` dashboard entry to include subcontractor and supplier roles in addition to design team, contractor, and admin.
   - Kept the production `PackageCloseoutPage` workflow as the package-role route for close-out evidence, snagging status, and human review-required submissions.

Validation completed for this pass:

- `npm run lint`
- `npx vitest run src/lib/__tests__/dashboard-registry.static.test.ts src/lib/__tests__/firestore-rules.static.test.ts src/lib/__tests__/api-router.security.test.ts --testTimeout 20000`
- Result: 3 test files passed, 113 tests passed.

Notes for human review:

- Admin AI review queue will appear empty unless production has open `ai_review_queue` records.
- Firestore rules intentionally block direct browser writes for AI governance records. Resolution must continue through the server API to preserve audit trails and human sign-off integrity.

## 2026-05-17 package claims, delivery and warranty evidence pass

Scope followed from `backend.html`: deepen subcontractor/supplier/package workflows without executing real payments, purchase orders, or approvals from the browser.

Implemented:

1. Package claims and payment applications
   - Extended `PackageProcurementWorkspace` with a live package claims / delivery register sourced from `package_procurement_commitments`.
   - Payment claim records remain `pending_approval` and clearly state that no invoice, escrow release, or payment is executed by the record.

2. Supplier delivery, shop drawing, warranty, manual and certificate evidence
   - Added package-linked evidence submission in `PackageProcurementWorkspace` for delivery notes, shop drawings, sample/material approvals, warranties, manuals, certificates, close-out documents, and payment claim support.
   - Evidence writes to `package_delivery_evidence` with `status: submitted`, `humanReviewRequired: true`, and source metadata for auditability.
   - Extended package close-out evidence types so package users can submit the same delivery/warranty/manual/certificate close-out evidence from the close-out page.

3. Package readiness gate alignment
   - Extended `DeliveryEvidenceType` to include `shop_drawing`, `sample_approval`, `warranty`, `manual`, `certificate`, and `payment_claim_evidence`.
   - Warranty/manual/certificate/shop-drawing/sample evidence can be marked required for close-out and blocks readiness until approved.
   - Payment claim support evidence is tracked, but does not become a close-out gate by default.

Validation completed for this pass:

- `npm run lint`
- `npx vitest run src/services/__tests__/packageReadinessService.test.ts src/lib/__tests__/dashboard-registry.static.test.ts src/lib/__tests__/firestore-rules.static.test.ts --testTimeout 20000`
- Result: 3 test files passed, 56 tests passed.

Notes for human review:

- This pass intentionally does not issue purchase orders, certify claims, create invoices, or release escrow. Those remain separate human-confirmed workflows.

Deployment and broad validation for package claims/evidence pass:

- Full TypeScript including tests: `npm run lint:tests` passed.
- Full unit regression: `npm test -- --testTimeout 20000` passed, 55 files / 429 tests.
- Chromium E2E: `npx playwright test --project=chromium --reporter=line` passed, 22/22 tests.
- Production build: `npx vite build --base ./` passed, 3059 modules.
- Uploaded 74 production files to the test host via explicit FTPS.
- Live verification passed at `https://test.architex.co.za/` with title `Architex | Built Environment OS`, zero bad resources, and latest bundle `index-DPHAeQp9.js` present.

## 2026-05-17 freelancer deliverable review and invoice-readiness pass

Scope followed from `backend.html`: deepen BEP freelancer work packages, assigned freelancer work, task payments, and freelancer invoice readiness without auto-paying or bypassing human BEP review.

Implemented:

1. BEP-created freelancer work packages now mirror atomically
   - `BEPFreelancerJobsPage` creates a single task id and writes it to both `jobs/{jobId}/tasks/{taskId}` and `delegatedTasks/{taskId}` in one Firestore batch.
   - The mirrored records carry `jobTaskId`, `submissionStatus`, and `paymentStatus` so BEP and freelancer views stay aligned.

2. Freelancer submission workflow
   - `FreelancerSubmissionsPage` now lets freelancers start/resume work and submit deliverables for BEP review.
   - Submission updates both the job task and delegated task record where available.
   - Submitted deliverables are marked `submissionStatus: submitted` and `paymentStatus: review_pending` only. No invoice or payment is created.

3. BEP review and invoice-readiness gate
   - BEPs can request changes or approve submitted freelancer deliverables for invoice readiness.
   - Approval sets `paymentStatus: ready_for_invoice` and records review feedback, but does not release funds or create a payable invoice.
   - Review buttons stay disabled until the freelancer has submitted the deliverable.

4. Firestore safety tightening
   - Added explicit helper rules for legacy task status changes, freelancer submissions, and BEP deliverable review.
   - Freelancers can only move deliverables to `review_pending` or back to `not_ready`; they cannot mark themselves `ready_for_invoice`.
   - BEPs can only mark `ready_for_invoice` after the task is already `submitted`.

Validation completed for this pass so far:

- `npm run lint`
- `npx vitest run src/lib/__tests__/dashboard-registry.static.test.ts src/lib/__tests__/firestore-rules.static.test.ts --testTimeout 20000`
- Result: 2 focused test files passed, 52 tests passed.

Human review note:

- This slice intentionally stops at invoice readiness. Actual invoice creation, certification, escrow release, and payment remain separate human-confirmed flows.

## 2026-05-17 procurement BoM and supplier catalogue pass

Scope followed from `backend.html`: deepen the BoQ / BoM + supplier tools listed under contractor/package procurement while staying inside live data and human-review boundaries.

Implemented:

1. Drawing-to-BoM Extractor
   - Added a first-class `Drawing-to-BoM Extractor` panel to `PackageProcurementWorkspace` for `procurement` mode.
   - Derives a procurement-ready BoM view only from live selected-package inputs:
     - contractor bid line items, when a bid exists for the current user;
     - tender package `scope` entries;
     - linked document names that look like drawings, details, schedules, specifications, BoQs, or BoMs.
   - Items without real priced bid totals are explicitly labelled `needs pricing`; the UI does not fabricate quantities, rates, or supplier prices.

2. Supplier API Catalogue projection
   - Added a live `Supplier API Catalogue` panel backed by `directoryProfiles` where `role == supplier`.
   - Ranks visible supplier profiles by real package keyword overlap and rating metadata where available.
   - Keeps quote/order/payment actions in the review-gated procurement record form instead of creating automatic purchase orders.

Validation completed for this pass:

- `npm run lint`
- `npx vitest run src/lib/__tests__/dashboard-registry.static.test.ts src/lib/__tests__/firestore-rules.static.test.ts src/services/__tests__/packageReadinessService.test.ts --testTimeout 20000`
- Result: 3 focused test files passed, 57 tests passed.

Human review note:

- This is a live projection/helper only. A future provider integration can replace the directory projection with real supplier APIs, but this pass avoids fake catalogue data and avoids automated purchasing.

Deployment and broad validation for freelancer review + procurement catalogue pass:

- Focused validation for freelancer review/rules: `npm run lint` plus dashboard/rules static tests passed, 2 files / 52 tests.
- Focused validation for procurement BoM/catalogue: `npm run lint` plus dashboard/rules/package-readiness tests passed, 3 files / 57 tests.
- Full TypeScript including tests: `npm run lint:tests` passed.
- Full unit regression: `npm test -- --testTimeout 20000` passed, 55 files / 429 tests.
- Admin route Playwright isolation after a startup timing flake: `npx playwright test e2e/admin-review.spec.ts --project=chromium --reporter=line` passed, 3/3.
- Full Chromium E2E rerun: `npx playwright test --project=chromium --reporter=line` passed, 22/22.
- Production build: `npx vite build --base ./` passed, 3059 modules transformed.
- Uploaded 74 production files to `https://test.architex.co.za/` by explicit FTPS.
- Live verification: `https://test.architex.co.za/` loaded with title `Architex | Built Environment OS`, zero bad resources, and the new production bundle visible.
- Firestore rules deployed through the Firebase Rules API:
  - Ruleset: `projects/gen-lang-client-0880960511/rulesets/ea480d08-b4e8-4081-a71e-1337b2b36364`
  - SHA256: `8901624179758a268a9f66722e84ae713b6d9ddebf0193c76ebb9a5f45a3fa73`
  - Verification: deployed rules SHA matched local `firestore.rules`.

## 2026-05-17 admin governance tool-set pass

Scope followed from `backend.html`: expose the admin Audit Trail Viewer, Tool Set Management, Payment Rate Settings, and AI Notification Feed as real admin-console surfaces without creating synthetic governance data or bypassing existing configuration workflows.

Implemented:

1. Admin governance tool hub
   - Added `AdminGovernanceToolsPanel` inside the production `AdminDashboard`.
   - Added a dedicated `Tool Sets` admin tab mapped by `governance-tools` so the route can be opened consistently from the dashboard shell.
   - Uses only live admin data already loaded by the dashboard: `agents`, `system_logs`, `users`, and `jobs`.

2. Audit Trail Viewer and AI Notification Feed
   - Audit Trail Viewer reads the live `system_logs` projection and displays the latest visible events read-only.
   - AI Notification Feed filters the same live log stream for AI, agent, LLM, review, sign-off, and governance events.
   - Empty states are explicit and do not generate mock alerts.

3. Tool Set Management and Payment Rate Settings bridge
   - Tool Set Management summarizes live agent records, statuses, roles, and execution modes.
   - Payment Rate Settings surfaces live user/job counts and role distribution, then links to the existing production fee settings tab instead of duplicating or fabricating rate data.

Validation completed for this pass so far:

- `npm run lint`
- `npx vitest run src/lib/__tests__/dashboard-registry.static.test.ts --testTimeout 20000`
- Result: 1 focused test file passed, 39 tests passed.

Human review note:

- This slice is source/UI only and did not change Firestore rules. The payment settings card links to the existing fee editor and does not create or modify payment rates by itself.

Deployment and broad validation for admin governance tool-set pass:

- Full TypeScript including tests: `npm run lint:tests` passed.
- Full unit regression: `npm test -- --testTimeout 20000` passed, 55 files / 430 tests.
- Full Chromium E2E: `npx playwright test --project=chromium --reporter=line` passed, 22/22 tests.
- Production build: `npx vite build --base ./` passed, 3059 modules transformed.
- Uploaded 74 production files to `https://test.architex.co.za/` by explicit FTPS.
- Live verification passed for the landing route and `/admin` route with zero bad resources.
- Direct deployed chunk verification passed for `assets/AdminDashboard-BC12cKUe.js`; it returned HTTP 200 and contained the new governance tool code.

## 2026-05-17 Construction OS admin routing pass

Scope followed from `backend.html`: make the canonical Construction OS page resolve to the existing live package operations workspace for all construction-governance roles, including admin, instead of sending admin through the generic project-only fallback.

Implemented:

- Updated `ProjectWorkflowPage` so `pageId === 'construction'` routes contractor, subcontractor, supplier, and admin users to `PackageConstructionOpsPage`.
- Kept the existing live-data construction workspace unchanged: it reads package-linked RFIs, site logs, programme tasks, inspections, and snags, and preserves its role-gated capture behavior.
- Updated the dashboard registry static test to assert that admin is included in the live Construction OS route.

Validation completed for this pass:

- `npm run lint`
- `npx vitest run src/lib/__tests__/dashboard-registry.static.test.ts --testTimeout 20000`
- Result: 1 focused test file passed, 39 tests passed.

Human review note:

- This was a routing/integration fix only. It did not add new writes, payment actions, approvals, or Firestore rule changes.

Deployment and broad validation for Construction OS admin routing pass:

- Full TypeScript including tests: `npm run lint:tests` passed.
- Full unit regression: `npm test -- --testTimeout 20000` passed, 55 files / 430 tests.
- Full Chromium E2E: `npx playwright test --project=chromium --reporter=line` passed, 22/22 tests.
- Production build: `npx vite build --base ./` passed, 3059 modules transformed.
- Uploaded 74 production files to `https://test.architex.co.za/` by explicit FTPS.
- Live verification passed for `https://test.architex.co.za/` with title `Architex | Built Environment OS` and zero bad resources.
- Direct deployed chunk verification passed for `assets/ProjectWorkflowPage-KO6qIE6i.js`; it returned HTTP 200 and contained the Construction OS, admin role, and package-linked collection strings.

## 2026-05-17 Drawing Register and transmittal control pass

Scope followed from `backend.html`: implement a formal Drawing Register and Transmittal Generator surface for drawing numbers, revisions, issue status, superseded records, and recipient transmittal logs.

Implemented:

- Added a production `DrawingRegisterPage` routed from the canonical `drawing-register` dashboard option for clients, architects, BEPs, and admins.
- The page reads live project records and nested `projects/{projectId}/documents`, `versions`, and `transmittals` subcollections. It does not use mock drawing data or local placeholders.
- Design managers can create drawing/register records, add revisions, supersede older revisions, and issue transmittal records against selected live revisions.
- Clients get a read-only register view with document status, latest revision, and transmittal history.
- Issued transmittals also create a linked `coordination_items` record so the document-control action appears in the broader coordination workflow.
- The UI explicitly states that external delivery, statutory approval, and legal sign-off remain human-confirmed. No email sending, municipal certification, payment action, or legal approval is automated.
- Firestore rules were extended for project documents, document versions, and transmittals with role-gated reads/writes and immutable record protections.

Validation completed for this pass so far:

- `npm run lint`
- `npx vitest run src/lib/__tests__/dashboard-registry.static.test.ts src/lib/__tests__/firestore-rules.static.test.ts --testTimeout 20000`
- Result: 2 focused test files passed, 53 tests passed.

Human review note:

- This slice creates document-control metadata and transmittal logs only. The human still needs to confirm any real-world issue/delivery outside the platform.

Deployment and broad validation for Drawing Register and transmittal control pass:

- Full TypeScript including tests: `npm run lint:tests` passed.
- Full unit regression: `npm test -- --testTimeout 20000` passed.
- Admin route Playwright isolation after a startup timing flake: `npx playwright test e2e/admin-review.spec.ts --project=chromium --reporter=line` passed, 3/3.
- Full Chromium E2E rerun: `npx playwright test --project=chromium --reporter=line` passed, 22/22.
- Production build: `npx vite build --base ./` passed, 3060 modules transformed.
- Uploaded 75 production files to `https://test.architex.co.za/` by explicit FTPS.
- Live verification passed for `https://test.architex.co.za/` with title `Architex | Built Environment OS` and zero bad resources.
- Direct deployed chunk verification passed for `assets/DrawingRegisterPage-B_bj1Mj8.js`; it returned HTTP 200 and contained the Drawing Register, transmittals, documents, coordination_items, and external-delivery disclaimer strings.
- Firestore rules deployed through the Firebase Rules API:
  - Ruleset: `projects/gen-lang-client-0880960511/rulesets/b85bddcd-9ec9-4531-ab4f-f0a878110a45`
  - SHA256: `4c1ba44d93fd61b0c73c149d2733b735cbc0e2864e5f46b8e2f8782425ea7455`
  - Verification: deployed rules SHA matched local `firestore.rules`.

## 2026-05-17 Programme Builder pass

Scope followed from `backend.html`: expand the Programme / Gantt tool into a project programme builder with baseline/current/forecast dates, dependencies, look-ahead planning, recovery programme notes, and human-reviewed baseline changes.

Implemented:

- Upgraded the existing production `GanttChart` component into a `Programme Builder` while preserving its live `projects/{projectId}/gantt_tasks` data source through `constructionService`.
- Added baseline start/end, current start/end, forecast end, dependency IDs, critical-path marker, recovery programme note, baseline-change reason, baseline review status, and human-approval flag fields to live programme task records.
- Added programme control panels for critical/delayed tasks, 14-day look-ahead, dependency-linked tasks, recovery items, and pending baseline reviews.
- Added a clear human-review disclaimer: the tool does not approve extensions of time, payment claims, or contract changes.
- Extended `GanttTask` typing and Firestore rules for nested project programme tasks with bounded fields and role/project access checks.

Validation completed for this pass:

- Focused validation: `npm run lint && npx vitest run src/lib/__tests__/dashboard-registry.static.test.ts src/lib/__tests__/firestore-rules.static.test.ts src/services/__tests__/constructionService.test.ts --testTimeout 20000` passed, 3 files / 60 tests.
- Full TypeScript including tests: `npm run lint:tests` passed.
- Full unit regression: `npm test -- --testTimeout 20000` passed.
- Admin route Playwright isolation after the known startup timing flake: `npx playwright test e2e/admin-review.spec.ts --project=chromium --reporter=line` passed, 3/3.
- Full Chromium E2E rerun: `npx playwright test --project=chromium --reporter=line` passed, 22/22.
- Production build: `npx vite build --base ./` passed, 3060 modules transformed.
- Uploaded 75 production files to `https://test.architex.co.za/` by explicit FTPS.
- Live verification passed for `https://test.architex.co.za/` with title `Architex | Built Environment OS` and zero bad resources.
- Direct deployed chunk verification passed for `assets/CloseoutWizard-C2nuYmFS.js`; it returned HTTP 200 and contained Programme Builder, baselineStartDate, forecastEndDate, Critical path, humanApprovalRequired, and the no-automatic-approval disclaimer.
- Firestore rules deployed through the Firebase Rules API:
  - Ruleset: `projects/gen-lang-client-0880960511/rulesets/1e72418d-7da8-44a1-85a4-9c5a3dcb1883`
  - SHA256: `2aefc2f93262623833b4c3de600ccaecba73f7d95ab713e7e37342f30aba3aa1`
  - Verification: deployed rules SHA matched local `firestore.rules`.

Human review note:

- Baseline-change reasons are stored as pending human review metadata only. No extension-of-time, claim, payment, or contract variation is approved by this UI.
