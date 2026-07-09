# Requirements Document

## Introduction

This document specifies the BIM/IFC Quantity Extraction Bridge — a service within the Architex Built Environment OS that parses Industry Foundation Classes (IFC) building model files, extracts measurable quantities from BIM elements, and maps those quantities to Bills of Quantities (BoQ) and Bills of Materials (BoM) line items. The bridge connects BIM model data into the platform's procurement and quantity surveying workflows, feeding extracted data into SpecForge specification items, tender/RFQ packages, and QS cost management processes. The service supports South African measurement conventions including JBCC and the ASAQS Standard System of Measuring Building Work.

## Glossary

- **IFC_Parser**: The service module responsible for reading, validating, and parsing IFC (Industry Foundation Classes) files in versions IFC2x3, IFC4, and IFC4.3 into an in-memory structured representation.
- **Quantity_Extractor**: The service module responsible for traversing parsed IFC model elements and extracting measurable quantities (area, volume, length, count, weight) from IfcQuantitySet definitions and computed geometry.
- **Mapping_Engine**: The rules engine that maps extracted IFC element types and their classifications to BoQ trade sections and line item categories following ASAQS Standard System conventions.
- **BoQ_Generator**: The service module that assembles extracted and mapped quantities into structured Bills of Quantities documents conforming to JBCC and ASAQS formats.
- **Model_Validator**: The service module that checks parsed IFC models for completeness — identifying missing quantity sets, incomplete classifications, unclassified elements, and data quality issues.
- **IFC_Element**: A building element entity within an IFC model (e.g., IfcWall, IfcSlab, IfcColumn, IfcDoor, IfcWindow, IfcBeam, IfcMember, IfcPipe, IfcDuct).
- **Quantity_Set**: An IFC property set (IfcElementQuantity) containing one or more quantity values (IfcQuantityArea, IfcQuantityVolume, IfcQuantityLength, IfcQuantityCount, IfcQuantityWeight) associated with an IFC_Element.
- **Property_Set**: An IFC property set (Pset_*) containing material properties, fire ratings, acoustic ratings, and other metadata associated with an IFC_Element.
- **Trade_Section**: A category in the ASAQS Standard System of Measuring Building Work representing a trade discipline (e.g., Earthworks, Concrete, Masonry, Waterproofing, Roofing, Glazing, Plumbing, Electrical).
- **Mapping_Rule**: A configuration record that defines how a specific IFC entity type and classification code maps to a Trade_Section and measurement unit.
- **Extraction_Result**: The output data structure containing all extracted quantities, their source elements, applied mapping rules, and validation findings for a single IFC model.
- **Project_Passport**: The central project health card service within Architex that aggregates project state from all platform modules.
- **SpecForge**: The specification management spine of Architex where extracted quantities become specification line items.
- **Document_Register**: The platform service managing uploaded files, drawings, and model documents with revision tracking.
- **ASAQS**: Association of South African Quantity Surveyors — the professional body governing measurement standards.
- **JBCC**: Joint Building Contracts Committee — the standard form of building contract and associated BoQ format used in South Africa.

## Requirements

### Requirement 1: IFC File Upload and Parsing

**User Story:** As a quantity surveyor, I want to upload IFC files from BIM authoring tools, so that the platform can extract quantity data from the building model without manual re-entry.

#### Acceptance Criteria

1. WHEN an authenticated user uploads a file with extension `.ifc` through the upload endpoint, THE IFC_Parser SHALL accept the file and initiate parsing within 2 seconds of upload completion.
2. THE IFC_Parser SHALL support parsing of IFC schema versions IFC2x3, IFC4, and IFC4.3, detecting the schema version from the FILE_SCHEMA header in the IFC file.
3. WHEN an IFC file is successfully parsed, THE IFC_Parser SHALL produce a structured representation containing all IfcProduct entities, their associated IfcElementQuantity sets, Pset_* property sets, and spatial containment hierarchy (IfcSite → IfcBuilding → IfcBuildingStorey → elements).
4. IF an uploaded file does not conform to a supported IFC schema version or contains malformed STEP syntax, THEN THE IFC_Parser SHALL reject the file with a descriptive error indicating the parsing failure reason and the line number where parsing failed (when determinable).
5. WHEN an IFC file exceeds 500MB in size, THE IFC_Parser SHALL reject the upload with an error indicating the maximum file size has been exceeded.
6. WHEN an IFC file is successfully parsed, THE IFC_Parser SHALL record the file reference in the Document_Register with document type "BIM Model", the detected schema version, and a link to the stored file in Vercel Blob.
7. IF the IFC file contains no IfcProduct entities, THEN THE IFC_Parser SHALL return a successful parse result with an empty element list and a validation warning indicating the model contains no extractable building elements.

### Requirement 2: Element Classification and Recognition

**User Story:** As a quantity surveyor, I want the system to recognise and classify all standard BIM element types, so that quantities can be correctly categorised by trade and element function.

#### Acceptance Criteria

1. THE IFC_Parser SHALL recognise and classify the following IFC entity types: IfcWall, IfcWallStandardCase, IfcSlab, IfcColumn, IfcBeam, IfcDoor, IfcWindow, IfcRoof, IfcStair, IfcRailing, IfcCurtainWall, IfcPlate, IfcMember, IfcPile, IfcFooting, IfcCovering, IfcBuildingElementProxy.
2. THE IFC_Parser SHALL recognise and classify MEP (Mechanical, Electrical, Plumbing) entity types: IfcPipeSegment, IfcPipeFitting, IfcDuctSegment, IfcDuctFitting, IfcCableSegment, IfcCableFitting, IfcFlowTerminal, IfcEnergyConversionDevice, IfcFlowController, IfcFlowStorageDevice.
3. WHEN an element has an IfcClassificationReference assigned (Uniclass, OmniClass, or custom classification), THE IFC_Parser SHALL extract the classification system name, classification code, and classification description and include them in the element's metadata.
4. WHEN an element has material layer information (IfcMaterialLayerSetUsage or IfcMaterialConstituentSet), THE IFC_Parser SHALL extract each material name, layer thickness (in millimetres), and material category.
5. IF an element has entity type IfcBuildingElementProxy with no classification reference, THEN THE IFC_Parser SHALL flag the element as "unclassified" in the extraction result with a validation warning recommending manual classification.
6. WHEN an element has a PredefinedType attribute, THE IFC_Parser SHALL include the predefined type value in the element metadata to distinguish sub-types (e.g., IfcWall with PredefinedType PARTITIONING versus SHEAR).

### Requirement 3: Quantity Extraction from Elements

**User Story:** As a quantity surveyor, I want volumes, areas, lengths, counts, and weights extracted from BIM elements automatically, so that I do not need to manually measure drawings or re-enter values from the model.

#### Acceptance Criteria

1. WHEN an IFC_Element has an associated IfcElementQuantity set, THE Quantity_Extractor SHALL extract all IfcQuantityArea values (in square metres), IfcQuantityVolume values (in cubic metres), IfcQuantityLength values (in metres), IfcQuantityCount values (as integers), and IfcQuantityWeight values (in kilograms).
2. WHEN an IFC_Element has multiple IfcElementQuantity sets (e.g., BaseQuantities and custom sets), THE Quantity_Extractor SHALL extract quantities from all sets, tagging each quantity with its originating quantity set name.
3. THE Quantity_Extractor SHALL normalise all extracted quantities to SI units: square metres for area, cubic metres for volume, metres for length, kilograms for weight, and integer counts for count quantities.
4. WHEN an IFC_Element has no IfcElementQuantity set but has geometric representation (IfcProductDefinitionShape), THE Quantity_Extractor SHALL flag the element as "missing quantities" in the validation result with severity "warning" and recommend quantity set assignment.
5. WHEN a quantity value is extracted, THE Quantity_Extractor SHALL preserve the quantity name (e.g., "NetSideArea", "GrossVolume", "Length"), the quantity type, the numeric value, and the unit as a structured record linked to its source element by GlobalId.
6. THE Quantity_Extractor SHALL extract quantities from a minimum of 10,000 elements within 30 seconds for models with pre-computed quantity sets.
7. IF a quantity value is negative or exceeds physically plausible bounds (area > 100,000 m², volume > 1,000,000 m³, length > 10,000 m, weight > 10,000,000 kg), THEN THE Quantity_Extractor SHALL flag the value as a potential data quality issue with severity "warning" in the validation result without discarding the value.

### Requirement 4: Property Set Reading

**User Story:** As an architect, I want material properties, fire ratings, and performance data extracted alongside quantities, so that specification items contain the technical metadata needed for procurement.

#### Acceptance Criteria

1. WHEN an IFC_Element has Pset_* property sets, THE Quantity_Extractor SHALL extract all properties within each set, preserving property name, value, and unit for each property.
2. THE Quantity_Extractor SHALL specifically recognise and tag the following property sets for downstream use: Pset_WallCommon, Pset_SlabCommon, Pset_ColumnCommon, Pset_DoorCommon, Pset_WindowCommon, Pset_BeamCommon, Pset_RoofCommon, Pset_CoveringCommon.
3. WHEN a recognised property set contains a FireRating property, THE Quantity_Extractor SHALL extract the fire rating value and include it as a tagged metadata field on the element record with key "fireRating".
4. WHEN a recognised property set contains an AcousticRating property, THE Quantity_Extractor SHALL extract the acoustic rating value and include it as a tagged metadata field on the element record with key "acousticRating".
5. WHEN a recognised property set contains a ThermalTransmittance (U-value) property, THE Quantity_Extractor SHALL extract the value in W/(m²·K) and include it as a tagged metadata field on the element record with key "thermalTransmittance".
6. IF a property value cannot be parsed to its expected data type (e.g., a numeric field contains non-numeric text), THEN THE Quantity_Extractor SHALL record the raw string value, flag the property as "parse_warning" in the validation result, and continue processing without aborting.

### Requirement 5: Mapping Rules Engine — IFC to BoQ Trade Sections

**User Story:** As a quantity surveyor, I want IFC element types automatically mapped to ASAQS trade sections, so that extracted quantities are organised into a recognisable BoQ structure without manual sorting.

#### Acceptance Criteria

1. THE Mapping_Engine SHALL maintain a configurable set of Mapping_Rules that define the relationship between IFC entity types (and optionally PredefinedType and classification codes) and ASAQS Trade_Sections.
2. WHEN the Quantity_Extractor produces an Extraction_Result, THE Mapping_Engine SHALL apply Mapping_Rules to each extracted element, assigning it to a Trade_Section and measurement unit based on the element's IFC type, PredefinedType, and classification code.
3. THE Mapping_Engine SHALL provide default Mapping_Rules for the standard ASAQS trade sections: Earthworks, Concrete, Formwork, Reinforcement, Masonry, Waterproofing, Roofwork, Carpentry and Joinery, Ceilings and Partitions, Floor Coverings, Glazing, Ironmongery, Plumbing and Drainage, Electrical, Painting.
4. WHEN a Mapping_Rule matches an element, THE Mapping_Engine SHALL assign the primary measurement unit defined in the rule (m², m³, m, nr, kg, item) and the trade section code.
5. IF no Mapping_Rule matches an element's IFC type and classification combination, THEN THE Mapping_Engine SHALL assign the element to an "Unclassified" trade section and flag it for manual mapping with a validation warning.
6. WHEN multiple Mapping_Rules could match an element (e.g., by type alone and by type+classification), THE Mapping_Engine SHALL apply the most specific rule (type+predefinedType+classification > type+predefinedType > type+classification > type only).
7. THE Mapping_Engine SHALL allow users with the "quantity_surveyor" or "admin" role to create, update, and delete custom Mapping_Rules scoped to a project or firm.
8. WHEN a custom Mapping_Rule exists for the active project or firm that conflicts with a default rule, THE Mapping_Engine SHALL apply the custom rule with precedence over the default rule.

### Requirement 6: BoQ Generation and Export

**User Story:** As a quantity surveyor, I want to generate a structured Bill of Quantities from extracted model data, so that I can issue it for tender or use it in cost planning within the JBCC framework.

#### Acceptance Criteria

1. WHEN the Mapping_Engine has assigned all elements to Trade_Sections, THE BoQ_Generator SHALL produce a structured BoQ document containing trade sections, each with line items grouped by element type and measurement unit.
2. THE BoQ_Generator SHALL aggregate quantities for identical line items (same trade section, element type, material, and measurement unit) by summing their numeric values and listing individual element GlobalIds as source references.
3. WHEN generating a BoQ line item, THE BoQ_Generator SHALL include: item number (sequential within section), description (derived from element type, material, and dimensions), unit of measurement, quantity value (rounded to 2 decimal places), and source element count.
4. THE BoQ_Generator SHALL format the BoQ according to JBCC Appendix conventions with trade section numbering, sub-section grouping, and measurement descriptions following ASAQS Standard System wording patterns.
5. WHEN a user requests export, THE BoQ_Generator SHALL support export to CSV format with columns: Section, Item No, Description, Unit, Quantity, Rate (blank), Amount (blank).
6. WHEN a user requests export, THE BoQ_Generator SHALL support export to Excel (.xlsx) format with formatted headers, trade section groupings, subtotal rows per section, and a grand total row.
7. WHEN a user requests export, THE BoQ_Generator SHALL support export to a structured JSON format containing the full BoQ hierarchy with metadata for programmatic consumption by other platform services.
8. IF the extraction result contains elements flagged as "unclassified" or "missing quantities", THEN THE BoQ_Generator SHALL include a summary section at the end of the BoQ listing all flagged elements with their GlobalId, element type, and the specific validation warning.

### Requirement 7: Model Validation and Quality Reporting

**User Story:** As a quantity surveyor, I want the system to identify incomplete or problematic BIM data before I issue a BoQ, so that I can request corrections from the design team or manually resolve gaps.

#### Acceptance Criteria

1. WHEN an IFC model is parsed, THE Model_Validator SHALL produce a validation report containing findings categorised by severity: "error" (blocks BoQ generation), "warning" (allows generation with caveats), and "info" (advisory only).
2. THE Model_Validator SHALL identify and report elements that have geometric representation but no IfcElementQuantity set as severity "warning" with finding type "missing_quantities".
3. THE Model_Validator SHALL identify and report elements with entity type IfcBuildingElementProxy that have no IfcClassificationReference as severity "warning" with finding type "unclassified_element".
4. THE Model_Validator SHALL identify and report elements that have no material assignment (no IfcMaterialLayerSetUsage, IfcMaterialConstituentSet, or IfcMaterial association) as severity "info" with finding type "missing_material".
5. THE Model_Validator SHALL identify and report duplicate GlobalId values within the model as severity "error" with finding type "duplicate_globalid".
6. THE Model_Validator SHALL report summary statistics: total element count, count by IFC entity type, count with quantities, count without quantities, count unclassified, count by trade section after mapping.
7. WHEN the validation report contains one or more "error" severity findings, THE Model_Validator SHALL indicate that BoQ generation is blocked and list the specific errors that must be resolved.
8. IF the model contains zero elements with extractable quantities (all elements lack quantity sets), THEN THE Model_Validator SHALL produce a single "error" finding indicating the model has no extractable quantity data and BoQ generation cannot proceed.

### Requirement 8: SpecForge Integration

**User Story:** As an architect, I want extracted quantities to feed into SpecForge specification items, so that procurement packages have accurate quantity data linked to the BIM model.

#### Acceptance Criteria

1. WHEN a BoQ is generated for a project that has an active SpecForge workspace, THE BoQ_Generator SHALL offer to create SpecForge specification items from BoQ line items, one spec item per BoQ line item.
2. WHEN creating a SpecForge item from a BoQ line item, THE BoQ_Generator SHALL populate the spec item with: title (from BoQ description), quantity (from BoQ value), unit (from BoQ measurement unit), trade section reference, and source element GlobalIds as metadata.
3. WHEN creating SpecForge items, THE BoQ_Generator SHALL assign each item to the SpecForge section that corresponds to the BoQ trade section, creating the section if it does not exist in the workspace.
4. WHEN a SpecForge item has been created from a BoQ line item, THE BoQ_Generator SHALL store the link between the spec item ID and the source BoQ line item ID so that quantity updates can be propagated.
5. WHEN an IFC model is re-uploaded and re-extracted for a project, THE BoQ_Generator SHALL identify SpecForge items linked to the previous extraction and present a comparison showing added, removed, and changed quantities.
6. IF a linked SpecForge item has been manually edited (quantity overridden by user), THEN THE BoQ_Generator SHALL flag the discrepancy between model quantity and user-edited quantity without overwriting the user edit.

### Requirement 9: Procurement and Tender Feed

**User Story:** As a procurement manager, I want extracted BoQ data to feed directly into RFQ/tender packages, so that suppliers receive accurate scope quantities without manual transcription.

#### Acceptance Criteria

1. WHEN a BoQ has been generated for a project, THE BoQ_Generator SHALL allow export of selected trade sections as procurement packages, each containing the line items, quantities, and measurement units for that section.
2. WHEN a procurement package is created from BoQ trade sections, THE BoQ_Generator SHALL format the package with supplier-facing descriptions that exclude internal model references (GlobalIds, IFC entity types) and present only human-readable descriptions, quantities, and units.
3. WHEN a procurement package is exported, THE BoQ_Generator SHALL include a cover sheet with: project name, project number, package title (trade section name), issue date, revision number, and QS contact details from the project team record.
4. THE BoQ_Generator SHALL allow a user with "quantity_surveyor" or "admin" role to select which BoQ line items to include in a procurement package, supporting partial trade section selection.
5. WHEN a procurement package is issued, THE BoQ_Generator SHALL record the issuance event in the project audit trail with package ID, recipient count, and issue timestamp.
6. IF a procurement package references BoQ line items whose source model has been superseded by a newer upload, THEN THE BoQ_Generator SHALL display a warning indicating the quantities may be outdated and reference the newer model version.

### Requirement 10: Role-Based Access Control

**User Story:** As a platform administrator, I want BIM/IFC quantity extraction features gated by role, so that only authorised team members can upload models, extract quantities, and generate BoQs.

#### Acceptance Criteria

1. THE IFC_Parser SHALL permit file upload and parsing initiation only for users with roles: quantity_surveyor, architect, engineer, contractor, or admin.
2. THE Quantity_Extractor SHALL permit quantity extraction and BoQ generation only for users with roles: quantity_surveyor, architect, engineer, or admin.
3. THE Mapping_Engine SHALL permit creation and modification of custom Mapping_Rules only for users with roles: quantity_surveyor or admin.
4. THE BoQ_Generator SHALL permit BoQ export and procurement package creation only for users with roles: quantity_surveyor, contractor, or admin.
5. WHILE a user has role "client", THE system SHALL allow read-only access to generated BoQ documents and validation reports without permitting upload, extraction, mapping modification, or export operations.
6. WHILE a user has role "subcontractor" or "supplier", THE system SHALL allow read-only access to procurement packages where that user's firm is listed as a recipient, without access to the full BoQ or model data.
7. IF an unauthenticated request or a user without any of the permitted roles attempts an operation, THEN THE system SHALL return a 403 response with a message indicating insufficient permissions for the requested operation.

### Requirement 11: Project Passport and Audit Integration

**User Story:** As a project manager, I want BIM model extraction results reflected in the Project Passport, so that model quality and quantity extraction status are visible in the central project health card.

#### Acceptance Criteria

1. WHEN an IFC model is successfully parsed and quantities are extracted, THE Project_Passport SHALL record the extraction event containing: model filename, schema version, element count, quantity coverage percentage (elements with quantities / total elements), and extraction timestamp.
2. WHEN a BoQ is generated from extracted quantities, THE Project_Passport SHALL update the project record with: BoQ status (draft, issued, superseded), trade section count, total line item count, and generation timestamp.
3. WHEN the Model_Validator produces error-severity findings, THE Project_Passport SHALL set a risk indicator for BIM quality with category "model_quality" and severity proportional to the error count (1–3 errors: medium, 4+ errors: high).
4. WHEN any write operation occurs (upload, extraction, BoQ generation, mapping rule change, procurement package creation), THE system SHALL record an audit event containing: action type, performer identity, target resource ID, and ISO 8601 UTC timestamp.
5. WHEN a procurement package is issued from extracted BoQ data, THE Project_Passport SHALL record the package issuance under the procurement phase with package ID, trade section name, and recipient count.
6. IF a previously uploaded IFC model is superseded by a new upload for the same project, THEN THE system SHALL mark the previous model as "superseded" in the Document_Register and record the supersession event in the audit trail.

### Requirement 12: South African Measurement Context

**User Story:** As a quantity surveyor working in South Africa, I want BoQ output to follow ASAQS Standard System of Measuring Building Work conventions and JBCC formatting, so that the output is immediately usable in local tender processes.

#### Acceptance Criteria

1. THE BoQ_Generator SHALL number trade sections following the ASAQS Standard System section numbering convention (Section 1: Preliminaries, Section 2: Earthworks, Section 3: Concrete, etc.) by default for all new projects.
2. THE BoQ_Generator SHALL format line item descriptions using ASAQS measurement description patterns: element description, specification detail, and measurement qualification (e.g., "Reinforced concrete in columns, 30 MPa, exceeding 0.03 m³ but not exceeding 0.1 m³").
3. THE BoQ_Generator SHALL use South African Rand (ZAR) as the default currency for rate and amount columns in exported documents, with the currency symbol "R" preceding values.
4. WHEN generating a JBCC-format BoQ export, THE BoQ_Generator SHALL include the standard JBCC appendix structure: cover page, preambles section (trade-specific), measured work sections, provisional sums section, and summary page.
5. THE Mapping_Engine SHALL include default measurement unit assignments consistent with ASAQS conventions: concrete in m³, brickwork in m², reinforcement in kg, plumbing pipework in m, electrical conduit in m, doors and windows in nr (number).
6. WHEN a project's location is set to South Africa or no location is specified, THE BoQ_Generator SHALL apply ASAQS/JBCC formatting as the default without requiring explicit configuration.
