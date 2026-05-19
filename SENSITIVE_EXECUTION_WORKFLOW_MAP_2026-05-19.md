# Sensitive Execution Workflow Map

Date: 2026-05-19

## Purpose

Inventory every currently guarded or disabled money/signature/contract action and map the required backend, Firestore, and human-confirmation path before enabling any execution button.

## Current guarded UI actions

| UI surface | Disabled/action text | Current state | Required backend endpoint | Required records | Human-gate requirement |
|---|---|---|---|---|---|
| `ContractSigningPage` | `Request signature disabled` | Review-only contract readiness | `POST /api/contracts/:contractId/signature-request` | `appointment_contracts`, `human_signoffs`, `audit_logs`, optional `signature_requests` | Contract participants must explicitly confirm scope, deliverables, milestones, verification, and escrow readiness. |
| `ContractSigningPage` | `Accept / bind disabled` | Review-only acceptance/binding | `POST /api/contracts/:contractId/acceptance` | `appointment_contracts`, `human_signoffs`, `audit_logs`, `notifications` | Client and professional/contractor acceptance must be separated; no self-approval or AI auto-acceptance. |
| `FinancialDashboard` | `Initiate payment disabled` | Ledger/escrow view only | `POST /api/payments/initiate` | `invoices`, `ledger_entries`, `payment_intents`, `human_signoffs`, `audit_logs` | Payment owner plus admin/provider-readiness confirmation before gateway call. |
| `FinancialDashboard` | `Release escrow disabled` | Pending release count only | `POST /api/escrow/:escrowId/release` | `escrow`, `ledger_entries`, `milestone_release_requests`, `human_signoffs`, `audit_logs` | Release needs milestone evidence, payer approval, recipient identity, and separation-of-duty check. |
| `FinancialDashboard` | `Provider submission disabled` | No provider call from browser | `POST /api/payments/provider-submission` | `payment_intents`, `provider_events`, `audit_logs` | Backend-only provider interaction, idempotency key, signed callback validation. |
| `PackageProcurementWorkspace` | purchase order drafts / BoM evidence guards | Human-reviewed package/procurement evidence | `POST /api/packages/:packageId/purchase-orders` | `tender_packages`, `package_delivery_evidence`, `purchase_orders`, `human_signoffs`, `audit_logs` | Procurement issuer and approver must be distinct where value threshold applies. |
| `PackageCloseoutPage` | close-out evidence/snags | Evidence stored with `humanReviewRequired: true` | `POST /api/packages/:packageId/closeout/submit` and `POST /api/packages/:packageId/closeout/approve` | `package_delivery_evidence`, `package_snags`, `site_inspections`, `human_signoffs`, `audit_logs` | Close-out cannot auto-certify; required evidence and inspection signoff must be reviewed. |
| `BEPFreelancerJobsPage` | `Approve for invoice readiness` | Can mark deliverable review state, not pay | `POST /api/freelancer-tasks/:taskId/invoice-readiness` | `delegatedTasks`, `invoices`, `human_signoffs`, `audit_logs` | BEP approval only prepares invoice readiness; payment still needs payment workflow. |

## Required server controls for every endpoint

1. Firebase Admin ID token verification.
2. Role and resource ownership/participation check.
3. Feature flag check, off by default for production money/signature execution.
4. Human-signoff requirement with actor, timestamp, action type, target, and immutable summary.
5. Audit log write before and after execution attempt.
6. Idempotency key for payment/provider/escrow routes.
7. No AI-originated execution without human confirmation.
8. Separation-of-duty rules for high-risk actions:
   - requester cannot be the sole releaser for escrow/payment.
   - provider callback validation must be backend-only.
   - admin override must create explicit audit and signoff records.

## Firestore/rules implications

Current rules already enforce `humanReviewRequired == true` across several browser-created records. Execution records should be server-owned, with browser reads limited to participants/admin:

- `human_signoffs`: server-created only.
- `audit_logs` / `ai_action_logs`: server-created only.
- `payment_intents`: server-created only, participant/admin read.
- `provider_events`: server-created only, admin read.
- `milestone_release_requests`: participant create/review may be allowed, actual release server-only.
- `signature_requests`: server-created after participant request validation.

## Next implementation order

1. Create shared `sensitiveWorkflowGuards` server helpers for feature flags, signoff checks, and audit logging.
2. Implement `POST /api/contracts/:contractId/signature-request` as the first non-money endpoint.
3. Implement `POST /api/contracts/:contractId/acceptance` with dual-party acceptance records.
4. Implement payment intent creation in sandbox/test mode only.
5. Implement escrow release request/review before actual release execution.
