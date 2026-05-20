# P0 Foundation Audit and Stage-Gate Kickoff

Date: 2026-05-20
Source PRD: `prdnew.md`
Scope: first P0 pass for auth/RBAC/profile/organisation/stage/audit foundation.

## Current foundation inventory

Implemented or partially implemented:

- Canonical roles exist in `src/types.ts`: `client`, `architect`, `admin`, `freelancer`, `bep`, `contractor`, `subcontractor`, `supplier`.
- `src/services/permissionService.ts` provides role normalization, treats `architect` as BEP subtype, resolves project access roles, and tests project/package/admin permissions.
- `src/services/auditService.ts` builds immutable audit events and has tests for append-only guard behaviour.
- `src/services/firmService.ts` and firm types provide organisation/member/invite foundations.
- `src/services/projectLifecycleService.ts` maps the PRD lifecycle to canonical project stages and syncs legacy job status.
- Role-aware dashboard/page routing exists in `src/App.tsx`, including subcontractor/supplier role visibility.

## P0 gaps found

- Stage transitions had forward-only rules, but did not encode the PRD’s legal, financial, professional, and close-out evidence gates as reusable primitives.
- `Project` records did not have a typed place for stage-gate evidence flags.
- The transition path needed a way to block premature stage progression when evidence such as signed appointment, escrow plan, resolved compliance findings, certified claims, or close-out records is missing.
- Further P0 work remains for server-authoritative admin role assignment, role switcher hardening, consent/KYC records, and broader API-level RBAC enforcement checks.

## Implemented in this pass

- Added PRD stage-gate primitives to `src/services/projectLifecycleService.ts`:
  - `StageGateEvidenceKey`
  - `StageGateEvidence`
  - `StageGateRequirement`
  - `StageGateEvaluation`
  - `STAGE_GATE_REQUIREMENTS`
  - `getStageGateRequirements`
  - `getMissingStageGateRequirements`
  - `evaluateStageGateTransition`
  - `assertStageGateTransitionAllowed`
- Added stage-gate evidence support to `Project` in `src/types.ts`.
- Updated `transitionStage` to enforce stage gates by default while preserving an explicit `enforceStageGates: false` escape hatch for controlled migrations/tests.
- Added unit coverage for every post-brief PRD stage gate:
  - appointment
  - coordination
  - compliance
  - tender
  - delivery
  - payments
  - closeout

## Validation

```bash
npm test -- src/services/__tests__/projectLifecycleService.test.ts
# 1 file passed, 21 tests passed

npm test -- src/services/__tests__/permissionService.test.ts src/services/__tests__/auditService.test.ts
# 2 files passed, 15 tests passed

npm test -- src/services/__tests__/projectLifecycleService.test.ts src/services/__tests__/lifecycle.integration.test.ts
# 2 files passed, 27 tests passed
```

## Next P0 tasks

1. Wire stage-gate evidence updates to real workflow completions: guided brief, technical brief, appointment/signing, escrow setup, drawing register, compliance, municipal, procurement, construction evidence, payments, and close-out.
2. Add UI visibility for blocked stage transitions, showing missing gate requirements and reasons before calling `transitionStage`.
3. Continue P0 audit for auth/bootstrap/admin role assignment and ensure privileged role changes happen through server-authoritative APIs only.
4. Add POPIA consent, terms acceptance, AI acknowledgement, and KYC evidence foundations.
