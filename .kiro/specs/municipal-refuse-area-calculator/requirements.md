# Requirements Document

## Introduction

The Municipal Refuse Area Calculator is a compliance tool within Module 4 (Compliance + Municipal Readiness) of the Architex platform. It helps architects, engineers, and built environment professionals determine the required refuse storage area dimensions, bin quantities, access requirements, and ventilation/drainage provisions for building projects across all South African municipalities. The tool produces an advisory compliance summary — it does not certify or guarantee compliance.

## Glossary

- **Calculator**: The Municipal Refuse Area Calculator tool component rendered within the Architex AppShell content area.
- **Municipality_Profile**: A data record describing the refuse area calculation rules, bin sizing standards, access requirements, and ventilation/drainage provisions for a specific South African local authority.
- **Building_Type**: A classification of the project building usage — one of Residential, Commercial, Industrial, or Mixed-Use.
- **Refuse_Area_Result**: The computed output from the Calculator containing required area dimensions, bin quantities, access provisions, ventilation requirements, and a compliance advisory summary.
- **Professional_Sign_Off**: A gated acknowledgement step where an accountable professional confirms that the advisory output has been reviewed before downstream use.
- **Project_Passport**: The central project truth record within Architex that receives outputs from all major tools.
- **SpecForge**: The specification spine of Architex where product schedules, specifications, and selections are managed.
- **Advisory_Disclaimer**: A persistent notice on all outputs stating that results are indicative guidance only and do not constitute certification or legal compliance confirmation.
- **Collection_Vehicle_Access**: The physical space and path requirements for refuse collection vehicles to reach the refuse storage area, as specified by local bylaws.

## Requirements

### Requirement 1: Municipality Selection and Profile Loading

**User Story:** As an architect, I want to select the relevant municipality for my project, so that the calculator uses the correct local bylaw requirements for refuse area computation.

#### Acceptance Criteria

1. WHEN the Calculator loads, THE Calculator SHALL display a searchable municipality selector containing all supported South African municipalities, where the selector filters the list to show only municipalities whose name contains the text typed by the user after a minimum of 2 characters are entered.
2. WHEN a user selects a municipality, THE Calculator SHALL load the corresponding Municipality_Profile rules for refuse area computation within 5 seconds.
3. THE Calculator SHALL support Municipality_Profiles for at minimum: City of Johannesburg, City of Cape Town, eThekwini (Durban), City of Tshwane (Pretoria), Nelson Mandela Bay, Buffalo City, Mangaung, and a generic fallback profile for unlisted municipalities.
4. WHEN a municipality is not listed, THE Calculator SHALL offer the generic fallback profile and display a notice that the user should verify requirements with the relevant local authority.
5. WHILE a Municipality_Profile is loading, THE Calculator SHALL display a loading indicator and prevent form submission.
6. IF the Municipality_Profile fails to load within 5 seconds or a network error occurs, THEN THE Calculator SHALL display an error message indicating the profile could not be loaded, retain the user's municipality selection, and provide a retry action.

### Requirement 2: Building Type and Project Inputs

**User Story:** As a built environment professional, I want to input my project's building type and key parameters, so that the calculator can determine refuse area requirements specific to my project.

#### Acceptance Criteria

1. THE Calculator SHALL accept the following Building_Type classifications: Residential, Commercial, Industrial, and Mixed-Use.
2. WHEN the Building_Type is Residential, THE Calculator SHALL accept unit count (integer, 1 to 10,000) and average occupants per unit (numeric, 1 to 20) as inputs.
3. WHEN the Building_Type is Commercial, THE Calculator SHALL accept gross floor area in square metres (numeric, 1 to 500,000) and estimated occupant count (integer, 1 to 100,000) as inputs.
4. WHEN the Building_Type is Industrial, THE Calculator SHALL accept gross floor area in square metres (numeric, 1 to 500,000), number of employees (integer, 1 to 50,000), and waste generation category (one of: Light, Medium, Heavy) as inputs.
5. WHEN the Building_Type is Mixed-Use, THE Calculator SHALL accept separate input groups for each usage component (residential units, commercial floor area, industrial floor area) and compute a combined refuse area requirement by summing the individual refuse area contributions of each declared component.
6. THE Calculator SHALL validate that all numeric inputs are greater than zero, contain no more than two decimal places, and fall within the specified bounds for their field before performing computation.
7. IF a required input field is left empty, THEN THE Calculator SHALL display an inline validation message adjacent to the field identifying it as required.
8. IF the user submits a numeric input that is zero, negative, or exceeds the upper bound for its field, THEN THE Calculator SHALL display an inline validation message indicating the acceptable range for that field.
9. WHEN the Building_Type is Mixed-Use, THE Calculator SHALL require at least two usage components to be declared before accepting the submission.

### Requirement 3: Refuse Area Dimension Calculation

**User Story:** As an architect, I want to calculate the required refuse storage room dimensions, so that I can incorporate the correct area into my building plans.

#### Acceptance Criteria

1. WHEN all required inputs are provided and valid, THE Calculator SHALL compute the minimum refuse storage area in square metres (rounded to 2 decimal places) based on the selected Municipality_Profile rules.
2. WHEN the refuse storage area is computed, THE Calculator SHALL display the minimum required dimensions (length × width × height) in metres, each rounded to the nearest 0.1 m.
3. WHEN the Municipality_Profile specifies a minimum clearance height, THE Calculator SHALL include the Municipality_Profile height in the result. IF the Municipality_Profile does not specify a minimum clearance height, THEN THE Calculator SHALL apply a default minimum clearance height of 2.4 m.
4. WHEN performing the computation, THE Calculator SHALL apply the per-unit or per-area waste generation rates defined in the Municipality_Profile (expressed in litres per unit or litres per square metre per collection cycle) to determine total waste volume in litres.
5. WHEN the Building_Type is Mixed-Use, THE Calculator SHALL sum the individual component area requirements and display both the component-level area (per usage type) and the combined total area requirement.
6. IF the computation produces a total refuse storage area below 4.0 square metres, THEN THE Calculator SHALL apply 4.0 square metres as the minimum floor area and display a notice that municipal minimum room size applies.

### Requirement 4: Bin Quantity and Size Calculation

**User Story:** As a built environment professional, I want to know how many bins of what size are required, so that I can specify the correct refuse containment for the project.

#### Acceptance Criteria

1. WHEN the refuse area is computed, THE Calculator SHALL calculate the required number of bins by dividing the computed total waste volume by the bin capacity defined in the Municipality_Profile and rounding up to the next whole number.
2. WHEN the Municipality_Profile defines multiple available bin sizes, THE Calculator SHALL select the bin size that results in the fewest total bins while not exceeding the maximum bin count per collection point defined in the Municipality_Profile.
3. THE Calculator SHALL display bin quantity, bin capacity in litres, and total bin volume (quantity multiplied by bin capacity) for the project.
4. WHEN the Municipality_Profile specifies different bin types for recyclable and general waste, THE Calculator SHALL display separate bin counts, bin capacities, and total volumes for each waste stream.
5. WHEN the bin quantity is calculated, THE Calculator SHALL display the physical floor space required by the calculated bin arrangement in square metres, derived from the per-bin footprint dimensions defined in the Municipality_Profile.
6. IF the computed total waste volume is zero or the Municipality_Profile does not define any bin size standards, THEN THE Calculator SHALL display an error message indicating that bin calculation cannot be completed and identifying the missing data.

### Requirement 5: Collection Vehicle Access Requirements

**User Story:** As an architect, I want to understand the access requirements for refuse collection vehicles, so that I can design adequate vehicle access paths and turning areas.

#### Acceptance Criteria

1. WHEN the refuse area result is generated, THE Calculator SHALL display the Collection_Vehicle_Access requirements from the selected Municipality_Profile.
2. WHEN the refuse area result is generated, THE Calculator SHALL display minimum access road width in metres, turning circle radius in metres, and maximum gradient as a percentage for vehicle access paths.
3. WHEN the Municipality_Profile specifies maximum carry distance from refuse room to collection point, THE Calculator SHALL display the maximum carry distance requirement in metres.
4. WHEN the refuse area result is generated, THE Calculator SHALL display whether a dedicated vehicle hardstand area is required and its minimum dimensions in metres (length × width).
5. IF the selected Municipality_Profile does not contain Collection_Vehicle_Access data for one or more fields, THEN THE Calculator SHALL display a notice indicating which vehicle access requirements are not specified by the selected municipality and advising the user to verify with the relevant local authority.

### Requirement 6: Ventilation and Drainage Requirements

**User Story:** As an architect, I want to know the ventilation and drainage requirements for the refuse area, so that the space meets health and environmental standards.

#### Acceptance Criteria

1. WHEN the refuse area result is generated, THE Calculator SHALL display the ventilation requirements from the selected Municipality_Profile, including the ventilation type (natural openings or mechanical extraction) and the corresponding sizing value.
2. THE Calculator SHALL display the minimum ventilation opening area in square metres for natural ventilation, or the minimum mechanical ventilation rate in air changes per hour, as specified by the Municipality_Profile.
3. THE Calculator SHALL display drainage requirements from the Municipality_Profile including floor gradient as a percentage, drain diameter in millimetres, and wash-down provision (whether a hose connection point or tap is required and its location relative to the refuse room).
4. IF the Municipality_Profile specifies pest control or vermin-proofing requirements, THEN THE Calculator SHALL display those requirements in the output.
5. IF the Municipality_Profile does not contain ventilation or drainage data for a given field, THEN THE Calculator SHALL display an indication that the value is not specified in the loaded profile and that the user should verify requirements with the relevant local authority.

### Requirement 7: Compliance Summary with Advisory Language

**User Story:** As a professional, I want a clear compliance summary that I can use for reference, so that I can communicate requirements to my project team while understanding the advisory nature of the output.

#### Acceptance Criteria

1. WHEN computation is complete, THE Calculator SHALL display a Refuse_Area_Result summary panel containing: the computed minimum refuse storage area and dimensions, bin quantities and capacities per waste stream, Collection_Vehicle_Access requirements, ventilation and drainage requirements, and the source municipality name.
2. THE Calculator SHALL display the Advisory_Disclaimer on the summary panel stating: "This output is advisory only. It does not constitute legal compliance certification. Results are derived from interpreted municipal guidelines and must be verified by a qualified professional against current local bylaws." The disclaimer SHALL be persistently visible on the summary panel without requiring scrolling to the disclaimer's location.
3. THE Calculator SHALL not reproduce copyrighted bylaw text verbatim — all requirements are paraphrased as interpreted guidance.
4. THE Calculator SHALL display the source municipality name and the date the Municipality_Profile was last updated, formatted as "DD MMM YYYY" (e.g., "30 Apr 2026").
5. THE Calculator SHALL provide an option to export the Refuse_Area_Result summary as a PDF report. The exported PDF SHALL include all sections displayed on the summary panel and the full Advisory_Disclaimer text.
6. IF PDF export fails, THEN THE Calculator SHALL display an error message indicating the export could not be completed, and SHALL retain the summary panel state without data loss.

### Requirement 8: Professional Sign-Off Gate

**User Story:** As an accountable professional, I want a sign-off step before the advisory output can be used downstream, so that the platform maintains governance and auditability.

#### Acceptance Criteria

1. WHEN a user attempts to save the Refuse_Area_Result to Project_Passport, export to SpecForge, or export as PDF, THE Calculator SHALL present the Professional_Sign_Off gate as a modal dialog that blocks the triggering action until the gate is completed or dismissed.
2. THE Professional_Sign_Off gate SHALL require the user to select a mandatory checkbox confirming that: (a) the output is advisory only, (b) the user has reviewed the computed results, and (c) professional verification against current local bylaws remains the user's responsibility. The checkbox label text SHALL be displayed in full and the confirm action SHALL remain disabled until the checkbox is selected.
3. WHEN the Professional_Sign_Off is completed, THE Calculator SHALL record an immutable audit trail entry containing: the sign-off timestamp in ISO 8601 format, the user's unique identifier (uid), the user's display name, the user's platform role, and the full acknowledgement statement text that was confirmed.
4. IF the Professional_Sign_Off is not completed, THEN THE Calculator SHALL prevent saving the result to Project_Passport, exporting to SpecForge, or exporting as PDF, and SHALL retain the computed Refuse_Area_Result on screen so the user may return to complete the sign-off without re-entering inputs.
5. IF the Professional_Sign_Off gate is dismissed without completion, THEN THE Calculator SHALL display a persistent notice indicating that downstream save and export actions remain unavailable until sign-off is completed.

### Requirement 9: Platform Integration

**User Story:** As a professional using the Architex platform, I want the calculator to integrate with Project Passport and SpecForge, so that refuse area data flows into the project record and specification spine.

#### Acceptance Criteria

1. WHEN the Professional_Sign_Off is completed and an active project context is available, THE Calculator SHALL write the Refuse_Area_Result to the active Project_Passport record within 5 seconds of sign-off completion.
2. WHEN the Professional_Sign_Off is completed and an active project context is available, THE Calculator SHALL expose the Refuse_Area_Result to SpecForge as a specification item for the refuse room element within 5 seconds of sign-off completion.
3. IF the write to Project_Passport or SpecForge fails after 3 retry attempts, THEN THE Calculator SHALL display an error indication to the user and create a failed-sync alert in the Action Centre identifying the target module that failed.
4. IF the Calculator is rendered without an active project context, THEN THE Calculator SHALL display a project selection prompt and SHALL disable the Project_Passport and SpecForge integration actions until a project is selected.
5. THE Calculator SHALL accept the `user: UserProfile` prop and operate within the active project context.
6. THE Calculator SHALL be registered in the toolNavRegistry with sections for Input, Calculation, and Results.
7. THE Calculator SHALL be lazy-loaded in App.tsx via `lazyWithChunkRetry` and registered in `architexNavigationConfig.ts` under the Compliance Hub / Toolboxes module.
8. THE Calculator SHALL render inside the AppShell content area following the Hero → Stat Row → Panels content pattern.

### Requirement 10: Design Workshop Sample

**User Story:** As a designer iterating on the tool's visual design, I want a self-contained HTML sample file at the project root, so that I can workshop the layout in a browser without spinning up the dev server.

#### Acceptance Criteria

1. THE Calculator feature SHALL have a corresponding design workshop sample HTML file at the project root named `MUNICIPAL_REFUSE_AREA_CALCULATOR_SAMPLE.html`.
2. THE design workshop sample SHALL be a self-contained single file with all CSS and JavaScript inlined, using the Architex CSS token system (`:root` custom properties for colors, spacing, and font), with no external stylesheets, scripts, fonts, or image dependencies.
3. THE design workshop sample SHALL render the Architex 3-column AppShell grid (OS Nav 56px, Tool Nav 200px, Top Bar 36px, Content Area) and place the Calculator layout within the Content Area following the Hero → Stat Row → Panels content pattern.
4. THE design workshop sample SHALL demonstrate the full Calculator layout in a populated results state, showing: municipality selector (with a selected value), input form (with filled values), results panel (with computed dimensions, bin quantities, access and ventilation requirements), advisory disclaimer text, and the professional sign-off gate.
5. THE design workshop sample SHALL use sample data representing a residential project in the City of Johannesburg municipality with 24 units at 4 occupants per unit, displaying computed refuse area dimensions, bin count, and access requirements derived from that input.
6. THE design workshop sample SHALL render correctly at a minimum viewport width of 1200px.
