# Phase 6 — Tasks Checklist

> Track progress for Phase 6: Advanced AI Workflow Agents & Final Polish

- [x] **Task 6.1** — Define `WorkflowAgentRole` and `WorkflowAgentConfig` in `src/types.ts`
  - `WorkflowAgentRole` type (4 roles)
  - `WorkflowAgentConfig` interface
  - Run `npm run lint`

- [x] **Task 6.2** — Create `src/services/agents/briefingAgent.ts`
  - `analyzeBrief()` — NLP-powered scope analysis
  - Returns category, requirements, budget estimate, notes
  - Integration test with sample description

- [x] **Task 6.3** — Create `src/services/agents/matchingAgent.ts`
  - Multi-factor architect scoring
  - Returns ranked list with reasoning
  - Integration test with mock architect data

- [x] **Task 6.4** — Create `src/services/agents/tenderAgent.ts`
  - Enhanced bid analysis with risk flags
  - Contract clause suggestions
  - BOQ verification
  - Integration test

- [x] **Task 6.5** — Create `src/services/agents/constructionAgent.ts`
  - Schedule monitoring + delay alerts
  - RFI turnaround tracking
  - Site log completeness checks
  - AI-assisted RFI response suggestions

- [x] **Task 6.6** — Close-out automation
  - `src/services/closeoutService.ts`:
    - `generateCompletionCertificate()`
    - `generateFinalReport()`
    - `archiveProject()` validates persisted certificate and final report artifacts before mutating project/job state
  - `src/components/CloseoutWizard.tsx`:
    - 4-step wizard (review, confirm milestones, certificate, archive) with persisted-artifact archive guard
  - Triggers `closeout` stage transition

- [x] **Task 6.7** — End-to-end integration tests
  - Happy path (all 9 stages)
  - Tender agent analysis flow
  - Construction agent monitoring flow
  - Payment/ledger decision data
  - Team coverage/invitation readiness logic
  - Close-out archive validation blocks missing artifacts

## Git Strategy

```
Branch: phase-6/ai-agents-polish
Base: main (after phase-5 merge)
Commits: One per task
PR: phase-6/ai-agents-polish → main
```
