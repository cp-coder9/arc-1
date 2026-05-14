# Phase 1 Implementation Report - Security, RBAC, Audit Foundation

Date: 2026-05-14  
Status: Completed and validated.

## Exactly Implemented

### Collections / Firestore Rules

- Updated `firestore.rules` user creation role allow-list to include:
  - `contractor`
  - `subcontractor`
  - `supplier`
- Preserved `architect` as an accepted legacy/current UI role.
- Added append-only `audit_logs/{auditId}` rule:
  - admin read only
  - authenticated create only when `immutable == true`
  - no client update/delete
- Added generalized `user_verifications/{verificationId}` rule:
  - owner/admin read
  - authenticated owner create only for self-submitted `pending` records
  - subject types limited to `bep`, `contractor`, `subcontractor`, `supplier`, `freelancer`, `admin`
  - admin-only update
  - no client delete
- Updated marketplace job application rules so both `architect` and `bep` users can apply, matching the human decision that architect is a BEP subtype.

### Type Model

- Updated `src/types.ts` `UserRole` union to include:
  - `subcontractor`
  - `supplier`
- Added generalized verification types:
  - `VerificationSubjectType`
  - `VerificationSource`
  - `UserVerification`

### Permission Foundation

Created `src/services/permissionService.ts` with:

- canonical user role list
- `architect` normalization to `bep` for authorization
- normalized role typing so permission maps do not duplicate architect/BEP logic
- project access roles:
  - `project_owner`
  - `lead_bep`
  - `design_team_member`
  - `contractor`
  - `subcontractor_package_assignee`
  - `supplier_package_assignee`
  - `freelancer_task_assignee`
  - `admin`
- permission actions:
  - `project:read`
  - `project:update`
  - `project:manage_members`
  - `profile:read`
  - `profile:update`
  - `verification:review`
  - `audit:read`
  - `audit:write`
  - `admin:override`
  - `payment:read`
  - `payment:manage`
  - `escrow:release`
  - `compliance:sign`
  - `municipal:manage`
  - `municipal:view_insight`
- admin separation-of-duty override helper requiring an auditable reason of meaningful length
- helpers:
  - `isCanonicalUserRole`
  - `normalizeUserRole`
  - `isAdminUser`
  - `getRolePermissions`
  - `canAdminOverrideSeparationOfDuty`
  - `getActiveProjectAccessRoles`
  - `canUserPerform`
  - `assertCanUserPerform`

### Audit Foundation

Created `src/services/auditService.ts` with:

- audit categories:
  - `auth`
  - `access`
  - `role`
  - `verification`
  - `project`
  - `approval`
  - `payment`
  - `escrow`
  - `contract`
  - `compliance`
  - `ai`
  - `message`
  - `document`
  - `dispute`
  - `admin_override`
- immutable audit event builder
- injected persistent writer abstraction for tests/services
- append-only update guard helper

### API Security and Audit Wiring

Updated `src/lib/api-router.ts` with:

- shared `getAuthContext(headers)` helper that resolves decoded auth, persisted user role, normalized role, and admin status
- shared `recordAuditEvent(req, input)` helper that persists immutable events to `audit_logs`
- shared `decodedAuditActor(decoded, role?)` helper for consistent actor metadata
- `normalizeUserRole` usage so `architect` is authorized as a BEP subtype

Routes now persist audit events:

- `POST /api/auth/check-admin`
  - `auth.user_bootstrapped`
  - `role.admin_allowlist_upgraded`
- `POST /api/jobs/:jobId/applications`
  - `marketplace.application_submitted`
  - accepts `architect` and `bep` through normalized BEP authorization
- `POST /api/jobs/:jobId/applications/:applicationId/accept`
  - `marketplace.application_accepted`
- `POST /api/payment/escrow/init`
  - `payment.escrow_initiated`
- `POST /api/payment/milestone/release`
  - `escrow.milestone_released`
- `POST /api/payment/refund/request`
  - `payment.refund_requested`
- `POST /api/payment/refund/:requestId/process`
  - `payment.refund_rejected`
  - `payment.refund_approved`
  - category `admin_override` because admin is overriding payment/refund governance
- Legacy `POST /api/payment/refund`
  - `payment.legacy_direct_refund_processed`
- PayFast ITN `POST /api/payment/notify`
  - `payment.payfast_itn_completed`
- `POST /api/municipal/credentials`
  - `municipal.credentials_saved`
- `POST /api/architect/verify-sacap`
  - `verification.sacap_checked`
- `POST /api/files/upload`
  - `file.uploaded`
- `DELETE /api/files/delete`
  - `file.deleted`
- `POST /api/review`
  - `ai.review_requested`
- `POST /api/gemini/review`
  - `ai.gemini_review_requested`

### Production-Only Behavior Hardening

- Removed the Gemini review mock fallback from production API behavior.
- If the Gemini provider is not configured, `/api/gemini/review` now returns `503` instead of simulated/mock review content.
- No payment provider behavior was simulated or replaced. Audit writes wrap existing persistent workflows.

### UI Type Compatibility

Updated role prop unions to accept new roles in:

- `src/components/ComplianceReport.tsx`
- `src/components/KnowledgeFeedback.tsx`
- `src/components/SubmissionItem.tsx`

No colour scheme or UI behavior was changed.

### Tests Added / Updated

- `src/services/__tests__/permissionService.test.ts`
- `src/services/__tests__/auditService.test.ts`
- `src/lib/__tests__/api-router.security.test.ts`
- `src/lib/__tests__/firestore-rules.static.test.ts`

Coverage includes:

- canonical role recognition
- `architect` normalization to `bep`
- active project access resolution
- role + project permission gating
- supplier package limited access
- admin override permissions with required reason
- permission denial errors
- immutable audit event construction
- durable writer invocation
- audit append-only guard
- Firestore rules regression coverage for audit logs, generalized user verifications, and BEP/architect marketplace application access
- API audit writes for auth bootstrap, admin upgrade, BEP application, appointment acceptance, escrow init, refund rejection, municipal credential storage, file upload, AI provider review, and related high-value routes
- BEP users can apply to marketplace jobs while legacy `architectId` fields remain backward-compatible

### Documentation Added / Updated

- `FULL_SCOPE_PHASED_IMPLEMENTATION_PLAN.md`
- `docs/backend/auth-rbac.md`
- `docs/backend/audit-log-taxonomy.md`
- `docs/phase-reports/phase-1-security-rbac-audit.md`

## Validation Completed

```bash
npx vitest run src/lib/__tests__/api-router.security.test.ts src/lib/__tests__/firestore-rules.static.test.ts src/services/__tests__/permissionService.test.ts src/services/__tests__/auditService.test.ts
```

Result: 4 test files passed, 31 tests passed.

```bash
npm run lint
```

Result: passed, TypeScript exit code 0.

## Human Input Decisions Recorded

- DECIDED: `architect` is a BEP subtype. The permission layer normalizes `architect` to `bep`.
- DECIDED: admins may override the separation-of-duty policy.
- IMPLEMENTED SAFEGUARD: admin override requires an auditable reason and high-value override actions persist `admin_override` audit events.

## Remaining Human Information Needed For Later Phases

- Confirm verification sources and accepted manual verification evidence per role.
- Confirm whether any admin override scenarios require dual approval despite admin override authority.
- Confirm final production provider details for non-SACAP verification checks such as CIDB, NHBRC, business registration, and supplier credential verification.

## Phase 1 Acceptance Status

Phase 1 is complete. The backend now has the foundational role model, architect-as-BEP normalization, generalized verification rules/types, immutable audit taxonomy, persistent audit writes on high-value routes, removal of mock AI fallback behavior, regression tests, and documentation required to proceed to Phase 2.
