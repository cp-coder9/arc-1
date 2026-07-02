# Implementation Plan:

## Overview

Implementation of the Town Planning & Land Development Workflow feature module for Module 4 (Compliance + Municipal Readiness). Tasks are ordered by dependency — foundational services first, then composite services that depend on them, followed by adapters, API layer, and UI.

## Tasks

- [x] 1. Create feature module scaffolding and core types
  - [x] 1.1 Create directory structure: `src/features/town-planning/{services,adapters,components,__tests__}`
  - [x] 1.2 Create `types.ts` with all type definitions (ApplicationType, ApplicationStage, LandUseApplication, PropertyIntelligence, ZoningParameters, conditions, SDP, subdivision, appeal, municipality, checklist, access control types)
  - [x] 1.3 Create `schemas.ts` with Zod schemas for all input validation (CreateApplicationParams, ConditionInput, CommentInput, MunicipalityProfileInput, etc.)
  - [x] 1.4 Create `index.ts` barrel export
  - [x] 1.5 Create `AGENTS.md` for the feature module

- [x] 2. Implement working day and deadline utilities
  - [x] 2.1 Create `services/dateUtils.ts` with `addWorkingDays()`, `isWorkingDay()`, `getPublicHolidays()` for South African calendar
  - [x] 2.2 Implement SA public holiday list (fixed dates + calculated Easter-based dates)
  - [x] 2.3 Implement advertising period calculation (calendar days) and appeal deadline calculation (180 days)
  - [x] 2.4 Write unit tests covering year boundaries, holiday periods, and leap years

- [x] 3. Implement access control service
  - [x] 3.1 Create `services/accessControl.ts` with `checkPermission()` and `getEffectivePermissions()`
  - [x] 3.2 Define role-action permission matrix constant (town_planner, land_surveyor, architect/bep, client/developer, admin/platform_admin)
  - [x] 3.3 Implement project membership check via Firestore project team lookup
  - [x] 3.4 Implement multi-role union logic (least restrictive per feature)
  - [x] 3.5 Write property-based tests for access control (Property 10)
  - [x] 3.6 Write unit tests for each role's specific permissions and edge cases

- [x] 4. Implement municipality configuration service
  - [x] 4.1 Create `services/municipalityConfig.ts` with CRUD operations (create, get, update, list)
  - [x] 4.2 Implement `getRequirementsForApplicationType()` returning forms, documents, additional fields, and SDP components
  - [x] 4.3 Implement Firestore persistence to `municipalityProfiles/{id}` collection
  - [x] 4.4 Integrate audit trail recording on profile updates
  - [x] 4.5 Enforce role-based editability (town_planner, admin, platform_admin only)
  - [x] 4.6 Write unit tests for CRUD operations and validation

- [ ] 5. Implement application engine — creation and validation
  - [x] 5.1 Create `services/applicationEngine.ts` with `createApplication()` method
  - [x] 5.2 Implement Zod-based validation for mandatory fields per application type (base + type-specific)
  - [x] 5.3 Implement unique reference number generation (format: `TP-{projectShort}-{seq}`)
  - [x] 5.4 Implement initial status assignment (preparation) and Firestore persistence
  - [x] 5.5 Implement audit trail creation on successful creation
  - [x] 5.6 Implement Project Passport write via passport adapter
  - [x] 5.7 Implement support for multiple concurrent applications per project
  - [x] 5.8 Write property-based tests for creation invariants (Property 5) and validation rejection (Property 4)
  - [x] 5.9 Write unit tests for each application type's field requirements

- [x] 6. Implement workflow tracker — state machine and transitions
  - [x] 6.1 Create `services/workflowTracker.ts` with `transitionStage()` implementing the state machine
  - [x] 6.2 Define permitted transitions constant (preparation→submission→...→decision→conditions_compliance, any→withdrawn)
  - [x] 6.3 Implement stage-specific metadata capture (submission date, municipal ref, acknowledgement, advertising dates, hearing, decision)
  - [x] 6.4 Implement deadline calculation (15 Working_Days acknowledgement, advertising period from config)
  - [x] 6.5 Implement overdue detection comparing current date against municipality typical processing times
  - [x] 6.6 Integrate Action Centre adapter for deadline surfacing (hearing calendar at 14, 7, 1 days)
  - [x] 6.7 Integrate audit adapter for immutable transition records
  - [x] 6.8 Implement decision outcome handling (trigger conditions register, surface refusal, record deferral)
  - [x] 6.9 Write property-based tests for state machine (Property 1) and audit trail (Property 13)
  - [x] 6.10 Write unit tests for each stage transition's metadata requirements

- [x] 7. Implement property intelligence register
  - [x] 7.1 Create `services/propertyRegister.ts` with CRUD operations for property data
  - [x] 7.2 Implement field-level update with audit trail (field, old/new value, actor, timestamp)
  - [x] 7.3 Implement restrictive conditions sub-collection management
  - [x] 7.4 Implement servitudes sub-collection management
  - [x] 7.5 Implement surveyor linking (name + PLATO registration number)
  - [x] 7.6 Implement `exposeZoningToComplianceHub()` via compliance hub adapter
  - [x] 7.7 Enforce role-based editability (town_planner, land_surveyor, architect, bep, platform_admin)
  - [x] 7.8 Write unit tests for CRUD, field audit, and role enforcement

- [x] 8. Implement comment and objection register
  - [x] 8.1 Create `services/commentRegister.ts` with registration, status update, and response capture
  - [x] 8.2 Implement comment status state machine (received → reviewed → response_prepared → addressed)
  - [x] 8.3 Implement late submission detection (dateReceived > advertisingEndDate → isLateSubmission = true)
  - [x] 8.4 Implement summary count calculation (supports, neutral, objections, addressed)
  - [x] 8.5 Implement Action Centre alert for unreviewed objections when comment period expires
  - [x] 8.6 Integrate audit trail on objection registration
  - [x] 8.7 Write property-based tests for late flagging (Property 8)
  - [x] 8.8 Write unit tests for response capture, summary counts, and alert logic

- [x] 9. Implement conditions of approval register
  - [x] 9.1 Create `services/conditionsRegister.ts` with condition CRUD and status transitions
  - [x] 9.2 Implement condition status state machine (outstanding → in_progress → fulfilled/waived, no reverse)
  - [x] 9.3 Implement evidence requirement enforcement (fulfilled requires ≥1 evidence doc)
  - [x] 9.4 Implement waiver requirement enforcement (waived requires reference + reason)
  - [x] 9.5 Implement deadline monitoring with Action Centre warnings at 30, 14, 7 days
  - [x] 9.6 Implement overdue marking when deadline passes without fulfillment
  - [x] 9.7 Implement `isConditionsCompliant()` returning true only when all fulfilled/waived
  - [x] 9.8 Implement Project Passport update when all conditions complete
  - [x] 9.9 Implement Municipal Submission Readiness exposure via readiness adapter
  - [x] 9.10 Write property-based tests for state machine (Property 2), conditional transitions (Property 6), completeness (Property 7)
  - [x] 9.11 Write unit tests for deadline alerts, overdue marking, and summary calculation

- [ ] 10. Implement SDP engine
  - [x] 10.1 Create `services/sdpEngine.ts` with SDP initiation, checklist management, and stage transitions
  - [x] 10.2 Implement municipality-specific checklist generation (site layout, engineering, landscaping, stormwater, parking + config extras)
  - [x] 10.3 Implement SDP checklist item status transitions (not_started → in_progress → complete, no complete → not_started)
  - [x] 10.4 Implement drawing/document linking requirement for "complete" status
  - [x] 10.5 Implement SDP stage state machine (preparation → submitted → under_review → approved/amendments/rejected)
  - [x] 10.6 Implement SPLUMA approval prerequisite check before submission
  - [x] 10.7 Implement decision recording and Project Passport update on SDP approval
  - [x] 10.8 Implement Action Centre alert on rejection
  - [x] 10.9 Implement readiness adapter exposure
  - [x] 10.10 Write property-based tests for SDP prerequisite enforcement (Property 12)
  - [x] 10.11 Write unit tests for checklist generation and decision handling

- [ ] 11. Implement subdivision and surveyor integration
  - [x] 11.1 Create `services/subdivisionEngine.ts` with subdivision record creation and management
  - [x] 11.2 Implement surveyor instruction document generation (scope, property ref, layout, conditions)
  - [x] 11.3 Implement SG diagram state machine (instruction_issued → survey_in_progress → diagram_prepared → diagram_lodged → approved/rejected)
  - [x] 11.4 Implement title deed endorsement state machine (pending → lodged → registered/rejected)
  - [x] 11.5 Implement property register update on SG diagram approval (new erf entries)
  - [x] 11.6 Implement Project Passport update when subdivision complete
  - [x] 11.7 Implement Professional Team Router trigger when no surveyor assigned
  - [x] 11.8 Implement Action Centre alerts for surveyor instructions and SG rejection
  - [x] 11.9 Write property-based tests for SG diagram state machine (Property 3)
  - [x] 11.10 Write unit tests for instruction generation and property register updates

- [x] 12. Implement appeal tracking
  - [x] 12.1 Create `services/appealTracker.ts` with appeal registration and stage transitions
  - [x] 12.2 Implement appeal stage state machine (filed → under_consideration → hearing_scheduled → decision_received, any → withdrawn)
  - [x] 12.3 Implement prescribed deadline calculation (180 calendar days or municipality-configured)
  - [x] 12.4 Implement `filedWithinPrescribedPeriod` flag and late-filing warning
  - [x] 12.5 Implement appeal outcome recording (upheld, dismissed, varied)
  - [x] 12.6 Implement Project Passport update (project under appeal, blocks building plan)
  - [x] 12.7 Implement audit trail for all appeal stage transitions
  - [x] 12.8 Write property-based tests for appeal deadline (Property 9) and state machine (Property 3)
  - [x] 12.9 Write unit tests for late-filing warning, outcome recording, and passport update

- [x] 13. Implement document checklist service
  - [x] 13.1 Add `generateDocumentChecklist()` to applicationEngine combining standard + municipality-specific items
  - [x] 13.2 Implement standard items for all types (app form, title deed, SG diagram, POA, payment proof, memorandum)
  - [x] 13.3 Implement type-specific additions (rezoning/departure: SDP + impact assessments; subdivision: layout + surveyor report)
  - [x] 13.4 Implement checklist item status tracking (required → uploaded → required for replacement, required → not_applicable)
  - [x] 13.5 Implement document linking with Documents module registration
  - [x] 13.6 Implement completeness indicator (total, uploaded, outstanding, not_applicable)
  - [x] 13.7 Implement submission warning for outstanding items with confirmation override
  - [x] 13.8 Write unit tests for checklist generation, status transitions, and completeness

- [x] 14. Implement sequential dependency enforcement
  - [x] 14.1 Create `services/sequentialDependency.ts` with `checkReadiness()` evaluating full chain
  - [x] 14.2 Implement SPLUMA prerequisite check (decision approved + conditions complete)
  - [x] 14.3 Implement SDP prerequisite check (SDP approved)
  - [x] 14.4 Implement blocking logic with specific error messages listing outstanding prerequisites
  - [x] 14.5 Implement "not applicable" bypass (requires motivation + property register confirmation)
  - [x] 14.6 Implement progress indicator data (SPLUMA status, conditions %, SDP status, readiness boolean)
  - [x] 14.7 Implement Project Passport update when full chain satisfied
  - [x] 14.8 Write property-based tests for readiness determination (Property 11)
  - [x] 14.9 Write unit tests for each state combination and bypass logic

- [x] 15. Implement integration adapters
  - [x] 15.1 Create `adapters/passportAdapter.ts` — planning status, decision, conditions % writes
  - [x] 15.2 Create `adapters/riskAdapter.ts` — planning blocker risk events (high severity)
  - [x] 15.3 Create `adapters/actionCentreAdapter.ts` — deadlines, notifications, calendar events
  - [x] 15.4 Create `adapters/auditAdapter.ts` — immutable audit records
  - [x] 15.5 Create `adapters/documentAdapter.ts` — controlled document registration
  - [x] 15.6 Create `adapters/complianceHubAdapter.ts` — zoning parameter feed
  - [x] 15.7 Create `adapters/readinessAdapter.ts` — Municipal Submission Readiness updates
  - [x] 15.8 Create `adapters/teamRouterAdapter.ts` — professional appointment triggers
  - [x] 15.9 Implement retry logic (3 attempts, 60s window) with failed-sync alert on exhaustion
  - [x] 15.10 Write integration tests for each adapter with mocked external interfaces

- [ ] 16. Implement API routes
  - [x] 16.1 Create `src/features/town-planning/router.ts` as modular Express Router
  - [x] 16.2 Implement authentication middleware (Firebase token verification)
  - [x] 16.3 Implement access control middleware (checkPermission before each handler)
  - [x] 16.4 Implement application endpoints (POST/GET/PATCH applications, POST transition)
  - [x] 16.5 Implement comment/objection endpoints (POST/GET/PATCH)
  - [x] 16.6 Implement conditions endpoints (POST/GET/PATCH)
  - [x] 16.7 Implement document checklist endpoints (GET/PATCH)
  - [x] 16.8 Implement appeal endpoints (POST/GET/PATCH)
  - [x] 16.9 Implement property intelligence endpoints (GET/PATCH/POST sub-resources)
  - [x] 16.10 Implement SDP endpoints (POST/GET/PATCH transitions)
  - [x] 16.11 Implement subdivision endpoints (GET/POST transitions)
  - [x] 16.12 Implement municipality config endpoints (GET/POST/PATCH)
  - [x] 16.13 Implement dependency status endpoint (GET)
  - [x] 16.14 Register router in main api-router.ts under `/api/town-planning`
  - [x] 16.15 Write integration tests for auth, authorization, and request validation

- [ ] 17. Implement UI — dashboard, navigation, and disclaimer
  - [~] 17.1 Create `components/TownPlanningDashboard.tsx` with tabs (Applications, Property, SDP, Subdivision, Config)
  - [~] 17.2 Create `components/DisclaimerBanner.tsx` — persistent non-dismissible advisory with blocking overlay on failure
  - [~] 17.3 Create `components/DependencyProgressBar.tsx` — sequential dependency visual indicator
  - [~] 17.4 Register tool in navigation config under Compliance Hub with role visibility
  - [~] 17.5 Implement role-based tab visibility
  - [~] 17.6 Write component tests for disclaimer rendering and role visibility

- [ ] 18. Implement UI — application management components
  - [~] 18.1 Create `components/ApplicationWizard.tsx` — multi-step form with type selection and validation
  - [~] 18.2 Create `components/WorkflowTimeline.tsx` — stage progression visual with deadline indicators
  - [~] 18.3 Create `components/DocumentChecklistPanel.tsx` — status badges, upload triggers, completeness
  - [~] 18.4 Implement type-specific form sections (rezoning, departure, subdivision, removal)
  - [~] 18.5 Implement submission confirmation dialog with outstanding items warning
  - [~] 18.6 Write component tests for wizard validation and timeline rendering

- [ ] 19. Implement UI — register and panel components
  - [~] 19.1 Create `components/PropertyRegisterPanel.tsx` — display, pending indicators, inline edit
  - [~] 19.2 Create `components/ConditionsPanel.tsx` — conditions list, deadline countdowns, evidence upload, summary
  - [~] 19.3 Create `components/CommentRegisterPanel.tsx` — comment list, type filters, response capture, late flag
  - [~] 19.4 Create `components/SDPChecklistPanel.tsx` — checklist status, drawing linking, stage progression
  - [~] 19.5 Create `components/SubdivisionPanel.tsx` — SG diagram stages, surveyor instruction display
  - [~] 19.6 Create `components/AppealPanel.tsx` — appeal lifecycle, deadline warning, outcome recording
  - [~] 19.7 Create `components/MunicipalityConfigPanel.tsx` — profile editor with guide notice
  - [~] 19.8 Write component tests for key interactions

- [ ] 20. End-to-end workflow integration tests
  - [~] 20.1 E2E: Rezoning creation → submission → decision → conditions → compliance complete → passport updated
  - [~] 20.2 E2E: Subdivision → surveyor instruction → SG diagram → approval → property register update
  - [~] 20.3 E2E: Refusal → appeal → resolve → passport reflects resolution
  - [~] 20.4 E2E: Sequential dependency — readiness blocked until SPLUMA + SDP approved
  - [~] 20.5 E2E: Role-based access — each role limited to permitted actions
  - [~] 20.6 Verify all adapter integrations fire with correct payloads

## Task Dependency Graph

```json
{
  "waves": [
    {
      "name": "Foundation",
      "tasks": [1, 2],
      "description": "Core types, schemas, and date utilities"
    },
    {
      "name": "Core Services",
      "tasks": [3, 4, 7, 15],
      "description": "Access control, municipality config, property register, adapters"
    },
    {
      "name": "Application Layer",
      "tasks": [5],
      "description": "Application engine with creation and validation"
    },
    {
      "name": "Workflow Services",
      "tasks": [6, 8, 9, 13],
      "description": "Workflow tracker, comments, conditions, document checklist"
    },
    {
      "name": "Composite Services",
      "tasks": [10, 11, 12, 14],
      "description": "SDP engine, subdivision, appeals, sequential dependency"
    },
    {
      "name": "API Layer",
      "tasks": [16],
      "description": "Express routes with auth and access control middleware"
    },
    {
      "name": "UI Layer",
      "tasks": [17, 18, 19],
      "description": "Dashboard, application management, and register panels"
    },
    {
      "name": "Integration Testing",
      "tasks": [20],
      "description": "End-to-end workflow tests"
    }
  ]
}
```

## Notes

- All services are pure TypeScript with no UI dependencies — testable with Vitest in isolation
- Property-based tests use `fast-check` library with minimum 100 iterations per property
- Adapters use dependency injection pattern for testability (mock external modules in tests)
- Municipality profiles are global (not project-scoped) to allow sharing across projects
- The feature follows the bounded module pattern at `src/features/town-planning/` per project structure conventions
- All UI components follow the Architex OS shell integration pattern (dark theme, glass cards, lucide-react icons)
- Disclaimer banner is non-dismissible and blocks interaction on render failure (Requirement 14.5)
