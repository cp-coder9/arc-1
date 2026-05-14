# Phase 4 PRD — Procurement Ecosystem and AI Orchestrator Refinement

## Goal

Extend procurement and AI workflows for material supplier integration, Builders Warehouse-style procurement, affiliate tracking, workflow agent coverage, and LLM provider flexibility without duplicating the existing tender, construction, and compliance agent systems.

## Current codebase grounding

- Tender packages, bids, and bid comparison already exist in [src/services/tenderService.ts](src/services/tenderService.ts:24), [src/services/bidComparisonService.ts](src/services/bidComparisonService.ts:11), and [src/services/agents/tenderAgent.ts](src/services/agents/tenderAgent.ts:7).
- Construction monitoring already exists in [src/services/agents/constructionAgent.ts](src/services/agents/constructionAgent.ts:8).
- Workflow agents currently include briefing, matching, tender, and construction only via [`WorkflowAgentRole`](src/types.ts:327); proposal, design coordination, municipal, and payment agents are missing.
- Compliance orchestrator agents are extensive in [src/services/geminiService.ts](src/services/geminiService.ts:76), and should not be replaced.
- LLM providers include gemini, openai, openrouter, and nvidia in [`LLMProvider`](src/types.ts:373); Anthropic can already be reached through OpenRouter in [src/components/AdminDashboard.tsx](src/components/AdminDashboard.tsx:69), but not as a first-class provider.
- Supplier API env vars and procurement service do not exist.

## Scope

In scope:

- Procurement service abstraction for suppliers, BOQ mapping, quote/cart requests, and affiliate commission tracking.
- Data models for bill of quantities, material order, supplier product, and affiliate commission ledger entries.
- AI workflow role expansion to cover proposal, design coordination, municipal, and payment agents.
- LLM provider strategy for Anthropic direct support or documented OpenRouter usage.

Out of scope:

- Committing to a supplier API without access credentials and terms.
- Rewriting existing compliance orchestration.
- Replacing existing tender and construction components.

## Requirements

1. Supplier integration must be adapter-based and support mock-disabled production behavior if no credentials exist.
2. Material order financial effects must be ledgered as affiliate commissions, not mixed with escrow balances.
3. BOQ mapping must reuse tender bid line item concepts where possible.
4. New workflow agents must be stage-aware and use existing guardrails from [src/services/geminiService.ts](src/services/geminiService.ts:31).
5. LLM hot-swapping must preserve server-side secret handling through [src/lib/api-router.ts](src/lib/api-router.ts:98).

## Acceptance criteria

- A procurement service contract is defined before supplier-specific API calls.
- Supplier credentials are server-only and absent from [vite.config.ts](vite.config.ts).
- New workflow agent roles are mapped to [`PROJECT_STAGE_ORDER`](src/types.ts:738).
- Admin can configure or seed new agents using existing agent management in [src/components/AdminDashboard.tsx](src/components/AdminDashboard.tsx:1001).
- Ledger commission entries remain separate from platform fee and escrow entries.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Supplier API unavailable or closed | High | Build adapter and manual export fallback first |
| Procurement data duplicates tender line items | Medium | Reuse bid and BOQ type concepts where possible |
| Provider hot-swap leaks API keys to browser | High | Keep provider calls server-side via [src/lib/api-router.ts](src/lib/api-router.ts:607) |

## Dependencies

- Phase 2 ledger event extensions.
- Existing tender and construction services.
- Existing LLM proxy and agent management.

