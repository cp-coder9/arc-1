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
