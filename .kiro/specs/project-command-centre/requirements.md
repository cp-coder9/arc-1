# Requirements Document

## Introduction

The Project Command Centre is the unified project management layer for Architex OS — a comprehensive, deeply integrated tool that ties together all existing platform modules (SpecForge, Project Passport, Compliance Hub, Finance Module, Site Execution, Document Intelligence, AI Agents) into a single project delivery workspace. It provides full programme management, task coordination, commercial control, quality tracking, and AI-guided workflows for construction projects in the South African context, serving all 17 platform roles across the 8-stage project lifecycle.

## Glossary

- **Command_Centre**: The Project Command Centre feature — the unified project management workspace within Architex OS
- **Programme_Engine**: The scheduling and Gantt chart subsystem responsible for activity planning, critical path analysis, and progress tracking
- **Task_Board**: The Kanban-style task management subsystem with columns (To Do, In Progress, In Review, Done) and card-based task representation
- **Budget_Controller**: The cost control subsystem tracking contract sums, committed costs, expenditure, variations, and forecast-at-completion
- **Risk_Register**: The subsystem for recording, categorising, scoring, and tracking project risks and issues
- **Quality_Tracker**: The subsystem managing snag lists, non-conformance reports (NCRs), and inspection schedules
- **Resource_Manager**: The subsystem for team allocation, utilisation tracking, and capacity planning
- **AI_Advisor**: The intelligent recommendations panel providing schedule optimisation, risk detection, cost savings, and compliance alerts powered by the Gemini agent system
- **Project_Switcher**: The navigation component allowing users to switch between projects and create new projects
- **Valuation_Manager**: The subsystem managing payment certificates, retention calculations, and milestone-linked valuations
- **Procurement_Tracker**: The subsystem for purchase orders, RFQ management, delivery tracking, and B-BBEE scoring
- **Contract_Register**: The subsystem for managing contract documents, parties, values, and expiry dates
- **Site_Diary**: The daily log subsystem capturing weather, workforce, work completed, issues, and delays
- **RFI_Manager**: The subsystem for Requests for Information and Site Instructions
- **Calendar_View**: The date-based view aggregating milestones, inspections, meetings, and deadlines
- **Action_Centre**: The existing Architex OS inbox/action system that surfaces required actions, approvals, and overdue items
- **Project_Passport**: The existing Architex OS central project truth layer containing lifecycle state, health metrics, and audit trail
- **SpecForge**: The existing specification spine managing specs, selections, products, issues, and approvals
- **Complexity_Mode**: The scalability setting determining whether the Command_Centre displays in Simple mode (basic tasks + milestones) or Full mode (Gantt, resource planning, earned value analysis)
- **Portfolio_Dashboard**: The multi-project overview for firms managing multiple simultaneous projects
- **JBCC**: Joint Building Contracts Committee — South African standard building contract form
- **NEC**: New Engineering Contract — internationally used engineering contract form used in South Africa
- **SACAP**: South African Council for the Architectural Profession
- **NHBRC**: National Home Builders Registration Council
- **B-BBEE**: Broad-Based Black Economic Empowerment — procurement scoring requirement in South Africa

## Requirements

### Requirement 1: Project Dashboard and Overview

**User Story:** As a project team member, I want a unified dashboard showing project health at a glance, so that I can quickly assess progress, budget status, risks, and upcoming milestones without navigating multiple screens.

#### Acceptance Criteria

1. WHEN a user navigates to the Command_Centre, THE Command_Centre SHALL display a dashboard with stat cards showing overall progress percentage, budget spent vs contract sum, open action count, and active RFI count
2. THE Command_Centre SHALL display the project lifecycle bar indicating completed stages and the current active stage aligned to the Architex OS 8-stage lifecycle (Brief, Appoint, Design, Comply, Build, Pay, Closeout)
3. WHEN the dashboard loads, THE AI_Advisor SHALL display up to 5 intelligent recommendations with actionable accept/dismiss controls
4. THE Command_Centre SHALL display upcoming milestones sorted by due date with visual indicators for overdue (red), upcoming (amber), and on-track (green) status
5. WHEN data changes in any linked subsystem (Programme_Engine, Budget_Controller, Risk_Register, Quality_Tracker), THE Command_Centre dashboard SHALL reflect the updated values within 30 seconds

### Requirement 2: Programme and Gantt Chart Management

**User Story:** As a site manager or architect, I want to manage the project programme with a visual Gantt chart, so that I can plan activities, track progress, identify critical path items, and detect schedule conflicts.

#### Acceptance Criteria

1. THE Programme_Engine SHALL display activities in a Gantt chart with horizontal time bars, start/end dates, percentage complete, and a today-line marker
2. WHEN a user creates a new activity, THE Programme_Engine SHALL require activity name, start date, end date, and assignee, and SHALL place the activity on the Gantt timeline
3. WHEN a user edits an activity, THE Programme_Engine SHALL update the visual bar position, duration, and progress percentage
4. THE Programme_Engine SHALL visually distinguish critical path activities from non-critical activities using colour coding (red for critical, green for complete, blue for on-track)
5. WHEN an activity is linked to a SpecForge item, THE Programme_Engine SHALL display the SpecForge reference and maintain bidirectional traceability
6. THE Programme_Engine SHALL support activity dependencies (finish-to-start, start-to-start, finish-to-finish, start-to-finish) and recalculate the critical path when dependencies change
7. WHEN an activity falls behind schedule and affects the critical path, THE Programme_Engine SHALL generate an alert visible in the Action_Centre

### Requirement 3: Task Board (Kanban) Management

**User Story:** As a project team member, I want a Kanban-style task board, so that I can visualise work in progress, manage task assignments, and track items through their workflow states.

#### Acceptance Criteria

1. THE Task_Board SHALL display tasks in four columns: To Do, In Progress, In Review, and Done
2. WHEN a user creates a new task, THE Task_Board SHALL require task title, assignee, priority (Low, Medium, High, Critical), and due date
3. THE Task_Board SHALL allow tasks to be linked to SpecForge items, programme activities, and procurement orders
4. WHEN a task is moved between columns, THE Task_Board SHALL update the task status and record the state change with timestamp and actor in the audit trail
5. THE Task_Board SHALL display each task card with title, assignee name, priority badge, and due date indicator
6. WHEN a task becomes overdue, THE Task_Board SHALL visually flag the card and create an action in the Action_Centre for the assigned user
7. THE Task_Board SHALL support filtering by assignee, priority, due date range, and linked subsystem

### Requirement 4: Milestone Management

**User Story:** As a quantity surveyor or architect, I want to define and track project milestones linked to payment certificates, so that I can monitor delivery against contractual obligations and trigger payment workflows.

#### Acceptance Criteria

1. THE Command_Centre SHALL display milestones in a table with planned date, actual date, status (Complete, On Track, At Risk, Overdue, Pending), and linked payment certificate reference
2. WHEN a user creates a milestone, THE Command_Centre SHALL require milestone name, planned date, and optionally link to a payment certificate and programme activity
3. WHEN a milestone due date passes without completion, THE Command_Centre SHALL change the milestone status to Overdue and create an action in the Action_Centre
4. WHEN a milestone is marked complete, THE Command_Centre SHALL record the actual completion date and notify linked payment certificate holders via the Action_Centre
5. THE Command_Centre SHALL support NHBRC inspection milestones as a milestone category with specific documentation requirements

### Requirement 5: Budget and Cost Control

**User Story:** As a quantity surveyor, I want to track project budget, committed costs, expenditure, and variations, so that I can monitor financial health and forecast cost at completion.

#### Acceptance Criteria

1. THE Budget_Controller SHALL display contract sum, approved variations total, spent to date, and forecast at completion as summary stat cards
2. THE Budget_Controller SHALL display a cost breakdown table by work package showing budget, committed, spent, progress percentage, and variance
3. WHEN a variation is approved, THE Budget_Controller SHALL add the variation value to the contract sum and recalculate forecast at completion
4. WHEN expenditure exceeds budget for any package by more than 5%, THE Budget_Controller SHALL flag the package as over-budget and generate a risk entry in the Risk_Register
5. THE Budget_Controller SHALL feed cost data into the Valuation_Manager for payment certificate generation
6. THE Budget_Controller SHALL write financial health metrics (total spent, variance, forecast) into the Project_Passport

### Requirement 6: Risk and Issue Register

**User Story:** As a project manager, I want to maintain a risk and issue register with severity classification and ownership, so that I can proactively manage threats to project delivery.

#### Acceptance Criteria

1. THE Risk_Register SHALL display risks in a table with ID, description, category (Supply Chain, Resource, Quality, Compliance, Commercial, Safety), severity (Critical, High, Medium, Low), owner, and status (Open, Mitigating, Escalated, Monitoring, Closed)
2. WHEN a user creates a risk, THE Risk_Register SHALL require description, category, severity, and owner
3. THE Risk_Register SHALL display summary counts by severity level as stat cards
4. WHEN a risk is escalated, THE Risk_Register SHALL create an action in the Action_Centre for the project principal agent
5. WHEN the AI_Advisor detects a pattern indicating elevated risk (schedule delay, cost overrun, resource constraint), THE AI_Advisor SHALL automatically create a risk entry in the Risk_Register with a recommendation for mitigation
6. THE Risk_Register SHALL write risk count and severity distribution into the Project_Passport health metrics

### Requirement 7: Quality and Snag Tracking

**User Story:** As a site manager or architect, I want to track snags, NCRs, and inspection outcomes, so that I can ensure construction quality meets specification and contractual requirements.

#### Acceptance Criteria

1. THE Quality_Tracker SHALL display snag items in a table with ID, description, location, severity (High, Medium, Low), assigned party, and status (Open, Rectifying, Resolved, Closed)
2. WHEN a user creates a snag, THE Quality_Tracker SHALL require description, location, severity, and assigned party
3. THE Quality_Tracker SHALL display summary stats for open snags, resolved this week, active NCRs, and inspections due
4. WHEN a snag is resolved, THE Quality_Tracker SHALL record the resolution date and update the snag resolution rate KPI
5. THE Quality_Tracker SHALL integrate with the existing Site Execution snag service (SnagManager) for data persistence and bidirectional sync
6. WHEN an inspection is due within 7 days, THE Quality_Tracker SHALL create an action in the Action_Centre with documentation preparation checklist

### Requirement 8: Team and Resource Management

**User Story:** As an architect or site manager, I want to see team composition, utilisation rates, and capacity, so that I can ensure resources are appropriately allocated across the project.

#### Acceptance Criteria

1. THE Resource_Manager SHALL display a team register table with member name, role, firm, utilisation percentage (with progress bar), hours logged, and status (Active, Part-time, On Hold)
2. THE Resource_Manager SHALL display summary stats for total members, average utilisation, hours this month vs budget, and pending approvals
3. WHEN a team member's utilisation exceeds 90% for two consecutive weeks, THE Resource_Manager SHALL flag the member as over-allocated and generate a recommendation in the AI_Advisor
4. THE Resource_Manager SHALL integrate with the existing project team data from Project_Passport and display SpecForge team reference links
5. WHEN a new team member is added or removed, THE Resource_Manager SHALL record the change in the project audit trail and notify relevant team leads via the Action_Centre

### Requirement 9: Site Diary

**User Story:** As a site manager, I want to record daily site conditions, workforce, work completed, and issues, so that I have a contemporaneous record of project execution for contractual and audit purposes.

#### Acceptance Criteria

1. THE Site_Diary SHALL provide a daily log form with weather condition selector, workforce count, work completed text field, and issues/delays text field
2. WHEN a user saves a diary entry, THE Site_Diary SHALL persist the entry with the current date, author, and timestamp
3. THE Site_Diary SHALL display previous entries in reverse chronological order with date, weather icon, and content summary
4. THE Site_Diary SHALL integrate with the existing dailyLog service for data persistence
5. WHEN a diary entry mentions delays or issues, THE Site_Diary SHALL surface the entry to the Programme_Engine and Risk_Register for correlation
6. THE Site_Diary SHALL feed into the Programme_Engine for actual progress tracking and the Action_Centre for follow-up items

### Requirement 10: RFIs and Site Instructions

**User Story:** As a contractor or architect, I want to raise and respond to Requests for Information and issue Site Instructions, so that design queries are formally tracked and resolved with an audit trail.

#### Acceptance Criteria

1. THE RFI_Manager SHALL display active RFIs in a table with RFI number, subject, from (originator), to (responder), date raised, and status (Pending, Critical, Closed)
2. WHEN a user creates an RFI, THE RFI_Manager SHALL require subject, description, addressee, and priority, and SHALL generate a sequential RFI number
3. WHEN an RFI is raised, THE RFI_Manager SHALL create an action in the Action_Centre for the addressee with the response deadline
4. THE RFI_Manager SHALL integrate with the existing Site Execution RFI/Site Instruction services for data persistence
5. WHEN an RFI is not responded to within the contractual response period, THE RFI_Manager SHALL escalate the RFI to Critical status and notify the principal agent
6. THE RFI_Manager SHALL support Site Instructions as a related document type with issuer, recipient, instruction content, and compliance confirmation

### Requirement 11: Valuations and Payment Certificates

**User Story:** As a quantity surveyor, I want to generate and track payment certificates linked to milestones and measured work, so that the payment process is transparent and contractually compliant.

#### Acceptance Criteria

1. THE Valuation_Manager SHALL display payment certificates in a table with certificate number, period, gross value, retention amount, net certified amount, and status (Draft, Awaiting Signature, Certified, Paid)
2. WHEN a payment certificate is generated, THE Valuation_Manager SHALL calculate retention based on the contract retention percentage
3. WHEN a payment certificate requires signature, THE Valuation_Manager SHALL create an action in the Action_Centre for the principal agent
4. THE Valuation_Manager SHALL link payment certificates to milestones, showing which milestone triggered each certificate
5. THE Valuation_Manager SHALL integrate with the existing Finance Module for escrow orchestration and payment processing
6. THE Valuation_Manager SHALL write payment status and certified totals into the Project_Passport

### Requirement 12: Procurement Tracking

**User Story:** As a quantity surveyor or contractor, I want to track purchase orders, RFQs, deliveries, and supplier performance, so that I can manage the supply chain and ensure materials arrive on schedule.

#### Acceptance Criteria

1. THE Procurement_Tracker SHALL display orders and RFQs in a table with order number, description, supplier, value, expected delivery date, and status (Ordered, In Transit, Delivered, Evaluating)
2. WHEN a user creates a purchase order, THE Procurement_Tracker SHALL require description, supplier, value, and expected delivery date
3. THE Procurement_Tracker SHALL link procurement items to SpecForge specification items for traceability from specification to delivery
4. WHEN a delivery date passes without confirmation, THE Procurement_Tracker SHALL flag the order as overdue and generate a risk entry
5. THE Procurement_Tracker SHALL support B-BBEE procurement scoring for each supplier and aggregate the project B-BBEE procurement percentage
6. WHEN an RFQ receives supplier responses, THE Procurement_Tracker SHALL support bid comparison with value, delivery, and B-BBEE score columns

### Requirement 13: Contract Management

**User Story:** As an architect or quantity surveyor, I want to maintain a register of all project contracts with parties, values, and key dates, so that I can track contractual obligations and expiry.

#### Acceptance Criteria

1. THE Contract_Register SHALL display contracts in a table with reference, contractor/supplier name, scope description, value, expiry date, and status (Active, Expired, Terminated, Pending)
2. WHEN a contract is created, THE Contract_Register SHALL require contractor/supplier, scope, value, form of contract (JBCC, NEC, or custom), and dates
3. THE Contract_Register SHALL support JBCC and NEC contract forms as primary options reflecting South African construction practice
4. WHEN a contract expiry date is within 30 days, THE Contract_Register SHALL generate a notification in the Action_Centre
5. THE Contract_Register SHALL link contracts to relevant procurement orders and payment certificates for full commercial traceability

### Requirement 14: Document Register Integration

**User Story:** As a project team member, I want to access the project document register within the Command_Centre, so that I can view drawing status, revision history, and approval state without switching to a separate module.

#### Acceptance Criteria

1. THE Command_Centre SHALL display a document register view showing document reference, title, revision, author, date, and status (Draft, For Review, Approved, Superseded)
2. THE Command_Centre SHALL integrate with the existing Document Intelligence and Drawing Register services for document data
3. WHEN a document status changes (new revision, approval, superseding), THE Command_Centre document view SHALL reflect the change within 30 seconds
4. THE Command_Centre SHALL display a SpecForge integration badge indicating active sync with the Drawing Intelligence module

### Requirement 15: AI-Guided Workflows and Recommendations

**User Story:** As a project manager, I want AI-powered recommendations for schedule optimisation, risk detection, cost savings, and compliance alerts, so that I can make proactive decisions based on data patterns.

#### Acceptance Criteria

1. THE AI_Advisor SHALL analyse project data (programme, budget, risks, quality, procurement) and generate categorised recommendations: Schedule Optimisation, Risk Detection, Cost Savings, Compliance Alert, and Supply Chain Risk
2. WHEN the AI_Advisor generates a recommendation, THE AI_Advisor SHALL display the recommendation with a descriptive title, explanation text, and actionable buttons (Accept, Dismiss, Share with Team, Create Action, Alert Procurement)
3. WHEN a user accepts a recommendation, THE AI_Advisor SHALL execute the recommended action (create task, create risk, send notification, update programme) and record the acceptance in the audit trail
4. THE AI_Advisor SHALL monitor the critical path and generate delay forecasting alerts when activities fall behind and affect downstream milestones
5. THE AI_Advisor SHALL detect compliance gaps (missing documentation, approaching deadlines for SANS, NHBRC, or municipal submissions) and generate compliance alerts
6. THE AI_Advisor SHALL integrate with the existing Gemini agent system for inference and multi-agent orchestration

### Requirement 16: Scalable Complexity Modes

**User Story:** As a platform user, I want the Command_Centre to adapt its complexity to my project size, so that small residential projects are not overwhelmed with enterprise features while large projects have full programme control.

#### Acceptance Criteria

1. THE Command_Centre SHALL support two Complexity_Mode settings: Simple and Full
2. WHILE the Complexity_Mode is set to Simple, THE Command_Centre SHALL display only: Task Board, Milestones, Budget summary, Site Diary, Quality/Snags, and Documents
3. WHILE the Complexity_Mode is set to Full, THE Command_Centre SHALL display all subsystems including Programme/Gantt, Resource Management, Analytics/KPIs, Earned Value Analysis, Contract Register, and multi-team coordination views
4. WHEN a user changes the Complexity_Mode, THE Command_Centre SHALL immediately show or hide the relevant navigation items and page views without data loss
5. THE Command_Centre SHALL default to Simple mode for projects with contract value below R 5M and Full mode for projects above R 5M, with manual override available in Settings

### Requirement 17: Multi-Project Support and Project Switcher

**User Story:** As a professional managing multiple projects, I want to quickly switch between projects and see a portfolio overview, so that I can manage my workload across all active engagements.

#### Acceptance Criteria

1. THE Project_Switcher SHALL display the active project name and metadata (value, current stage) in the sidebar header
2. WHEN a user clicks the Project_Switcher, THE Command_Centre SHALL display a dropdown listing all projects the user has access to, sorted by most recently accessed
3. WHEN a user selects a different project, THE Command_Centre SHALL load the selected project's data into all subsystems within 3 seconds
4. THE Project_Switcher SHALL provide a "New Project" button that opens a guided project creation wizard
5. WHEN a user creates a new project, THE Command_Centre SHALL require project name, client, estimated value, project type, location, and estimated duration
6. WHERE the user has access to multiple projects, THE Command_Centre SHALL provide a Portfolio_Dashboard showing aggregated health metrics across all projects

### Requirement 18: Role-Based Access and Views

**User Story:** As a platform administrator, I want each of the 17 Architex roles to see only the views and data appropriate to their responsibilities, so that information is scoped and the interface is relevant to each user.

#### Acceptance Criteria

1. THE Command_Centre SHALL scope navigation items and page content based on the authenticated user's UserRole
2. WHILE the user role is client, THE Command_Centre SHALL display: Dashboard (high-level progress), Milestones, Budget summary (spent vs total only), Documents, and Notifications
3. WHILE the user role is architect or bep, THE Command_Centre SHALL display all Command_Centre subsystems
4. WHILE the user role is site_manager, THE Command_Centre SHALL display: Dashboard, Programme, Tasks, Site Diary, RFIs, Quality/Snags, and Team
5. WHILE the user role is quantity_surveyor, THE Command_Centre SHALL display: Dashboard, Budget, Valuations, Procurement, Contracts, Milestones, and Analytics
6. WHILE the user role is contractor or subcontractor, THE Command_Centre SHALL display: Dashboard, Tasks, Programme (read-only), Site Diary, RFIs, Quality/Snags, and Procurement (own orders only)
7. WHILE the user role is supplier, THE Command_Centre SHALL display: Procurement (own orders and RFQs only) and Documents (relevant transmittals only)
8. THE Command_Centre SHALL prevent users from viewing or modifying data outside their role scope and log access violations in the audit trail

### Requirement 19: Platform Integration — Project Passport Writeback

**User Story:** As a platform architect, I want the Command_Centre to write all significant state changes back into the Project Passport, so that the central project truth remains current and other modules can consume the data.

#### Acceptance Criteria

1. WHEN a milestone status changes, THE Command_Centre SHALL update the Project_Passport lifecycle state and health metrics
2. WHEN the Budget_Controller detects a budget overrun or significant variance, THE Command_Centre SHALL write the financial health status to the Project_Passport
3. WHEN a critical risk is created or escalated, THE Command_Centre SHALL update the Project_Passport risk profile
4. WHEN the Programme_Engine calculates a schedule variance, THE Command_Centre SHALL write the schedule health metric to the Project_Passport
5. THE Command_Centre SHALL record all significant user actions (task creation, milestone completion, payment certification, risk escalation) in the Project_Passport audit trail

### Requirement 20: Platform Integration — SpecForge Bidirectional Sync

**User Story:** As a specification manager, I want Command_Centre tasks and procurement items linked to SpecForge specification items, so that delivery progress is traceable back to the original specification.

#### Acceptance Criteria

1. WHEN a user creates a task or procurement order, THE Command_Centre SHALL allow linking to one or more SpecForge specification items via reference ID
2. WHEN a SpecForge item status changes (approved, substituted, issued), THE Command_Centre SHALL reflect the updated status on linked tasks and procurement items
3. THE Command_Centre SHALL display SpecForge integration badges on views that have active sync connections
4. WHEN procurement items are created from SpecForge Bill of Materials data, THE Procurement_Tracker SHALL inherit the specification reference and material details
5. THE Programme_Engine SHALL support linking activities to SpecForge items so that programme progress feeds back into SpecForge delivery tracking

### Requirement 21: Platform Integration — Compliance Hub and Finance Module

**User Story:** As a compliance manager, I want Command_Centre milestones to feed into the Compliance Hub for inspection scheduling, and valuations to connect to the Finance Module for payment processing.

#### Acceptance Criteria

1. WHEN an NHBRC inspection milestone is created, THE Command_Centre SHALL register the inspection with the Compliance Hub and track documentation readiness
2. WHEN a municipal submission deadline is defined as a milestone, THE Command_Centre SHALL surface the submission checklist from the Compliance Hub
3. WHEN a payment certificate is certified, THE Valuation_Manager SHALL trigger the payment workflow in the Finance Module (escrow release or direct payment)
4. THE Valuation_Manager SHALL read retention rules and payment terms from the Finance Module configuration
5. WHEN the Compliance Hub identifies a compliance gap, THE Command_Centre SHALL create a risk entry and an action in the Action_Centre

### Requirement 22: Action Centre and Notification Integration

**User Story:** As a project team member, I want all Command_Centre actions, approvals, and deadlines to surface in the unified Action Centre, so that I have a single inbox for required work.

#### Acceptance Criteria

1. THE Command_Centre SHALL display an Action Centre view with required actions categorised by type (Approval, Technical, Financial, Design, Planning) with due dates and priority
2. THE Command_Centre SHALL display summary stats for overdue, due today, upcoming (7 days), and awaiting others
3. WHEN any subsystem generates an action (overdue task, unsigned certificate, unresponded RFI, approaching milestone), THE Command_Centre SHALL create an entry in the platform-wide Action Centre / Inbox
4. THE Command_Centre SHALL display a Notifications view showing recent project activity (document approvals, RFI raises, payment certificates, team changes, milestone alerts)
5. WHEN a notification is generated, THE Command_Centre SHALL categorise the notification with an appropriate icon and severity level

### Requirement 23: Calendar View

**User Story:** As a project team member, I want a calendar view aggregating milestones, inspections, meetings, and deadlines, so that I can see what is coming up on specific dates.

#### Acceptance Criteria

1. THE Calendar_View SHALL aggregate events from milestones, inspection dates, delivery dates, meeting schedules, and task due dates into a unified calendar
2. THE Calendar_View SHALL display events grouped by date with event description and type indicator
3. WHEN a user clicks a calendar event, THE Calendar_View SHALL navigate to or display the detail of the source item (milestone detail, task detail, inspection checklist)
4. THE Calendar_View SHALL support month, week, and day views

### Requirement 24: Analytics and KPIs

**User Story:** As a project manager or client, I want to see key performance indicators and trend analytics, so that I can measure project health objectively and identify deteriorating areas.

#### Acceptance Criteria

1. THE Command_Centre SHALL display analytics with KPI stat cards: schedule variance (days), cost variance (percentage), RFI response time (days average), and quality score (snag resolution rate percentage)
2. THE Command_Centre SHALL display a KPI table with target, actual, trend indicator (improving/stable/deteriorating), and status (On Target, At Risk, Over)
3. THE Command_Centre SHALL calculate schedule variance by comparing planned vs actual milestone dates
4. THE Command_Centre SHALL calculate cost variance as (forecast at completion - contract sum) / contract sum as a percentage
5. THE Command_Centre SHALL integrate with the existing Analytics & Reporting Engine (analyticsReportingEngine service) for KPI computation and report generation

### Requirement 25: South African Construction Context

**User Story:** As a South African construction professional, I want the Command_Centre to support local contract forms, regulatory bodies, and procurement requirements, so that the tool reflects actual industry practice.

#### Acceptance Criteria

1. THE Contract_Register SHALL support JBCC (PBA, N/S, MWA) and NEC (ECC, PSC, TSC) contract forms as primary options in the contract creation form
2. THE Command_Centre SHALL align project stages to SACAP Work Stages and display the SACAP stage alongside the Architex lifecycle stage
3. THE Command_Centre SHALL support municipal submission tracking milestones with municipality-specific documentation requirements
4. THE Command_Centre SHALL support NHBRC inspection milestones (Stages 1–7) with stage-specific documentation checklists
5. THE Procurement_Tracker SHALL calculate and display B-BBEE procurement spend as a percentage of total procurement value and per-supplier B-BBEE level

### Requirement 26: Project Settings and Configuration

**User Story:** As a project administrator, I want to configure project details, integrations, and display preferences, so that the Command_Centre is correctly set up for each project.

#### Acceptance Criteria

1. THE Command_Centre SHALL provide a Settings page displaying project name, contract value, duration, and current stage with editable fields
2. THE Command_Centre SHALL display integration connection status for SpecForge, Project Passport, Document Intelligence, and Payment Gateway
3. WHEN a user updates project settings, THE Command_Centre SHALL validate the changes and persist them to the project record
4. THE Command_Centre SHALL allow users to change the Complexity_Mode setting from the Settings page
5. WHEN settings are saved, THE Command_Centre SHALL write the updated configuration to the Project_Passport

### Requirement 27: UI Shell Integration

**User Story:** As a platform architect, I want the Command_Centre to render within the Architex OS shell following established UI patterns, so that the user experience is consistent with other platform tools.

#### Acceptance Criteria

1. THE Command_Centre SHALL render inside the Architex OS authenticated content area, inheriting the OS header bar, breadcrumb trail, and collapsed primary navigation
2. THE Command_Centre SHALL use a tool sidebar for project-scoped navigation with sections: Command (Dashboard, Action Centre, Notifications), Planning (Programme, Tasks, Milestones, Calendar), Execution (Team, Site Diary, RFIs, Issues, Quality), Commercial (Budget, Valuations, Procurement, Contracts), and Intelligence (Analytics, AI Advisor, Documents, Settings)
3. THE Command_Centre SHALL use the established visual conventions: dark theme, glass cards (bg-surface-800/70 backdrop-blur), shadcn/ui components, lucide-react icons, and Inter typography
4. THE Command_Centre SHALL display a breadcrumb showing "Command Centre / [Active Page Name]" in the OS header
5. THE Command_Centre SHALL accept the UserProfile prop and operate within the active project context
6. THE Command_Centre SHALL display sync status badges (e.g., "Synced with Project Passport", "SpecForge Active") in the content header

### Requirement 28: Audit Trail and Data Persistence

**User Story:** As a platform architect, I want all Command_Centre data persisted to Firestore with full audit trail, so that project history is immutable and traceable for contractual purposes.

#### Acceptance Criteria

1. THE Command_Centre SHALL persist all data (tasks, milestones, risks, diary entries, RFIs, procurement orders, contracts) to Firestore under the project document scope
2. WHEN a user creates, updates, or deletes any record, THE Command_Centre SHALL record the action with timestamp, actor userId, action type, and before/after values in the audit trail
3. THE Command_Centre SHALL use optimistic UI updates with Firestore real-time listeners for multi-user synchronisation
4. IF a data write fails, THEN THE Command_Centre SHALL display an error toast notification and revert the optimistic update
5. THE Command_Centre SHALL scope all data access by project ID and enforce Firestore security rules matching the user's role permissions
