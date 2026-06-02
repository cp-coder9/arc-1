# Phase 5 Report: Guided Client Briefs and BEP Technical Briefs

Date: 2026-05-15
Branch: `phase-2-verification-workflows`
Scope source: `Full_scope.md` sections 9 and 10

## Implemented

### Guided Client Brief Wizard backend
- Added persistent `client_briefs/{briefId}` records for layman-friendly client intake.
- Added authenticated client-only `POST /api/client-briefs` to create a guided brief.
- Added owner/admin `PUT /api/client-briefs/:briefId` to update a guided brief before technical finalization.
- Added authorized `GET /api/client-briefs/:briefId` to return the guided brief and linked technical brief when allowed.
- Captured Full_scope wizard data:
  - What the client is trying to achieve.
  - Selected layman option.
  - Site/address context.
  - Existing plans status.
  - Whether work already exists.
  - Urgency.
  - Budget comfort level.
  - Required support needs: plans, approvals, construction pricing, full delivery support, or unsure.
  - Evidence uploads for photos, plans, title documents, municipal letters, WhatsApp images, and related evidence.
- Evidence uploads are persisted only when they use the platform's allowed Vercel Blob host.
- Input is sanitized and bounded before persistence.

### AI project interpretation
- Integrated the existing briefing workflow agent through `analyzeBrief`.
- Persisted an advisory interpretation with:
  - Client-friendly summary.
  - Possible project route.
  - Likely professional requirements.
  - Likely approval requirements.
  - Risk flags.
  - Suggested next action.
  - Recommendation to invite verified BEPs.
- The interpretation is advisory only and does not certify compliance, quote fees, or replace professional judgment.

### BEP assignment and technical brief editor backend
- Added owner/admin `POST /api/client-briefs/:briefId/assign-bep`.
- Assignment requires the target user to be a verified BEP using active persisted `user_verifications`.
- Added assigned verified BEP/admin `PUT /api/client-briefs/:briefId/technical-brief`.
- Persisted `technical_briefs/{briefId}` records with:
  - Technical project classification.
  - Required professionals.
  - Likely approvals.
  - Technical scope.
  - Deliverables.
  - Exclusions.
  - Assumptions.
  - Missing information.
  - Risks.
  - Tasks generated from missing information.
  - Downstream feed flags for BEP proposal, fee calculator, contract builder, drawing register, SANS/compliance forms, municipal tracker, project programme, design team setup, procurement planning, and AI workflows.
- Technical brief editing re-checks the assigned BEP's active verification at edit time.
- Finalized technical briefs are immutable in this slice to prevent silent downstream contract/drawing/programme changes until a future explicit revision workflow is implemented.

### Authorization and audit
- Clients create and update their own guided briefs.
- Admins can read/update/assign where operationally required.
- Only the client owner or admin can assign a BEP.
- Only assigned verified BEPs or admins can edit technical briefs.
- Added `brief` audit category.
- Added immutable audit events:
  - `brief.client_created`
  - `brief.client_updated`
  - `brief.bep_assigned`
  - `brief.technical_updated`
  - `brief.technical_finalized`

### Dev browser tunnel support
- Updated local development Vite middleware host configuration to allow public tunnel host headers while testing.
- Public tunnel validation was performed through Cloudflare Tunnel so the user can watch browser workflow testing.

## Tests added/updated

- Added API tests for client brief creation, AI interpretation persistence, upload sanitization, and non-client blocking.
- Added API tests for verified BEP assignment, unauthorized technical edit blocking, technical finalization, downstream feed persistence, generated missing-info tasks, and audit events.
- Added API tests for active BEP verification re-check before technical edits.
- Added API tests that finalized technical briefs cannot be overwritten.

## Validation completed so far

- `npx vitest run src/lib/__tests__/api-router.security.test.ts`
  - 29 tests passed after Phase 5 additions.
- `npm run lint`
  - TypeScript validation passed after Phase 5 additions.
- Browser tunnel validation:
  - Cloudflare Tunnel URL reached the app with HTTP 200 and no console errors after tunnel host support was enabled.

## Notes and follow-up

- Existing client briefs do not need a backfill because this slice introduces a new workflow.
- Existing users can be assigned to briefs only after they have an active persisted BEP verification.
- Future work should add an explicit technical brief revision workflow if finalized briefs need post-finalization changes.
- Firestore direct client rules for `client_briefs` and `technical_briefs` remain intentionally unexpanded because access is through authenticated API routes in this backend slice.
