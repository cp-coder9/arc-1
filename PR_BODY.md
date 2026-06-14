# Pack 8: Finance / Payment / Escrow + Commercial Control

> **Status:** ✅ Ready for review | **Tests:** 132/132 passing | **Module Key:** `finance_payment_escrow_commercial_control`

## Summary

Full implementation of the Architex commercial control layer after procurement and appointment. This pack manages commercial baselines, payment schedules, claims, payment certificates, variations, retention, escrow/payment release requests, cashflow forecasts, ProjectRecords, inbox events, audit trails, and agent recommendations.

## Critical Principle

**Architex does NOT hold client funds.** All payment services use trusted, third-party, registered financial service providers. Architex orchestrates commercial records, approval workflows, provider references, payment/escrow instructions, webhook confirmations, audit trails, dispute locks and reconciliation state. Actual money movement belongs to registered third-party providers.

## What's Included

### 14 New Services (`src/services/finance/`)

| Service | Purpose |
|---|---|
| `commercialBaselineService` | Contract sum, contingencies, approved variation totals, baseline updates |
| `paymentScheduleService` | Milestone/date-based payment plans, next-due tracking, escrow integration |
| `variationControlService` | State machine: draft → submitted → under_review → approved → incorporated / rejected |
| `claimSubmissionService` | Submit → review → certify → dispute workflow |
| `paymentCertificateService` | Gross certified → less retention → less previous → net payable, revision chains |
| `thirdPartyFinancialProviderRegistry` | Provider CRUD, capability-based selection, live-readiness checks |
| `escrowReleaseRequestService` | Release requests with provider boundary, approval gates, blocker detection |
| `paymentProviderWebhookAdapter` | Webhook parsing, confirmation, failure handling, status mapping |
| `retentionService` | Calculate, track balance, schedule release, partial/full release execution |
| `cashflowForecastService` | Projected inflows/outflows, actuals vs forecast comparison, merge |
| `projectRecordAdapter` | 8 ProjectRecord types for the Project Passport lifecycle |
| `inboxEventAdapter` | Targeted inbox events for all 9 participant roles |
| `auditTrailService` | POPIA-compliant audit entries for every financial action |
| `agentRecommendationService` | AI-agent guidance: approval gates, provider boundary, disputes, risk |

### API Routes (`src/lib/finance-api-router.ts`)

20+ new endpoints:
- `POST /api/projects/:id/commercial-baseline` — Create baseline from award
- `GET /api/projects/:id/payment-schedule` — Generate payment schedule
- `POST /api/projects/:id/variations` — Create variation request
- `PUT /api/projects/:id/variations/:vid/approve|reject|reverse`
- `POST /api/projects/:id/claims` — Submit payment claim
- `PUT /api/projects/:id/claims/:cid/dispute|resolve-dispute`
- `POST /api/projects/:id/payment-certificates` — Certify claim
- `PUT /api/projects/:id/payment-certificates/:cid/revise`
- `POST /api/providers/select|register`
- `POST /api/projects/:id/release-requests` — Create escrow release
- `PUT /api/projects/:id/release-requests/:rid/approve`
- `POST /api/webhooks/payment-provider` — Webhook adapter
- `POST /api/projects/:id/retention/calculate|records`
- `POST /api/projects/:id/cashflow-forecast` — Generate forecast
- `POST /api/projects/:id/finance/workflow-summary` — Compound endpoint (records + inbox + audit + recommendations)

### Tests

- **10 test suites** covering all 14 services
- **132 assertions** — all passing
- **Full workflow integration test**: Baseline → Variation → Claim → Certify → Retention → Escrow Release → Webhook → Payment → Cashflow Update
- Standalone validation: `npx tsx src/services/finance/__tests__/run-validation.ts`

## Guardrails Enforced

- [x] No Architex-held funds (provider boundary)
- [x] No automatic fund release without required approvals
- [x] Disputed claims lock payment release
- [x] Payment certificates are revised/superseded, never silently edited
- [x] Claimed, certified, approved-release, and provider-paid amounts are always separate
- [x] Variations require approval before contract sum changes
- [x] Provider custody/status is tracked and visible

## E2E Workflow Verified

```
Award → Commercial Baseline (R2.65M)
  → Variation Approved (+R85k, new sum R2.735M)
  → Payment Schedule (5 milestones)
  → Claim Submitted (R820k)
  → Payment Certificate (certified R790k, retention R39.5k, release R750.5k)
  → Disputed Claim → Certificate locked (disputed_locked)
  → Release Request → provider_configuration_required (no live provider)
  → Webhook Placeholder → received
  → Cashflow Forecast → generated
  → Project Records (4 linked records)
  → Inbox Events (4+ events across all roles)
  → Audit Trail (4 entries)
  → Agent Recommendations (5 recommendations)
```

## Remaining for Production

- [ ] Wire services to Firestore for persistence (`commercial_baselines`, `payment_schedules`, `variation_orders`, `claims`, `payment_certificates`, `escrow_releases`, `retention_records` collections)
- [ ] Implement real webhook signature verification with provider-specific keys
- [ ] Build UI components for Financial Dashboard, Variation Control, Claim/Certify workflow
- [ ] Integrate with cashflowWorkflowAgent for live payment triggers
- [ ] Add rate limiting and auth verification to finance routes

## File Changes

- **New:** `src/services/finance/` — 16 service files + barrel export
- **New:** `src/services/finance/__tests__/` — 10 test suites
- **New:** `src/lib/finance-api-router.ts` — 20+ API endpoints
- **Modified:** `src/lib/api-router.ts` — Mount finance router (+2 lines)

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
