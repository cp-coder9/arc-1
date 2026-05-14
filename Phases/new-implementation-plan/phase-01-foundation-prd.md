# Phase 1 PRD — Access, Identity, Firm Workspace Foundation

## Goal

Establish the structural data, access-control, and role-routing foundation needed by the strategy in [Phases/new_implementation.md](Phases/new_implementation.md). This phase should avoid duplicating completed lifecycle work already present in [src/types.ts](src/types.ts:720), [src/services/projectLifecycleService.ts](src/services/projectLifecycleService.ts:91), [src/components/StageProgressTracker.tsx](src/components/StageProgressTracker.tsx), and [firestore.rules](firestore.rules:331).

## Current codebase grounding

- Existing roles are [`UserRole`](src/types.ts:1) values for client, architect, admin, freelancer, and BEP; contractor is not yet a first-class role.
- Auth profile creation is server-backed through [src/lib/api-router.ts](src/lib/api-router.ts:343) and duplicated in [api/index.ts](api/index.ts:80); both currently whitelist client, architect, freelancer, and BEP but not contractor.
- The dashboard router in [src/App.tsx](src/App.tsx:107) lazy-loads client, architect, admin, freelancer, BEP, settings, invoices, files, and onboarding, but no contractor or firm dashboard.
- Firm/workspace fields do not exist on [`UserProfile`](src/types.ts:3), and no [`Firm`](src/types.ts:3) model exists.
- [firestore.rules](firestore.rules:205) restricts user-create and owner-updatable fields; firm fields and contractor role are not allowed.
- Project/team access exists via [`ProjectTeamMember`](src/types.ts:801) and [firestore.rules](firestore.rules:49), so firm access should build on this instead of replacing project team logic.

## Scope

In scope:

- Add first-class contractor identity support.
- Define firm/workspace data model and membership semantics.
- Plan secure invite, membership, and shared project access workflows.
- Align onboarding and dashboard routing with existing lazy-loading patterns in [src/App.tsx](src/App.tsx:103).

Out of scope:

- Payment subscription enforcement.
- CPD course features.
- Material supplier API implementation.
- Non-planning code changes.

## Requirements

1. Contractor users must be supported consistently across type definitions, server auth profile creation, Firestore rules, onboarding, dashboard navigation, and tests.
2. Firm workspaces must support owners, admins, coordinators, staff, billing viewers, and invited users without bypassing project-level controls.
3. Shared project access must require firm membership plus explicit project or firm linkage, not merely matching a user-provided string.
4. Firm invite flows must create notifications using existing notification infrastructure and preserve auditability.
5. User-controlled updates must not allow privilege escalation through direct writes to firm role, subscription status, or billing state.

## Acceptance criteria

- A new [`Firm`](src/types.ts:3) and firm membership model is specified before implementation.
- Contractor role propagation is identified for [`UserRole`](src/types.ts:1), [src/App.tsx](src/App.tsx:439), [src/lib/api-router.ts](src/lib/api-router.ts:356), [api/index.ts](api/index.ts:93), and [firestore.rules](firestore.rules:210).
- Security-rule changes explicitly distinguish user-owned profile fields from server/admin-managed identity and billing fields.
- Existing [`Project`](src/types.ts:789) and team roster functionality remains the primary source of project participation.
- Implementation handoff includes tests for auth, onboarding, firm access, and denial cases.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Firm membership becomes a broad bypass for all projects | High | Require firm-linked projects and verified membership lookups in [firestore.rules](firestore.rules:331) |
| Role drift between [api/index.ts](api/index.ts:93) and [src/lib/api-router.ts](src/lib/api-router.ts:356) | Medium | Update both or consolidate role validation into shared logic |
| Client-side profile creation in [src/App.tsx](src/App.tsx:264) conflicts with server profile creation | Medium | Treat server profile sync as source of truth and remove duplicate writes in implementation phase |

## Dependencies

- Existing lifecycle implementation in [Phases/implementation_plan.md](Phases/implementation_plan.md).
- Firebase Admin initialization in [src/lib/firebase-admin.ts](src/lib/firebase-admin.ts:85).
- Notification service patterns in [src/services/notificationService.ts](src/services/notificationService.ts:92).

