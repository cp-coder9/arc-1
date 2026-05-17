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
