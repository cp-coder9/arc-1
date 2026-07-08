# Requirements Document

## Introduction

The Municipal Approval Readiness Workspace transforms Architex's existing scattered municipal submission readiness capabilities into a unified workspace within Module 4 (Compliance & Municipal Readiness). The workspace surfaces existing readiness infrastructure as a cohesive workflow, adds a Land Use Scheme pre-check engine, introduces Departmental Circulation Simulation, builds a Submission Pack Builder, generates Municipal-Ready Certificates, and implements Outcome Tracking — positioning Architex as the de facto pre-approval quality gate for South African municipal building plan approvals.

The workspace operates in "advisory only" mode throughout — it assesses readiness and confidence, never claims to certify compliance. All regulatory checks include professional sign-off gates.

## Glossary

- **Workspace**: The unified page/route within Module 4 that contains all municipal approval readiness sub-views accessible via tabs
- **Readiness_Pipeline**: The existing 10-step municipal submission readiness orchestration (classify → route → checks → score → evidence pack → inbox → audit)
- **Land_Use_Scheme_Engine**: A structured rule engine that validates project parameters (coverage, FAR, height, building lines, parking) against municipality-specific zoning data
- **Circulation_Simulator**: A departmental pre-check engine that simulates how each municipal department (Town Planning, Building Control, Fire, Water & Sanitation, Roads, Electrical, Environmental, Heritage) would assess a submission, producing per-department confidence scores
- **Submission_Pack_Builder**: An assembly engine that compiles all required forms, drawings, and supporting documents into a correctly-ordered submission bundle
- **Municipal_Ready_Certificate**: A quality assurance document generated when all algorithmic checks pass and all professionals have signed off, stating advisory readiness for submission
- **Outcome_Tracker**: A module that records actual municipal submission outcomes (approved, returned, refused) and categorises return reasons to build a learning flywheel
- **Project_Passport**: The central project truth record that all tools write back into
- **SpecForge**: The specification spine that links specification items to compliance checks
- **Action_Centre**: The unified inbox where required actions, approvals, and overdue items surface for users
- **Zone_Definition**: A structured record of a municipality's land use scheme parameters for a specific zone (coverage, FAR, height, building lines, parking ratios, permitted uses)
- **Confidence_Score**: A percentage (0–100) indicating the likelihood of passing a specific departmental check, based on data completeness and rule evaluation
- **Professional_Sign_Off**: A recorded declaration by a registered professional (SACAP/ECSA) confirming their scope of work is complete and compliant
- **MunicipalityType**: The existing platform enum identifying supported municipalities: COJ, COCT, ETH, NMB, Tshwane, Ekurhuleni, Mangaung, Other

## Requirements

### Requirement 1: Unified Workspace Route and Navigation

**User Story:** As an architect or town planner, I want a single dedicated workspace for municipal approval readiness, so that I can access all submission readiness tools from one location without navigating between scattered pages.

#### Acceptance Criteria

1. THE Workspace SHALL render as a dedicated route within Module 4 (Compliance & Municipal Readiness) accessible from the primary navigation
2. THE Workspace SHALL display a tab-based interface with sub-views for: Overview, Land Use Check, Departmental Simulation, Submission Pack, Certificate, and Outcome Tracking
3. THE Workspace SHALL accept a project context parameter and display project-specific readiness data
4. WHEN no project is selected, THE Workspace SHALL prompt the user to select or create a project before proceeding
5. THE Workspace SHALL be accessible to users with roles: architect, engineer, town_planner, energy_professional, fire_engineer, quantity_surveyor, and platform_admin

### Requirement 2: Readiness Overview Dashboard

**User Story:** As a lead professional, I want to see a consolidated overview of my project's municipal readiness status, so that I can immediately identify what needs attention before submission.

#### Acceptance Criteria

1. THE Workspace SHALL display an overall readiness score (0–100) computed from the existing Readiness_Pipeline output
2. THE Workspace SHALL display per-category scores for all eight ReadinessCategory values (property_and_municipal_facts, land_use_and_zoning, professional_team, nbr_sans_advisory_precheck, drawing_register, supporting_documents, professional_signoffs, client_authority)
3. THE Workspace SHALL display a blockers list showing all items with status "missing" or "requires_professional_review"
4. THE Workspace SHALL display the project complexity classification with its trigger reasons
5. THE Workspace SHALL display the professional team routing decisions with required and optional disciplines
6. WHEN the readiness score changes, THE Workspace SHALL write the updated score to Project_Passport
7. THE Workspace SHALL surface blocker items as action_required events in the Action_Centre for the responsible discipline owner

### Requirement 3: Land Use Scheme Pre-Check Engine

**User Story:** As a town planner, I want to validate my project's development parameters against the applicable land use scheme, so that I can identify zoning non-compliance before municipal submission.

#### Acceptance Criteria

1. THE Land_Use_Scheme_Engine SHALL store structured Zone_Definition records per municipality containing: maximum coverage percentage, maximum FAR, maximum height (metres), building lines (front, rear, sides, street side), maximum density (units per hectare), and parking ratios per land use type
2. THE Land_Use_Scheme_Engine SHALL support zone data for the eight metro municipalities: COJ, COCT, ETH, NMB, Tshwane, Ekurhuleni, Mangaung, and Buffalo City
3. WHEN a user provides project parameters (proposed coverage, proposed FAR, proposed height, proposed setbacks, proposed parking count, land use type, and zone code), THE Land_Use_Scheme_Engine SHALL compare each parameter against the Zone_Definition limits and return a pass/fail result per parameter
4. WHEN a parameter exceeds the zone limit, THE Land_Use_Scheme_Engine SHALL report the parameter name, the proposed value, the permitted maximum, and the excess amount
5. IF the zone code is not found in the Land_Use_Scheme_Engine database, THEN THE Land_Use_Scheme_Engine SHALL return a "zone_not_found" status with a suggestion to manually verify against the published scheme document
6. THE Land_Use_Scheme_Engine SHALL support consent use identification by listing uses that require special consent for the specified zone
7. THE Land_Use_Scheme_Engine SHALL display all land use check results within the "Land Use Check" tab of the Workspace

### Requirement 4: Departmental Circulation Simulation

**User Story:** As an architect, I want to simulate how each municipal department would assess my application, so that I can identify and resolve department-specific issues before submission.

#### Acceptance Criteria

1. THE Circulation_Simulator SHALL evaluate the project against eight departmental rule sets: Town Planning, Building Control, Fire Department, Water and Sanitation, Roads and Transport, Electrical, Environmental, and Heritage
2. THE Circulation_Simulator SHALL produce a Confidence_Score (0–100) per department based on the proportion of department-specific checks that pass and the completeness of input data
3. WHEN input data for a department check is missing, THE Circulation_Simulator SHALL report the data gap and reduce the Confidence_Score proportionally rather than failing the check
4. THE Circulation_Simulator SHALL list specific action items per department indicating what the professional must do to increase the Confidence_Score
5. THE Circulation_Simulator SHALL integrate with existing SANS compliance calculators (fenestration, R-value, fire, walls, energy, stormwater) to populate Building Control and Fire department scores
6. THE Circulation_Simulator SHALL integrate with the Land_Use_Scheme_Engine results to populate the Town Planning department score
7. THE Circulation_Simulator SHALL display results in the "Departmental Simulation" tab as a horizontal bar chart showing each department's Confidence_Score with pass/attention/fail colour coding
8. THE Circulation_Simulator SHALL include advisory language stating that results are indicative assessments and do not replace official municipal circulation

### Requirement 5: Submission Pack Builder

**User Story:** As an architect, I want the system to assemble my complete submission pack in the correct order with all required forms and documents, so that I can submit a complete application without missing items.

#### Acceptance Criteria

1. THE Submission_Pack_Builder SHALL determine the required document list based on the selected municipality and submission type (building plan, occupancy certificate, or rezoning)
2. THE Submission_Pack_Builder SHALL include NBR Forms 1–4 with fields pre-populated from project data (professional details, project description, erf data, SACAP/ECSA registration numbers)
3. THE Submission_Pack_Builder SHALL include all drawings from the project drawing register that have status "signed_off"
4. THE Submission_Pack_Builder SHALL include all supporting documents with status "available" from the project scope facts
5. THE Submission_Pack_Builder SHALL order documents according to the target municipality's required submission sequence
6. WHEN a required document is missing or has status "draft", THE Submission_Pack_Builder SHALL flag the document as a blocker and list it in the pack's incomplete items section
7. THE Submission_Pack_Builder SHALL generate a cover sheet and table of contents for the assembled pack
8. THE Submission_Pack_Builder SHALL provide an export function that produces the complete pack as a downloadable PDF bundle
9. THE Submission_Pack_Builder SHALL perform cross-reference validation: verifying that professional names on Form 1 match appointment records, that drawing numbers on the index match actual uploaded drawings, and that erf numbers are consistent across all documents

### Requirement 6: Professional Sign-Off Collection

**User Story:** As a lead professional, I want to collect digital sign-offs from all required professionals before generating the Municipal-Ready Certificate, so that I have a complete record of professional accountability.

#### Acceptance Criteria

1. THE Workspace SHALL determine required Professional_Sign_Offs based on the professional team routing decisions (all disciplines with status "required")
2. WHEN a professional signs off, THE Workspace SHALL record the professional's name, registration number (SACAP or ECSA), discipline, sign-off timestamp, and a declaration statement
3. THE Workspace SHALL verify that the signing professional's registration number matches a verified record in the existing professional verification service before accepting the sign-off
4. IF a required professional has not signed off, THEN THE Workspace SHALL send an action_required event to that professional's Action_Centre inbox
5. THE Workspace SHALL display a sign-off status panel showing each required professional's sign-off state (pending, signed, or overdue)
6. THE Workspace SHALL include professional sign-off status as a prerequisite gate for Municipal_Ready_Certificate generation

### Requirement 7: Municipal-Ready Certificate Generation

**User Story:** As an architect, I want a formal quality assurance certificate confirming that all algorithmic checks have passed and all professionals have signed off, so that I have documented evidence of submission readiness.

#### Acceptance Criteria

1. WHEN all of the following conditions are met — readiness score equals 100, all required Professional_Sign_Offs are collected, the Submission_Pack_Builder reports zero blockers, and the Circulation_Simulator shows all departments at Confidence_Score 70 or above — THE Workspace SHALL enable Municipal_Ready_Certificate generation
2. THE Municipal_Ready_Certificate SHALL contain: project identification (name, erf number, municipality), date of issue, overall readiness score, per-department Confidence_Scores, a list of all professional sign-offs with registration numbers, and a completeness statement
3. THE Municipal_Ready_Certificate SHALL include advisory language stating: "This certificate confirms algorithmic assessment of submission readiness. It does not constitute professional certification of compliance and does not replace official municipal plan examination."
4. THE Municipal_Ready_Certificate SHALL be generated as a PDF document with a unique certificate number
5. THE Municipal_Ready_Certificate SHALL write a record to Project_Passport including the certificate number, generation timestamp, and overall scores
6. IF any prerequisite condition is not met, THEN THE Workspace SHALL display the specific unmet conditions preventing certificate generation

### Requirement 8: Outcome Tracking and Learning

**User Story:** As a platform operator, I want to track what happens after submissions are made to municipalities, so that the platform can learn from outcomes and improve future confidence scoring accuracy.

#### Acceptance Criteria

1. THE Outcome_Tracker SHALL allow the user to record a submission event including: submission date, municipality, submission type, reference number, and the readiness score at time of submission
2. THE Outcome_Tracker SHALL allow the user to update the submission outcome with one of: approved_first_time, approved_with_conditions, returned_for_amendments, or refused
3. WHEN the outcome is returned_for_amendments or refused, THE Outcome_Tracker SHALL allow the user to record return reasons categorised by the department that raised the query
4. THE Outcome_Tracker SHALL calculate and display the user's first-time approval rate as a percentage across all tracked submissions
5. THE Outcome_Tracker SHALL display a timeline view of all tracked submissions with their current status
6. THE Outcome_Tracker SHALL write outcome records to Project_Passport so that submission history is part of the permanent project record

### Requirement 9: Integration with Existing Platform Spine

**User Story:** As a platform user, I want the Municipal Approval Readiness Workspace to integrate with Project Passport, SpecForge, Action Centre, and Drawing Intelligence, so that data flows consistently across the platform without duplication.

#### Acceptance Criteria

1. THE Workspace SHALL read project scope facts, drawing register, and supporting documents from Project_Passport rather than requiring re-entry
2. THE Workspace SHALL write readiness assessment results, certificate records, and outcome tracking data back to Project_Passport
3. THE Workspace SHALL surface all blocker items and required actions as events in the Action_Centre with correct severity levels (info, action_required, blocked)
4. THE Workspace SHALL link compliance check results to related SpecForge specification items where a linkage exists
5. THE Workspace SHALL consume Drawing Intelligence analysis results (drawing classification, title block extraction, completeness assessment) when populating the drawing register readiness checks
6. THE Workspace SHALL produce audit trail records for all significant actions (certificate generation, professional sign-offs, outcome recording, readiness assessment runs)

### Requirement 10: Role-Based Access and Advisory Language

**User Story:** As a platform administrator, I want the workspace to enforce role-based access and maintain advisory-only positioning throughout, so that the platform does not expose itself to liability and only authorised professionals access sensitive readiness data.

#### Acceptance Criteria

1. THE Workspace SHALL restrict access to the following roles: architect, engineer, town_planner, energy_professional, fire_engineer, quantity_surveyor, platform_admin
2. THE Workspace SHALL restrict certificate generation actions to users with roles: architect, engineer, or town_planner
3. THE Workspace SHALL display a persistent advisory notice on all views stating that all assessments are indicative and advisory only
4. THE Workspace SHALL not use the words "certify", "approve", or "guarantee" in any user-facing text except within the explicit disclaimer explaining what the certificate does not do
5. THE Workspace SHALL include a "professional review required" indicator on all SANS/regulatory check outputs that require professional engineering judgment beyond rule-based evaluation
