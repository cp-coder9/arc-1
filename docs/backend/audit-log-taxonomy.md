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

## Append-only rule

Audit events must not be updated or deleted. Corrections must be separate compensating audit events.

## Implementation files

- `src/services/auditService.ts`
- `src/services/__tests__/auditService.test.ts`
- `firestore.rules`

## Phase 1 limitation

This commit introduces the audit builder/writer abstraction and security rules. Existing API routes must be progressively wired to call `writeAuditEvent` for high-value actions during the remaining Phase 1 implementation.
