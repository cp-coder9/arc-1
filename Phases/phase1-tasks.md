# Phase 1 — Tasks Checklist

> Track progress for Phase 1: Foundation & Lifecycle State Machine

- [ ] **Task 1.1** — Define `ProjectStage` enum, `Project` interface, and `ProjectTeamMember` in `src/types.ts`
  - Add `ProjectStage` type (9 stages)
  - Add `PROJECT_STAGE_ORDER` const array
  - Add `PROJECT_STAGE_LABELS` const map
  - Add `StageHistoryEntry` interface
  - Add `Project` interface
  - Add `ProjectTeamMember` interface
  - Run `npm run lint` — zero errors

- [ ] **Task 1.2** — Create `src/services/projectLifecycleService.ts`
  - Implement `canTransition(current, target): boolean`
  - Implement `transitionStage(projectId, targetStage, actorId, note?)`
  - Implement `createProject(jobId, clientId, actorId): Promise<string>`
  - Implement `getProjectByJobId(jobId): Promise<Project | null>`
  - Implement `subscribeToProject(projectId, cb): () => void`
  - Write unit test `src/services/__tests__/projectLifecycleService.test.ts`
  - Verify stage-order rules (forward-only unless admin override)

- [ ] **Task 1.3** — Create `src/components/StageProgressTracker.tsx`
  - Horizontal stepper matching existing design language
  - Props: `currentStage`, `stageHistory?`, `onAdvance?`
  - Responsive: vertical on mobile
  - Uses lucide icons (CheckCircle2, Circle, etc.)
  - No new dependencies

- [ ] **Task 1.4** — Integrate Stage Tracker into dashboards
  - `ClientDashboard.tsx`: show tracker on active project
  - `ArchitectDashboard.tsx`: show tracker on assigned projects
  - `AdminDashboard.tsx`: show tracker on job detail view
  - Add "Advance Stage" button for admin/lead architect
  - Wire to `transitionStage()` service call

- [ ] **Task 1.5** — Sync `Job.status` with `ProjectStage`
  - Map stage groups → Job.status values
  - Update `transitionStage()` to also write `Job.status`
  - Verify existing status badges still work

- [ ] **Task 1.6** — Add Firestore rules for `projects` collection
  - Read: any authenticated user
  - Create: client or admin
  - Update: client, lead architect, or admin
  - Validate with `firebase_validate_security_rules`

- [ ] **Task 1.7** — Auto-create Project on architect selection
  - Hook into `handleAcceptApplication` in `ClientDashboard.tsx`
  - Call `createProject()` after setting `selectedArchitectId`
  - Add architect as `ProjectTeamMember` with status `'active'`
  - Verify in browser: new `projects` document appears in Firestore

## Git Strategy

```
Branch: phase-1/lifecycle-foundation
Base: main
Commits: One per task (1.1, 1.2, etc.)
PR: phase-1/lifecycle-foundation → main
```
