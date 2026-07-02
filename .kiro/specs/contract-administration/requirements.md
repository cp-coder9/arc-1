# Requirements Document

## Introduction

The Contract Administration & Legal Layer provides contract-awareness to the Architex platform. Every building project in South Africa operates under a formal construction contract (JBCC PBA, NEC ECC, GCC 2025, or FIDIC) that governs payment mechanisms, variation procedures, claims processes, extensions of time, dispute resolution, and notice requirements. This feature models the contract lifecycle — from setup through administration to dispute support — enabling deadline tracking, obligation management, and contractual notice workflows without replacing legal counsel or reproducing copyrighted clause text.

The feature integrates into the existing Site Execution (Module 7) and Closeout + Payment + Audit (Module 8) modules, writing back into Project Passport, SpecForge, Finance, Audit Trail, and the Action Centre as required by the platform's integration contracts.

## Glossary

- **Contract_Engine**: The service layer responsible for contract template setup, configuration, and contract-specific parameter management.
- **Notice_Engine**: The service responsible for registering, tracking, and managing contractual notices including deadline calculation and deemed acceptance/rejection logic.
- **Variation_Register**: The service responsible for recording, tracking, and managing variation orders including cost and time impact.
- **EoT_Engine**: The service responsible for Extension of Time claim creation, evidence linking, and response tracking.
- **Payment_Scheduler**: The service responsible for generating and tracking contract-specific payment timelines, retention calculations, and certificate schedules.
- **Claims_Register**: The service responsible for managing loss and expense claims, disruption claims, and dispute escalation tracking.
- **Contract_Data_Sheet**: The central reference store for all contract-specific parameters, key dates, named persons, and commercial rates.
- **Principal_Agent**: The professional appointed under JBCC to administer the contract on behalf of the employer (typically the architect or BEP).
- **Employer_Agent**: The professional appointed under GCC/NEC to administer the contract (equivalent to Principal Agent in other contract forms).
- **Working_Day**: A calendar day excluding Saturdays, Sundays, and South African public holidays, used for contractual deadline calculations.
- **Deemed_Rejection**: The contractual consequence when a party fails to respond within the prescribed period — the claim or notice is treated as rejected by default.
- **Deemed_Acceptance**: The contractual consequence when a party fails to respond within the prescribed period — the notice or variation is treated as accepted by default.
- **JBCC_PBA**: Joint Building Contracts Committee Principal Building Agreement — the most widely used standard form building contract in South Africa.
- **NEC_ECC**: New Engineering Contract Engineering and Construction Contract — a process-driven contract form used for engineering and infrastructure projects.
- **GCC_2025**: General Conditions of Contract 2025 edition — issued by SAICE for civil engineering works, updated with advance warning and two-stage claims.
- **FIDIC**: International Federation of Consulting Engineers standard contract forms — used for international and large-scale projects.
- **Disclaimer_Banner**: A persistent UI element stating that the system is advisory and does not constitute legal advice, requiring professional review for all contractual decisions.

## Requirements

### Requirement 1: Contract Template Setup

**User Story:** As a Principal Agent or CPM, I want to set up the project contract by selecting a standard form and configuring key parameters, so that the platform can track obligations and deadlines specific to that contract type.

#### Acceptance Criteria

1. WHEN a user initiates contract setup for a project, THE Contract_Engine SHALL present a selection of supported contract forms: JBCC PBA, NEC ECC, GCC 2025, and FIDIC.
2. WHEN a contract form is selected, THE Contract_Engine SHALL present a configuration wizard collecting: contracting parties (minimum 2: employer and contractor), commencement date, practical completion date (must be after commencement date), contract sum (numeric value between 1.00 and 999,999,999,999.99 in ZAR), key clause elections, and contract-specific parameters.
3. WHEN the contract form is JBCC PBA, THE Contract_Engine SHALL collect JBCC-specific parameters including interim payment period (in calendar days, default 30), penalty rate per calendar day (ZAR amount, minimum 0.01), retention percentage (0.00–10.00%), and defects liability period duration (in calendar months, range 3–24).
4. WHEN the contract form is NEC ECC, THE Contract_Engine SHALL collect NEC-specific parameters including early warning time period (in weeks, range 1–12), compensation event notification period (in weeks, range 1–12), and programme submission interval (in weeks, range 1–8).
5. WHEN the contract form is GCC 2025, THE Contract_Engine SHALL collect GCC-specific parameters including advance warning period (in Working_Days, range 1–60), penalty rate (ZAR per calendar day, minimum 0.01), two-stage claim periods (first stage in Working_Days, range 5–60; second stage in Working_Days, range 5–60), and deemed rejection timeout (in Working_Days, range 5–60).
6. WHEN the contract form is FIDIC, THE Contract_Engine SHALL collect FIDIC-specific parameters including time for completion (in calendar days, range 1–3650), defects notification period (in calendar days, range 365–1095), and dispute adjudication board composition (1 or 3 members).
7. WHEN contract setup is completed (all mandatory fields populated and validated), THE Contract_Engine SHALL write the contract status and key dates into the Project Passport within 60 seconds of completion.
8. WHEN contract setup is completed, THE Contract_Engine SHALL create an immutable audit trail record of the contract configuration including all parameter values, the user who performed setup, and the timestamp.
9. THE Contract_Engine SHALL reference contract clauses by number and descriptive title only and SHALL NOT reproduce copyrighted clause text.
10. IF a user attempts to complete contract setup with any mandatory field missing or invalid, THEN THE Contract_Engine SHALL reject the submission and indicate which fields require correction.

### Requirement 2: Contract Data Sheet

**User Story:** As a project team member, I want a central reference for all contract parameters, key dates, and named persons, so that I can quickly access contractual facts without searching through the physical contract document.

#### Acceptance Criteria

1. THE Contract_Data_Sheet SHALL display the following contract-specific parameters configured during setup: contract form, contracting parties, contract dates, contract sum, elected optional clauses, and any additional parameters added during project configuration.
2. THE Contract_Data_Sheet SHALL display key dates: commencement date, practical completion date, revised completion date, defects liability period end date, and final account date, each formatted as a calendar date (day, month, year).
3. THE Contract_Data_Sheet SHALL display named persons and their contractual roles: employer, contractor, principal agent or employer's agent, quantity surveyor, and any other named roles defined during setup.
4. THE Contract_Data_Sheet SHALL display commercial rates: penalty rate per day (currency value with 2 decimal places), retention percentage (0.00–100.00%), performance guarantee percentage (0.00–100.00%), and insurance requirements including policy type and minimum cover amount.
5. WHEN any contract parameter is updated, THE Contract_Data_Sheet SHALL record the change in the audit trail with the field name, previous value, new value, changed-by user identifier, and timestamp.
6. IF a contract parameter has not yet been configured, THEN THE Contract_Data_Sheet SHALL display that field with a visual indicator showing it is pending entry, rather than omitting the field.
7. THE Contract_Data_Sheet SHALL be viewable by all project team members assigned to the project, and editable only by users holding the architect, bep, quantity_surveyor, or platform_admin role on that project.
8. WHEN a user without edit permission views the Contract_Data_Sheet, THE Contract_Data_Sheet SHALL present all fields in a read-only state with no edit controls visible.

### Requirement 3: Contractual Notice Registration

**User Story:** As a Principal Agent or Contractor, I want to register contractual notices issued and received, so that the platform maintains a complete record of all formal correspondence and calculates response deadlines.

#### Acceptance Criteria

1. WHEN a user registers a new contractual notice, THE Notice_Engine SHALL capture: notice type (selected from the contract-form-specific notice types configured during contract setup), issuing party, receiving party, reference clause number, date issued, subject (maximum 500 characters), and supporting document references (minimum 0, maximum 20 linked documents).
2. WHEN a notice is registered and the referenced clause has a configured response period, THE Notice_Engine SHALL calculate the response deadline based on the contract form and referenced clause using Working_Day calculations.
3. IF a notice is registered and the referenced clause does not have a configured response period, THEN THE Notice_Engine SHALL register the notice without a calculated deadline and display an indication that no contractual response period is defined for the referenced clause.
4. THE Notice_Engine SHALL maintain a register of all contractual notices with status: issued (on registration), acknowledged (when receiving party confirms receipt), responded (when a formal response is submitted), expired (when the deadline passes without response), and withdrawn (when the issuing party cancels the notice).
5. WHEN a notice is registered, THE Notice_Engine SHALL create an immutable audit trail record containing the notice reference, notice type, parties, clause number, date issued, and the calculated deadline if applicable.
6. WHEN a notice is registered with a calculated deadline, THE Notice_Engine SHALL surface a required action in the receiving party's Action Centre displaying the notice subject, clause reference, and response deadline date.

### Requirement 4: Deadline Tracking and Warnings

**User Story:** As a project team member, I want to receive warnings when contractual deadlines are approaching, so that I can respond in time and avoid deemed rejection or acceptance.

#### Acceptance Criteria

1. THE Notice_Engine SHALL recalculate remaining Working_Days for all outstanding contractual deadlines once per Working_Day at a configurable time (default 06:00 SAST).
2. WHEN a deadline reaches 7 Working_Days from expiry and the notice has not been responded to, THE Notice_Engine SHALL surface exactly one warning notification in the responsible party's Action Centre.
3. WHEN a deadline reaches 3 Working_Days from expiry and the notice has not been responded to, THE Notice_Engine SHALL surface exactly one urgent warning notification in the responsible party's Action Centre.
4. WHEN a deadline reaches 1 Working_Day from expiry and the notice has not been responded to, THE Notice_Engine SHALL surface exactly one critical warning notification in the responsible party's Action Centre.
5. IF a notice is responded to before a warning threshold is reached, THEN THE Notice_Engine SHALL NOT generate subsequent warning notifications for that notice.
6. WHEN a deadline expires without a response, THE Notice_Engine SHALL apply the contractual deemed acceptance or deemed rejection logic as configured for the contract form and clause, updating the notice status accordingly.
7. IF the contract form and clause do not have deemed acceptance or rejection configured, THEN THE Notice_Engine SHALL mark the notice as expired without applying a deemed outcome and surface a notification to both parties that the notice has expired without a configured consequence.
8. WHEN deemed acceptance or rejection is triggered, THE Notice_Engine SHALL record the outcome in the audit trail and notify the issuing party and the receiving party via the Action Centre.

### Requirement 5: Variation Order Register

**User Story:** As a Principal Agent or Quantity Surveyor, I want to record and track variation orders through their full lifecycle, so that I can manage cost and time impacts and maintain a cumulative variation summary.

#### Acceptance Criteria

1. WHEN a variation order is initiated, THE Variation_Register SHALL capture: variation number (unique within the project), description (maximum 2000 characters), originating instruction reference, date instructed, and linked site instruction or RFI reference.
2. IF a variation order is initiated with any mandatory field (variation number, description, date instructed) missing or blank, THEN THE Variation_Register SHALL reject the submission and indicate which fields are missing.
3. THE Variation_Register SHALL track each variation through workflow stages in the following permitted sequence: instructed → valued → approved or rejected, and approved → implemented. A transition not in this permitted sequence SHALL be rejected.
4. WHEN a variation is valued, THE Variation_Register SHALL record the cost impact as an addition or omission amount in ZAR (range: 0.01 to 999,999,999.99) and the time impact in Working_Days (range: 0 to 9999).
5. THE Variation_Register SHALL maintain a cumulative summary showing: total number of variations, total cost additions, total cost omissions, net cost delta, and total time impact, recomputed each time a variation record is created or updated.
6. WHEN a variation is linked to a SpecForge specification item by the user, THE Variation_Register SHALL create a linked change record in SpecForge referencing the variation number and affected specification item identifier.
7. WHEN a variation is linked to a site instruction, THE Variation_Register SHALL reference the originating site instruction from the Site Execution module by its instruction identifier.
8. WHEN a variation order changes status, THE Variation_Register SHALL record the transition in the audit trail including: previous status, new status, actor identifier, and timestamp.
9. IF a variation requires approval and the approver has not responded within the contract-specified period (defaulting to 14 calendar days where no contract period is configured), THEN THE Notice_Engine SHALL surface a deadline warning in the approver's Action Centre.

### Requirement 6: Extension of Time Claims

**User Story:** As a Contractor, I want to build and submit Extension of Time claims with structured evidence, so that I can formally request additional time when entitled under the contract.

#### Acceptance Criteria

1. WHEN a user creates an EoT claim, THE EoT_Engine SHALL capture: claim reference number (auto-generated, unique per project), cause of delay category (selected from: weather, materials, labour, client, professional, contractor, unforeseen ground conditions, force majeure), period claimed in Working_Days (integer, minimum 1, maximum 365), date of delay event, and narrative description (maximum 2000 characters).
2. THE EoT_Engine SHALL provide a structured evidence linking interface allowing the user to attach one or more of: site diary entries, weather records, site instructions, delay early warnings, and photographic evidence from the Site Execution module, where each attachment is associated with a date and a brief caption (maximum 200 characters).
3. WHEN a user opens an EoT claim for editing, THE EoT_Engine SHALL calculate the contractual notification deadline based on the contract form selected in the project setup and display the remaining calendar days to submit as a countdown.
4. IF the contractual notification deadline has passed and the claim has not been submitted, THEN THE EoT_Engine SHALL display a warning indicating the deadline has lapsed and record the late submission status against the claim.
5. WHEN an EoT claim is submitted, THE EoT_Engine SHALL validate that all mandatory fields (cause of delay, period claimed, date of delay event, narrative description, and at least one evidence attachment) are populated before allowing submission.
6. WHEN an EoT claim is submitted, THE EoT_Engine SHALL surface a required action in the Principal Agent's or Employer Agent's Action Centre for review within 5 seconds of submission.
7. THE EoT_Engine SHALL track the response status of each claim through the following states: draft, submitted, under review, granted, partially granted, rejected, and withdrawn.
8. WHEN an EoT claim is granted, THE EoT_Engine SHALL update the revised practical completion date on the Contract_Data_Sheet by adding the full period claimed in Working_Days, and update the Project Passport with the revised completion date.
9. WHEN an EoT claim is partially granted, THE EoT_Engine SHALL update the revised practical completion date on the Contract_Data_Sheet by adding the number of Working_Days approved by the reviewer (which must be at least 1 and less than the period claimed), and update the Project Passport with the revised completion date.

### Requirement 7: Payment Clause Awareness

**User Story:** As a Quantity Surveyor or Principal Agent, I want the platform to generate payment schedules aligned to the contract terms, so that interim certificates are issued on time and payment deadlines are tracked.

#### Acceptance Criteria

1. WHEN contract setup is completed, THE Payment_Scheduler SHALL generate an interim certificate schedule spanning from the commencement date to the practical completion date, with payment cycles based on the contract-specific payment interval stored in the Contract_Data_Sheet (for example, JBCC: monthly, or as configured).
2. THE Payment_Scheduler SHALL display the status of each payment cycle showing: valuation date, certificate issue deadline, payment deadline, and current status (pending, certificate issued, payment confirmed, or overdue).
3. WHEN a certificate issue deadline is approaching, THE Payment_Scheduler SHALL surface a reminder in the Principal Agent's or Quantity Surveyor's Action Centre at 7, 3, and 1 Working_Days before the deadline.
4. THE Payment_Scheduler SHALL calculate retention amounts using the retention percentage and retention limit from the Contract_Data_Sheet, and SHALL display the current cumulative retention held and the contractual release conditions (practical completion release percentage and defects liability period end date) as configured during contract setup.
5. WHEN a payment deadline passes without a payment confirmation record being entered against the corresponding schedule entry, THE Payment_Scheduler SHALL surface an overdue notification in the Action Centre of the Principal Agent and the Contractor within 1 Working_Day of the missed deadline.
6. WHEN a payment certificate is issued in the Finance module, THE Payment_Scheduler SHALL link the certificate to the corresponding schedule entry and update the payment cycle status to "certificate issued".
7. WHEN the practical completion date is amended (due to an approved Extension of Time or contract amendment), THE Payment_Scheduler SHALL regenerate the remaining schedule entries to align with the revised completion date and SHALL record the schedule change in the project Audit Trail.

### Requirement 8: Claims and Dispute Register

**User Story:** As a Quantity Surveyor or Contractor, I want to register and track loss and expense claims and dispute escalation, so that the project maintains a complete record of all claims and their resolution status.

#### Acceptance Criteria

1. WHEN a user registers a claim, THE Claims_Register SHALL capture: claim reference number (system-generated, unique per project), claim type (loss and expense, disruption, prolongation, or varied work), date of event, notification date, amount claimed (numeric value between 0.01 and 999,999,999.99 in project currency), and time impact claimed (in calendar days, 0 to 9,999).
2. THE Claims_Register SHALL track each claim through stages: notified, substantiated, assessed, accepted, partially accepted, rejected, and disputed, and SHALL only permit forward transitions or transitions to disputed from assessed, accepted, partially accepted, or rejected.
3. WHEN a claim is registered, THE Claims_Register SHALL calculate the contractual submission deadline based on the contract form and SHALL surface a warning when the deadline is 14 calendar days or fewer away, and a second warning when the deadline is 7 calendar days or fewer away.
4. THE Claims_Register SHALL support linking supporting evidence from: site diary, payment records, variation orders, site instructions, and correspondence.
5. WHEN a claim is rejected or partially accepted and the claimant registers a notice of dissatisfaction, THE Claims_Register SHALL record the escalation and calculate the adjudication referral deadline based on the notice of dissatisfaction date and the contract form's prescribed referral period.
6. THE Claims_Register SHALL maintain a cumulative claims summary showing: total claims by type, total amount claimed, total amount assessed, and total amount settled.
7. WHEN a claim changes status, THE Claims_Register SHALL record the transition in the audit trail capturing: claim reference, previous status, new status, actor identity, timestamp, and reason for transition.
8. IF a user attempts to register a claim without providing all mandatory fields (claim type, date of event, notification date, and amount claimed), THEN THE Claims_Register SHALL reject the submission and indicate which mandatory fields are missing.
9. IF a user attempts a status transition that is not permitted by the defined transition rules, THEN THE Claims_Register SHALL reject the transition and indicate that the requested status change is not valid from the current status.

### Requirement 9: Role-Based Access Control

**User Story:** As a platform administrator, I want contract administration features to respect role-based access, so that each user only sees and performs actions appropriate to their contractual role.

#### Acceptance Criteria

1. WHILE a user has the role of architect, bep, or quantity_surveyor, THE Contract_Engine SHALL grant read and write access to contract setup, notices, variations, payment schedules, and claims for projects where that user is an assigned team member.
2. WHILE a user has the role of contractor, THE Contract_Engine SHALL grant access to submit claims, respond to notices, request extensions of time, and view the contract data sheet and variation register for projects where that user is an assigned contractor.
3. WHILE a user has the role of subcontractor, THE Contract_Engine SHALL grant access to view assigned scope, submit claims through the main contractor's workflow, and view notices relevant to their assigned scope within projects where that user is an assigned subcontractor.
4. WHILE a user has the role of client or developer, THE Contract_Engine SHALL grant access to view contract status, approve variations where the variation value exceeds the project-configured approval threshold, and view the claims summary for projects where that user is the project owner.
5. WHILE a user has the role of site_manager, THE Contract_Engine SHALL grant access to view and respond to site-level notices and view the variation register for projects where that user is an assigned site manager.
6. WHILE a user has the role of admin or platform_admin, THE Contract_Engine SHALL grant read and write access to all contract administration features across all projects without requiring project-level assignment.
7. IF a user attempts to access a contract administration feature without the required role or project assignment, THEN THE Contract_Engine SHALL deny the action, prevent any state change, and display an error message indicating that the user lacks authorization for the requested feature.
8. IF a user holds multiple roles, THEN THE Contract_Engine SHALL grant the union of permissions associated with each assigned role, applying the least restrictive access for each feature.
9. WHEN a project-configured approval threshold is not explicitly set, THE Contract_Engine SHALL default to a threshold of zero, requiring client or developer approval for all variations.

### Requirement 10: Integration with Platform Modules

**User Story:** As a project team member, I want contract administration to integrate with existing platform modules, so that contractual data flows seamlessly into the project record without duplication.

#### Acceptance Criteria

1. WHEN contract status or key dates (completion date, defects liability expiry, retention release date, or any contractual milestone date) change, THE Contract_Engine SHALL update the Project Passport health card with current contract status, outstanding notices count, and days to the nearest upcoming contractual deadline within 60 seconds of the triggering change.
2. WHEN a delay event is recorded in the Site Execution diary, IF the delay exceeds the contract's early warning threshold, THEN THE Contract_Engine SHALL create an action in the Inbox / Action Centre prompting the contractor to consider an EoT claim, including the delay duration, affected programme activities, and the applicable contract clause.
3. WHEN a variation order is approved, THE Variation_Register SHALL create a specification change record in SpecForge within 60 seconds, linking the variation to spec items identified in the variation order scope, and recording the variation reference number, approval date, and cost impact.
4. WHEN a payment certificate is issued in the Finance module, THE Payment_Scheduler SHALL record the certificate against the schedule entry matching the certificate's valuation period and update the payment timeline status to reflect the certified amount and issue date.
5. WHEN a contractual deadline warning is generated, THE Notice_Engine SHALL create a high-priority action in the Inbox / Action Centre with the deadline date, clause reference, required response type, and the number of calendar days remaining until expiry.
6. THE Contract_Engine SHALL write all notice registrations, variation status changes, claim submissions, and deadline outcomes as immutable records (non-editable, non-deletable) in the project Audit Trail, each including a timestamp, originating user, contract clause reference, and action description.
7. WHEN a contractual document is uploaded (notice, variation instruction, claim substantiation), THE Contract_Engine SHALL register the document in the Documents module as a controlled document with metadata including: document type, contract clause reference, originating party, date of issue, linked notice or variation reference, and response deadline where applicable.
8. WHEN a contractual deadline is missed or a notice expires without response, THE Contract_Engine SHALL create a risk event in the Risk Engine with severity mapped from the contractual consequence category defined in the contract (financial penalty, time extension entitlement, termination right, or deemed acceptance).
9. IF the Contract_Engine fails to write to a target module (Project Passport, SpecForge, Documents, Inbox, Risk Engine, or Audit Trail), THEN THE Contract_Engine SHALL retry the operation up to 3 times over 60 seconds and, if still unsuccessful, create a failed-sync alert in the Inbox / Action Centre identifying the target module, the originating event, and the timestamp of failure.
10. IF a payment certificate cannot be matched to an existing schedule entry, THEN THE Payment_Scheduler SHALL flag the certificate as unmatched in the payment timeline and create an action in the Inbox / Action Centre requesting manual reconciliation by the contract administrator.

### Requirement 11: Disclaimer and Advisory Limitations

**User Story:** As a platform user, I want clear disclaimers that the system is advisory only, so that I understand the platform does not replace legal counsel and all outputs require professional review.

#### Acceptance Criteria

1. THE Contract_Engine SHALL display a persistent, non-dismissible Disclaimer_Banner on every contract administration view (including payment schedules, deadline trackers, claim management, and deemed acceptance screens) stating that the system is advisory, does not constitute legal advice, and outputs require professional and legal review.
2. THE Contract_Engine SHALL include a disclaimer footer on every generated output document (including but not limited to payment schedules, deadline calculations, claim summaries, and notices) stating that the output is for reference purposes only and does not replace professional advice.
3. THE Contract_Engine SHALL NOT reproduce copyrighted contract clause text — all references SHALL be by clause number and descriptive title only.
4. WHEN a deemed acceptance or rejection outcome is calculated, THE Contract_Engine SHALL include a notice stating that the calculated outcome is based on configured parameters and must be verified against the actual contract by a suitably qualified built environment professional.
5. IF the Disclaimer_Banner or disclaimer footer fails to render on a contract administration view or generated output, THEN THE Contract_Engine SHALL prevent user interaction with that view or block generation of that output until the disclaimer is successfully displayed.

### Requirement 12: Working Day Calculation

**User Story:** As a Principal Agent or Contractor, I want deadline calculations to use Working Days as defined by the contract, so that weekends and public holidays are excluded from response periods.

#### Acceptance Criteria

1. THE Notice_Engine SHALL calculate all contractual deadlines using Working_Days that exclude Saturdays, Sundays, and South African public holidays, counting from the first Working_Day after the triggering event date.
2. THE Notice_Engine SHALL maintain a configurable public holiday calendar for South Africa that can be updated annually and must contain all gazetted public holidays for at least the current calendar year.
3. WHERE the contract specifies calendar days instead of working days for a particular clause, THE Notice_Engine SHALL use calendar days for that deadline calculation.
4. WHEN a deadline calculation is performed, THE Notice_Engine SHALL display the number of remaining Working_Days, the calendar date of the deadline, and if the calculated deadline falls on a non-working day, move it to the next available Working_Day.
5. IF the public holiday calendar does not contain any holidays for the current calendar year, THEN THE Notice_Engine SHALL display a warning indicating that deadline calculations may be inaccurate and prompt an administrator to update the calendar before new deadlines are calculated.
6. WHEN the public holiday calendar is updated after deadlines have already been calculated, THE Notice_Engine SHALL recalculate all active deadlines affected by the change and notify the relevant parties of any date changes.
