# Phase 1 Workflow — Access, Identity, Firm Workspace Foundation

## Implementation sequence

1. Update shared identity model in [src/types.ts](src/types.ts:1) to add contractor and firm membership fields.
2. Update server profile creation and profile sanitization in [src/lib/api-router.ts](src/lib/api-router.ts:305) and [api/index.ts](api/index.ts:60), keeping admin-managed fields out of client profile payloads.
3. Add firm service boundaries for creation, invitation, acceptance, removal, and role updates in a new service patterned after [src/services/teamService.ts](src/services/teamService.ts).
4. Update [firestore.rules](firestore.rules:205) to add firm collections, firm-member helpers, contractor role allowance, and safe profile updates.
5. Add contractor and firm dashboard shells using the lazy loading pattern from [src/App.tsx](src/App.tsx:103).
6. Add admin oversight entry points to [src/components/AdminDashboard.tsx](src/components/AdminDashboard.tsx:766) without duplicating existing user management.

## Affected files and modules

- [src/types.ts](src/types.ts:1): role union, user profile fields, firm interfaces, notification payload data extensions.
- [src/App.tsx](src/App.tsx:107): lazy imports, role cards, sidebar entries, dashboard rendering.
- [src/lib/api-router.ts](src/lib/api-router.ts:343): server-side profile sync role whitelist and sanitized profile fields.
- [api/index.ts](api/index.ts:80): production adapter auth profile sync parity.
- [firestore.rules](firestore.rules:205): users, firms, firm invites, project access helpers.
- [src/services/notificationService.ts](src/services/notificationService.ts:25): firm invite and firm role notifications.
- [src/components/AdminDashboard.tsx](src/components/AdminDashboard.tsx:1031): firm management tab or section.

## Validation steps

- Run [`npm run lint`](package.json:15).
- Run unit tests touching auth/profile setup in [src/test/integration/authentication-flow.test.ts](src/test/integration/authentication-flow.test.ts).
- Add and run firm service tests under [src/services/__tests__](src/services/__tests__).
- Validate rules with Firebase tooling referenced by [firebase.json](firebase.json).
- Browser-check role selection, contractor login, firm invite acceptance, and denied access for non-members.

## Handoff points

- Handoff to monetization after firm identity is stable because subscriptions may attach to individual professionals or firm billing accounts.
- Handoff to contractor delivery after contractor dashboard routing exists.
- Handoff to CPD after professional-role gating is consistent.

