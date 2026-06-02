# Backend RBAC and Permission Foundation

Status: Phase 1 implementation complete for the security/RBAC/audit foundation.

## Canonical user roles

The backend permission foundation recognizes these roles from `Full_scope.md`:

- `client`
- `architect` legacy/current UI role, normalized to `bep` for authorization
- `bep`
- `contractor`
- `freelancer`
- `subcontractor`
- `supplier`
- `admin`

Human decision recorded: `architect` is a BEP subtype. Existing `architect` records remain supported as a legacy/current UI role, but authorization normalizes them to `bep`.

## Project access roles

Project permissions are intentionally more specific than account roles:

- `project_owner`
- `lead_bep`
- `design_team_member`
- `contractor`
- `subcontractor_package_assignee`
- `supplier_package_assignee`
- `freelancer_task_assignee`
- `admin`

A user must have both a compatible account role and active project access for scoped actions such as project updates, municipal management, payment visibility, and compliance signing.

## Implemented permission actions

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

## Implementation files

- `src/services/permissionService.ts`
- `src/services/__tests__/permissionService.test.ts`
- `src/types.ts`
- `firestore.rules`

## Security rules update

`firestore.rules` now accepts the new `subcontractor` and `supplier` roles on user creation and includes append-only `audit_logs` rules.

## Generalized verification records

The backend now has a generalized `user_verifications/{verificationId}` model for role and credential verification workflows. This is intended to supersede role-specific verification collections over subsequent migration phases while preserving legacy reads where needed.

Required production fields for new submissions:

- `userId`: authenticated user being verified
- `submittedBy`: authenticated submitter, normally equal to `userId` for self-service submissions
- `subjectType`: one of `bep`, `contractor`, `subcontractor`, `supplier`, `freelancer`, `admin`
- `status`: starts as `pending`; only admins can approve/reject through trusted server or admin workflows
- `source`: `sacap`, `cidb`, `nhbrc`, `business_registration`, `manual`, or another explicitly documented source added in code
- `evidence`: persisted references or provider metadata, never temporary UI-only data
- `createdAt` / `updatedAt`

Security rules enforce:

- owners can create only their own `pending` records
- owners and admins can read relevant records
- only admins can update verification outcomes
- client deletes are denied

Human information still required: exact accepted evidence fields for manual verification by role and final authoritative source list for non-SACAP checks.

## Admin separation-of-duty override

Human decision recorded: admins may override the separation-of-duty policy. The backend permission foundation requires a non-trivial reason for this override; route integrations must persist an `admin_override` audit event before/when applying the override.

## Production constraints

- Client-side writes cannot be treated as authoritative for role escalation.
- Admin SDK/server-side APIs must enforce the same permission model before writing protected documents.
- This is the first foundation layer and must be integrated into existing API routes incrementally during Phase 1.
