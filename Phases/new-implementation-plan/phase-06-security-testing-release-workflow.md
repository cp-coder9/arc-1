# Phase 6 Workflow — Security, Testing, Migration, Deployment Readiness

## Implementation sequence

1. Create a security rule matrix for every collection touched by Phases 1 through 5.
2. Update [firestore.rules](firestore.rules:1) in implementation mode and add emulator/rules tests for allow and deny cases.
3. Create migration scripts under [maintenance_scripts](maintenance_scripts) for users, firms, jobs, subscriptions, credits, and ledger backfills.
4. Add or update service tests under [src/services/__tests__](src/services/__tests__) for monetization, CPD, firm, procurement, and notifications.
5. Add or update component tests under [src/components/__tests__](src/components/__tests__) for contractor, firm, CPD, and admin panels.
6. Add Playwright flows under [e2e](e2e) for firm workspace, CPD completion, contractor delivery, subscription failure, and activation fee posting.
7. Validate local dev through [server.ts](server.ts:51) and production adapter through [api/index.ts](api/index.ts:141).
8. Execute release checklist, dry-run migrations, deploy rules, deploy app, run smoke tests, and monitor financial/notification logs.

## Affected files and modules

- [firestore.rules](firestore.rules:1): final access controls.
- [maintenance_scripts](maintenance_scripts): migrations and dry-run utilities.
- [src/services/__tests__](src/services/__tests__): service coverage.
- [src/components/__tests__](src/components/__tests__): dashboard and UI coverage.
- [e2e](e2e): user-flow coverage.
- [package.json](package.json:9): verify scripts and CI commands if needed.
- [vercel.json](vercel.json): API/build routing review.
- [.env.example](.env.example): env documentation if present; create/update only during implementation if file exists or is required.

## Validation steps

- Run [`npm run lint`](package.json:15).
- Run [`npm test`](package.json:17).
- Run [`npm run test:coverage`](package.json:19).
- Run [`npm run test:e2e`](package.json:21).
- Validate Firebase rules with emulator or Firebase CLI.
- Run PayFast sandbox ITN tests and supplier credential-failure tests.
- Verify Vercel deployment health via [api/index.ts](api/index.ts:76) health route and shared router initialization.

## Handoff points

- Production release only after all no-go conditions are cleared.
- Rollback procedure must include app rollback, Firestore rules rollback, and migration rollback notes.

