# Audit Log Taxonomy

Status: Phase 1 initial implementation.

## Purpose

Audit logs provide an immutable record for actions that affect authority, access, payments, escrow, contracts, compliance, AI outputs, documents, disputes, and admin overrides.

## Categories

Implemented in `src/services/auditService.ts`:

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

## Required event fields

- `category`
- `action`
- `actor.uid`
- `createdAt`
- `immutable: true`

## Optional event fields

- `actor.role`
- `actor.email`
- `actor.displayName`
- `actor.authorizationType`
- `target.type`
- `target.id`
- `target.projectId`
- `reason`
- `metadata`
- `requestId`
- `ipAddress`
- `userAgent`

## Access log records

Access logs are separate from business audit events. They capture request-level access decisions and correlation details for sensitive route handlers without implying that a domain action was accepted.

Implemented in `src/services/accessLogService.ts`:

- `requestId`
- `method`
- `path` with query strings stripped before persistence
- `statusCode`
- `outcome`: `allowed`, `denied`, or `error`
- optional `actor.uid`, `actor.role`, `actor.email`, and `actor.authorizationType`
- optional `reason`, `ipAddress`, `userAgent`, and `metadata`
- `createdAt`
- `immutable: true`

Firestore rules keep `access_logs` admin-readable and server-owned. Browser clients cannot create, update, or delete access log records; trusted backend/Admin SDK code must write them with the persistent writer abstraction.

## Append-only rule

Audit events must not be updated or deleted. Corrections must be separate compensating audit events.

## Implementation files

- `src/services/auditService.ts`
- `src/services/accessLogService.ts`
- `src/services/__tests__/auditService.test.ts`
- `src/services/__tests__/accessLogService.test.ts`
- `firestore.rules`

## Phase 1 limitation

This implementation introduces audit and access-log builder/writer abstractions plus security rules. Existing API routes must be progressively wired to call `writeAuditEvent` for high-value business actions and `writeAccessLogEntry` for sensitive request authorization outcomes during the remaining Phase 1 implementation.
