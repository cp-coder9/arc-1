# Phase 2 — Full Design Team & Discipline Coordination

> **Goal:** Expand the team model to support a full multi-discipline design team with a responsibility matrix, invitation flows, and coordination tracking.

## What Exists Today

| Feature | Status |
|---|---|
| `Discipline` type | 13 disciplines defined in `types.ts` |
| `DelegatedTask` / `JobCard` | Basic task assignment (name, role, deadline) |
| `TeamManager` component | Lists freelancers/BEPs, assigns tasks per job |
| `ProjectTeamMember` | *(Added in Phase 1)* — userId, role, discipline, status |

## What This Phase Adds

1. **Discipline taxonomy expansion** — map each discipline to SACAP-recognized professional categories.
2. **Enhanced Team Builder** — architect can invite registered users by discipline, with acceptance workflow.
3. **Responsibility Matrix** — per-project matrix mapping disciplines → responsible parties → sign-off requirements.
4. **Coordination Dashboard Tab** — a new "Coordination" tab on the Architect Dashboard showing discipline coverage and gaps.
5. **Team status tracking** — real-time view of which disciplines have been filled and which are outstanding.

---

## Detailed Tasks

### Task 2.1 — Extend Discipline Taxonomy

**File:** `src/types.ts`

Add:

```typescript
export interface DisciplineInfo {
  key: Discipline;
  label: string;
  sacapCategory: string;
  requiredFor: JobCategory[];
  icon: string;           // lucide icon name
}

export const DISCIPLINE_REGISTRY: DisciplineInfo[] = [
  { key: 'architecture', label: 'Architecture', sacapCategory: 'Professional Architect', requiredFor: ['Residential', 'Commercial', 'Industrial'], icon: 'Building2' },
  { key: 'structure', label: 'Structural Engineering', sacapCategory: 'Pr Eng (Structural)', requiredFor: ['Residential', 'Commercial', 'Industrial'], icon: 'Hammer' },
  { key: 'fire', label: 'Fire Engineering', sacapCategory: 'Fire Consultant', requiredFor: ['Commercial', 'Industrial'], icon: 'Flame' },
  { key: 'electrical', label: 'Electrical Engineering', sacapCategory: 'Pr Eng (Electrical)', requiredFor: ['Commercial', 'Industrial'], icon: 'Zap' },
  { key: 'mechanical', label: 'Mechanical Engineering', sacapCategory: 'Pr Eng (Mechanical)', requiredFor: ['Commercial', 'Industrial'], icon: 'Cog' },
  { key: 'energy', label: 'Energy Compliance', sacapCategory: 'Energy Consultant', requiredFor: ['Residential', 'Commercial'], icon: 'Sun' },
  { key: 'drainage', label: 'Civil / Drainage', sacapCategory: 'Pr Eng (Civil)', requiredFor: ['Residential', 'Commercial'], icon: 'Droplets' },
  { key: 'accessibility', label: 'Accessibility', sacapCategory: 'Accessibility Consultant', requiredFor: ['Commercial'], icon: 'Accessibility' },
  { key: 'environmental', label: 'Environmental', sacapCategory: 'Environmental Consultant', requiredFor: ['Industrial'], icon: 'TreePine' },
  { key: 'planning', label: 'Town Planning', sacapCategory: 'Town Planner', requiredFor: ['Residential', 'Commercial'], icon: 'Map' },
  { key: 'nhbrc', label: 'NHBRC Enrolment', sacapCategory: 'NHBRC Registered Builder', requiredFor: ['Residential'], icon: 'ShieldCheck' },
  { key: 'documentation', label: 'Documentation', sacapCategory: 'Draughtsperson', requiredFor: ['Residential', 'Commercial', 'Industrial'], icon: 'FileText' },
  { key: 'coordination', label: 'Professional Coordination', sacapCategory: 'Lead Consultant', requiredFor: ['Commercial', 'Industrial'], icon: 'Users' },
];
```

**Acceptance:**
- No lint errors.
- Existing `Discipline` type unchanged (new registry is additive).

---

### Task 2.2 — Create Team Invitation Service

**File:** `src/services/teamService.ts` *(NEW)*

```
Exports:
  - inviteTeamMember(projectId, userId, discipline, invitedBy): Promise<void>
  - acceptInvitation(projectId, userId): Promise<void>
  - removeTeamMember(projectId, userId, removedBy): Promise<void>
  - getTeamForProject(projectId): Promise<ProjectTeamMember[]>
  - subscribeToTeam(projectId, cb): () => void
  - getDisciplineCoverage(project): { filled: Discipline[], missing: Discipline[] }
```

- Invitation creates a `ProjectTeamMember` with status `'invited'`.
- Acceptance updates status to `'active'`.
- Sends in-app notification via `notificationService`.

**Acceptance:**
- Unit test passes.
- Invitation → acceptance flow works in Firestore.

---

### Task 2.3 — Create Responsibility Matrix Component

**File:** `src/components/ResponsibilityMatrix.tsx` *(NEW)*

A table/grid component that:
- Lists all disciplines relevant to the project's `JobCategory`.
- Shows the assigned team member (or "Unassigned" badge).
- Shows sign-off status per discipline.
- Lead architect can assign/reassign from a dropdown.
- Uses the existing card/badge/table UI components.

**Acceptance:**
- Renders correctly for a `Residential` project (should show ~6 disciplines).
- Renders correctly for a `Commercial` project (should show ~10 disciplines).
- Visual passes manual inspection.

---

### Task 2.4 — Build Team Builder UI

**File:** `src/components/TeamBuilder.tsx` *(NEW)*

Replaces/enhances the existing `TeamManager` in `ArchitectDashboard`:
- Shows all disciplines for the project category.
- For each discipline, shows assigned member or an "Invite" button.
- Invite flow: search registered users by role/discipline, send invitation.
- Pending invitations shown with "Pending" badge.
- Uses the `teamService` for all operations.

**Acceptance:**
- Architect can invite a user to a specific discipline.
- Invited user sees notification.
- Acceptance updates team roster in real-time.

---

### Task 2.5 — Add "Coordination" Tab to Architect Dashboard

**File:** `src/components/ArchitectDashboard.tsx`

Add a new `TabsContent value="coordination"`:
- Shows `<ResponsibilityMatrix />` for the active project.
- Shows `<TeamBuilder />` below.
- Shows discipline coverage summary (filled vs. missing).

**Acceptance:**
- Tab appears between "Team & Match" and "Fee Estimator".
- Tab renders without errors.
- Existing tabs unaffected.

---

### Task 2.6 — Update Sidebar Navigation for Coordination

**File:** `src/App.tsx`

Add `Coordination` nav item for the architect role, with icon `Users`.

**Acceptance:**
- Sidebar shows "Coordination" for architects.
- Clicking navigates to the coordination tab.

---

## Verification Plan

| Check | Command / Method |
|---|---|
| TypeScript | `npm run lint` |
| Unit tests | `npm test -- --testPathPattern=teamService` |
| Browser test | Login as architect → verify Coordination tab → invite a user |
| Git | Branch `phase-2/design-team-coordination` |

## Dependencies

- **Phase 1** must be complete (requires `Project`, `ProjectTeamMember` types).
