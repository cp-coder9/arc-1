## Hermes final pre-merge review — PR #130

Verdict: Changes still required before merge.

Latest head reviewed: `1b26d2b4729d3f93dc0340ef228ad93678f5049e`
GitHub checks: passing.

What is fixed:
- CalcHub claim has been narrowed to 53 calculators.
- The Project Passport / SpecForge / Audit integration language is mostly marked local-preview / deferred.
- Marketplace implementation files were removed from the CalcHub branch.

Remaining final blockers:

1. This CalcHub PR now deletes existing SpecForge files from `main`.

Evidence from `git diff --name-status origin/main...origin/pr/130`:
- Deleted `src/components/specforge/SpecForgeWorkspace.tsx`.
- Deleted `src/services/specforge/specforgeRepository.ts`.
- Deleted `src/services/specforge/specforgeService.ts`.
- Deleted `src/services/specforge/firestoreSpecForgeRepository.ts`.
- Deleted `src/services/specforge/__tests__/specforgeService.test.ts`.
- Deleted the `specforge-pack/**` artifacts.

Required fix: restore all unrelated SpecForge files in PR #130. A CalcHub PR must not remove the SpecForge work that later PRs rely on.

2. This CalcHub PR still adds unrelated Town Planning UI/test files.

Evidence from `git diff --name-status origin/main...origin/pr/130`:
- Added `src/features/town-planning/components/TownPlanningDashboard.tsx`.
- Added `src/features/town-planning/components/ApplicationWizard.tsx`.
- Added `src/features/town-planning/components/ConditionsPanel.tsx`.
- Added `src/features/town-planning/__tests__/components.test.tsx`.
- Added `src/features/town-planning/__tests__/e2e-workflows.test.ts`.
- Added `.kiro/specs/town-planning-workflow/tasks.md`.

Required fix: remove Town Planning from PR #130 and keep it in PR #132 only.

Merge note:
- Do not merge PR #130 before restoring these unrelated deletions/additions. It is currently a scope-regression PR, despite green CI.
