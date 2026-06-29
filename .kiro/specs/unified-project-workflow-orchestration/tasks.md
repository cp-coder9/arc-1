# Implementation Plan: Unified Project Workflow Orchestration

## Overview

This plan builds the additive orchestration tier in `src/services/orchestration/` on top of the existing Architex packs. Work proceeds bottom-up: shared types and the central governance gate first, then the reconciled source-of-truth read/write service, then the domain orchestrators (handoffs, programme, Action Centre, phase progression, AI guidance, tool reconciliation), and finally UI wiring and end-to-end integration. Every service delegates domain logic to existing pack services (`lifecycleEngine`, `projectPassportService`, `riskEngine`, `inboxEventAdapter`, `agentRecommendationService`, `geminiService`, `auditTrailService`, record adapters) and is type-safe TypeScript verified with `npm run lint`, `npm test`, and `npm run build`.

Property-based tests use **fast-check** + **Vitest** (minimum 100 iterations per property), each tagged `// Feature: unified-project-workflow-orchestration, Property {n}: {text}`. Test sub-tasks marked with `*` are optional and may be skipped for a faster MVP, but core implementation tasks must be completed.

## Tasks

- [x] 1. Set up orchestration module structure and shared types
  - [x] 1.1 Create orchestration types and governance constants
    - Create `src/services/orchestration/orchestrationTypes.ts` defining `WriteResult<T>` discriminated union, `ActionType`, `AuthorizationContext`, `AuthorizationResult`, `VersionedRecord`, `ProjectStateView`, `DerivedFieldSource`, `CrossRoleHandoff`, `ProgrammeTask`, `UnifiedProgramme`, `EventPriority`, `ActionItem`, `GuidanceRequest`, `GuidanceResult`, `ToolAssignment`, `ReconciliationResult`, and `AdvancementResult`
    - Define `QUALIFIED_ROLES_BY_GATE: Record<HumanGate, ArchitexRole[]>` (AI identity never qualified) and the single `Priority` → `EventPriority` mapping constant
    - Re-export reused types from `services/lifecycleTypes.ts`; add no duplicate state types
    - _Requirements: 1.4, 8.5_

  - [x] 1.2 Set up fast-check generators and PBT harness
    - Create `src/services/orchestration/__tests__/generators.ts` with `arbProjectRecord` (incl. empty and ≥2 linked refs), `arbProgramme` (acyclic + adversarial cyclic/dangling), `arbTenantPool` (≥2 tenants), `arbEventSet`, and `arbAuthRequest`
    - Configure shared `fc.assert(..., { numRuns: 100 })` helper
    - _Requirements: 10.1, 10.2_

- [x] 2. Implement access control and governance gate
  - [x] 2.1 Implement accessControlService
    - Create `src/services/orchestration/accessControlService.ts` with `authorize(ctx, action, target)` returning `permitted`/`denied` within the 2 s budget
    - Enforce tenant match, role entitlement, and `QUALIFIED_ROLES_BY_GATE` for sensitive gates; deny with reason naming action type, role, and required gate, disclosing no field values
    - Write every decision (permitted and denied) through `auditTrailService`
    - _Requirements: 1.7, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x] 2.2 Write property test for authorization decisions
    - **Property 30: Authorization permits the entitled and denies the rest**
    - **Validates: Requirements 8.1, 8.3, 8.4, 8.5**

  - [x] 2.3 Write property test for full action audit
    - **Property 31: Every orchestration action is fully audited**
    - **Validates: Requirements 8.6**

- [x] 3. Implement reconciled source-of-truth service
  - [x] 3.1 Implement projectStateService
    - Create `src/services/orchestration/projectStateService.ts` with `loadProjectState` (authorize read → load tenant-scoped records → `projectPassportService.buildProjectPassport()` → attach `DerivedFieldSource[]`), `writeRecord` (authorize → optimistic CAS on `audit.revision` → persist actor/role/ISO-8601 UTC timestamp → recompute derived fields → audit), and `resolveActive` (superseded → current with prior id)
    - Implement save-failed/timeout (10 s) and propagation-failure (>5 s, mark `stale`, name source record) handling, retaining submitted input on failure
    - Implement conflict-by-later-timestamp reconciliation retaining the rejected commit in the audit trail
    - Implement `ProjectRecord` serialize/deserialize preserving fields, status, and linked-reference set
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 10.2_

  - [x] 3.2 Write property test for single derived source of truth
    - **Property 1: Source of truth is single and derived**
    - **Validates: Requirements 1.1, 1.4, 2.1, 2.6**

  - [x] 3.3 Write property test for write provenance and read-back
    - **Property 2: Writes capture provenance and are readable afterward**
    - **Validates: Requirements 1.2, 1.3**

  - [x]* 3.4 Write property test for failed-write preservation
    - **Property 3: Failed writes preserve prior state and retain input**
    - **Validates: Requirements 1.5**

  - [x]* 3.5 Write property test for optimistic concurrency
    - **Property 4: Optimistic concurrency rejects stale writes**
    - **Validates: Requirements 1.6**

  - [x]* 3.6 Write property test for conflicting-commit reconciliation
    - **Property 5: Conflicting commits resolve by latest timestamp with audit retention**
    - **Validates: Requirements 2.7**

  - [x]* 3.7 Write property test for derived-value provenance display
    - **Property 7: Derived-value provenance is displayed**
    - **Validates: Requirements 2.2**

  - [x]* 3.8 Write property test for propagation-failure degradation
    - **Property 8: Propagation failure degrades safely**
    - **Validates: Requirements 2.3**

  - [x]* 3.9 Write property test for supersession resolution
    - **Property 9: Supersession presents only the current revision**
    - **Validates: Requirements 2.4, 2.5**

  - [x]* 3.10 Write property test for record serialization round-trip
    - **Property 34: Project record serialization round-trip**
    - **Validates: Requirements 10.2**

  - [x]* 3.11 Write unit tests for source-of-truth reconciliation (positive + negative)
    - Cover at least one positive reconciliation and one negative (conflict/save-failed) case
    - _Requirements: 10.1_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement governed cross-role handoffs
  - [x] 5.1 Implement handoffService
    - Create `src/services/orchestration/handoffService.ts` with `initiateHandoff` (validate reason 1..1000 chars + receiving role appointed → record obligation with originating/receiving role, related record type, reason, response-by +5 business days → emit one `approval_required` `WorkflowEvent` via `inboxEventAdapter`), `resolveHandoff` (set `resolved`, record actor/role/timestamp via `auditTrailService`), and `checkOverdue` (one `task_overdue` event per overdue open handoff)
    - Defer gated resolution (professional_certification/signature/payment_release) to `accessControlService`; reject invalid input with cause-specific errors creating no obligation
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x]* 5.2 Write property test for valid handoff recording and notification
    - **Property 10: Valid handoffs record complete obligations and notify the receiver**
    - **Validates: Requirements 3.1, 3.3, 3.5**

  - [x]* 5.3 Write property test for invalid handoff rejection
    - **Property 11: Invalid handoffs are rejected without side effects**
    - **Validates: Requirements 3.2, 3.7**

  - [ ]* 5.4 Write property test for handoff resolution and overdue detection
    - **Property 12: Handoff resolution and overdue detection**
    - **Validates: Requirements 3.4, 3.6**

  - [x] 5.5 Write property test for gated handoff authorization
    - **Property 13: Gated handoff steps require the qualified receiving role**
    - **Validates: Requirements 3.8, 6.6**

  - [ ]* 5.6 Write unit tests for handoff obligation lifecycle (positive + negative)
    - Cover at least one valid lifecycle and one rejection case
    - _Requirements: 10.1_

- [x] 6. Implement unified programme and timeline
  - [x] 6.1 Implement programmeService
    - Create `src/services/orchestration/programmeService.ts` with `upsertTask` (validate finish ≥ start, ≤50 existing dependency refs, DFS cycle rejection retaining prior state), `recomputeSchedule` (dependent date roll-up), `overdueEvents` (one `task_overdue` per overdue incomplete task assigned to responsible role), and `visibleTasks` (authorised subset identifying responsible role)
    - Enforce one `UnifiedProgramme` per project and the ≤10,000-task bound
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [ ]* 6.2 Write property test for task validation on upsert
    - **Property 14: Programme tasks are validated on upsert**
    - **Validates: Requirements 4.5, 4.6, 4.7**

  - [ ]* 6.3 Write property test for valid task persistence
    - **Property 15: Valid programme tasks persist their fields**
    - **Validates: Requirements 4.2**

  - [ ]* 6.4 Write property test for authorised programme visibility
    - **Property 16: Authorised programme visibility identifies responsible role**
    - **Validates: Requirements 4.3**

  - [ ]* 6.5 Write property test for dependency schedule roll-up
    - **Property 17: Dependency schedule roll-up**
    - **Validates: Requirements 4.4**

  - [ ]* 6.6 Write property test for overdue-task events
    - **Property 18: Overdue programme tasks each raise one event**
    - **Validates: Requirements 4.8**

  - [ ]* 6.7 Write unit tests for programme bounds and cycle rejection
    - Cover the 10,000-task / one-programme-per-project bounds and at least one dependency-cycle rejection
    - _Requirements: 4.1, 10.1_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Implement Action Centre aggregation
  - [x] 8.1 Implement actionCentreService
    - Create `src/services/orchestration/actionCentreService.ts` with `detectConditions` (missing record/approval/blocker/payment/overdue/risk → prioritised `WorkflowEvent`s; each missing required record flagged as blocking phase advancement), `buildActionCentre` (aggregate across projects; total ordering by priority → due date → creation timestamp; expose route or no-direct-route marker, never omit), and `resolveSettled` (drop resolved within 60 s; explicit empty state)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [ ] 8.2 Write property test for detected conditions becoming events
    - **Property 19: Detected conditions become prioritised events**
    - **Validates: Requirements 5.1, 5.6**

  - [ ]* 8.3 Write property test for Action Centre total ordering
    - **Property 20: Action Centre total ordering**
    - **Validates: Requirements 5.2, 5.3**

  - [ ]* 8.4 Write property test for route / no-route markers
    - **Property 21: Action items expose route or explicit no-route marker**
    - **Validates: Requirements 5.4, 5.7**

  - [ ]* 8.5 Write property test for resolved-condition removal
    - **Property 22: Resolved conditions remove their events**
    - **Validates: Requirements 5.5**

  - [ ]* 8.6 Write unit test for empty Action Centre state
    - Assert the explicit "no outstanding actions" indication when no events remain
    - _Requirements: 5.8_

- [x] 9. Implement lifecycle-phase progression
  - [x] 9.1 Implement phaseProgressionService
    - Create `src/services/orchestration/phaseProgressionService.ts` with `evaluateAdvancement` (eligibility equals `lifecycleEngine.evaluateLifecycle()`; eligible only when every required record exists and is `approved`) and `advancePhase` (blocked → return unmet records, retain phase, no event; final phase → indication; eligible → one idempotent `project_phase_changed` event per `${projectId}:${from}->${to}` assigned to new-phase roles + audit entry with from/to/actor/timestamp)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [ ]* 9.2 Write property test for lifecycle evaluation parity
    - **Property 27: Lifecycle evaluation matches the existing engine**
    - **Validates: Requirements 7.1**

  - [ ]* 9.3 Write property test for advancement gating
    - **Property 28: Advancement gating**
    - **Validates: Requirements 7.2, 7.3**

  - [ ]* 9.4 Write property test for phase-change event and audit
    - **Property 29: Phase advancement emits one event and an audit entry**
    - **Validates: Requirements 7.5, 7.6, 7.7**

  - [ ]* 9.5 Write unit test for final-phase advancement
    - Assert advancement at the final phase is denied with a no-subsequent-phase indication
    - _Requirements: 7.4_

- [x] 10. Implement embedded AI guidance
  - [x] 10.1 Implement aiGuidanceService
    - Create `src/services/orchestration/aiGuidanceService.ts` with `generateGuidance(req)` delegating to `agentRecommendationService` + `geminiService` (10 s timeout → `status: 'unavailable'`; no applicable recs → `status: 'none'`); cap at 10 recommendations ordered by descending priority, each with title, rationale, priority {High|Medium|Low}, action label, and route
    - Flag gated recommendations `requiresHumanApproval` (advisory only, never autonomous gate execution); restrict inputs/outputs to in-tenant, in-project records; audit every produced recommendation; provide step-level guidance for tool/workflow surfaces
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11_

  - [ ]* 10.2 Write property test for recommendation shape and cap
    - **Property 23: Recommendations are capped, ordered, and well-formed**
    - **Validates: Requirements 6.1, 6.2, 6.3**

  - [ ]* 10.3 Write property test for advisory gated recommendations
    - **Property 24: Gated recommendations are advisory**
    - **Validates: Requirements 6.5**

  - [ ]* 10.4 Write property test for recommendation auditing
    - **Property 25: Every recommendation is audited**
    - **Validates: Requirements 6.7**

  - [ ]* 10.5 Write property test for AI failure and empty states
    - **Property 26: AI failure and empty states never block the surface**
    - **Validates: Requirements 6.10, 6.11**

  - [ ]* 10.6 Write property test for tenant isolation across reads and AI scope
    - **Property 6: Tenant isolation across reads and AI scope**
    - **Validates: Requirements 1.7, 6.8, 6.9, 8.2, 8.7**

  - [ ]* 10.7 Write unit tests for step-level guidance and negative cross-tenant guidance
    - Assert step-level guidance presence (R6.4) and that guidance requested for one tenant returns no records owned by a different tenant
    - _Requirements: 6.4, 10.6_

- [x] 11. Implement tool reconciliation
  - [x] 11.1 Implement toolReconciliationService
    - Create `src/services/orchestration/toolReconciliationService.ts` with `reconcileToolRun` (adapter exists → one `ProjectRecord` with phase/moduleKey/recordType from the tool's registered domain; no adapter or failure → retain output as unmapped linked artefact, never discard, error names tool run) and `linkSharedRecord` (resolve via `linkedRecordIds` to a single shared instance, no duplicate)
    - Feed Documents/Finance/Site/Analytics records matching required/optional types into passport evaluation
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [ ]* 11.2 Write property test for tool-run mapping and retention
    - **Property 32: Tool runs map to records or are retained as unmapped artefacts**
    - **Validates: Requirements 9.1, 9.2, 9.4, 9.6**

  - [ ]* 11.3 Write property test for module records feeding the passport
    - **Property 33: Module records feed the passport and resolve without duplication**
    - **Validates: Requirements 9.3, 9.5**

- [x] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Build orchestration UI surfaces
  - [ ] 13.1 Implement Action Centre, Unified Programme, and AI Guide widget surfaces
    - Build React 19 components for the Action Centre list, Unified Programme view, and the embedded AI Guide widget consuming `actionCentreService`, `programmeService`, and `aiGuidanceService`
    - Ensure every interactive control is keyboard-reachable in tab order, shows a visible focus indicator, and exposes a non-empty programmatic accessible name
    - _Requirements: 5.2, 5.8, 4.3, 6.1, 6.10, 6.11, 10.3_

  - [ ]* 13.2 Write accessibility tests for new UI surfaces
    - Use axe + keyboard-navigation checks asserting focus order, visible focus, and accessible names
    - _Requirements: 10.3_

  - [ ]* 13.3 Write Firestore tenant-rule integration tests
    - Assert tenant-scoped security rules deny cross-tenant access (defence-in-depth alongside `accessControlService`)
    - _Requirements: 8.7_

- [ ] 14. Integration and wiring
  - [ ] 14.1 Wire orchestration services into role dashboards and navigation
    - Connect `projectStateService` reads/writes, Action Centre, Unified Programme, and AI Guide into the role dashboards and routes so all 17 roles share one project source of truth
    - _Requirements: 1.1, 1.3, 2.6, 5.4_

  - [ ]* 14.2 Write integration tests for end-to-end orchestration flows
    - Cover read → write → reconcile → derived-update across dashboards, handoff → Action Centre event, and phase advancement → event flows using mocked Firestore/AI
    - _Requirements: 1.3, 2.6, 3.3, 7.5_

- [ ] 15. Final checkpoint - Ensure verification passes
  - Ensure `npm run lint`, `npm test`, and `npm run build` each complete with a zero exit code; ask the user if questions arise.
  - _Requirements: 10.4, 10.5_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; core implementation tasks must be completed.
- All new code is additive under `src/services/orchestration/` and delegates domain logic to existing packs — no existing pack logic is replaced.
- Each task references specific granular requirements for traceability; property tasks additionally cite their design property number.
- Property-based tests use fast-check + Vitest at ≥100 iterations and are tagged with their design property reference.
- Checkpoints ensure incremental validation; the final checkpoint enforces the lint/test/build verification gate (R10.4, R10.5).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.1", "5.1", "6.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10", "3.11", "5.2", "5.3", "5.4", "5.5", "5.6", "6.2", "6.3", "6.4", "6.5", "6.6", "6.7", "8.1", "9.1", "10.1", "11.1"] },
    { "id": 4, "tasks": ["8.2", "8.3", "8.4", "8.5", "8.6", "9.2", "9.3", "9.4", "9.5", "10.2", "10.3", "10.4", "10.5", "10.6", "10.7", "11.2", "11.3"] },
    { "id": 5, "tasks": ["13.1"] },
    { "id": 6, "tasks": ["14.1"] },
    { "id": 7, "tasks": ["13.2", "13.3", "14.2"] }
  ]
}
```
