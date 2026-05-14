# Phase 2 Workflow — Monetization, Subscriptions, Activation Fees, Credits

## Implementation sequence

1. Centralize fee configuration near [src/lib/api-router.ts](src/lib/api-router.ts:27) and [src/services/paymentService.ts](src/services/paymentService.ts:78), replacing hardcoded five percent values for new transactions.
2. Extend [src/types.ts](src/types.ts:459) with subscription, activation fee, credit purchase, credit spend, and affiliate commission records.
3. Add server endpoints under [src/lib/api-router.ts](src/lib/api-router.ts:1288) for subscription checkout, activation fee checkout, credits purchase, and webhook-purpose dispatch.
4. Refactor client payment methods in [src/services/paymentService.ts](src/services/paymentService.ts:43) to call server endpoints for every privileged financial mutation.
5. Modify job posting workflow in [src/components/ClientDashboard.tsx](src/components/ClientDashboard.tsx:102) so jobs are created as draft or activation-pending until confirmed.
6. Update [firestore.rules](firestore.rules:479) to add subscription, credit, activation, and ledger protections.
7. Extend [src/components/FinancialDashboard.tsx](src/components/FinancialDashboard.tsx:39) to show subscription revenue, activation fees, platform fees, credits, and refunds.

## Affected files and modules

- [src/types.ts](src/types.ts:459): financial types and user monetization fields.
- [src/services/paymentService.ts](src/services/paymentService.ts:146): client API wrappers and fee calculation.
- [src/services/financialLedgerService.ts](src/services/financialLedgerService.ts:12): ledger entry helpers and summaries.
- [src/lib/api-router.ts](src/lib/api-router.ts:1288): PayFast checkout, ITN, refund, receipt, subscription routes.
- [src/components/ClientDashboard.tsx](src/components/ClientDashboard.tsx:102): activation fee gate.
- [src/components/FinancialDashboard.tsx](src/components/FinancialDashboard.tsx:13): financial console extension.
- [firestore.rules](firestore.rules:479): financial write protections.

## Validation steps

- Run [`npm run lint`](package.json:15).
- Run [src/services/__tests__/paymentService.test.ts](src/services/__tests__/paymentService.test.ts) and [src/services/__tests__/financialLedgerService.test.ts](src/services/__tests__/financialLedgerService.test.ts).
- Add webhook idempotency tests for [src/lib/api-router.ts](src/lib/api-router.ts:1849).
- Exercise PayFast sandbox once-off, subscription, activation, refund, and failed-payment paths.
- Verify unauthorized browser users cannot edit subscription, credits, escrow, or ledger state.

## Handoff points

- CPD phase can consume credits for certificates or premium exports.
- Supplier integration can reuse affiliate commission ledger events.
- Admin phase can build consolidated subscription and firm billing operations on top of these records.

