# Phase 5 PRD — Dashboards, Notifications, Admin Operations

## Goal

Expose the new business capabilities through role-appropriate dashboards and notification triggers while reusing current dashboard components, avoiding duplication of construction/tender/financial functionality already implemented.

## Current codebase grounding

- [src/components/ArchitectDashboard.tsx](src/components/ArchitectDashboard.tsx:153) already includes marketplace, team, coordination, construction, closeout, fees, and applications tabs.
- Contractor-specific tools are currently embedded in the architect construction tab through [src/components/GanttChart.tsx](src/components/GanttChart.tsx), [src/components/SiteLogManager.tsx](src/components/SiteLogManager.tsx), and [src/components/RFIManager.tsx](src/components/RFIManager.tsx); no [src/components/ContractorDashboard.tsx](src/components/ContractorDashboard.tsx) exists.
- Admin tabs already cover submissions, agents, users, jobs, moderation, knowledge, disputes, logs, municipal, fees, financial, settings, and analytics in [src/components/AdminDashboard.tsx](src/components/AdminDashboard.tsx:780).
- Notification types in [`NotificationType`](src/types.ts:383) do not include firm, materials, CPD, subscription, refund, procurement, or contractor delivery events.
- Some API routes create notification types not present in [`NotificationType`](src/types.ts:383), such as refund_request in [src/lib/api-router.ts](src/lib/api-router.ts:1578), causing type drift.

## Scope

In scope:

- Contractor dashboard built from existing tender, construction, RFI, site log, and payment claim capabilities.
- Firm dashboard for member invites, project assignments, and billing overview.
- Admin operational tabs for subscriptions, firms, CPD, supplier/procurement, and agent roster maintenance.
- Notification type expansion and service trigger implementation.
- UI integration with lazy loading and Tailwind v4 conventions.

Out of scope:

- Rebuilding existing client/architect/admin dashboards from scratch.
- Material supplier order execution beyond Phase 4 service integration.
- New design system or Tailwind config file.

## Requirements

1. New dashboards must follow lazy-loading conventions in [src/App.tsx](src/App.tsx:103).
2. Contractor dashboard must reuse existing components instead of duplicating Gantt, RFI, and site log logic.
3. Admin tabs must query existing collections and derived summaries rather than maintaining duplicate aggregates unless needed for performance.
4. Notification types and trigger methods must be aligned between [src/types.ts](src/types.ts:383), [src/services/notificationService.ts](src/services/notificationService.ts:25), and server routes in [src/lib/api-router.ts](src/lib/api-router.ts:467).
5. New UI must follow shadcn components and Tailwind v4 inline theme patterns from [src/index.css](src/index.css).

## Acceptance criteria

- Contractor dashboard renders tender packs, programme, RFIs, site logs, procurement status, and payment claims from existing services.
- Firm dashboard supports staff overview and project access without replacing project team tools.
- Admin dashboard includes firm, subscription, CPD, procurement, and agent maintenance views using existing tabs or new tabs.
- Notification type drift is resolved and tests cover new notification configs.
- Existing dashboards retain current behavior.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Dashboard bloat in [src/components/AdminDashboard.tsx](src/components/AdminDashboard.tsx:494) | Medium | Split large tab panels into focused components during implementation |
| Notification type drift causes compile failures | Medium | Update [`NotificationType`](src/types.ts:383) before adding trigger methods |
| Duplicating construction logic for contractors | Medium | Pass role-specific props into existing components where possible |

## Dependencies

- Phase 1 contractor and firm model.
- Phase 2 monetization state.
- Phase 3 CPD services.
- Phase 4 procurement and agent services.

