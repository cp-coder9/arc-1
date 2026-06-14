# AGENTS.md — Finance Domain Services

## Purpose

All money movement, trust/escrow wallets, card/EFT collections, payouts, compliance-sensitive financial services, and commercial control. This domain is subject to strict regulatory oversight — all financial operations must execute through trusted third-party registered financial service providers through approved connectors. Architex stores project/commercial records, approvals, provider references, webhooks, and audit trails.

## Ownership

- **Path:** `src/services/finance/`
- **Owner:** Financial Systems Team
- **Key files (20+):** `types.ts`, `commercialBaselineService.ts`, `paymentScheduleService.ts`, `claimSubmissionService.ts`, `paymentCertificateService.ts`, `cashflowForecastService.ts`, `escrowReleaseRequestService.ts`, `retentionService.ts`, `variationControlService.ts`, `paymentProviderWebhookAdapter.ts`, `thirdPartyFinancialProviderRegistry.ts`, `agentRecommendationService.ts`, `auditTrailService.ts`, `inboxEventAdapter.ts`, `projectRecordAdapter.ts`, `index.ts`, `sampleData.ts`
- **Module key:** `finance` (barrel export via `index.ts`)

## Local Contracts

### Domain Types (`types.ts`)
Core financial types: `FinancePartyRole`, `ProviderType`, `MoneyStatus`, `VariationStatus`, `MoneyAmount`, `AwardSnapshot`, `CommercialBaseline`, `PaymentMilestone`, `VariationRequest`, `PaymentClaim`, `PaymentCertificate`, `FinancialProvider`, `ReleaseRequest`, `CashflowForecast`, `RetentionRecord`, `FinanceProjectRecord`, `FinanceInboxEvent`, `FinanceAuditRecord`, `FinanceAgentRecommendation`

### Service Contracts

| Service | Responsibility |
|---------|---------------|
| `commercialBaselineService` | Create/update baselines, incorporate/remove variations, calculate contingency |
| `paymentScheduleService` | Generate and manage milestone-based payment schedules |
| `claimSubmissionService` | Submit and track payment claims |
| `paymentCertificateService` | Issue and manage payment certificates |
| `cashflowForecastService` | Project and analyze cashflow across milestones |
| `escrowReleaseRequestService` | Manage escrow release workflows |
| `retentionService` | Track and release retention amounts |
| `variationControlService` | Manage variation orders and their financial impact |
| `paymentProviderWebhookAdapter` | Handle payment provider webhook callbacks |
| `thirdPartyFinancialProviderRegistry` | Registry of approved financial service providers |

### Critical Rules
- **No money movement code runs in Architex** — all execution delegates to third-party providers through the `thirdPartyFinancialProviderRegistry`
- Webhook adapters must validate provider signatures before processing callbacks
- All financial events must produce audit records via `auditTrailService`
- Inbox events must normalize through `inboxEventAdapter.ts`
- Project records must normalize through `projectRecordAdapter.ts`
- Agent recommendations follow finance-specific rules in `agentRecommendationService.ts`

## Work Guidance

- New financial services must register types in `types.ts` and export via `index.ts`
- Webhook integrations must implement signature verification before processing
- Escrow state machine transitions: Unfunded -> FundedHeld -> Released / Disputed
- All financial data must use `MoneyAmount` type for consistent decimal handling
- Provider integrations must be registered in `thirdPartyFinancialProviderRegistry` before use
- Test all new services in `src/services/finance/__tests__/`

## Verification

- `npm test` covers all `src/services/finance/__tests__/*.test.ts` files
- Key test files: `cashflowForecastService.test.ts`, `claimSubmissionService.test.ts`, `commercialBaselineService.test.ts`, `escrowReleaseRequestService.test.ts`, `integration.test.ts`, `paymentCertificateService.test.ts`, `paymentProviderWebhookAdapter.test.ts`, `paymentScheduleService.test.ts`, `retentionService.test.ts`, `thirdPartyFinancialProviderRegistry.test.ts`, `variationControlService.test.ts`

## Child DOX Index

No child AGENTS.md files exist below this directory.
