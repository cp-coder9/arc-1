# Phase 2 Tasks — Monetization, Subscriptions, Activation Fees, Credits

| Priority | Task | Complexity estimate | Dependencies | Completion criteria |
|---|---|---:|---|---|
| P0 | Replace new-flow platform fee from five percent to one percent in centralized fee config | S | None | New escrow and release calculations use one percent and tests assert this |
| P0 | Add subscription, activation fee, credit, and commission types in [src/types.ts](src/types.ts:459) | M | Phase 1 user model | Types support PayFast references, status, amount, user, firm, and metadata |
| P0 | Move stage escrow privileged writes from [src/services/paymentService.ts](src/services/paymentService.ts:212) to server endpoints | L | Existing payment routes | Browser no longer attempts writes denied by [firestore.rules](firestore.rules:491) |
| P0 | Add PayFast subscription checkout and webhook handling in [src/lib/api-router.ts](src/lib/api-router.ts:1849) | L | PayFast sandbox | Professional subscription state updates only from verified server webhook |
| P0 | Add project activation fee flow before job marketplace visibility | M | Client job posting | New jobs are not visible as open until activation payment succeeds |
| P1 | Add credits purchase and spend endpoints | M | User credits type | Credit balance changes are server-only, ledgered, and idempotent |
| P1 | Extend financial dashboard summaries and filters | M | Ledger types | Subscription, activation, credit, platform fee, refund filters render correctly |
| P1 | Update Firestore rules for financial immutability | M | Type updates | Users cannot directly write ledger, subscription, activation, or credit balances |
| P1 | Add payment and webhook tests | L | Server routes | Tests cover one percent fee, R99 subscription, activation fee, credits, and duplicate ITNs |

