# Pack 09 — Site Execution & Field Control — Report

**Date:** 2026-06-15
**Spec:** `01-numbered-core-packs/09-architex-site-execution-field-control-pack.zip`

---

## File Verification

| Spec File | In Main | Lines | Raw DB | Notes |
|-----------|---------|-------|--------|-------|
| `types.ts` | ✅ in `src/types.ts` | merged | — | Severity, NCR, Snag, SI, etc |
| `dailyLogService.ts` | ✅ | 132 | 0 | |
| `delayEarlyWarningService.ts` | ✅ as `delayWarningService.ts` | 125 | 0 | Slight rename |
| `fieldEvidenceService.ts` | ✅ | 148 | 0 | |
| `nonConformanceService.ts` | ✅ as `ncrService.ts` | 320 | 0 | Renamed |
| `paymentBlockerService.ts` | ✅ | 65 | 0 | |
| `programmeImpactService.ts` | ✅ | 88 | 0 | |
| `siteInstructionService.ts` | ✅ | 250 | 0 | |
| `snagService.ts` | ✅ | 320 | 0 | |
| `inspectionService.ts` | ❌ | — | — | Not found as standalone |
| `rfiService.ts` | ❌ | — | — | Not found as standalone |
| `siteExecutionFieldControlExample.ts` | ❌ | — | — | Not in main |
| `auditTrailService.ts` | ✅ | 189 | 0 | |
| `projectRecordAdapter.ts` | ✅ | 51 | 0 | |
| `inboxEventAdapter.ts` | ✅ as `siteExecutionInboxEventAdapter.ts` | 80 | 0 | |
| `agentRecommendationService.ts` | ✅ | 125 | 0 | |
| `sampleData.ts` | ✅ | 61 | 0 | |

## 🔥 Missing: inspectionService, rfiService
These spec services are not present anywhere in main. RFI functionality may exist in `communicationWorkflowService.ts` or elsewhere but needs verification.

## UI Components
Spec mentions site execution UI. Main has: `NCRManager.tsx`, `SiteInstructionManager.tsx`, `SnagManager.tsx` (3 UI components). These may access Firestore.

## Summary: ⚠️ 2 services missing (inspection, RFI). Others present with naming drift. 0 raw DB in services.
