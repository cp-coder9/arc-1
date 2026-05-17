# Professional Dashboard Tool Plan

Start: 2026-05-17 01:27 UTC

## Scope
Continue within the autonomous dashboard window by adding one production-safe professional tool slice after the Built Environment OS visual redesign.

## Research inputs
- `BACKEND_HTML_OUTSTANDING_ITEMS.md` section 7.8 identifies Resource Centre / Drawing Checklists as an outstanding BEP/design-team tool.
- Online construction/project-management research highlighted recurring professional needs: document control, drawing registers, transmittals, RFIs, submittals, punch lists/snags, daily logs, cost/progress controls, and accountable team coordination.
- Architectural practice research highlighted drawing transmittals/registers, responsibility matrices, discipline coordination, and municipal/SANS submission readiness as high-value tools.
- Current `firestore.rules` already permits project-scoped `projects/{projectId}/drawing_checklists` reads for participants and writes for project managers, making this safer than adding unsupported collections.
- Swarm guidance rejected unsafe AI/provider calls and payment/signature automation. It also identified transmittals as useful but currently blocked for browser reads because rules do not expose `projects/{projectId}/transmittals`.

## Chosen slice
Implement a **Project Drawing Checklist Tracker** inside the existing `Design & Compliance` professional dashboard page.

## Why this slice
- It directly matches the backend.html outstanding requirement: municipal and discipline-specific drawing checklist tracker.
- It uses an existing allowed Firestore subcollection and honest empty states, not mock/sample data.
- It strengthens professional dashboards without changing route IDs, options, payment flows, contract signing, or AI provider behavior.
- It complements the existing responsibility matrix, team builder, AI drawing checker, and SANS compliance pages.

## Implementation plan
1. Add a typed drawing checklist service:
   - subscribe to `projects/{projectId}/drawing_checklists` without `orderBy`, sorting client-side to avoid index/rule blockers.
   - create checklist items with projectId, title, discipline, status, required-for-submission flag, linked drawing IDs, notes, creator, timestamps.
   - update only status/timestamps/notes fields through existing rules.
   - include deterministic summary counts.
2. Add a reusable `DrawingChecklistTracker` component:
   - renders live checklist records for the selected project.
   - allows project managers to add checklist items and advance status.
   - shows read-only state for non-managers.
   - includes advisory AI/governance copy without calling AI providers.
3. Integrate into `DesignCompliancePage` when a live project exists.
4. Add service tests and a static integration assertion.
5. Validate with targeted tests, TypeScript, build, and browser/dashboard checks as time allows.

## Non-goals
- No transmittal issuing in this slice because browser Firestore rules do not expose transmittals yet.
- No AI generation or external AI calls.
- No fake checklist templates or static metrics.
- No payment, signature, municipal submission, or purchase-order automation.

---

# Slice 2 Plan: Project Coordination Register

Start: 2026-05-17 01:58 UTC

## Research inputs
- Construction RFI best-practice references consistently recommend a register with status, priority/responsibility, due dates, responses, and review cadence to reduce delays and keep accountability visible.
- Architectural document-control references highlight RFIs, submittals, transmittals, deadlines, and compliance/status registers as core professional-team coordination records.
- South African project/construction-management references point to regulated professional coordination and traceability under SACPCMP/cidb-aligned built-environment practice, but do not justify any automated professional sign-off.
- Existing backend API schema already defines `COORDINATION_ITEM_TYPES` such as `rfi`, `transmittal`, `deadline`, `compliance_status`, and `municipal_readiness`.
- Existing `firestore.rules` already exposes `projects/{projectId}/coordination_items` for project participants, with creator/manager status updates and no delete path.

## Chosen slice
Add a **Project Coordination Register** to the existing `Tasks & Approvals` dashboard page.

## Why this slice
- Directly supports backend.html command-centre requirements: open approvals, RFIs, documents/transmittals, compliance status, recent activity, deadlines, and next actions.
- Uses an existing allowed project subcollection instead of creating unsupported rules.
- Fits the current Tasks & Approvals route without changing role options or existing task-card behaviour.
- Can operate honestly with empty states and live records only.

## Implementation plan
1. Add a typed `coordinationRegisterService` for `projects/{projectId}/coordination_items`:
   - subscribe without `orderBy`, sorting client-side to avoid index requirements.
   - create sanitized item records aligned to backend API fields.
   - update status/timestamps only.
   - expose deterministic summary metrics.
2. Add a `ProjectCoordinationRegister` component:
   - render summary cards and live register rows.
   - allow project participants to create coordination items.
   - allow creators, design leads, and admins to update status.
   - show AI/human-governance copy without provider calls or automated approvals.
3. Integrate into `TasksApprovalsPage` when a live project is selected.
4. Add focused service tests and static integration assertions.
5. Validate with TypeScript, targeted tests, build, and E2E if time permits.

## Non-goals
- No automated RFI responses, transmittal issue approval, statutory submission, contract instruction, payment action, or professional sign-off.
- No mock/sample register rows.
- No new Firestore rules unless validation proves the existing rules are insufficient.
