# Pack 04 — Professional Toolboxes & Proposal Builder — Report

**Date:** 2026-06-15
**Spec:** `01-numbered-core-packs/04-architex-professional-toolboxes-proposal-builder-pack.zip`

---

## File Verification

| Spec File | In Main | Lines | Raw DB | Notes |
|-----------|---------|-------|--------|-------|
| `toolboxTypes.ts` | ❌ Renamed | — | — | Types merged into `comprehensiveToolRegistryService.ts` |
| `toolboxRegistry.ts` | ❌ Renamed | — | — | Replaced by `toolboxAgentService.ts` + `toolboxCalculatorService.ts` |
| `calculatorEngine.ts` | ✅ as `formulaCalculatorEngine.ts` | 407 | 0 | More complete implementation |
| `proposalBuilderService.ts` | ✅ | 138 | 0 | |
| `termsService.ts` | ✅ | 324 | 0 | |
| `integrationAdapters.ts` | ❌ Renamed | — | — | Split into `proposalIntegrationAdapters.ts` + `integrationRegistryService.ts` |
| `inboxEventAdapter.ts` | ✅ | 95 | 0 | |
| `agentRecommendationService.ts` | ✅ | 125 | 0 | |
| `sampleData.ts` | ✅ | 61 | 0 | |
| `professionalToolboxesExample.ts` | ❌ **MISSING** | — | — | Runnable demo not in main |

## Key Issues

1. **Missing example file** — `professionalToolboxesExample.ts` not in main
2. **ProposalBuilderPanel.tsx** — UI component has **2 raw Firestore calls** 🔥 This is a consumer that needs demo-scope conversion
3. **Naming drift** — spec names differ from main names (acceptable if documented, but current implementation is more complete)

## Summary

| Category | Status |
|----------|--------|
| Core services present | ✅ 6/6 (with name variations) |
| Example file | ❌ Missing |
| Raw Firestore calls | ✅ 0 in services; 🔥 2 in ProposalBuilderPanel UI |
| Demo sandbox isolation | ⚠️ ProposalBuilderPanel writes to live Firestore |
