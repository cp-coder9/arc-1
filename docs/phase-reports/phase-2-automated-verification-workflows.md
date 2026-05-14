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
  - rejection reason enforcement
  - verified review metadata
- `src/services/__tests__/verificationAgentService.test.ts`
  - SACAP browser-agent verification path
  - no-simulation behavior when required data is missing
- `src/lib/__tests__/api-router.security.test.ts`
  - generalized verification submission route
  - queued browser verification agent metadata
  - legacy SACAP mirror creation
  - admin-only review route
  - review audit event persistence

## Validation Completed

```bash
npx vitest run src/services/__tests__/userVerificationService.test.ts src/services/__tests__/verificationAgentService.test.ts src/lib/__tests__/api-router.security.test.ts src/lib/__tests__/firestore-rules.static.test.ts
```

Result: 4 test files passed, 28 tests passed.

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
- Add scheduled re-verification for expiring records.
- Add richer admin review dialogs instead of `window.prompt` for rejection reasons.
- Add role-specific verification requirement gates before users can accept high-risk work.
