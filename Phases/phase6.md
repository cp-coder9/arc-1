# Phase 6 — Advanced AI Workflow Agents & Final Polish

> **Goal:** Deploy workflow-specific AI agents that operate across the project lifecycle, implement close-out automation, and perform comprehensive integration testing. This is the capstone phase.

## What Exists Today

| Feature | Status |
|---|---|
| AI Agent System | Multi-agent orchestration for SANS 10400 compliance |
| Specialized Agents | 6 architectural agents (Wall, Fenestration, Door/Fire, Area, General, SANS Specialist) |
| Agent Management | Admin CRUD, per-agent LLM configuration |
| Agent Knowledge | Knowledge base with citation system |
| Workflow Agents | ❌ Missing — no Briefing, Matching, Tender, or Construction agents |

## What This Phase Adds

1. **Briefing Agent** — assists clients in scoping requirements (Intake/Scoping stages).
2. **Matching Agent** — AI-powered architect/team matching based on project needs.
3. **Tender Agent** — assists in bid evaluation and contract structuring.
4. **Construction Agent** — monitors build progress, flags schedule risks, assists with RFI responses.
5. **Agent Orchestration Upgrade** — extend the orchestrator to support workflow agents alongside compliance agents.
6. **Close-out Automation** — auto-generate completion certificates, final reports, and archive project data.
7. **End-to-End Integration Testing** — full lifecycle test suite.

---

## Detailed Tasks

### Task 6.1 — Define Workflow Agent Types

**File:** `src/types.ts`

```typescript
export type WorkflowAgentRole =
  | 'briefing_agent'
  | 'matching_agent'
  | 'tender_agent'
  | 'construction_agent';

export interface WorkflowAgentConfig {
  role: WorkflowAgentRole;
  name: string;
  description: string;
  systemPrompt: string;
  activeInStages: ProjectStage[];     // which stages this agent operates in
  triggerEvents: string[];            // e.g. 'stage_entered', 'rfi_created', 'bid_submitted'
  temperature: number;
}
```

**Acceptance:**
- No lint errors.
- Extends existing `Agent` model concept.

---

### Task 6.2 — Create Briefing Agent

**File:** `src/services/agents/briefingAgent.ts` *(NEW)*

- Active during `intake` and `scoping` stages.
- Assists clients with:
  - Defining project scope from natural language description.
  - Generating structured requirements list.
  - Suggesting appropriate job category.
  - Estimating budget range based on project type and size.
- Uses existing Gemini proxy.

**Interface:**
```
  - analyzeBrief(description: string): Promise<{
      suggestedCategory: JobCategory,
      requirements: string[],
      estimatedBudget: { min: number, max: number },
      scopeNotes: string
    }>
```

**Acceptance:**
- Given a project description, returns structured brief analysis.
- Integration test with sample input passes.

---

### Task 6.3 — Create Matching Agent

**File:** `src/services/agents/matchingAgent.ts` *(NEW)*

- Active during `scoping` and `appointment` stages.
- Takes a `Project` + registered architects.
- Scores architects based on:
  - Specialization match.
  - Location proximity.
  - Past project similarity.
  - Rating and experience.
  - Availability.
- Returns ranked list with reasoning.

**Acceptance:**
- Given a project and 5+ architects, returns ranked recommendations.
- Reasoning is human-readable.

---

### Task 6.4 — Create Tender Agent

**File:** `src/services/agents/tenderAgent.ts` *(NEW)*

- Active during `tender` stage.
- Enhances `bidComparisonService` from Phase 3 with:
  - Risk flagging (unrealistically low bids, missing qualifications).
  - Contract clause suggestions based on bid analysis.
  - Automated BOQ verification against project scope.

**Acceptance:**
- Given 3+ bids, produces enhanced analysis with risk flags.
- Integration test passes.

---

### Task 6.5 — Create Construction Agent

**File:** `src/services/agents/constructionAgent.ts` *(NEW)*

- Active during `delivery` stage.
- Monitors:
  - Gantt chart progress vs. timeline.
  - Open RFI turnaround times.
  - Site log frequency and completeness.
- Alerts:
  - Schedule delays (tasks behind schedule).
  - Stale RFIs (approaching overdue).
  - Missing site logs (gaps in daily logging).
- Can suggest RFI responses based on project knowledge base.

**Acceptance:**
- Given project data, produces progress summary with alerts.
- Schedule risk detection works correctly.

---

### Task 6.6 — Close-out Automation

**Files:**
- `src/services/closeoutService.ts` *(NEW)*
- `src/components/CloseoutWizard.tsx` *(NEW)*

Service:
```
  - generateCompletionCertificate(projectId): Promise<string> // returns PDF URL
  - generateFinalReport(projectId): Promise<string>           // markdown summary
  - archiveProject(projectId): Promise<void>                  // mark as closed
  - getProjectSummary(projectId): Promise<ProjectSummary>
```

Component (CloseoutWizard):
- Step 1: Review project summary (team, timeline, budget vs. actual).
- Step 2: Confirm all milestones released.
- Step 3: Generate completion certificate.
- Step 4: Archive project.

Triggers stage transition to `'closeout'`.

**Acceptance:**
- Certificate PDF generates successfully.
- Project archived and no longer appears in active lists.

---

### Task 6.7 — End-to-End Integration Tests

**File:** `src/services/__tests__/lifecycle.integration.test.ts` *(NEW)*

Test scenarios:
1. **Happy Path**: Create job → select architect → progress through all 9 stages → close out.
2. **Tender Flow**: Create tender → submit bids → AI comparison → award.
3. **Construction Flow**: Create Gantt tasks → add site logs → create/respond RFIs.
4. **Payment Flow**: Initialize escrow → request releases → approve → verify ledger.
5. **Team Flow**: Invite members → accept → verify coverage.

**Acceptance:**
- All 5 test scenarios pass.
- No TypeScript errors.
- Test output clean.

---

## Verification Plan

| Check | Command / Method |
|---|---|
| TypeScript | `npm run lint` |
| Unit tests | `npm test` (full suite) |
| Integration tests | `npm test -- --testPathPattern=lifecycle.integration` |
| Browser test | Full lifecycle walkthrough in browser |
| Git | Branch `phase-6/ai-agents-polish` |

## Dependencies

- **All previous phases** must be complete.
- Existing Gemini/LLM proxy and agent infrastructure.
