# Phase 3 Implementation Report - Manual Directory and Verified Invitations

Date: 2026-05-15  
Status: Implemented and validated.

## Full_scope.md Scope Covered

This slice implements the backend foundation for the following Full_scope.md requirements:

- Section 8: profile data is used for marketplace visibility, manual directory search, verification, audit trails, and role-based permissions.
- Section 11.2: users can manually search by name/company, registration number, discipline/trade, region, and verification status.
- Section 11.2: manual search must not bypass verification.
- Section 11.2: directory results show name/firm, role, discipline/trade, region, verification status, ratings/reviews, availability, and invite eligibility.
- Section 12: clients can manually search and invite specific verified BEPs.
- Section 13: BEPs access marketplace/coordination workflows through verified role-aware profile data.

## Exactly Implemented

### Profile-Backed Manual Directory Search

Added `GET /api/directory/search` in `src/lib/api-router.ts`.

The route:

- requires authenticated Firebase/API auth through the existing auth context.
- applies role-scoped access rules derived from Full_scope.md:
  - clients can search BEPs and contractors.
  - BEPs can search BEPs, contractors, and freelancers.
  - contractors can search subcontractors, suppliers, and BEPs.
  - admins can search all directory-supported roles.
- supports filters for:
  - `q` across name, company, registration numbers, discipline/trade, region, services, and specializations.
  - `role`.
  - `region`.
  - `discipline`.
  - `trade`.
  - `verificationStatus`.
  - `limit`.
- excludes private directory profiles through `directoryVisibility === false` or `directoryVisibility === 'private'`.
- joins persisted `user_verifications` records to expose verification status without trusting client-supplied profile fields.
- returns unverified profiles when they match the search, with an explicit `verificationLabel: 'unverified'` and `canInvite: false`.
- still supports `verificationStatus=verified` and `verificationStatus=unverified` filters for users who want to narrow results.
- returns only directory-safe fields:
  - user id
  - name
  - company
  - role and normalized role
  - discipline/trade
  - region
  - verification status and verification id
  - registration number
  - ratings summary
  - availability
  - invite eligibility
- writes a `directory.search` audit event.

### Verified Directory Invitations

Added `POST /api/directory/invitations` in `src/lib/api-router.ts`.

The route:

- requires authenticated Firebase/API auth.
- validates invitation action against the Full_scope.md invitation actions and the current role/action matrix:
  - clients can invite BEPs to quote or project work.
  - clients can invite contractors to quote, tender, or project work.
  - BEPs can invite BEPs to projects, contractors to quote/tender/project work, and freelancers to tasks.
  - contractors can invite subcontractors to quote/tender/package work, suppliers to quote/package work, and BEPs to quote/project work.
  - admins can perform all directory invitation actions for supported directory roles.
- blocks self-invites.
- enforces inviter role eligibility using the same role-scoped rules as directory search.
- supports registered invitees by `targetUserId`.
- supports unregistered invitees by `targetEmail` plus intended `targetRole`.
- creates `pending_registration` invitations for unregistered recipients so they can register a profile first.
- creates `pending_acceptance` invitations for registered, verified recipients.
- requires invited users to explicitly accept or reject through `POST /api/directory/invitations/:invitationId/respond`.
- requires active persisted verification before registered users can receive executable invitations, and before newly registered users can accept onboarding invitations.
- blocks unverified registered invitees with HTTP 403 and a machine-readable `verificationRequired` response.
- stores durable `directory_invitations` records.
- sanitizes invitation context to allowed references only:
  - `jobId`
  - `projectId`
  - `packageId`
  - `taskId`
  - `tenderId`
  - `quoteRequestId`
  - `message`
- creates an in-app/email notification for registered invitees.
- writes audit events for:
  - `directory.registration_invitation_created`
  - `directory.invitation_created`
  - `directory.invitation_blocked_unverified`
  - `directory.invitation_accepted` / `directory.invitation_rejected` when invitees respond.

## Persistence Guarantees

All directory invitations are persisted in Firestore under `directory_invitations`.
Verification decisions are based only on existing persisted `user_verifications` records.
Audit events are persisted for directory search, blocked unverified invite attempts, and successful invitation creation.
No mock directory records, placeholder users, or simulated verification data are used in production code.

## Tests Added

Extended `src/lib/__tests__/api-router.security.test.ts` with coverage for:

- unverified profile visibility with explicit unverified labels.
- profile-backed manual directory results.
- private profile exclusion.
- verified-only filtering via persisted verification records.
- role eligibility enforcement for client directory search.
- verified directory invitation creation.
- unverified invitee blocking.
- invitation context sanitization.
- registration invitations for unregistered recipients.
- invitation acceptance and verification-before-acceptance gates.
- role/action matrix enforcement.
- notification persistence.
- audit event persistence.

## Validation

Initial focused API validation passed:

```bash
npx vitest run src/lib/__tests__/api-router.security.test.ts
```

Result: 1 test file passed, 24 tests passed.

Full validation completed before commit:

```bash
npx vitest run src/lib/__tests__/api-router.security.test.ts src/services/__tests__/userVerificationService.test.ts src/services/__tests__/tenderService.test.ts src/lib/__tests__/firestore-rules.static.test.ts
npm run lint
npm run build
```

Result: 4 test files passed, 40 tests passed. TypeScript validation passed. Production Vite build passed with the existing circular manual chunk warning.

Browser smoke validation completed against `http://localhost:3000/` using headless Chromium: HTTP 200, title `Architex | Premier Architectural Marketplace`, no console errors.

## Human Information Still Needed

- Confirm whether directory invitations should generate outbound email via a transactional email provider once configured. Current implementation persists onboarding invitations and in-app notifications for registered users, with durable state for later email delivery.
- Product decision confirmed: pending registration and acceptance invitations do not expire. They persist with `expiryPolicy: none` and reminder metadata for periodic in-app/email join or acceptance reminders.
