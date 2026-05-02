I have the following verification comments after thorough review and exploration of the codebase. Implement the comments by following the instructions in the comments verbatim.

---
The context section for each comment explains the problem and its significance. The fix section defines the scope of changes to make — implement only what the fix describes.

## Comment 1: ExecutionModePicker, multi-file packs, and previousFindings are not wired into any submission entry point.

### Context
The plan's Phase 6/7 explicitly required exposing the new `ExecutionModePicker` beside upload actions, passing `mode`, `files[]`, and `previousFindings` to `reviewDrawing`, and persisting `findings`, `signOffChecklist`, `riskStatus`, `executionMode` on the `Submission` document. A grep across `src/components/ClientDashboard.tsx`, `src/components/ArchitectDashboard.tsx`, and `src/components/AdminDashboard.tsx` shows only `import { reviewDrawing }` — there is no actual call site updated and no use of `ExecutionModePicker` anywhere in the codebase. The component file `src/components/ExecutionModePicker.tsx` is created but unreferenced. As a result, every real submission still runs as `basic_ai_screen` (the default inferred mode for a single file), single-file only, with no resubmission-delta capability. The user-facing PRD outcome (council readiness, fire plan review, full professional review modes) is therefore not actually selectable in the product, even though the engine supports it.

### Fix

In `ClientDashboard.tsx`, `ArchitectDashboard.tsx`, and any other component that calls `reviewDrawing()`, locate the existing invocation and (a) render `ExecutionModePicker` next to the file upload control with state for the chosen `ExecutionMode`, (b) collect the full uploaded file list as `DrawingReference[]` and pass it as the `files` argument, (c) when re-running review on a submission that already has `findings`, pass `previousFindings` from Firestore, and (d) after the review resolves, persist `findings`, `signOffChecklist`, `riskStatus`, and `executionMode` on the submission document via `updateDoc`. Add the same wiring in `AdminDashboard.tsx` if it triggers reviews. Keep backward compatibility by defaulting `mode` to undefined so `inferDefaultMode` still chooses sensibly.

### Referred Files
- e:\arc-1\arc-1\src\components\ClientDashboard.tsx
- e:\arc-1\arc-1\src\components\ArchitectDashboard.tsx
- e:\arc-1\arc-1\src\components\AdminDashboard.tsx
- e:\arc-1\arc-1\src\components\ExecutionModePicker.tsx
- e:\arc-1\arc-1\src\services\geminiService.ts
---
## Comment 2: SubmissionSchema in schemas.ts was not extended with findings, signOffChecklist, riskStatus, executionMode.

### Context
The `Submission` interface in `src/types.ts` gained `findings`, `signOffChecklist`, `riskStatus`, and `executionMode`, but `SubmissionSchema` in `src/lib/schemas.ts` (lines 204-216) was not updated. Any code that validates a submission payload with `SubmissionSchema` (form helpers, API request validation, or future server-side checks) will reject or strip these fields, contradicting the plan's Phase 1.4 requirement to extend `Submission` end-to-end. This will silently lose risk-status and findings data the moment validation runs against a submission.

### Fix

In `src/lib/schemas.ts`, extend `SubmissionSchema` to include optional `findings: z.array(FindingSchema).optional()`, `signOffChecklist: z.array(SignOffRequirementSchema).optional()`, `riskStatus: RiskStatusEnum.optional()`, and `executionMode: ExecutionModeEnum.optional()`. Ensure `SubmissionCreateSchema` continues to omit these or marks them optional as appropriate.

### Referred Files
- e:\arc-1\arc-1\src\lib\schemas.ts
- e:\arc-1\arc-1\src\types.ts
---
## Comment 3: Orchestrator retry loop can exit with an empty finalResponse, masking failures.

### Context
In `reviewDrawing` (src/services/geminiService.ts, around the `while (orchAttempt < 2 && !orchestratorSucceeded)` block), `finalResponse` is initialized to `''`. On the catch path, the code does `if (orchAttempt === 0) orchAttempt++; else throw err;` — but on the validation-failure path it only increments `orchAttempt` without setting `orchestratorSucceeded = true`, so when `orchAttempt` reaches 2 the loop exits with `finalResponse` possibly still being the previous attempt's bad text or empty. The subsequent `parseAIResponseV2(finalResponse)` then silently produces a degraded result with no retry telemetry. The legacy implementation explicitly logged a warning, augmented the system prompt, and proceeded with heuristic parsing; that diagnostic behavior has been lost.

### Fix

In the orchestrator retry loop inside `reviewDrawing`, after the second failed validation attempt log a warning via `logSystemEvent('warning', 'AI Orchestrator', 'Orchestrator V2 validation failed after retry')`, ensure `finalResponse` is non-empty before calling `parseAIResponseV2`, and on validation failure after retry set `orchestratorSucceeded = true` so the loop exits cleanly. Also consider returning a partially-degraded `AIReviewResult` with `riskStatus: 'ai_review_failed'` if `finalResponse` is empty.

### Referred Files
- e:\arc-1\arc-1\src\services\geminiService.ts
---
## Comment 4: OrchestrationProgressModal derives the agent list lazily, regressing the upfront workflow visualization.

### Context
The previous modal showed all 6 specialist agents as a fixed list/diagram from the start, with each lighting up as it ran. The new implementation builds `agents` from `[...progress.completedAgents, progress.agentName]`, so users only see agents appear *after* they have started or completed. Pending agents are never shown, breaking the 'Active Workflow Agents' card's intent and degrading the perception of progress. The plan asked for a dynamic but discipline-grouped list — not a list that grows from zero.

### Fix

Update `OrchestrationProgressModal` to accept the resolved agent role set as a prop (have `reviewDrawing` emit it via the first `AIProgress` event, e.g. by adding `plannedAgents?: string[]` to `AIProgress`) and render that full list grouped by discipline. Mark each entry as pending/active/completed by checking `progress.completedAgents` and `progress.agentName` against the planned list. Update `geminiService.ts` to populate `plannedAgents` once `resolveAgentsForMode` runs.

### Referred Files
- e:\arc-1\arc-1\src\components\OrchestrationProgressModal.tsx
- e:\arc-1\arc-1\src\services\geminiService.ts
- e:\arc-1\arc-1\src\types.ts
---
## Comment 5: /api/agent/scope endpoint added to api-router but never invoked from reviewDrawing.

### Context
Phase 5.12 of the plan added `/api/agent/scope` for the Regulatory Scope Agent. The route exists in `src/lib/api-router.ts` but `reviewDrawing` instead calls the regulatory_scope agent through the same `callAgent` path that all specialists use (`callGeminiProxy` / `callAgentReview`). Result: dead code on the server side, and the scope pre-pass shares the same `/api/gemini/review` quota and rate limiter as specialist calls — defeating the purpose of a dedicated, lighter scope endpoint. Additionally `/api/agent/scope` only supports the Gemini provider; non-Gemini deployments would silently fail when wired up.

### Fix

Either (a) remove the unused `/api/agent/scope` route from `src/lib/api-router.ts` to avoid confusion, or (b) wire `reviewDrawing` to call it via a new helper `callScopeAgent(scopePrompt, files)` that hits `/api/agent/scope`, and extend the route to fall through to `callOpenAICompatible` for non-Gemini providers similarly to `/api/review`. Document the chosen direction with a code comment near `regulatory_scope` agent invocation.

### Referred Files
- e:\arc-1\arc-1\src\lib\api-router.ts
- e:\arc-1\arc-1\src\services\geminiService.ts
---
## Comment 6: parseAIResponseV2 returns unvalidated raw JSON on schema failure, breaking downstream type guarantees.

### Context
In `src/services/geminiService.ts`, when `OrchestratorResultV2Schema.safeParse(rawParsed)` fails, the function returns `rawParsed as Partial<AIReviewResult>` — an unchecked cast. Downstream in `reviewDrawing`, the caller treats `parsedResult.findings`, `parsedResult.signOffChecklist`, and `parsedResult.riskStatus` as if they conform to the typed shape. A malformed LLM response could produce e.g. `findings: "some string"` and `parsedResult.findings?.length` would throw or return a misleading number, polluting the persisted submission. The plan explicitly required strict validation with retry, then graceful fallback — the fallback should not return raw data.

### Fix

In `parseAIResponseV2`, when validation fails, only forward fields that pass per-field validation (use `FindingSchema.safeParse` per finding, `SignOffRequirementSchema.safeParse` per checklist item, etc.). Drop or replace any field that does not validate. Always set a sentinel `riskStatus: 'ai_review_failed'` when the top-level shape is invalid so that the legacy mapper marks the submission as failed.

### Referred Files
- e:\arc-1\arc-1\src\services\geminiService.ts
---
## Comment 7: resolveAgentsForMode adds 'orchestrator' which is then unconditionally removed in reviewDrawing — confusing dead code.

### Context
`agentSelectionService.resolveAgentsForMode` always ensures `orchestrator` appears at the end of the returned role list. In `reviewDrawing` the code immediately calls `roleSet.delete('orchestrator')`, so the appended role is meaningless. Likewise it deletes `regulatory_scope`, `coordination_clash`, and `professional_signoff` even though those roles are explicitly listed in the mode→agent maps. This duplication makes the intent unclear and is a maintenance trap: a future edit to either side may diverge silently (e.g., adding a new orchestration-only role to MODE_AGENT_MAP without remembering to delete it in `reviewDrawing`).

### Fix

Decide on a single source of truth. Either (a) keep orchestration-stage roles out of `MODE_AGENT_MAP` entirely and have `reviewDrawing` add them explicitly, or (b) keep them in the map and remove the manual `roleSet.delete(...)` calls in `reviewDrawing`. Recommend option (a): in `src/services/agentSelectionService.ts` strip `orchestrator`, `regulatory_scope`, `coordination_clash`, `professional_signoff` from every mode entry, and document at the top of the file that these are runtime-only stages not selectable as specialists.

### Referred Files
- e:\arc-1\arc-1\src\services\agentSelectionService.ts
- e:\arc-1\arc-1\src\services\geminiService.ts
---
## Comment 8: AdminKnowledgeUploader hardcodes submittedByRole: 'admin' regardless of caller.

### Context
In `src/components/AdminKnowledgeUploader.tsx`, both `handlePdfUpload` and `handleSubmit` set `submittedByRole: 'admin'` and `status: 'active'` (auto-approved). If this component is ever reused outside an admin context (the prop is typed `user: any`), non-admin users would create active knowledge entries that bypass `pending_review`. Combined with the relaxed `agent_knowledge` Firestore create rule (`allow create: if isAuthenticated()`), this is a privilege-escalation risk.

### Fix

In `src/components/AdminKnowledgeUploader.tsx`, derive `submittedByRole` from `user.role` and gate `status: 'active'` behind `user.role === 'admin'`; otherwise default to `'pending_review'`. Additionally tighten the Firestore rule for `agent_knowledge` create to require `request.resource.data.status == 'pending_review'` unless `isAdmin()`.

### Referred Files
- e:\arc-1\arc-1\src\components\AdminKnowledgeUploader.tsx
- e:\arc-1\arc-1\firestore.rules
---
## Comment 9: Per-submission Firestore persistence of structured findings is missing, breaking resubmission delta review.

### Context
Plan Phase 7 requires persisting `findings`, `signOffChecklist`, `riskStatus`, and `executionMode` onto each `Submission` doc so that subsequent reruns can pass `previousFindings` for `resubmission_delta_review` mode. Currently `reviewDrawing` only writes a summary entry to the `agent_knowledge` collection (`source: 'self_improvement'`) and returns the result — it never updates the submission document. Coupled with the missing call-site wiring (Comment 1), this means resubmission delta mode has no source of `previousFindings` to consume even if a caller selects it. `inferDefaultMode` will therefore never resolve to `'resubmission_delta_review'` in practice.

### Fix

Either inside `reviewDrawing` (when `submissionId` is provided) or at every call site, after the result is returned, call `updateDoc(doc(db, 'jobs', jobId, 'submissions', submissionId), { findings, signOffChecklist, riskStatus, executionMode: selectedMode, status: validStatus, updatedAt: new Date().toISOString() })`. Prefer doing it at the call site so submission ownership and trace logs stay in dashboard code. Update Firestore rules to permit these new fields on the `submissions` update affectedKeys allowlist.

### Referred Files
- e:\arc-1\arc-1\src\services\geminiService.ts
- e:\arc-1\arc-1\firestore.rules
---
## Comment 10: SYSTEM_GUARDRAILS prepended twice in callOpenAICompatible when used together with /api/review server-side guardrails.

### Context
`src/services/geminiService.ts::callOpenAICompatible` now prepends `SYSTEM_GUARDRAILS` to the system message, and the server route `/api/review` in `src/lib/api-router.ts` *also* prepends `SYSTEM_GUARDRAILS` via `withGuardrails(systemInstruction)`. When the review path goes client→/api/review (i.e. `callAgentReview`), the prefix is added once on the server. But when the path goes through `callOpenAICompatible` directly (rare in production but used in tests / direct provider calls), the prefix is added once on the client. In `reviewDrawing` today, `callAgent` for non-Gemini providers calls `callAgentReview` (the `/api/review` proxy) only, and `callOpenAICompatible` is exported but no longer used internally — so the duplication is potential rather than current. Worth tightening to avoid future double-prepending.

### Fix

Remove the `SYSTEM_GUARDRAILS` prefix inside `callOpenAICompatible` since it is now duplicated by the `/api/review` server-side `withGuardrails`. If `callOpenAICompatible` is intended for direct (non-proxy) use as well, gate the prefix behind a parameter `applyGuardrails: boolean`. Add a code comment in both files clarifying that the guardrails are added at the proxy boundary.

### Referred Files
- e:\arc-1\arc-1\src\services\geminiService.ts
- e:\arc-1\arc-1\src\lib\api-router.ts
---
## Comment 11: Existing dashboard tests were rewritten heavily without any related task in the plan.

### Context
The diff summary shows large rewrites to `AdminDashboard.test.tsx`, `ArchitectDashboard.test.tsx`, `ClientDashboard.test.tsx`, `councilSubmissionService.test.ts`, `paymentService.test.ts`, plus `paymentService.ts` itself, `setup.ts`, jest/tsconfig, `package.json`/`package-lock.json`, and `e2e/sidebar-harness.spec.ts`. None of these are scoped under the AI agent system PRD or the implementation plan. Per the external-changes policy these may be parallel work, but several touched test files now have additional Firebase mocks added specifically because the new geminiService imports broke them — that is direct collateral damage from the agent system refactor. Worth confirming the test suite still passes (`npm run lint && npm test && npm run test:e2e`) since some of the test rewrites also mark previously passing assertions as 'should return failed status' instead of asserting `passed`, suggesting the suite was loosened to accommodate orchestrator instability.

### Fix

Run the full `npm run lint && npm test && npm run test:e2e` pipeline and verify no assertions were silently relaxed. Re-tighten the `geminiService.test.ts::should return review result on success` test to assert the actual `'passed'` status returned — currently it only asserts `result.status` is defined, which masks regressions in the orchestrator flow. Where test files outside the agent system scope were rewritten as a side effect of the import refactor, restrict changes to mock additions only.

### Referred Files
- e:\arc-1\arc-1\src\services\__tests__\geminiService.test.ts
- e:\arc-1\arc-1\src\test\integration\ai-review-flow.test.ts
- e:\arc-1\arc-1\src\components\__tests__\AdminDashboard.test.tsx
- e:\arc-1\arc-1\src\components\__tests__\ArchitectDashboard.test.tsx
- e:\arc-1\arc-1\src\components\__tests__\ClientDashboard.test.tsx
---