# Requirements Document

## Introduction

The Practice Management Professional Services module extends the existing Project Command Centre in Architex OS with firm-level practice management capabilities inspired by Fresh Projects (gofreshprojects.com). While the existing PCC covers construction project delivery (Gantt, tasks, RFIs, site diary, procurement, payment certificates, risk register), this module adds the professional services management layer — tracking what architectural and engineering firms earn vs what their staff time costs, providing WIP visibility, profitability tracking, resource capacity planning, and professional services invoicing. Per-project views extend the PCC sidebar; firm-wide rollups live in a new Firm Command Centre / Portfolio Dashboard.

## Glossary

- **Practice_Management_Module**: The overall feature module providing professional services management within Architex OS
- **Timesheet_Engine**: The subsystem responsible for daily time capture, approval workflows, and time cost aggregation per project, SACAP work stage, and activity
- **Expense_Manager**: The subsystem for personal expense claims, supplier bill capture, per-project allocation, and approval workflow
- **Billing_Rate_Table**: The configuration subsystem defining per-role, per-discipline hourly/daily/fixed billing rates aligned to SACAP fee schedules
- **Fee_Tracker**: The subsystem tracking agreed professional fees per project stage against time costs incurred (planned fee vs actual cost to the firm)
- **WIP_Engine**: The Work in Progress calculation engine: planned fee minus costs incurred minus invoiced equals WIP exposure
- **Profitability_Calculator**: The subsystem calculating project margin (fee earned minus staff cost minus disbursements minus write-offs)
- **Practice_Invoice_Manager**: The professional services invoicing subsystem (lump sum, time-based, disbursements) — distinct from JBCC payment certificates
- **Resource_Planner**: The forward-looking capacity planning subsystem tracking availability, allocation, pipeline impact, and over-allocation
- **Leave_Manager**: The leave capture, approval, and availability impact subsystem
- **Write_Off_Tracker**: The subsystem recording time written off per project and tracking cumulative write-offs against fee
- **Income_Forecaster**: The monthly income forecast engine by project stage and milestone
- **Firm_Dashboard**: The firm-wide portfolio rollup showing profitability, WIP, utilisation, pipeline, and board-ready reporting across all projects
- **CRM_Pipeline**: The new business pipeline linked to capacity forecasting and income projections
- **SACAP_Work_Stage**: South African Council for the Architectural Profession defined project stages (Stage 1–6) used to categorise professional service delivery
- **Approval_Workflow**: A multi-step review process where submitted items require explicit approval from an authorised party before processing
- **Disbursement**: Out-of-pocket expenses incurred on behalf of a project that are recoverable from the client (printing, travel, courier, etc.)
- **Write_Off**: Time or cost that has been incurred but will not be recovered — typically due to scope creep, rework, or goodwill
- **Utilisation_Rate**: The percentage of available working hours that are spent on billable project work

## Requirements

### Requirement 1: Timesheet Capture and Approval

**User Story:** As a staff member, I want to capture my daily time against a specific project, SACAP work stage, and activity, so that the firm can accurately track labour costs per project and per stage.

#### Acceptance Criteria

1. WHEN a staff member logs a timesheet entry, THE Timesheet_Engine SHALL require project, SACAP_Work_Stage, activity description, date, start time, and end time
2. WHEN a timesheet entry is saved, THE Timesheet_Engine SHALL calculate duration in hours and compute the cost using the staff member's applicable billing rate from the Billing_Rate_Table
3. WHEN a staff member submits a weekly timesheet for approval, THE Timesheet_Engine SHALL change the status to pending_approval and create an action in the Action Centre for the designated approver
4. WHEN an approver approves a timesheet submission, THE Timesheet_Engine SHALL mark all entries in the submission as approved, and only after confirming entries are marked approved SHALL the Timesheet_Engine update the project's time cost totals
5. WHEN an approver rejects a timesheet submission, THE Timesheet_Engine SHALL mark the submission as rejected with a reason and notify the staff member to revise
6. THE Timesheet_Engine SHALL integrate with the existing timesheetService for data persistence and extend it with approval workflow status fields

### Requirement 2: Expense Claims and Disbursements

**User Story:** As a staff member, I want to submit expense claims for project-related costs (site visits, printing, travel), so that the firm can track disbursements and recover them from clients.

#### Acceptance Criteria

1. WHEN a staff member creates an expense claim, THE Expense_Manager SHALL require description, amount, date, project, expense category (travel, printing, courier, accommodation, meals, other), and optional receipt attachment
2. WHEN an expense claim is submitted for approval, THE Expense_Manager SHALL change the status to pending_approval and create an action in the Action Centre for the firm_admin or designated approver
3. WHEN an approver approves an expense claim, THE Expense_Manager SHALL mark the claim as approved and add the amount to the project's disbursement total
4. WHEN an approver rejects an expense claim, THE Expense_Manager SHALL mark the claim as rejected with a reason and notify the submitter
5. THE Expense_Manager SHALL support categorising expenses as either reimbursable (paid back to staff) or disbursement (recoverable from client)
6. THE Expense_Manager SHALL aggregate approved expenses per project for inclusion in WIP calculations and practice invoicing

### Requirement 3: Billing Rate Tables

**User Story:** As a firm administrator, I want to configure billing rates per role and per discipline, so that timesheet costs are calculated accurately and fee proposals can be benchmarked against SACAP fee schedules.

#### Acceptance Criteria

1. THE Billing_Rate_Table SHALL support defining rates per role (architect, technologist, technician, draughtsperson, admin) with hourly, daily, and fixed rate types
2. WHEN a firm_admin creates or updates a billing rate, THE Billing_Rate_Table SHALL require role, rate type (hourly, daily, fixed), rate amount in ZAR cents, and effective date
3. THE Billing_Rate_Table SHALL support multiple rate versions per role with effective dates, applying the rate valid at the timesheet entry date
4. WHEN a timesheet entry is created, THE Timesheet_Engine SHALL look up the applicable rate from the Billing_Rate_Table based on the user's role and the entry date; IF no applicable rate exists, THE Timesheet_Engine SHALL allow the entry with a zero billing rate and flag it for rate assignment
5. THE Billing_Rate_Table SHALL provide a SACAP fee schedule reference view showing recommended percentage-based fees per project stage for comparison

### Requirement 4: Professional Fee Tracking

**User Story:** As a project lead, I want to track the agreed professional fee per project stage against time costs incurred, so that I can see whether a project stage is profitable before invoicing.

#### Acceptance Criteria

1. WHEN a project's professional fee structure is defined, THE Fee_Tracker SHALL require total agreed fee, fee basis (lump sum, time-based, percentage of construction cost), and fee breakdown by SACAP_Work_Stage using the field relevant to the selected fee basis (percentage per stage for percentage-based, fixed amount per stage for lump sum or time-based)
2. THE Fee_Tracker SHALL display per-stage breakdown showing agreed fee, time costs incurred (from approved timesheets), disbursements incurred, and net position (fee minus costs)
3. WHEN time costs for a stage exceed 80% of the agreed stage fee, THE Fee_Tracker SHALL generate a warning notification to the project lead
4. WHEN time costs for a stage exceed 100% of the agreed stage fee, THE Fee_Tracker SHALL flag the stage as over-run and generate a risk entry
5. THE Fee_Tracker SHALL write fee health metrics (total fee, costs incurred, net position, over-run stages) into the Project Passport

### Requirement 5: Work in Progress (WIP) Calculation

**User Story:** As a firm administrator, I want to see the WIP position per project showing planned fee vs costs incurred vs invoiced vs collected, so that I can understand the firm's cash exposure and unbilled work.

#### Acceptance Criteria

1. THE WIP_Engine SHALL calculate WIP as: agreed fee minus total costs incurred (time + disbursements) minus amounts invoiced, per project and per SACAP_Work_Stage
2. THE WIP_Engine SHALL display a WIP report with columns: project name, agreed fee, costs incurred, amount invoiced, amount collected, WIP balance, and profit/loss indicator
3. WHEN the WIP balance for a project is negative (costs equal or exceed fee), THE WIP_Engine SHALL flag the project with a loss indicator
4. THE WIP_Engine SHALL provide firm-wide WIP totals aggregating across all active projects
5. THE WIP_Engine SHALL recalculate WIP values in real-time as timesheets are approved, expenses are approved, and invoices are issued or paid

### Requirement 6: Project Profitability

**User Story:** As a director, I want to track project profitability showing fee earned vs staff cost vs disbursements vs write-offs, so that I can identify margin erosion before it becomes critical.

#### Acceptance Criteria

1. THE Profitability_Calculator SHALL compute project margin as: (fee earned minus staff time cost minus disbursements minus write-offs) divided by fee earned, expressed as a percentage
2. THE Profitability_Calculator SHALL display per-project profitability with fee earned, time cost, disbursements, write-offs, net profit, and margin percentage
3. WHEN project margin drops below 20%, THE Profitability_Calculator SHALL flag the project as at-risk and notify the project lead
4. WHEN project margin drops below 0%, THE Profitability_Calculator SHALL flag the project as loss-making and notify firm directors
5. THE Profitability_Calculator SHALL support viewing profitability by SACAP_Work_Stage within a project to identify which stages are profitable and which are eroding margin

### Requirement 7: Practice Invoicing

**User Story:** As a firm administrator, I want to generate professional services invoices (lump sum, time-based, or disbursement claims) separate from JBCC payment certificates, so that the firm can bill clients for architectural services rendered.

#### Acceptance Criteria

1. WHEN a practice invoice is created, THE Practice_Invoice_Manager SHALL support three invoice types: lump sum (stage completion), time-based (hours × rate with timesheet reference), and disbursement claim (approved expenses)
2. WHEN a time-based invoice is generated, THE Practice_Invoice_Manager SHALL link to specific approved timesheet entries and calculate the total from hours multiplied by applicable billing rates
3. WHEN a practice invoice is issued, THE Practice_Invoice_Manager SHALL update the WIP_Engine by adding the invoiced amount to the project's invoiced total
4. THE Practice_Invoice_Manager SHALL track invoice status through: draft, submitted, sent_to_client, paid, overdue, and write_off; an invoice MAY return to draft status for post-issue modifications
5. WHEN a practice invoice remains unpaid for more than 30 full days past its due date, THE Practice_Invoice_Manager SHALL flag the invoice as overdue and create an action in the Action Centre for the firm_admin
6. THE Practice_Invoice_Manager SHALL integrate with the existing invoiceReadinessService for pre-invoice validation and the Finance Module for payment tracking

### Requirement 8: Resource Capacity Planning

**User Story:** As a project lead, I want to see forward-looking resource availability showing who is available, who is over-allocated, and what pipeline projects will impact capacity, so that I can plan staffing for upcoming work stages.

#### Acceptance Criteria

1. THE Resource_Planner SHALL display a capacity view showing each team member's total available hours, allocated hours (from project assignments), leave hours, and remaining capacity per week or month
2. WHEN a team member's allocated hours exceed 100% of available hours for any week (including when available hours is zero due to leave or holidays), THE Resource_Planner SHALL flag the member as over-allocated
3. THE Resource_Planner SHALL calculate available hours as: standard working hours minus approved leave hours minus public holidays
4. THE Resource_Planner SHALL support forward-looking capacity views (4 weeks, 8 weeks, 12 weeks ahead) based on project stage timelines and resource assignments
5. WHEN pipeline projects (from CRM_Pipeline) are included in forecasting, THE Resource_Planner SHALL show projected capacity impact as a separate layer distinguishable from confirmed allocations

### Requirement 9: Leave Management

**User Story:** As a staff member, I want to capture leave requests and have them approved, so that leave days are deducted from my available capacity and the firm can plan around absences.

#### Acceptance Criteria

1. WHEN a staff member requests leave, THE Leave_Manager SHALL require leave type (annual, sick, family responsibility, study, unpaid), start date, end date, and optional notes
2. WHEN a leave request is submitted, THE Leave_Manager SHALL calculate the number of working days (excluding weekends and public holidays) and create an approval action for the designated approver
3. WHEN a leave request is approved, THE Leave_Manager SHALL deduct the leave days from the staff member's available capacity in the Resource_Planner
4. WHEN a leave request is rejected, THE Leave_Manager SHALL notify the staff member with a reason
5. THE Leave_Manager SHALL maintain a leave balance per staff member per leave type per annual cycle and SHALL validate balance sufficiency before processing a leave request, rejecting requests that would exceed the available balance

### Requirement 10: Write-Off Tracking

**User Story:** As a director, I want to track time and costs written off per project, so that I can understand scope creep impact and make informed decisions about future project pricing.

#### Acceptance Criteria

1. WHEN time is written off for a project, THE Write_Off_Tracker SHALL record the write-off amount, reason (scope creep, rework, goodwill, fee negotiation, other), authorising user, and date
2. THE Write_Off_Tracker SHALL maintain a cumulative write-off total per project that only increases or remains equal — write-offs SHALL NOT decrease without an explicit reversal entry; reversals MAY be created for any business reason
3. THE Write_Off_Tracker SHALL display cumulative write-offs against agreed fee as a percentage, per project and per SACAP_Work_Stage
4. WHEN cumulative write-offs for a project exceed 10% of the agreed fee, THE Write_Off_Tracker SHALL generate a warning notification to firm directors
5. THE Write_Off_Tracker SHALL feed write-off totals into the Profitability_Calculator and WIP_Engine calculations

### Requirement 11: Income Forecasting

**User Story:** As a firm administrator, I want to see a monthly income forecast by project stage and milestone, so that I can project cash inflows for board reporting and financial planning.

#### Acceptance Criteria

1. THE Income_Forecaster SHALL generate a month-by-month forecast showing expected income per project based on stage completion dates and fee milestones
2. THE Income_Forecaster SHALL categorise forecast income by confidence level: confirmed (invoice raised), probable (stage nearing completion), and pipeline (from CRM_Pipeline entries)
3. WHEN a project stage is marked complete and ready for invoicing, THE Income_Forecaster SHALL move the associated fee amount from probable to confirmed only if the fee is currently categorised as probable
4. THE Income_Forecaster SHALL provide a rolling 12-month forecast view aggregated across all active and pipeline projects
5. THE Income_Forecaster SHALL update forecast values automatically as project timelines change, invoices are raised, or pipeline projects are won or lost

### Requirement 12: Firm-Wide Reporting and Portfolio Dashboard

**User Story:** As a director, I want a firm-wide portfolio dashboard showing profitability, WIP, utilisation, and pipeline across all projects, so that I can present board-ready reports on firm performance.

#### Acceptance Criteria

1. THE Firm_Dashboard SHALL display firm-wide summary metrics: total revenue (invoiced), total WIP exposure, average project margin, firm utilisation rate, and pipeline value
2. THE Firm_Dashboard SHALL provide a project portfolio table showing each active project with its fee, costs, WIP, margin, and status indicators
3. THE Firm_Dashboard SHALL display staff utilisation metrics: average utilisation rate, billable vs non-billable split, and per-person utilisation with trend indicators
4. THE Firm_Dashboard SHALL aggregate write-off totals and display cumulative firm-wide write-offs as a percentage of total fees
5. THE Firm_Dashboard SHALL support date range filtering (monthly, quarterly, annually) and export to PDF for board reporting

### Requirement 13: CRM Pipeline Integration

**User Story:** As a business development lead, I want to link the new business pipeline to capacity planning and income forecasting, so that pipeline opportunities are factored into resource and financial projections.

#### Acceptance Criteria

1. WHEN a pipeline opportunity is created, THE CRM_Pipeline SHALL require project name, estimated fee, probability percentage (0-100), expected start date, and required disciplines/roles
2. THE CRM_Pipeline SHALL calculate weighted pipeline value as: estimated fee multiplied by probability percentage
3. WHEN pipeline probability exceeds 75%, THE CRM_Pipeline SHALL flag the opportunity as high-confidence; THE Resource_Planner SHALL include opportunities in the forward capacity view based on multiple criteria including high-confidence flag, manual inclusion by firm_admin, or custom threshold configuration
4. WHEN a pipeline opportunity is won, THE CRM_Pipeline SHALL transition the opportunity to an active project and trigger project setup in the Practice_Management_Module
5. THE CRM_Pipeline SHALL feed weighted pipeline values into the Income_Forecaster for pipeline-category forecast entries

### Requirement 14: Role-Based Access for Practice Management

**User Story:** As a platform administrator, I want practice management views to be scoped by role, so that sensitive financial data is only visible to authorised users.

#### Acceptance Criteria

1. WHILE the user role is staff or freelancer, THE Practice_Management_Module SHALL display: own timesheets, own expense claims, own leave requests, and project-level time summaries (no fee or profitability data)
2. WHILE the user role is architect or bep (project lead), THE Practice_Management_Module SHALL display: all project-level views including fee tracking, WIP, profitability for their projects, plus team timesheets and expense approvals
3. WHILE the user role is firm_admin, THE Practice_Management_Module SHALL display: all practice management views including billing rate configuration and viewing, firm-wide reporting, invoicing, resource planning, and CRM pipeline
4. WHILE the user role is client, THE Practice_Management_Module SHALL display: read-only project fee summary and invoice history (no internal cost, margin, or utilisation data)
5. THE Practice_Management_Module SHALL prevent users from viewing or modifying data outside their role scope and log access violations in the audit trail

### Requirement 15: Integration with Project Command Centre

**User Story:** As a project team member, I want practice management data accessible within the existing Project Command Centre sidebar, so that I can access timesheets, expenses, and financials without leaving the project context.

#### Acceptance Criteria

1. THE Practice_Management_Module SHALL extend the existing Command Centre sidebar with new sections: Timesheets, Expenses, and Practice Financials (containing WIP, Profitability, and Invoicing sub-views)
2. WHEN navigating to a practice management view within PCC, THE Practice_Management_Module SHALL display project-scoped data for the currently active project
3. THE Practice_Management_Module SHALL write practice financial health metrics (WIP position, margin status, write-off percentage) into the Project Passport
4. THE Practice_Management_Module SHALL surface practice management actions (timesheet approvals, expense approvals, overdue invoices) in the platform-wide Action Centre
5. THE Practice_Management_Module SHALL render inside the Architex OS AppShell 3-column grid using CSS token classes and the Hero → Stat Row → Panels content pattern
