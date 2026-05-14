# Phase 2 PRD — Monetization, Subscriptions, Activation Fees, Credits

## Goal

Implement the monetization pivot from [Phases/new_implementation.md](Phases/new_implementation.md): professional subscriptions, client project activation fees, one percent transaction/platform fee logic, and premium credits, while refactoring existing five percent escrow assumptions in [src/services/paymentService.ts](src/services/paymentService.ts:78) and [src/lib/api-router.ts](src/lib/api-router.ts:27).

## Current codebase grounding

- Existing PayFast integration includes escrow initialization, webhook validation, refund flows, and receipt endpoints in [src/lib/api-router.ts](src/lib/api-router.ts:1288).
- Existing client payment helper delegates privileged operations to server APIs via [src/services/paymentService.ts](src/services/paymentService.ts:43).
- Stage-linked escrow already exists in [src/services/paymentService.ts](src/services/paymentService.ts:212), but it writes directly from the client to [`escrow`](firestore.rules:491) and [`ledger`](firestore.rules:507), which conflicts with current rules requiring admin writes.
- Ledger summary already exists in [src/services/financialLedgerService.ts](src/services/financialLedgerService.ts:32) and admin UI exists in [src/components/FinancialDashboard.tsx](src/components/FinancialDashboard.tsx:13).
- Current platform fee is five percent in [src/services/paymentService.ts](src/services/paymentService.ts:78) and [src/lib/api-router.ts](src/lib/api-router.ts:27), not the requested one percent.
- Existing [`PaymentType`](src/types.ts:460) lacks subscription, activation fee, credit purchase, and affiliate commission categories.

## Scope

In scope:

- R99 monthly professional subscription workflow and status model.
- Client project activation fee before jobs are visible as open marketplace opportunities.
- One percent platform fee model for escrow and milestone releases.
- Credits purchase and spend model for premium AI exports.
- Ledger refactor to ensure immutable server-side financial writes.

Out of scope:

- Firm billing UI beyond supporting account linkage from Phase 1.
- Payment provider replacement.
- Actual bank payout automation unless already supported by PayFast products.

## Requirements

1. Subscription state must be server-confirmed through PayFast tokenization or recurring billing webhooks.
2. Client project activation must produce a draft-to-open transition only after payment confirmation.
3. One percent platform fees must be recorded as immutable ledger entries and reconciled against payment records.
4. Credit balances must be server-authoritative and not user-editable through [`users`](firestore.rules:205) rules.
5. Financial operations must be idempotent for webhooks and retries.

## Acceptance criteria

- Fee constants are centralized and updated from five percent to one percent for the new flow.
- Subscription, activation, credit, and platform fee events have typed records in [src/types.ts](src/types.ts:459).
- [`ledger`](firestore.rules:507) writes remain admin/server-only.
- Existing escrow, refund, receipt, and admin financial dashboards are reused and extended rather than duplicated.
- PayFast ITN handling in [src/lib/api-router.ts](src/lib/api-router.ts:1849) can distinguish payment purpose by metadata.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| PayFast recurring tokenization differs from once-off payment payloads | High | Isolate subscription routes from escrow routes and test in sandbox |
| Direct client writes conflict with immutable ledger rules | High | Move stage escrow initialization and release approval to server endpoints |
| Existing tests assume five percent fee | Medium | Update tests with explicit migration notes and backward-compatible assertions where needed |

## Dependencies

- Phase 1 role and firm model.
- Existing payment routes in [src/lib/api-router.ts](src/lib/api-router.ts:1288).
- Existing financial UI in [src/components/FinancialDashboard.tsx](src/components/FinancialDashboard.tsx:13).

