# Phase 1 — Foundation & Lifecycle State Machine

> **Goal:** Establish the 9-stage project lifecycle data model, state-transition engine, and Stage Progress Tracker UI. This phase lays the groundwork every subsequent phase depends on.

## What Exists Today

| Feature | Status |
|---|---|
| `Job.status` | `'open' \| 'in-progress' \| 'completed' \| 'cancelled'` — flat, no stages |
| `JobStatusHistory` | Tracks `status` changes, but only the 4 statuses above |
| `Escrow` / `Payment` | Basic milestone model (`initial`, `draft`, `final`) |
| Dashboard tabs | Hardcoded per role in `App.tsx` |
| `types.ts` | ~646 lines; no `ProjectStage`, no `Project` entity |

## What This Phase Adds

1. **`ProjectStage` enum** — 9 stages from *Intake* → *Close-out*.
2. **`Project` interface** — wraps a `Job` with lifecycle tracking, stage metadata, and team roster.
3. **`StageTransition` engine** — a pure-function service that validates allowed transitions and logs history.
4. **Stage Progress Tracker UI** — a horizontal stepper component visible on all role dashboards.
5. **Sidebar / tab awareness** — nav items become stage-aware (greyed-out tabs for stages not yet reached).

---

## Detailed Tasks

### Task 1.1 — Define `ProjectStage` and `Project` type

**File:** `src/types.ts`

Add:

```typescript
export type ProjectStage =
  | 'intake'
  | 'scoping'
  | 'appointment'
  | 'coordination'
  | 'compliance'
  | 'tender'
  | 'delivery'
  | 'payments'
  | 'closeout';

export const PROJECT_STAGE_ORDER: ProjectStage[] = [
  'intake', 'scoping', 'appointment', 'coordination',
  'compliance', 'tender', 'delivery', 'payments', 'closeout'
];

export const PROJECT_STAGE_LABELS: Record<ProjectStage, string> = {
  intake: 'Intake',
  scoping: 'Scoping & Briefing',
  appointment: 'Appointment',
  coordination: 'Design Coordination',
  compliance: 'Compliance Review',
  tender: 'Tender & Procurement',
  delivery: 'Construction Delivery',
  payments: 'Payments & Escrow',
  closeout: 'Close-out',
};

export interface StageHistoryEntry {
  stage: ProjectStage;
  enteredAt: string;
  exitedAt?: string;
  actorId: string;
  note?: string;
}

export interface Project {
  id: string;
  jobId: string;                          // FK → jobs collection
  clientId: string;
  leadArchitectId?: string;
  currentStage: ProjectStage;
  stageHistory: StageHistoryEntry[];
  teamMembers: ProjectTeamMember[];
  createdAt: string;
  updatedAt?: string;
}

export interface ProjectTeamMember {
  userId: string;
  role: UserRole | string;               // e.g. 'structural_engineer'
  discipline?: Discipline;
  joinedAt: string;
  status: 'invited' | 'active' | 'removed';
}
```

**Acceptance:**
- No TypeScript errors when running `npm run lint`.
- All existing types remain unchanged.

---

### Task 1.2 — Create Stage-Transition Service

**File:** `src/services/projectLifecycleService.ts` *(NEW)*

```
Purpose: Pure-function validator + Firestore writer for stage transitions.

Exports:
  - canTransition(current: ProjectStage, target: ProjectStage): boolean
  - transitionStage(projectId, targetStage, actorId, note?): Promise<void>
  - createProject(jobId, clientId, actorId): Promise<string>  // returns project ID
  - getProjectByJobId(jobId): Promise<Project | null>
  - subscribeToProject(projectId, cb): () => void

Rules:
  1. Transitions must follow PROJECT_STAGE_ORDER (forward only, one step).
  2. Admin may override to skip ahead.
  3. Every transition writes a StageHistoryEntry.
  4. A Firestore `projects` collection stores the data.
```

**Acceptance:**
- Unit test file `src/services/__tests__/projectLifecycleService.test.ts` passes.
- `canTransition('intake', 'scoping') === true`
- `canTransition('intake', 'compliance') === false`

---

### Task 1.3 — Create Stage Progress Tracker Component

**File:** `src/components/StageProgressTracker.tsx` *(NEW)*

A horizontal stepper bar that:
- Renders all 9 stage labels.
- Highlights the current stage with the primary color.
- Marks completed stages with a check icon + muted style.
- Greyed-out stages ahead of the current stage.
- Uses the existing design language (rounded corners, `font-heading`, `tracking-widest`, etc.).
- Is responsive: collapses to a vertical list on mobile.
- Accepts `currentStage: ProjectStage` as a prop.

**Acceptance:**
- Renders correctly inside any dashboard layout.
- Visual passes manual inspection in browser.
- No new Tailwind config changes needed.

---

### Task 1.4 — Integrate Stage Tracker into Dashboards

**Files:**
- `src/components/ClientDashboard.tsx`
- `src/components/ArchitectDashboard.tsx`
- `src/components/AdminDashboard.tsx`

For each dashboard, at the top of any active project view:
1. Fetch/subscribe to the `Project` associated with the current job.
2. Render `<StageProgressTracker currentStage={project.currentStage} />`.
3. Show an "Advance Stage" button visible only to **admin** and **lead architect** (with confirmation dialog).

**Acceptance:**
- Stage tracker is visible when viewing an active project.
- Clicking "Advance Stage" calls `transitionStage()` and the UI updates in real-time.
- No changes to existing tab structure.

---

### Task 1.5 — Update `Job` Status to Sync with `Project` Stage

**File:** `src/types.ts`, `src/services/projectLifecycleService.ts`

Map `ProjectStage` → `Job.status`:

| Stage Group | `Job.status` |
|---|---|
| `intake`, `scoping` | `'open'` |
| `appointment` → `delivery` | `'in-progress'` |
| `payments`, `closeout` | `'completed'` |
| *(manual cancel)* | `'cancelled'` |

On every stage transition, the service also updates the parent `Job.status` and appends to `Job.statusHistory`.

**Acceptance:**
- Existing `Job.status` queries still work.
- No breaking change to `ClientDashboard` or `ArchitectDashboard` status badges.

---

### Task 1.6 — Firestore Rules for `projects` Collection

**File:** `firestore.rules`

Add rules:
```
match /projects/{projectId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null && request.auth.uid == request.resource.data.clientId;
  allow update: if request.auth != null && (
    request.auth.uid == resource.data.clientId ||
    request.auth.uid == resource.data.leadArchitectId ||
    isAdmin()
  );
}
```

**Acceptance:**
- `npm run lint` passes.
- Firestore rules validate with `firebase_validate_security_rules`.

---

### Task 1.7 — Auto-Create Project on Architect Selection

**File:** `src/components/ClientDashboard.tsx`

When a client selects an architect for a job (existing `handleAcceptApplication` flow):
1. Call `createProject(jobId, clientId, clientId)` from the lifecycle service.
2. The project starts at `'intake'` stage.
3. Add the selected architect as a `ProjectTeamMember`.

**Acceptance:**
- After accepting an architect, a `projects` document exists in Firestore.
- The Stage Progress Tracker shows `'intake'` as active.

---

## Verification Plan

| Check | Command / Method |
|---|---|
| TypeScript compilation | `npm run lint` |
| Unit tests | `npm test -- --testPathPattern=projectLifecycleService` |
| Manual browser test | Navigate to Client Dashboard → accept architect → verify stage tracker renders |
| Firestore rules | `firebase_validate_security_rules` |
| Git | New branch `phase-1/lifecycle-foundation` |

---

## Dependencies

- None — this is the foundation phase.

## Risks

| Risk | Mitigation |
|---|---|
| Existing `Job.status` queries break | We sync `Job.status` from `Project.currentStage`, so all existing code keeps working |
| Large `types.ts` file | Keep additions at end of file, no refactoring of existing types |
