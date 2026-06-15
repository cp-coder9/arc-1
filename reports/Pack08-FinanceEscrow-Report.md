# Pack 08 — Finance Payment Escrow Commercial Control — Report

**Date:** 2026-06-15
**Spec:** `01-numbered-core-packs/08-architex-finance-payment-escrow-commercial-control-pack.zip`

---

## File Verification

| Spec File | In Main | Lines | Raw DB | Notes |
|-----------|---------|-------|--------|-------|
| `types.ts` | ✅ in `src/types.ts` | merged | — | Payment/Escrow/V2 types |
| `paymentCertificateService.ts` | ✅ in `paymentService.ts` | 640 | 0 | Merged into larger service |
| `paymentScheduleService.ts` | ✅ in `paymentService.ts` | 640 | 0 | |
| `paymentProviderWebhookAdapter.ts` | ✅ in `paymentService.ts` | 640 | 0 | |
| `escrowReleaseRequestService.ts` | ✅ as `escrowGovernanceService.ts` | 180 | 0 | |
| `retentionService.ts` | ✅ in `financialLedgerService.ts` | 600 | 0 | |
| `variationControlService.ts` | ✅ in `finance/` | varies | — | In subdirectory |
| `cashflowForecastService.ts` | ✅ as `cashflowWorkflowAgent.ts` | 250 | 0 | |
| `claimSubmissionService.ts` | ✅ in `finance/` | — | 0 | |
| `thirdPartyFinancialProviderRegistry.ts` | ✅ as `paymentProviderReadinessService.ts` | 110 | 0 | |
| `auditTrailService.ts` | ✅ | 189 | 0 | |
| `projectRecordAdapter.ts` | ✅ in `finance/projectRecordAdapter.ts` | 70 | 0 | |
| `inboxEventAdapter.ts` | ✅ | 95 | 0 | |
| `agentRecommendationService.ts` | ✅ | 125 | 0 | |
| `sampleData.ts` | ✅ | 61 | 0 | |
| `financeCommercialControlExample.ts` | ❌ | — | — | Not in main |

**All services present** (some merged into larger files or in `finance/` subdirectory). 0 raw Firestore calls. The `finance-api-router.ts` (20+ endpoints) handles actual HTTP/firebase interactions — check separately.

## 🔥 Critical: Finance API router
The `src/lib/finance-api-router.ts` uses Express routes with Firestore. Check for demo-scope there.

## Summary: ✅ Services clean. Finance API router needs demo-audit.
