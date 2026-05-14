# Phase 5 Tasks — Dashboards, Notifications, Admin Operations

| Priority | Task | Complexity estimate | Dependencies | Completion criteria |
|---|---|---:|---|---|
| P0 | Normalize and extend [`NotificationType`](src/types.ts:383) | M | Prior phase types | All server-created notification types are represented and configured |
| P0 | Add notification config and trigger methods in [src/services/notificationService.ts](src/services/notificationService.ts:25) | M | Type update | Firm, material, CPD, subscription, refund, and procurement notifications respect preferences |
| P0 | Create contractor dashboard shell using existing components | L | Contractor role | Contractor sees tenders, awarded projects, programme, RFIs, site logs, procurement, payment claims |
| P1 | Create firm dashboard shell | L | Firm model | Firm admins can view members, invites, assigned projects, and billing summary |
| P1 | Add admin firm and subscription management panels | L | Phase 1 and Phase 2 | Admin can inspect firms, override roles, view subscriptions, and review billing status |
| P1 | Add admin CPD management panel | M | Phase 3 CPD | Admin can manage CPD courses without leaving admin dashboard |
| P1 | Add admin procurement and supplier monitoring panel | M | Phase 4 procurement | Admin can view orders, supplier failures, and commission entries |
| P2 | Refactor large dashboard panels into child components where touched | M | New panels | [src/components/AdminDashboard.tsx](src/components/AdminDashboard.tsx:494) remains maintainable and tests can target child components |
| P2 | Add dashboard and notification tests | L | UI and service changes | Component and service tests cover role visibility, trigger creation, and unread behavior |

