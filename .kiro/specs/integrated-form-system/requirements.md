# Requirements Document

## Introduction

The Integrated Form System is a deeply embedded module within the Architex OS platform that automates the creation, population, and management of construction industry documents for the South African built environment. The system combines intelligent auto-fill capabilities (pulling data from Project Passport, user profiles, client records, and other platform modules) with manual form entry, producing properly formatted PDF outputs for municipal council submissions, professional registration forms, contracts, and other construction administration documents. It integrates with the 8-stage project lifecycle and respects the platform's 17-role access model.

## Glossary

- **Form_System**: The Integrated Form System module within Architex OS responsible for template management, data population, and document generation
- **Form_Template**: A pre-built document structure defining fields, layout, validation rules, and data source mappings for a specific form type
- **Form_Instance**: A concrete document created from a Form_Template, populated with project-specific data, and associated with a single project
- **Auto_Fill_Engine**: The subsystem that resolves field values by querying Project Passport, user profiles, client records, and other platform data sources
- **Field_Mapping**: A configuration that defines which platform data source provides the value for a specific form field
- **Form_Template_Library**: The registry of all available Form_Templates organized by category, municipality, and lifecycle stage
- **Project_Passport**: The central project state record containing project facts, stage, team composition, compliance status, and decisions
- **Document_Register**: The platform's document control system that tracks all project documents with revision history
- **Municipal_Readiness**: The platform workspace responsible for municipal submission tracking, readiness assessments, and approval workflows
- **SACAP**: South African Council for the Architectural Profession — the statutory body regulating architects
- **Municipality_Profile**: A configuration set defining form variants, submission requirements, and field mappings specific to a local authority
- **Form_Draft**: A saved but incomplete Form_Instance that can be resumed by the original author or collaborators
- **Digital_Signature**: A cryptographic signature applied to a completed form to authenticate the signatory
- **Audit_Trail**: The immutable log of all actions performed on a Form_Instance (creation, edits, approvals, exports)

## Requirements

### Requirement 1: Form Template Library Management

**User Story:** As an architect, I want access to a library of pre-built form templates for South African construction documents, so that I can quickly find and use the correct form for my project needs.

#### Acceptance Criteria

1. THE Form_Template_Library SHALL provide categorized templates for municipal council submission forms, SACAP forms, contracts, appointment letters, power of attorney documents, company resolutions, site instructions, variation orders, payment certificates, and compliance declarations
2. WHEN a user searches the Form_Template_Library, THE Form_System SHALL return matching templates filtered by category, municipality, project lifecycle stage, and form type within 2 seconds, displaying results in pages of no more than 20 templates per page
3. IF a search or filter operation returns zero matching templates, THEN THE Form_System SHALL display a message indicating no templates match the current filters and suggest broadening the filter criteria
4. THE Form_Template_Library SHALL include municipality-specific form variants for City of Johannesburg, City of Cape Town, eThekwini Metropolitan Municipality, City of Tshwane, and additional municipalities as configured
5. WHEN a municipality is associated with a project, THE Form_System SHALL display form templates applicable to that municipality before generic templates in search results and template listings
6. THE Form_Template_Library SHALL support the addition of custom form templates by platform administrators, requiring each custom template to include a category, applicable municipality or municipalities, applicable lifecycle stage, and form type before it is published to the library
7. WHEN an official form template is updated to a new version, THE Form_System SHALL make the new version the default for new Form_Instances while retaining previous versions accessible for reference on existing Form_Instances that used them

### Requirement 2: Intelligent Auto-Fill from Platform Data

**User Story:** As an architect, I want forms to automatically populate with client details, project information, and my professional registration data already stored in Architex, so that I avoid repetitive data entry and reduce errors.

#### Acceptance Criteria

1. WHEN a Form_Instance is created from a Form_Template, THE Auto_Fill_Engine SHALL resolve field values from Project_Passport data including project address, erf number, township, municipality, project type, date, classification, complexity, and sensitivity assessments
2. WHEN a Form_Instance is created, THE Auto_Fill_Engine SHALL resolve professional fields from the user profile including architect name, SACAP registration number, practice name, identity number, contact details, and practice address
3. WHEN a Form_Instance is created, THE Auto_Fill_Engine SHALL resolve client fields from the project client record including owner name, identity number, relationship to property, physical address, postal address, and company or trust registration details
4. IF the Auto_Fill_Engine cannot resolve a field value from platform data, THEN THE Form_System SHALL leave the field empty and display a visual indicator on the field distinguishing it from intentionally blank fields, indicating that manual entry is required
5. IF a form contains a company resolution section and the registered owner is a juristic person, THEN THE Auto_Fill_Engine SHALL populate the company name, registration number, authorized representative, and resolution date from the client record
6. THE Auto_Fill_Engine SHALL resolve data from the active project context without requiring the user to re-select or re-enter the project, and SHALL complete all auto-fill field resolution within 3 seconds of Form_Instance creation
7. IF the project has multiple client records associated with it, THEN THE Form_System SHALL present the user with a client selector before auto-fill resolution and use the selected client record as the source for client fields

### Requirement 3: Manual Form Entry and Override

**User Story:** As a user, I want to manually enter or override any form field value, so that I can provide data not yet stored in the system or correct auto-filled values that need adjustment.

#### Acceptance Criteria

1. THE Form_System SHALL allow manual entry for every field on a Form_Instance regardless of whether the field was auto-filled
2. WHEN a user modifies an auto-filled field value, THE Form_System SHALL retain the manual override, mark the field as user-modified, and display a visual indicator distinguishing user-modified fields from auto-filled fields
3. WHEN a user invokes the clear action on a manually overridden field, THE Form_System SHALL revert the field to the auto-filled value if one exists, or set the field to empty if no auto-fill source is available, and remove the user-modified indicator
4. THE Form_System SHALL support creation of ad-hoc form instances without a project context for standalone form filling
5. WHEN a form is filled without project context, THE Form_System SHALL allow all fields to be entered manually

### Requirement 4: Multi-Project Form Support

**User Story:** As an architect managing multiple projects, I want to select which project context to use when filling a form, so that the correct data is populated for each project.

#### Acceptance Criteria

1. WHEN a user initiates form creation, THE Form_System SHALL present a project selector showing all projects the user is a team member of, with a search field to filter by project name or address when the list exceeds 10 projects
2. WHEN a user selects a project, THE Auto_Fill_Engine SHALL use that project's data as the source for all auto-fill field resolution
3. WHEN a user switches project context on a Form_Draft, THE Form_System SHALL re-resolve all auto-filled fields using the new project data, preserve all fields marked as user-modified, and display a summary indicating how many fields were updated with new project data
4. IF a user initiates form creation and has no projects assigned, THEN THE Form_System SHALL disable the project selector, display a message indicating no projects are available, and allow the user to proceed with manual-only form filling as defined in Requirement 3 criterion 4

### Requirement 5: PDF Export with Proper Formatting

**User Story:** As an architect, I want to export completed forms as properly formatted PDF documents, so that I can submit them to municipal councils and other authorities.

#### Acceptance Criteria

1. WHEN a user requests PDF export, THE Form_System SHALL generate a PDF document that reproduces the page dimensions, field positions, fonts, logos, and layout structure defined in the source Form_Template within 15 seconds for a single Form_Instance
2. THE Form_System SHALL include all populated field values, Digital_Signatures, and attachments in the exported PDF
3. WHEN a form contains empty required fields at export time, THE Form_System SHALL display a list identifying each incomplete field by label and section, and allow the user to either proceed with export or cancel to complete the fields
4. THE Form_System SHALL support batch export of up to 50 Form_Instances per request, allowing the user to choose between individual PDFs or a single combined document
5. IF PDF generation fails due to a system error, THEN THE Form_System SHALL display an error message indicating the failure reason, preserve the Form_Instance unchanged, and allow the user to retry the export

### Requirement 6: Form Versioning and Audit Trail

**User Story:** As an architect, I want a complete history of changes to my forms, so that I can track who modified what and when for accountability and dispute resolution.

#### Acceptance Criteria

1. WHEN a Form_Instance is created, THE Form_System SHALL record the creation event including timestamp, creator identity, source template, and project association in the Audit_Trail
2. WHEN any field value on a Form_Instance is modified, THE Form_System SHALL record the change event including timestamp, user identity, field name, previous value, and new value in the Audit_Trail
3. WHEN a Form_Instance is exported as PDF, THE Form_System SHALL record the export event including timestamp, exporter identity, and export format in the Audit_Trail
4. WHEN a change event, creation event, export event, or signature event is recorded in the Audit_Trail for a Form_Instance, THE Form_System SHALL capture a version snapshot of the complete form state, allowing retrieval of the Form_Instance as it existed at that event
5. THE Form_System SHALL enforce immutability of Audit_Trail entries such that no recorded event can be modified or deleted after creation
6. WHEN a user with edit access to a Form_Instance requests the Audit_Trail, THE Form_System SHALL display the chronological list of all recorded events including event type, timestamp, user identity, and change details within 3 seconds of the request
7. WHEN the Auto_Fill_Engine populates field values during Form_Instance creation, THE Form_System SHALL attribute those changes to the system rather than to the initiating user in the Audit_Trail

### Requirement 7: Draft Save and Resume

**User Story:** As a user, I want to save partially completed forms and resume them later, so that I can work on complex forms across multiple sessions.

#### Acceptance Criteria

1. WHEN a user modifies a Form_Instance and no further field edits occur for 30 seconds, THE Form_System SHALL auto-save the current state as a Form_Draft
2. WHEN a user navigates away from an incomplete Form_Instance by following an in-app link, closing the browser tab, or logging out, THE Form_System SHALL persist the Form_Draft before releasing the form view
3. WHEN a user returns to a previously saved Form_Draft, THE Form_System SHALL restore the form state including all field values, manual overrides, and cursor position to the last active field
4. THE Form_System SHALL display a list of the user's Form_Drafts organized by project with last-modified timestamps, limited to a maximum of 50 drafts per user with the most recently modified drafts shown first
5. IF an auto-save operation fails due to network or server unavailability, THEN THE Form_System SHALL retain the unsaved state in local memory, display a notification indicating the save failure, and retry the save operation within 60 seconds
6. WHEN a user explicitly deletes a Form_Draft from the drafts list, THE Form_System SHALL permanently remove the Form_Draft and confirm the deletion to the user
7. IF a Form_Draft has not been modified for 180 days, THEN THE Form_System SHALL flag the draft as stale in the drafts list and exclude it from the default view while retaining it accessible via a filter

### Requirement 8: Collaborative Form Filling

**User Story:** As a project team member, I want to collaborate with colleagues on form filling, so that different team members can contribute their respective sections.

#### Acceptance Criteria

1. WHEN a form owner shares a Form_Instance with a team member, THE Form_System SHALL grant the team member edit access to the shared form, and WHEN the form owner revokes sharing, THE Form_System SHALL immediately remove the collaborator's edit access
2. WHILE multiple users are editing the same Form_Instance, THE Form_System SHALL prevent conflicting edits to the same field by locking fields currently focused by another user, and SHALL automatically release a field lock after 5 minutes of inactivity by the locking user
3. WHEN a collaborator modifies a shared Form_Instance, THE Form_System SHALL attribute the change to the collaborator in the Audit_Trail
4. THE Form_System SHALL restrict form sharing to users who are members of the same project team
5. WHILE a Form_Instance has active collaborators, THE Form_System SHALL display the identity and currently locked fields of each active collaborator to all other users editing the same form

### Requirement 9: Role-Based Access Control

**User Story:** As a firm administrator, I want to control who can create, edit, approve, and export forms, so that document governance is maintained.

#### Acceptance Criteria

1. THE Form_System SHALL enforce role-based permissions where architects, engineers, quantity surveyors, town planners, energy professionals, and fire engineers can create, edit, and export Form_Instances
2. IF a user with a client role accesses the Form_System, THEN THE Form_System SHALL allow viewing and downloading of exported forms where the user is the designated client on the associated project, and SHALL prevent creation, editing, and export of Form_Instances
3. THE Form_System SHALL allow firm administrators to designate form approval workflows per Form_Template requiring at least 1 and at most 5 sequential approvers to sign off before PDF export is permitted
4. WHEN a contractor or subcontractor accesses the Form_System, THE Form_System SHALL allow creation, editing, and export only for form types classified as construction administration (site instructions, variation orders, payment certificates) and SHALL allow viewing of other exported forms associated with their projects
5. IF a user attempts an action on a Form_Instance for which their role does not have permission, THEN THE Form_System SHALL deny the action, display a notification indicating insufficient permissions, and record the denied attempt in the Audit_Trail
6. THE Form_System SHALL assign view-only access to Form_Instances associated with their projects for users with freelancer, developer, site_manager, bep, or supplier roles unless the firm administrator grants elevated permissions

### Requirement 10: Project Lifecycle Integration

**User Story:** As an architect, I want forms relevant to my current project stage surfaced automatically, so that I complete the right documents at the right time.

#### Acceptance Criteria

1. WHEN a project is in the Appoint stage, THE Form_System SHALL display appointment letter templates, contract templates, and power of attorney templates in a "Recommended for this stage" section at the top of the Form_Template_Library view
2. WHEN a project is in the Comply stage, THE Form_System SHALL display municipal council submission forms, compliance declarations, and SACAP forms in a "Recommended for this stage" section at the top of the Form_Template_Library view
3. WHEN a project is in the Build stage, THE Form_System SHALL display site instruction forms, variation orders, and payment certificate templates in a "Recommended for this stage" section at the top of the Form_Template_Library view
4. WHEN a project is in the Close-out stage, THE Form_System SHALL display completion certificates, handover documentation, and final payment certificate templates in a "Recommended for this stage" section at the top of the Form_Template_Library view
5. THE Form_System SHALL allow access to all form templates regardless of project stage, displaying stage-recommended templates with a visible "Recommended" indicator and listing remaining templates below the recommended section
6. WHEN a project transitions from one lifecycle stage to another, THE Form_System SHALL update the recommended templates within 5 seconds of the stage change being recorded in the Project_Passport

### Requirement 11: Platform Module Integration

**User Story:** As an architect, I want completed forms to be tracked in the Document Register and feed into the Compliance Hub, so that my project records stay unified without manual duplication.

#### Acceptance Criteria

1. WHEN a Form_Instance is exported as PDF, THE Form_System SHALL create a corresponding entry in the Document_Register with the form type, template version, export date, exporter identity, and project association
2. WHEN a municipal submission form is exported as PDF with all required fields populated and all required signatures applied, THE Form_System SHALL update the Municipal Readiness workspace submission tracking status for the associated project to reflect the form as ready for submission
3. WHEN a Form_Instance is exported as PDF, THE Form_System SHALL write a project record to the Project_Passport containing the form type, form title, export date, and associated project stage
4. WHEN a municipal submission form is exported as PDF, THE Form_System SHALL update the Municipal Readiness workspace submission tracking status for the associated project to reflect the form as ready for submission
5. WHEN a Form_Instance transitions to incomplete draft, awaiting approval, or ready for export status, THE Form_System SHALL create a corresponding action item in the Action Centre inbox for the form owner within 60 seconds of the status change
6. IF the Document_Register, Municipal Readiness workspace, or Project_Passport is unavailable when an integration write is triggered, THEN THE Form_System SHALL queue the write operation, notify the user that the integration update is pending, and retry the operation within 5 minutes

### Requirement 12: Digital Signature Integration

**User Story:** As an architect, I want to digitally sign completed forms, so that my submissions carry authenticated professional endorsement.

#### Acceptance Criteria

1. WHEN a form requires a professional signature, THE Form_System SHALL present a signature capture interface to the authorized signatory
2. THE Form_System SHALL validate that the user applying a Digital_Signature has the professional registration credentials required for the form type, and IF validation fails, THEN THE Form_System SHALL reject the signature attempt and display the specific credential requirement that is not met
3. WHEN a Digital_Signature is applied, THE Form_System SHALL embed the signature in the Form_Instance and record the signing event in the Audit_Trail
4. IF a form requires multiple signatures from different parties, THEN THE Form_System SHALL track signature status per signatory, display outstanding signature requirements with the signatory name and role, and notify each outstanding signatory via the Action Centre inbox
5. THE Form_System SHALL only allow Digital_Signature application on Form_Instances where all required fields are populated and pass validation
6. WHEN a Digital_Signature is applied to a Form_Instance, THE Form_System SHALL lock all signed fields from further modification unless the signature is explicitly revoked by the signatory

### Requirement 13: Power of Attorney and Application Type Forms

**User Story:** As a town planner, I want to generate power of attorney documents covering multiple application types, so that I can submit rezoning, departure, subdivision, and consolidation applications on behalf of property owners.

#### Acceptance Criteria

1. WHEN a power of attorney form is created, THE Form_System SHALL present a selection of application types including rezoning, departures, subdivision, consolidation, removal of restrictive conditions, site development plan approval, building plan approval, and amendment of conditions, and SHALL require the user to select at least 1 application type before proceeding
2. WHEN a power of attorney form is created, THE Auto_Fill_Engine SHALL populate the attorney fields (professional name, registration number, practice name, identity number, contact details, and practice address) from the professional user profile, and the principal fields (owner name, identity number, physical address, and relationship to property) from the client record
3. WHEN one or more application types are selected, THE Form_System SHALL generate a single power of attorney document listing all selected application types
4. THE Form_System SHALL require the client's identity number, physical address, and relationship to the property for power of attorney generation, where relationship to property is one of: registered owner, authorized representative of registered owner, beneficiary of trust, director of company, or member of close corporation
5. IF a required principal field (identity number, physical address, or relationship to property) is not available in the client record, THEN THE Form_System SHALL prevent document generation and indicate which fields are missing and require manual entry

### Requirement 14: Environmental, Heritage, and Social Assessment Form Support

**User Story:** As an architect, I want to capture environmental impact, heritage impact, and social impact assessment details within building plan submission forms, so that municipal council submissions are complete.

#### Acceptance Criteria

1. WHEN a municipal submission form includes an environmental assessment section, THE Form_System SHALL provide fields for environmental impact assessment reference number, practitioner name, practitioner registration number, practitioner firm, and assessment outcome selected from a defined list of statuses (approved, conditionally approved, pending, not required)
2. WHEN a municipal submission form includes a heritage assessment section, THE Form_System SHALL provide fields for NHRA Section 38 notification reference number, notification date, heritage practitioner name, heritage practitioner registration number, and assessment status selected from a defined list of statuses (no further action required, full HIA required, HIA completed, pending notification response)
3. WHEN a project has existing assessment records in the Project_Passport, THE Auto_Fill_Engine SHALL populate matching assessment fields from those records and leave fields without corresponding data empty and marked as requiring manual entry
4. IF a required assessment is not yet completed for the project, THEN THE Form_System SHALL display a visual indicator adjacent to the assessment section identifying the missing assessment type and provide a navigable link to the relevant Municipal_Readiness action for that assessment
5. WHEN a municipal submission form includes a social impact assessment section, THE Form_System SHALL provide fields for social impact assessment reference number, practitioner name, practitioner registration number, and assessment outcome selected from a defined list of statuses (approved, conditionally approved, pending, not required)

### Requirement 15: Form Data Validation

**User Story:** As an architect, I want the form system to validate my entries against known rules, so that I catch errors before submission rather than having forms rejected by authorities.

#### Acceptance Criteria

1. THE Form_System SHALL validate identity numbers against the South African ID number format (13 digits with Luhn check digit validation)
2. THE Form_System SHALL validate SACAP registration numbers against the registered format of a category prefix letter followed by a numeric sequence (e.g., "PrArch" prefix followed by a registration number of up to 10 digits)
3. WHEN a required field is empty at the time of export, THE Form_System SHALL prevent export and display the list of missing required fields identifying each by field label and form section
4. IF geographic context data is available for the active project, THEN THE Form_System SHALL validate erf numbers, township names, and municipality selections against the project's associated Municipality_Profile and flag entries that do not match a known value in that context
5. IF a validation error is detected when the user moves focus away from a field or triggers export, THEN THE Form_System SHALL display an inline error message adjacent to the affected field indicating the nature of the failure without blocking continued editing of other fields
6. IF geographic context data is not available for the active project, THEN THE Form_System SHALL accept manually entered erf numbers, township names, and municipality selections without geographic validation
