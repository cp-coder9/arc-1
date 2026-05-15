# Phase 3 Report: Project Command Centre Projection

Date: 2026-05-15
Branch: `phase-2-verification-workflows`
Scope source: `FULL_SCOPE_PHASED_IMPLEMENTATION_PLAN.md` Phase 3

## Implemented

### Permission-gated command centre API
- Added `GET /api/projects/:projectId/command-centre`.
- Reuses existing project coordination authorization so only admins, the lead BEP, active project team members, and project clients can view the projection.
- Non-admin BEP access continues to require active SACAP/BEP verification through the existing coordination context.

### Persisted project command view
- Builds and persists `project_command_views/{projectId}_{viewerUserId}` on each read.
- Projection includes:
  - project code and current stage
  - viewer project role
  - stage history
  - active team summary and members
  - task totals, open count, and overdue count
  - approval totals and pending count
  - document totals and latest revision timestamp
  - message thread count and viewer unread count
  - AI issue totals and unresolved count

### Audit
- Emits `project.command_centre_viewed` audit events with viewer role and panel counts.

## Collections created/changed

- `project_command_views`
  - `projectId`
  - `projectCode`
  - `viewer`
  - `currentStage`
  - `stageHistory`
  - `team`
  - `panels`
  - `generatedAt`
- Reads existing project subcollections:
  - `projects/{projectId}/tasks`
  - `projects/{projectId}/approvals`
  - `projects/{projectId}/documents`
  - `projects/{projectId}/message_threads`
  - `projects/{projectId}/ai_issues`

## Tests added

- Added API coverage that verifies:
  - intruders are denied access
  - verified lead BEP can view command centre
  - the response aggregates tasks, approvals, documents, messages, and AI issues
  - the projection is persisted in `project_command_views`
  - an audit event is written

## Validation

- `npx vitest run src/lib/__tests__/api-router.security.test.ts`
  - 45 tests passed.

## Known limitations and follow-ups

- This slice provides the first command-centre aggregate/read model. Dedicated write APIs for document register, approval engine, task board, transmittals, and responsibility matrix remain future Phase 3 slices.
- Firestore rules/index updates for `project_command_views` should be added in a dedicated rules pass once all Phase 3 collections are finalized.
- Concurrent edits by another agent added resource centre/checklist routes in the same files during this work; those changes were not authored as part of this slice.
