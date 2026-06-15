# Pack 01 — Demo Site Implementation — Report (CORRECTED)

**Date:** 2026-06-15
**Reviewer:** Hermes Agent
**Spec:** `01-numbered-core-packs/01-architex-demo-pack.zip`
**Target:** `origin/main`

---

## File Verification

**16/16 files present in main.** All demo components, seed data, and config files verified.

## Build Checks

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ PASS (0 pack errors, 5 pre-existing in `documentsDrawingExample.ts`) |
| `curl http://localhost:3001/` | ✅ 200 — Vite dev server running |
| `curl /api/health` | ✅ 200 |

## Issues

### 🔥 BLOCKER: Demo sandbox isolation NOT complete
**Exact evidence from live repo:**
- `src/services/`: **367 raw Firestore calls across 42 service files**
- System-wide: **643 total raw Firestore references**
- Worst: Pack 11 closeout services (43 calls), `api-router.ts` (9 calls)

Demo users will write/read LIVE Firestore paths instead of `/demo/{uid}/`. This is a **BLOCKER**.

### 🔥 BLOCKER: Firebase project + deploy not done
`demo-firebase-config.json` has placeholder values. `demo.architex.co.za` not deployed.

## Status

| Category | Status |
|----------|--------|
| Technical compile | ✅ PASS |
| App.tsx wiring | ✅ Complete |
| Docs/DOX | ✅ Present |
| Demo isolation | ❌ **BLOCKER** — 643 raw Firestore refs system-wide |
| Firebase/deploy config | ❌ **BLOCKER** — not created |
