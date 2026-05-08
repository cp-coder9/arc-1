# Phase 4 — Tasks Checklist

> Track progress for Phase 4: Construction Delivery Management

- [ ] **Task 4.1** — Define construction types in `src/types.ts`
  - `GanttTask` interface
  - `SiteLog` interface
  - `RFI` + `RFIStatus` + `RFIPriority` types
  - `SiteInspection` + `InspectionItem` interfaces
  - Run `npm run lint`

- [ ] **Task 4.2** — Create `src/services/constructionService.ts`
  - Gantt CRUD + subscription
  - Site Log CRUD + subscription
  - RFI CRUD + respond/close
  - Inspection CRUD
  - Write unit tests

- [ ] **Task 4.3** — Create `src/components/GanttChart.tsx`
  - CSS-based horizontal bar chart
  - Date axis, phase coloring, progress bars
  - Add/edit task dialog
  - Responsive scrollable layout
  - No external charting library

- [ ] **Task 4.4** — Create `src/components/SiteLogManager.tsx`
  - Date-sorted log list
  - New log dialog (weather, description, photos)
  - Photo gallery per entry
  - Pagination

- [ ] **Task 4.5** — Create `src/components/RFIManager.tsx`
  - RFI table with status badges
  - New RFI dialog
  - Response form
  - Overdue highlighting
  - Notifications

- [ ] **Task 4.6** — Add Construction tab to dashboards
  - ArchitectDashboard: "Construction" tab
  - BEPDashboard: site logs section
  - Layout: Gantt → Site Logs + RFIs → Inspections

- [ ] **Task 4.7** — Firestore rules for construction subcollections
  - `/projects/{projectId}/gantt_tasks`
  - `/projects/{projectId}/site_logs`
  - `/projects/{projectId}/rfis`
  - `/projects/{projectId}/inspections`
  - Validate rules

## Git Strategy

```
Branch: phase-4/construction-delivery
Base: main (after phase-3 merge)
Commits: One per task
PR: phase-4/construction-delivery → main
```
