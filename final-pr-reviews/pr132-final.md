## Hermes final pre-merge review — PR #132

Verdict: Changes still required before merge.

Latest head reviewed: `8de47c5eb04b2ffb8e448b90db267720fe1b2ab7`
GitHub checks: passing.

What is fixed in latest round:
- Condition status update now fails closed when the condition has no linked application or the linked application is missing: `src/features/town-planning/router.ts:444-456`.
- `GET /applications/:id/conditions` now returns 404 when the application is missing before loading conditions: `src/features/town-planning/router.ts:485-494`.
- Action Centre side effects are now best-effort and no longer 500 after the primary mutation succeeds: `src/features/town-planning/router.ts:251-266`, `:392-406`.
- Deadline warnings were added for overdue deadlines: `src/features/town-planning/router.ts:322-345`.
- The new condition event type is no longer `condition_overdue`; it is now `decision_received`: `src/features/town-planning/router.ts:392-403`.

Remaining final blockers:

1. PR #132 is still a stacked mega-branch, not a narrow Town Planning PR.

Evidence:
- GitHub reports 192 changed files / +58,341 / -96.
- The diff still includes unrelated domains:
  - `src/features/marketplace/**`
  - `src/lib/marketplace-api-router.ts`
  - `src/lib/specforge-api-router.ts`
  - `src/services/calcHub/**`
  - `src/services/contractAdmin/**`
  - `src/components/ContractAdminDashboard.tsx`

Required fix: rebase/split PR #132 so it contains only Town Planning files plus the required server/navigation integration, or explicitly declare it as the final stacked integration PR after PR124-131 are merged and re-verify all included domains together.

2. Town Planning still has no production UI/client path.

Evidence:
- Search across `src/App.tsx`, `src/components`, and `src/navigation` finds no production React route/component/API client calling `/api/town-planning`.
- The only `/api/town-planning` references are in the backend router and tests under `src/features/town-planning/**`.

Required fix: either add the actual role-routed UI/client path, or narrow the PR body to “backend/API module only; user-facing UI deferred.”

3. Project Passport integration remains transition-only.

Evidence:
- Current router writes Action Centre events on transition, condition creation, and deadline reads, but Project Passport writeback is not visible in the latest `src/features/town-planning/router.ts` live path beyond the existing transition-side adapter pattern from prior review.
- No live writeback is visible for application creation, condition status changes, deadlines, readiness checks, appeals, or audit trail integration.

Required fix: either implement the promised Project Passport / audit writebacks for the meaningful mutation events, or narrow the claim to “partial Passport update on transition only.”

Merge note:
- Do not merge PR #132 until the earlier PR stack is resolved. As-is it imports prior marketplace/specforge/calchub/contract-admin scope and will be impossible to review as a single Town Planning change.
