## Hermes final pre-merge review — PR #126

Verdict: Changes still required before merge.

Latest head reviewed: `fb42a98fa9f28e70faf0985e5a71ab6ec0a9aff0`
GitHub checks: passing.

What is fixed:
- The previous TypeScript errors are resolved: `SourceVersionService.importFeeTable()` and `RunPersistenceService.export()` now exist and are called by `src/lib/fee-proposal-api-router.ts:114` and `:218`.

Remaining final blockers:

1. PR #126 cannot be merged cleanly after PR #124 + PR #125.

Evidence from a local no-commit merge sequence `origin/main -> PR124 -> PR125 -> PR126`:
- `api-server.ts` — content conflict.
- `server.ts` — content conflict.
- `src/App.tsx` — content conflict.
- Add/add conflicts in marketplace components and services, including:
  - `src/features/marketplace/components/MarketplaceShell.tsx`
  - `src/features/marketplace/components/ProjectMarketplace.tsx`
  - `src/features/marketplace/components/TaskMarketplace.tsx`
  - `src/features/marketplace/services/projectMarketplaceService.ts`
  - `src/features/marketplace/services/taskMarketplaceService.ts`
  - `src/lib/marketplace-api-router.ts`
- `src/services/professionalFee/adapters.ts` — modify/delete conflict.

Required fix: rebase PR #126 onto the intended post-PR125 branch, or split the fee-proposal work away from duplicated marketplace code.

2. The mounted fee-proposal API is still process-memory persistence, not production persistence.

Evidence:
- `src/lib/fee-proposal-api-router.ts:3-4` says it uses `InMemoryFirestoreAdapter` and must be replaced with real Firebase for durable production storage.
- `src/lib/fee-proposal-api-router.ts:30-35` creates shared process-lifetime service instances backed by `new InMemoryFirestoreAdapter()`.
- This router is mounted in production/dev entrypoints:
  - `api-server.ts:55-58`
  - `server.ts:103-107`

Required fix: replace in-memory persistence with real Firestore-backed persistence before mounting production routes, or demo-gate/unmount these API routes.

3. Admin/auth enforcement is still not production-grade.

Evidence:
- `src/lib/fee-proposal-api-router.ts:44-56` uses a local `requireAdmin()` that reads `req.authContext ?? req.user`, but the router is mounted directly and does not itself run `requireAuth`.
- `src/lib/fee-proposal-api-router.ts:51-54` allows the admin guard to pass automatically outside production.
- `src/lib/fee-proposal-api-router.ts:69` and `:92` still fall back to `system` / `req.user` instead of verified Firebase identity.

Required fix: mount the router behind the standard `requireAuth` middleware and derive all actor/admin decisions from `req.authContext`.
