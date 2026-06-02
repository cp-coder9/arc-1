# Phase 1 Tasks — Access, Identity, Firm Workspace Foundation

| Priority | Task | Complexity estimate | Dependencies | Completion criteria |
|---|---|---:|---|---|
| P0 | Add contractor to [`UserRole`](src/types.ts:1) and all server/client role whitelists | S | None | Contractor can be created only through allowed auth flow and appears in typed role checks |
| P0 | Define [`Firm`](src/types.ts:3), firm membership, invite, and firm billing interfaces | M | Role update | Interfaces include owner/admin/member semantics and server-managed audit fields |
| P0 | Plan user profile field ownership for [`UserProfile`](src/types.ts:3) | M | Firm model | Client-editable fields are separated from admin/server-managed firm and subscription fields |
| P0 | Add Firestore rule design for firms and firm invites | L | Firm model | Rules require authenticated membership, admin override, and deny user self-escalation |
| P1 | Add contractor dashboard shell route planning in [src/App.tsx](src/App.tsx:107) | M | Contractor role | Lazy-loaded shell and sidebar behavior align with existing dashboards |
| P1 | Add firm dashboard shell and admin firm management entry point | M | Firm service | Shell routes to firm members and admin can inspect firms without replacing user management |
| P1 | Add notification events for firm invites and role changes | S | Notification type updates | Events are mapped in [src/services/notificationService.ts](src/services/notificationService.ts:25) and respect preferences |
| P1 | Add tests for role creation, firm invite acceptance, denied firm project access, and admin override | L | Rules and service design | Tests cover success and denial cases |

