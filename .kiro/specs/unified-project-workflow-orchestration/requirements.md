# Requirements Document

## Introduction

Architex today gives each of its 17 user roles its own dashboards (39 `*Dashboard.tsx` pages), its own standalone tools (54+ entries in `standaloneToolRegistry.ts`), and its own slices of collaboration, timelines, and project-programme data. The result is a set of disparate tools that do not consistently share state: an architect's design decision, an engineer's design input, a quantity surveyor's cost position, a town planner's zoning status, and a site manager's build progress can each live in separate views without a single, reconciled picture of the project.

This feature is the **integration and orchestration layer** that unifies those disparate tools into one workflow with **one source of truth per project**. It builds directly on the existing Pack 2 Project Passport & Lifecycle Engine (`services/lifecycleTypes.ts`, `lifecycleDefinitions.ts`, `lifecycleEngine.ts`, `projectPassportService.ts`, `riskEngine.ts`, `inboxEventAdapter.ts`, `agentRecommendationService.ts`) and connects to existing packs (Pack 3 Documents & Drawing Intelligence, Pack 5 Appointment & Kickoff, Pack 8 Finance/Escrow, Pack 9 Site Execution, Pack 15 Analytics). The objective is that every role dashboard reads from and writes to a single shared project record, cross-role handoffs are governed and visible, one unified programme/timeline is shared across all roles, the Inbox / Action Centre drives the next step of the workflow, and Google Gemini multi-agent AI guidance is embedded in every dashboard, tool, and workflow step to surface blockers and recommend the next best action.

This is an EXTEND/INTEGRATE effort over the existing React 19 + TypeScript + Vite + Firebase + Express + Gemini stack, not a greenfield rebuild.

### Scope guardrails

- The orchestration layer is **decision-support and coordination only**. It never performs autonomous statutory certification, never issues a professional sign-off on a human's behalf, and never moves money.
- All sensitive actions (professional certification, municipal submission, payment release, closeout acceptance, signature) remain behind the existing human approval gates (`HumanGate` in `lifecycleTypes.ts`).
- The single source of truth is the existing `ProjectRecord` / `ProjectPassport` envelope; this feature reconciles and routes that state, it does not replace role-specific tool logic.
- Tenant isolation, POPIA data-protection obligations, and audit-trail requirements apply to every cross-role read, write, and AI recommendation.
- South African regulatory context applies: SANS building standards, professional councils (SACAP, ECSA, SACQSP, SACPLAN, SACPCMP, SACLAP, SAGC), POPIA, FICA, B-BBEE, and PayFast as the payment provider.

## Glossary

- **Orchestration_Layer**: The overall system under design — the integration layer that unifies role dashboards, tools, timelines, and AI guidance around one project source of truth.
- **Project_Source_Of_Truth**: The single reconciled project state, expressed through the existing `ProjectPassport` and its underlying `ProjectRecord` set, that every role dashboard and tool reads from and writes to.
- **Project_Record**: An existing `ProjectRecord<TPayload>` envelope (tenantId, projectId, phase, moduleKey, recordType, status, payload, approvals, audit, linkedRecordIds) as defined in `services/lifecycleTypes.ts`.
- **Project_Passport**: The assembled project health card produced by `projectPassportService.buildProjectPassport()`, summarising phase, appointments, approval/document/financial status, lifecycle evaluation, and risk level.
- **Role_Dashboard**: Any of the role-specific dashboard surfaces (`*Dashboard.tsx`) presented to one of the 17 user roles.
- **Lifecycle_Phase**: One of the defined project phases in `lifecycleDefinitions.ts` (onboarding, feasibility, appointment, concept_design, design_development, municipal_submission, tender_procurement, construction_execution, closeout), aligned to the published 8-stage lifecycle.
- **Cross_Role_Handoff**: A governed transfer of responsibility for a project step from one role to another, producing a tracked obligation for the receiving role.
- **Unified_Programme**: The single shared project timeline/programme that all roles view, derived from the project's records, milestones, and dependencies.
- **Programme_Task**: A single scheduled item on the Unified_Programme with a responsible role, start, finish, dependencies, and status.
- **Action_Centre**: The existing Inbox / Action Centre that surfaces `WorkflowEvent` items requiring user action, driven by `inboxEventAdapter`.
- **Workflow_Event**: An existing `WorkflowEvent` (approval_required, municipal_blocker, payment_due, task_overdue, risk_detected, project_phase_changed) routed to assigned roles.
- **AI_Guide**: The embedded Google Gemini multi-agent guidance capability that produces `AgentRecommendation` items and step-level guidance within dashboards, tools, and workflow steps.
- **Agent_Recommendation**: An existing `AgentRecommendation` (title, rationale, priority, recommended action, related route, requiresHumanApproval) produced by `agentRecommendationService`.
- **Human_Gate**: An existing `HumanGate` checkpoint (none, review, approval, signature, payment_release, municipal_submission, professional_certification, closeout_acceptance) that requires a qualified human to act before progression.
- **Audit_Service**: The existing audit-trail capability that records immutable entries for project actions.
- **Tenant**: The firm or organisation scope (`tenantId`) that bounds access to a project's data.

## Requirements

### Requirement 1: Single project source of truth

**User Story:** As any project participant, I want every role dashboard and tool to read from and write to one reconciled project record, so that all roles see the same truth instead of conflicting copies.

#### Acceptance Criteria

1. WHEN a Role_Dashboard loads a project, THE Orchestration_Layer SHALL assemble the displayed project state from the Project_Source_Of_Truth using the existing `ProjectPassport` and its linked `ProjectRecord` set, returning the assembled state within 3 seconds at the 95th percentile of load requests.
2. WHEN a role writes a change to a project artefact through a tool or dashboard, THE Orchestration_Layer SHALL persist that change as a `ProjectRecord` update within the same project's source of truth, including the actor identifier, the role, and the write time recorded as a UTC (ISO 8601) timestamp.
3. WHEN a `ProjectRecord` is updated and the write completes successfully, THE Orchestration_Layer SHALL make the updated value available to every other role's dashboard view of that project such that any load or refresh of that view initiated 2 or more seconds after the successful write returns the updated value.
4. WHERE two or more roles reference the same project fact, THE Orchestration_Layer SHALL present a single reconciled value sourced from one `ProjectRecord` rather than independent per-role copies.
5. IF a write to the Project_Source_Of_Truth fails or does not complete within 10 seconds, THEN THE Orchestration_Layer SHALL return an error indicating the save failed, SHALL leave the prior `ProjectRecord` value unchanged, and SHALL retain the submitted input so the actor can resubmit it without re-entry.
6. IF two writes to the same `ProjectRecord` are submitted concurrently, THEN THE Orchestration_Layer SHALL apply them in a serialized order and SHALL reject any write whose base `ProjectRecord` version no longer matches the current version, returning a conflict error indicating the record was modified since it was read and leaving the current value unchanged.
7. WHEN any user requests a project artefact for which the requesting user's Tenant does not match the project's `tenantId`, THE Orchestration_Layer SHALL deny the request, return an authorization error, and record the denied attempt through the Audit_Service including the actor identifier and a UTC (ISO 8601) timestamp.

### Requirement 2: Cross-dashboard data consistency

**User Story:** As a participant whose work depends on another role's output, I want a change made in one dashboard to be reflected consistently in every dependent dashboard, so that I never act on stale information.

#### Acceptance Criteria

1. WHEN a `ProjectRecord` that is referenced by more than one Role_Dashboard changes status or payload, THE Orchestration_Layer SHALL update the affected derived `ProjectPassport` summary fields (approval status, document status, financial status, current phase, risk level) so that each updated field value equals the value computed from the changed `ProjectRecord`, completing the update within 5 seconds of the change being committed.
2. WHEN a Role_Dashboard displays a value that is derived from another role's `ProjectRecord`, THE Orchestration_Layer SHALL display, adjacent to that value, the source record identifier and the source record's last-updated timestamp rendered in South African Standard Time (UTC+02:00) with date and time to the minute.
3. IF the Orchestration_Layer cannot complete the derived-field update within 5 seconds of a referenced `ProjectRecord` changing, THEN THE Orchestration_Layer SHALL retain the last successfully reconciled value, SHALL mark each affected derived value with a stale-data indicator, and SHALL raise an error indication identifying the source record that failed to propagate.
4. WHEN a `ProjectRecord` is superseded by a newer revision, THE Orchestration_Layer SHALL set the prior record's status to superseded, SHALL present only the current revision as the active value in every Role_Dashboard within 5 seconds of the supersession being committed, and SHALL retain each superseded record in immutable form for the audit trail.
5. IF a Role_Dashboard requests a `ProjectRecord` whose status is superseded, THEN THE Orchestration_Layer SHALL return the current superseding record together with the superseded record's identifier.
6. WHEN the same project is open in two or more Role_Dashboards and a derived value changes, THE Orchestration_Layer SHALL ensure that any read of that value issued from any of those dashboards more than 5 seconds after the change was committed returns the single reconciled value, identical across all of those dashboards.
7. IF two Role_Dashboards commit conflicting changes to the same `ProjectRecord` field before reconciliation completes, THEN THE Orchestration_Layer SHALL accept the change with the later commit timestamp as the reconciled value, SHALL retain the rejected change in the audit trail, and SHALL raise an error indication to the participant whose change was rejected identifying the affected record.

### Requirement 3: Governed cross-role handoffs

**User Story:** As a lead professional, I want to hand off a project step to another role with a tracked obligation, so that responsibility is explicit and nothing falls between roles.

#### Acceptance Criteria

1. WHEN a role initiates a Cross_Role_Handoff for a project step with a handoff reason of 1 to 1000 characters, THE Orchestration_Layer SHALL record the originating role, the receiving role, the related `ProjectRecord` type, and the handoff reason as a tracked obligation within 5 seconds.
2. IF a Cross_Role_Handoff is initiated with a handoff reason that is missing, empty, or exceeds 1000 characters, THEN THE Orchestration_Layer SHALL reject the handoff, SHALL NOT create a tracked obligation, and SHALL return an error indicating that the handoff reason is missing or exceeds the 1000-character limit.
3. WHEN a Cross_Role_Handoff is recorded, THE Orchestration_Layer SHALL create a Workflow_Event of type approval_required assigned to the receiving role and SHALL surface the Workflow_Event in the receiving role's Action_Centre within 5 seconds.
4. WHEN a Cross_Role_Handoff obligation passes its response-by deadline of 5 business days without resolution, THE Orchestration_Layer SHALL create a Workflow_Event of type task_overdue assigned to the receiving role and SHALL surface the Workflow_Event in the receiving role's Action_Centre within 5 seconds.
5. WHILE a Cross_Role_Handoff obligation is open, THE Orchestration_Layer SHALL display the obligation as outstanding on both the originating role's and the receiving role's project view.
6. WHEN the receiving role completes the handed-off step, THE Orchestration_Layer SHALL mark the obligation as resolved and SHALL record the resolving actor, role, and timestamp through the Audit_Service within 5 seconds.
7. IF a Cross_Role_Handoff names a receiving role that is not appointed to the project, THEN THE Orchestration_Layer SHALL reject the handoff, SHALL NOT create a tracked obligation, and SHALL return an error indicating that the receiving role is not appointed.
8. WHERE a handed-off step requires a Human_Gate of professional_certification, signature, or payment_release, THE Orchestration_Layer SHALL require the qualified receiving role to satisfy that gate and SHALL NOT allow the AI_Guide or the originating role to satisfy it on the receiving role's behalf.

### Requirement 4: Unified project programme and timeline

**User Story:** As any project participant, I want one shared project programme that shows all roles' tasks and dependencies, so that the whole team works from a single timeline instead of separate per-role schedules.

#### Acceptance Criteria

1. THE Orchestration_Layer SHALL maintain one Unified_Programme per project that contains the Programme_Tasks for all appointed roles, up to a maximum of 10,000 Programme_Tasks per Unified_Programme.
2. WHEN a Programme_Task is created or updated, THE Orchestration_Layer SHALL record the Programme_Task's responsible role, start date, finish date, status as one of (not_started, in_progress, complete), and up to 50 dependency references on other Programme_Tasks.
3. WHEN a role views the Unified_Programme, THE Orchestration_Layer SHALL display every Programme_Task for the project that the role is authorised to view within 3 seconds, identifying the responsible role for each Programme_Task.
4. WHEN a Programme_Task that is a dependency of another Programme_Task changes its finish date, THE Orchestration_Layer SHALL recompute and display the recomputed start and finish dates of the affected dependent Programme_Tasks within 5 seconds.
5. IF a Programme_Task is created or updated with a finish date earlier than its start date, THEN THE Orchestration_Layer SHALL reject the change, SHALL retain the prior persisted state of the Programme_Task, and SHALL return a validation error identifying the invalid start and finish dates.
6. IF a Programme_Task declares a dependency that would form a cycle with existing dependencies, THEN THE Orchestration_Layer SHALL reject the dependency, SHALL retain the prior persisted state of the Programme_Task, and SHALL return an error indicating that the dependency would create a cycle.
7. IF a Programme_Task declares a dependency reference to a Programme_Task that does not exist in the Unified_Programme, THEN THE Orchestration_Layer SHALL reject the dependency, SHALL retain the prior persisted state of the Programme_Task, and SHALL return an error identifying the missing dependency reference.
8. WHEN a daily overdue check finds a Programme_Task whose finish date is earlier than the current date and whose status is not complete, THE Orchestration_Layer SHALL create exactly one Workflow_Event of type task_overdue assigned to the Programme_Task's responsible role.

### Requirement 5: Action Centre drives the workflow

**User Story:** As any user, I want my Action Centre to tell me the next required action across all my projects and roles, so that the workflow guides me rather than me hunting through separate tools.

#### Acceptance Criteria

1. WHEN the Orchestration_Layer detects a project condition requiring action (missing required record, open approval, municipal blocker, payment due, overdue task, or detected risk), THE Orchestration_Layer SHALL create a corresponding Workflow_Event assigned to the responsible roles and SHALL assign that Workflow_Event one priority level from the set {Critical, High, Medium, Low}.
2. WHEN a user opens the Action_Centre, THE Orchestration_Layer SHALL display, within 3 seconds, the unresolved Workflow_Events assigned to that user's role across all of the user's active projects, ordered by priority from Critical first to Low last.
3. WHILE displaying Workflow_Events of equal priority, THE Orchestration_Layer SHALL order those Workflow_Events by due date earliest first, and for Workflow_Events with the same due date or no due date SHALL order them by creation timestamp oldest first.
4. WHEN a Workflow_Event that has a resolvable target route is displayed, THE Orchestration_Layer SHALL provide a navigation action that opens the dashboard or tool where the user can resolve that Workflow_Event.
5. WHEN the underlying condition that produced a Workflow_Event is resolved, THE Orchestration_Layer SHALL, within 60 seconds, mark that Workflow_Event as resolved and remove it from the user's outstanding action list.
6. WHERE a project may advance to the next Lifecycle_Phase only after required records are present, THE Orchestration_Layer SHALL surface each missing required record as a Workflow_Event and SHALL indicate that the Lifecycle_Phase cannot advance until all such Workflow_Events are resolved.
7. IF a Workflow_Event has no resolvable target route, THEN THE Orchestration_Layer SHALL display the Workflow_Event with its detail and SHALL indicate that no direct action route is available, rather than omitting the Workflow_Event.
8. WHEN a user opens the Action_Centre and no unresolved Workflow_Events are assigned to that user's role across the user's active projects, THE Orchestration_Layer SHALL display an indication that no outstanding actions remain.

### Requirement 6: AI guidance embedded across dashboards, tools, and workflow steps

**User Story:** As any user, I want AI guidance available within every dashboard, tool, and workflow step, so that I am walked through my part of the project and shown the next best action in context.

#### Acceptance Criteria

1. WHEN a user views a Role_Dashboard for a project, THE AI_Guide SHALL present Agent_Recommendations relevant to that user's role and that project's current Lifecycle_Phase, derived from the Project_Passport, within 3 seconds of the dashboard becoming visible.
2. WHEN a user views a Role_Dashboard for a project, THE AI_Guide SHALL limit the presented Agent_Recommendations to a maximum of 10, ordered by descending priority.
3. WHEN an Agent_Recommendation is presented, THE AI_Guide SHALL include the recommendation title, a plain-language rationale, a priority value of exactly one of High, Medium, or Low, a recommended action label, and a related navigation route.
4. WHEN a user opens a tool or workflow step, THE AI_Guide SHALL present step-level guidance describing what the step requires and the next best action for that user's role within 3 seconds of the tool or workflow step becoming visible.
5. WHEN an Agent_Recommendation would lead to a sensitive action behind a Human_Gate, THE AI_Guide SHALL mark the recommendation as requiring human approval and SHALL present it as advisory only.
6. THE AI_Guide SHALL NOT execute professional certification, municipal submission, signature, payment release, or closeout acceptance autonomously, and SHALL route every such action to the qualified human role through the corresponding Human_Gate.
7. WHEN the AI_Guide produces a recommendation or guidance for a project, THE Orchestration_Layer SHALL record the recommendation, its source context, and the timestamp through the Audit_Service.
8. WHEN the AI_Guide generates project guidance, THE AI_Guide SHALL use only data from the requesting user's Tenant and project scope.
9. IF generation of project guidance would require data outside the requesting user's Tenant or project scope, THEN THE AI_Guide SHALL exclude that out-of-scope data and SHALL produce guidance using only in-scope data.
10. IF the AI service does not return a recommendation for a project within 10 seconds, THEN THE Orchestration_Layer SHALL render the dashboard, tool, or workflow step without guidance within 3 seconds of the timeout and SHALL display an indication that guidance is temporarily unavailable without blocking the user's work.
11. IF the AI_Guide produces no applicable Agent_Recommendations for a project, THEN THE AI_Guide SHALL render the Role_Dashboard and display an indication that no recommendations are currently available.

### Requirement 7: Lifecycle-phase coordination and progression

**User Story:** As a lead professional, I want the project's phase to advance only when each phase's required outputs exist, so that downstream roles are not handed an incomplete project.

#### Acceptance Criteria

1. WHEN the Orchestration_Layer evaluates a project, THE Orchestration_Layer SHALL determine the current Lifecycle_Phase and the required record types for that Lifecycle_Phase using `lifecycleEngine.evaluateLifecycle()`.
2. WHEN every required record type for the current Lifecycle_Phase exists and each such record carries an approval status equal to "approved", THE Orchestration_Layer SHALL mark the project as eligible to advance to the next Lifecycle_Phase.
3. IF a user requests advancement to the next Lifecycle_Phase while one or more required records for the current Lifecycle_Phase are absent or carry an approval status other than "approved", THEN THE Orchestration_Layer SHALL deny the advancement, SHALL retain the project in the current Lifecycle_Phase, SHALL create no Workflow_Event, and SHALL return the list of required records that are absent or not approved.
4. IF a user requests advancement while the project is at the final Lifecycle_Phase, THEN THE Orchestration_Layer SHALL deny the advancement, SHALL retain the project in the final Lifecycle_Phase, and SHALL return an indication that no subsequent Lifecycle_Phase exists.
5. WHEN a project advances to a new Lifecycle_Phase, THE Orchestration_Layer SHALL create one Workflow_Event of type project_phase_changed assigned to each role configured as responsible for the new Lifecycle_Phase.
6. WHEN two or more advancement requests for the same project are processed concurrently, THE Orchestration_Layer SHALL create exactly one Workflow_Event of type project_phase_changed for that phase transition.
7. WHEN a project advances to a new Lifecycle_Phase, THE Orchestration_Layer SHALL record the originating Lifecycle_Phase, the destination Lifecycle_Phase, the actor, and the timestamp through the Audit_Service.

### Requirement 8: Role-aware access and governance across the unified workflow

**User Story:** As the platform, I want every cross-role read, write, and action gated by role and tenant, so that unifying the workflow does not weaken existing governance boundaries.

#### Acceptance Criteria

1. WHERE a user's role is authorised to view a project under the existing navigation and appointment rules, THE Orchestration_Layer SHALL complete the authorization decision within 2 seconds and permit that user to read the project's shared records that the role is entitled to see.
2. IF a user attempts to read a `ProjectRecord` belonging to a Tenant other than the user's own Tenant, THEN THE Orchestration_Layer SHALL deny the read, return an authorization error naming the attempted action type, the user role, and the required gate, disclose no field values of the target record, and leave the record unchanged.
3. IF a user attempts to write a `ProjectRecord` that the user's role is not authorised to modify, THEN THE Orchestration_Layer SHALL deny the write, return an authorization error naming the attempted action type, the user role, and the required gate, and leave the record unchanged.
4. WHEN a sensitive action behind a Human_Gate of professional_certification, signature, payment_release, municipal_submission, or closeout_acceptance is attempted by a role qualified for that gate, THE Orchestration_Layer SHALL complete the authorization decision within 2 seconds and permit the action.
5. IF a sensitive action behind a Human_Gate of professional_certification, signature, payment_release, municipal_submission, or closeout_acceptance is attempted by a role not qualified for that gate, THEN THE Orchestration_Layer SHALL deny the action, return an authorization error naming the attempted action type, the user role, and the required gate, and leave the target record unchanged.
6. WHEN any create, update, handoff, phase advancement, or denied action occurs in the Orchestration_Layer, THE Audit_Service SHALL record the actor identifier, actor role, action type, target record identifier, outcome of permitted or denied, and a timestamp in ISO 8601 format with timezone offset within 5 seconds of the action.
7. WHILE the Orchestration_Layer processes personal information governed by POPIA, THE Orchestration_Layer SHALL restrict access to that information to the project's Tenant and authorised roles, deny any access request from outside the project's Tenant or from an unauthorised role, and record every access attempt and denial through the Audit_Service.

### Requirement 9: Reconciliation of existing disparate tools

**User Story:** As a participant who currently uses separate per-role tools, I want those tools connected to the shared project record, so that their outputs become part of the one project truth rather than isolated results.

#### Acceptance Criteria

1. WHEN an existing standalone tool run is assigned to a project AND a matching record adapter exists for the tool's domain, THE Orchestration_Layer SHALL create one `ProjectRecord` in that project's source of truth within 5 seconds of assignment using the existing record adapters.
2. WHEN a tool output is mapped to a `ProjectRecord`, THE Orchestration_Layer SHALL set the record's phase, moduleKey, and recordType to the values defined for the tool's registered domain so that the lifecycle engine and dashboards can reference the record.
3. WHEN an existing module (Documents, Finance, Site Execution, Analytics) produces a record whose recordType is listed as required or optional for the project's current phase, THE Orchestration_Layer SHALL incorporate that record into the Project_Passport evaluation within 10 seconds of the record being produced.
4. WHERE an assigned tool output has no defined `ProjectRecord` type available in the record adapters, THE Orchestration_Layer SHALL attach the output to the project as a linked artefact labelled with an unmapped status and SHALL retain that artefact until it is mapped, rather than discarding it.
5. WHEN a record produced by one module is referenced by another module's dashboard, THE Orchestration_Layer SHALL resolve the connection through the record's `linkedRecordIds` relationships and present a single shared record instance rather than creating a duplicate record.
6. IF the Orchestration_Layer cannot map an assigned tool run to a `ProjectRecord` because of an adapter or validation failure, THEN THE Orchestration_Layer SHALL preserve the original tool output as a linked artefact with an unmapped status and surface an error indication identifying the affected tool run.

### Requirement 10: Quality, accessibility, and verification

**User Story:** As the team, I want the orchestration layer tested, type-safe, and accessible, so that unifying the workflow does not regress existing packs.

#### Acceptance Criteria

1. WHEN orchestration logic is added or modified, THE same change SHALL include unit tests that each assert a pass/fail outcome for source-of-truth reconciliation, cross-role handoff obligation lifecycle, programme dependency validation including rejection of at least one dependency cycle, lifecycle advancement gating, and tenant-scoped access denial, with at least one positive test and at least one negative test per listed area.
2. WHEN serialization logic is added for shared project state passed between modules, THE same change SHALL include round-trip tests asserting that a serialize-then-deserialize cycle reproduces the original record with identical field values, identical status, and an identical set of linked record references, including a case with an empty linked-reference set and a case with at least two linked references.
3. WHEN new UI surfaces are added to dashboards, the Action_Centre, the Unified_Programme, or AI guidance, THE Orchestration_Layer SHALL make every interactive control reachable in tab order and operable using only the keyboard, SHALL render a visible focus indicator on the control that holds keyboard focus, and SHALL expose a non-empty programmatic accessible name for each interactive control.
4. WHEN the feature is submitted for merge, THE verification suite SHALL be run and the commands `npm run lint`, `npm test`, and `npm run build` SHALL each complete with a zero exit code.
5. IF any of the commands `npm run lint`, `npm test`, or `npm run build` completes with a non-zero exit code, THEN THE Orchestration_Layer change SHALL be reported as failing verification, SHALL be blocked from merge, and SHALL leave the target branch unchanged.
6. WHEN AI guidance is added, THE same change SHALL include tests asserting that every recommendation behind a Human_Gate is flagged as requiring human approval before any action is taken and that returned guidance is restricted to records owned by the requesting Tenant, including a negative test confirming that a recommendation requested for one Tenant returns no records owned by a different Tenant.

## Non-Functional Requirements

- **Performance:** Assembling a Project_Passport view for a project with up to 200 linked records SHALL complete within 1 second on a typical client session.
- **Consistency:** A change written to the Project_Source_Of_Truth SHALL be visible to other authorised dashboards on their next load or refresh within the same user session.
- **Resilience:** WHEN the AI service is unavailable, THE Orchestration_Layer SHALL continue to present dashboards, the Action_Centre, and the Unified_Programme without AI guidance.
- **Security & governance:** No orchestration action may certify compliance, submit to a municipality, sign on a user's behalf, or release funds without satisfying the corresponding Human_Gate; all sensitive outputs carry advisory and sign-off notices and audit logging.
- **Data protection:** All cross-role data access SHALL respect tenant isolation and POPIA obligations, with access recorded through the Audit_Service.
- **Locale & jurisdiction:** South African defaults apply — ZAR currency, SANS building standards, the listed professional councils (SACAP, ECSA, SACQSP, SACPLAN, SACPCMP, SACLAP, SAGC), FICA cash-threshold reporting, B-BBEE procurement context, and PayFast as the payment provider.
