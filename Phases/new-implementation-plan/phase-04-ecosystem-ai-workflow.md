# Phase 4 Workflow — Procurement Ecosystem and AI Orchestrator Refinement

## Implementation sequence

1. Define procurement and BOQ types in [src/types.ts](src/types.ts:810), reusing [`BidLineItem`](src/types.ts:837) where appropriate.
2. Create a procurement service adapter layer that maps BOQ lines to supplier product searches and quote/cart requests.
3. Add server-side procurement routes in [src/lib/api-router.ts](src/lib/api-router.ts:295) to keep supplier API keys server-only.
4. Add affiliate commission ledger handling through [src/services/financialLedgerService.ts](src/services/financialLedgerService.ts:12).
5. Extend [`WorkflowAgentRole`](src/types.ts:327) to include proposal, design coordination, municipal, and payment agents.
6. Add agent wrappers under [src/services/agents](src/services/agents) using [src/services/agents/workflowAgentUtils.ts](src/services/agents/workflowAgentUtils.ts:27).
7. Update [src/services/geminiService.ts](src/services/geminiService.ts:76), [list_agents.ts](list_agents.ts), and [update_agents.ts](update_agents.ts) planning to seed agent definitions after implementation.
8. Decide Anthropic route: direct provider in [`LLMProvider`](src/types.ts:373) or documented OpenRouter Anthropic model usage in [src/components/AdminDashboard.tsx](src/components/AdminDashboard.tsx:69).

## Affected files and modules

- [src/types.ts](src/types.ts:327): workflow roles, procurement, BOQ, supplier order, commission entries.
- [src/services/tenderService.ts](src/services/tenderService.ts:24): tender-to-BOQ handoff.
- [src/services/agents/tenderAgent.ts](src/services/agents/tenderAgent.ts:7): BOQ verification enhancement.
- [src/lib/api-router.ts](src/lib/api-router.ts:295): supplier routes and server-side credentials.
- [src/services/financialLedgerService.ts](src/services/financialLedgerService.ts:32): commission summaries.
- [src/services/geminiService.ts](src/services/geminiService.ts:76): agent roster and provider integration.
- [src/components/AdminDashboard.tsx](src/components/AdminDashboard.tsx:43): provider and agent management UI.

## Validation steps

- Run [`npm run lint`](package.json:15).
- Add procurement service tests with supplier adapter stubs that do not call external APIs.
- Add agent wrapper tests under [src/services/__tests__/workflowAgents.test.ts](src/services/__tests__/workflowAgents.test.ts).
- Add server route tests for missing credential and invalid supplier payload paths.
- Verify supplier API keys are not prefixed with VITE and not available to browser bundles.

## Handoff points

- Contractor dashboard phase consumes procurement order and BOQ components.
- Admin maintenance phase consumes commission reporting and supplier health monitoring.
- Deployment phase adds production supplier credentials and release gates.

