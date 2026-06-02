# Phase 3 Workflow — CPD Learning, Certificates, Knowledge Integration

## Implementation sequence

1. Add CPD models to [src/types.ts](src/types.ts:658), including course, module, quiz question, attempt, record, and certificate.
2. Add CPD Firestore rules near the default deny section in [firestore.rules](firestore.rules:606).
3. Create CPD service for course listing, enrollment, quiz submission, score validation, CPD record creation, and certificate generation.
4. Build professional CPD hub component and add dashboard navigation through [src/App.tsx](src/App.tsx:507) and [src/components/ArchitectDashboard.tsx](src/components/ArchitectDashboard.tsx:153).
5. Build admin CPD course manager under [src/components/AdminDashboard.tsx](src/components/AdminDashboard.tsx:1090).
6. Extend [src/services/notificationService.ts](src/services/notificationService.ts:25) with certificate-issued and course-published notifications.
7. Integrate transcript publication with [src/services/knowledgeService.ts](src/services/knowledgeService.ts:89), defaulting to pending review.

## Affected files and modules

- [src/types.ts](src/types.ts:658): CPD and upload context types.
- [firestore.rules](firestore.rules:606): CPD course and record rules.
- [src/services/pdfGenerationService.ts](src/services/pdfGenerationService.ts:707) or a new CPD certificate service using the same PDF pattern.
- [src/services/knowledgeService.ts](src/services/knowledgeService.ts:89): transcript ingestion.
- [src/services/notificationService.ts](src/services/notificationService.ts:25): CPD notifications.
- [src/components/ArchitectDashboard.tsx](src/components/ArchitectDashboard.tsx:153): CPD tab and points tracker.
- [src/components/AdminDashboard.tsx](src/components/AdminDashboard.tsx:1090): CPD manager tab or knowledge sub-tab.

## Validation steps

- Run [`npm run lint`](package.json:15).
- Add CPD service tests under [src/services/__tests__](src/services/__tests__).
- Add component tests for CPD hub and admin manager under [src/components/__tests__](src/components/__tests__).
- Add Playwright scenario for course completion and certificate issuance under [e2e](e2e).
- Verify users cannot directly create CPD records or modify certificate URLs.

## Handoff points

- Knowledge expansion phase can use CPD transcript metadata for agent learning.
- Admin maintenance phase can add reporting and annual compliance exports.
- Monetization phase can gate premium courses by credits or subscription state.

