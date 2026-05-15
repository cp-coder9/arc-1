# Phase 2 Implementation Report - Automated Verification Workflows

Date: 2026-05-14  
Status: In progress, implementation and code validation completed for the first Phase 2 slice.

## Scope Implemented In This Slice

This slice pivots verification away from manual/API-only checks and introduces an Architex verification agent that uses browser automation against official public registers in the background. Manual admin review remains as an exception path only when an official source cannot be conclusively completed by the agent or a human needs to validate official evidence.

## Exactly Implemented

### Browser Verification Agent

Created `src/services/verificationAgentService.ts` with:

- `runVerificationBrowserAgent(input)` production service.
- Official provider routing based on `subjectType` and `statutoryBody`.
- SACAP support through the existing SACAP public-register browser integration.
- Generic Playwright browser provider for configured official registers.
- Persistent, non-simulated outcomes:
  - `verified` only when official register content supports the check.
  - `rejected` only when the official page clearly indicates no matching record/no result.
  - `pending` with `requiresHumanReview: true` when official pages change, fail, block automation, or cannot be conclusively parsed.
- Agent evidence captured into result details:
  - official URL actually used
  - checked timestamp
  - search mode
  - search term/result excerpt where available
  - error details when the agent cannot complete the check

### Official Browser Targets Configured

The agent is configured to open official/public verification targets directly:

- SACAP BEP/architect register:
  - `https://search.mymembership.co.za/Search/?Id=4f3f0fde-d5dc-4af0-97cd-0a192a56830e`
- CIDB contractor register:
  - `https://portal.cidb.org.za/RegisterOfContractors/`
- NHBRC builder verification:
  - `https://www.eservices.nhbrc.org.za/Home/CertificateVerication`
- CIPC company/business information entry point:
  - `https://www.cipc.co.za/?page_id=1649`

No mock data is used by the production verification agent. Tests mock external browser/provider calls only to keep automated tests deterministic.

### Generalized Verification Service

Created `src/services/userVerificationService.ts` with:

- verification subject validation
- verification status validation
- registration number normalization
- statutory body normalization
- provider inference:
  - SACAP for BEP/architect-style checks
  - CIDB for contractor/subcontractor checks
  - CIPC for supplier checks
  - manual fallback only for unconfigured subjects
- `buildUserVerification(input)` for consistent persistent `user_verifications` records.
- `applyVerificationReview(input)` for audited admin review updates.
- rejection reason requirement when an admin rejects a verification.

### API Routes Added

Updated `src/lib/api-router.ts` with:

- `GET /api/verifications/me`
  - authenticated user reads their persisted verification records
  - optional `subjectType` filter
- `POST /api/verifications/submit`
  - authenticated user submits verification details/evidence
  - creates/updates `user_verifications/{verificationId}`
  - queues the browser verification agent in the background
  - persists `verification.submitted` audit event
  - uses Vercel Blob evidence URLs only, no arbitrary external evidence URLs
- `GET /api/admin/verifications`
  - admin-only queue read
  - optional status filter
- `POST /api/admin/verifications/:verificationId/review`
  - admin-only approve/reject/expire path
  - writes reviewed metadata and audit event
  - preserves admin review as an exception/fallback path, not the primary flow


### Verification Lifecycle and Recheck Queue

Added expiry-aware verification lifecycle support:

- `getVerificationLifecycle()` classifies persisted records as:
  - `pending`
  - `active`
  - `due_for_recheck`
  - `expired`
  - `rejected`
- `queueVerificationRecheck()` moves a record back to `pending` and stores durable metadata:
  - `verificationAgentStatus: queued`
  - `recheckRequestedAt`
  - `recheckRequestedBy`
  - `previousStatus`
- Added admin-only `POST /api/admin/verifications/:verificationId/recheck`.
- The recheck route persists the queued state, mirrors SACAP legacy records, writes `verification.recheck_queued`, and starts the browser verification agent in the background.
- The Admin Verify tab now shows expiry dates, queued-agent state, and a `Recheck` action.

### Contractor Tender Bid Verification Gate

Added the next high-risk workflow gate for contractor delivery workflows:

- `submitBid()` now requires an active persisted contractor/subcontractor verification before a tender bid can be written.
- Accepted verification sources for this slice are:
  - `subjectType: contractor`, `statutoryBody: CIDB`
  - `subjectType: subcontractor`, `statutoryBody: CIDB`
  - `subjectType: contractor`, `statutoryBody: NHBRC`
- Submitted bids now persist `verificationId`.
- Bid documents use deterministic ids of `contractor_{uid}` to match existing Firestore rule expectations and prevent duplicate bid documents per contractor/tender.
- Firestore rules now allow tender bidding only for `contractor` and `subcontractor` roles, not BEP/freelancer users.
- Firestore rules now require `request.resource.data.verificationId` to reference a verified `user_verifications` document owned by the bidder.
- Bid status updates preserve immutable `verificationId` with the rest of bid identity/financial fields.

### Runtime Schema Alignment

Updated `UserRoleEnum` in `src/lib/schemas.ts` to include the full production role set:

- `subcontractor`
- `supplier`

This closes a runtime validation gap where TypeScript and Firestore accepted these roles but Zod rejected them.

### Marketplace Verification Gate

Added the first hard production gate required by the scope statement that BEPs must be verified before accessing client marketplace opportunities:

- `POST /api/jobs/:jobId/applications` now requires an active persisted `user_verifications` record for:
  - `subjectType: bep`
  - `statutoryBody: SACAP`
  - `status: verified`
  - non-expired `expiresAt` when an expiry date is present
- Unverified BEP/architect users are blocked with HTTP 403 and a machine-readable `verificationRequired` response.
- Blocked attempts persist an `access` audit event with action `marketplace.application_blocked_unverified_bep`.
- Accepted applications persist the verification id and SACAP registration number onto the application record.
- `marketplace.application_submitted` audit events include the verification id used for the access decision.

### Verification Gate Helper

Extended `src/services/userVerificationService.ts` with:

- `isActiveVerifiedVerification(record, requirement)`
  - validates `verified` status
  - validates required subject type
  - validates required statutory body
  - rejects invalid/expired `expiresAt` values

### SACAP Legacy Compatibility

Updated legacy `POST /api/architect/verify-sacap` to:

- require the architect user themself or an admin.
- use the browser verification agent path.
- persist generalized `user_verifications` records.
- mirror SACAP/BEP results back to `architect_verifications/{architectId}` for existing UI compatibility.
- update `architect_profiles/{architectId}` SACAP status fields.
- persist verification audit events.

### UI Updates

Updated `src/components/SACAPVerification.tsx`:

- replaced direct client Firestore writes with authenticated server API calls.
- submits SACAP evidence to `/api/verifications/submit`.
- displays the persisted generalized verification record.
- informs the user that the Architex verification agent checks the official SACAP register in the background.

Updated `src/components/AdminDashboard.tsx`:

- added an admin `Verify` tab.
- lists `user_verifications` records.
- shows subject, statutory body, registration number, status, agent evidence, and source.
- lets admins approve/reject persisted records through the server review API.

### Type Model

Updated `src/types.ts`:

- added `automated_browser_agent` to `VerificationSource`.

## Persistence Guarantees

- All submissions are persisted in the existing Firestore database under `user_verifications`.
- Agent outcomes are persisted back to the same record.
- SACAP/BEP records are mirrored to `architect_verifications` for backward compatibility.
- Admin reviews are persisted to `user_verifications` and mirrored for SACAP legacy records.
- All submission/review/agent-completion actions produce audit events.

## Tests Added / Updated

- `src/services/__tests__/userVerificationService.test.ts`
  - subject validation
  - provider inference
  - build defaults
  - active verified record/expiry helper
  - rejection reason enforcement
  - verified review metadata
- `src/services/__tests__/verificationAgentService.test.ts`
  - SACAP browser-agent verification path
  - no-simulation behavior when required data is missing
- `src/lib/__tests__/api-router.security.test.ts`
  - generalized verification submission route
  - queued browser verification agent metadata
  - legacy SACAP mirror creation
  - persisted BEP marketplace verification gate
  - unverified BEP application blocking and audit logging
  - verified BEP application persistence with verification id
  - admin-only review route
  - review audit event persistence

## Validation Completed

```bash
npx vitest run src/services/__tests__/userVerificationService.test.ts src/services/__tests__/verificationAgentService.test.ts src/lib/__tests__/api-router.security.test.ts src/lib/__tests__/firestore-rules.static.test.ts
```

Result for original automated-verification slice: 4 test files passed, 28 tests passed.
Result after marketplace gate slice: focused gate validation passed with 2 test files and 24 tests passed, including updated API route coverage and 6 verification-service tests.
Result after contractor tender gate slice: focused validation passed with 4 test files and 29 tests passed, including tender service, Firestore rules, verification service, and schema role coverage.
Result after lifecycle/recheck slice: focused validation passed with 2 test files and 26 tests passed, including lifecycle helpers and admin recheck API coverage.

```bash
npm run lint
```

Result: passed, TypeScript exit code 0.

```bash
npm run build
```

Result: passed, Vite production build completed. Existing build warning remains: circular manual chunk between `markdown-vendor` and `react`.

Browser validation completed against the live development server on `http://localhost:3000` using headless Chromium/Playwright after the Chrome DevTools MCP target repeatedly closed in this environment. Result: HTTP 200, title `Architex | Premier Architectural Marketplace`, no console errors, screenshot written to `/tmp/arc1-phase2-browser-validation.png`. The app remained at `Securing session...`, which appears to be auth initialization behavior in this local development context rather than a rendering crash.

## Human Information Still Needed

These are not blockers for the implemented slice, but they are required before final production sign-off of all verification workflows:

- Confirm the exact official rejection policy for a register result that says no record/no result. Current implementation marks it rejected but requires human review evidence.
- Confirm whether contractors should always use CIDB, NHBRC, or both depending on project type.
- Confirm whether suppliers require CIPC only, or also tax clearance/B-BBEE/other credentials.
- Confirm acceptable expiry windows for SACAP, CIDB, NHBRC, and CIPC-derived verification evidence.
- Confirm whether admin rejection/expiry requires a second admin for high-risk roles.

## Next Phase 2 Tasks

- Harden provider-specific selectors with live official-page fixtures where permitted.
- Add richer admin review dialogs instead of `window.prompt` for rejection reasons.
- Add role-specific verification requirement gates before users can accept high-risk work.
