# Phase 6 PRD — Security, Testing, Migration, Deployment Readiness

## Goal

Prepare the expanded platform for release with security-rule migrations, data backfills, test coverage, environment readiness, and release gates aligned to the existing Vercel/Firebase workflow.

## Current codebase grounding

- Scripts and test commands are defined in [package.json](package.json:9), using Vitest and Playwright, while older docs reference Jest.
- Firestore rules already cover projects, tender packages, escrow, ledger, invoices, files, and knowledge in [firestore.rules](firestore.rules:331).
- Existing tests cover services and dashboards in [src/services/__tests__](src/services/__tests__) and [src/components/__tests__](src/components/__tests__).
- End-to-end tests exist under [e2e](e2e), including auth and dashboard scenarios.
- Production API adapter is [api/index.ts](api/index.ts:141), while local dev server mounts the shared router from [server.ts](server.ts:51).
- Deployment config exists in [vercel.json](vercel.json) and Firebase config exists in [firebase.json](firebase.json).

## Scope

In scope:

- Security-rule updates for firms, contractors, CPD, subscriptions, credits, procurement, and immutable financial operations.
- Data migration/backfill plan for existing users, jobs, projects, payments, and ledgers.
- Test plan across unit, integration, component, e2e, and webhook tests.
- Environment variable readiness for PayFast recurring, supplier APIs, email/push, LLM providers, and Blob storage.
- Release gates and rollback plan.

Out of scope:

- Implementing production code in this planning phase.
- Deploying rules or running production migrations now.

## Requirements

1. Every new collection must have explicit Firestore rules before release.
2. Financial writes must remain server/admin-only and idempotent.
3. Existing users must be migrated safely with default roles, no implicit subscription grants except planned trial/default states.
4. Tests must align with current scripts in [package.json](package.json:15), not outdated commands.
5. Environment variables must avoid exposing server secrets through VITE prefixes unless the value is intentionally public.

## Acceptance criteria

- A release checklist covers [`npm run lint`](package.json:15), [`npm test`](package.json:17), [`npm run test:coverage`](package.json:19), and [`npm run test:e2e`](package.json:21).
- Security-rule validation covers allow and deny cases for all new collections.
- Migration scripts are planned with dry-run and rollback modes.
- Production env readiness identifies Vercel, Firebase, PayFast, supplier, Blob, and LLM settings.
- Release gates specify no-go conditions for payments, CPD records, firm access, and procurement.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Rules block existing users after deployment | High | Use staged rules tests and emulator-backed migration rehearsals |
| Env variables leak supplier or LLM secrets | High | Keep supplier and direct provider API keys server-only in [src/lib/api-router.ts](src/lib/api-router.ts:20) |
| Data migration corrupts ledger or subscription state | High | Make migration idempotent, dry-run first, and backup Firestore before writes |

## Dependencies

- Phases 1 through 5 complete.
- Access to staging Firebase/Vercel environments.
- PayFast and supplier sandbox credentials.

