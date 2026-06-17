# Pack 11 — Closeout Handover Occupancy — Report

**Date:** 2026-06-15
**Spec:** `01-numbered-core-packs/11-architex-closeout-handover-occupancy-pack.zip`

---

## File Verification

| File | Lines | Raw DB | Notes |
|------|-------|--------|-------|
| `closeoutService.ts` | 331 | 🚨 **10** | Direct Firestore writes |
| `handoverPackService.ts` | 454 | 🚨 **8** | Direct Firestore writes |
| `defectsCloseoutService.ts` | 241 | 🚨 **5** | |
| `defectsLiabilityService.ts` | 402 | 🚨 **9** | |
| `practicalCompletionService.ts` | 316 | 🚨 **5** | |
| `occupationReadinessService.ts` | 295 | 🚨 **6** | |

## 🔥 BLOCKER: 43 raw Firestore calls in Pack 11

These services write directly to Firestore using `doc(db, ...)` / `setDoc()` / `updateDoc()` etc. They will write to **live production Firestore paths** instead of demo-scoped `/demo/{uid}/` paths.

**This is the biggest demo-isolation gap found so far.** Every closeout operation — snag recording, handover pack creation, certificate issuing, defect liability tracking — will pollute production data in demo mode.

**Fix needed:** Convert all calls to use `demoFirestore.ts` wrappers (`getDemoDoc`, `getDemoCol`).

## Summary

| Category | Status |
|----------|--------|
| All files present | ✅ 6/6 |
| Raw Firestore calls | 🔥 **43 calls across all 6 files** |
| Demo isolation | ❌ **BLOCKER — will write to live paths** |
