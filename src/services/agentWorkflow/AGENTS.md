# AGENTS.md — Agent Workflow Orchestration

## Purpose

Core orchestration subsystem that manages agent identity, project lifecycle events, user agent profiles, recommendation policies, approval gates, audit trails, and system governance. This is the runtime backbone that lets AI agents act within tenant-scoped projects with proper identity, monitoring, and event routing.

## Ownership

- **Path:** `src/services/agentWorkflow/`
- **Owner:** Agent Engineering / Platform Core Team
- **Key files (20+):** `agentIdentityService.ts`, `agentService.ts`, `agentMonitoringService.ts`, `agentMemoryBoundaryService.ts`, `agentOrchestrationE2E.ts`, `userAgentService.ts`, `projectAgentService.ts`, `systemGovernanceAgentService.ts`, `eventRoutingService.ts`, `approvalGateService.ts`, `auditTrailService.ts`, `recommendationPolicyService.ts`, `inboxEventAdapter.ts`, `projectRecordAdapter.ts`, `contextualMessageDraftService.ts`
- **Module key:** `agent_orchestration_core` (barrel export via `index.ts`)

## Local Contracts

### Subsystem Boundaries

| Service | Responsibility |
|---------|---------------|
| `agentIdentityService` | Agent creation, capability registry, tenant scoping, role-to-capability mapping |
| `agentService` | Core agent lifecycle: create, dispatch, result handling |
| `agentMonitoringService` | Runtime observability, success/failure tracking |
| `agentMemoryBoundaryService` | Per-agent memory isolation and context limits |
| `userAgentService` | Per-user agent profiles, preference learning, activity tracking |
| `projectAgentService` | Per-project agent state, phase transitions, record accumulation |
| `systemGovernanceAgentService` | Cross-tenant governance, policy enforcement, compliance checks |
| `eventRoutingService` | Event normalization and dispatch to subscribed agents |
| `approvalGateService` | Human-in-the-loop gate management, escalation policies |
| `auditTrailService` | Immutable audit records for all agent actions |
| `recommendationPolicyService` | Recommendation ranking, filtering, and suppression rules |
| `inboxEventAdapter` | Normalize external inbox events into agent-workflow events |
| `projectRecordAdapter` | Normalize project records into agent-workflow events |
| `contextualMessageDraftService` | AI-generated draft messages for project communications |

### Contract Rules
- All services must export typed function signatures (no `any` return types)
- Events must flow through `agentEventNormalizer.ts` before reaching agents
- Tenant scope validation (`validateTenantScope`, `filterAgentsByTenant`) must be called before any cross-tenant operation
- Agent capabilities must be registered via `getCapabilitiesForRole` / `getDefaultCapabilities`
- Audit records must be created for every state-changing agent action

## Work Guidance

- New orchestration services should export via `index.ts` under `agent_orchestration_core`
- Use `agentOrchestrationE2E.ts` as reference for orchestrating multi-agent workflows
- Agent monitoring must emit both success and failure telemetry
- Approval gates must support configurable escalation tiers and timeouts
- All inbox events must pass through `inboxEventAdapter.ts` normalization before processing
- Test new services in `src/services/agentWorkflow/__tests__/`

## Verification

- `npm test` covers all `src/services/agentWorkflow/__tests__/*.test.ts` files
- Key test files: `AgentService.test.ts`, `agentIdentityService.test.ts`, `agentMemoryBoundaryService.test.ts`, `agentMonitoringService.test.ts`, `approvalGateService.test.ts`, `auditTrailService.test.ts`, `eventRoutingService.test.ts`, `recommendationPolicyService.test.ts`, `systemGovernanceAgentService.test.ts`, `userAgentService.test.ts`, `projectAgentService.test.ts`, `inboxEventAdapter.test.ts`, `projectRecordAdapter.test.ts`, `contextualMessageDraftService.test.ts`

## Child DOX Index

No child AGENTS.md files exist below this directory.
