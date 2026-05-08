# Phase 2 — Tasks Checklist

> Track progress for Phase 2: Full Design Team & Discipline Coordination

- [ ] **Task 2.1** — Extend Discipline Taxonomy in `src/types.ts`
  - Add `DisciplineInfo` interface
  - Add `DISCIPLINE_REGISTRY` const array (13 disciplines)
  - Map `requiredFor` to `JobCategory`
  - Run `npm run lint`

- [ ] **Task 2.2** — Create `src/services/teamService.ts`
  - `inviteTeamMember()` — writes to `Project.teamMembers`
  - `acceptInvitation()` — status `'invited'` → `'active'`
  - `removeTeamMember()` — status → `'removed'`
  - `getDisciplineCoverage()` — returns filled vs missing
  - `subscribeToTeam()` — real-time listener
  - Write unit test `src/services/__tests__/teamService.test.ts`

- [ ] **Task 2.3** — Create `src/components/ResponsibilityMatrix.tsx`
  - Grid: discipline × assigned member × sign-off status
  - Filtered by project's `JobCategory`
  - Uses Card, Badge, Table UI components
  - Responsive layout

- [ ] **Task 2.4** — Create `src/components/TeamBuilder.tsx`
  - Shows all required disciplines for project
  - Invite button per discipline
  - Search/select registered users
  - Pending invitation badge
  - Wire to `teamService`

- [ ] **Task 2.5** — Add "Coordination" tab to `ArchitectDashboard.tsx`
  - New `TabsContent value="coordination"`
  - Embeds `ResponsibilityMatrix` and `TeamBuilder`
  - Shows coverage summary

- [ ] **Task 2.6** — Update sidebar navigation in `App.tsx`
  - Add `Coordination` nav item for architects
  - Icon: `Users`
  - Verify click navigates correctly

## Git Strategy

```
Branch: phase-2/design-team-coordination
Base: main (after phase-1 merge)
Commits: One per task
PR: phase-2/design-team-coordination → main
```
