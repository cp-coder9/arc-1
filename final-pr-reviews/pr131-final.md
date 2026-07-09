## Hermes final pre-merge review — PR #131

Verdict: Close, but one final auth/RBAC consistency fix recommended before merge.

Latest head reviewed: `3de97a1abeb473e308f3e2a15d769f2df9c8046c`
GitHub checks: passing.

What is fixed:
- The Town Planning scope has been removed from this Contract Admin PR. `git diff --name-only origin/main...origin/pr/131 | grep '^src/features/town-planning'` returns zero files.
- Contract Admin router is mounted in both server entrypoints.
- `src/lib/contract-admin-api-router.ts:48-49` applies `router.use(requireAuth)`.
- `src/lib/contract-admin-api-router.ts:51-66` applies `router.param('projectId', ...)` and checks shared `checkProjectMembership()` before project-scoped route handlers.
- The dashboard now loads/selects a real project context instead of using placeholders, and renders the real Contract Admin components.

Remaining final fix:

1. Contract Admin has two different project-membership semantics: router guard vs RBAC assignment builder.

Evidence:
- `src/lib/contract-admin-api-router.ts:58` uses shared `checkProjectMembership(uid, normalizedRole, projectId)` to admit the request.
- `src/lib/contract-admin-api-router.ts:69-86` then rebuilds a narrower `ContractProjectAssignment` by checking only `projects/{projectId}/team/{uid}` and `projectData.clientId`.
- Routes then pass that narrower assignment into domain RBAC, for example:
  - setup: `src/lib/contract-admin-api-router.ts:95-96`
  - notices/variations/EoT/payment helpers: `:138`, `:163`, `:177`, `:191`, `:207`, `:221`, `:235`
  - claims: `:319-334`

Impact:
- A user may pass the router-level membership check through a supported owner/team shape, then be denied deeper because `buildProjectAssignment()` does not consume the same shared resolver/semantics.

Required fix:
- Make `buildProjectAssignment()` consume the shared membership result, or extend it to use the exact same membership/owner/admin semantics as `checkProjectMembership()`.

Merge note:
- I did not see the previous Town Planning scope blocker anymore. After the RBAC consistency fix, PR #131 is one of the cleaner candidates, but the earlier PR stack still needs rebase/split work before batch merging.
