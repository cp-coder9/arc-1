# Requirements Document

## Introduction

The Professional Fee Proposal Builder is a multi-profession fee calculator and proposal builder tool within the Architex OS platform. It provides each of 12 built environment professions with a purpose-built calculator workspace, plus shared proposal generation, terms management, and run history tools. The tool lives under Toolboxes > Proposal & Appointment, operates standalone (no project required), but deeply integrates with Project Passport, Action Centre, Appointment workflow, and SpecForge when linked to a project.

This tool is distinct from the existing `feeEstimatorService.ts` which remains as a simpler client-facing soft-cost estimator. The Professional Fee Proposal Builder serves registered professionals calculating guideline fees per South African council body tariffs (SACAP, ECSA, SACQSP, SACPLAN, SAGC, SACLAP, SACPCMP). However, a client-facing "What will it cost?" estimation view is also provided, using the soft-cost estimator engine to give clients indicative professional fee ranges before appointment.

## Glossary

- **Fee_Engine**: The calculation module that computes professional fees for a given profession using that profession's formula type, inputs, complexity factor, stage weightings, and discount.
- **Profession_Profile**: A configuration record defining a specific profession's formula type, service stages, default weightings, discipline factor, applicable tariff source, and terminology.
- **Calculator_Workspace**: The UI view for a single profession providing all inputs, stage/sub-task selectors, and fee result display.
- **Proposal_Builder**: The module that assembles a fee calculation result into a formal proposal document with project details, client details, terms, and validity period.
- **Terms_Library**: A version-controlled collection of profession-specific terms and conditions templates with editable clauses.
- **Run_Record**: An immutable snapshot of a calculator execution including all inputs, outputs, metadata, and the source version used.
- **Source_Version**: A versioned record of fee guide/tariff data from an official council body, with status tracking (demo-seed, draft, verified, retired).
- **Guideline_Update_Service**: A background service that monitors official council body URLs for tariff changes and creates pending review candidates.
- **Proposal_Snapshot**: An immutable, hash-sealed record of an issued proposal that cannot be mutated after issuance.
- **Profession_Calculator**: One of 12 profession-specific calculator implementations, each with adapted formula, stages, and terminology.
- **Discipline_Portion**: The percentage of total construction value attributable to a specific engineering discipline (e.g., structural 32%, electrical 22%).
- **SACAP_IDoW**: South African Council for the Architectural Profession Identification of Work — the deliverable breakdown within each architectural service stage.
- **Sliding_Scale**: A fee calculation method where the percentage decreases as construction value increases, following published tariff bands.
- **Building_Category**: A SACAP classification grouping (e.g., Residential Domestic, Medical Social Services, Commercial) that, combined with Building_Type, determines project complexity per the IDoW.
- **Building_Type**: A sub-classification within a Building_Category (e.g., General hospitals within Medical Social Services) used to determine the SACAP complexity level.
- **Complexity_Level**: One of three SACAP-defined levels (Low, Medium, High) determined by the Building Category + Building Type matrix, each mapping to a distinct fee percentage table in the gazetted guideline.
- **Platform_Spine**: The shared data bus connecting Project Passport, SpecForge, Action Centre, and Audit Trail.

## Requirements

### Requirement 1: Multi-Profession Calculator Engine

**User Story:** As a built environment professional, I want a fee calculator tailored to my profession's formula and tariff guidelines, so that I can produce accurate guideline-based fee calculations.

#### Acceptance Criteria

1. THE Fee_Engine SHALL support 12 distinct Profession_Profiles: Architect, Structural Engineer, Civil Engineer, Electrical Engineer, Mechanical Engineer, Fire Engineer, Quantity Surveyor, Town Planner, Land Surveyor, Landscape Architect, Interior Designer, and Construction Project Manager.
2. WHEN the Fee_Engine calculates a fee for the Architect profession, THE Fee_Engine SHALL apply a sliding scale formula based on construction value bands per SACAP guidelines.
3. WHEN the Fee_Engine calculates a fee for the Structural Engineer, Civil Engineer, Electrical Engineer, or Mechanical Engineer professions, THE Fee_Engine SHALL apply a percentage-of-discipline-portion formula where the discipline percentage of total construction value is configurable.
4. WHEN the Fee_Engine calculates a fee for the Fire Engineer profession, THE Fee_Engine SHALL apply a hybrid formula combining a base assessment fee with an hourly rate for rational design work.
5. WHEN the Fee_Engine calculates a fee for the Quantity Surveyor profession, THE Fee_Engine SHALL support three fee basis options: percentage of contract value, percentage of architect fee, or time-based calculation.
6. WHEN the Fee_Engine calculates a fee for the Town Planner profession, THE Fee_Engine SHALL apply a hybrid formula combining application-type-based fees with time-based components.
7. WHEN the Fee_Engine calculates a fee for the Land Surveyor profession, THE Fee_Engine SHALL apply a formula combining area/unit rates with beacon rates.
8. WHEN the Fee_Engine calculates a fee for the Interior Designer profession, THE Fee_Engine SHALL apply a formula combining design fee percentage with procurement markup on FF&E value.
9. WHEN the Fee_Engine calculates a fee for the Construction Project Manager profession, THE Fee_Engine SHALL support three fee basis options: percentage of construction value, percentage of total professional team fees, or monthly retainer.
10. WHEN a fee calculation completes, THE Fee_Engine SHALL produce a result containing: guideline fee, complexity-adjusted fee, stage-weighted fee, discount amount, professional fee, disbursements total, statutory fees total, VAT amount, and total fee.
11. FOR ALL valid Fee_Engine input configurations, serializing the input to JSON and deserializing it back SHALL produce an equivalent input object (round-trip property).

### Requirement 2: Profession-Specific Stage Weighting

**User Story:** As a professional, I want to select and weight service stages specific to my profession, so that my fee reflects only the scope of work I am undertaking.

#### Acceptance Criteria

1. THE Profession_Profile SHALL define profession-specific service stages with default percentage weightings that sum to 100%.
2. WHEN a user toggles a stage on or off in a Calculator_Workspace, THE Fee_Engine SHALL recalculate the fee using only the selected stages' weightings as a proportion of the total.
3. WHEN the Architect Calculator_Workspace is active, THE Calculator_Workspace SHALL display sub-task weightings within each stage based on the SACAP IDoW deliverable breakdown.
4. WHEN a user edits a stage weighting percentage, THE Fee_Engine SHALL use the edited value for calculation instead of the default.
5. WHEN a user edits a sub-task weighting within an Architect stage, THE Fee_Engine SHALL use the edited value and recalculate the stage total from its sub-task weightings.

### Requirement 3: SACAP Complexity Classification and Discount Controls

**User Story:** As a professional, I want complexity to be determined by the official SACAP Building Category and Building Type classification (per the IDoW and gazetted fee guideline), and I want to apply discounts with recorded justification, so that my fee proposal uses the correct guideline percentage for the project type.

#### Acceptance Criteria

1. WHEN the Architect Calculator_Workspace is active, THE Calculator_Workspace SHALL determine project complexity through a Building Category and Building Type selection matrix as defined in the SACAP gazetted fee guideline and IDoW (Board Notice 27 of 2021).
2. THE Calculator_Workspace SHALL provide Building Category options including but not limited to: Residential Domestic, Residential Multi-Unit, Commercial, Industrial, Medical Social Services, Educational, Recreational, Religious, Agricultural, and other categories as defined by SACAP.
3. WHEN a user selects a Building Category, THE Calculator_Workspace SHALL populate the Building Type dropdown with the sub-types applicable to that category (e.g., Medical Social Services → General hospitals, Clinics, Day care centres, etc.).
4. THE combination of Building Category and Building Type SHALL map to one of three SACAP complexity levels: Low, Medium, or High, each corresponding to a distinct fee percentage table in the gazetted guideline.
5. THE Calculator_Workspace SHALL display the determined complexity level (Low, Medium, or High) with a description per IDoW: Low = simple buildings, low-performance, standard methods, minimal M&E; Medium = average design, non-complex structural, average M&E equipment; High = high-performance, sophisticated design, complex structural, large M&E.
6. THE Calculator_Workspace SHALL allow a user to override the matrix-determined complexity on a project-by-project basis (per SACAP note: "Complexity can be determined on a project-by-project basis. Refer to IDoW for guidance."), with mandatory justification for the override.
7. FOR non-Architect professions, THE Calculator_Workspace SHALL provide complexity selection appropriate to that profession's council body guidelines (ECSA, SACQSP, SACPLAN, etc.) which may use different classification criteria.
8. WHEN a user enters a discount percentage, THE Fee_Engine SHALL reduce the stage-weighted fee by that percentage.
9. WHEN a user enters a discount percentage greater than zero, THE Calculator_Workspace SHALL require a mandatory discount reason before allowing proposal generation.
10. IF a discount percentage is applied without a reason, THEN THE Calculator_Workspace SHALL prevent proposal generation and display a validation message.

### Requirement 4: Editable Tariff Parameters

**User Story:** As a professional, I want to override default tariff values (hourly rates, discipline factors, guideline percentages), so that I can adjust calculations to current market conditions.

#### Acceptance Criteria

1. THE Calculator_Workspace SHALL allow editing of hourly rates for time-based fee components.
2. THE Calculator_Workspace SHALL allow editing of discipline factor percentages (e.g., structural 32%, electrical 22%).
3. THE Calculator_Workspace SHALL allow editing of guideline percentage values used in fee formulas.
4. THE Calculator_Workspace SHALL allow adding, editing, and removing disbursement line items with descriptions and amounts.
5. THE Calculator_Workspace SHALL allow adding, editing, and removing statutory fee line items with descriptions and amounts.
6. THE Calculator_Workspace SHALL provide a VAT toggle between 15% and 0%.

### Requirement 5: Fee Source Version Management and Gazetted Schedule Updates

**User Story:** As a platform administrator, I want fee guide tariff values to be version-controlled with clear provenance status, so that professionals always calculate against the correct gazetted fee schedule and the system can be updated when new Board Notices are published.

#### Acceptance Criteria

1. THE Source_Version record SHALL contain: source body identifier, version number, effective date, Board Notice / gazette reference number, data payload (fee tables, percentage bands, stage weightings), status, created-by, approved-by, and content hash.
2. THE Source_Version record SHALL support four status values: demo-seed, draft, verified, and retired.
3. WHEN a fee calculation executes, THE Fee_Engine SHALL record which Source_Version was used in the Run_Record.
4. WHEN a Source_Version has status demo-seed, THE Calculator_Workspace SHALL display a visible indicator stating the tariff data is for demonstration only and has not been verified against official sources.
5. WHEN an administrator updates a Source_Version status to verified, THE Source_Version record SHALL create a new version entry preserving the previous version in history.
6. WHEN a new gazetted fee schedule is published (new Board Notice from SACAP, ECSA, SACQSP, etc.), THE platform SHALL allow an administrator to create a new Source_Version record by entering the updated fee table data, effective date, and gazette reference.
7. WHEN a new Source_Version is activated (status set to verified), THE Fee_Engine SHALL use the new version for all subsequent calculations while retiring the previous active version.
8. WHEN a Source_Version is retired, THE Fee_Engine SHALL NOT use it for new calculations, but existing Run_Records and issued Proposal_Snapshots that reference it SHALL retain their original data unchanged.
9. THE Source_Version management interface SHALL support importing fee table data from structured formats (CSV or JSON) to simplify data entry when new gazetted schedules are published.
10. WHEN multiple Source_Versions exist for the same profession, THE Calculator_Workspace SHALL always use the most recent verified version by default, but SHALL allow professionals to view and compare against previous versions for reference.

### Requirement 6: Proposal Builder

**User Story:** As a professional, I want to generate a formal fee proposal document from my calculator output, so that I can present a professional proposal to my client.

#### Acceptance Criteria

1. WHEN a user initiates proposal generation from a fee calculation, THE Proposal_Builder SHALL capture: project details, client details, professional details, assumptions, exclusions, and notes.
2. THE Proposal_Builder SHALL allow selection of a terms template from the Terms_Library for inclusion in the proposal.
3. THE Proposal_Builder SHALL allow adding custom additional clauses beyond the selected template.
4. THE Proposal_Builder SHALL allow setting a validity period in days for the proposal.
5. WHEN a user issues a proposal, THE Proposal_Builder SHALL create an immutable Proposal_Snapshot with a cryptographic content hash.
6. WHEN a Proposal_Snapshot has been issued, THE Proposal_Builder SHALL prevent any mutation of that snapshot record.
7. WHEN a user needs to change an issued proposal, THE Proposal_Builder SHALL create a new version that supersedes the previous one.
8. WHEN a user attempts to issue a proposal, THE Proposal_Builder SHALL require a professional responsibility confirmation before proceeding.

### Requirement 7: Terms and Conditions Library

**User Story:** As a professional, I want access to profession-specific terms and conditions templates, so that I can include appropriate legal clauses in my proposals.

#### Acceptance Criteria

1. THE Terms_Library SHALL provide profession-specific templates for: standard SA, architectural, engineering, quantity surveying, town planning, surveying, landscape, interior design, project management, and fire specialist contexts.
2. THE Terms_Library SHALL allow editing of individual clause text within each template.
3. WHEN a user saves edits to a terms template, THE Terms_Library SHALL create a new version preserving the previous version.
4. THE Terms_Library SHALL support a legal review flag indicating whether a template has been reviewed by legal counsel.
5. THE Proposal_Builder SHALL allow adding custom terms clauses per proposal in addition to the selected template clauses.

### Requirement 8: Run Persistence and History

**User Story:** As a professional, I want to save, reopen, and export my fee calculations, so that I can maintain a history of my work and share results.

#### Acceptance Criteria

1. WHEN a user saves a calculator run, THE Run_Record SHALL capture all inputs, outputs, metadata, profession identifier, Source_Version references, and timestamp as an immutable record.
2. WHEN a user reopens a saved Run_Record, THE Calculator_Workspace SHALL create a new version pre-populated with the previous run's inputs rather than mutating the original.
3. WHEN a user assigns a Run_Record to a project, THE Platform_Spine SHALL create a ProjectRecord entry and document reference in the project's passport.
4. THE Calculator_Workspace SHALL support exporting runs in PDF, CSV, and JSON formats.
5. FOR ALL valid Run_Records, serializing to JSON and deserializing back SHALL produce an equivalent Run_Record (round-trip property).

### Requirement 9: Platform Integration

**User Story:** As an Architex platform user, I want fee proposals to integrate with the project lifecycle, so that issued proposals flow into appointment and specification workflows.

#### Acceptance Criteria

1. WHEN a proposal is issued and linked to a project, THE Proposal_Builder SHALL write the proposal record into the project's Project Passport.
2. WHEN a proposal is issued, THE Proposal_Builder SHALL create an Action Centre inbox event for the client with action type "Review and accept".
3. WHEN a client accepts a proposal, THE Platform_Spine SHALL create an Appointment Draft and route it to the Appointment and Kickoff workflow.
4. WHEN a proposal is accepted, THE Platform_Spine SHALL seed SpecForge specification items from the proposal's scope and stage definitions.
5. THE Proposal_Builder SHALL write an audit trail entry for every proposal action: create, issue, revise, and accept.

### Requirement 10: Role-Based Access

**User Story:** As a platform administrator, I want profession-specific access controls, so that each professional sees their own calculator by default while retaining access to others when needed.

#### Acceptance Criteria

1. WHEN a user opens the Fee Proposal Builder tool, THE Calculator_Workspace SHALL default to showing the profession matching the user's registered role.
2. THE Calculator_Workspace SHALL allow users to navigate to and use calculators for professions other than their own.
3. WHEN a user has no recognised profession role, THE Calculator_Workspace SHALL display all 12 profession calculators without a default selection.

### Requirement 11: Fee Guide Source Monitoring

**User Story:** As a platform administrator, I want automated monitoring of official council body tariff publications, so that I am alerted when fee guides may have changed.

#### Acceptance Criteria

1. THE Guideline_Update_Service SHALL maintain a watch registry of official council body URLs for: SACAP, ECSA, SACQSP, SACPLAN, SAGC, SACLAP, and SACPCMP.
2. WHEN the Guideline_Update_Service detects a content change via hash comparison or keyword matching, THE Guideline_Update_Service SHALL create a pending review candidate record.
3. WHEN a pending review candidate is created, THE Guideline_Update_Service SHALL generate an admin inbox item for human review.
4. WHEN an administrator approves a new fee guide version, THE Source_Version record SHALL transition from draft to verified status.
5. WHEN a new Source_Version becomes active, THE Fee_Engine SHALL use the new version for subsequent calculations while issued Proposal_Snapshots retain their original Source_Version data.

### Requirement 12: UI/UX Shell Integration

**User Story:** As an Architex user, I want the Fee Proposal Builder to render within the platform shell with consistent SpecForge-aesthetic styling, so that it feels native to the Architex OS experience.

#### Acceptance Criteria

1. THE Calculator_Workspace SHALL render inside the Architex OS shell receiving the standard header, mini-nav, and content area layout.
2. THE Calculator_Workspace SHALL accept a user prop for role-based behaviour and permission scoping.
3. THE Calculator_Workspace SHALL provide a left sidebar navigation listing all 12 professions and three tool sections (Proposal Builder, Terms, History).
4. THE Calculator_Workspace SHALL use the SpecForge aesthetic: dark green glass panels, Space Grotesk headings, subtle grid overlay, glass borders, and backdrop blur effects.
5. THE Calculator_Workspace SHALL use responsive two-column layouts for form sections, collapsing to single-column on viewports narrower than 900px.
6. WHEN a user selects a different profession from the sidebar, THE Calculator_Workspace SHALL display that profession's distinct workspace with adapted inputs, stages, and terminology.

### Requirement 13: Disclaimers and Professional Responsibility

**User Story:** As a platform operator, I want clear disclaimers and professional responsibility gates, so that the tool is not mistaken for legal fee advice.

#### Acceptance Criteria

1. THE Calculator_Workspace SHALL display a persistent disclaimer stating "This is a guideline calculator, not legal fee advice" in every profession workspace.
2. WHEN tariff data has Source_Version status of demo-seed, THE Calculator_Workspace SHALL display an additional indicator marking values as demonstration data pending verification.
3. WHEN a user attempts to issue a proposal, THE Proposal_Builder SHALL present a professional responsibility confirmation gate that the user must acknowledge before the issue action proceeds.
4. IF a user does not acknowledge the professional responsibility confirmation, THEN THE Proposal_Builder SHALL prevent the proposal from being issued.

### Requirement 14: Client-Facing Fee Estimation View

**User Story:** As a client or property developer doing an enquiry, I want to estimate what professional fees might cost for my project, so that I can budget appropriately before appointing professionals.

#### Acceptance Criteria

1. WHEN a user with a client or developer role accesses the fee estimation tool, THE Calculator_Workspace SHALL present a simplified "What will it cost?" view that aggregates typical professional fees for a given construction value and project type.
2. THE client-facing view SHALL allow the user to input: estimated construction value, project type (residential, commercial, industrial, mixed-use), estimated area (m²), and municipality.
3. WHEN the client submits their inputs, THE Fee_Engine SHALL calculate indicative professional fee ranges for all likely disciplines required (architect, structural engineer, QS, etc.) and present them as a summary table.
4. THE client-facing view SHALL clearly state that results are indicative planning estimates only and are not binding quotations from any professional.
5. WHEN a client views the aggregated fee estimate, THE Calculator_Workspace SHALL show estimated fees per profession as individual line items plus a total professional fees estimate.
6. THE client-facing view SHALL link to the existing `feeEstimatorService.ts` soft-cost estimator logic for its calculations, maintaining that service as the client-facing calculation engine while the Professional Fee Proposal Builder serves registered professionals.
7. WHEN a client has received proposals from appointed professionals within a project, THE client-facing view SHALL show actual proposed fees alongside the original estimate for comparison.

### Requirement 15: SACAP Gazetted Fee Table Integration

**User Story:** As an architect, I want the calculator to use the official SACAP gazetted fee tables (construction value bands mapped to fee percentages per complexity level), so that my calculation aligns with the published guideline exactly.

#### Acceptance Criteria

1. THE Fee_Engine SHALL store SACAP fee tables as structured data mapping construction value bands to fee percentages for each of the three complexity levels (Low, Medium, High).
2. WHEN calculating an architectural fee, THE Fee_Engine SHALL look up the applicable fee percentage from the gazetted table based on: the entered construction value, and the determined complexity level.
3. THE Fee_Engine SHALL apply interpolation within value bands where the construction value falls between published breakpoints (matching the SACAP online calculator behaviour).
4. THE Fee_Engine SHALL calculate both the total "Project Fee" (based on full scope at 100% stage allocation) and the "Scope of Work Fee" (based on selected stages as a percentage of the project fee), matching the SACAP calculator's dual output.
5. WHEN the gazetted fee tables are updated (new Board Notice), THE Source_Version management system SHALL allow an administrator to upload the new table data and version it, without affecting existing issued proposals that reference the previous version.
6. THE Calculator_Workspace SHALL display both the "Project Fee Rate %" and the "Scope of Work Fee Rate %" in the results panel, matching the terminology used on the official SACAP calculator.
