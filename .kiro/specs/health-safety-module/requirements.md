# Requirements Document

## Introduction

WS-1: H&S Module Elevation transforms the existing generic H&S checklist in Architex into a full Construction Regulations 2014 workflow module. The module provides structured document management, approval workflows, permit systems, incident reporting, and induction tracking — all grounded in the Occupational Health and Safety Act 85 of 1993 and Construction Regulations 2014. The module integrates deeply with Project Passport, Site Execution (Pack 9), Procurement, and the Action Centre to deliver a role-differentiated H&S experience for Client, Designer, Principal Contractor, and H&S Officer roles.

All regulatory guidance content uses "advisory only" language — the module produces readiness assessments and gap reports, never certification.

## Glossary

- **Safety_File_Builder**: The service responsible for composing, versioning, and managing the Construction Safety File as defined by Regulation 7 of the Construction Regulations 2014.
- **H_S_Plan_Workflow**: The approval workflow engine that ensures a project-specific Health and Safety Plan is submitted, reviewed, and approved BEFORE construction work commences (Regulation 7(1)(a)).
- **Client_Specification_Engine**: The service that guides Clients through creation of a project Health and Safety Specification per Regulation 5(1).
- **Designer_Risk_Capture**: The service enabling Designers to record design-related hazard information and risk assessments per Regulation 6(1).
- **HIRA_Engine**: The Hazard Identification and Risk Assessment engine that manages hazard registers, risk ratings, and control measures per the OHS Act.
- **Induction_Tracker**: The service recording toolbox talks, safety inductions, and attendance for daily site safety requirements.
- **Incident_Reporter**: The service managing incident and accident capture, classification, investigation workflow, and statutory reporting per OHS Act Section 24.
- **Fall_Protection_Service**: The service managing Fall Protection Plans for work above 2 metres per Regulation 10 of the Construction Regulations 2014.
- **Permit_System**: The service managing Permit-to-Work issuance, approval, and closure for excavation (Reg 13), scaffolding (Reg 14), hot work, and confined space activities.
- **H_S_Dashboard**: The role-aware dashboard providing the H&S Officer, Principal Contractor, Client, and Designer with their respective views into project health and safety status.
- **H_S_Officer**: A platform-level user role (promoted from site-execution-local) responsible for safety file maintenance, induction delivery, incident investigation, and permit management.
- **Principal_Contractor**: The contractor role responsible for the overall Safety File and H&S Plan on site.
- **Project_Passport**: The central project truth record in Architex that receives compliance scores, safety status, and outstanding H&S actions.
- **Action_Centre**: The platform inbox that surfaces approvals, overdue permits, expiring plans, and required safety actions to responsible parties.
- **Compliance_Score**: A calculated percentage reflecting overall H&S regulatory adherence for a project, written back to Project Passport.

## Requirements

### Requirement 1: Safety File Builder

**User Story:** As a Principal Contractor, I want to compose and manage the Construction Safety File digitally, so that I can maintain a complete, auditable record per Regulation 7.

#### Acceptance Criteria

1. THE Safety_File_Builder SHALL provide a structured template containing all Regulation 7 mandatory sections (H&S Plan, risk assessments, fall protection plan, permits, incident records, induction records, emergency procedures, appointments).
2. WHEN a Principal Contractor adds or updates a section of the Safety File, THE Safety_File_Builder SHALL version the change and record an audit trail entry.
3. WHEN a mandatory section of the Safety File is missing or expired, THE Safety_File_Builder SHALL flag the section as non-compliant and surface an action to the Action_Centre.
4. WHEN a project is created, THE Safety_File_Builder SHALL initialise an empty Safety File structure linked to the project.
5. THE Safety_File_Builder SHALL calculate a Compliance_Score based on the ratio of complete and current mandatory sections to total required sections.
6. WHEN the Compliance_Score changes, THE Safety_File_Builder SHALL write the updated score to Project_Passport.

### Requirement 2: H&S Plan Approval Workflow

**User Story:** As a Client, I want to review and approve the Principal Contractor's H&S Plan before construction starts, so that I fulfil my duty under Regulation 7(1)(a).

#### Acceptance Criteria

1. WHEN a Principal Contractor submits an H&S Plan for approval, THE H_S_Plan_Workflow SHALL route it to the Client for review.
2. WHILE an H&S Plan is in "pending approval" state, THE H_S_Plan_Workflow SHALL block any site diary entries from being created for that project.
3. WHEN a Client approves the H&S Plan, THE H_S_Plan_Workflow SHALL record the approval with timestamp, approver identity, and plan version, then unblock site operations.
4. WHEN a Client rejects the H&S Plan, THE H_S_Plan_Workflow SHALL return it to the Principal Contractor with rejection reasons and require resubmission.
5. IF an H&S Plan submission remains pending for more than 5 business days, THEN THE H_S_Plan_Workflow SHALL escalate by surfacing a high-priority action in the Action_Centre for both Client and Principal Contractor.

### Requirement 3: Client H&S Specification

**User Story:** As a Client, I want a guided workflow to produce my project H&S Specification, so that I meet Regulation 5(1) requirements before appointing contractors.

#### Acceptance Criteria

1. THE Client_Specification_Engine SHALL provide a step-by-step wizard containing all Regulation 5(1) required content areas (project description, scope of work, known hazards, minimum H&S requirements for contractors, arrangements for monitoring compliance).
2. WHEN a Client completes the H&S Specification wizard, THE Client_Specification_Engine SHALL generate a formatted specification document linked to the project.
3. WHEN a Client completes the H&S Specification, THE Client_Specification_Engine SHALL write a "specification_complete" record to Project_Passport.
4. WHILE no H&S Specification exists for a project, THE Client_Specification_Engine SHALL display advisory guidance indicating this is a Regulation 5(1) requirement prior to contractor appointment.

### Requirement 4: Designer Risk Assessment Capture

**User Story:** As a Designer, I want to record hazard information arising from my design decisions, so that I fulfil my Regulation 6(1) obligation to inform the Client of design risks.

#### Acceptance Criteria

1. WHEN a Designer identifies a design-related hazard, THE Designer_Risk_Capture SHALL allow capture of the hazard description, associated design element, risk level, and recommended control measures.
2. WHEN a Designer saves a risk assessment, THE Designer_Risk_Capture SHALL store it against both the project and the specific design discipline.
3. WHEN one or more designer risk assessments exist for a project, THE Designer_Risk_Capture SHALL make them available as input to the Client_Specification_Engine and the Safety_File_Builder.
4. THE Designer_Risk_Capture SHALL generate a summary report of all design-related risks for inclusion in the Safety File.

### Requirement 5: Hazard Identification and Risk Assessment (HIRA)

**User Story:** As an H&S Officer, I want to maintain a live hazard register with risk ratings, so that all site hazards are systematically identified, assessed, and controlled per the OHS Act.

#### Acceptance Criteria

1. WHEN an H&S Officer creates a hazard entry, THE HIRA_Engine SHALL capture hazard description, activity, location, risk rating (likelihood × severity), existing controls, and residual risk.
2. THE HIRA_Engine SHALL calculate risk ratings using a standard 5×5 likelihood-severity matrix.
3. WHEN a hazard is rated as "high" or "critical" residual risk, THE HIRA_Engine SHALL surface an action in the Action_Centre requiring additional control measures.
4. WHEN control measures are updated for a hazard, THE HIRA_Engine SHALL recalculate the residual risk rating and update the hazard register entry.
5. THE HIRA_Engine SHALL provide the hazard register data to the Safety_File_Builder for inclusion in the Safety File.

### Requirement 6: Toolbox Talk and Safety Induction Tracker

**User Story:** As an H&S Officer, I want to record toolbox talks and safety inductions with attendance, so that I can demonstrate daily compliance with site safety induction requirements.

#### Acceptance Criteria

1. WHEN an H&S Officer records a toolbox talk, THE Induction_Tracker SHALL capture the date, topic, presenter, duration, and attendee list.
2. WHEN an H&S Officer records a safety induction, THE Induction_Tracker SHALL capture the inductee identity, induction type (site, task-specific, visitor), date, and acknowledgement status.
3. WHILE a worker has not completed a site induction for the current project, THE Induction_Tracker SHALL flag that worker as "not inducted" and surface a warning when they appear in daily workforce logs.
4. THE Induction_Tracker SHALL provide induction and toolbox talk records to the Safety_File_Builder for inclusion in the Safety File.

### Requirement 7: Incident and Accident Reporting

**User Story:** As an H&S Officer, I want to capture, classify, and investigate incidents, so that I can report notifiable incidents to the Department of Employment and Labour per OHS Act Section 24.

#### Acceptance Criteria

1. WHEN an incident occurs, THE Incident_Reporter SHALL capture date, time, location, persons involved, injury classification (first aid, medical treatment, lost time, fatality), description, and immediate actions taken.
2. WHEN an incident is classified as a Section 24 notifiable incident (fatality, serious injury requiring hospitalisation, or dangerous occurrence), THE Incident_Reporter SHALL flag it for statutory reporting and surface a critical action in the Action_Centre.
3. WHEN an investigation is assigned to an incident, THE Incident_Reporter SHALL track investigation status, root cause findings, corrective actions, and close-out.
4. WHEN a corrective action arising from an incident is overdue, THE Incident_Reporter SHALL escalate by surfacing a high-priority action in the Action_Centre.
5. THE Incident_Reporter SHALL provide incident records to the Safety_File_Builder for inclusion in the Safety File.

### Requirement 8: Fall Protection Plan

**User Story:** As an H&S Officer, I want to create and manage Fall Protection Plans for work above 2 metres, so that the project complies with Regulation 10.

#### Acceptance Criteria

1. WHEN work above 2 metres is identified for a project, THE Fall_Protection_Service SHALL require a Fall Protection Plan before a permit for that activity is issued.
2. THE Fall_Protection_Service SHALL capture fall protection method (guardrails, safety nets, harnesses, exclusion zones), applicable work areas, responsible persons, and inspection schedules.
3. WHEN a Fall Protection Plan is approved, THE Fall_Protection_Service SHALL link it to the relevant Permit_System permits and the Safety File.
4. WHEN a Fall Protection Plan expires or its inspection schedule is overdue, THE Fall_Protection_Service SHALL surface an action in the Action_Centre.

### Requirement 9: Permit-to-Work System

**User Story:** As a site manager, I want to issue, approve, and close permits for high-risk activities, so that excavation (Reg 13), scaffolding (Reg 14), hot work, and confined space work are properly authorised.

#### Acceptance Criteria

1. WHEN a permit is requested, THE Permit_System SHALL capture permit type (excavation, scaffolding, hot work, confined space), location, planned start and end times, hazards identified, precautions, and responsible persons.
2. WHEN a permit is submitted, THE Permit_System SHALL route it to the designated approver (H&S Officer or Principal Contractor) for authorisation.
3. WHILE a permit is in "active" state, THE Permit_System SHALL enforce that it has not exceeded its valid time window.
4. WHEN a permit's valid time window expires, THE Permit_System SHALL automatically transition it to "expired" state and surface an action requiring formal close-out or renewal.
5. WHEN a permit is closed out, THE Permit_System SHALL record close-out time, conditions met, and the identity of the person performing close-out.
6. THE Permit_System SHALL provide all permit records to the Safety_File_Builder for inclusion in the Safety File.

### Requirement 10: H&S Role Promotion and Dashboard

**User Story:** As an H&S Officer, I want a dedicated platform-level dashboard showing my projects' safety status, so that I can manage all H&S responsibilities from one view.

#### Acceptance Criteria

1. THE H_S_Dashboard SHALL be accessible to users with the platform-level "health_safety" role.
2. THE H_S_Dashboard SHALL display: Safety File completion percentage, pending H&S Plan approvals, overdue permits, upcoming inductions, open incident investigations, and high/critical HIRA items — aggregated across the user's assigned projects.
3. WHEN any H&S metric changes for an assigned project, THE H_S_Dashboard SHALL reflect the update without requiring a page reload.
4. THE H_S_Dashboard SHALL provide role-differentiated views: H&S Officer sees operational detail, Principal Contractor sees file compliance and approvals, Client sees plan approval status and overall scores, Designer sees risk assessment submissions.

### Requirement 11: Platform Integration

**User Story:** As a platform user, I want H&S data to integrate with Project Passport, Action Centre, Site Execution, and Procurement, so that safety information flows into the project's single source of truth.

#### Acceptance Criteria

1. WHEN any H&S compliance event occurs (plan approved, permit issued, incident logged, score changed), THE Safety_File_Builder SHALL write a corresponding record to Project_Passport.
2. WHEN an H&S action requires attention (approval needed, permit expiring, overdue item), THE Action_Centre SHALL receive an inbox event with priority, due date, responsible role, and deep-link to the relevant H&S context.
3. WHILE a daily site log is being created in Site Execution (Pack 9), THE H_S_Dashboard SHALL surface active permits, uninducted workers, and any open high-risk HIRA items as contextual safety information.
4. WHEN a contractor is being evaluated during procurement, THE Safety_File_Builder SHALL expose the contractor's H&S File submission status and compliance history.
5. THE Safety_File_Builder SHALL include advisory-only disclaimers on all generated reports and compliance scores, stating the module does not constitute professional certification.
