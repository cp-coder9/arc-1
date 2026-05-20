# Sensitive Workflow Feature Flags and Launch Gates

Date: 2026-05-15  
Scope: operational guidance for workflows that may touch money, contracts, statutory submissions, provider APIs, outbound email, procurement, or other irreversible/external effects.

This document is intentionally policy and integration guidance. It does not enable production payments, e-signatures, escrow releases, statutory submissions, provider orders, or outbound transactional email. It defines the flags and human gates that should exist before those workflows are made live.

## Default posture

All sensitive workflows must default to safe local/dev behavior until product, legal, compliance, and provider owners confirm launch requirements.

Recommended defaults:

```env
ARCHITEX_ENABLE_LIVE_PAYMENTS=false
ARCHITEX_ENABLE_ESCROW_RELEASES=false
ARCHITEX_ENABLE_BINDING_APPOINTMENTS=false
ARCHITEX_ENABLE_E_SIGNATURE_SUBMISSION=false
ARCHITEX_ENABLE_MUNICIPAL_SUBMISSIONS=false
ARCHITEX_ENABLE_STATUTORY_CPD_SYNC=false
ARCHITEX_ENABLE_PROVIDER_VERIFICATION_AUTOMATION=false
ARCHITEX_ENABLE_SUPPLIER_ORDERING=false
ARCHITEX_ENABLE_RESOURCE_PROVISIONING=false
ARCHITEX_ENABLE_TRANSACTIONAL_EMAIL=false
ARCHITEX_EXTERNAL_ACTIONS_DRY_RUN=true
```

Existing PayFast variables such as `VITE_PAYFAST_SANDBOX=true` remain necessary but are not sufficient by themselves. A sandbox/payment credential flag only chooses the gateway environment. The workflow flag must also allow the action, and the route/service must still enforce human approval, audit recording, and role gates.

## Flag matrix

| Workflow | Required flag before live effects | Default behavior while disabled | Required human confirmation |
|---|---|---|---|
| Payment checkout/initiation | `ARCHITEX_ENABLE_LIVE_PAYMENTS=true` plus provider sandbox/production config | Return/read payment intent previews, invoice drafts, or sandbox-only URLs. | Gateway, fee schedule, chargeback/refund rules, POPIA/payment data policy. |
| Escrow allocation/release | `ARCHITEX_ENABLE_ESCROW_RELEASES=true` | Create advisory escrow schedules and ledger drafts only. No release instruction. | Escrow/legal custody model, settlement timing, release authority, dispute process. |
| Appointment acceptance | `ARCHITEX_ENABLE_BINDING_APPOINTMENTS=true` | Produce appointment readiness/preflight and draft terms only. | Whether in-app acceptance binds parties or requires external signature. |
| E-signature provider submission | `ARCHITEX_ENABLE_E_SIGNATURE_SUBMISSION=true` | Generate draft contract payloads only. | Provider contract, signer identity policy, evidence retention, refusal/cancel rules. |
| Municipal submission/sync | `ARCHITEX_ENABLE_MUNICIPAL_SUBMISSIONS=true` | Store manual evidence/status notes only. | Launch municipalities, portal/API terms, automation permission, evidence standards. |
| CPD statutory sync | `ARCHITEX_ENABLE_STATUTORY_CPD_SYNC=true` | Calculate CPD status and certificate eligibility locally only. | Accredited-provider status, council credentials, endpoint authority, certificate rules. |
| Professional/contractor/supplier verification automation | `ARCHITEX_ENABLE_PROVIDER_VERIFICATION_AUTOMATION=true` | Queue review tasks and keep inconclusive results `requiresHumanReview`. | Provider agreements, expiry windows, accepted evidence, override policy, SLA. |
| Supplier ordering/procurement | `ARCHITEX_ENABLE_SUPPLIER_ORDERING=true` | Compare options, flag risks, and create draft purchase-order recommendations only. | Supplier/provider contracts, pricing/availability authority, delivery/order policy. |
| Remote resource provisioning | `ARCHITEX_ENABLE_RESOURCE_PROVISIONING=true` | Create booking/usage previews without provisioning access sessions. | Resource providers, access/session policies, payout provider, support process. |
| Transactional email/invitations | `ARCHITEX_ENABLE_TRANSACTIONAL_EMAIL=true` | Persist in-app notifications and reminders only. | Email provider, templates, opt-out/legal copy, delivery monitoring. |

## Runtime guard pattern

Every live external-effect handler should check both a feature flag and a dry-run override before constructing provider requests:

```ts
function requireExternalActionEnabled(flagName: string) {
  const enabled = process.env[flagName] === 'true';
  const dryRun = process.env.ARCHITEX_EXTERNAL_ACTIONS_DRY_RUN !== 'false';

  if (!enabled || dryRun) {
    return {
      allowed: false,
      dryRun: true,
      reason: `${flagName} is disabled or external actions are in dry-run mode`,
    };
  }

  return { allowed: true, dryRun: false };
}
```

Before any provider request is submitted, the route should also run a preflight that proves:

- the workflow feature flag is enabled;
- global dry-run is explicitly disabled;
- an accountable `humanConfirmationId` exists;
- an `idempotencyKey` exists for safe retries;
- the route can record an audit event with actor, target, provider, guard result, confirmation, and idempotency metadata.

The shared helper is `preflightSensitiveWorkflow()` in `src/lib/sensitiveWorkflowGuards.ts`. It returns `canSubmitToProvider: false` and a safe response payload unless all of those gates pass. Browser-facing workflows should show the safe response instead of attempting live payments, escrow releases, e-signatures, municipal submissions, provider verifications, supplier orders, resource provisioning, or transactional email.

Recommended response shape while disabled:

```json
{
  "externalActionQueued": false,
  "dryRun": true,
  "requiresHumanConfirmation": true,
  "reason": "ARCHITEX_ENABLE_LIVE_PAYMENTS is disabled or external actions are in dry-run mode",
  "createsPayment": false,
  "createsContract": false,
  "createsSignature": false,
  "submitsToProvider": false
}
```

## Audit requirements before enabling

Before any flag is set to `true` in a production environment, the workflow should have tests or monitoring that prove:

1. disabled flags produce no outbound provider calls;
2. dry-run mode produces no irreversible external effects;
3. every live action records an audit event with actor, target, provider, request correlation ID, and human approval reference;
4. failures are idempotent or safely retryable;
5. role and verification gates are enforced server-side;
6. provider credentials are absent from client bundles and logs;
7. generated documents or provider payloads are retained according to confirmed retention policy.

## CI and deployment recommendations

- Keep pull-request CI on safe local mocks only.
- Add a deployment-time smoke check that fails if a live flag is enabled without the corresponding provider credentials and human-confirmation record.
- Keep production credentials out of `VITE_*` variables unless they are explicitly safe for client exposure. Server-only secrets should not use the Vite public prefix.
- Require an operator change record for any transition from dry-run to live behavior.
- Prefer per-environment flags over per-branch behavior so staging can test provider sandbox paths without making production live.

## Related references

- `docs/phase-reports/human-confirmations-required.md`
- `docs/backend/phase-2-read-api-contract-examples.md`
- `docs/backend/api-reference.md`
- `docs/phase-reports/phase-6-appointment-project-initiation.md`
- `docs/phase-reports/phase-7-resource-booking-service-slice.md`
- `docs/phase-reports/phase-7-cpd-service-slice.md`
