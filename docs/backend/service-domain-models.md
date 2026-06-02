# Backend Service Domain Models

This note documents the pure service-domain model slices added for the Phase 2, 5, 6, and 7 workflows. These services deliberately keep business invariants in dependency-light TypeScript functions so API routes, workers, and UI surfaces can share the same behaviour without duplicating validation logic.

## Design constraints

- **Pure by default:** domain builders and guards accept plain records and return plain records, with no Firestore or browser dependency.
- **Human authority preserved:** advisory AI, proposal comparison, procurement approval, appointment, and statutory sync flows never perform irreversible business effects without explicit human or provider confirmation metadata.
- **Idempotent financial effects:** payment callbacks, ledger entries, usage billing, and payouts expose deterministic keys or append-only guards before persistence.
- **Audit-ready outputs:** records include timestamps, actor ids, immutable flags, status reasons, or conflict lists so callers can persist reviewable evidence.
- **Phase boundaries:** API routes should orchestrate authentication and persistence only. They should call these pure services for invariant checks before writes.

## Phase 2 marketplace, brief, and appointment domain

Implemented in:

- `src/services/briefWorkflowService.ts`
- `src/services/marketplaceWorkflowService.ts`
- `src/services/appointmentWorkflowService.ts`
- `src/services/userVerificationService.ts`

Core model:

1. A client brief must be publishable before a marketplace opportunity is built.
2. Marketplace access requires an active verified participant record.
3. Proposal records are always `submitted`, contain a non-negative finite fee, and carry `humanReviewRequired: true`.
4. Proposal comparison is client-owned, requires at least two proposals, and is explicitly advisory only.
5. Appointment preconditions reject already-appointed briefs, mismatched proposal ownership, ineligible proposal statuses, and expired or non-SACAP BEP verification.
6. Appointment records require the client owner as creator, produce a deterministic idempotency key, and keep `legalAcceptanceRequired` plus `humanAcceptanceRequired` set to `true`.
7. Project stage history entries are immutable audit records rather than mutable project state.

Representative tests:

- `src/services/__tests__/briefWorkflowService.test.ts`
- `src/services/__tests__/marketplaceWorkflowService.test.ts`
- `src/services/__tests__/appointmentWorkflowService.test.ts`
- `src/services/__tests__/userVerificationService.test.ts`

## Phase 5 financial, escrow, claims, and ledger domain

Implemented in:

- `src/services/phase5FinancialDomain.ts`
- `src/services/paymentService.ts`
- `src/services/financialLedgerService.ts`

Core model:

1. Escrow status changes are constrained by `ESCROW_TRANSITIONS`; terminal statuses do not allow additional release, refund, or dispute events.
2. Release events must include a positive release amount, cannot exceed held funds, and must distinguish partial from full release semantics.
3. Payment callback idempotency keys are normalized from provider, provider reference, and payment id.
4. Ledger entry drafts require positive amounts, payer/payee/project/job ids, descriptions, and idempotency metadata.
5. Existing ledger rows are append-only. Adjustments must be represented as new reversal or correction rows, never updates.
6. Dispute holds create explicit escrow hold metadata linking dispute, project, job, actor, stage, and reason.
7. Invoice and fee calculations return deterministic draft records with totals and fee breakdowns for route-level persistence.

Representative tests:

- `src/services/__tests__/phase5FinancialDomain.test.ts`
- `src/services/__tests__/paymentService.test.ts`
- `src/services/__tests__/financialLedgerService.test.ts`

## Phase 6 package readiness, construction, and release gate domain

Implemented in:

- `src/services/packageReadinessService.ts`
- `src/services/contractorWorkflowService.ts`
- `src/services/constructionService.ts`
- `src/services/closeoutService.ts`

Core model:

1. Package readiness is calculated from tender award state, programme tasks, RFIs, inspections, close-out evidence, procurement commitments, snags, and an `asOf` date.
2. Missing award state, overdue RFIs, failed inspections, missing approved close-out evidence, dependency issues, and invalid human approvals become blockers.
3. Open RFIs, incomplete programme tasks, conditional inspections, pending approvals, and missing site logs become warnings.
4. Programme dependency validation detects missing predecessors, completed tasks with incomplete predecessors, and dependency cycles.
5. Procurement commitments requiring commercial effect, such as purchase orders, subcontract orders, or payment claims, must include recorded human approval before being treated as valid.
6. The output is a score, status, blockers, warnings, required evidence, missing evidence, dependency issues, and a human-readable summary suitable for dashboards and release gates.

Representative tests:

- `src/services/__tests__/packageReadinessService.test.ts`
- `src/services/__tests__/contractorWorkflowService.test.ts`
- `src/services/__tests__/constructionService.test.ts`
- `src/services/__tests__/lifecycle.integration.test.ts`

## Phase 7 CPD and resource booking domain

Implemented in:

- `src/services/cpdService.ts`
- `src/services/resourceBookingService.ts`

Core CPD model:

1. Assessments require a pass mark between 0 and 100, at least one question, positive question points, and at least one correct option per question.
2. Submissions must reference the same assessment being scored.
3. Answers are normalized by de-duplicating and sorting before comparison.
4. Score percentage is rounded deterministically to two decimal places.
5. Certificate verification hashes are deterministic SHA-256 hashes over user, course, attempt, issue/expiry, verification code, and issuer key.
6. Statutory sync is planned, not executed, unless provider configuration includes enabled state, provider name, endpoint URL, and API key.

Core resource booking model:

1. Booking windows require valid ISO dates and `endsAt` after `startsAt`.
2. Conflicts only consider the same resource and active booking statuses, currently `pending` and `confirmed`.
3. Conflict audits include request, conflicts, `canConfirm`, `checkedAt`, and a machine-readable reason.
4. Usage billing validates elapsed time, metered units, billing rate configuration, platform fee basis points, and minimum billable minutes.
5. Billing outputs include gross amount, platform fee, owner payout, currency, and the formula used.
6. Payout records aggregate booking ids and produce an idempotency key from resource, owner, payout batch, and usage bookings.

Representative tests and deterministic contract examples:

- `src/services/__tests__/cpdService.test.ts`
- `src/services/__tests__/resourceBookingService.test.ts`
- `docs/backend/cpd-service-contract-examples.md`
- `docs/backend/resource-booking-service-contract-examples.md`

## Route and persistence integration checklist

When wiring these services into API routes, keep the route responsibilities narrow:

1. Authenticate the user and load persisted records.
2. Call the relevant pure service guard or builder.
3. Persist only the returned record or derived mutation.
4. Store audit metadata alongside the write when the service exposes actor, reason, conflict, immutable, advisory, or idempotency fields.
5. Do not weaken service invariants in route-specific branches. If a new exception is required, add it to the pure service and cover it with a focused test first.
