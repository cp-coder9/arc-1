# Architex OS Architecture Consolidation Plan

> For Hermes/Amy QC: implement this plan with strict TDD and two-stage verification. No push or deployment without explicit user approval.

**Goal:** Shift Architex from feature accumulation into a production-grade built-environment operating-system spine.

**Current evidence checked:**
- Repo: `/home/gmt/projects/architex`
- Branch: `phase-2-verification-workflows`, ahead of origin by 6 commits at time of plan creation
- Backend router: `src/lib/api-router.ts` is 6,157 lines and should be decomposed by domain
- `npm run lint`: PASS
- `npm test -- --reporter=dot`: FAIL
  - `src/components/__tests__/AdminDashboard.test.tsx` cannot resolve `@base-ui/react/popover` from `src/components/ui/popover.tsx`
  - `src/services/__tests__/lifecycle.integration.test.ts` expects archiving after certificate/final-report persistence, but close-out gate now requires certificates, warranties, final account approval, handover pack approval/documents, and reviewer metadata

**Operating principle:** Stabilize the test suite first, then introduce OS spine primitives behind typed contracts and domain routers. Do not keep adding UI/product features until the platform has auditable events, findings, rulesets, reports, agent APIs, and permissioned action logs.

---

## Phase 0: Test Suite Recovery Gate

### Task 0.1: Fix Base UI popover import failure

**Objective:** Restore AdminDashboard test import resolution without changing user-facing behavior.

**Files:**
- Inspect: `src/components/ui/popover.tsx`
- Inspect: `package.json`
- Test: `src/components/__tests__/AdminDashboard.test.tsx`

**Steps:**
1. Confirm the installed `@base-ui/react` package export path with `node -e "console.log(require('./node_modules/@base-ui/react/package.json').exports)"` or equivalent ESM-safe inspection.
2. Write/adjust a focused import test if needed so the failure is captured by Vitest.
3. Replace the invalid import with the package-supported Base UI popover export, or pin the dependency/export mismatch intentionally.
4. Run `npm test -- src/components/__tests__/AdminDashboard.test.tsx --reporter=dot`.
5. Run `npm test -- --reporter=dot`.

**Acceptance:** AdminDashboard test suite loads and no package-export failure remains.

### Task 0.2: Repair lifecycle close-out integration fixture

**Objective:** Align the integration test fixture with the now stricter close-out gate instead of weakening the gate.

**Files:**
- Test: `src/services/__tests__/lifecycle.integration.test.ts`
- Inspect: `src/services/closeoutService.ts`

**Steps:**
1. Reproduce focused failure: `npm test -- src/services/__tests__/lifecycle.integration.test.ts --reporter=verbose`.
2. Read the close-out gate object requirements in `closeoutService.ts`.
3. Update only the test fixture/setup to include:
   - close-out certificate record
   - warranty record
   - approved final account with approver and timestamp
   - approved handover pack with linked documents
   - close-out audit reviewer and reviewed timestamp
4. Run the focused lifecycle test.
5. Run full `npm test -- --reporter=dot`.

**Acceptance:** Full Vitest suite passes without reducing close-out gate strictness.

### Task 0.3: Establish baseline verification command

**Objective:** Make future agents use the same quality gate.

**Files:**
- Modify: `docs/phase-reports/os-architecture-consolidation-plan.md` if commands change
- Optional: `scripts/predeploy-check.mjs` if it should include tests

**Verification command:**
`npm run lint && npm test -- --reporter=dot`

**Acceptance:** Local branch has a known green baseline before architecture work starts.

---

## Phase 1: API Router Decomposition

### Task 1.1: Create router composition shell

**Objective:** Split `src/lib/api-router.ts` without changing routes or behavior.

**Files:**
- Create: `src/lib/routes/index.ts`
- Create: `src/lib/routes/shared.ts`
- Modify: `src/lib/api-router.ts`
- Test: existing `src/lib/__tests__/api-router.security.test.ts`

**Target router domains:**
- `routes/review.ts`
- `routes/municipal.ts`
- `routes/files.ts`
- `routes/payments.ts`
- `routes/agents.ts`
- `routes/reports.ts`
- `routes/admin.ts`
- `routes/webhooks.ts`
- `routes/projects.ts`
- `routes/marketplace.ts`
- `routes/governance.ts`

**Rules:**
- Preserve current route paths and response schemas.
- Move shared guards, limiters, auth helpers, Firestore helpers, and environment access into shared modules.
- Move one domain at a time and run focused tests after each move.

**Acceptance:** `api-router.ts` becomes a composition entry point, not a 6k-line god file.

### Task 1.2: Domain-by-domain migration order

**Order:**
1. Webhooks/payment notify routes first, because webhook origin exceptions are sensitive.
2. Files/blob routes.
3. Municipal tracker routes.
4. AI review/agents routes.
5. Reports routes.
6. Admin/governance routes.
7. Marketplace/project workflow routes.

**Acceptance after each domain:**
- Focused route/security tests pass.
- Full `npm run lint` passes.
- No route contract drift unless covered by explicit contract test update.

---

## Phase 2: OS Spine Domain Models

### Task 2.1: Formal Finding / Issue / Recommendation model

**Objective:** Create the canonical compliance finding object used by AI review, human review, reports, issue tracking, and agent logs.

**Files:**
- Create: `src/types/os.ts` or extend existing canonical type file if already present
- Create: `src/services/__tests__/findingModel.test.ts`
- Create: `src/services/findingModelService.ts`

**Minimum fields:**
- `id`
- `projectId`
- `sourceType`: `ai_review | human_review | revit_audit | municipal_tracker | user_feedback | imported_standard`
- `discipline`
- `standardFamily`
- `ruleId`
- `severity`
- `confidence`
- `status`: `open | accepted | rejected | corrected | verified | superseded`
- `title`
- `description`
- `evidence[]`
- `recommendation`
- `responsibleParty`
- `requiresProfessionalSignoff`
- `createdBy`
- `createdAt`
- `updatedAt`
- `auditTrail[]`

**Acceptance:** AI findings can be stored as structured OS issues, not just chat/result text.

### Task 2.2: Versioned compliance ruleset structure

**Objective:** Create versionable rules that produce findings and survive standards updates.

**Files:**
- Create: `src/services/rulesetService.ts`
- Create: `src/services/__tests__/rulesetService.test.ts`
- Create/update docs: `docs/backend/compliance-ruleset-model.md`

**Minimum rule fields:**
- `ruleId`
- `version`
- `jurisdiction`
- `discipline`
- `standardFamily`
- `sourceRef`
- `severityDefault`
- `appliesWhen`
- `evidenceRequired`
- `recommendationTemplate`
- `verificationMethod`
- `effectiveFrom`
- `supersedes`

**Acceptance:** A finding references a specific rule ID and version.

### Task 2.3: Built-environment discipline model

**Objective:** Normalize disciplines, professional responsibility, and sign-off boundaries.

**Files:**
- Create/update: `src/services/disciplineModelService.ts`
- Create: `src/services/__tests__/disciplineModelService.test.ts`

**Acceptance:** Disciplines become shared OS primitives across compliance, marketplace, reports, Revit audit, municipal workflows, and agent permissions.

---

## Phase 3: Event Bus and Activity Stream

### Task 3.1: Event model

**Objective:** Add a structured platform event object that every important workflow can emit.

**Files:**
- Create: `src/services/eventBusService.ts`
- Create: `src/services/__tests__/eventBusService.test.ts`
- Create/update docs: `docs/backend/os-event-model.md`

**Initial event types:**
- `document.uploaded`
- `drawing.review_requested`
- `issue.created`
- `issue.verified`
- `user.feedback.corrected`
- `report.generated`
- `revit_bridge.audit.completed`
- `municipal.status.changed`
- `agent.action.requested`
- `agent.action.completed`
- `agent.action.denied`

**Acceptance:** Events are append-only, project-scoped, permission-aware, and suitable for webhook fanout later.

### Task 3.2: Project activity stream

**Objective:** Build a project-scoped activity stream from events.

**Files:**
- Create: `src/services/projectActivityStreamService.ts`
- Create: `src/services/__tests__/projectActivityStreamService.test.ts`

**Acceptance:** A project can render chronological structured activity without scraping unrelated collections.

---

## Phase 4: Agent Tool/API Layer and Action Logs

### Task 4.1: Agent action log model

**Objective:** Every agent operation must be auditable and permissioned.

**Files:**
- Extend: `src/services/aiGovernanceService.ts` if appropriate
- Create: `src/services/__tests__/agentActionLogService.test.ts`
- Create: `src/services/agentActionLogService.ts`

**Minimum fields:**
- `id`
- `agentId`
- `actorUserId`
- `projectId`
- `toolName`
- `inputSummary`
- `outputSummary`
- `riskLevel`
- `requiresApproval`
- `approvalStatus`
- `startedAt`
- `completedAt`
- `status`
- `error`
- `traceId`

**Acceptance:** No agent action should be invisible or unaudited.

### Task 4.2: Architex MCP/API layer contract

**Objective:** Define safe tool endpoints for Amy, Hymie, JCode, Greg's agents, and future MCP clients.

**Files:**
- Create: `docs/backend/agent-tool-api-contract.md`
- Create: `src/lib/routes/agents.ts` if not already created in Phase 1
- Create: route/service tests

**Initial read-only tools:**
- get project summary
- list documents
- list findings
- list activity events
- list applicable rulesets
- request report draft

**Initial controlled write tools:**
- create issue/finding
- append evidence
- request review
- request report generation

**Acceptance:** Agents operate through scoped APIs instead of direct database mutation.

---

## Phase 5: Reporting as a First-Class Artifact Pipeline

### Task 5.1: Report artifact model

**Objective:** Reports become project artifacts with versions, sections, evidence, source findings, and generation trace.

**Files:**
- Create: `src/services/reportArtifactService.ts`
- Create: `src/services/__tests__/reportArtifactService.test.ts`
- Create/update docs: `docs/backend/report-artifact-pipeline.md`

**Acceptance:** A report is not just a chat summary; it is a structured, versioned artifact linked to findings and evidence.

### Task 5.2: Graphic report pipeline

**Objective:** Prepare report generation for visual outputs: compliance matrix, marked-up issue summary, discipline dashboards, municipal timeline, and Revit/model audit summaries.

**Acceptance:** Report generation can produce machine-readable sections first, then PDF/graphic rendering later.

---

## Phase 6: Municipal Tracker Security Hardening

### Task 6.1: Credential and consent audit

**Objective:** Harden municipal automation around consent, credential storage, deletion, audit, and key management.

**Files:**
- Inspect/update municipal tracker services and routes
- Add focused security tests
- Update `docs/backend/municipal-tracker-api-contract-examples.md`

**Acceptance:** Municipal credentials are encrypted, scoped, deletable, consent-recorded, audited, and never exposed to agents or UI responses.

---

## Phase 7: Revit Bridge Read-Only Controlled Channel

### Task 7.1: Revit Bridge contract

**Objective:** Define read-only model audit ingestion before any write/control capability.

**Files:**
- Create: `docs/backend/revit-bridge-readonly-contract.md`
- Create: type/service stubs behind tests

**Initial capabilities:**
- model metadata
- sheets/views metadata
- titleblocks
- rooms/spaces
- schedules
- dimensions
- warnings/audit results

**Acceptance:** Revit data can create evidence and findings but cannot mutate models.

---

## Phase 8: Knowledge Ingestion and Standards Librarian

### Task 8.1: Project-scoped knowledge ingestion

**Objective:** Store project-specific documents, extracted metadata, embeddings/index references, and source permissions.

**Acceptance:** Agents retrieve only permissioned project-scoped knowledge.

### Task 8.2: Standards librarian and feedback loop

**Objective:** Capture corrected findings and human feedback as evaluation/learning records, not unsupervised self-training.

**Acceptance:** Corrections improve future evaluations through approved ruleset/eval updates, with audit trail.

---

## Quality Gates

Before any deployment approval:
1. `git status --short --branch` reviewed.
2. `npm run lint` passes.
3. `npm test -- --reporter=dot` passes.
4. E2E/smoke is run where affected.
5. API/CORS probes pass for `test.architex.co.za` and `api.architex.co.za` when deployment is touched.
6. Backend dashboard/workflow smoke is run for affected routes.
7. No push/deploy without explicit approval.

---

## Strategic Definition of Done

Architex becomes OS-ready when:
- Product modules are routed by domain.
- Findings, rules, events, reports, and agent actions are first-class objects.
- Agents act through permissioned APIs and logs.
- Project activity is reconstructable from events.
- Compliance results cite rule versions and evidence.
- Reports are versioned project artifacts.
- Municipal and Revit integrations are controlled, auditable, and least-privilege.
- The test suite is green enough to trust every change.
