## Hermes final pre-merge review — PR #129

Verdict: Changes still required before merge.

Latest head reviewed: `a772704fb86679d09a19ed21fadcf1e52aab4c7a`
GitHub checks: passing.

What is fixed:
- SpecForge router is mounted and uses `requireAuth`.
- SpecForge project membership now fails closed for missing project, empty team members, and lookup errors.
- Issuer / decidedBy / reviewedBy are derived from `req.authContext`, not trusted from request body.
- Marketplace production UI gating is materially improved: `marketplace` is `demoOnly`, `getNavigationForRole()` filters demo-only modules, and the render branch uses `import.meta.env.VITE_DEMO_MODE`.

Remaining final blockers:

1. Production SpecForge drawing resolution still falls back to sample drawing data.

Evidence:
- `src/services/specforge/specforgeDrawingAdapter.ts:82-91` says production should query Firestore, but the default `_fetchDrawingsForProject` returns `sampleDrawings`.
- `src/lib/specforge-api-router.ts:337-338` calls `resolveDrawingRefs(allRefs, projectId)` during the production workspace route path.

Required fix: wire `setDrawingDataSource()` to a real project drawing register / Firestore source during server initialization, or fail closed with unavailable drawing resolution. Do not let production spec readiness/warnings derive from sample drawings.

2. SpecForge PR still carries the Marketplace implementation surface.

Evidence:
- PR #129 still includes 36 files under `src/features/marketplace/**` plus `src/lib/marketplace-api-router.ts` even though this PR is titled SpecForge integration.
- The marketplace page is demo-gated, but the code overlaps directly with PR #125 and increases merge-order risk.

Required fix: split marketplace files out of PR #129 unless they are strictly required for this SpecForge branch. If kept, state the dependency/order explicitly and prove there is no conflict with PR #125.

Merge note:
- A local merge sequence already conflicts at PR #126 before reaching PR #129, so this branch should be rebased after the earlier PR stack is resolved.
