# Phase 4 — Construction Delivery Management

> **Goal:** Build the construction-phase project management tools: Gantt charts for scheduling, Site Logs for daily recording, an RFI (Request for Information) system, and progress tracking. This phase corresponds to the "Delivery" stage.

## What Exists Today

| Feature | Status |
|---|---|
| `DelegatedTask` / `JobCard` | Basic task cards with status (pending/in-progress/completed) |
| Municipal Tracker | Tracks council submissions and status |
| Task assignment | Architect assigns tasks to BEPs/freelancers |
| Construction management | ❌ Missing entirely |

## What This Phase Adds

1. **Gantt Chart Component** — interactive timeline view of project phases and milestones.
2. **Site Log System** — daily logs with weather, progress, issues, and photo attachments.
3. **RFI System** — formal request-response chain between contractor, architect, and engineers.
4. **Site Inspection Checklists** — templated inspection forms for various build phases.
5. **Construction Dashboard Tab** — unified view for the delivery stage.

---

## Detailed Tasks

### Task 4.1 — Define Construction Data Types

**File:** `src/types.ts`

```typescript
export interface GanttTask {
  id: string;
  projectId: string;
  title: string;
  startDate: string;
  endDate: string;
  progress: number;          // 0-100
  dependsOn?: string[];      // task IDs
  assignedTo?: string;       // userId
  phase: string;             // e.g. 'Foundation', 'Superstructure'
  status: 'not_started' | 'in_progress' | 'completed' | 'delayed';
  color?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SiteLog {
  id: string;
  projectId: string;
  date: string;
  weather: 'sunny' | 'cloudy' | 'rainy' | 'stormy';
  temperature?: number;
  workDescription: string;
  labourCount?: number;
  materialsUsed?: string[];
  issues?: string[];
  photos: { url: string; caption: string }[];
  createdBy: string;
  createdAt: string;
}

export type RFIStatus = 'open' | 'responded' | 'closed' | 'overdue';
export type RFIPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface RFI {
  id: string;
  projectId: string;
  number: number;            // sequential RFI number
  subject: string;
  question: string;
  attachments: { name: string; url: string }[];
  requestedBy: string;       // userId
  assignedTo: string;        // userId (architect/engineer)
  priority: RFIPriority;
  status: RFIStatus;
  response?: string;
  responseAttachments?: { name: string; url: string }[];
  respondedBy?: string;
  respondedAt?: string;
  dueDate: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SiteInspection {
  id: string;
  projectId: string;
  inspectionType: 'foundation' | 'dpc' | 'roof' | 'final' | 'custom';
  date: string;
  inspector: string;         // userId
  checklist: InspectionItem[];
  overallResult: 'pass' | 'fail' | 'conditional';
  notes?: string;
  photos: { url: string; caption: string }[];
  createdAt: string;
}

export interface InspectionItem {
  item: string;
  standard?: string;         // SANS reference
  result: 'pass' | 'fail' | 'na';
  comment?: string;
}
```

**Acceptance:**
- No lint errors.
- Types are self-contained with no external dependencies.

---

### Task 4.2 — Create Construction Service

**File:** `src/services/constructionService.ts` *(NEW)*

```
Exports:
  // Gantt
  - createGanttTask(data): Promise<string>
  - updateGanttTask(taskId, updates): Promise<void>
  - getGanttTasks(projectId): Promise<GanttTask[]>
  - subscribeToGanttTasks(projectId, cb): () => void

  // Site Logs
  - createSiteLog(data): Promise<string>
  - getSiteLogs(projectId): Promise<SiteLog[]>
  - subscribeToSiteLogs(projectId, cb): () => void

  // RFIs
  - createRFI(data): Promise<string>
  - respondToRFI(rfiId, response, responderId): Promise<void>
  - closeRFI(rfiId): Promise<void>
  - getRFIs(projectId): Promise<RFI[]>
  - subscribeToRFIs(projectId, cb): () => void

  // Inspections
  - createInspection(data): Promise<string>
  - getInspections(projectId): Promise<SiteInspection[]>

Firestore structure:
  - /projects/{projectId}/gantt_tasks/{taskId}
  - /projects/{projectId}/site_logs/{logId}
  - /projects/{projectId}/rfis/{rfiId}
  - /projects/{projectId}/inspections/{inspectionId}
```

**Acceptance:**
- Unit tests for CRUD operations pass.

---

### Task 4.3 — Create Gantt Chart Component

**File:** `src/components/GanttChart.tsx` *(NEW)*

A lightweight, CSS-based Gantt chart (no external charting library):
- Horizontal bar chart with date axis.
- Color-coded by phase.
- Progress bar within each task bar.
- Dependency arrows (optional, CSS-based).
- Add/edit task via dialog.
- Responsive: scrollable on mobile.

**Note:** Build from scratch using `div` elements and CSS grid/flexbox to avoid adding heavy charting dependencies.

**Acceptance:**
- Renders task bars proportional to duration.
- Shows progress visually.
- Add/edit dialog works.

---

### Task 4.4 — Create Site Log Component

**File:** `src/components/SiteLogManager.tsx` *(NEW)*

- Date-sorted list of site logs.
- "New Log" dialog with weather selector, work description, photo upload.
- Photo gallery per log entry.
- Uses existing Card/Badge components.
- Pagination for long histories.

**Acceptance:**
- Can create a site log with photos.
- Logs display in reverse chronological order.

---

### Task 4.5 — Create RFI System Component

**File:** `src/components/RFIManager.tsx` *(NEW)*

- Table of RFIs with status badges.
- "New RFI" dialog (subject, question, priority, assignee, due date).
- Response form for assigned user.
- Overdue highlighting.
- Notification on new RFI and response.

**Acceptance:**
- Contractor can create RFI.
- Architect/engineer can respond.
- Status updates in real-time.

---

### Task 4.6 — Create Construction Dashboard Tab

**Files:**
- `src/components/ArchitectDashboard.tsx` — "Construction" tab.
- `src/components/BEPDashboard.tsx` — "Site Logs" section for active projects.

The Construction tab contains:
- `<GanttChart />` — full width at top.
- Two-column layout below:
  - Left: Site Logs (recent 5 + "View All").
  - Right: RFIs (open/overdue + "View All").
- Inspection section at bottom.

**Acceptance:**
- Tab renders without errors.
- All sub-components load data correctly.

---

### Task 4.7 — Firestore Rules for Construction Subcollections

**File:** `firestore.rules`

Add rules for subcollections under `/projects/{projectId}/`:
- `gantt_tasks`, `site_logs`, `rfis`, `inspections`
- Read: any team member or admin.
- Create/Update: team members or admin.

**Acceptance:**
- Rules validate without errors.

---

## Verification Plan

| Check | Command / Method |
|---|---|
| TypeScript | `npm run lint` |
| Unit tests | `npm test -- --testPathPattern=constructionService` |
| Browser test | Create Gantt tasks → add site log → create RFI → respond |
| Git | Branch `phase-4/construction-delivery` |

## Dependencies

- **Phase 1** — requires `Project` and lifecycle stages.
- **Phase 2** — requires team members for assignment.
