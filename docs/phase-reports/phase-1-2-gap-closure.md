# Phase 1/2 Gap Closure Audit

Date: 2026-05-15  
Branch: `phase-2-verification-workflows`  
Scope: foundation hardening audit against `FULL_SCOPE_PHASED_IMPLEMENTATION_PLAN.md` and `Full_scope.md` for Phase 1 and Phase 2 acceptance criteria.

## Coordination / File Ownership

Per swarm instruction, this pass did **not** edit:

- `src/lib/api-router.ts`
- `src/lib/__tests__/api-router.security.test.ts`
- `firestore.rules`
- `firestore.indexes.json`
- files likely owned by other active agents

This report is a non-conflicting documentation slice intended to guide the next safe patches.

## Current State Summary

Phase 1 has a strong foundation but is not fully production-closed until Firestore/API coverage is extended to every durable collection introduced by Phase 2 and later workflows.

Phase 2 is partially implemented in the router and tests, but it does not yet match the plan's canonical API paths, canonical collection names, or complete brief-to-marketplace-to-proposal-to-appointment workflow.

Important observed implementation points:

- Verification foundation exists through `user_verifications`, browser-backed official-register checks, lifecycle/recheck logic, and marketplace verification gates.
- Directory search exists at `/directory/search` and persists/audits directory access, with verified-only invite behavior for existing users.
- Profile updates exist at `/profile/me` and admin profile updates are tested, but the plan's `PUT /api/users/:userId/profile` canonical route and separate `role_profiles` collection are not present.
- Guided brief routes exist around client brief creation, technical brief generation/finalization, BEP assignment, and project initialization, but do not yet fully map to the canonical `project_briefs`, `project_attachments`, and `brief_interpretations` contract.
- Marketplace BEP opportunity viewing and fee proposal paths exist over legacy `jobs` collections, not the canonical `marketplace_opportunities` / `proposals` / `proposal_comparisons` model.
- Appointment creation appears tied to finalized technical briefs and writes `appointment_contracts`, `projects`, milestones, invoices, and stage data, but the canonical `appointments` and `project_stage_history` collections are not yet evident.

## Phase 1 Acceptance Criteria Assessment

| Criterion | Status | Notes / Gap |
| --- | --- | --- |
| All protected APIs require verified server-side auth context | Partial | Many new protected routes use `getAuthContext`, but a full route inventory pass is still required after concurrent router edits settle. Sensitive non-router services should also be checked for direct client trust. |
| No client-side role write can escalate privileges | Mostly met | Role normalization, admin checks, and schema updates exist. Remaining risk: profile update allowlist must be checked to ensure role/verification fields cannot be self-written through profile endpoints. |
| Project, firm, package, and admin access enforced in API and Firestore rules | Partial | Permission service models project/package/admin access, but Phase 2+ collections need full Firestore rule coverage. Firm membership endpoints/rules are not visibly complete in this pass. |
| All sensitive actions emit immutable audit entries | Partial | Broad audit wiring exists and tests cover high-value routes. Remaining Phase 2 sensitive actions, especially canonical proposals/comparisons/appointments and directory invitations, need full taxonomy coverage in docs/tests. |
| No production mock/placeholder data | Mostly met for verification | Verification agent is explicitly non-simulated. Brief interpretation/matching/proposal scoring must be reviewed to ensure deterministic helper outputs are labelled advisory and not fake provider results. |

### Phase 1 Remaining Production Gaps

1. **Route inventory and auth gate matrix**
   - Produce a generated list of Express routes and whether each calls `getAuthContext` or is intentionally public/webhook.
   - Add a test or static assertion for sensitive unauthenticated routes.

2. **Profile self-write hardening**
   - Confirm `sanitizeUserProfileData` excludes role, normalizedRole, verification status, admin flags, financial trust fields, and audit fields.
   - Add tests that self profile updates cannot change `role`, `isAdmin`, `verificationStatus`, `verified`, `admin`, or `claims`-like fields.

3. **Firestore rules completeness**
   - Add rule/test coverage for: `directory_profiles`, `directory_invitations`, `technical_briefs`, `appointment_contracts`, Phase 2 brief/proposal collections, and any legacy `jobs/*/fee_proposals` subcollections.
   - Ensure every create/update preserves owner/actor immutable fields.

4. **Idempotency coverage**
   - Phase 1 required idempotency helpers for sensitive write APIs. Payment/escrow may have some existing safeguards, but Phase 2 writes need deterministic duplicate prevention for brief publication, proposals, comparison, invitation, and appointment.

5. **Firm membership foundation**
   - The plan calls out `firms` and `firm_memberships`. This pass did not find enough evidence that firm invite/member RBAC is complete.

## Phase 2 Acceptance Criteria Assessment

| Criterion | Status | Notes / Gap |
| --- | --- | --- |
| Clients can create durable guided briefs with attachments | Partial | Durable brief support exists, but canonical `project_briefs` and `project_attachments` path/collection alignment needs confirmation or migration. Attachment evidence metadata path should be explicit. |
| AI interpretations are advisory and persisted | Partial | Technical brief/interpretation behavior exists, but canonical `brief_interpretations` records and source/evidence/limitation fields need hardening. |
| Verified BEPs/contractors are searchable manually | Partial | Directory search exists and checks verification. It currently queries up to 500 `directory_profiles` in memory, which is not production-scalable and requires indexes. |
| Marketplace opportunities are published from valid briefs | Partial | Marketplace visibility exists over `jobs`; canonical `marketplace_opportunities` publication from valid briefs is missing or not aligned. |
| AI matching is advisory, not automatic appointment | Gap likely remains | No clear `match_recommendations` collection/API was found. Need scored recommendation records with evidence, explanation, and no auto-appointment side effects. |
| Proposals and comparison are persisted | Partial | Legacy marketplace applications and fee proposals exist. Canonical `/api/proposals` and `/api/proposals/:proposalId/compare` plus `proposal_comparisons` collection are not evident. |
| Client can appoint verified professional | Partial | Appointment generation exists from finalized technical brief and assigned BEP. Needs canonical `appointments` collection, verification recheck at appointment time, idempotency, and human contract acceptance/signature gates. |
| Project code and command-centre initialized | Partial | Project code and initial project state are generated during appointment. Need ensure stage history is append-only and command-centre schema matches Phase 3/4 docs. |

## Exact Next Patches Needed

### Patch 1: Canonical Phase 2 service layer without router conflict

Create focused service modules that can be called by the router after coordination:

- `src/services/roleProfileService.ts`
  - `sanitizeRoleProfileUpdate(role, input)`
  - `buildDirectoryProfile(user, roleProfile, verification)`
  - explicit field allowlists per role from `Full_scope.md`
- `src/services/briefWorkflowService.ts`
  - `buildProjectBrief(input)`
  - `buildProjectAttachmentMetadata(input)`
  - `buildBriefInterpretation(input)` with `advisoryOnly: true`, source evidence, confidence, and limitations
  - `assertBriefPublishable(brief)`
- `src/services/marketplaceWorkflowService.ts`
  - `buildMarketplaceOpportunityFromBrief(brief)`
  - `buildProposal(input)`
  - `buildProposalComparison(input)`
  - `assertVerifiedParticipantForOpportunity(userVerification)`
- `src/services/appointmentWorkflowService.ts`
  - `assertAppointmentPreconditions({ brief, proposal, verification })`
  - `buildAppointmentRecord(input)`
  - `buildProjectStageHistoryEntry(input)`
  - deterministic idempotency keys for appointment per brief/client/professional

Add unit tests for all modules. These files avoid router/rules conflicts and make the eventual route patch smaller.

### Patch 2: Canonical routes after coordinating router ownership

Add or alias the plan's routes while preserving current routes for backward compatibility:

- `PUT /api/users/:userId/profile`
  - self-only unless admin
  - writes `role_profiles/{userId}` and denormalized safe `directory_profiles/{userId}`
  - audits `profile.updated` or `profile.admin_updated`
- `POST /api/project-briefs`
- `POST /api/project-briefs/:briefId/attachments`
- `POST /api/project-briefs/:briefId/interpretations`
- `POST /api/marketplace/opportunities`
- `GET /api/marketplace/opportunities`
- `GET /api/directory/search` as alias to current `/directory/search`
- `POST /api/invitations` as alias/wrapper for governed directory invitations where appropriate
- `POST /api/proposals`
- `POST /api/proposals/:proposalId/compare`
- `POST /api/appointments`
- `POST /api/projects/:projectId/initialize`

### Patch 3: Firestore rules/index closure after coordinating rules ownership

Add rules and static tests for:

- `role_profiles/{userId}`
- `directory_profiles/{userId}`
- `project_briefs/{briefId}`
- `project_attachments/{attachmentId}`
- `brief_interpretations/{interpretationId}`
- `marketplace_opportunities/{opportunityId}`
- `match_recommendations/{recommendationId}`
- `invitations/{invitationId}` and/or `directory_invitations/{invitationId}`
- `proposals/{proposalId}`
- `proposal_comparisons/{comparisonId}`
- `appointments/{appointmentId}`
- `project_stage_history/{entryId}` or project subcollection equivalent

Required indexes:

- directory role + visibility + region/discipline/trade filters
- marketplace status + region + category + createdAt
- proposals by opportunity/brief/client/professional/status
- appointments by brief/client/professional/project/status
- audit logs by actor/category/action/createdAt where admin UI queries require it

### Patch 4: Production scalability and privacy

- Replace in-memory directory scan `.limit(500)` with indexed queries or a maintained search projection.
- Avoid returning sensitive profile fields from directory search.
- Add purpose-limited audit metadata for directory searches without storing raw personal search terms unless explicitly required by policy.
- Add rate limits for directory search, invitations, proposals, and appointment creation.

## Tests To Add / Run

Recommended focused validation commands after implementation:

```bash
npx vitest run src/services/__tests__/permissionService.test.ts src/services/__tests__/auditService.test.ts src/services/__tests__/userVerificationService.test.ts
npx vitest run src/lib/__tests__/api-router.security.test.ts src/lib/__tests__/firestore-rules.static.test.ts
npm run lint
```

New tests should cover:

- role profile allowlists per role
- blocked profile privilege escalation fields
- brief creation ownership and attachment metadata validation
- advisory brief interpretation persistence with limitations
- marketplace opportunity cannot publish from invalid/unowned brief
- unverified BEP cannot view/apply/propose/appoint
- proposal comparison is client-owned and advisory
- appointment is idempotent, single-winner per brief, and rechecks verification at appointment time
- all Phase 2 sensitive writes emit immutable audit events
- Firestore owner/member/admin/non-member rules for every Phase 2 collection

## Human Confirmations / Blockers

- Confirm canonical collection migration strategy: keep current `jobs`, `technical_briefs`, and `appointment_contracts` as compatibility stores or migrate/dual-write to plan collections.
- Confirm South African verification source policy for contractors/subcontractors/suppliers: CIDB/NHBRC/CIPC acceptance, expiry intervals, and manual override policy.
- Confirm whether directory search should expose unverified profiles with warnings or only verified profiles by default.
- Confirm appointment legal gate: is platform-generated appointment contract a draft only until external e-signature/human acceptance, or can an in-app acceptance bind parties?
- Confirm POPIA retention and audit search-term retention policy.
- Confirm marketplace fee proposal schema and whether `jobs/*/fee_proposals` should become top-level `proposals`.

## Validation Performed In This Audit

- Reviewed `FULL_SCOPE_PHASED_IMPLEMENTATION_PLAN.md` Phase 1/2 acceptance criteria.
- Reviewed `Full_scope.md` role/workflow requirements.
- Reviewed existing phase reports:
  - `docs/phase-reports/phase-1-security-rbac-audit.md`
  - `docs/phase-reports/phase-2-automated-verification-workflows.md`
- Inspected current repo status and recent commits.
- Searched for canonical Phase 2 collections and route names.
- Inspected relevant `src/lib/api-router.ts` excerpts read-only.

No source/rules/router tests were run in this audit because the protected router/rules/test files are currently dirty and likely under active ownership by other agents. This report itself is documentation-only and non-conflicting.
