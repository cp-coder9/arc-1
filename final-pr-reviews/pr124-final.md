## Hermes final pre-merge review — PR #124

Verdict: Changes still required before merge.

Latest head reviewed: `985138208b0ffe57b7a934eb2cb5e15cdb92c7ec`
GitHub checks: passing.

What is fixed:
- Previous navigation label collision is fixed enough for the app shell: `src/navigation/architexNavigationConfig.ts` now separates the project workspace label, and `src/App.tsx:1120-1125` no longer passes `user.uid` as a fake `projectId`.
- The project-scoped workspace now fails closed with “Select a project to open the Delivery Workspace.” instead of writing under a user id.

Remaining final blockers:

1. Project Passport writeback service is still effectively dead code / TODO-only integration.

Evidence:
- `src/services/commandCentre/passportWritebackService.ts:42-125` defines `writeScheduleHealth`, `writeFinancialHealth`, `writeRiskProfile`, and `writeMilestoneProgress`.
- The actual subsystem services still only contain TODOs:
  - `src/services/commandCentre/budgetService.ts:150` and `:257` — TODO to wire `writeFinancialHealth()`.
  - `src/services/commandCentre/milestoneService.ts:282` — TODO to wire `writeMilestoneProgress()`.
  - `src/services/commandCentre/programmeService.ts:617` — TODO to wire `writeScheduleHealth()`.
  - `src/services/commandCentre/riskRegisterService.ts:275` — TODO to wire `writeRiskProfile()`.

Required fix: either wire these writebacks into the real mutations that change schedule/budget/risk/milestones, or narrow the PR claim to “writeback adapter only, live spine writes deferred.”

2. Compliance/finance integration still reports synthetic success.

Evidence:
- `src/services/commandCentre/complianceFinanceIntegrationService.ts:144` returns `status: 'triggered'` without proving a real Compliance Hub / Finance / escrow side effect.

Required fix: fail closed / return `pending_approval` until a real downstream integration completes, or demo-gate the synthetic trigger.

Merge note:
- A local no-commit sequence merge showed PR #124 then PR #125 merges cleanly, but the sequence conflicts at PR #126. Do not start batch merging until the stacked/overlapping branches are rebased or split.
