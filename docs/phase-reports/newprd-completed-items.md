# Architex NEWPRD Completed Items

Prepared by: Amy
Source of truth reviewed: `/home/gmt/projects/architex/newprd.txt`
Repo reviewed: `/home/gmt/projects/architex`
Branch reviewed: `phase-2-verification-workflows`
Verification run: `git status --short --branch`, `wc -l src/lib/api-router.ts`, `npm run lint -- --pretty false`, `npm test -- --reporter=dot`

## Verification Summary

- Git branch/status reviewed: branch `phase-2-verification-workflows`, ahead of origin by 6 commits.
- TypeScript lint/type-check passes: `npm run lint -- --pretty false` completed successfully.
- Backend router size confirmed: `src/lib/api-router.ts` is 6,157 lines, matching the NEWPRD risk note that router modularisation is required.
- Test suite was re-run: 76 test files passed, 2 failed; 608 tests passed, 1 failed.
- Because the test suite is not fully green, only items that are clearly implemented or verified are marked completed below.

## Completed Items From `newprd.txt`

### 1. Repo State and Evidence Checks

- Repo location confirmed as `/home/gmt/projects/architex`.
- Current branch confirmed as `phase-2-verification-workflows`.
- Branch is ahead of origin by 6 commits.
- `npm run lint` / TypeScript type-check passes.
- `src/lib/api-router.ts` line count confirmed at 6,157 lines.
- Current failing test areas are identified and reproducible:
  - `src/components/__tests__/AdminDashboard.test.tsx` fails because `src/components/ui/popover.tsx` imports unresolved package path `@base-ui/react/popover`.
  - `src/services/__tests__/lifecycle.integration.test.ts` fails because the positive close-out archive fixture does not satisfy the stricter close-out gate.

### 2. PRD Direction and Product Positioning

- Architex has moved beyond a simple marketplace prototype toward a built-environment workflow / OS-style platform direction.
- The need to prioritise architecture consolidation over feature stacking is documented in `newprd.txt`.
- A fuller implementation plan exists at `docs/phase-reports/os-architecture-consolidation-plan.md`.

### 3. Progress / Strength Areas Already Present

- PRD direction is established.
- Verification workflows are present in the codebase.
- Admin governance foundations are present.
- Dashboard and user-role structure are present.
- Marketplace-to-workflow transition is already underway.
- Early AI review, compliance thinking, municipal tracker, reports, project activity, and agent governance foundations exist, but they are not yet complete enough to count as full OS-spine completion.

### 4. Typed Compliance / Review Foundation Already Present

The codebase already includes typed foundations that support the NEWPRD compliance direction:

- `Finding` interface exists in `src/types.ts`.
- `AIIssue` interface exists in `src/types.ts`.
- `FindingSchema` exists in `src/lib/schemas.ts`.
- Submission records support structured review fields including:
  - `findings`
  - `signOffChecklist`
  - `riskStatus`
  - `executionMode`
  - `traceability`
- Discipline, standard-family, autonomy-label, responsible-party, risk-status, and execution-mode enums are present.

### 5. Built-Environment Discipline Model Foundation

A discipline registry exists in `src/types.ts`, including disciplines such as:

- Architecture
- Structural Engineering
- Fire Engineering
- Electrical Engineering
- Mechanical Engineering
- Energy Compliance
- Civil / Drainage
- Accessibility
- Environmental
- Town Planning
- NHBRC
- Documentation
- Professional Coordination

This means the discipline model is materially started. It should still be hardened into the formal OS-spine model later.

### 6. Municipal Tracker Foundation

Municipal tracker foundations already exist:

- Municipal workflow service exists at `src/services/municipalTrackerWorkflowService.ts`.
- Municipal automation support exists at `src/lib/municipalAutomation.ts`.
- Municipal tracker records include audit metadata.
- Municipal tracker tests exist at `src/services/__tests__/municipalTrackerWorkflowService.test.ts`.
- Encrypted credential fields are present in municipal automation support.

Important: this is not yet complete against the NEWPRD municipal-security requirement. Deletion support, key-management clarity, and full agent access scoping still need hardening.

### 7. Project Activity / Activity Stream Foundation

- User activity tracking exists in `src/lib/userActivity.ts`.
- Dashboard navigation and feature usage tracking are wired through `trackUserActivity` in `src/App.tsx`.
- Project command centre UI includes recent-activity style presentation.

Important: this is a foundation, not a complete first-class project event stream.

### 8. Reporting Foundation

- Compliance report UI exists in `src/components/ComplianceReport.tsx`.
- PDF/report generation support exists in `src/services/pdfGenerationService.ts`.
- Reports already draw from AI review / finding-style data.

Important: reports are not yet fully versioned first-class project artifacts linked to rules, evidence, source documents, generation trace, and approval/review state.

### 9. Agent Governance Foundation

- Agent configuration and status concepts exist in the admin dashboard and Gemini service.
- Agent current activity / last active fields are present.
- AI governance service and tests exist in the service layer.
- Human-review and readiness-gate patterns exist in several workflow services.

Important: NEWPRD's full permissioned agent action log model is not complete yet.

### 10. Quality-Gate Items Completed

- Git status reviewed.
- `npm run lint` passes.
- No push/deploy was performed without GMT approval.

## Not Counted As Completed Yet

These are explicitly excluded from the completed list because the repo does not yet prove them fully complete:

- Full test-suite stabilisation: blocked until the AdminDashboard popover import and lifecycle close-out fixture are fixed.
- Router modularisation: `src/lib/api-router.ts` remains monolithic at 6,157 lines.
- Formal first-class Finding / Issue / Recommendation model: Finding and issue foundations exist, but the full OS-level triad is not complete.
- Versioned compliance rulesets.
- First-class project event model and complete required event taxonomy.
- Complete permissioned agent action logs.
- Complete report artifact pipeline.
- Complete municipal tracker security model.
- Safe Architex agent API / MCP-style tool layer.
- Revit Bridge read-only audit channel.
- Project-scoped standards librarian / feedback loop as a complete system.
- E2E/smoke checks for affected workflows.
- API/CORS probes for preview/production endpoints.

## Current Blockers

### Blocker 1: Base UI Popover Import

`src/components/ui/popover.tsx` imports:

```ts
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
```

Vitest/Vite cannot resolve that import path against the installed package export structure.

### Blocker 2: Close-out Integration Fixture

The positive close-out archive test fixture only persists certificate/final report data. The production close-out gate now also requires:

- Close-out certificates
- Warranties
- Final account approval with approver and timestamp
- Approved handover pack with linked documents
- Close-out audit reviewer metadata and reviewed timestamp

The fixture must be updated without weakening the close-out gate.

## Recommended Next Action

Fix Phase 0 first:

1. Correct the Base UI popover import/export mismatch.
2. Update the lifecycle close-out integration fixture to satisfy the stricter close-out gate.
3. Re-run `npm run lint && npm test -- --reporter=dot` until fully green.

Only after the suite is green should development continue into router modularisation and OS-spine model consolidation.
