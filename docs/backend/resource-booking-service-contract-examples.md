# Resource Booking Service Contract Examples

Date: 2026-05-15  
Scope: deterministic, non-production service contract examples for `src/services/resourceBookingService.ts`. These examples document pure backend-domain helper behaviour only. They do not reserve a real resource, provision access, charge a payment method, release payouts, or call external providers.

## Booking conflict contract

Existing booking windows:

```json
[
  {
    "id": "booking-1",
    "resourceId": "resource-1",
    "startsAt": "2026-05-15T10:00:00.000Z",
    "endsAt": "2026-05-15T12:00:00.000Z",
    "status": "confirmed"
  },
  {
    "id": "booking-2",
    "resourceId": "resource-1",
    "startsAt": "2026-05-15T12:00:00.000Z",
    "endsAt": "2026-05-15T13:00:00.000Z",
    "status": "cancelled"
  },
  {
    "id": "booking-3",
    "resourceId": "resource-2",
    "startsAt": "2026-05-15T10:30:00.000Z",
    "endsAt": "2026-05-15T11:30:00.000Z",
    "status": "confirmed"
  }
]
```

Overlapping same-resource request:

```json
{
  "resourceId": "resource-1",
  "startsAt": "2026-05-15T11:30:00.000Z",
  "endsAt": "2026-05-15T12:30:00.000Z"
}
```

Expected conflicts:

```json
[
  {
    "bookingId": "booking-1",
    "resourceId": "resource-1",
    "startsAt": "2026-05-15T10:00:00.000Z",
    "endsAt": "2026-05-15T12:00:00.000Z",
    "status": "confirmed"
  }
]
```

Adjacent windows are allowed, and cancelled or different-resource bookings are ignored:

```json
{
  "canConfirm": true,
  "conflicts": []
}
```

Durable conflict audit for a blocked request:

```json
{
  "request": {
    "resourceId": "resource-1",
    "startsAt": "2026-05-15T11:00:00.000Z",
    "endsAt": "2026-05-15T12:00:00.000Z"
  },
  "conflicts": [
    {
      "bookingId": "booking-1",
      "resourceId": "resource-1",
      "startsAt": "2026-05-15T10:00:00.000Z",
      "endsAt": "2026-05-15T12:00:00.000Z",
      "status": "confirmed"
    }
  ],
  "canConfirm": false,
  "checkedAt": "2026-05-15T09:00:00.000Z",
  "reason": "active_booking_overlap"
}
```

## Usage billing contract

Hourly usage with a 30-minute minimum:

```json
{
  "usage": {
    "bookingId": "booking-1",
    "resourceId": "resource-1",
    "userId": "freelancer-1",
    "startedAt": "2026-05-15T10:00:00.000Z",
    "endedAt": "2026-05-15T10:20:00.000Z"
  },
  "policy": {
    "billingMode": "hourly",
    "hourlyRateCents": 12000,
    "minimumBillableMinutes": 30,
    "platformFeeBps": 1500,
    "currency": "ZAR"
  }
}
```

Expected billing result:

```json
{
  "bookingId": "booking-1",
  "resourceId": "resource-1",
  "userId": "freelancer-1",
  "billableMinutes": 30,
  "meteredUnits": 0,
  "grossAmountCents": 6000,
  "platformFeeCents": 900,
  "ownerPayoutCents": 5100,
  "currency": "ZAR",
  "formula": "ceil((30 / 60) * 12000); platformFee=ceil(6000 * 1500 / 10000); ownerPayout=6000-900"
}
```

Metered unit usage:

```json
{
  "bookingId": "booking-metered",
  "resourceId": "resource-plotter",
  "userId": "bep-1",
  "billableMinutes": 5,
  "meteredUnits": 7,
  "grossAmountCents": 1750,
  "platformFeeCents": 175,
  "ownerPayoutCents": 1575,
  "currency": "ZAR",
  "formula": "ceil(7 * 250); platformFee=ceil(1750 * 1000 / 10000); ownerPayout=1750-175"
}
```

## Usage ledger contract

Usage must match the booked resource and fall within the booked time window before ledgering.

```json
{
  "usageLogId": "usage-log-1",
  "bookingId": "booking-1",
  "resourceId": "resource-1",
  "userId": "freelancer-1",
  "billableMinutes": 90,
  "meteredUnits": 0,
  "grossAmountCents": 12000,
  "platformFeeCents": 1500,
  "ownerPayoutCents": 10500,
  "currency": "ZAR",
  "formula": "ceil((90 / 60) * 8000); platformFee=ceil(12000 * 1250 / 10000); ownerPayout=12000-1500",
  "occurredAt": "2026-05-15T11:50:00.000Z",
  "notes": "Used meeting room for client workshop"
}
```

## Owner payout aggregation contract

Payout records aggregate usage billing results without releasing money.

```json
{
  "resourceId": "resource-1",
  "ownerId": "owner-1",
  "payoutBatchId": "batch-1",
  "usageBookingIds": ["booking-1", "booking-2"],
  "grossAmountCents": 15000,
  "platformFeeCents": 1500,
  "ownerPayoutCents": 13500,
  "currency": "ZAR",
  "status": "pending",
  "createdAt": "2026-05-16T00:00:00.000Z",
  "idempotencyKey": "resource-1|owner-1|batch-1|booking-1,booking-2"
}
```

## Validation errors

```json
[
  { "error": "startsAt must be a valid ISO date string." },
  { "error": "Resource booking end time must be after start time." },
  { "error": "platformFeeBps must be between 0 and 10000." },
  { "error": "hourlyRateCents must be provided and non-negative for hourly billing." },
  { "error": "meteredUnitRateCents must be provided and non-negative for metered billing." },
  { "error": "meteredUnits cannot be negative." },
  { "error": "usageLogId is required to build a resource usage ledger entry." },
  { "error": "Resource usage must reference the same booking and resource." },
  { "error": "Resource usage can only be logged against confirmed or completed bookings." },
  { "error": "Resource usage must fall within the booked time window." },
  { "error": "At least one usage billing result is required to build a resource payout." },
  { "error": "Resource payout cannot combine multiple currencies." },
  { "error": "Resource payout cannot include usage from another resource." }
]
```

## Human confirmations still required

- Resource provider contracts, availability authority, and cancellation rules.
- Whether bookings can be auto-confirmed or always need owner acceptance.
- Live payment, escrow, payout, refund, and fee policy.
- Tax/VAT invoice requirements for resource usage and payouts.
- Access provisioning model for rooms, equipment, software seats, or remote resources.
