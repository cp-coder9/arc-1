# AGENTS.md — Project Communication Feature

## Purpose

Bounded feature module providing real-time project chat, phase-aware messaging, and communication panels for project teams. This is the primary collaboration surface where project stakeholders communicate, share decisions, and maintain an auditable record of project discourse.

## Ownership

- **Path:** `src/features/project-communications/`
- **Owner:** Frontend / Feature Development Team
- **Key files (7):** `ProjectChatApplet.tsx`, `ProjectMessageCentre.tsx`, `ProjectCommunicationPanel.tsx`, `projectCommunicationService.ts`, `phaseConfig.ts`, `types.ts`, `index.ts`

## Local Contracts

### Components

| Component | Props | Purpose |
|-----------|-------|---------|
| `ProjectChatApplet` | `ProjectChatAppletProps` | Compact inline chat widget embeddable in project dashboards |
| `ProjectMessageCentre` | `ProjectMessageCentreProps` | Full message centre with threads, search, and history |
| `ProjectCommunicationPanel` | `ProjectCommunicationPanelProps` | Side panel for contextual communication within a workspace |

### Services (`projectCommunicationService.ts`)
- `sendProjectCommunication()` — Send a message to a project thread
- `subscribeToProjectCommunications()` — Real-time subscription to all project messages
- `subscribeToProjectCommunicationsByPhase()` — Filter subscription by project phase

### Configuration (`phaseConfig.ts`)
- `PHASE_COMMUNICATION_UI_CONFIG` — UI configuration per project phase (8 stages: Brief -> Close-out)
- `getPhaseCommunicationUIConfig()` — Resolve configuration for a specific phase

### Types (`types.ts`)
- `ProjectCaptureItem` — Captured communication record
- `ProjectCommunicationRecord` — Full communication data model
- `ProjectActionRecord` — Action/decision record extracted from communication

### Integration Points
- Consumes `contextualMessagingService` from `src/navigation/` for context-aware messaging triggers
- Agent workflow can draft messages via `contextualMessageDraftService.ts` in `src/services/agentWorkflow/`
- Real-time subscriptions use Firestore snapshot listeners

## Work Guidance

- New communication features should maintain the separation between UI (component), service, config, and types
- Phase-based configuration allows adapting communication UI to each project lifecycle stage
- Subscription services must clean up listeners on component unmount
- Messages must include sender identity, timestamp, and optional phase/workspace context
- All exports go through `index.ts` barrel

## Verification

- `npm test -- src/services/__tests__/projectCommunicationCentreService.test.ts` — tests the underlying service
- `npm test -- src/components/__tests__/projectCommunicationCentrePage.static.test.ts` — UI rendering tests
- Component tests should validate phase-aware UI rendering

## Child DOX Index

No child AGENTS.md files exist below this directory.
