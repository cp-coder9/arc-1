# Requirements Document

## Introduction

The Town Planning Application Tracker is a workflow module within the Architex platform that manages the complete lifecycle of town planning applications in South Africa — from pre-consultation through to Record of Decision and condition fulfilment. The module supports rezoning, consent use, subdivision, consolidation, site development plan (SDP), removal of restrictive conditions, and township establishment applications. It integrates with existing Architex modules (Project Passport, SpecForge, Documents & Drawing Intelligence, Survey & Geomatics, Compliance Hub, Action Centre, and Audit Trail) and operates within the regulatory framework of SPLUMA (Spatial Planning and Land Use Management Act 16 of 2013), provincial planning legislation, and municipal by-laws.

## Glossary

- **Application_Tracker**: The Town Planning Application Tracker module within Architex that manages planning application lifecycles
- **Planning_Application**: A formal submission to a municipality requesting land use change, consent, subdivision, or other planning approval governed by SPLUMA
- **Town_Planner**: The primary user role responsible for preparing, submitting, and managing planning applications
- **Municipality_Profile**: A configurable data set defining a specific municipality's forms, processes, fees, timelines, and contact details
- **Condition_Register**: A structured record of all conditions imposed by a Record of Decision, tracking fulfilment status and deadlines
- **Public_Participation_Register**: A record of all objections, comments, and responses received during the statutory advertising period
- **Record_of_Decision (RoD)**: The formal decision document issued by a Municipal Planning Tribunal or delegated authority
- **MPT**: Municipal Planning Tribunal — the decision-making body for planning applications under SPLUMA
- **SPLUMA**: Spatial Planning and Land Use Management Act 16 of 2013 — the national framework for land use management in South Africa
- **Objection_Period**: The statutory 28-day period during which affected parties may lodge objections to a planning application
- **Appeal_Period**: The statutory 21-day period following issuance of an RoD during which an aggrieved party may lodge an appeal
- **Decision_Period**: The statutory 60-day period within which a municipality must decide on an application after close of public comment
- **SDP**: Site Development Plan — a scaled drawing showing the proposed layout and development of a site
- **Project_Passport**: The Architex central project truth module that receives status updates from all platform modules
- **SpecForge**: The Architex specification spine that converts approved conditions into project requirements
- **Compliance_Hub**: The Architex module managing municipal readiness and regulatory compliance
- **Action_Centre**: The Architex notification and task management system surfacing deadline alerts and required actions
- **Audit_Trail**: The Architex immutable event log recording all significant actions across the platform
- **Survey_Module**: The Architex Survey & Geomatics module handling post-approval survey work, SG diagrams, and title deed endorsement

## Requirements

### Requirement 1: Application Creation and Configuration

**User Story:** As a Town Planner, I want to create and configure planning applications for a project, so that I can track multiple concurrent application types through their lifecycle.

#### Acceptance Criteria

1. WHEN a Town Planner initiates a new planning application, THE Application_Tracker SHALL present application type options including rezoning, consent use, subdivision, consolidation, site development plan, removal of restrictive conditions, and township establishment
2. WHEN a Town Planner selects an application type, THE Application_Tracker SHALL load the corresponding Municipality_Profile configuration including required forms, fees, and process steps
3. WHEN multiple applications exist for a single project, THE Application_Tracker SHALL display all applications with their individual statuses and interdependencies
4. WHEN a Town Planner creates a planning application, THE Application_Tracker SHALL assign a unique reference number and record the creation event in the Audit_Trail
5. WHEN a Planning_Application is created, THE Application_Tracker SHALL write the application status to the Project_Passport

### Requirement 2: Application Lifecycle Stage Management

**User Story:** As a Town Planner, I want to progress applications through defined lifecycle stages, so that I can track where each application stands and what actions are required next.

#### Acceptance Criteria

1. THE Application_Tracker SHALL enforce the following sequential lifecycle stages for each Planning_Application: Pre-consultation, Preparation, Submission, Circulation/Advertising, Objection Response, Tribunal/Decision, Record of Decision, Appeal Period, Condition Fulfilment, and Completion
2. WHEN a Town Planner advances an application to the next stage, THE Application_Tracker SHALL validate that all required documents and actions for the current stage are complete before allowing progression
3. WHEN a stage transition occurs, THE Application_Tracker SHALL record the transition timestamp, the user who initiated the transition, and any supporting notes in the Audit_Trail
4. WHEN an application enters the Circulation/Advertising stage, THE Application_Tracker SHALL automatically calculate the Objection_Period end date based on the 28-day statutory requirement
5. WHEN an application enters the Appeal Period stage, THE Application_Tracker SHALL automatically calculate the appeal deadline based on the 21-day statutory requirement
6. WHILE an application is in the Tribunal/Decision stage, THE Application_Tracker SHALL track the 60-day Decision_Period and display remaining days

### Requirement 3: Deadline and Statutory Timeframe Management

**User Story:** As a Town Planner, I want the system to track all statutory deadlines and alert me to approaching or overdue dates, so that I can maintain compliance with SPLUMA timeframes and protect my clients' rights.

#### Acceptance Criteria

1. THE Application_Tracker SHALL maintain a deadline register for each Planning_Application containing all statutory and procedural deadlines with their due dates
2. WHEN a deadline is within 7 calendar days of expiry, THE Application_Tracker SHALL generate an approaching-deadline alert in the Action_Centre
3. WHEN a deadline has passed without the required action being recorded, THE Application_Tracker SHALL mark the deadline as overdue and escalate the alert to high priority in the Action_Centre
4. WHEN a Municipality_Profile specifies non-standard timeframes that differ from SPLUMA defaults, THE Application_Tracker SHALL use the municipality-specific timeframes for deadline calculations
5. WHEN a Town Planner requests a timeline view, THE Application_Tracker SHALL render a Gantt-style visualisation showing all application stages, their planned durations, actual progress, and critical path deadlines
6. WHEN the 60-day Decision_Period expires without a decision, THE Application_Tracker SHALL flag the application as deemed-refused per SPLUMA Section 56 and present appeal options to the Town Planner

### Requirement 4: Public Participation and Objection Management

**User Story:** As a Town Planner, I want to record and manage all public participation inputs including objections and comments, so that I can prepare comprehensive responses and maintain a complete participation record.

#### Acceptance Criteria

1. WHEN an objection or comment is received, THE Application_Tracker SHALL record the objector name, contact details, date received, grounds of objection, and supporting documentation in the Public_Participation_Register
2. WHEN a Town Planner records a response to an objection, THE Application_Tracker SHALL link the response to the original objection and record the response date
3. WHEN the Objection_Period closes, THE Application_Tracker SHALL summarise the total number of objections, comments, and responses and present a completion status for each
4. THE Application_Tracker SHALL generate a public participation summary report suitable for inclusion in tribunal submissions
5. WHEN an objection is received after the Objection_Period has closed, THE Application_Tracker SHALL flag the objection as late and require the Town Planner to decide whether to accept or reject the late submission

### Requirement 5: Municipality Profile and Configuration

**User Story:** As a Town Planner, I want to configure municipality-specific processes, forms, and fee structures, so that the system accurately reflects the requirements of each local authority I submit applications to.

#### Acceptance Criteria

1. THE Application_Tracker SHALL maintain configurable Municipality_Profile records containing municipality name, contact details, required application forms, fee schedules, process variations, and applicable land use scheme references
2. WHEN a Town Planner selects a municipality for a new application, THE Application_Tracker SHALL apply that municipality's specific process steps, required documents, and fee schedule to the application
3. WHEN a Municipality_Profile is updated, THE Application_Tracker SHALL apply the updated configuration to all future applications while preserving existing application configurations unchanged
4. WHERE a municipality requires province-specific forms mandated by provincial planning legislation, THE Application_Tracker SHALL include those forms in the municipality's document requirements
5. THE Application_Tracker SHALL provide a default Municipality_Profile based on SPLUMA national requirements that applies when no municipality-specific configuration exists

### Requirement 6: Condition Register and Fulfilment Tracking

**User Story:** As a Town Planner, I want to capture and track all conditions from a Record of Decision, so that I can ensure timely fulfilment and prevent approval lapsing.

#### Acceptance Criteria

1. WHEN a Record of Decision is received, THE Application_Tracker SHALL allow the Town Planner to capture each condition as a separate item in the Condition_Register with a description, responsible party, deadline, and fulfilment criteria
2. WHEN a condition is marked as fulfilled, THE Application_Tracker SHALL record the fulfilment date, supporting evidence reference, and the user who confirmed fulfilment
3. WHEN a condition has a deadline, THE Application_Tracker SHALL generate deadline alerts in the Action_Centre following the same escalation pattern as statutory deadlines
4. WHEN all conditions precedent are fulfilled, THE Application_Tracker SHALL update the application status to reflect that the approval is now effective and notify the Project_Passport
5. THE Application_Tracker SHALL classify conditions as either conditions precedent (must be met before approval takes effect) or ongoing conditions (must be maintained during operation)
6. WHEN conditions are captured, THE Application_Tracker SHALL write condition data to SpecForge as project requirements for downstream tracking

### Requirement 7: Document Management Integration

**User Story:** As a Town Planner, I want planning application documents to integrate with the Architex document system, so that all application materials are version-controlled and accessible from a single source.

#### Acceptance Criteria

1. WHEN a Planning_Application is created, THE Application_Tracker SHALL generate a document checklist based on the application type and Municipality_Profile requirements
2. WHEN a document is uploaded against an application, THE Application_Tracker SHALL register the document in the Documents & Drawing Intelligence module with appropriate metadata including application reference, document type, and version
3. WHEN a required document is missing at stage transition, THE Application_Tracker SHALL identify the missing document and prevent stage advancement until the document is provided or explicitly waived by the Town Planner
4. THE Application_Tracker SHALL support document types including motivation reports, site plans, SDP drawings, public notices, proof of advertising, power of attorney, title deeds, zoning certificates, and municipal application forms
5. WHEN a document is superseded by a new version, THE Application_Tracker SHALL maintain the revision history and mark the previous version as superseded

### Requirement 8: Appeal Management

**User Story:** As a Town Planner, I want to manage the appeal process when a decision is challenged, so that I can track appeal progress and protect my client's interests within statutory timeframes.

#### Acceptance Criteria

1. WHEN an appeal is lodged against a Record of Decision, THE Application_Tracker SHALL record the appellant details, grounds of appeal, date lodged, and supporting documentation
2. WHEN the Town Planner lodges an appeal on behalf of the applicant, THE Application_Tracker SHALL track the 21-day appeal deadline and confirm the appeal was lodged within the statutory period
3. WHEN an appeal is lodged, THE Application_Tracker SHALL transition the application status to Appeal In Progress and suspend any condition fulfilment deadlines
4. WHEN an appeal hearing date is scheduled, THE Application_Tracker SHALL record the hearing date and generate a hearing-preparation alert 14 days before the hearing in the Action_Centre
5. WHEN an appeal outcome is received, THE Application_Tracker SHALL record the outcome (upheld, dismissed, varied) and update the Condition_Register if conditions were varied

### Requirement 9: Integration with Architex Platform Modules

**User Story:** As a Town Planner, I want the planning module to integrate with other Architex modules, so that planning status flows into the project lifecycle and triggers downstream workflows.

#### Acceptance Criteria

1. WHEN a planning application status changes, THE Application_Tracker SHALL update the Project_Passport with the current planning status, stage, and any risk flags
2. WHEN a planning approval is granted and conditions are fulfilled, THE Application_Tracker SHALL notify the Compliance_Hub that planning approval is complete for the project
3. WHEN post-approval survey work is required (SG diagrams, title deed endorsement), THE Application_Tracker SHALL create a handoff record to the Survey_Module with relevant approval details and condition references
4. WHEN a deadline alert or required action is generated, THE Application_Tracker SHALL surface the action in the Action_Centre with priority level, due date, and direct navigation link to the relevant application
5. THE Application_Tracker SHALL write all significant events (application creation, stage transitions, decisions, document uploads, condition fulfilment) to the Audit_Trail
6. WHEN approved conditions include specification requirements, THE Application_Tracker SHALL write those conditions to SpecForge as specification items linked to the project

### Requirement 10: Notification and Alert System

**User Story:** As a Town Planner, I want to receive timely notifications about deadlines, status changes, and required actions, so that I never miss a statutory deadline or important event.

#### Acceptance Criteria

1. WHEN a statutory deadline is within 7 days, THE Application_Tracker SHALL send a notification to the assigned Town Planner via the Action_Centre
2. WHEN a statutory deadline is within 2 days, THE Application_Tracker SHALL escalate the notification to urgent priority
3. WHEN an objection is recorded against an application, THE Application_Tracker SHALL notify the assigned Town Planner immediately
4. WHEN a municipality issues a decision (approval, refusal, or request for additional information), THE Application_Tracker SHALL notify the Town Planner and the Client
5. WHEN a condition fulfilment deadline is approaching, THE Application_Tracker SHALL notify both the Town Planner and the responsible party assigned to that condition

### Requirement 11: Role-Based Access Control

**User Story:** As a platform administrator, I want planning application access to be controlled by user role, so that sensitive application data is only visible to authorised team members.

#### Acceptance Criteria

1. THE Application_Tracker SHALL grant full read-write access to users with the Town_Planner role for applications assigned to their projects
2. THE Application_Tracker SHALL grant read-only access with comment capability to users with the Client role for applications on their projects
3. THE Application_Tracker SHALL grant read-only access to users with the Architect role for applications on projects where the Architect is a team member
4. THE Application_Tracker SHALL grant read access to application status and conditions to users with the Surveyor role for applications requiring post-approval survey work
5. WHEN a user without an authorised role attempts to access a Planning_Application, THE Application_Tracker SHALL deny access and log the access attempt in the Audit_Trail
6. THE Application_Tracker SHALL allow the firm_admin role to configure which team members have access to specific applications within their firm's projects

### Requirement 12: Reporting and Analytics

**User Story:** As a Town Planner, I want to generate reports and view analytics on my planning applications, so that I can identify bottlenecks, track performance, and report to clients.

#### Acceptance Criteria

1. WHEN a Town Planner requests a portfolio report, THE Application_Tracker SHALL generate a summary showing all active applications grouped by status, municipality, and application type
2. THE Application_Tracker SHALL calculate and display average processing times per municipality and per application type based on historical data
3. WHEN a client requests a status report, THE Application_Tracker SHALL generate a client-facing summary for a specific project showing current stage, upcoming deadlines, outstanding actions, and risk indicators
4. THE Application_Tracker SHALL provide a dashboard view displaying applications at risk (overdue deadlines, stuck in stage beyond expected duration, approaching statutory limits) with colour-coded risk indicators
5. WHEN a Town Planner requests a compliance report, THE Application_Tracker SHALL generate a report showing all statutory deadlines met and missed across a specified date range

### Requirement 13: Hearing Scheduling and Preparation

**User Story:** As a Town Planner, I want to track tribunal hearing dates and prepare hearing packs, so that I am fully prepared for MPT hearings and can coordinate all required attendees.

#### Acceptance Criteria

1. WHEN a hearing date is confirmed by the municipality, THE Application_Tracker SHALL record the hearing date, time, venue, and tribunal panel details
2. WHEN a hearing date is recorded, THE Application_Tracker SHALL generate preparation alerts at 14 days and 7 days before the hearing in the Action_Centre
3. WHEN a Town Planner prepares a hearing pack, THE Application_Tracker SHALL generate a document checklist for the hearing including the application, motivation report, public participation summary, site plan, and response to objections
4. WHEN multiple applications for the same project have hearings scheduled, THE Application_Tracker SHALL display a consolidated hearing calendar for the project
5. IF a hearing is postponed, THEN THE Application_Tracker SHALL update the hearing date, recalculate preparation deadlines, and notify all stakeholders assigned to the application

### Requirement 14: Environmental and Heritage Triggers

**User Story:** As a Town Planner, I want the system to identify when a planning application triggers environmental or heritage assessments, so that I can initiate parallel processes and avoid delays.

#### Acceptance Criteria

1. WHEN a planning application is created for a property older than 60 years, THE Application_Tracker SHALL flag the application as potentially requiring an NHRA Section 38 heritage assessment and alert the Town Planner
2. WHEN a planning application involves land use change that may trigger NEMA requirements, THE Application_Tracker SHALL flag the application for environmental screening and present the Town Planner with a checklist of potential triggers
3. WHEN an environmental or heritage trigger is confirmed, THE Application_Tracker SHALL create a parallel process tracker linked to the main planning application with its own deadlines and document requirements
4. WHEN a parallel environmental or heritage process is pending, THE Application_Tracker SHALL prevent the main application from advancing beyond the Tribunal/Decision stage until the parallel process status is resolved or explicitly deferred by the Town Planner

### Requirement 15: Dual Operating Mode (Project-Scoped and Standalone)

**User Story:** As a Town Planner, I want to use the Application Tracker either within a full Architex project workflow or as a standalone practice tool, so that I can manage my planning applications regardless of whether a broader project team is using the platform.

#### Acceptance Criteria

1. THE Application_Tracker SHALL support two operating modes: Project-scoped mode (within an active Architex project context) and Standalone mode (independent practice-level usage without a full project workflow)
2. WHEN in Project-scoped mode, THE Application_Tracker SHALL integrate with Project Passport, SpecForge, team messaging, and finance modules, and display cross-module navigation links
3. WHEN in Standalone mode, THE Application_Tracker SHALL present a practice-level portfolio view showing all applications across the Town Planner's practice without requiring project context
4. WHEN in Standalone mode, THE Application_Tracker SHALL allow creation of planning applications without requiring a full Architex project to be established first
5. THE Application_Tracker SHALL provide a visible toggle allowing the Town Planner to switch between Project-scoped and Standalone modes
6. WHEN a standalone application needs to be linked to a full project later, THE Application_Tracker SHALL support linking an existing standalone application into a project context without data loss
7. WHEN in Standalone mode, THE Application_Tracker SHALL be accessible from the Toolboxes navigation module rather than requiring project selection
8. THE Application_Tracker SHALL provide a project switcher in Project-scoped mode allowing the Town Planner to navigate between projects they are assigned to
