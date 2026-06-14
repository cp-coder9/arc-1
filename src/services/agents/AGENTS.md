# AGENTS.md — AI Agent Implementations

## Purpose

Domain-specific AI agents that perform autonomous compliance checking, workflow orchestration, and professional matching across the built-environment lifecycle. Each agent encapsulates SANS 10400 regulatory knowledge, construction domain expertise, or professional matchmaking logic.

## Ownership

- **Path:** `src/services/agents/`
- **Owner:** Agent Engineering / AI Platform Team
- **Key files:** `briefingAgent.ts`, `constructionAgent.ts`, `matchingAgent.ts`, `tenderAgent.ts`, `workflowAgentUtils.ts`
- **Consumed by:** `src/services/geminiService.ts`, `src/services/agentWorkflow/`, `src/services/workflowToolAgentService.ts`

## Local Contracts

### Agent Interface Contract
Every agent must:
- Accept a typed prompt/context object
- Call `callGeminiProxy()` or `callWorkflowAgent()` for LLM inference
- Return structured JSON matching the expected output schema
- Use `workflowAgentUtils` sanitizers (`sanitizeText`, `sanitizeStringArray`, `finiteNumber`, `extractJsonObject`) for safe data handling
- Follow the `WorkflowAgentConfig` shape for role, system prompt, and temperature

### Agent Registry
| Agent | File | Inputs | Outputs |
|-------|------|--------|---------|
| BriefingAgent | `briefingAgent.ts` | Client requirements, site context | Structured brief, risk flags, recommended next stages |
| ConstructionAgent | `constructionAgent.ts` | Site logs, programme, resources | Execution updates, snag recommendations, delay warnings |
| MatchingAgent | `matchingAgent.ts` | Project brief, BEP profiles, location | Ranked professional matches, capability scores |
| TenderAgent | `tenderAgent.ts` | Tender documents, bid submissions, pricing | Bid comparison, risk assessment, award recommendation |

### Shared Utilities
- `workflowAgentUtils.ts` — Common agent helpers: JSON extraction, text sanitization, agent prompt dispatch
- Agents must NOT import Firestore directly — all data flows through `geminiService.ts` orchestration

### Compliance Agent Prompts
Additional compliance agents (Wall, Fenestration, Fire, Area, General) store their system prompts in the Firestore `agents` collection, orchestrated by the Orchestrator agent. These agents follow the same output schema contract but their prompts are data-driven rather than code-driven.

## Work Guidance

- New agents must register in the Firestore `agents` collection and add an orchestration route in `geminiService.ts`
- Agent prompts must include: role definition, SANS/regulatory references, expected output JSON schema, and guardrails
- All agent responses must be sanitized before storage or display
- Use `WorkflowAgentConfig` for role, temperature, and system prompt configuration
- Test each agent via `npm test -- src/services/__tests__/workflowAgents.test.ts`

## Verification

- `npm test -- src/services/__tests__/workflowAgents.test.ts` — agent orchestration tests
- `npm test -- src/services/__tests__/geminiService.test.ts` — AI service + agent dispatch tests
- `npm test -- src/services/__tests__/proposalAgentRecommendations.test.ts` — agent recommendation integration tests
- Each agent must have at least one unit test validating its output schema and sanitization behavior

## Child DOX Index

No child AGENTS.md files exist below this directory.
