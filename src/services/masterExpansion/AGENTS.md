# AGENTS.md — Master Product Expansion

## Purpose

Domain/service layer for the master product expansion pack — orchestrating product modules, workspace navigation, project lifecycle engine, risk engine, project passports, and the supporting service adapters. This is the architectural backbone that defines what product modules exist, how they evolve through project phases, and how they surface in the UI.

## Ownership

- **Path:** `src/services/masterExpansion/`
- **Owner:** Platform Architecture Team
- **Key files (16):** `moduleRegistry.ts`, `navigationConfig.ts`, `projectLifecycleEngine.ts`, `riskEngineService.ts`, `projectPassportService.ts`, `inboxEventService.ts`, `agentRecommendationService.ts`, `financeControlService.ts`, `knowledgeHubService.ts`, `marketplaceService.ts`, `procurementService.ts`, `siteExecutionService.ts`, `documentIntelligenceService.ts`, `masterExpansionExample.ts`, `index.ts`
- **Module key:** `master_product_expansion` (barrel export via `index.ts`)

## Local Contracts

### Module Registry (`moduleRegistry.ts`)
- `productModuleRegistry` — Central registry of all product module definitions
- `modulesForPhase` — Filter modules applicable to a given project phase
- Modules defined by: key, label, description, phase, roles, dependencies

### Navigation Config (`navigationConfig.ts`)
- `sidebarZones` — Sidebar zone definitions per role and phase
- `workspaceRoutes` — Route definitions for all workspaces
- `navigationZonesForRole` — Filter navigation by user role
- `workspaceRoutesForPhase` — Filter routes by project phase
- `workspaceRoutesForContext` — Context-aware route resolution

### Lifecycle & Risk
- `projectLifecycleEngine.ts` — Multi-phase project lifecycle state machine, phase transitions, readiness evaluation
- `riskEngineService.ts` — Risk finding detection, scoring, and mitigation recommendations

### Project Passport (`projectPassportService.ts`)
- Accumulates project metadata, team appointments, completion status
- Provides `ProjectPassportSummary` — single source of truth for project state

### Service Adapters
Simple adapters that provide uniform access patterns:
- `agentRecommendationService.ts`, `financeControlService.ts`, `inboxEventService.ts`, `knowledgeHubService.ts`, `marketplaceService.ts`, `procurementService.ts`, `siteExecutionService.ts`, `documentIntelligenceService.ts`

## Work Guidance

- New product modules must register in `moduleRegistry.ts` and add navigation entries in `navigationConfig.ts`
- Lifecycle phase transitions must pass through the engine in `projectLifecycleEngine.ts`
- Risk findings must follow the `RiskFinding` type schema
- Service adapters should remain thin — business logic belongs in the domain-specific service directories
- Reference `masterExpansionExample.ts` for integration patterns

## Verification

- Test coverage integrated into broader `npm test` suite
- Lifecycle tests in `src/services/__tests__/projectLifecycleEngine.test.ts` (in parent service tests)
- Risk engine tests in `src/services/__tests__/riskEngineService.test.ts`

## Child DOX Index

No child AGENTS.md files exist below this directory.
