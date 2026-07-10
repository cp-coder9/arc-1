# Requirements Document

## Introduction

The P2 Product Lanes deliver three separate subscription-revenue product modules to the Architex Built Environment OS. Unlike P0/P1 features (which extend the core project delivery workflow), these P2 items are **separate product lanes** that extend the platform into recurring revenue territory — serving building owners, practice managers, and environmental professionals beyond the construction phase.

1. **Post-Occupancy & Facility Management Bridge (P2.8)** — Extends the existing Closeout module (Pack 11) into a recurring subscription product for building owners and body corporates. Provides a digital building passport that lives on after the construction project closes, with maintenance schedules, warranty tracking, asset registers, and defects liability period management.
2. **Practice Management for Small/Medium Firms (P2.9)** — A standalone subscription product for small/medium architectural, engineering, and QS practices (2–50 staff). Covers enquiry pipeline, WIP tracking, timesheet-to-billing bridge, project profitability, capacity planning, and PI insurance/registration expiry tracking. Operates independently of active construction projects.
3. **Environmental & Heritage Impact (P2.10)** — Integrates environmental impact assessment (EIA) and heritage impact assessment workflows into the compliance/municipal workflow. Covers NEMA Listed Activities trigger checklists, Environmental Authorisation tracking, NHRA Section 38 workflows, Record of Decision conditions registers, and EMPr compliance during construction.

All three modules follow the feature module pattern at `src/features/{feature-name}/`, integrate with mandatory platform contracts where applicable, and maintain the advisory-only posture on all compliance, legal, and environmental features.

### Revenue Model Summary

| Module | Revenue Type | Target Customer | Trigger |
|--------|-------------|-----------------|---------|
| P2.8 | Recurring subscription | Building owners, body corporates, facility managers | Project handover (post practical completion) |
| P2.9 | Subscription per firm (monthly/annual) | Small/medium practices (2–50 staff) | Firm registration (standalone, no active project required) |
| P2.10 | Included in platform (project-scoped) | Environmental professionals, town planners, developers | Project creation with environmental trigger |

## Glossary

### P2.8 Terms

- **FM_Bridge**: The service layer responsible for managing the post-occupancy facility management bridge, including building passport persistence, maintenance scheduling, warranty tracking, and asset management after project handover.
- **Building_Passport**: A persistent digital record of a building that survives project closure, containing as-built information, installed systems, maintenance requirements, warranty records, and compliance history transferred from the construction-phase Project Passport.
- **Maintenance_Scheduler**: The service responsible for generating planned preventive maintenance schedules based on installed equipment, manufacturer recommendations, and building system types.
- **Warranty_Register**: The service responsible for tracking all product, system, and workmanship warranties with expiry dates, terms, conditions, and claim procedures.
- **Asset_Register**: The service responsible for maintaining a comprehensive register of building assets including equipment, systems, finishes, and components with location, condition, and replacement data.
- **DLP_Manager**: The service responsible for managing the Defects Liability Period including defect logging, contractor notification, rectification tracking, and DLP expiry countdown.
- **PPM_Schedule**: Planned Preventive Maintenance schedule — a time-based maintenance programme derived from manufacturer requirements and building system characteristics.
- **Handover_Transition**: The process by which construction-phase project data (from Project Passport, Closeout, SpecForge, and Documents modules) is transferred into the operational Building Passport for ongoing facility management.
- **DLP**: Defects Liability Period — the contractual period (typically 3–12 months) after practical completion during which the contractor remains liable to rectify defects at own cost.
- **Body_Corporate**: The legal entity established under the Sectional Titles Schemes Management Act 8 of 2011 to manage common property in sectional title developments.

### P2.9 Terms

- **Practice_Engine**: The service layer responsible for managing practice-level operations including enquiry pipeline, project tracking, timesheets, billing, capacity planning, and staff compliance for small/medium built environment firms.
- **Enquiry_Pipeline**: The service responsible for tracking business development opportunities through stages: lead → quote → appoint → active → complete, with win/loss analytics.
- **WIP_Tracker**: The service responsible for calculating and displaying Work in Progress per project per discipline, including unbilled time, disbursements, and fee recovery rates.
- **Timesheet_Engine**: The service responsible for capturing staff time entries against projects and activities, calculating billable hours, and bridging to the billing/invoicing workflow.
- **Billing_Bridge**: The service responsible for converting approved timesheet entries and disbursements into draft invoices, supporting hourly, fixed-fee, and percentage-of-construction-cost billing models.
- **Profitability_Dashboard**: The service responsible for calculating and displaying project profitability metrics including fee earned vs cost incurred, effective hourly rate, budget burn rate, and margin analysis.
- **Capacity_Planner**: The service responsible for tracking staff availability, current allocation, and forecasting resource demand against pipeline and active project requirements.
- **Staff_Compliance_Tracker**: The service responsible for monitoring professional registration status and PI insurance expiry per staff member, integrated with the Trust & Verification module.
- **WIP**: Work in Progress — the value of professional services rendered but not yet invoiced, calculated as billable time multiplied by charge-out rate plus unbilled disbursements.
- **PI_Insurance**: Professional Indemnity insurance — mandatory cover for built environment professionals protecting against claims of negligence, errors, or omissions.
- **SACAP**: South African Council for the Architectural Profession — the statutory body registering and regulating architects under the Architectural Profession Act 44 of 2000.
- **ECSA**: Engineering Council of South Africa — the statutory body registering and regulating engineers under the Engineering Profession Act 46 of 2000.
- **SACQSP**: South African Council for the Quantity Surveying Profession — the statutory body regulating quantity surveyors under the Quantity Surveying Profession Act 49 of 2000.
- **SACPCMP**: South African Council for the Project and Construction Management Professions — the statutory body regulating CPMs under the Project and Construction Management Professions Act 48 of 2000.

### P2.10 Terms

- **Environmental_Engine**: The service layer responsible for managing environmental impact assessment workflows, heritage impact assessments, environmental authorisation tracking, and EMPr compliance during construction.
- **EIA_Checker**: The service responsible for evaluating project activities against NEMA Listed Activities to determine whether an Environmental Impact Assessment or Basic Assessment is triggered.
- **EA_Tracker**: The service responsible for tracking Environmental Authorisation applications through the regulatory process from pre-application through decision and appeal.
- **Heritage_Workflow**: The service responsible for managing NHRA Section 38 heritage impact assessment processes including notification, assessment, and permit tracking.
- **ROD_Register**: The service responsible for maintaining a register of Record of Decision (Environmental Authorisation) conditions, tracking compliance with each condition, and managing condition discharge.
- **EMPr_Compliance**: The service responsible for tracking Environmental Management Programme compliance during construction, including monitoring requirements, incident reporting, and audit outcomes.
- **NEMA**: National Environmental Management Act 107 of 1998 — the primary legislation governing environmental management in South Africa.
- **EIA**: Environmental Impact Assessment — a regulated process under NEMA requiring assessment of potential environmental impacts before certain activities may proceed.
- **Basic_Assessment**: A streamlined environmental assessment process under NEMA EIA Regulations 2014 for activities listed in Listing Notice 1 (GN R983) and Listing Notice 3 (GN R985).
- **Scoping_and_EIR**: The full Scoping and Environmental Impact Report process under NEMA EIA Regulations 2014 for activities listed in Listing Notice 2 (GN R984).
- **Listed_Activities**: Activities listed in Government Notices R983, R984, and R985 under the NEMA EIA Regulations 2014 (as amended) that require environmental authorisation before commencement.
- **NHRA**: National Heritage Resources Act 25 of 1999 — legislation protecting South Africa's heritage resources.
- **Section_38**: Section 38 of the NHRA requiring notification to heritage resources authorities of certain categories of development and activities that may affect heritage resources.
- **SAHRA**: South African Heritage Resources Agency — the national body responsible for coordinating heritage resource management.
- **PHRA**: Provincial Heritage Resources Authority — a provincial body to which SAHRA may devolve functions for heritage resource management.
- **EMPr**: Environmental Management Programme — a document required under NEMA environmental authorisation conditions setting out measures to manage environmental impacts during construction and operation.
- **EA**: Environmental Authorisation — the formal authorisation (previously called Record of Decision) issued by the competent authority permitting listed activities to proceed subject to conditions.
- **ROD**: Record of Decision — the previous term for Environmental Authorisation; used interchangeably in legacy documentation and some provincial authorities.
- **DFFE**: Department of Forestry, Fisheries and the Environment — the national competent authority for environmental authorisation of activities in Listing Notice 2.
- **Competent_Authority**: The authority empowered to grant or refuse environmental authorisation — either DFFE (national) or the relevant provincial environmental department depending on the listing notice and activity type.
- **Disclaimer_Banner**: A persistent UI element stating that the system is advisory and does not constitute environmental or legal advice, requiring professional review for all decisions.

## Requirements

---

## Module A: Post-Occupancy & Facility Management Bridge (P2.8)

---

### Requirement 1: Handover Transition from Construction to Operations

**User Story:** As a building owner or facility manager, I want construction project data to transfer seamlessly into an operational building passport when the project closes, so that I retain full visibility of the building's construction history without requiring ongoing access to the construction project workspace.

#### Acceptance Criteria

1. WHEN a project reaches practical completion status in the Closeout module and a user holding the architect, bep, cpm, client, or developer role initiates the handover transition, THE FM_Bridge SHALL create a new Building_Passport record containing: building name, physical address, GPS coordinates (if recorded in Project Passport), construction completion date, main contractor name, principal agent name, and project reference number.
2. WHEN the Handover_Transition executes, THE FM_Bridge SHALL transfer the following data from the construction-phase Project Passport to the Building_Passport: as-built document register (all documents marked as "final" or "as-built" in the Documents module), installed product register (from SpecForge selections marked as "installed"), warranty certificates (from Closeout handover pack), compliance certificates (occupancy certificate, fire certificate, electrical certificate of compliance), and the defects liability period end date.
3. WHEN the Handover_Transition executes, THE FM_Bridge SHALL create initial entries in the Warranty_Register for every warranty item recorded in the Closeout handover pack, preserving: product/system description, supplier/manufacturer name, warranty period, warranty start date (practical completion date), warranty expiry date, and any warranty conditions or exclusions (maximum 1000 characters per item).
4. WHEN the Handover_Transition completes, THE FM_Bridge SHALL generate an Audit Trail record in both the source project and the new Building_Passport containing: transition date, initiating user identity, source project reference, count of documents transferred, count of warranties transferred, and count of assets created.
5. IF the source project has not reached practical completion status in the Closeout module, THEN THE FM_Bridge SHALL reject the handover transition request and indicate that practical completion must be certified before transition can proceed.
6. IF a user not holding the architect, bep, cpm, client, developer, or platform_admin role initiates the handover transition, THEN THE FM_Bridge SHALL reject the request and indicate insufficient permissions.
7. WHEN the Handover_Transition completes, THE FM_Bridge SHALL offer the building owner or designated facility manager the option to activate a recurring subscription for ongoing access to the Building_Passport, maintenance scheduling, and warranty tracking features.

### Requirement 2: Digital Building Passport

**User Story:** As a building owner or facility manager, I want a persistent digital record of my building that contains all relevant construction, compliance, and maintenance information, so that I have a single source of truth for building operations that lives on independently of the construction project.

#### Acceptance Criteria

1. THE Building_Passport SHALL maintain and display the following sections: building overview (name, address, construction date, building type, gross floor area in square metres, number of storeys), compliance record (certificates held with expiry dates), installed systems register (HVAC, electrical, plumbing, fire protection, lifts, security — each with make, model, installation date, and expected service life), key contacts (principal agent, main contractor, major subcontractors — with firm name and contact details), and document archive (all transferred as-built documents, certificates, and manuals).
2. THE Building_Passport SHALL be accessible to users granted the building_owner, facility_manager, or body_corporate_admin role on that building record, independently of any construction project access permissions.
3. WHEN a user with the building_owner or facility_manager role on a Building_Passport record grants access to another user, THE FM_Bridge SHALL create an access record with: granted user identity, role assigned (building_owner, facility_manager, body_corporate_admin, or read_only), granted by identity, and grant date.
4. WHEN a user with read_only access attempts to modify any Building_Passport data, THE FM_Bridge SHALL reject the modification and indicate that read-only users cannot modify building records.
5. THE Building_Passport SHALL persist independently of the source construction project — if the construction project workspace is archived or deleted, the Building_Passport and all transferred data SHALL remain accessible to authorised users.
6. WHEN the building subscription is active, THE Building_Passport SHALL display a subscription status indicator showing: plan type, renewal date, and subscription holder identity.
7. IF the building subscription lapses (payment not received within 30 calendar days of renewal date), THEN THE FM_Bridge SHALL restrict access to read-only mode for all users on that Building_Passport until the subscription is renewed, preserving all data without deletion.

### Requirement 3: Warranty Register with Expiry Tracking

**User Story:** As a building owner or facility manager, I want to track all building warranties with automated expiry alerts, so that I can claim against warranties before they lapse and plan for replacement costs after warranty periods end.

#### Acceptance Criteria

1. THE Warranty_Register SHALL maintain a register of warranty items displaying: item description, category (structural, mechanical, electrical, plumbing, finishes, equipment, or other), supplier/manufacturer name, warranty period in months, start date, expiry date, status (active, expired, claimed, or voided), and remaining days for active warranties.
2. WHEN a warranty expiry date is 90 calendar days away and the warranty status is active, THE Warranty_Register SHALL surface a notification in the Action Centre of all users with building_owner or facility_manager role on that Building_Passport.
3. WHEN a warranty expiry date is 30 calendar days away and the warranty status is active, THE Warranty_Register SHALL surface an urgent notification in the Action Centre of all users with building_owner or facility_manager role on that Building_Passport.
4. WHEN a warranty expiry date passes without a claim being lodged and the warranty status is active, THE Warranty_Register SHALL update the warranty status to expired.
5. WHEN a user lodges a warranty claim against an active warranty item, THE Warranty_Register SHALL capture: claim date, defect description (maximum 2000 characters), location in building (maximum 500 characters), photographic evidence references (minimum 0, maximum 10), and urgency (routine, urgent, or emergency), and SHALL update the warranty status to claimed.
6. THE Warranty_Register SHALL track warranty claims through stages: lodged → acknowledged by supplier → inspection scheduled → rectification in progress → rectified → closed, with only forward transitions permitted (and "closed" as the terminal state).
7. WHEN a user with the building_owner or facility_manager role adds a new warranty item manually (not via handover transition), THE Warranty_Register SHALL validate: item description (required, maximum 500 characters), category (required, from defined list), warranty period in months (required, range 1–240), start date (required), supplier name (required, maximum 200 characters).
8. IF a user attempts to lodge a warranty claim against an expired warranty, THEN THE Warranty_Register SHALL reject the claim and indicate that the warranty has expired, displaying the expiry date.

### Requirement 4: Asset Register

**User Story:** As a facility manager, I want a comprehensive register of all building assets with condition tracking and replacement planning data, so that I can manage building operations proactively and budget for future capital expenditure.

#### Acceptance Criteria

1. THE Asset_Register SHALL maintain a register of building assets with the following fields per asset: asset identifier (system-generated, unique per building), description (required, maximum 500 characters), category (structural, mechanical, electrical, plumbing, fire_protection, lifts, security, finishes, landscaping, or other), location in building (required, maximum 200 characters), manufacturer (maximum 200 characters), model number (maximum 100 characters), serial number (maximum 100 characters), installation date, expected useful life in years (range 1–100), replacement cost estimate in ZAR (range 0.01–999,999,999.99), condition (excellent, good, fair, poor, or failed), and last inspection date.
2. WHEN a user with the building_owner or facility_manager role creates or updates an asset record, THE Asset_Register SHALL record the change in the Building_Passport Audit Trail with: asset identifier, field changed, old value, new value, actor identity, and timestamp.
3. THE Asset_Register SHALL calculate and display the following summary metrics: total assets by category, total replacement value (sum of replacement cost estimates across all assets), assets approaching end of useful life (installation date plus expected useful life within 24 months of current date), assets in poor or failed condition, and assets overdue for inspection (last inspection date older than 12 months or not set).
4. WHEN an asset's installation date plus expected useful life is within 24 months of the current date, THE Asset_Register SHALL flag the asset as "approaching end of life" and surface a planning notification in the Action Centre of users with the building_owner or facility_manager role.
5. WHEN a user with the building_owner or facility_manager role updates an asset condition to "failed", THE Asset_Register SHALL surface an urgent action in the Action Centre recommending replacement planning and, if the asset has an active warranty in the Warranty_Register, SHALL indicate that a warranty claim may be applicable.
6. THE Asset_Register SHALL support bulk import of assets from a structured data file (CSV format) with column mapping for all required and optional fields, validating each row against the field rules and reporting validation errors by row number.
7. IF a user with read_only or body_corporate_admin role attempts to create, update, or delete an asset record, THEN THE Asset_Register SHALL reject the action and indicate that only building_owner or facility_manager roles may modify asset records.

### Requirement 5: Defects Liability Period Management

**User Story:** As a building owner or principal agent, I want to manage the defects liability period systematically with defect logging and contractor notification workflows, so that all defects are rectified before the DLP expires and the contractor's liability is properly enforced.

#### Acceptance Criteria

1. WHEN the Handover_Transition executes, THE DLP_Manager SHALL create a DLP record with: DLP start date (practical completion date), DLP end date (practical completion date plus DLP duration as recorded in the contract data sheet, defaulting to 90 calendar days if not specified), main contractor reference, and responsible principal agent reference.
2. THE DLP_Manager SHALL display a countdown showing the remaining calendar days until DLP expiry, updated daily, and SHALL surface notifications in the Action Centre at 60, 30, 14, and 7 calendar days before DLP expiry to users with the building_owner, facility_manager, architect, bep, or cpm role on the Building_Passport.
3. WHEN a user logs a defect during the DLP, THE DLP_Manager SHALL capture: defect description (required, maximum 2000 characters), location in building (required, maximum 500 characters), category (structural, mechanical, electrical, plumbing, finishes, external, or other), severity (critical, major, minor, or cosmetic), photographic evidence (minimum 0, maximum 10 references), date discovered, and responsible trade (maximum 200 characters).
4. THE DLP_Manager SHALL track each defect through stages: logged → notified to contractor → inspection scheduled → rectification in progress → rectified → verified → closed, with only forward transitions permitted and "closed" as the terminal state.
5. WHEN a defect is logged, THE DLP_Manager SHALL generate a contractor notification action in the Action Centre addressed to the main contractor (if the contractor has platform access) and to the principal agent, including the defect description, location, severity, and photographic evidence references.
6. WHEN the DLP expiry date passes, THE DLP_Manager SHALL update the DLP status to "expired" and generate a summary report listing: total defects logged, defects closed, defects outstanding (not yet at "closed" stage), and outstanding defects by severity.
7. IF a defect is logged after the DLP expiry date, THEN THE DLP_Manager SHALL accept the defect record but flag it as "post-DLP" and display a notice that the defect was recorded after the defects liability period expired, with a disclaimer that entitlement to rectification at contractor's cost requires contractual and legal review.
8. WHEN all defects logged during the DLP reach "closed" stage, THE DLP_Manager SHALL update the DLP status to "all defects resolved" and surface a notification recommending final account settlement consideration.

### Requirement 6: Planned Preventive Maintenance Scheduling

**User Story:** As a facility manager, I want the system to generate maintenance schedules based on installed building systems and equipment, so that I can implement a structured preventive maintenance programme that extends asset life and maintains building performance.

#### Acceptance Criteria

1. WHEN a building has assets registered in the Asset_Register, THE Maintenance_Scheduler SHALL allow the facility manager to create PPM_Schedule entries for each asset or asset category, capturing: maintenance task description (required, maximum 500 characters), frequency (daily, weekly, monthly, quarterly, semi-annually, annually, or custom interval in days range 1–3650), responsible party (internal staff description or external contractor name, maximum 200 characters), estimated duration in hours (range 0.25–999), estimated cost per occurrence in ZAR (range 0.01–999,999.99), and priority (critical, high, medium, or low).
2. THE Maintenance_Scheduler SHALL generate a calendar view displaying all scheduled maintenance tasks for the current month, next month, and a 12-month forward view, with tasks colour-coded by priority (critical = red, high = amber, medium = blue, low = grey).
3. WHEN a scheduled maintenance task date arrives, THE Maintenance_Scheduler SHALL surface a task notification in the Action Centre of the user with the facility_manager role on that Building_Passport, including: task description, asset reference, estimated duration, and responsible party.
4. THE Maintenance_Scheduler SHALL track each maintenance occurrence through states: scheduled → in_progress → completed → verified, with only forward transitions permitted and "verified" as the terminal state indicating the maintenance was satisfactorily performed.
5. WHEN a scheduled maintenance task is not marked as "in_progress" or "completed" within 7 calendar days of the scheduled date, THE Maintenance_Scheduler SHALL flag the task as overdue and surface an overdue alert in the Action Centre of the facility_manager.
6. THE Maintenance_Scheduler SHALL maintain a maintenance history per asset showing: all completed maintenance occurrences, completion dates, actual cost incurred (if recorded), and any notes (maximum 1000 characters per occurrence).
7. THE Maintenance_Scheduler SHALL calculate and display summary metrics: total scheduled tasks per period, completed vs overdue tasks, total estimated annual maintenance cost, and assets with no maintenance schedule defined.
8. WHEN a user creates a PPM_Schedule entry, THE Maintenance_Scheduler SHALL validate that the referenced asset exists in the Asset_Register for that building and that all required fields are provided with values within specified ranges.

### Requirement 7: FM Bridge Subscription and Access Model

**User Story:** As a platform operator, I want the post-occupancy features to operate on a recurring subscription model with graceful degradation on lapse, so that building owners retain their data while the platform generates recurring revenue from ongoing facility management services.

#### Acceptance Criteria

1. THE FM_Bridge SHALL support three subscription tiers: Basic (Building_Passport view-only, warranty expiry alerts, DLP tracking), Standard (Basic plus Asset_Register, Warranty_Register with claims, DLP management), and Premium (Standard plus Maintenance_Scheduler, maintenance history, full reporting, bulk asset import).
2. WHEN a Handover_Transition completes, THE FM_Bridge SHALL provision a 90-calendar-day trial of the Premium tier for the designated building owner, after which the subscription must be activated to retain full access.
3. WHEN the trial period expires without subscription activation, THE FM_Bridge SHALL restrict access to the Basic tier features and display a subscription activation prompt on each login.
4. WHEN a subscription payment fails and the grace period (30 calendar days) expires, THE FM_Bridge SHALL downgrade the building to read-only mode preserving all data, and SHALL surface a renewal prompt in the Action Centre of the building_owner.
5. THE FM_Bridge SHALL support subscription management operations: activate subscription (selecting tier), upgrade tier, downgrade tier (effective at next billing cycle), and cancel subscription (effective at current billing cycle end with 30-day data retention in read-only mode before potential archival).
6. WHEN a subscription is cancelled and the 30-day data retention period expires, THE FM_Bridge SHALL archive the Building_Passport data (not delete) and display a reactivation option — reactivation restores full data access upon payment.
7. THE FM_Bridge SHALL record all subscription status changes in the Building_Passport Audit Trail including: action type, old tier, new tier, effective date, actor identity, and timestamp.

---

## Module B: Practice Management for Small/Medium Firms (P2.9)

---

### Requirement 8: Enquiry Pipeline

**User Story:** As a practice principal or business development manager, I want to track potential projects from initial enquiry through to appointment, so that I can manage my firm's sales pipeline, measure conversion rates, and forecast future workload.

#### Acceptance Criteria

1. WHEN a user with the firm_admin or owner FirmRole creates a new enquiry, THE Enquiry_Pipeline SHALL capture: enquiry source (referral, website, repeat_client, tender_notice, or other), client name (required, maximum 200 characters), client contact email (valid email format), client contact phone (valid SA phone format, optional), project description (required, maximum 2000 characters), estimated project value in ZAR (range 0.01–999,999,999.99), estimated fee value in ZAR (range 0.01–99,999,999.99), discipline (architecture, engineering, quantity_surveying, project_management, town_planning, or multi_discipline), expected start date (optional), and enquiry date (defaults to current date).
2. THE Enquiry_Pipeline SHALL track each enquiry through stages: lead → quote_sent → quote_accepted → appointed → active → complete, with permitted transitions: lead → quote_sent, quote_sent → quote_accepted or lost, quote_accepted → appointed or lost, appointed → active, active → complete or on_hold, on_hold → active or lost, and lost as a terminal state reachable from quote_sent, quote_accepted, active, or on_hold stages.
3. WHEN an enquiry transitions to "lost", THE Enquiry_Pipeline SHALL require a loss reason (selected from: price, scope_mismatch, competitor_won, client_cancelled, timeline, relationship, or other) and optional notes (maximum 1000 characters).
4. THE Enquiry_Pipeline SHALL display a pipeline dashboard showing: total enquiries by stage, total estimated fee value by stage, conversion rate (enquiries reaching appointed stage divided by total enquiries, expressed as a percentage), average time per stage in calendar days, and win/loss ratio for the current month and trailing 12 months.
5. WHEN an enquiry transitions from "appointed" to "active", THE Enquiry_Pipeline SHALL offer to create a linked project record in the Practice_Engine WIP tracking system, pre-populated with: client name, project description, estimated fee value, and discipline.
6. THE Enquiry_Pipeline SHALL support filtering and sorting the pipeline by: stage, discipline, estimated value range, enquiry date range, and client name search.
7. WHEN an enquiry remains in the same stage for more than 30 calendar days without activity, THE Enquiry_Pipeline SHALL surface a "stale enquiry" notification in the Action Centre of the firm_admin or owner who created it.
8. THE Enquiry_Pipeline SHALL record all stage transitions in the firm Audit Trail with: enquiry reference, previous stage, new stage, actor identity, and timestamp.

### Requirement 9: WIP Tracking per Project per Discipline

**User Story:** As a practice principal or finance manager, I want to see Work in Progress broken down by project and discipline with real-time visibility of unbilled time, so that I can manage cash flow, identify projects that need invoicing, and prevent revenue leakage.

#### Acceptance Criteria

1. THE WIP_Tracker SHALL calculate WIP per project as: total billable hours recorded (from Timesheet_Engine) multiplied by the applicable charge-out rate, plus unbilled disbursements, minus invoiced amounts (from Billing_Bridge), displaying: total WIP value in ZAR, billable hours not yet invoiced, unbilled disbursements value, and last invoice date.
2. THE WIP_Tracker SHALL support WIP calculation per discipline within a multi-discipline project, where each discipline has its own fee budget, charge-out rates, and timesheet entries, displaying the same metrics as criterion 1 at discipline level.
3. THE WIP_Tracker SHALL display a firm-wide WIP dashboard showing: total WIP across all active projects, WIP by project (sorted by WIP value descending), WIP by discipline, WIP ageing (0–30 days, 31–60 days, 61–90 days, 90+ days since time was recorded), and total number of projects with WIP exceeding their fee budget.
4. WHEN a project's accumulated WIP value exceeds 80% of the total fee budget for that project, THE WIP_Tracker SHALL surface a warning in the Action Centre of the firm_admin or owner indicating that the project is approaching fee budget exhaustion.
5. WHEN a project's accumulated WIP value exceeds 100% of the total fee budget, THE WIP_Tracker SHALL surface a critical alert in the Action Centre of the firm_admin or owner indicating fee budget overrun, with the overrun amount and percentage displayed.
6. THE WIP_Tracker SHALL recalculate WIP values within 60 seconds of any timesheet entry approval, disbursement recording, or invoice creation that affects the calculation.
7. THE WIP_Tracker SHALL support manual WIP adjustments (write-downs) by the firm_admin or owner, capturing: adjustment amount in ZAR, reason (maximum 500 characters), adjusted by identity, and date, and SHALL record the adjustment in the firm Audit Trail.
8. IF a project has no fee budget configured, THEN THE WIP_Tracker SHALL still calculate and display WIP but SHALL not generate budget threshold alerts, and SHALL display an indicator that no budget is set.

### Requirement 10: Timesheet and Billing Bridge

**User Story:** As a practice staff member, I want to record my time against projects and activities, and as a practice principal I want approved timesheets to convert into draft invoices, so that the firm can bill accurately and efficiently without manual data re-entry.

#### Acceptance Criteria

1. WHEN a staff member records a timesheet entry, THE Timesheet_Engine SHALL capture: date (required, not in the future), project reference (required, from active practice projects), activity category (design, documentation, administration, site_visit, meeting, travel, research, or other), hours (required, range 0.25–24.00 in 0.25 increments), description (required, maximum 500 characters), and billable flag (boolean, defaults to true).
2. THE Timesheet_Engine SHALL enforce that a staff member cannot record more than 24 total hours (sum of all entries) for a single calendar day, rejecting any entry that would exceed the daily maximum.
3. THE Timesheet_Engine SHALL support a weekly timesheet view where the staff member can see and edit entries for a 7-day period, with daily totals, weekly total, and billable vs non-billable split displayed.
4. WHEN a staff member submits their weekly timesheet for approval, THE Timesheet_Engine SHALL route the submission to the firm_admin or owner for review and SHALL surface an approval action in the Action Centre of the approver.
5. WHEN a firm_admin or owner approves a timesheet submission, THE Timesheet_Engine SHALL lock the approved entries from further editing and mark them as "approved" and available for billing.
6. WHEN the firm_admin or owner initiates invoice generation for a project, THE Billing_Bridge SHALL compile all approved, unbilled timesheet entries for that project and present a draft invoice showing: line items grouped by activity category or staff member (configurable), hours, rate, and line total, plus any recorded disbursements, subtotal, VAT at 15%, and grand total.
7. THE Billing_Bridge SHALL support three billing models per project (configured at project setup): hourly (bill actual hours at charge-out rate), fixed_fee (bill against agreed fee milestones as a percentage of total fee), and percentage_of_construction (bill as a percentage of construction cost per SACAP/ECSA fee scale stage).
8. WHEN a draft invoice is approved by the firm_admin or owner, THE Billing_Bridge SHALL mark all included timesheet entries as "invoiced", update the WIP_Tracker to reduce WIP by the invoiced amount, record the invoice in the firm Audit Trail, and generate a PDF invoice document.
9. IF a staff member attempts to edit a timesheet entry that has been approved or invoiced, THEN THE Timesheet_Engine SHALL reject the edit and indicate that approved or invoiced entries cannot be modified.
10. THE Timesheet_Engine SHALL calculate and display per-staff-member metrics: total hours this week, total hours this month, billable percentage (billable hours divided by total hours), and utilisation rate (billable hours divided by available hours, where available hours equals working days in period multiplied by 8).

### Requirement 11: Project Profitability Dashboard

**User Story:** As a practice principal, I want to see real-time profitability metrics for each project and across the practice, so that I can identify underperforming projects early and make informed decisions about resource allocation and pricing.

#### Acceptance Criteria

1. THE Profitability_Dashboard SHALL calculate and display per-project profitability metrics: total fee (agreed project fee), revenue recognised (invoiced amount from Billing_Bridge), total cost (sum of: staff hours multiplied by internal cost rate, plus disbursements), gross margin (revenue minus cost), gross margin percentage ((revenue minus cost) divided by revenue, expressed as a percentage), effective hourly rate (revenue divided by total hours recorded), and budget burn rate (cost to date divided by total fee, expressed as a percentage).
2. THE Profitability_Dashboard SHALL display a firm-wide summary showing: total revenue (current financial year), total costs, overall margin percentage, number of profitable projects (margin > 0%), number of loss-making projects (margin < 0%), average effective hourly rate across all projects, and top 5 most profitable and top 5 least profitable projects by margin percentage.
3. WHEN a project's gross margin percentage falls below a firm-configured threshold (default 20%, configurable range 0–100%), THE Profitability_Dashboard SHALL flag the project as "underperforming" and surface a notification in the Action Centre of the firm_admin or owner.
4. THE Profitability_Dashboard SHALL support internal cost rate configuration per staff member (range R50.00–R5,000.00 per hour), used for margin calculations, separately from the client-facing charge-out rate.
5. THE Profitability_Dashboard SHALL update metrics within 60 seconds of any timesheet approval, invoice creation, or disbursement recording that affects the underlying calculations.
6. THE Profitability_Dashboard SHALL support date range filtering: current month, current quarter, current financial year (configurable start month, default March), trailing 12 months, and custom date range.
7. WHEN a user with staff or coordinator FirmRole views the Profitability_Dashboard, THE Practice_Engine SHALL restrict visibility to only projects the user is assigned to, hiding firm-wide summary metrics, unless the firm_admin has explicitly granted practice-wide visibility to that user.

### Requirement 12: Capacity Planning

**User Story:** As a practice principal, I want to see current staff allocation and forecast future resource demand against pipeline and active projects, so that I can make informed decisions about hiring, outsourcing, and project acceptance.

#### Acceptance Criteria

1. THE Capacity_Planner SHALL display each staff member's allocation showing: staff name, discipline, total available hours per week (default 40, configurable per staff member range 8–60), currently allocated hours per week (sum of hours allocated to active projects), available capacity (available hours minus allocated hours), and utilisation percentage (allocated divided by available, expressed as a percentage).
2. THE Capacity_Planner SHALL support project-level resource allocation where the firm_admin or owner assigns staff members to projects with: allocated hours per week (range 1–60), allocation start date, and allocation end date (optional, defaults to project estimated completion date).
3. THE Capacity_Planner SHALL display a firm-wide capacity summary showing: total firm capacity (sum of available hours across all staff), total allocated (sum of allocated hours), total available (capacity minus allocated), firm utilisation percentage, and staff members with utilisation below 50% or above 100%.
4. THE Capacity_Planner SHALL provide a 12-week forward capacity forecast based on current project allocations and pipeline enquiries (from Enquiry_Pipeline entries at quote_sent or quote_accepted stage, weighted by a configurable conversion probability per stage: quote_sent default 30%, quote_accepted default 70%).
5. WHEN firm utilisation exceeds 85% for the current or any future forecast week, THE Capacity_Planner SHALL surface a capacity warning in the Action Centre of the firm_admin or owner indicating the week(s) at risk and suggesting review of pipeline acceptance or resource planning.
6. WHEN a staff member's allocated hours exceed their available hours for any week, THE Capacity_Planner SHALL flag the over-allocation and display a warning on both the staff member's allocation view and the firm-wide summary.
7. THE Capacity_Planner SHALL support leave recording per staff member (date range, leave type: annual, sick, study, or other) which reduces available hours for the affected period and adjusts utilisation calculations accordingly.

### Requirement 13: Staff PI Insurance and Professional Registration Tracking

**User Story:** As a firm principal, I want to track each staff member's professional registration status and PI insurance expiry, so that the firm maintains compliance with statutory registration requirements and professional indemnity cover obligations.

#### Acceptance Criteria

1. THE Staff_Compliance_Tracker SHALL maintain per-staff-member records containing: registration body (SACAP, ECSA, SACQSP, SACPCMP, PLATO, or other with custom name), registration number (required, maximum 50 characters), registration category (e.g., Professional Architect, Candidate Architect, Professional Engineer, Technologist), registration expiry date (or "lifetime" for non-expiring registrations), PI insurance policy number (maximum 100 characters), PI insurance expiry date, and PI insurance sum insured in ZAR.
2. WHEN a staff member's PI insurance expiry date is 60 calendar days away, THE Staff_Compliance_Tracker SHALL surface a renewal warning in the Action Centre of the firm_admin or owner and the affected staff member.
3. WHEN a staff member's PI insurance expiry date is 30 calendar days away, THE Staff_Compliance_Tracker SHALL surface an urgent renewal warning in the Action Centre of the firm_admin or owner and the affected staff member.
4. WHEN a staff member's PI insurance has expired (expiry date has passed without a renewal being recorded), THE Staff_Compliance_Tracker SHALL flag the staff member as "PI lapsed" and surface a critical alert in the Action Centre of the firm_admin or owner, indicating that the staff member may not have valid professional indemnity cover.
5. WHEN a staff member's professional registration has a finite expiry date and that date is 90 calendar days away, THE Staff_Compliance_Tracker SHALL surface a renewal warning in the Action Centre of the firm_admin or owner and the affected staff member.
6. THE Staff_Compliance_Tracker SHALL display a firm-wide compliance dashboard showing: total staff members tracked, staff with valid PI (expiry in future), staff with lapsed PI, staff with registration expiring within 90 days, and an overall compliance score (percentage of staff with both valid PI and current registration).
7. THE Staff_Compliance_Tracker SHALL integrate with the Trust & Verification module by exposing registration and PI status data for use in professional verification checks and BEP matching workflows.
8. WHEN a staff member's registration or PI insurance record is created or updated, THE Staff_Compliance_Tracker SHALL record the change in the firm Audit Trail with: staff member identity, field changed, old value, new value, actor identity, and timestamp.
9. THE Staff_Compliance_Tracker SHALL display an advisory disclaimer stating that registration and insurance status displayed is based on manually entered data and that the firm remains responsible for independently verifying registration status with the relevant statutory body.

### Requirement 14: Practice Management Subscription and Standalone Operation

**User Story:** As a practice principal, I want the practice management module to operate as a standalone subscription product that works independently of active construction projects, so that my firm can use it for all business operations regardless of whether projects are managed on the Architex construction platform.

#### Acceptance Criteria

1. THE Practice_Engine SHALL operate independently of the Architex construction project workspace — firms SHALL be able to use enquiry pipeline, timesheets, WIP tracking, billing, profitability, capacity planning, and staff compliance features without creating or being associated with any construction project on the platform.
2. THE Practice_Engine SHALL be scoped to the Firm entity (as defined in the existing `src/types.ts` Firm interface), requiring a valid Firm record with an active subscription to access practice management features.
3. THE Practice_Engine SHALL support two subscription tiers: Essentials (enquiry pipeline, timesheets, basic billing, staff compliance tracking — for firms up to 10 staff) and Professional (Essentials plus WIP tracking, profitability dashboard, capacity planning, advanced billing models, unlimited staff).
4. WHEN a firm registers for practice management, THE Practice_Engine SHALL provision a 30-calendar-day trial of the Professional tier, after which the firm must select and activate a paid subscription to retain access.
5. WHEN the trial period expires without subscription activation, THE Practice_Engine SHALL restrict the firm to read-only access to existing data and disable new entry creation until a subscription is activated.
6. THE Practice_Engine SHALL support monthly and annual billing cycles, with annual billing offered at a discount (configurable by platform_admin, default 15% discount on the equivalent monthly cost).
7. WHEN a subscription is downgraded from Professional to Essentials and the firm has more than 10 staff members with active timesheet records, THE Practice_Engine SHALL retain all historical data but restrict new timesheet entry creation to 10 designated staff members selected by the firm_admin.
8. THE Practice_Engine SHALL optionally integrate with the Architex construction project workspace — when a firm has both a practice management subscription and active construction projects, THE Practice_Engine SHALL allow linking practice projects to construction project records for seamless timesheet and billing data flow.
9. THE Practice_Engine SHALL enforce firm-level data isolation — no practice management data (timesheets, WIP, pipeline, billing) SHALL be visible to users outside the firm, regardless of platform role.

---

## Module C: Environmental & Heritage Impact (P2.10)

---

### Requirement 15: EIA/Basic Assessment Trigger Checklist

**User Story:** As a town planner, developer, or environmental professional, I want to screen my project against NEMA Listed Activities to determine whether an Environmental Impact Assessment or Basic Assessment is required, so that I can identify environmental authorisation obligations early in the project lifecycle and plan accordingly.

#### Acceptance Criteria

1. THE EIA_Checker SHALL present a structured checklist organised by NEMA EIA Regulations 2014 listing notices: Listing Notice 1 (GN R983 — Basic Assessment activities), Listing Notice 2 (GN R984 — Scoping and EIR activities), and Listing Notice 3 (GN R985 — provincial/location-specific Basic Assessment activities), with each listed activity rendered as a selectable checklist item showing the activity number and a plain-language summary description.
2. WHEN a user selects one or more listed activities as potentially triggered, THE EIA_Checker SHALL determine the required assessment process: if any Listing Notice 2 activity is selected, the result is "Scoping and EIR required"; if only Listing Notice 1 and/or Listing Notice 3 activities are selected, the result is "Basic Assessment required"; if no listed activities are selected, the result is "No environmental authorisation required based on screening".
3. WHEN the screening is complete, THE EIA_Checker SHALL generate a screening report displaying: project name, screening date, user who performed screening, activities selected (by listing notice and activity number), determined assessment process, identified competent authority (DFFE for Listing Notice 2 activities; provincial environmental department for Listing Notice 1 and 3 only), and a recommendation for next steps.
4. THE EIA_Checker SHALL support geographic context by allowing the user to specify: province, municipality, and whether the site is within a specified geographical area listed in Listing Notice 3 (coastal zone, urban area, or sensitive environment), which refines Listing Notice 3 applicability.
5. WHEN the screening result indicates an assessment is required, THE EIA_Checker SHALL update the Project Passport with an environmental compliance flag indicating: assessment type required, date of screening, and status (screening complete — assessment not yet initiated).
6. THE EIA_Checker SHALL display a prominent Disclaimer_Banner stating: "This screening tool is advisory only and does not constitute a formal determination of environmental authorisation requirements. The applicant must engage a registered Environmental Assessment Practitioner (EAP) to conduct the formal screening and lodge applications with the competent authority. Listed activity descriptions are simplified summaries — refer to the full gazetted regulations for definitive text."
7. IF the user attempts to perform a screening without selecting a province, THEN THE EIA_Checker SHALL reject the submission and indicate that the province is required for accurate Listing Notice 3 assessment.
8. WHEN a screening is completed, THE EIA_Checker SHALL record the screening in the project Audit Trail with: screening date, user identity, activities selected, determination result, and competent authority identified.

### Requirement 16: Environmental Authorisation Tracking

**User Story:** As an environmental professional or developer, I want to track the Environmental Authorisation application through the regulatory process from pre-application to decision and appeal, so that the project team has visibility of the EA status and critical deadlines are not missed.

#### Acceptance Criteria

1. WHEN a user creates an Environmental Authorisation application record, THE EA_Tracker SHALL capture: application reference number (from competent authority, maximum 100 characters), applicant name (maximum 200 characters), EAP name and registration number (maximum 200 characters each), assessment type (Basic_Assessment or Scoping_and_EIR), competent authority (DFFE or provincial department name), listed activities triggered (cross-referenced to EIA_Checker screening if available), and application submission date.
2. THE EA_Tracker SHALL track the application through stages appropriate to the assessment type. For Basic_Assessment: pre-application → application submitted → acknowledgement received → public participation → comments period closed → specialist studies → BAR submitted → authority review → decision issued → appeal period. For Scoping_and_EIR: pre-application → scoping report submitted → authority acceptance of scoping → specialist studies → EIR submitted → authority review → decision issued → appeal period. Permitted transitions SHALL be sequential only, with "decision issued" branching to either "EA granted" or "EA refused", and "appeal period" optionally advancing to "appeal lodged" → "appeal decision".
3. WHEN an application transitions to a new stage, THE EA_Tracker SHALL record the transition in the project Audit Trail with: application reference, previous stage, new stage, transition date, actor identity, and any stage-specific data (e.g., decision reference number for "decision issued" stage).
4. THE EA_Tracker SHALL calculate and display regulatory timeframe compliance based on NEMA EIA Regulations 2014 prescribed periods: Basic Assessment — competent authority must decide within 107 calendar days of acceptance; Scoping — acceptance of scoping report within 43 calendar days of submission; EIR — decision within 107 calendar days of acceptance. THE EA_Tracker SHALL display elapsed days per stage against prescribed maximum.
5. WHEN a prescribed regulatory timeframe is within 14 calendar days of expiry, THE EA_Tracker SHALL surface a warning in the Action Centre of users with the town_planner, developer, or energy_professional role on that project.
6. WHEN the EA decision is issued (granted or refused), THE EA_Tracker SHALL update the Project Passport with: EA status (granted/refused), decision date, appeal period end date (20 calendar days from decision for appeals to Minister/MEC), and any conditions of authorisation reference.
7. THE EA_Tracker SHALL display the Disclaimer_Banner stating: "Environmental Authorisation tracking is advisory. Actual regulatory timeframes and requirements must be confirmed with the competent authority. This tool does not constitute legal advice regarding NEMA compliance."
8. IF a user not holding the town_planner, developer, architect, bep, energy_professional, or platform_admin role on the project attempts to create or advance an EA application, THEN THE EA_Tracker SHALL reject the action and indicate insufficient permissions.

### Requirement 17: Heritage Impact Assessment Workflow (NHRA Section 38)

**User Story:** As a town planner or developer, I want to manage the heritage impact assessment process under NHRA Section 38, so that the project complies with heritage resource protection requirements and heritage permits are obtained before construction commences.

#### Acceptance Criteria

1. WHEN a user creates a heritage assessment record, THE Heritage_Workflow SHALL capture: project site description (required, maximum 2000 characters), Section 38 trigger category (selected from: construction of road/wall/powerline/pipeline exceeding 300m in length; any development exceeding 5000 square metres; rezoning of site exceeding 10000 square metres; any activity that will alter the character of a site exceeding 5000 square metres; or other activity requiring notification under Section 38(1)), heritage authority (SAHRA or applicable PHRA name, maximum 200 characters), notification date, and site coordinates (latitude and longitude in decimal degrees, optional).
2. THE Heritage_Workflow SHALL track the assessment through stages: notification submitted → interim comment received → assessment required (if determined by heritage authority) → Heritage Impact Assessment undertaken → HIA report submitted → heritage authority review → permit issued or no further action required. The alternative path from "interim comment received" is directly to "no further action required" if the heritage authority determines no HIA is needed.
3. WHEN a heritage assessment transitions to "assessment required", THE Heritage_Workflow SHALL prompt the user to record the appointed Heritage Assessment Practitioner's details: name (maximum 200 characters), firm name (maximum 200 characters), and contact email (valid email format).
4. WHEN the heritage authority issues a permit or "no further action" determination, THE Heritage_Workflow SHALL update the Project Passport with: heritage compliance status (cleared or permit_held), determination date, permit reference number (if applicable, maximum 100 characters), and any conditions imposed.
5. THE Heritage_Workflow SHALL integrate with the Municipal Compliance module (town-planning feature) by surfacing the heritage status as a prerequisite check in the municipal readiness assessment — if the project triggers Section 38 and heritage clearance is not obtained, the municipal readiness check SHALL flag it as an outstanding compliance item.
6. WHEN a heritage assessment is created, THE Heritage_Workflow SHALL record the creation in the project Audit Trail and surface a notification in the Action Centre of the project's town_planner and developer roles.
7. THE Heritage_Workflow SHALL display the Disclaimer_Banner stating: "Heritage impact tracking is advisory. Section 38 notification requirements, heritage authority determinations, and permit conditions must be confirmed directly with SAHRA or the relevant Provincial Heritage Resources Authority. This tool does not provide heritage assessment opinions or recommendations."
8. IF the heritage authority imposes conditions on the permit, THE Heritage_Workflow SHALL create condition entries in the ROD_Register (shared with Environmental Authorisation conditions) for condition compliance tracking.

### Requirement 18: Record of Decision / Environmental Authorisation Conditions Register

**User Story:** As an environmental professional or project manager, I want to track each condition imposed by the Environmental Authorisation or heritage permit and manage compliance with those conditions, so that the project maintains compliance throughout construction and avoids enforcement action.

#### Acceptance Criteria

1. WHEN an EA decision or heritage permit with conditions is recorded, THE ROD_Register SHALL allow the user to create condition entries, each capturing: condition number (sequential per authorisation), condition text (required, maximum 2000 characters), compliance category (pre-construction, construction, operational, or ongoing), responsible party description (maximum 200 characters), compliance deadline (specific date, or "ongoing" for continuous conditions), and verification method (inspection, report_submission, monitoring_data, audit, or self_declaration).
2. THE ROD_Register SHALL track each condition through compliance states: outstanding → in_progress → evidence_submitted → verified_compliant, with only forward transitions permitted and "verified_compliant" as the terminal state.
3. WHEN a condition has a specific compliance deadline and that deadline is 30 calendar days away with the condition status still "outstanding" or "in_progress", THE ROD_Register SHALL surface a warning in the Action Centre of the responsible party (if they have platform access) and the project's town_planner and developer roles.
4. WHEN a condition deadline passes without the condition reaching "evidence_submitted" or "verified_compliant" status, THE ROD_Register SHALL flag the condition as "overdue" and surface a critical alert in the Action Centre of the project's town_planner, developer, and platform_admin roles, indicating potential non-compliance with the Environmental Authorisation.
5. THE ROD_Register SHALL display a compliance summary per authorisation showing: total conditions, conditions by compliance category, conditions verified compliant, conditions outstanding, conditions overdue, and overall compliance percentage (verified compliant divided by total conditions).
6. WHEN evidence is submitted against a condition (document references from the Documents module, site inspection records from Site Execution, or monitoring data reports), THE ROD_Register SHALL record: evidence type, evidence reference, submission date, and submitting user identity.
7. THE ROD_Register SHALL integrate with the Project Passport by updating the environmental compliance status whenever the overall compliance percentage changes, recording: total conditions, compliant count, outstanding count, overdue count, and last updated timestamp.
8. THE ROD_Register SHALL display the Disclaimer_Banner stating: "Condition compliance tracking is advisory. The applicant remains legally responsible for compliance with all conditions of Environmental Authorisation and heritage permits. This tool does not confirm regulatory compliance — formal compliance verification requires audit by an independent Environmental Control Officer (ECO) or heritage practitioner."

### Requirement 19: EMPr Compliance During Construction

**User Story:** As a site manager or environmental professional, I want to track Environmental Management Programme compliance during the construction phase, so that the project demonstrates ongoing adherence to environmental conditions and can produce evidence for ECO audits.

#### Acceptance Criteria

1. WHEN a project has an active Environmental Authorisation with an approved EMPr, THE EMPr_Compliance service SHALL allow the user to create an EMPr compliance record capturing: EMPr reference document (linked to Documents module), EMPr approval date, Environmental Control Officer (ECO) name (required, maximum 200 characters), ECO contact email (valid email format), audit frequency (weekly, fortnightly, monthly, or quarterly), and construction phase (bulk earthworks, substructure, superstructure, services_installation, finishes, or external_works).
2. THE EMPr_Compliance service SHALL generate scheduled ECO audit reminders based on the configured audit frequency, surfacing notifications in the Action Centre of the site_manager and ECO contact (if they have platform access) at 7 calendar days and 1 calendar day before each scheduled audit date.
3. WHEN an ECO audit is completed, THE EMPr_Compliance service SHALL allow recording of: audit date, auditor name, overall compliance rating (compliant, minor_non_conformance, major_non_conformance, or critical_non_conformance), findings count by severity (observations, minor, major, critical), corrective actions required (minimum 0, maximum 50 per audit, each with: finding description maximum 500 characters, severity, responsible party, and deadline), and audit report document reference (from Documents module).
4. THE EMPr_Compliance service SHALL track each corrective action through states: issued → in_progress → completed → verified_closed, with only forward transitions permitted and "verified_closed" as the terminal state.
5. WHEN a corrective action deadline passes without the action reaching "completed" or "verified_closed" status, THE EMPr_Compliance service SHALL flag it as overdue and surface an alert in the Action Centre of the site_manager and responsible party.
6. THE EMPr_Compliance service SHALL integrate with the Site Execution module by allowing environmental incidents (spills, unauthorised clearing, dust complaints, water pollution) to be logged as part of the daily site log with: incident type (spill, clearing, dust, water_pollution, noise, waste, or other), description (maximum 1000 characters), location on site (maximum 200 characters), photographic evidence references (minimum 0, maximum 10), and immediate remedial action taken (maximum 1000 characters).
7. THE EMPr_Compliance service SHALL maintain a compliance history dashboard showing: total audits conducted, audits by compliance rating, total corrective actions issued, corrective actions closed vs outstanding, environmental incidents logged, and a compliance trend (rating per audit over time).
8. THE EMPr_Compliance service SHALL update the Project Passport with environmental compliance status based on the most recent ECO audit rating: "compliant" for compliant rating, "at risk" for minor_non_conformance, and "non-compliant" for major or critical non-conformance.
9. THE EMPr_Compliance service SHALL display the Disclaimer_Banner stating: "EMPr compliance tracking is advisory and does not replace the statutory duties of the Environmental Control Officer. The holder of the Environmental Authorisation remains legally responsible for compliance. This tool records information only and does not constitute an environmental audit or compliance certification."

### Requirement 20: Environmental & Heritage Integration with Platform Modules

**User Story:** As a project manager, I want environmental and heritage assessment data to integrate with Municipal Compliance, Project Passport, Documents, and Site Execution modules, so that environmental compliance is visible as part of the overall project health picture and informs construction readiness decisions.

#### Acceptance Criteria

1. WHEN the EIA_Checker determines that environmental authorisation is required for a project, THE Environmental_Engine SHALL update the Municipal Compliance module's readiness checklist with an "Environmental Authorisation" line item showing status: pending (screening complete, application not yet submitted), in_progress (application submitted, decision not yet issued), cleared (EA granted), or blocked (EA refused or appeal pending).
2. WHEN the Heritage_Workflow determines that a Section 38 assessment is required, THE Environmental_Engine SHALL update the Municipal Compliance module's readiness checklist with a "Heritage Clearance" line item showing status: pending (notification submitted, response awaited), in_progress (HIA underway), cleared (permit issued or no further action), or blocked (permit refused or conditions not met).
3. THE Environmental_Engine SHALL prevent construction commencement recommendation in the Project Passport if either: Environmental Authorisation status is "pending" or "in_progress" for a project with triggered listed activities, or Heritage Clearance status is "pending" or "in_progress" for a project with a triggered Section 38 assessment. THE Environmental_Engine SHALL display these as blocking items in the construction readiness assessment.
4. WHEN environmental or heritage documents are uploaded (screening reports, BAR, EIR, HIA reports, permits, ECO audit reports), THE Environmental_Engine SHALL register them in the Documents module with metadata: document type (environmental_screening, basic_assessment_report, scoping_report, eir, heritage_notification, hia_report, environmental_authorisation, heritage_permit, empr, eco_audit_report), application reference, and upload date.
5. WHEN the Site Execution module records a daily site log entry, THE EMPr_Compliance service SHALL make the environmental incident logging capability available as part of the daily log interface, pre-filling the site reference and date from the active site log.
6. THE Environmental_Engine SHALL expose environmental and heritage compliance status to the Risk Engine, creating risk events for: EA application overdue (prescribed period exceeded), heritage clearance pending with construction start approaching, EMPr audit rating of major or critical non-conformance, and ROD condition overdue.
7. THE Environmental_Engine SHALL write all status changes, screening results, stage transitions, and compliance events as immutable records in the project Audit Trail, each record including: timestamp, actor identity, event type, module source (EIA_Checker, EA_Tracker, Heritage_Workflow, ROD_Register, or EMPr_Compliance), and event-specific data.
8. THE Environmental_Engine SHALL display the advisory-only Disclaimer_Banner on all environmental and heritage module interfaces, and SHALL not generate automated environmental opinions, legal interpretations, or compliance certifications.
