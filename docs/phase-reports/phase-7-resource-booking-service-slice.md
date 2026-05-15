# Phase 7 Resource Booking Domain Slice

## Implemented service slice

`src/services/resourceBookingService.ts` provides pure domain helpers for resource-sharing booking conflict checks, usage billing, and owner payout aggregation. It avoids API router, Firestore rules, payment gateways, and external resource access providers.

## Booking conflict logic

- Valid booking windows must have parseable ISO date strings and `endsAt > startsAt`.
- Active statuses for conflict detection are `pending` and `confirmed`.
- `cancelled` and `completed` bookings are ignored for future conflict checks.
- Conflicts are only detected against the same `resourceId`.
- Adjacent windows are allowed: an existing booking ending exactly at the requested start time does not conflict.
- Overlap formula: `request.startsAt < existing.endsAt && existing.startsAt < request.endsAt`.

## Usage billing formula

`calculateResourceUsageBilling` supports:

1. Hourly billing
   - `elapsedMinutes = ceil((endedAt - startedAt) / 60000)`.
   - `billableMinutes = max(elapsedMinutes, minimumBillableMinutes || 0)`.
   - `grossAmountCents = ceil((billableMinutes / 60) * hourlyRateCents)`.
2. Metered unit billing
   - `grossAmountCents = ceil(meteredUnits * meteredUnitRateCents)`.

For both modes:

- `platformFeeCents = ceil(grossAmountCents * platformFeeBps / 10000)`.
- `ownerPayoutCents = grossAmountCents - platformFeeCents`.
- The result stores a human-readable `formula` string for auditability.

## Owner payout traceability

`buildResourcePayoutRecord` aggregates usage billing results into a pending payout record with:

- resource owner ID,
- payout batch ID,
- contributing booking IDs,
- gross amount,
- platform fee,
- owner payout,
- single currency,
- pending status.

It rejects empty payout batches, mixed-currency batches, and usage records from a different resource.

## External-provider boundary

This slice does not provision access sessions, call remote desktop providers, call payment gateways, or simulate payouts. Those integrations must be handled by later coordinated API/job layers after real provider credentials and operational policies are configured.

## Validation

Targeted tests in `src/services/__tests__/resourceBookingService.test.ts` cover:

- active same-resource overlap detection,
- adjacent booking allowance,
- cancelled and other-resource exclusions,
- confirmation blocking on conflict,
- hourly billing with minimum billable time,
- metered usage billing,
- owner payout aggregation,
- invalid windows and mixed-currency rejection.
