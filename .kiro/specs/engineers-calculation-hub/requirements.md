# Requirements Document

## Introduction

The Engineer's Calculation Hub is a comprehensive multi-discipline engineering calculator workspace within the Architex Compliance Hub module. It provides 53 professional-grade engineering calculators covering structural (steel, concrete, timber), geotechnical, civil (loading, stormwater), mechanical (HVAC), fire engineering, electrical, and wet services disciplines. Each calculator features Zod-validated inputs with South African standard defaults, a live computation engine with pass/fail status, step-by-step derivation display with SANS clause references, PDF export, and run history with assign-to-project capability. The tool integrates with SpecForge, Project Passport, and the platform audit trail. All calculations are advisory only — professional engineer sign-off is required.

## Glossary

- **Calculation_Hub**: The top-level React workspace component rendering the calculator navigation, input forms, result panels, and derivation displays within the Architex OS shell.
- **Calculator_Engine**: A pure TypeScript function that accepts a validated input object and returns a deterministic output object containing computed values, pass/fail status, derivation steps, and SANS clause references.
- **Calculator_Definition**: A `CalculatorDefinition` object in the toolbox framework that describes a calculator's metadata, input schema, output schema, SANS references, and engine function identifier.
- **Calculator_Run**: A `StandaloneToolRun` record persisting the inputs, outputs, metadata, and lineage of a single calculator execution.
- **Discipline_Group**: A logical grouping of related calculators (e.g., Structural-Steel, Fire Engineering) rendered as a navigation section in the sidebar.
- **Derivation_Display**: A formatted step-by-step mathematical breakdown showing how the calculator reached its result, including intermediate values and SANS clause references.
- **Input_Schema**: A Zod schema defining the validated input fields for a calculator, including types, ranges, defaults, and SA-standard default values.
- **Pass_Fail_Status**: A computed status (pass, fail, or warning) indicating whether the calculated result satisfies the relevant code requirement.
- **PDF_Export**: A generated professional calculation sheet containing inputs, outputs, derivation steps, SANS references, engineer metadata, project context, and advisory disclaimer.
- **Run_History**: A chronologically ordered list of previous Calculator_Run records for the current user, filterable by discipline and project assignment.
- **Project_Passport**: The central project health card that receives calculator results as compliance evidence.
- **SpecForge**: The specification spine that receives calculator results pushed as spec items.
- **Audit_Trail**: The platform-wide immutable logging service that records calculator run events.

## Requirements

### Requirement 1: Workspace Layout and Navigation

**User Story:** As an engineer, I want a calculator workspace with discipline-based navigation, so that I can quickly find and use any of the 53 calculators without scrolling through a flat list.

#### Acceptance Criteria

1. THE Calculation_Hub SHALL render within the Architex OS shell content area, receiving the OS header breadcrumb path `/ Compliance Hub / Engineer's Calculation Hub` and the minimised primary navigation showing the Compliance Hub module.
2. THE Calculation_Hub SHALL render a 240px left sidebar containing Discipline_Group sections, each with a section header and a list of calculator navigation items within that discipline.
3. WHEN a user clicks a calculator navigation item, THE Calculation_Hub SHALL render the selected calculator's input form and results panel in the main content area within 200ms of the click event.
4. THE Calculation_Hub SHALL support the following Discipline_Group sections in sidebar order: Structural (Steel Design, Concrete Design, Timber Design, Geotechnical), Civil (Loading & Wind, Stormwater & Drainage), Mechanical HVAC (Duct & Pipe Sizing, Heating & Cooling Loads), Fire Engineering (Escape & Travel Distance, Fire Resistance Rating, Fire Water / Hydrants), Electrical (Cable Sizing & Voltage Drop, Max Demand & DB Sizing), Wet Services (Water Pipe Sizing, Drainage & Fixture Units, Hot Water System Sizing), Utilities (Unit Converter & Ref).
5. WHEN a Discipline_Group navigation item contains multiple calculators, THE Calculation_Hub SHALL render sub-tabs above the calculator content area allowing switching between related calculators within the same discipline group.
6. THE Calculation_Hub SHALL display the active calculator's name, SANS reference code, and advisory-only indicator in the content area header.
7. THE Calculation_Hub SHALL accept a `user: UserProfile` prop and restrict visibility to users whose role is one of: engineer, architect, bep, energy_professional, fire_engineer, quantity_surveyor, site_manager.

### Requirement 2: Calculator Input Forms and Validation

**User Story:** As an engineer, I want validated input forms with SA-standard defaults, so that I can start calculations immediately with sensible values and be prevented from entering invalid data.

#### Acceptance Criteria

1. THE Calculation_Hub SHALL render each calculator's input form using fields defined by the calculator's Input_Schema, displaying the field label, unit, and default value.
2. THE Input_Schema for each calculator SHALL be a Zod schema defining field types (number, string, enum), value ranges (min, max), step increments, and default values appropriate for South African engineering practice.
3. WHEN a user modifies an input field, THE Calculation_Hub SHALL validate the field value against the Input_Schema in real time and display a validation error message adjacent to the field within 100ms if the value violates the schema constraints.
4. WHEN any input field fails Zod schema validation, THE Calculation_Hub SHALL disable the Calculate button and prevent computation until all fields pass validation.
5. THE Calculation_Hub SHALL provide steel section selection dropdowns populated with SA Red Book section properties (I/H sections including 203x133UB25 through 610x229UB125).
6. THE Calculation_Hub SHALL provide material grade selection dropdowns with SA-standard options (e.g., Grade 300W and Grade 350W for steel, Grade 25 through Grade 50 for concrete).
7. WHEN a calculator requires selection from a predefined dataset (steel sections, material densities, pipe sizes), THE Calculation_Hub SHALL populate the selection control from a typed constant array defined in the calculator module.
8. IF a user navigates away from a calculator with modified inputs and returns within the same session, THEN THE Calculation_Hub SHALL restore the previously entered input values.

### Requirement 3: Calculation Engine Architecture

**User Story:** As a developer, I want calculators implemented as pure functions with deterministic output, so that they are independently testable and produce reproducible results for audit purposes.

#### Acceptance Criteria

1. THE Calculator_Engine for each calculator SHALL be implemented as a pure TypeScript function that takes a single typed input object (matching the Input_Schema) and returns a typed output object containing all computed values, intermediate results, pass/fail status, and derivation steps.
2. THE Calculator_Engine SHALL produce deterministic output for identical input — the same input object SHALL always yield byte-identical JSON output regardless of execution environment or timing.
3. THE Calculator_Engine SHALL NOT perform any I/O operations, access global state, generate random values, or depend on system time.
4. THE Calculator_Engine SHALL compute all intermediate values required for the derivation display, storing them in the output object alongside final results.
5. WHEN a calculation result exceeds a code-defined capacity or limit, THE Calculator_Engine SHALL set the Pass_Fail_Status to "fail" and include the utilisation ratio in the output.
6. WHEN a calculation result is within 90-100% of a code-defined capacity or limit, THE Calculator_Engine SHALL set the Pass_Fail_Status to "warning" and include the utilisation ratio in the output.
7. WHEN a calculation result is below 90% of a code-defined capacity or limit, THE Calculator_Engine SHALL set the Pass_Fail_Status to "pass" and include the utilisation ratio in the output.
8. THE Calculator_Engine output SHALL include a `sansReferences` array containing the specific SANS clause numbers consulted for each calculation step (e.g., "SANS 10162-1 §13.5", "SANS 10100-1 §4.3.3").

### Requirement 4: Results Display and Derivation

**User Story:** As an engineer, I want to see calculation results with pass/fail status and a step-by-step derivation, so that I can verify the calculation logic and reference the applicable SANS clauses.

#### Acceptance Criteria

1. WHEN the Calculate button is clicked and all inputs are valid, THE Calculation_Hub SHALL execute the Calculator_Engine, display the Pass_Fail_Status indicator, and render the results panel within 500ms.
2. THE Calculation_Hub SHALL display the Pass_Fail_Status as a coloured badge: green "PASS" for pass, red "FAIL" for fail, amber "WARNING" for warning.
3. THE Calculation_Hub SHALL render result values in a labelled list format showing the result name, computed value, and unit for each output field.
4. THE Calculation_Hub SHALL display utilisation ratios as percentage values with colour coding (green ≤90%, amber 90-100%, red >100%).
5. THE Calculation_Hub SHALL render the Derivation_Display as a formatted code block showing each calculation step on its own line, including the formula, substituted values, and computed result, using monospace font (JetBrains Mono).
6. THE Derivation_Display SHALL highlight SANS clause references with the primary colour (#aeefe3) and prefix each referenced step with the clause number.
7. WHEN a calculation fails (Pass_Fail_Status is "fail"), THE Derivation_Display SHALL indicate the failing step with a cross mark (✗) and highlight the exceeded limit.
8. THE Calculation_Hub SHALL display the results panel and input panel side-by-side in a two-column grid layout on viewports wider than 900px, and stack them vertically on narrower viewports.

### Requirement 5: Calculator Run Persistence

**User Story:** As an engineer, I want my calculation runs saved automatically, so that I can review previous calculations, restore inputs, and demonstrate compliance history.

#### Acceptance Criteria

1. WHEN a calculation completes, THE Calculation_Hub SHALL persist a Calculator_Run record containing the calculator definition ID, user ID, user role, input object, output object, creation timestamp, and version number.
2. THE Calculator_Run record SHALL conform to the existing `StandaloneToolRun` interface, populating `toolId` with the calculator's registry ID, `category` with "compliance", and `calculatorDefinitionId` with the calculator's definition ID.
3. WHEN a user views the Run_History panel, THE Calculation_Hub SHALL display previous runs ordered by creation date descending, showing the calculator name, date, pass/fail badge, and a summary of key input/output values.
4. WHEN a user clicks a historical run entry, THE Calculation_Hub SHALL restore the run's input values into the calculator form and display the run's output in the results panel.
5. THE Calculation_Hub SHALL support filtering Run_History by discipline group, pass/fail status, and date range.
6. WHEN a user restores a historical run and modifies inputs, THE Calculation_Hub SHALL create a new run record with `previousRunId` linking to the restored run, preserving the lineage chain.
7. IF persistence fails due to a network or service error, THEN THE Calculation_Hub SHALL display a non-blocking warning to the user and retain the run data in local state for retry.

### Requirement 6: PDF Export

**User Story:** As an engineer, I want to export a professional calculation sheet as PDF, so that I can include it in design reports and compliance submissions.

#### Acceptance Criteria

1. WHEN a user clicks the Export PDF button after a successful calculation, THE Calculation_Hub SHALL generate a PDF document containing: project name, calculator title, SANS reference, date, engineer name and role, all input values with labels and units, all output values with labels and units, the full derivation display, pass/fail status, and the advisory disclaimer.
2. THE PDF_Export SHALL use A4 page size, include the Architex logo, and format the derivation steps in monospace font matching the on-screen display.
3. THE PDF_Export SHALL include the advisory disclaimer: "Advisory Only: These calculations are provided for preliminary design purposes. All results must be verified by a qualified Professional Engineer (Pr.Eng) registered with ECSA."
4. WHEN the PDF is generated, THE Calculation_Hub SHALL update the Calculator_Run record with `exportedAt` timestamp and `exportFormat` set to "pdf".
5. THE PDF_Export SHALL include a unique run reference number (the `runId`) in the document footer for traceability.
6. IF the user has assigned the run to a project, THEN THE PDF_Export SHALL include the project name and job reference in the document header.

### Requirement 7: Project Assignment and Platform Integration

**User Story:** As an engineer, I want to assign calculation results to a project, so that they appear as compliance evidence in Project Passport and can be pushed to SpecForge as spec items.

#### Acceptance Criteria

1. WHEN a user clicks "Assign to Project" on a completed run, THE Calculation_Hub SHALL display a project selection interface and persist the assignment by updating the Calculator_Run's `assignedToProject` and `assignedToJobRef` fields.
2. WHEN a run is assigned to a project, THE Calculation_Hub SHALL write a compliance evidence record to Project_Passport containing the calculator name, pass/fail status, key result summary, SANS references, run ID, and timestamp.
3. WHEN a user clicks "Push to SpecForge", THE Calculation_Hub SHALL create a spec item in SpecForge containing the calculator name as title, the result summary as description, SANS references as clause tags, and the run ID as a source reference.
4. WHEN any calculator run is created, THE Audit_Trail SHALL receive an audit event with action "calculator_run_created", the calculator definition ID, user identity, project ID (if assigned), and ISO 8601 timestamp.
5. WHEN a run is assigned to a project, THE Audit_Trail SHALL receive an audit event with action "calculator_run_assigned", the run ID, target project ID, and user identity.
6. WHEN a run is exported as PDF, THE Audit_Trail SHALL receive an audit event with action "calculator_run_exported", the run ID, export format, and user identity.

### Requirement 8: Structural Steel Calculators (SANS 10162-1)

**User Story:** As a structural engineer, I want steel design calculators referencing SANS 10162-1, so that I can perform beam design, column buckling, connection, weld, and base plate checks.

#### Acceptance Criteria

1. WHEN calculating beam design, THE Calculator_Engine SHALL compute factored moment (Mu = wL²/8 for simply supported), moment resistance (Mr = φ·fy·Sx), shear resistance (Vr = φ·0.66·fy·d·tw), and midspan deflection (δ = 5wL⁴/384EI), applying φ = 0.9 per SANS 10162-1 §13.5.
2. WHEN calculating column buckling, THE Calculator_Engine SHALL compute slenderness ratio (KL/r), Euler stress (Fe = π²E/λ²), non-dimensional slenderness (λn = √(fy/Fe)), and factored compressive resistance using the SANS 10162-1 §13.3 column curve with n = 1.34 for hot-rolled W-shapes.
3. WHEN calculating bolted connections, THE Calculator_Engine SHALL compute bolt shear capacity, bearing capacity, and block shear resistance per SANS 10162-1 §13.11, applying the appropriate resistance factors.
4. WHEN calculating weld capacity, THE Calculator_Engine SHALL compute fillet weld shear resistance and combined stress checks per SANS 10162-1 §13.13, using Xu = 480 MPa for E70XX electrodes.
5. WHEN calculating base plate design, THE Calculator_Engine SHALL compute required plate thickness based on bearing pressure, effective area, and yield line theory per SANS 10162-1.
6. WHEN the Profile Comparator is used, THE Calculator_Engine SHALL accept multiple section selections and return a comparison table of section properties (A, Ix, Zx, Sx, d, bf, tf, tw, mass) for side-by-side evaluation.

### Requirement 9: Structural Concrete Calculators (SANS 10100-1)

**User Story:** As a structural engineer, I want concrete design calculators referencing SANS 10100-1, so that I can perform beam, slab, column, anchorage, crack width, and minimum reinforcement checks.

#### Acceptance Criteria

1. WHEN calculating concrete beam design, THE Calculator_Engine SHALL compute ultimate moment capacity (Mu = 0.87·fy·As·z), neutral axis depth, lever arm (z), required reinforcement area, and shear capacity per SANS 10100-1 §4.3.3.
2. WHEN calculating slab design, THE Calculator_Engine SHALL support one-way and two-way spanning slabs, computing bending moments using BS/SANS coefficient tables, required reinforcement, and deflection check via span/effective depth ratio.
3. WHEN calculating column design, THE Calculator_Engine SHALL classify columns as short or slender based on effective length ratio, compute axial and moment interaction per SANS 10100-1 §4.7, and determine required longitudinal reinforcement.
4. WHEN calculating anchorage and lap lengths, THE Calculator_Engine SHALL compute basic anchorage length, design anchorage length with applicable modifiers (cover, confinement, bar spacing), and lap length per SANS 10100-1 §5.8.
5. WHEN calculating crack width, THE Calculator_Engine SHALL compute design crack width using the acr method (w = 3·acr·εm / (1 + 2(acr - cmin)/(h - x))) per SANS 10100-1 §3.8.
6. WHEN calculating minimum reinforcement, THE Calculator_Engine SHALL determine minimum steel area based on section type (beam, slab, column), concrete grade, and steel grade per SANS 10100-1 Table 13.

### Requirement 10: Structural Timber Calculators (SANS 10163-1)

**User Story:** As a structural engineer, I want timber design calculators referencing SANS 10163-1, so that I can check timber beam bending, compression members, and connections.

#### Acceptance Criteria

1. WHEN calculating timber beam design, THE Calculator_Engine SHALL compute bending stress, shear stress, deflection, and bearing stress, applying duration-of-load factors and size factors per SANS 10163-1.
2. WHEN calculating compression members, THE Calculator_Engine SHALL compute effective slenderness, determine the appropriate buckling curve, and calculate compressive resistance per SANS 10163-1.
3. WHEN calculating timber connections, THE Calculator_Engine SHALL compute bolt and nail capacities for single-shear and double-shear configurations, considering minimum spacings and edge distances per SANS 10163-1.

### Requirement 11: Geotechnical Calculators

**User Story:** As a geotechnical engineer, I want bearing capacity, footing, retaining wall, and pile calculators, so that I can perform foundation design checks.

#### Acceptance Criteria

1. WHEN calculating bearing capacity, THE Calculator_Engine SHALL compute ultimate bearing capacity using both Terzaghi and Meyerhof methods, applying appropriate bearing capacity factors (Nc, Nq, Nγ) based on friction angle, and divide by a factor of safety to obtain allowable bearing pressure.
2. WHEN calculating pad footing design, THE Calculator_Engine SHALL compute required footing area from allowable bearing pressure, check punching shear, flexural capacity, and determine reinforcement requirements.
3. WHEN calculating retaining wall stability, THE Calculator_Engine SHALL compute active and passive earth pressures (Rankine or Coulomb), check overturning safety factor (≥2.0), sliding safety factor (≥1.5), and bearing pressure distribution.
4. WHEN calculating pile capacity, THE Calculator_Engine SHALL compute end-bearing and shaft friction components, applying appropriate reduction factors, and determine allowable pile load.

### Requirement 12: Civil Loading Calculators (SANS 10160)

**User Story:** As a structural engineer, I want loading calculators referencing SANS 10160, so that I can generate wind loads, seismic loads, and load combinations for South African conditions.

#### Acceptance Criteria

1. WHEN generating wind loads, THE Calculator_Engine SHALL compute basic wind speed, terrain category factors, topography factor, peak wind pressure, and external/internal pressure coefficients per SANS 10160-3, producing factored pressures in kPa.
2. WHEN calculating seismic loads, THE Calculator_Engine SHALL compute seismic base shear using the equivalent lateral force method per SANS 10160-4, including ground type classification, behaviour factor, and vertical distribution of forces.
3. WHEN generating load combinations, THE Calculator_Engine SHALL produce all applicable ULS and SLS combinations per SANS 10160-1 Table 3, applying partial load factors (γ values: 1.2DL + 1.6LL, 1.2DL + 1.3WL + 0.5LL, etc.).
4. WHEN looking up imposed loads, THE Calculator_Engine SHALL return the applicable imposed load values in kPa for the selected occupancy category per SANS 10160-2 Table 1 (e.g., residential 1.5 kPa, office 2.5 kPa, retail 5.0 kPa).

### Requirement 13: Civil Stormwater Calculators

**User Story:** As a civil engineer, I want stormwater calculators, so that I can size drainage infrastructure using the rational method and Manning's equation.

#### Acceptance Criteria

1. WHEN calculating the rational method, THE Calculator_Engine SHALL compute peak runoff (Q = C·I·A/3.6) given the runoff coefficient, rainfall intensity in mm/h, and catchment area in hectares, returning flow in m³/s.
2. WHEN sizing pipes, THE Calculator_Engine SHALL solve Manning's equation (Q = (1/n)·A·R^(2/3)·S^(1/2)) for the required pipe diameter given flow, slope, and roughness coefficient, returning the next standard pipe diameter.
3. WHEN sizing attenuation tanks, THE Calculator_Engine SHALL compute required storage volume based on inflow hydrograph (pre-development vs post-development peak) and allowable outflow rate, using the simplified triangular hydrograph method.

### Requirement 14: Mechanical HVAC Calculators

**User Story:** As a mechanical engineer, I want HVAC calculators, so that I can size ductwork, pipework, and calculate heating/cooling loads.

#### Acceptance Criteria

1. WHEN sizing round or rectangular ducts, THE Calculator_Engine SHALL compute duct dimensions for a given airflow rate and velocity limit, calculate pressure drop per metre using the Darcy-Weisbach or equal-friction method, and return equivalent round diameter for rectangular ducts.
2. WHEN sizing chilled water pipes, THE Calculator_Engine SHALL compute required pipe diameter for a given cooling load and temperature differential (typically ΔT = 5°C), using maximum velocity limits of 1.5-3.0 m/s.
3. WHEN calculating fan selection, THE Calculator_Engine SHALL compute required fan pressure from system resistance, fan power (P = Q·Δp/η), and motor size including drive losses.
4. WHEN calculating heat gain, THE Calculator_Engine SHALL compute sensible and latent heat gains from walls, roof, glazing, occupants, lighting, and equipment, producing a total cooling load in kW.
5. WHEN calculating heat loss, THE Calculator_Engine SHALL compute fabric heat loss (ΣU·A·ΔT), ventilation heat loss, and total heating load in kW.

### Requirement 15: Fire Engineering Calculators (SANS 10400-T)

**User Story:** As a fire engineer, I want fire safety calculators referencing SANS 10400-T, so that I can check travel distances, exit widths, occupant loads, fire ratings, and fire water requirements.

#### Acceptance Criteria

1. WHEN checking travel distance, THE Calculator_Engine SHALL compare the measured travel distance against the maximum allowable travel distance for the building classification per SANS 10400-T Table 1, returning pass/fail status.
2. WHEN calculating exit width, THE Calculator_Engine SHALL compute minimum required exit width from occupant load divided by exit capacity factor (typically 5mm per person), ensuring minimum 850mm clear width per leaf.
3. WHEN calculating occupant load, THE Calculator_Engine SHALL compute the maximum occupant load by dividing the floor area by the occupancy density factor for the building use classification per SANS 10400-T Table 3.
4. WHEN checking fire resistance rating, THE Calculator_Engine SHALL return the required fire resistance period in minutes for structural elements, compartment walls, and floors based on building type, height, and occupancy classification per SANS 10400-T Table 5.
5. WHEN calculating fire flow rate, THE Calculator_Engine SHALL compute required fire water flow from building area, occupancy type, and construction type, returning flow in litres/second.
6. WHEN checking hydrant spacing, THE Calculator_Engine SHALL compute maximum permissible spacing between hydrants based on risk category and verify against the provided spacing value.
7. WHEN sizing fire pumps, THE Calculator_Engine SHALL compute required pump duty (flow and pressure) based on system demand, friction losses, and elevation head.

### Requirement 16: Electrical Calculators (SANS 10142)

**User Story:** As an electrical engineer, I want cable sizing and maximum demand calculators referencing SANS 10142, so that I can size cables, check voltage drop, and calculate distribution board capacities.

#### Acceptance Criteria

1. WHEN sizing cables, THE Calculator_Engine SHALL determine minimum cable cross-section from current-carrying capacity (considering installation method, grouping, and ambient temperature derating per SANS 10142-1), then verify voltage drop compliance.
2. WHEN checking voltage drop, THE Calculator_Engine SHALL compute percentage voltage drop (Vd = I·L·(R·cosφ + X·sinφ)/1000) and verify it does not exceed the allowable limit (typically 5% from source to load per SANS 10142-1).
3. WHEN calculating short circuit current, THE Calculator_Engine SHALL compute prospective fault current at the point of installation using the supply impedance method, for cable protection device verification.
4. WHEN calculating maximum demand, THE Calculator_Engine SHALL compute total maximum demand by summing connected loads with diversity factors per SANS 10142-1 Table 1, and determine the required distribution board rating.

### Requirement 17: Wet Services Calculators (SANS 10252-1)

**User Story:** As a wet services engineer, I want plumbing calculators referencing SANS 10252-1, so that I can size water pipes, drainage, vents, and hot water systems.

#### Acceptance Criteria

1. WHEN sizing cold water pipes, THE Calculator_Engine SHALL compute probable simultaneous demand from loading units, determine required pipe diameter for the permissible velocity (typically 2.0 m/s maximum), and check minimum residual pressure at highest draw-off point.
2. WHEN sizing hot water pipes, THE Calculator_Engine SHALL compute required diameter considering temperature-adjusted velocity limits and dead leg volume constraints.
3. WHEN calculating pressure drop, THE Calculator_Engine SHALL apply the Hazen-Williams formula (Pd = 10.67·Q^1.85 / (C^1.85·D^4.87)·L) to determine friction losses in pipe runs.
4. WHEN converting fixture units to drainage pipe sizing, THE Calculator_Engine SHALL sum fixture unit values per SANS 10252-1 Table 4, apply Manning's equation for partially filled pipes at the design gradient, and return the required drain diameter.
5. WHEN sizing drain pipes, THE Calculator_Engine SHALL solve Manning's equation for partially filled circular pipes at the specified gradient (typically 1:60 for 100mm, 1:40 for 150mm).
6. WHEN sizing vents, THE Calculator_Engine SHALL determine vent pipe diameter from the total fixture units connected and the developed length of the vent per SANS 10252-1 Table 8.
7. WHEN sizing geysers/storage vessels, THE Calculator_Engine SHALL compute required storage volume from number of occupants, peak demand factor, and recovery rate.
8. WHEN calculating solar pre-heat systems, THE Calculator_Engine SHALL compute collector area from hot water demand, solar irradiation for the given location, and collector efficiency, determining the solar fraction achieved.
9. WHEN sizing circulation return systems, THE Calculator_Engine SHALL compute heat loss from pipe runs and determine circulation pump duty to maintain minimum temperature at draw-off points.

### Requirement 18: Utility Calculators

**User Story:** As an engineer, I want unit conversion, material lookup, and section property calculators, so that I can quickly convert units, look up material properties, and calculate section properties for custom shapes.

#### Acceptance Criteria

1. THE Calculator_Engine SHALL support at minimum 18 unit conversion categories including length (mm/m/km/ft/in), area (mm²/m²/ft²), volume (L/m³/gal), mass (kg/tonne/lb), force (N/kN/kgf/lbf), pressure (Pa/kPa/MPa/psi/bar), moment (Nm/kNm), velocity (m/s/km/h), flow (L/s/m³/h/gpm), temperature (°C/°F/K), density (kg/m³/kN/m³), and power (W/kW/hp).
2. THE Calculator_Engine SHALL provide a material density lookup returning density values for at minimum 20 common construction materials including structural steel (7850 kg/m³), reinforced concrete (2500 kg/m³), timber (pine 500, hardwood 900 kg/m³), water (1000 kg/m³), glass (2500 kg/m³), and masonry (1800-2200 kg/m³).
3. WHEN calculating section properties, THE Calculator_Engine SHALL compute area (A), second moment of area (Ix, Iy), section modulus (Zx, Zy), plastic modulus (Sx, Sy), radius of gyration (rx, ry), and centroid position for rectangular, circular, I-shaped, T-shaped, and L-shaped cross sections from user-defined dimensions.

### Requirement 19: Tool Registration and Role Access

**User Story:** As a platform developer, I want the Calculator Hub registered in the standalone tool registry with proper role access, so that it appears correctly in the Compliance Hub navigation and respects role-based visibility.

#### Acceptance Criteria

1. THE Calculation_Hub SHALL be registered in `STANDALONE_TOOL_REGISTRY` with `id` of "engineers_calc_hub", `category` of "compliance", `route` of "standalone/engineers-calc-hub", `canExport` true, `canAssignToProject` true, and a valid `calculatorDefinitionId`.
2. THE Calculation_Hub SHALL have its `roles` array set to: engineer, architect, bep, energy_professional, fire_engineer, quantity_surveyor, site_manager.
3. WHEN a user whose role is not in the Calculator Hub's roles array attempts to navigate to the calculator route, THE Calculation_Hub SHALL display an access-denied message and prevent rendering of any calculator interface.
4. THE Calculation_Hub SHALL register each individual calculator as a separate `CalculatorDefinition` with its own definition ID, input schema, output schema, SANS reference list, and engine function reference.
5. WHEN the tool registry is queried for compliance tools, THE Calculation_Hub's registry entry SHALL be returned alongside existing compliance calculators (fenestration, R-value).

