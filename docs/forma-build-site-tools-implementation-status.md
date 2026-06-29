# Forma Build Site Tools — Implementation Status

**Spec:** `.kiro/specs/forma-build-site-tools`
**Status:** Core implementation complete (MVP). Optional property-based / integration / E2E test tasks (18–51) deferred.
**Last verified:** task 53.1 (Documentation and verification)

---

## 1. Summary

This feature extends Architex's existing Pack 9 (Site Execution & Field Control) into an
Autodesk Build / Forma-style, mobile-first field-issue product. It is an **extend/enhance**
effort layered on the existing `snagService`, `fieldEvidenceService`, `paymentBlockerService`,
and `siteAuditService` — the canonical snag state machine
(`open → allocated → ready_for_reinspection → closed / rejected`) and the payment-blocker
governance rules are reused unchanged.

All non-optional core implementation tasks are complete: the data-model/type changes, the
pure-logic service layer, the Zod schemas, the UI components, and the navigation / API wiring.
Test sub-tasks marked `*` in `tasks.md` (epics 18–51) are optional per the plan's
optional-task guidance and were deferred for the MVP.

---

## 2. What was built

### 2.1 Types (task 1) — `src/types.ts`
- `SnagItem` extended with optional `drawingPin?: DrawingPin` (text `location` remains required, 1–500 chars).
- `SiteAuditRecord` extended with `outcome: 'permitted' | 'denied'` and `actionType: FieldActionType`.
- New types: `DrawingPin`, `PhotoAnnotation`, `AnnotationShape`, `ChecklistTemplate`, `ChecklistItem`,
  `ChecklistInstance`, `ChecklistResponse`, `QueuedCapture`, `FieldReport`, `FieldActionType`.

### 2.2 Service layer (tasks 2–7, 9) — `src/services/`
| Service | Responsibility | Key pure functions |
|---------|----------------|--------------------|
| `drawingPinService.ts` | Pin validation + atomic persistence | `validateDrawingPin`, `pinsForDrawing`, `attachDrawingPin` |
| `photoAnnotationService.ts` | Structured markup + flattened render | `serializeAnnotation`, `deserializeAnnotation`, `saveAnnotation`, `loadAnnotation` |
| `checklistService.ts` | Templates, instances, responses, counts | `validateTemplate`, `validateResponse`, `computeCounts`, `serializeTemplate`, `deserializeTemplate`, `failedItemToIssue`, + I/O wrappers |
| `syncEngineService.ts` | Offline queue + idempotent reconciliation | `serializeQueue`, `deserializeQueue`, `orderForTransmission`, `enqueue`, `reconcile`, `flush` |
| `fieldReportService.ts` | Dated aggregation + export | `aggregateReport`, `exportReport`, `generateReport` |
| `fieldAccessService.ts` | Role gate + audit | `canPerform`, `assertFieldAction` (pure decision + I/O wrapper) |
| `fieldIssueService.ts` | Status/responsible-party normalization, transition guard, payment-blocking flag, FieldIssue normalizing adapter | reuses `isValidSnagTransition`, `snagBlocksPayment` |

### 2.3 Zod schemas (task 8) — `src/lib/schemas.ts`
- `drawingPinSchema`, `checklistTemplateSchema`, `checklistResponseSchema`, `queuedCaptureSchema`.

### 2.4 UI components (tasks 10–15) — `src/components/`
- `IssueDashboard.tsx` — AND-filtered list, per-status counts, drawing-pin + checklist + report entry points.
- `DrawingPinViewer.tsx` — drawing render with one marker per matching issue, click/keyboard pin placement + editing.
- `PhotoAnnotator.tsx` — photo capture, arrow/text-note markup, structured + flattened storage, blob retry.
- `ChecklistRunner.tsx` — instance execution, response recording, fail-to-issue conversion, counts.
- `ChecklistTemplateEditor.tsx` — template authoring with live validation.
- `FieldReportView.tsx` — dated report generation, display, and export.

### 2.5 Navigation wiring (task 16) — `src/navigation/architexNavigationConfig.ts`
- `IssueDashboard` mounted in Projects → `snags` (existing `SnagManager` preserved).
- Stage-gated capture entry points: Build → Toolboxes `construction_admin`; Close-out → Toolboxes `closeout`;
  other stages → read/reporting only.
- Role-aware visibility (editor roles full access; `client` read/reporting; others denied).

### 2.6 Field-tools API endpoints (task 17) — `src/lib/api-router.ts`
- `POST   /api/field-issues` — create (access-gated, lifecycle defaults).
- `PATCH  /api/field-issues/:id` — update (transition guard, payment-blocking maintenance).
- `POST   /api/photo-annotations` — save annotation.
- `POST   /api/checklist-instances` — start instance.
- `PATCH  /api/checklist-instances/:id/responses` — record response.
- `GET    /api/field-reports` — generate dated report.
- `POST   /api/field-reports/:id/export` — export report.
- `POST   /api/sync-queue/flush` — drain offline capture queue.

### 2.7 Role sheets (task 52) — `docs/toolbox-specs/`
- Updated for every role granted access under Requirement 6; `predeploy:check` gate wired (Req 8.5, 8.6).

---

## 3. Requirements traceability

| Req | Title | Satisfied by |
|-----|-------|--------------|
| 1 | Pin-on-drawing location referencing | `drawingPinService.ts`, `DrawingPinViewer.tsx`, `drawingPinSchema`, `SnagItem.drawingPin` |
| 2 | Photo capture and annotation | `photoAnnotationService.ts`, `PhotoAnnotator.tsx`, `fieldEvidenceService` (reused), Vercel Blob + retry |
| 3 | Inspection checklist and form templates | `checklistService.ts`, `ChecklistTemplateEditor.tsx`, `ChecklistRunner.tsx`, `checklistTemplate/ResponseSchema` |
| 4 | Offline field capture with sync | `syncEngineService.ts`, `queuedCaptureSchema`, `POST /api/sync-queue/flush` |
| 5 | Issue assignment and lifecycle dashboard | `fieldIssueService.ts`, `IssueDashboard.tsx`, `snagService` + `paymentBlockerService` (reused) |
| 6 | Role-aware access for site tools | `fieldAccessService.ts`, `siteAuditService` (reused, `outcome` added), navigation role gating |
| 7 | Field reporting | `fieldReportService.ts`, `FieldReportView.tsx`, `field-reports` API |
| 8 | Lifecycle and navigation integration | `architexNavigationConfig.ts`, `docs/toolbox-specs/`, `predeploy:check` |
| 9 | Quality and verification | This document + verification suite (see §5); accessibility (§4) |

---

## 4. Accessibility compliance

All new interactive UI controls are keyboard-reachable and operable and expose programmatic
accessible names (Requirements 9.4, 9.5):

- **IssueDashboard** — `role="region"` with label; filter `<select>`s carry `aria-label`s
  (status, severity, responsible party, lifecycle stage); status counts in a labelled
  `role="status"` region; issue list uses `role="list"` / `role="listitem"` with
  `aria-live="polite"`; pin/checklist/report entry points are native buttons with `aria-label`.
- **DrawingPinViewer** — pin markers are keyboard-focusable with accessible names; coordinates
  adjustable via keyboard.
- **PhotoAnnotator** — upload dropzone is a keyboard-operable `role="button"` (Enter/Space);
  annotation tools in a labelled `role="toolbar"` with `aria-pressed` + keyboard shortcuts
  (A / T / Ctrl+Z / Ctrl+Y); canvas exposes `role="img"` with descriptive label and live status
  region; errors use `role="alert"` / `aria-live="assertive"`.
- **ChecklistRunner / ChecklistTemplateEditor** — labelled form fields, keyboard-operable
  add/remove and response controls, accessible names on all interactive elements.
- **FieldReportView** — labelled sections (`aria-label`), keyboard-focusable export/evidence links
  with visible focus rings.

> Note: Full WCAG conformance validation requires manual testing with assistive technologies and
> expert accessibility review; the above documents the implemented programmatic affordances.

---

## 5. Verification suite (task 53.1)

Recorded results of the verification suite:

| Command | Exit code | Result |
|---------|-----------|--------|
| `npm run lint` (`tsc --noEmit -p tsconfig.app.json`) | **0** | Clean — zero type errors |
| `npm test` (Vitest) | 1 | **2306 passed, 1 failed** (2307 tests across 186 files) |
| `npm run build` (Vite) | **0** | Production bundle built successfully |

### The single test failure is pre-existing and unrelated to this feature

- **Test:** `src/lib/__tests__/verification-workflow.static.test.ts`
- **Nature:** a static string-matching assertion that `src/components/AdminDashboard.tsx`
  contains the literals `verificationQueue.items.map`, `{queueItem.priority} priority`, and
  `{queueItem.action}`. The current `AdminDashboard` renders the verification queue through a
  `GlassTable` (using `verificationQueue.items.find(...)`) rather than the `.items.map(...)`
  pattern the test expects, so the assertion no longer matches the source.
- **Relation to forma-build-site-tools:** none. No field-tool file (services, components,
  schemas, navigation, or API endpoints) touches `AdminDashboard.tsx` or the verification
  workflow. The lint, full type-check, and build are all green; all field-tool unit/service
  tests pass. This failure pre-dates the feature and was flagged for the AdminDashboard
  verification-queue refactor, not this work.

> Per task scope, this unrelated pre-existing failure is reported, not fixed.

---

## 6. Deferred optional tasks

Per the plan's optional-task guidance, test sub-tasks marked `*` were deferred for the MVP. These
are the property-based, integration, and E2E coverage epics:

- **Property tests (epics 18–43):** the 26 universal correctness properties (fast-check + Vitest,
  ≥100 iterations each) covering pin/text validation, annotation & template & queue round-trips,
  checklist counts, sync ordering/idempotence, status enum/transition guard, payment-blocking
  invariant, dashboard AND-filtering & per-status counts, role permission matrix, audit-per-action,
  report aggregation/export, and stage-gating.
- **Integration tests (epics 44–48):** drawing-pin persistence, checklist→issue conversion,
  sync-engine end-to-end, field access control + audit.
- **E2E tests (epics 49–51):** pin placement, photo annotation markup/export, checklist execution.

These remain tracked as unchecked `*` sub-tasks in `tasks.md` and can be implemented post-MVP
without changing the core implementation.
