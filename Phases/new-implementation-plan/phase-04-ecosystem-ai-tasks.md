# Phase 4 Tasks — Procurement Ecosystem and AI Orchestrator Refinement

| Priority | Task | Complexity estimate | Dependencies | Completion criteria |
|---|---|---:|---|---|
| P0 | Define BOQ, supplier product, material order, and commission types in [src/types.ts](src/types.ts:810) | M | Phase 2 ledger types | Types reuse bid line items where practical and include audit/status metadata |
| P0 | Create procurement service adapter contract | M | Supplier API research | Service supports product search, quote request, order draft, and manual export fallback |
| P0 | Add server-side procurement API route plan in [src/lib/api-router.ts](src/lib/api-router.ts:295) | L | Adapter contract | Routes validate auth, project access, payload, and credentials without exposing keys |
| P1 | Add affiliate commission ledger entry handling | M | Financial ledger extension | Commissions are typed separately from escrow and platform fees |
| P1 | Extend workflow agent roles in [src/types.ts](src/types.ts:327) | S | Existing workflow agents | Proposal, design coordination, municipal, and payment roles are typed and stage-mapped |
| P1 | Add missing workflow agent wrappers | L | Role extension | Wrappers use existing guardrails and fail gracefully if LLM config is unavailable |
| P1 | Add Anthropic provider strategy | M | Existing provider config | Either direct provider is implemented server-side or OpenRouter Anthropic path is documented and tested |
| P2 | Add procurement and workflow agent tests | L | Services | Tests cover adapter fallback, BOQ mapping, commission logging, and agent outputs |

