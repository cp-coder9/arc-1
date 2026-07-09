# Requirements Document

## Introduction

The P1 Platform Extensions deliver four critical workflow modules to the Architex Built Environment OS, addressing gaps identified in the platform gap analysis. These modules extend existing capabilities into specialised domains essential for comprehensive project delivery in South Africa:

1. **Insurance Register (P1.4)** — Project-level insurance policy tracking, expiry management, and claims notification integrated with the Trust & Verification, Project Passport, Closeout, and Risk Engine modules.
2. **Dispute Resolution & Formal Claims (P1.5)** — Extends Contract Administration (P0.1) into formal dispute resolution with structured claims registers, notice timeline engines, quantum/delay analysis support, and adjudication workflows.
3. **NHBRC Enrolment & Home Builder Workflow (P1.6)** — Residential construction compliance covering NHBRC enrolment, stage inspection tracking, warranty claim management, and builder registration verification under the Housing Consumers Protection Measures Act 95 of 1998.
4. **Survey & Geomatics Layer (P1.7)** — Extends the basic subdivision workflow in Town Planning (P0.3) into a standalone survey management tool covering survey instructions, SG diagram tracking, beacon registers, and as-built survey comparison.

All four modules follow the feature module pattern at `src/features/{feature-name}/`, integrate with the five mandatory platform contracts (Project Passport, SpecForge, Audit Trail, Action Centre/Inbox, Role-based access), and maintain the advisory-only posture on all compliance and legal features.

## Glossary

- **Insurance_Register**: The service layer responsible for managing project-level insurance policies, tracking expiry dates, generating renewal warnings, and maintaining the claims notification register.
- **Policy_Checker**: The service responsible for determining insurance requirements per contract type and verifying policy compliance against project requirements.
- **Claims_Notification_Engine**: The service responsible for recording insurance claims events, tracking notification timelines, and managing insurer communication records.
- **Dispute_Engine**: The service layer responsible for managing formal construction dispute resolution workflows, including claims registration, notice tracking, evidence compilation, and adjudication support.
- **Notice_Timeline_Engine**: The service responsible for calculating and tracking contractual notice periods, response deadlines, and escalation timelines specific to dispute resolution under each supported contract form.
- **Quantum_Analyser**: The service responsible for supporting quantum (financial value) and delay analysis for formal claims, including cost breakdowns, delay event linkage, and impact calculations.
- **Adjudication_Manager**: The service responsible for managing the adjudication workflow from referral through hearing to decision, including party submissions, document bundles, and outcome recording.
- **NHBRC_Engine**: The service layer responsible for managing NHBRC enrolment workflows, fee calculations, stage inspection tracking, and warranty claim management for residential construction projects.
- **Inspection_Tracker**: The service responsible for tracking NHBRC-mandated stage inspections from foundation through completion, recording inspection outcomes, and managing re-inspection workflows.
- **Warranty_Manager**: The service responsible for managing the 5-year NHBRC structural warranty including defect reporting, claim submission, and resolution tracking.
- **Builder_Verification**: The service responsible for checking and recording home builder NHBRC registration status and compliance standing.
- **Survey_Engine**: The service layer responsible for managing land survey workflows, instructions, SG diagram tracking, beacon registers, and as-built survey comparison.
- **SG_Tracker**: The service responsible for tracking Surveyor-General diagram submissions through the lodgement-to-approval lifecycle under the Land Survey Act 8 of 1997.
- **Beacon_Register**: The service responsible for maintaining a register of boundary beacons and survey points including coordinates, status, and physical condition records.
- **As_Built_Comparator**: The service responsible for comparing as-built survey measurements against approved plan dimensions and identifying deviations.
- **CAR_Policy**: Contractor's All Risk insurance policy — covers physical loss or damage to contract works, materials, and construction plant during the construction period.
- **PI_Policy**: Professional Indemnity insurance — covers claims arising from professional negligence, errors, or omissions by built environment professionals.
- **Public_Liability_Policy**: Insurance covering third-party bodily injury or property damage claims arising from construction activities.
- **SASRIA_Policy**: South African Special Risk Insurance Association cover — insurance against civil commotion, public disorder, strikes, riots, and terrorism.
- **LDI_Policy**: Latent Defects Insurance — covers structural defects that become apparent after practical completion, typically for a period of 10–12 years.
- **NHBRC**: National Home Builders Registration Council — the statutory body regulating home builders in South Africa under the Housing Consumers Protection Measures Act 95 of 1998.
- **SG_Diagram**: A cadastral survey diagram prepared by a professional land surveyor and submitted to the Surveyor-General for approval under the Land Survey Act 8 of 1997.
- **EoT**: Extension of Time — a formal contractual claim for additional time to complete works due to a qualifying delay event.
- **Quantum**: The monetary value or financial assessment of a construction claim, including direct costs, time-related costs, and consequential losses.
- **Prolongation**: A claim for additional time-related costs incurred due to a delay to the works for which the contractor is not responsible.
- **Disruption**: A claim for reduced productivity or efficiency caused by events for which the employer or professional team is responsible.
- **Working_Day**: A calendar day excluding Saturdays, Sundays, and South African public holidays as defined in the Public Holidays Act 36 of 1994, used for contractual deadline calculations.
- **Deemed_Rejection**: The contractual consequence when a party fails to respond within the prescribed period — the claim or notice is treated as rejected by default.
- **Adjudication**: A statutory or contractual dispute resolution mechanism where an independent adjudicator makes a binding interim decision on a construction dispute.
- **Notice_of_Dissatisfaction**: A formal notice issued by a party who disagrees with a decision, triggering the next level of dispute resolution (typically adjudication or arbitration).
- **JBCC_PBA**: Joint Building Contracts Committee Principal Building Agreement — the most widely used standard form building contract in South Africa.
- **NEC_ECC**: New Engineering Contract Engineering and Construction Contract — a process-driven contract form used for engineering and infrastructure projects.
- **GCC_2025**: General Conditions of Contract 2025 edition — issued by SAICE for civil engineering works.
- **FIDIC**: International Federation of Consulting Engineers standard contract forms — used for international and large-scale projects.
- **Disclaimer_Banner**: A persistent UI element stating that the system is advisory and does not constitute legal advice, requiring professional review for all decisions.
- **PLATO**: South African Geomatics Council — the statutory body regulating land surveyors, GIS practitioners, and geomatics technicians.

## Requirements

---

## Module A: Insurance Register (P1.4)

---

### Requirement 1: Insurance Policy Registration and Tracking

**User Story:** As a Principal Agent or CPM, I want to register and track all project-level insurance policies, so that the project maintains a complete record of required cover and the team is alerted before policies expire.

#### Acceptance Criteria

1. WHEN a user holding the architect, bep, cpm, quantity_surveyor, or platform_admin role on a project registers an insurance policy, THE Insurance_Register SHALL capture: policy type (CAR, PI, public liability, SASRIA, or LDI), insurer name (maximum 200 characters), policy number (maximum 100 characters), policyholder name (maximum 200 characters), inception date, expiry date (must be after inception date), sum insured (numeric value between 1.00 and 999,999,999,999.99 in ZAR), excess/deductible amount (numeric value between 0.00 and 999,999,999.99 in ZAR), and broker contact details (name maximum 200 characters, and at least one of: phone number in valid SA format or email in valid email format).
2. THE Insurance_Register SHALL maintain a register of all project policies displaying: policy type, insurer, policy number, inception date, expiry date, sum insured, status (active, expired, cancelled, or pending renewal), and days until expiry for active policies.
3. WHEN a policy expiry date is 60 calendar days away and the policy status is active, THE Insurance_Register SHALL surface a renewal warning notification in the Action Centre of the user who registered the policy and any user holding the architect, bep, cpm, or quantity_surveyor role on that project.
4. WHEN a policy expiry date is 30 calendar days away and the policy status is active, THE Insurance_Register SHALL surface an urgent renewal warning notification in the Action Centre of the user who registered the policy and any user holding the architect, bep, cpm, or quantity_surveyor role on that project.
5. WHEN a policy expiry date is 14 calendar days away and the policy status is active, THE Insurance_Register SHALL surface a critical renewal warning notification in the Action Centre of the user who registered the policy and any user holding the architect, bep, cpm, or quantity_surveyor role on that project.
6. WHEN a policy expiry date passes without a new active policy of the same policy type being registered for the same project, THE Insurance_Register SHALL update the policy status to expired and create a risk event in the Risk Engine with severity "high" indicating lapsed insurance cover.
7. WHEN a policy is registered or updated, THE Insurance_Register SHALL record the action in the project Audit Trail with: policy type, policy number, action type (created, updated, or renewed), actor identity, and timestamp.
8. IF a user attempts to register a policy with any mandatory field (policy type, insurer name, policy number, inception date, expiry date, sum insured) missing or invalid, THEN THE Insurance_Register SHALL reject the submission and indicate which fields require correction.
9. IF a user not holding the architect, bep, cpm, quantity_surveyor, or platform_admin role on the project attempts to register, update, or cancel a policy, THEN THE Insurance_Register SHALL reject the action and indicate insufficient permissions.
10. WHEN a user holding a permitted role sets an active policy status to cancelled, THE Insurance_Register SHALL update the status to cancelled, record the cancellation in the project Audit Trail with actor identity and timestamp, and surface a notification in the Action Centre of all users holding the architect, bep, cpm, or quantity_surveyor role on that project.

### Requirement 2: Insurance Requirement Checker

**User Story:** As a Principal Agent or Quantity Surveyor, I want the platform to identify required insurance types based on the project contract form, so that I can verify all mandatory cover is in place before construction commences.

#### Acceptance Criteria

1. WHEN a project has a contract form configured in the Contract Administration module, THE Policy_Checker SHALL determine the required insurance types based on the contract form: JBCC PBA requires CAR and public liability as mandatory; NEC ECC requires CAR, public liability, and PI as mandatory; GCC 2025 requires CAR and public liability as mandatory; FIDIC requires CAR, public liability, and PI as mandatory.
2. WHEN the Policy_Checker executes a compliance check, THE Policy_Checker SHALL compare the required insurance types against the policies registered in the Insurance_Register and display a compliance status for each required policy type: compliant (active policy registered with sum insured meeting or exceeding the contract-specified minimum), non-compliant (no active policy registered or sum insured below minimum), or expiring soon (active policy registered but expiry date is within 60 calendar days).
3. WHEN a required insurance type has no active policy registered, THE Policy_Checker SHALL surface a non-compliance alert in the Action Centre of the Principal Agent, CPM, and Quantity Surveyor for that project.
4. WHEN the contract data sheet specifies minimum sum insured values for each insurance type, THE Policy_Checker SHALL compare registered policy sums against those minimums and flag any policy where the sum insured is less than the contract-specified minimum.
5. WHERE a project has SASRIA cover configured as required in the contract data sheet, THE Policy_Checker SHALL include SASRIA in the required insurance types and apply the same compliance checking logic defined in criterion 2.
6. WHERE a project has LDI cover configured as required in the contract data sheet, THE Policy_Checker SHALL include LDI in the required insurance types and apply the same compliance checking logic defined in criterion 2.
7. WHEN all required insurance types are compliant, THE Policy_Checker SHALL update the Project Passport with an insurance compliance status of "compliant" and the date of the compliance check.
8. WHEN one or more required insurance types are non-compliant or expiring soon, THE Policy_Checker SHALL update the Project Passport with an insurance compliance status of "non-compliant", the date of the compliance check, and the count of non-compliant policy types.
9. IF the project does not have a contract form configured in the Contract Administration module, THEN THE Policy_Checker SHALL display a notice indicating that insurance requirements cannot be determined until a contract form is configured, and SHALL not generate compliance alerts.
10. THE Policy_Checker SHALL execute a compliance check automatically when a policy is registered, updated, renewed, expired, or cancelled in the Insurance_Register, and when the project contract form is configured or changed.
11. THE Policy_Checker SHALL display an advisory disclaimer stating that the insurance requirement determination is based on configured contract parameters and does not constitute insurance advice, and that a qualified insurance broker should verify adequacy of cover.

### Requirement 3: Claims Notification Register

**User Story:** As a Principal Agent or Contractor, I want to record insurance claims events and track notification timelines, so that the project maintains a complete record of incidents that may give rise to insurance claims.

#### Acceptance Criteria

1. WHEN a user registers a claims notification event, THE Claims_Notification_Engine SHALL capture: incident date, discovery date (must be equal to or later than the incident date), affected policy type (selected from registered policies), incident description (maximum 2000 characters), estimated loss amount (numeric value between 0.01 and 999,999,999.99 in ZAR), location on site (maximum 500 characters), and linked evidence references (minimum 0, maximum 20 documents or photographs from the Documents module or Site Execution field evidence).
2. THE Claims_Notification_Engine SHALL track each claims notification through stages in the following order: reported (on creation), notified to insurer, under investigation, claim lodged, then one of: settled, rejected, or withdrawn, and SHALL only permit transitions to the next sequential stage or to withdrawn from any stage prior to settled, rejected, or withdrawn (settled, rejected, and withdrawn are terminal states permitting no further transitions).
3. WHEN a claims notification event is created, THE Claims_Notification_Engine SHALL calculate the notification deadline as the earlier of: 30 calendar days from the incident date, or the specific notification period defined in the relevant policy terms if configured in the policy record.
4. WHEN the notification deadline is 7 calendar days away and the claims notification status is still "reported" (not yet notified to insurer), THE Claims_Notification_Engine SHALL surface a warning in the Action Centre of the user who registered the event and the Principal Agent.
5. IF the notification deadline has passed and the claims notification status is still "reported" (not yet notified to insurer), THEN THE Claims_Notification_Engine SHALL surface an overdue alert in the Action Centre of the user who registered the event and the Principal Agent, indicating the number of calendar days overdue.
6. WHEN a claims notification is registered, THE Claims_Notification_Engine SHALL record the event in the project Audit Trail with: incident date, affected policy type, estimated loss, reporting user, and timestamp.
7. WHEN a claims notification is linked to a risk event already recorded in the Risk Engine, THE Claims_Notification_Engine SHALL create a cross-reference between the claims notification and the risk event record.
8. THE Claims_Notification_Engine SHALL maintain a cumulative claims summary displaying: total notifications by policy type, total estimated loss, number of notifications per status stage, and total settled amount.
9. IF a user attempts to register a claims notification with any mandatory field (incident date, discovery date, affected policy type, incident description, estimated loss amount) missing or with a discovery date earlier than the incident date, THEN THE Claims_Notification_Engine SHALL reject the submission and indicate which fields require correction.

### Requirement 4: Insurance Register Integration

**User Story:** As a project team member, I want insurance data to integrate with existing platform modules, so that insurance status contributes to the overall project health picture.

#### Acceptance Criteria

1. WHEN an insurance policy status changes (registered, renewed, expired, or cancelled), THE Insurance_Register SHALL update the Project Passport with the current insurance compliance summary within 5 seconds, including: number of active policies, number of expired policies, number of non-compliant required types (as defined by the project's insurance requirements configuration), and overall insurance status (compliant when all required types hold active policies, partially compliant when at least one but not all required types hold active policies, or non-compliant when no required types hold active policies).
2. WHEN a policy expires or a required policy type is found non-compliant (no active policy exists for a type listed in the project's insurance requirements configuration), THE Insurance_Register SHALL create a risk event in the Risk Engine with category "insurance" and severity determined by the policy type: CAR or public liability expiry maps to "critical"; PI expiry maps to "high"; SASRIA or LDI expiry maps to "medium".
3. WHEN a claims notification event is created with the claim category field set to "third_party_property_damage" or "third_party_bodily_injury", THE Insurance_Register SHALL surface an action in the Action Centre recommending the user verify cover under the public liability policy and notify the insurer.
4. WHEN the Closeout module initiates practical completion procedures for the project, THE Insurance_Register SHALL generate a closeout checklist item verifying that all policy types listed in the project's insurance requirements configuration remain active through the defects liability period end date as recorded in the project's DefectsLiabilityPeriod.
5. THE Insurance_Register SHALL expose policy status data to the Trust & Verification module including: policy type, insurer name, policy number, coverage amount, start date, expiry date, and current status, allowing verification checks to confirm that a contractor or professional holds at least one active and non-expired policy for each required type.
6. WHEN a policy document is uploaded against a policy record, THE Insurance_Register SHALL register the document in the Documents module with metadata: document type "insurance certificate", policy type, insurer, expiry date, and linked policy reference.
7. THE Insurance_Register SHALL write all policy status changes, claims notifications, and compliance check results as immutable records in the project Audit Trail, each record including: timestamp, actor identity, event type, affected policy reference, and before/after status values.
8. IF a target module (Project Passport, Risk Engine, Action Centre, Documents, or Audit Trail) is unavailable when the Insurance_Register attempts to write an integration event, THEN THE Insurance_Register SHALL retry the write up to 3 times with exponential backoff and, if all retries fail, create a failed-sync alert visible to project administrators indicating the affected module and pending event.

---

## Module B: Dispute Resolution & Formal Claims (P1.5)

---

### Requirement 5: Formal Claims Register

**User Story:** As a Contractor or Quantity Surveyor, I want to register and manage formal construction claims with structured data, so that the project maintains a complete record of all claims from notification through resolution.

#### Acceptance Criteria

1. WHEN a user registers a formal claim, THE Dispute_Engine SHALL capture: claim reference number (system-generated, unique per project, prefixed with claim type abbreviation), claim type (EoT, loss and expense, disruption, or prolongation), date of causative event, notification date, contract clause relied upon (clause number and descriptive title), brief description (maximum 500 characters), detailed particulars (maximum 5000 characters), amount claimed for monetary claims (numeric value between 0.01 and 999,999,999.99 in ZAR), and time claimed for EoT and prolongation claims (in Working_Days, range 1–999).
2. THE Dispute_Engine SHALL track each formal claim through stages: notified, particularised, assessed, responded (with sub-states: accepted, partially accepted, or rejected), notice of dissatisfaction issued, referred to adjudication, adjudication decision issued, and settled. Permitted transitions SHALL be: notified → particularised → assessed → responded; responded (rejected or partially accepted) → notice of dissatisfaction issued → referred to adjudication → adjudication decision issued → settled; responded (accepted) → settled. WHEN a user advances a claim to the "responded" stage, THE Dispute_Engine SHALL require the response sub-state (accepted, partially accepted, or rejected) and, for partially accepted claims, the awarded amount (numeric value between 0.01 and the original amount claimed in ZAR) or awarded time (in Working_Days, between 1 and the original time claimed).
3. THE Dispute_Engine SHALL maintain a cumulative claims dashboard displaying: total claims by type, total amount claimed (sum of amount claimed across all registered monetary claims), total amount awarded (sum of awarded amounts from claims in responded-accepted or responded-partially-accepted states and from settled claims), total time claimed in Working_Days, total time awarded in Working_Days, and number of claims per status stage. The dashboard SHALL update within 5 seconds of any claim registration or status transition.
4. WHEN a formal claim is registered, THE Dispute_Engine SHALL create an immutable audit trail record containing: claim reference, claim type, causative event date, notification date, contract clause, claimant identity, and registration timestamp. WHEN a claim status transition occurs, THE Dispute_Engine SHALL append an immutable audit trail record containing: claim reference, previous status, new status, actor identity, transition timestamp, and any transition data (response sub-state, awarded amount, or awarded time).
5. IF a user attempts to register a formal claim without providing all mandatory fields (claim type, date of causative event, notification date, contract clause relied upon, and brief description), THEN THE Dispute_Engine SHALL reject the submission and indicate which mandatory fields are missing.
6. IF a user attempts a status transition not permitted by the defined transition rules, THEN THE Dispute_Engine SHALL reject the transition and display the current status and the set of permitted next statuses.
7. IF a user attempts to register a monetary claim (loss and expense or disruption) without providing the amount claimed, or an EoT or prolongation claim without providing the time claimed, THEN THE Dispute_Engine SHALL reject the submission and indicate the missing type-specific mandatory field.

### Requirement 6: Notice Timeline Engine for Disputes

**User Story:** As a Contractor or Principal Agent, I want the platform to calculate and track contractual notice deadlines for dispute-related communications, so that parties comply with time-bar provisions and preserve their contractual rights.

#### Acceptance Criteria

1. WHEN a formal claim is registered, THE Notice_Timeline_Engine SHALL calculate the contractual notification deadline based on the project's configured contract form: JBCC PBA requires notification within 20 Working_Days of the causative event; NEC ECC requires notification within 8 weeks of becoming aware; GCC 2025 requires notification within 28 calendar days of the causative event; FIDIC requires notification within 28 calendar days of becoming aware.
2. WHEN a claim progresses from notified to particularised, THE Notice_Timeline_Engine SHALL calculate the submission deadline for detailed particulars based on the contract form: JBCC PBA requires particulars within 40 Working_Days of the causative event; NEC ECC requires detailed assessment within 8 weeks of notification; GCC 2025 requires Stage 2 particulars within the second-stage period configured in the contract data sheet; FIDIC requires detailed claim within 42 calendar days of notification.
3. WHEN a claim response deadline is approaching, THE Notice_Timeline_Engine SHALL generate Action Centre warnings at 14 calendar days, 7 calendar days, and 3 calendar days before expiry, addressed to the responding party (Principal Agent for contractor claims, Contractor for employer counterclaims).
4. WHEN a notice of dissatisfaction is issued, THE Notice_Timeline_Engine SHALL calculate the adjudication referral deadline based on the contract form: JBCC PBA requires referral within 20 Working_Days; NEC ECC requires referral within 4 weeks; GCC 2025 requires referral within 28 calendar days; FIDIC requires referral within 42 calendar days.
5. IF the notification deadline calculated in criterion 1 passes without the claim having been registered in the system, THEN THE Notice_Timeline_Engine SHALL mark the claim with a "time-barred risk" indicator and display a warning that the contractual notification period has elapsed, with a disclaimer that the time-bar determination requires legal review.
6. THE Notice_Timeline_Engine SHALL display a timeline visualisation for each claim in a non-terminal status showing: causative event date, notification date, notification deadline, particulars deadline, response deadline, and current position relative to each deadline, rendering any date not yet recorded as a pending placeholder.
7. WHEN a deadline calculation is displayed, THE Notice_Timeline_Engine SHALL include a disclaimer stating that deadline calculations are based on configured contract parameters and Working_Day assumptions, and that actual contractual deadlines must be verified against the signed contract by a suitably qualified professional.
8. IF the GCC 2025 second-stage period is not configured in the contract data sheet when a claim progresses to particularised, THEN THE Notice_Timeline_Engine SHALL display an error indication that the second-stage period must be configured before a particulars deadline can be calculated, and SHALL not generate a deadline until the value is provided.
9. WHEN the notification deadline calculated in criterion 1 is within 7 calendar days of expiry and no claim has been registered against the identified causative event, THE Notice_Timeline_Engine SHALL generate an Action Centre warning addressed to the claiming party indicating that the contractual notification window is closing.

### Requirement 7: Supporting Evidence Linkage

**User Story:** As a Contractor or Quantity Surveyor, I want to link structured supporting evidence to formal claims, so that claim submissions are well-documented and evidence is traceable.

#### Acceptance Criteria

1. THE Dispute_Engine SHALL provide an evidence linking interface for each formal claim, allowing the user to attach evidence items from the following platform sources: site diary entries (from Site Execution), contractual notices (from Contract Administration Notice Engine), variation orders (from Contract Administration Variation Register), site instructions (from Site Execution), payment certificates (from Finance module), programme/schedule extracts, correspondence records, weather records, and uploaded documents (from Documents module).
2. WHEN an evidence item is linked to a claim, THE Dispute_Engine SHALL record: evidence type, source module, source reference identifier, date of evidence, brief description (maximum 200 characters), and relevance category (causation, quantum, delay, or mitigation).
3. THE Dispute_Engine SHALL allow a minimum of 1 and maximum of 100 evidence items to be linked to a single claim.
4. IF a user attempts to link an evidence item that would exceed the maximum of 100 items on a single claim, THEN THE Dispute_Engine SHALL reject the link action and display an error message indicating the maximum evidence limit has been reached.
5. WHEN evidence is linked from another platform module, THE Dispute_Engine SHALL create a read-only cross-reference (not a copy), so that the evidence item reflects its current state in the source module.
6. WHEN the user requests generation of the evidence schedule for a claim, THE Dispute_Engine SHALL compile and display a schedule listing each linked item with: sequential item number, evidence type, date, source reference, description, and relevance category, sorted by date ascending.
7. IF a linked evidence item is subsequently deleted or archived in the source module, THEN THE Dispute_Engine SHALL update the cross-reference status to "source unavailable" upon the next access of the claim or evidence schedule, and display a warning to the user that the linked evidence is no longer accessible in the source module.
8. THE Dispute_Engine SHALL allow a user to unlink a previously linked evidence item from a claim, provided the claim has not been submitted for adjudication, and SHALL retain a minimum of 1 evidence item linked to any claim that has been submitted.
9. WHEN evidence is linked to or unlinked from a claim, THE Dispute_Engine SHALL record the action in the project Audit Trail with: claim reference, evidence reference, action type (linked or unlinked), actor identity, and timestamp.

### Requirement 8: Adjudication Workflow

**User Story:** As a Principal Agent or Contractor, I want to manage the adjudication process through a structured workflow, so that dispute referrals, submissions, and decisions are tracked and documented.

#### Acceptance Criteria

1. WHEN a claim is referred to adjudication, THE Adjudication_Manager SHALL capture: adjudicator name (maximum 200 characters), adjudicator appointment date, referring party, respondent party, dispute value (numeric in ZAR, range 0.01 to 999,999,999.99), time in dispute (in Working_Days if applicable, range 0 to 9999), and referral notice reference from the Notice_Timeline_Engine.
2. THE Adjudication_Manager SHALL track the adjudication through stages: referred, adjudicator appointed, submissions open, submissions closed, hearing scheduled, hearing completed, decision issued, and decision implemented. Transitions SHALL proceed sequentially with no stage skipped except that "hearing scheduled" and "hearing completed" may be bypassed for documents-only adjudications. Each stage transition SHALL write an audit record to the project audit trail containing the previous stage, new stage, actor identity, and timestamp.
3. WHEN the adjudication reaches "submissions open" stage, THE Adjudication_Manager SHALL surface actions in the Action Centre for both parties indicating the submission deadline and the maximum number of submission rounds configured for the adjudication (minimum 1, maximum 5, default 2 rounds: referral bundle and response bundle).
4. WHEN a party uploads a submission document bundle, THE Adjudication_Manager SHALL register the bundle in the Documents module with metadata: document type "adjudication submission", party name, submission round number, date submitted, and adjudication reference.
5. WHEN a decision is issued, THE Adjudication_Manager SHALL record: decision date, amount awarded (numeric in ZAR, range 0.00 to 999,999,999.99), time awarded (in Working_Days, range 0 to 9999), decision summary (maximum 2000 characters), and whether the decision is interim binding or final.
6. WHEN an adjudication decision awards additional time, THE Adjudication_Manager SHALL update the Contract Data Sheet revised completion date via the Working Day Calculator and write the change to the Project Passport.
7. WHEN an adjudication decision awards a monetary amount, THE Adjudication_Manager SHALL create an action in the Finance module Action Centre for payment processing within the contract-specified payment period (default 7 calendar days from decision).
8. THE Adjudication_Manager SHALL display a non-dismissible Disclaimer_Banner on all adjudication views stating that the adjudication workflow is a record-keeping tool and does not constitute legal process management, and that parties must engage qualified legal professionals for adjudication proceedings.
9. IF the submission deadline passes and a party has not uploaded a submission bundle for a required round, THEN THE Adjudication_Manager SHALL surface an overdue action in the Action Centre for that party and allow the adjudicator-appointed party to advance the stage to "submissions closed".
10. WHEN an adjudication is created or reaches "decision implemented" stage, THE Adjudication_Manager SHALL write the adjudication status and outcome summary to the Project Passport dispute register.

### Requirement 9: Quantum and Delay Analysis Support

**User Story:** As a Quantity Surveyor or Claims Consultant, I want structured support for quantum and delay analysis, so that claim valuations are documented with traceable cost breakdowns and delay event linkage.

#### Acceptance Criteria

1. WHEN a user creates a quantum assessment for a monetary claim, THE Quantum_Analyser SHALL capture cost line items (minimum 1, maximum 500) with: description (maximum 500 characters), cost category (labour, materials, plant, preliminaries, overheads, profit, or other), unit (maximum 50 characters), quantity (numeric, range 0.01–999,999.99), rate (numeric in ZAR, range 0.01–999,999.99), and amount (auto-calculated as quantity multiplied by rate, rounded to 2 decimal places).
2. THE Quantum_Analyser SHALL calculate and display upon any line item change: subtotal per cost category, total quantum amount (sum of all line items), and percentage breakdown by category (each category's subtotal divided by total, displayed to 1 decimal place).
3. WHEN a user creates a delay analysis for an EoT or prolongation claim, THE Quantum_Analyser SHALL capture delay events (minimum 1, maximum 200) with: event description (maximum 500 characters), event start date, event end date (must be on or after start date), delay type (critical path or concurrent), responsible party (employer, contractor, neutral, or shared), and Working_Days impacted (auto-calculated from start and end dates excluding non-working days per SA Public Holidays Act 36 of 1994).
4. THE Quantum_Analyser SHALL calculate and display upon any delay event change: total delay days by responsible party, net claimable delay (employer-responsible critical-path days minus concurrent days attributed to the contractor where responsible party is "shared"), and a chronological delay event timeline sorted by start date.
5. WHEN a quantum assessment or delay analysis is marked as completed by the user, THE Quantum_Analyser SHALL allow linking to the parent formal claim and update the claim's amount claimed or time claimed fields if the user confirms the update.
6. THE Quantum_Analyser SHALL display an advisory disclaimer stating that quantum and delay analyses produced by the platform are indicative calculations only and do not constitute expert opinion, and that formal claim submissions require review by a qualified quantity surveyor or claims consultant.
7. IF a delay event end date is before the start date, THEN THE Quantum_Analyser SHALL reject the entry and indicate that the end date must be on or after the start date.
8. IF a cost line item has a quantity or rate of zero or negative, THEN THE Quantum_Analyser SHALL reject the entry and indicate that quantity and rate must be positive values.
9. IF a user attempts to add a cost line item that would exceed the maximum of 500 items, or a delay event that would exceed the maximum of 200 events, THEN THE Quantum_Analyser SHALL reject the addition and display the applicable limit.

### Requirement 10: Dispute Resolution Integration with Contract Administration

**User Story:** As a project team member, I want the Dispute Resolution module to integrate seamlessly with the existing Contract Administration module, so that claims escalated from Contract Admin flow into the formal dispute process without data re-entry.

#### Acceptance Criteria

1. WHEN a claim in the Contract Administration Claims Register is escalated to "disputed" status, THE Dispute_Engine SHALL offer to create a corresponding formal claim record pre-populated with: claim type, date of event, notification date, contract clause, amount claimed, and time claimed from the Contract Administration claim record.
2. WHEN a formal claim is created from a Contract Administration escalation, THE Dispute_Engine SHALL maintain a bidirectional cross-reference between the Contract Administration claim and the formal dispute claim, so that a status change persisted in either module is queryable from the other module within the same user request–response cycle.
3. WHEN evidence is already linked to the Contract Administration claim, THE Dispute_Engine SHALL pre-populate the formal claim evidence list with cross-references to the same evidence items.
4. WHEN an adjudication decision is issued that awards a time extension or a monetary sum, THE Dispute_Engine SHALL write the outcome back to the Contract Administration module: updating the revised completion date for time awards, and creating a payment instruction reference for monetary awards.
5. WHEN a formal claim is resolved, THE Dispute_Engine SHALL update the corresponding Contract Administration claim status to "disputed" and record the resolution metadata: resolution type (settled, awarded in full, awarded in part, or dismissed), resolved date, and awarded amount or time where applicable.
6. WHEN the number of active disputes, total disputed amount, or days since oldest unresolved dispute changes, THE Dispute_Engine SHALL update the Project Passport health card with the current values: number of active disputes, total disputed amount in ZAR, and calendar days since the oldest unresolved dispute was filed.
7. THE Dispute_Engine SHALL write all claim registrations, status transitions, evidence linkages, and adjudication outcomes as immutable records in the project Audit Trail.
8. IF a write-back to the Contract Administration module fails, THEN THE Dispute_Engine SHALL retain the pending update, retry up to 3 times with exponential back-off, and surface a high-priority action in the Action Centre indicating the synchronisation failure and the affected claim reference.

---

## Module C: NHBRC Enrolment & Home Builder Workflow (P1.6)

---

### Requirement 11: NHBRC Enrolment Checklist and Fee Calculator

**User Story:** As a Home Builder or Developer, I want a structured NHBRC enrolment checklist and fee calculator, so that I can track enrolment requirements and understand the fees applicable to my residential project.

#### Acceptance Criteria

1. WHEN a user initiates NHBRC enrolment for a residential project, THE NHBRC_Engine SHALL present a checklist of enrolment requirements: builder NHBRC registration number (verified active), approved building plans, proof of ownership or consent from owner, project details (number of units, unit types, estimated construction value per unit in ZAR), site address, and enrolment fee payment confirmation.
2. WHEN a user changes the status of a checklist item, THE NHBRC_Engine SHALL update that item to one of the following statuses: not started, in progress, completed, or not applicable, and SHALL recalculate overall enrolment readiness as the percentage of applicable items (items not marked "not applicable") that are marked completed, displayed as a whole number from 0 to 100.
3. WHEN a user enters project details including the number of units (1 to 10,000) and estimated construction value per unit (ZAR 0.01 to ZAR 999,999,999.99), THE NHBRC_Engine SHALL calculate the NHBRC enrolment fee using the formula: fee = number of units multiplied by the applicable fee rate per unit based on construction value band. Fee bands SHALL be configurable and default to the published NHBRC fee schedule (the platform SHALL NOT hard-code specific fee amounts but allow configuration).
4. IF no fee band configuration is available or the entered construction value does not fall within any configured band, THEN THE NHBRC_Engine SHALL display a message indicating that the fee cannot be calculated due to missing or inapplicable fee band configuration, and SHALL not display a calculated fee amount.
5. WHEN the NHBRC_Engine successfully calculates an enrolment fee, THE NHBRC_Engine SHALL display the calculated fee with a disclaimer stating that the fee is an estimate based on configured fee bands and that the actual fee must be confirmed with the NHBRC directly.
6. WHEN all applicable checklist items are marked completed, THE NHBRC_Engine SHALL surface an action in the Action Centre indicating that the project is ready for NHBRC enrolment submission, and SHALL update the Project Passport with enrolment readiness status.
7. IF the builder NHBRC registration number cannot be verified as active through the Builder_Verification service within 30 seconds, THEN THE NHBRC_Engine SHALL flag the checklist item as non-compliant and display a warning that the builder's NHBRC registration status requires verification.
8. WHEN enrolment checklist status changes, THE NHBRC_Engine SHALL record the change in the project Audit Trail with: checklist item, previous status, new status, actor identity, and timestamp.
9. THE NHBRC_Engine SHALL display a Disclaimer_Banner stating that the enrolment checklist is advisory, does not constitute a formal NHBRC submission, and that the builder must complete enrolment directly with the NHBRC.

### Requirement 12: Stage Inspection Tracking

**User Story:** As a Home Builder or Site Manager, I want to track NHBRC-mandated stage inspections from foundation through completion, so that I can schedule inspections, record outcomes, and ensure construction does not proceed past required hold points without inspection sign-off.

#### Acceptance Criteria

1. THE Inspection_Tracker SHALL define four mandatory inspection stages for each enrolled residential unit in the following sequence: foundation (before backfill), wall plate (before roof structure), roof (before ceiling and cladding), and completion (before occupation). The sequence SHALL be enforced — a later stage cannot be marked as passed until the preceding stage is passed or waived. Only users with the role of architect, engineer, or site_manager SHALL be permitted to waive a stage.
2. WHEN a user records an inspection outcome for a stage, THE Inspection_Tracker SHALL capture: inspection stage, inspection date, inspector name (maximum 200 characters), outcome (passed, failed, or conditionally passed), conditions or defects noted (maximum 2000 characters, mandatory if outcome is failed or conditionally passed), and linked photographic evidence (minimum 0, maximum 20 images from the Site Execution field evidence module). THE Inspection_Tracker SHALL persist the record within 3 seconds of submission.
3. WHEN an inspection outcome is "failed", THE Inspection_Tracker SHALL create an action in the Action Centre for the Site Manager and Home Builder indicating: the failed stage, defects noted, and that rectification and re-inspection are required before proceeding.
4. WHEN an inspection outcome is "conditionally passed", THE Inspection_Tracker SHALL record the conditions and create a follow-up action in the Action Centre for the Site Manager with a deadline for condition compliance (configurable per project, default 14 calendar days). IF the condition compliance deadline expires without the conditions being recorded as resolved, THEN THE Inspection_Tracker SHALL escalate by creating a critical-priority action in the Action Centre for the Home Builder and architect indicating the overdue conditions and the affected unit.
5. WHEN all four inspection stages for a unit are passed, THE Inspection_Tracker SHALL update the unit status to "inspection complete" and surface a notification to the Home Builder, Site Manager, and architect indicating the unit is ready for NHBRC completion certification.
6. THE Inspection_Tracker SHALL expose each unit's current inspection stage and hold-point status to the Site Execution module so that inspection hold points are displayed on the construction programme view alongside programme tasks.
7. WHEN an inspection outcome is recorded, THE Inspection_Tracker SHALL write the record to the project Audit Trail with: unit identifier, inspection stage, date, inspector name, outcome, and actor identity.
8. IF a user attempts to record a later-stage inspection when the preceding stage has not passed or been waived, THEN THE Inspection_Tracker SHALL reject the entry and display an indication of which preceding stage must be completed first.
9. THE Inspection_Tracker SHALL expose inspection status per unit to the Project Passport, showing: units enrolled, units per inspection stage, units with failed inspections requiring rectification, and units with all inspections complete.
10. IF a user attempts to record an inspection outcome without the role of architect, engineer, site_manager, or contractor, THEN THE Inspection_Tracker SHALL reject the submission and indicate that the user lacks permission to record inspection outcomes.

### Requirement 13: Warranty Claim Management

**User Story:** As a Housing Consumer or Home Builder, I want to manage warranty claims under the NHBRC 5-year structural warranty, so that defects discovered after occupation are tracked from reporting through resolution.

#### Acceptance Criteria

1. WHEN a user with the role Housing Consumer or Home Builder registers a warranty claim, THE Warranty_Manager SHALL capture: unit identifier (selected from enrolled units within the active project), claimant name and contact details, defect description (maximum 2000 characters), defect category (structural, roof waterproofing, or wall waterproofing — the three categories covered by the NHBRC warranty), date defect discovered, date of practical completion for the unit (to determine warranty period), and linked photographic evidence (minimum 1, maximum 20 images; each image maximum 10 MB; accepted formats: JPEG, PNG, or HEIF).
2. WHEN a user submits a warranty claim, THE Warranty_Manager SHALL validate that all required fields are populated and that the selected unit identifier exists in the project's enrolled units. IF any required field is missing or the unit identifier is not found, THEN THE Warranty_Manager SHALL prevent submission and display an indication of which fields require correction.
3. WHEN a user submits a warranty claim, THE Warranty_Manager SHALL validate that the defect discovery date falls within the 5-year warranty period calculated from the practical completion date of the unit. IF the discovery date is after the warranty expiry, THEN THE Warranty_Manager SHALL display a warning that the claim may be outside the warranty period and record the claim with a "potentially out of warranty" flag.
4. THE Warranty_Manager SHALL track each warranty claim through stages: reported, acknowledged, inspection scheduled, inspected, liability determined (builder liable, shared liability, or no liability), rectification ordered, rectification in progress, rectification complete, and claim closed. Only users with the role Home Builder or project administrator SHALL advance a claim to the next sequential stage, with the exception that "no liability" determination may transition directly to "claim closed".
5. WHEN a warranty claim reaches "inspection scheduled" stage, THE Warranty_Manager SHALL surface an action in the Action Centre of the Home Builder with the scheduled inspection date and the unit address.
6. WHEN a warranty claim reaches "rectification ordered" stage, THE Warranty_Manager SHALL capture: rectification description (maximum 2000 characters), deadline for completion (calendar date, minimum 7 calendar days and maximum 180 calendar days from the order date), and responsible party (builder).
7. WHEN the rectification deadline passes without the claim progressing to "rectification complete", THE Warranty_Manager SHALL surface an overdue warning in the Action Centre of the Home Builder and the project administrator within 24 hours of the deadline passing.
8. THE Warranty_Manager SHALL maintain a warranty claims summary per project displaying: total claims by category, claims per status stage, average resolution time (calendar days from reported to claim closed), and claims within versus outside warranty period.
9. WHEN a warranty claim status changes, THE Warranty_Manager SHALL record the transition in the project Audit Trail with: unit identifier, claim reference, previous status, new status, actor identity, and timestamp.
10. WHILE a user is viewing the warranty claim registration form or any warranty claim detail view, THE Warranty_Manager SHALL display a Disclaimer_Banner stating that the warranty claim workflow is a tracking tool and does not constitute a formal NHBRC warranty claim submission, and that claims must be lodged directly with the NHBRC through their official process.

### Requirement 14: Builder Registration Status Check

**User Story:** As a Client or Principal Agent, I want to verify a home builder's NHBRC registration status, so that I can confirm the builder is registered and in good standing before appointing them for residential construction.

#### Acceptance Criteria

1. WHEN a user initiates a builder registration check, THE Builder_Verification SHALL capture: builder name (minimum 2 characters, maximum 200 characters), NHBRC registration number (alphanumeric, minimum 4 characters, maximum 20 characters), and verification date (defaults to current date, must not be a future date).
2. IF any captured input fails validation (empty builder name, registration number outside 4–20 alphanumeric characters, or future verification date), THEN THE Builder_Verification SHALL reject the submission and display a field-level error indication identifying which input is invalid, without clearing other valid fields.
3. WHEN a builder verification check completes, THE Builder_Verification SHALL record the verification result with one of these statuses: verified active, verified suspended, verified expired, or unverifiable (when the registration number cannot be confirmed through available means).
4. WHEN a builder verification result is "verified active", THE Builder_Verification SHALL record: registration category (as reported), maximum project value allowed (recorded as a currency amount in ZAR when the NHBRC register provides a value, or omitted when no value cap is reported), and expiry date of registration.
5. WHEN a builder verification result is "verified suspended" or "verified expired", THE Builder_Verification SHALL surface a warning in the Action Centre of the requesting user and the project Principal Agent within 10 seconds of result completion, indicating that the builder may not lawfully undertake home building work.
6. IF the verified builder has a platform account, THEN THE Builder_Verification SHALL record the verification result as a verification badge on the builder's platform profile via the Trust & Verification module.
7. THE Builder_Verification SHALL display a disclaimer on the verification result view stating that registration status verification is based on information available at the time of the check, that registration status may change, and that users should independently verify status with the NHBRC before making appointment decisions.
8. WHEN a builder verification is performed, THE Builder_Verification SHALL record the check in the project Audit Trail with: builder name, registration number, verification result, verification date, and requesting user identity.
9. WHEN a builder verification is performed for a registration number that has been previously verified within the same project, THE Builder_Verification SHALL retain all prior verification records in the Audit Trail and display the most recent result, with a visible indicator that a prior check exists.

### Requirement 15: NHBRC Module Integration

**User Story:** As a project team member, I want the NHBRC module to integrate with existing platform modules, so that residential project compliance status contributes to the overall project health picture.

#### Acceptance Criteria

1. WHEN NHBRC enrolment readiness changes or inspection milestones are reached, THE NHBRC_Engine SHALL update the Project Passport within 5 seconds with: enrolment status (not started, in progress, enrolled), total units enrolled, inspection progress summary (count of units at each stage: foundation, wall plate, roof, completion), and warranty claims count.
2. WHEN an inspection fails and requires rectification, THE NHBRC_Engine SHALL create a risk event in the Risk Engine with category "construction compliance" and severity "high", indicating that construction may not proceed at the affected hold point, and SHALL surface an action in the Action Centre of the project manager and site manager indicating: unit identifier, failed inspection stage, and rectification requirement.
3. WHEN the project reaches the Closeout phase, THE NHBRC_Engine SHALL generate closeout checklist items verifying: all stage inspections passed for all units, NHBRC completion certificates obtained, and warranty documentation handed over to housing consumers.
4. WHILE a project is classified as residential, THE NHBRC_Engine SHALL display the current NHBRC enrolment status (not started, in progress, enrolled) as a line item on the Municipal Compliance module's submission checklist for building plan approvals, updating within 5 seconds of any enrolment status change.
5. WHEN a builder's registration status is verified, THE NHBRC_Engine SHALL expose the verification result to the Trust & Verification module for display on the builder's profile, including: registration number, registration status (active, suspended, deregistered), verification date, and the identity of the requesting user.
6. THE NHBRC_Engine SHALL write all enrolment status changes, inspection outcomes, warranty claim transitions, and builder verifications as immutable records in the project Audit Trail, each record including: event type, affected unit identifier (where applicable), previous state, new state, timestamp, and actor identity.
7. WHEN inspection stage photographs are uploaded, THE NHBRC_Engine SHALL register them in the Documents module with metadata: document type "NHBRC inspection evidence", unit identifier, inspection stage (foundation, wall plate, roof, or completion), date, and outcome (pass, fail, or conditional pass).
8. WHEN an enrolment status changes to "enrolled" or when an inspection milestone is reached, THE NHBRC_Engine SHALL surface a notification in the Action Centre of all project team members with NHBRC-related roles, indicating: event type, unit identifier, new status, and date.

---

## Module D: Survey & Geomatics Layer (P1.7)

---

### Requirement 16: Survey Instruction and Brief

**User Story:** As an Architect or Developer, I want to create and issue survey instructions to land surveyors, so that survey scope is clearly defined and the surveyor receives a structured brief linked to the project context.

#### Acceptance Criteria

1. WHEN a user creates a survey instruction, THE Survey_Engine SHALL capture: instruction reference (system-generated, unique per project), survey type (boundary determination, topographic survey, as-built survey, sectional title survey, subdivision survey, consolidation survey, or general purposes diagram), property description (erf/lot number, township/suburb, municipality — maximum 500 characters), scope of work description (maximum 2000 characters), appointed land surveyor (selected from project team members with land_surveyor role, or entered manually with name and PLATO registration number), required completion date, and linked project documents (title deed, approved plans, existing diagrams — minimum 0, maximum 20 references).
2. THE Survey_Engine SHALL track each survey instruction through stages: drafted, issued, accepted, fieldwork in progress, office processing, submitted to SG, and completed. Transitions SHALL proceed sequentially; a stage cannot be skipped except that "submitted to SG" may be bypassed for survey types that do not require SG approval (topographic survey and as-built survey).
3. WHEN a survey instruction is issued, THE Survey_Engine SHALL surface an action in the Action Centre of the appointed land surveyor indicating: instruction reference, survey type, property description, scope summary, and required completion date.
4. WHEN a survey instruction is issued, THE Survey_Engine SHALL record the instruction in the project Audit Trail with: instruction reference, survey type, appointed surveyor, issue date, and issuing user identity.
5. IF a user attempts to issue a survey instruction without providing all mandatory fields (survey type, property description, scope of work, appointed land surveyor, and required completion date), THEN THE Survey_Engine SHALL reject the submission and indicate which mandatory fields are missing.
6. WHEN the required completion date is approaching (14 calendar days and 7 calendar days before), THE Survey_Engine SHALL surface reminder notifications in the Action Centre of the appointed land surveyor and the issuing user.
7. IF a user attempts to transition a survey instruction to a stage out of sequence (skipping a required intermediate stage), THEN THE Survey_Engine SHALL reject the transition and indicate the current stage and the next permitted stage.

### Requirement 17: SG Diagram Tracking

**User Story:** As a Land Surveyor or Developer, I want to track SG diagram submissions through the lodgement-to-approval lifecycle, so that the project team has visibility of diagram processing status and can plan dependent activities accordingly.

#### Acceptance Criteria

1. WHEN a user registers an SG diagram submission, THE SG_Tracker SHALL capture: diagram reference number (maximum 50 characters, unique within the project), diagram type (general plan, sectional title, subdivision, consolidation, or servitude), linked survey instruction reference, property description (erf/lot, township, municipality — maximum 200 characters), lodgement date, lodgement office (selected from configurable list of Surveyor-General offices: Cape Town, Pretoria, Pietermaritzburg, Bloemfontein, King William's Town, or Mthatha), and land surveyor identity (name and PLATO registration number, maximum 20 characters).
2. THE SG_Tracker SHALL track each diagram through stages: prepared, checked, lodged, examination in progress, queries raised, queries resolved, approved, and registered. Transitions SHALL be: prepared → checked → lodged → examination in progress → approved → registered; from "examination in progress" a diagram may transition to "queries raised" → "queries resolved" → "examination in progress" (returning to examination); and from any stage prior to approved, a diagram may be withdrawn.
3. WHEN a diagram status changes, THE SG_Tracker SHALL record the transition in the project Audit Trail with: diagram reference, previous status, new status, date of transition, and actor identity.
4. WHEN a diagram reaches "queries raised" status, THE SG_Tracker SHALL surface an action in the Action Centre of the land surveyor indicating: diagram reference, query details (maximum 2000 characters), and response deadline (as a date value, or explicitly marked as not yet determined by the SG office).
5. WHEN a diagram is approved, THE SG_Tracker SHALL record the approval date and SG approval number (maximum 30 characters), update the linked survey instruction to "completed" status, and surface a notification to the project team indicating the diagram is approved and ready for registration.
6. THE SG_Tracker SHALL display the current processing time for each lodged diagram calculated as Working_Days elapsed since the lodgement date, and shall display the expected processing time based on the configured average for the lodgement office (configurable, default 60 Working_Days).
7. WHEN a diagram has been in "examination in progress" or "queries raised" status for longer than the configured expected processing time plus 20%, THE SG_Tracker SHALL surface a warning in the Action Centre of the land surveyor and the project administrator indicating the diagram reference, the elapsed Working_Days, and the exceeded threshold value.
8. THE SG_Tracker SHALL integrate with the Town Planning module (P0.3) to link diagrams to subdivision or consolidation applications, so that town planning application status reflects whether the required SG diagram has been approved.
9. IF a user attempts to register a diagram with a reference number that already exists within the project, THEN THE SG_Tracker SHALL reject the submission and display an error message indicating that the diagram reference is already registered.
10. WHEN a diagram is withdrawn, THE SG_Tracker SHALL record the withdrawal in the project Audit Trail with: diagram reference, stage at time of withdrawal, date, actor identity, and reason for withdrawal (maximum 500 characters); and SHALL surface a notification to the project team indicating the diagram has been withdrawn.
11. IF a user submits a registration with a missing or invalid required field (diagram reference, diagram type, lodgement date, lodgement office, or land surveyor identity), THEN THE SG_Tracker SHALL reject the submission and indicate which fields failed validation.

### Requirement 18: Beacon and Boundary Point Register

**User Story:** As a Land Surveyor, I want to maintain a register of boundary beacons and survey points, so that the project has a complete record of physical boundary markers including their coordinates, condition, and any disturbances.

#### Acceptance Criteria

1. WHEN a user registers a beacon or boundary point, THE Beacon_Register SHALL capture: beacon identifier (alphanumeric, maximum 50 characters, unique within the project), beacon type (iron peg, concrete block, nail in tar, reference mark, trigonometric beacon, or other), coordinates (latitude and longitude in decimal degrees to 8 decimal places, or Y and X in Lo coordinate system to 3 decimal places), coordinate reference system (WGS84 or Hartebeesthoek94), physical condition (intact, damaged, missing, or replaced), date of last inspection, linked SG diagram reference (if applicable), and notes (maximum 500 characters).
2. THE Beacon_Register SHALL maintain a register listing all beacons with: identifier, type, coordinates, condition status, date last inspected, and linked diagram reference, sortable by identifier, type, or condition.
3. WHEN a beacon condition is recorded as "damaged" or "missing", THE Beacon_Register SHALL surface a notification in the Action Centre of the land surveyor indicating: beacon identifier, condition, and a recommendation to arrange replacement or re-establishment before construction proceeds in that area.
4. WHEN a beacon is replaced or re-established, THE Beacon_Register SHALL record: new coordinates (if different from original), date of replacement, replacing surveyor identity, reason for replacement (maximum 500 characters), and linked photographic evidence (minimum 0, maximum 10 images).
5. THE Beacon_Register SHALL support linking beacons to property boundaries by allowing the user to define boundary lines as ordered sequences of beacon identifiers (minimum 2 beacons per boundary line), creating a boundary geometry record for each property parcel.
6. WHEN a beacon record is created or updated, THE Beacon_Register SHALL record the action in the project Audit Trail with: beacon identifier, action type (created, updated, condition changed, or replaced), actor identity, and timestamp.
7. IF a user attempts to register a beacon with coordinates outside the geographic bounds of South Africa (latitude not between -22.0 and -35.0, longitude not between 16.0 and 33.0 for WGS84), THEN THE Beacon_Register SHALL display a warning that the coordinates appear to be outside South Africa and request confirmation before saving.
8. IF a user attempts to register a beacon with an identifier that already exists within the project, THEN THE Beacon_Register SHALL reject the submission and display an error indicating the identifier is already in use.

### Requirement 19: As-Built Survey Comparison

**User Story:** As a Land Surveyor or Architect, I want to compare as-built survey measurements against approved plan dimensions, so that deviations between the built structure and the approved plans are identified and documented.

#### Acceptance Criteria

1. WHEN a user creates an as-built comparison, THE As_Built_Comparator SHALL capture: comparison reference (system-generated, unique per project), linked survey instruction reference, linked approved plan reference (from the Documents module), survey date, and surveyor identity.
2. THE As_Built_Comparator SHALL allow the user to enter measurement pairs consisting of: dimension description (maximum 200 characters), approved plan dimension (numeric in metres, range 0.001–99999.999, to 3 decimal places), as-built measured dimension (numeric in metres, same range and precision), and tolerance threshold (numeric in metres, range 0.001–1.000, default 0.050m for building dimensions, configurable per comparison).
3. WHEN a measurement pair is saved, THE As_Built_Comparator SHALL calculate: the deviation (as-built minus approved, which may be positive or negative), the absolute deviation, and a compliance flag (within tolerance if absolute deviation is less than or equal to the tolerance threshold, outside tolerance otherwise).
4. THE As_Built_Comparator SHALL generate a comparison summary displaying: total measurements taken, number within tolerance, number outside tolerance, maximum deviation recorded, and overall compliance percentage (measurements within tolerance divided by total measurements, displayed to 1 decimal place; displayed as 0.0% when zero measurements exist).
5. WHEN any measurement exceeds the tolerance threshold, THE As_Built_Comparator SHALL flag the deviation and surface a notification in the Action Centre of the Architect and the project Principal Agent indicating: dimension description, approved value, as-built value, deviation amount, and the applicable tolerance.
6. WHEN the user marks an as-built comparison as completed (requiring at least 1 measurement pair), THE As_Built_Comparator SHALL register the comparison report in the Documents module with metadata: document type "as-built survey comparison", survey date, surveyor identity, comparison reference, and overall compliance percentage.
7. THE As_Built_Comparator SHALL integrate with the Closeout module by contributing as-built survey comparison results to the handover pack documentation, flagging any out-of-tolerance deviations that have not been acknowledged or resolved by the Architect as outstanding items requiring resolution before handover.
8. WHEN an as-built comparison is created or updated, THE As_Built_Comparator SHALL record the action in the project Audit Trail with: comparison reference, number of measurements, compliance percentage, actor identity, and timestamp.
9. IF the linked approved plan reference or linked survey instruction reference cannot be resolved in the Documents module, THEN THE As_Built_Comparator SHALL prevent comparison creation and display an error message indicating which linked reference is invalid.

### Requirement 20: Survey Module Integration with Town Planning

**User Story:** As a project team member, I want the Survey & Geomatics module to integrate with the existing Town Planning module (P0.3), so that survey workflows extend the basic subdivision process already built.

#### Acceptance Criteria

1. WHEN a Town Planning subdivision or consolidation application reaches the "conditions_compliance" stage and a condition exists whose description contains the keyword "survey" or "diagram" (case-insensitive), THE Survey_Engine SHALL within 5 seconds create a draft survey instruction pre-populated with: survey type (subdivision or consolidation matching the application type), property description (erfNumber, townshipName, and municipality from the LandUseApplication), and the condition description text as the scope of work basis.
2. IF the draft survey instruction cannot be created because required fields (erfNumber, townshipName, or municipality) are missing from the Town Planning application, THEN THE Survey_Engine SHALL log a failed-creation audit event and create a risk event in the Risk Engine with category "survey" and severity "low", indicating incomplete property data blocking survey instruction generation.
3. WHEN an SG diagram is approved for a survey instruction linked to a Town Planning application, THE SG_Tracker SHALL transition the corresponding condition in the Town Planning conditions register from "in_progress" to "fulfilled" status (respecting the forward-only state machine) and record the SG approval number and approval date as evidence on the condition.
4. WHEN a survey instruction status changes or an SG diagram transitions to a new stage, THE Survey_Engine SHALL update the Project Passport health card within 10 seconds with: active survey instructions count, diagrams awaiting SG approval count, and diagrams approved count.
5. WHEN a beacon register indicates one or more beacons with status "damaged" or "missing" on a property identified by erfNumber matching a Town Planning application in stages "preparation" through "conditions_compliance", THE Survey_Engine SHALL create a risk event in the Risk Engine with category "survey" and severity "medium", indicating potential boundary uncertainty affecting the application.
6. IF a subdivision or consolidation application attempts to transition to "decision" stage, THEN THE Survey_Engine SHALL query the Sequential Dependency service and block the transition unless at least one linked SG diagram has reached "lodged" stage or later, OR the survey requirement on the application has been marked as "not_applicable" with a reason and authorising user recorded.
7. THE Survey_Engine SHALL write all survey instructions, SG diagram stage transitions, beacon register changes, and as-built comparison results as append-only records in the project Audit Trail, each record containing: event type, timestamp, acting user ID, affected entity ID, previous state, and new state.
8. WHEN a survey-related document is uploaded (one of: survey instruction PDF, field notes, SG diagram PDF, or as-built report), THE Survey_Engine SHALL register the document in the Documents module with metadata: document type (from the four accepted types), survey instruction reference ID, property description (erfNumber and township), and surveyor identity (user ID and name).

---

## Module E: Cross-Cutting Requirements

---

### Requirement 21: Role-Based Access Control for P1 Modules

**User Story:** As a platform administrator, I want all P1 extension modules to respect role-based access control, so that each user only sees and performs actions appropriate to their platform role and project assignment.

#### Acceptance Criteria

1. WHILE a user has the role of architect, bep, cpm, or quantity_surveyor, THE Insurance_Register SHALL grant read and write access to all Insurance_Register actions for projects where that user is listed as an assigned team member in the project team record.
2. WHILE a user has the role of contractor, THE Insurance_Register SHALL grant access to view the insurance register and register claims notifications for policies where the contractor is the policyholder, for projects where that user is listed as an assigned contractor in the project team record.
3. WHILE a user has the role of architect, bep, cpm, or quantity_surveyor, THE Dispute_Engine SHALL grant read and write access to all Dispute_Engine actions for projects where that user is listed as an assigned team member in the project team record.
4. WHILE a user has the role of contractor, THE Dispute_Engine SHALL grant access to create and manage claims where the contractor is the claimant, submit evidence, and view adjudication status for projects where that user is listed as an assigned contractor in the project team record.
5. WHILE a user has the role of contractor or developer, THE NHBRC_Engine SHALL grant read and write access to NHBRC enrolment, inspection tracking, and warranty management for projects where that user is listed as an assigned builder or project owner in the project team record.
6. WHILE a user has the role of site_manager, THE NHBRC_Engine SHALL grant access to record inspection outcomes and view enrolment status for projects where that user is listed as assigned in the project team record.
7. WHILE a user has the role of client, THE NHBRC_Engine SHALL grant read-only access to inspection status and warranty claims for projects where that user is listed as the project owner in the project team record.
8. WHILE a user has the role of land_surveyor, THE Survey_Engine SHALL grant read and write access to survey instructions (where appointed), SG diagram tracking, beacon register, and as-built comparison for projects where that user is listed as an assigned team member in the project team record.
9. WHILE a user has the role of architect, bep, cpm, or developer, THE Survey_Engine SHALL grant access to create survey instructions, view SG diagram status, and view as-built comparisons for projects where that user is listed as an assigned team member in the project team record.
10. WHILE a user has the role of admin or platform_admin, all four P1 modules SHALL grant full read and write access across all projects without requiring project-level assignment.
11. IF a user attempts to access a P1 module feature without the required role or project assignment, THEN the module SHALL deny the action within 500 milliseconds, prevent any state change, display an error message indicating insufficient authorisation, and record the denial in the project Audit Trail with: actor identity, attempted action, module name, project identifier, and timestamp.
12. IF a user holds multiple roles, THEN all four P1 modules SHALL grant the union of permissions associated with each assigned role, applying the least restrictive access for each feature.
13. IF a user holds a role not explicitly listed in criteria 1 through 10 for a given P1 module, THEN that module SHALL deny all access to that user for that module, applying default-deny behaviour.
14. WHEN a user's project assignment or role is removed, THEN the affected P1 module SHALL revoke the corresponding permissions on the next access check, preventing any further state changes under the prior assignment.

### Requirement 22: Advisory Disclaimers and Compliance Posture

**User Story:** As a platform user, I want clear disclaimers that all P1 modules are advisory only, so that I understand the platform does not replace professional advice and all outputs require independent verification.

#### Acceptance Criteria

1. THE Insurance_Register SHALL display a persistent, non-dismissible Disclaimer_Banner on every insurance-related view stating that the platform does not provide insurance advice, that coverage adequacy must be verified by a qualified insurance broker, and that all insurance decisions require professional review.
2. THE Dispute_Engine SHALL display a persistent, non-dismissible Disclaimer_Banner on every dispute resolution view stating that the platform does not provide legal advice, that all claim submissions and dispute processes require qualified legal counsel, and that deadline calculations are indicative only.
3. THE NHBRC_Engine SHALL display a persistent, non-dismissible Disclaimer_Banner on every NHBRC-related view stating that the platform does not replace the formal NHBRC enrolment or inspection process, that all submissions must be made directly to the NHBRC, and that fee calculations are estimates only.
4. THE Survey_Engine SHALL display a persistent, non-dismissible Disclaimer_Banner on every survey-related view stating that the platform does not replace professional land survey services, that all cadastral work must be performed by a registered land surveyor, and that coordinate data is for reference purposes only.
5. IF a Disclaimer_Banner fails to render on any P1 module view within 3 seconds, THEN the module SHALL display an overlay preventing user interaction with that view until the disclaimer is successfully displayed.
6. THE Dispute_Engine SHALL NOT reproduce copyrighted contract clause text — all references SHALL be by clause number and descriptive title only.
7. THE NHBRC_Engine SHALL NOT reproduce copyrighted legislative text from the Housing Consumers Protection Measures Act — all references SHALL be by section number and descriptive title only.
8. THE Survey_Engine SHALL NOT reproduce copyrighted legislative text from the Land Survey Act — all references SHALL be by section number and descriptive title only.
9. WHEN any P1 module generates an exported or printable output document (PDF, CSV, or printable view), the module SHALL include a disclaimer footer on the output stating that the content is for reference purposes only and does not replace professional advice.

### Requirement 23: Platform Integration Contracts

**User Story:** As a project team member, I want all P1 modules to integrate with the platform spine (Project Passport, SpecForge, Audit Trail, Action Centre, Risk Engine), so that data flows seamlessly across the platform.

#### Acceptance Criteria

1. WHEN any of Insurance_Register, Dispute_Engine, NHBRC_Engine, or Survey_Engine completes a create, update, or delete operation that changes the module's current workflow status or record state, the module SHALL write a status summary to the Project Passport health card within 60 seconds, including: module identifier, current status label, count of active records, count of overdue or flagged items, and a timestamp of last update.
2. WHEN any P1 module generates a deadline, warning, required action, or approval request, the module SHALL create a corresponding entry in the Action Centre / Inbox with: source module identifier, action type, subject line (maximum 200 characters), deadline date (if applicable), priority level (normal, high, or critical), and target user or role.
3. WHEN any of Insurance_Register, Dispute_Engine, NHBRC_Engine, or Survey_Engine performs a create, update, delete, status transition, or approval operation on a domain record, the module SHALL write an immutable audit trail record including: module identifier, action description, affected record reference, actor identity, timestamp, and previous and new field values for every field modified by the operation.
4. WHEN a P1 module identifies a risk condition (lapsed insurance, time-barred claim, failed inspection, missing beacon), the module SHALL create a risk event in the Risk Engine with: risk category, severity level (low, medium, high, or critical), description (maximum 500 characters), affected record reference, and recommended mitigation action.
5. WHERE a P1 module generates data relevant to project specifications (insurance requirements for spec items, survey results affecting design parameters), the module SHALL expose that data to SpecForge by writing a specification change record containing: source module identifier, affected specification item reference, change type (add, amend, or remove), proposed value, and justification text (maximum 1000 characters).
6. IF a P1 module fails to write to a target platform module (Project Passport, Action Centre, Audit Trail, Risk Engine, or Documents), THEN the module SHALL queue the operation locally, retry up to 3 times with exponential backoff over a maximum of 60 seconds, and if still unsuccessful, create a failed-sync alert in the Action Centre identifying the target module, the originating event, and the timestamp of failure.
7. THE Insurance_Register, Dispute_Engine, NHBRC_Engine, and Survey_Engine SHALL each register uploaded documents in the Documents module with metadata including: document type, source module, linked record reference, upload date, and responsible party, rather than maintaining separate document storage.
8. IF a P1 module's write to the Project Passport health card exceeds the 60-second threshold defined in criterion 1 due to queuing or retry delays, THEN the module SHALL mark the health card entry as stale until a successful write completes, and the entry SHALL display the timestamp of the last successful update.
