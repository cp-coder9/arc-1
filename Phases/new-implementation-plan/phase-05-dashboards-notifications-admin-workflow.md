# Phase 5 Workflow — Dashboards, Notifications, Admin Operations

## Implementation sequence

1. Extend [`NotificationType`](src/types.ts:383) and notification data payloads before touching services.
2. Update [src/services/notificationService.ts](src/services/notificationService.ts:25) notification config and trigger methods for firm, subscription, materials, CPD, procurement, refund, and contractor delivery events.
3. Add contractor dashboard shell and route it through [src/App.tsx](src/App.tsx:107) using lazy import patterns.
4. Compose contractor dashboard from [src/components/TenderWizard.tsx](src/components/TenderWizard.tsx), [src/components/BidSubmission.tsx](src/components/BidSubmission.tsx), [src/components/GanttChart.tsx](src/components/GanttChart.tsx), [src/components/SiteLogManager.tsx](src/components/SiteLogManager.tsx), and [src/components/RFIManager.tsx](src/components/RFIManager.tsx) where applicable.
5. Add firm dashboard shell for invites, members, projects, and billing summary.
6. Refactor admin dashboard growth by adding focused child components for firm management, subscriptions, CPD management, procurement monitoring, and agent roster actions.
7. Add UI tests for new dashboards and notification service tests.

## Affected files and modules

- [src/types.ts](src/types.ts:383): notification types and payloads.
- [src/services/notificationService.ts](src/services/notificationService.ts:25): notification config and triggers.
- [src/App.tsx](src/App.tsx:107): lazy dashboard imports, role cards, nav.
- [src/components/AdminDashboard.tsx](src/components/AdminDashboard.tsx:766): admin tabs and child component mounting.
- [src/components/ArchitectDashboard.tsx](src/components/ArchitectDashboard.tsx:153): CPD tracker and subscription indicators.
- [src/components/ClientDashboard.tsx](src/components/ClientDashboard.tsx:102): activation fee state indicators.
- [src/components/FinancialDashboard.tsx](src/components/FinancialDashboard.tsx:13): subscription and commission reporting.

## Validation steps

- Run [`npm run lint`](package.json:15).
- Run dashboard component tests in [src/components/__tests__](src/components/__tests__).
- Run notification service tests or add them under [src/services/__tests__](src/services/__tests__).
- Run relevant Playwright smoke tests in [e2e](e2e).
- Browser-check each role path: client, architect, contractor, firm admin, platform admin.

## Handoff points

- Deployment phase validates dashboard access and production security rules.
- Release management consumes admin dashboards for operational go-live.

