# Implementation Plan: BIM/IFC Quantity Extraction Bridge

## Overview

Implement the BIM/IFC Quantity Extraction Bridge as a service module within the Architex Built Environment OS. The bridge parses IFC building model files, extracts measurable quantities, maps them to ASAQS/JBCC trade sections, generates structured Bills of Quantities, and integrates with SpecForge, Project Passport, Document Register, and Procurement workflows. Implementation uses TypeScript across the full stack with `web-ifc` for WASM-based IFC parsing, Express 5 API routes, Firestore persistence, and React 19 UI components.

## Tasks

- [x] 1. Set up project structure, core types, and interfaces
  - [x] 1.1 Create BIM service directory and define core TypeScript types
    - Create `src/services/bim/` directory
    - Create `src/services/bim/types.ts` with all data model interfaces: `IfcSchemaVersion`, `IfcEntityType`, `QuantityType`, `ValidationSeverity`, `ValidationFindingType`, `ParsedIfcModel`, `SpatialNode`, `IfcElement`, `IfcClassification`, `MaterialLayer`, `ElementQuantitySet`, `ExtractedQuantity`, `PropertySet`, `PropertyValue`, `ExtractionResult`, `ValidationReport`, `ValidationFinding`, `ModelStatistics`, `MappingRule`, `MeasurementUnit`, `AsaqsTradeSection`, `RuleSpecificity`, `BoqDocument`, `BoqSection`, `BoqLineItem`, `FlaggedElementSummary`, `BoqTotals`, `ProcurementPackage`, `ProcurementLineItem`, `PackageCoverSheet`, `BoqSpecForgeLink`, `ExtractionComparison`, `QuantityChange`, `BimExtractionEvent`, `BimBoqEvent`, `BimQualityRiskIndicator`, `BimAuditAction`, `MappedElement`, `BoqGenerationOptions`, `BimErrorResponse`
    - Define constants: `RECOGNISED_PSETS`, `TAGGED_METADATA_KEYS`, role arrays (`BIM_UPLOAD_ROLES`, `BIM_EXTRACT_ROLES`, `BIM_MAPPING_ROLES`, `BIM_EXPORT_ROLES`)
    - _Requirements: 1.1–1.7, 2.1–2.6, 3.1–3.7, 5.1–5.8, 6.1–6.8, 10.1–10.7_

  - [x] 1.2 Install dependencies and configure test infrastructure
    - Install `web-ifc`, `xlsx`, `fast-check` as project dependencies
    - Create `src/services/bim/__tests__/` directory for test files
    - Create shared test utilities and fast-check arbitraries in `src/services/bim/__tests__/generators.ts` (arbIfcEntityType, arbQuantityType, arbGlobalId, arbQuantityValue, arbMaterialLayer, arbIfcElement, arbMappingRule, arbBoqDocument)
    - _Requirements: 1.2, 2.1, 3.1_

- [x] 2. Implement IFC Parser Service
  - [x] 2.1 Implement `ifcParserService.ts` — file validation and schema detection
    - Create `src/services/bim/ifcParserService.ts`
    - Implement `validateFileSize(sizeBytes)` — reject files > 500MB
    - Implement `detectSchemaVersion(buffer)` — read first 4KB for FILE_SCHEMA header, regex match IFC2X3/IFC4/IFC4X3
    - Implement file extension and STEP header validation
    - _Requirements: 1.2, 1.4, 1.5_

  - [x]* 2.2 Write property tests for schema detection and file rejection
    - **Property 1: Schema Version Detection** — for any valid FILE_SCHEMA header, detectSchemaVersion returns correct IfcSchemaVersion
    - **Property 3: Malformed File Rejection** — for any invalid STEP buffer, parseIfcFile rejects with descriptive error
    - **Validates: Requirements 1.2, 1.4**

  - [x] 2.3 Implement `ifcParserService.ts` — element parsing and spatial hierarchy
    - Implement `parseIfcFile(buffer, fileName)` — full IFC parsing using web-ifc WASM
    - Implement `extractSpatialHierarchy(api, modelId)` — build IfcSite → IfcBuilding → IfcBuildingStorey tree
    - Implement `classifyEntityType(typeString)` — classify all 27 supported structural + MEP entity types
    - Extract IfcClassificationReference (system name, code, description) per element
    - Extract material layers (IfcMaterialLayerSetUsage, IfcMaterialConstituentSet) per element
    - Extract PredefinedType attribute per element
    - Handle empty models (no IfcProduct entities) — return success with empty elements and validation warning
    - _Requirements: 1.3, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x]* 2.4 Write property tests for entity classification and metadata extraction
    - **Property 2: Parse Output Structural Completeness** — all IfcProduct entities appear in output with spatial containment, quantity sets, and property sets
    - **Property 4: Entity Type Recognition** — all 27 supported entity types classified correctly
    - **Property 5: Classification Reference Extraction** — IfcClassificationReference data preserved in parsed element
    - **Property 6: Element Metadata Extraction** — material layers and predefined type preserved
    - **Property 7: Unclassified Proxy Flagging** — IfcBuildingElementProxy without classification flagged
    - **Validates: Requirements 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

- [x] 3. Implement Quantity Extractor Service
  - [x] 3.1 Implement `quantityExtractorService.ts` — quantity and property extraction
    - Create `src/services/bim/quantityExtractorService.ts`
    - Implement `extractQuantities(model)` — walk elements in batches of 500, extract all IfcElementQuantity sets
    - Implement `normaliseToSI(value, sourceUnit, targetType)` — convert to m², m³, m, kg
    - Implement `checkQuantityBounds(value, type)` — flag negative or physically implausible values (area > 100K m², volume > 1M m³, length > 10K m, weight > 10M kg)
    - Implement `extractTaggedMetadata(propertySets)` — extract fireRating, acousticRating, thermalTransmittance from recognised Pset_* sets
    - Implement `extractMaterialLayers(api, modelId, elementExpressId)` — extract material name, thickness in mm, category
    - Handle property parse failures — preserve raw value, set parseWarning flag, continue processing
    - Preserve quantity name, type, value, unit, source GlobalId, and source set name per quantity
    - Flag elements with geometry but no IfcElementQuantity as "missing_quantities" warning
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x]* 3.2 Write property tests for quantity extraction
    - **Property 8: Quantity Set Extraction Completeness** — all quantities from all sets preserved with name, type, value, unit, GlobalId, set name
    - **Property 9: Unit Normalization** — normaliseToSI produces mathematically correct conversion
    - **Property 10: Out-of-Bounds Quantity Flagging** — implausible values flagged without discarding
    - **Property 11: Property Set Extraction with Tagged Metadata** — recognised Pset properties produce correct taggedMetadata entries
    - **Property 12: Property Parse Warning** — unparseable property values preserved as rawValue with parseWarning flag
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.5, 3.7, 4.1–4.6**

- [x] 4. Implement Model Validator Service
  - [x] 4.1 Implement `modelValidatorService.ts` — validation and statistics
    - Create `src/services/bim/modelValidatorService.ts`
    - Implement `validateModel(model, quantities)` — produce categorised findings report
    - Implement `findDuplicateGlobalIds(elements)` — detect duplicate GlobalIds, severity "error"
    - Implement `findMissingQuantities(elements)` — elements with geometry but no quantity set, severity "warning"
    - Implement `findUnclassifiedElements(elements)` — IfcBuildingElementProxy without classification, severity "warning"
    - Implement `findMissingMaterials(elements)` — elements with no material assignment, severity "info"
    - Implement `computeStatistics(elements, mappedElements?)` — total, by type, with/without quantities, unclassified, by trade section, coverage %
    - Implement `isBoqBlocked(findings)` — true if any error-severity findings exist
    - Handle edge case: zero extractable quantities → single "error" finding blocking BoQ
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [x]* 4.2 Write property tests for model validation
    - **Property 18: Validation Finding Detection** — missing quantities, unclassified elements, missing materials all detected with correct severity
    - **Property 19: Duplicate GlobalId Detection** — duplicate GlobalIds produce error-severity findings
    - **Property 20: Statistics Consistency** — totalElements = array length, with + without = total, coverage % correct
    - **Property 21: Error Severity Blocks BoQ** — boqBlocked true iff error-severity findings exist
    - **Validates: Requirements 7.1–7.8**

- [x] 5. Checkpoint — Core extraction pipeline
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Mapping Engine Service
  - [x] 6.1 Implement `mappingEngineService.ts` — rule application and precedence
    - Create `src/services/bim/mappingEngineService.ts`
    - Implement `getDefaultMappingRules()` — default ASAQS trade section rules for all 15 standard sections with measurement units (concrete m³, brickwork m², reinforcement kg, pipework m, conduit m, doors/windows nr)
    - Implement `calculateSpecificity(rule, element)` — score 1–3 based on type/predefinedType/classification match
    - Implement `findBestRule(element, rules)` — select most specific rule; custom scope > default scope at equal specificity
    - Implement `applyMappingRules(elements, rules)` — map all elements to trade sections; unmatched → "Unclassified"
    - Implement CRUD: `createMappingRule`, `updateMappingRule`, `deleteMappingRule` with Firestore persistence scoped to project or firm
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [x]* 6.2 Write property tests for mapping engine
    - **Property 13: Mapping Rule Application** — every element assigned to a trade section; unmatched → "Unclassified"
    - **Property 14: Mapping Rule Precedence** — most specific rule wins; custom > default at equal specificity
    - **Validates: Requirements 5.2, 5.4, 5.5, 5.6, 5.8**

- [x] 7. Implement BoQ Generator Service
  - [x] 7.1 Implement `boqGeneratorService.ts` — aggregation and formatting
    - Create `src/services/bim/boqGeneratorService.ts`
    - Implement `generateBoq(mappedElements, projectId, extractionId, validationReport, options?)` — produce structured BoqDocument
    - Implement `aggregateLineItems(mappedElements)` — group by trade section + element type + material + unit, sum quantities, collect GlobalIds
    - Implement `buildAsaqsDescription(element)` — ASAQS measurement description pattern (element description, specification detail, measurement qualification)
    - Implement `assignSectionNumbers(sections)` — ASAQS standard section numbering (Section 1: Preliminaries, Section 2: Earthworks, Section 3: Concrete, etc.)
    - Round quantities to 2 decimal places
    - Include flaggedElementsSummary in output for unclassified/missing quantity elements
    - Default currency ZAR, include JBCC appendix structure option
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.8, 12.1, 12.2, 12.3, 12.4, 12.6_

  - [x]* 7.2 Write property tests for BoQ generation
    - **Property 15: BoQ Aggregation Invariant** — aggregated quantity = sum of individual quantities; GlobalIds list contains all contributors
    - **Property 17: Flagged Elements in BoQ Summary** — all flagged elements appear in flaggedElementsSummary
    - **Validates: Requirements 6.2, 6.8**

  - [x] 7.3 Implement `boqGeneratorService.ts` — procurement package creation
    - Implement `createProcurementPackage(boq, selectedSections, selectedLineItems?, coverSheet)` — create supplier-facing package
    - Strip internal references (GlobalIds, IFC entity types) from supplier descriptions
    - Include cover sheet: project name, number, title, issue date, revision, QS contact
    - Support partial trade section selection
    - Track model supersession — flag when source model has newer version
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.6_

- [x] 8. Implement Export Service
  - [x] 8.1 Implement `exportService.ts` — CSV, Excel, JSON exports
    - Create `src/services/bim/exportService.ts`
    - Implement `exportToCsv(boq)` — columns: Section, Item No, Description, Unit, Quantity, Rate (blank), Amount (blank)
    - Implement `exportToExcel(boq)` — formatted headers, section groupings, subtotal rows per section, grand total row, ZAR currency
    - Implement `exportToJson(boq)` — full BoQ hierarchy with metadata as structured JSON
    - Implement `exportProcurementPackage(pkg)` — Excel with cover sheet for procurement packages
    - _Requirements: 6.5, 6.6, 6.7, 12.3_

  - [x]* 8.2 Write property tests for export round-trip
    - **Property 16: Export Round-Trip Preservation** — JSON export/parse produces structurally equivalent BoQ; CSV preserves all row data
    - **Validates: Requirements 6.5, 6.6, 6.7**

- [x] 9. Checkpoint — Services complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement Integration Adapters
  - [x] 10.1 Implement `bimPassportAdapter.ts` — Project Passport integration
    - Create `src/services/bim/bimPassportAdapter.ts`
    - Implement `buildExtractionPassportEvent(result)` — BimExtractionEvent with filename, schema, element count, coverage %
    - Implement `buildBoqPassportEvent(boq)` — BimBoqEvent with status, section count, line item count
    - Implement `buildQualityRiskIndicator(report)` — risk indicator: medium (1–3 errors), high (4+), null if no errors
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 10.2 Implement `bimSpecForgeAdapter.ts` — SpecForge integration
    - Create `src/services/bim/bimSpecForgeAdapter.ts`
    - Implement `createSpecForgeItems(boq, workspaceId)` — one spec item per BoQ line item with title, quantity, unit, trade section, GlobalIds
    - Implement `compareExtractions(currentBoq, previousLinks)` — identify added, removed, changed quantities
    - Handle user-edited discrepancies — flag without overwriting
    - Store BoqSpecForgeLink records in Firestore at `projects/{projectId}/bimSpecForgeLinks/{linkId}`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 10.3 Implement `bimAuditAdapter.ts` — Audit trail integration
    - Create `src/services/bim/bimAuditAdapter.ts`
    - Implement `buildBimAuditEvent(action, actorUid, targetId, projectId, metadata?)` — emit audit events for all write operations (upload, extraction, BoQ generation, mapping rule changes, procurement package creation/issuance, export)
    - Cover all BimAuditAction types: bim_upload, bim_extraction, bim_boq_generated, bim_mapping_rule_created/updated/deleted, bim_procurement_package_created/issued, bim_export
    - _Requirements: 11.4, 11.5, 11.6, 9.5_

  - [x]* 10.4 Write unit tests for integration adapters
    - Test passport event shape and content for extraction and BoQ events
    - Test risk indicator severity thresholds
    - Test SpecForge item creation mapping
    - Test extraction comparison (added/removed/changed detection)
    - Test audit event structure for each action type
    - _Requirements: 8.1–8.6, 11.1–11.6_

- [x] 11. Implement BIM API Router
  - [x] 11.1 Create `bim-api-router.ts` with upload, parse, and extraction endpoints
    - Create `src/lib/bim-api-router.ts` — Express 5 router mounted at `/api/bim`
    - Implement POST `/api/bim/upload` — file upload with validation (extension, size, STEP header), parse, store in Vercel Blob, register in Document Register
    - Implement GET `/api/bim/models/:projectId` — list parsed models
    - Implement GET `/api/bim/models/:projectId/:fileId` — get model details
    - Implement POST `/api/bim/extract/:fileId` — trigger quantity extraction
    - Implement GET `/api/bim/extractions/:projectId` — list extractions
    - Implement GET `/api/bim/extractions/:projectId/:extractionId` — get extraction detail
    - Implement GET `/api/bim/validation/:extractionId` — get validation report
    - Apply role-based auth middleware per route group (BIM_UPLOAD_ROLES, BIM_EXTRACT_ROLES)
    - Rate limit upload to 5 requests/minute per user
    - Return proper error responses: 400 (parse error with line), 413 (file too large), 403 (unauthorized)
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 10.1, 10.2, 10.7_

  - [x] 11.2 Add BoQ generation, export, mapping, and procurement endpoints
    - Implement POST `/api/bim/boq/generate` — generate BoQ from extraction (block if validation errors)
    - Implement GET `/api/bim/boq/:projectId` — list BoQs
    - Implement GET `/api/bim/boq/:projectId/:boqId` — get BoQ detail
    - Implement POST `/api/bim/boq/:boqId/export` — export BoQ (CSV/Excel/JSON format param)
    - Implement GET `/api/bim/rules/:projectId` — list active rules (default + custom)
    - Implement POST `/api/bim/rules` — create custom mapping rule
    - Implement PATCH `/api/bim/rules/:ruleId` — update custom rule
    - Implement DELETE `/api/bim/rules/:ruleId` — delete custom rule
    - Implement POST `/api/bim/procurement/package` — create procurement package
    - Implement POST `/api/bim/procurement/:packageId/issue` — issue package to recipients
    - Implement GET `/api/bim/procurement/:projectId` — list packages (subcontractor/supplier sees only their packages)
    - Implement POST `/api/bim/specforge/sync/:boqId` — create SpecForge items from BoQ
    - Implement GET `/api/bim/specforge/compare/:boqId` — compare with previous extraction
    - Apply role-based access per route group (BIM_MAPPING_ROLES, BIM_EXPORT_ROLES, etc.)
    - _Requirements: 5.7, 6.5, 6.6, 6.7, 8.1, 8.5, 9.1, 9.4, 9.5, 10.3, 10.4, 10.5, 10.6_

  - [x] 11.3 Mount BIM API router and add Zod validation schemas
    - Mount `/api/bim` router in `api-server.ts` and `server.ts` (following existing pattern with `finance-api-router.ts`)
    - Create Zod schemas in `src/lib/schemas.ts` for BIM request/response validation (upload, BoQ generation, mapping rule CRUD, procurement package creation)
    - _Requirements: 1.1, 10.7_

  - [x]* 11.4 Write property test for role-based access control
    - **Property 22: Role-Based Access Decisions** — for any user role and BIM operation, access granted iff role in permitted list; otherwise 403
    - **Validates: Requirements 10.1–10.7**

- [x] 12. Checkpoint — API layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement UI Components
  - [x] 13.1 Register BIM tool in navigation and create workspace shell
    - Register `bim-quantity-extraction` tool in `src/navigation/toolNavRegistry.ts` with sections: Model (Upload, Models, Validation), Quantities (Extraction, Mapping Rules, BoQ), Output (Export, Procurement, SpecForge Sync)
    - Add route in `App.tsx` with lazy-loading via `lazyWithChunkRetry`
    - Add nav entry in `architexNavigationConfig.ts` under the correct module (Tender/Procurement)
    - Create `src/components/BimWorkspace.tsx` — main workspace accepting `user: UserProfile` prop, following Hero → Stat Row → Panels pattern
    - _Requirements: 10.1–10.7_

  - [x] 13.2 Implement upload, model summary, and validation panels
    - Create `IfcUploadPanel` — drag-and-drop IFC upload with progress indicator, file size validation (500MB), extension check
    - Create `ModelSummaryPanel` — parsed model overview: spatial hierarchy tree, element counts by type, schema version, coverage stats
    - Create `ValidationReportPanel` — findings table with severity icons (error/warning/info), blocked/allowed status indicator, element links
    - _Requirements: 1.1, 1.5, 7.1, 7.6, 7.7_

  - [x] 13.3 Implement BoQ view, mapping rules, and export panels
    - Create `BoqViewPanel` — trade section accordion with line items (item number, description, unit, quantity), ASAQS section numbering
    - Create `MappingRulesPanel` — rule editor for QS/admin roles, CRUD interface for custom rules, display specificity/scope
    - Create `ExportPanel` — export format selection (CSV, Excel, JSON), download trigger, procurement package creation with trade section selection
    - Create `ExtractionComparisonPanel` — diff view between extractions showing added/removed/changed quantities
    - _Requirements: 5.7, 6.1, 6.3, 6.4, 6.5, 6.6, 6.7, 8.5, 12.1, 12.2_

  - [x]* 13.4 Write unit tests for UI component rendering
    - Test BimWorkspace renders Hero with project context
    - Test IfcUploadPanel validates file size and extension
    - Test ValidationReportPanel displays findings by severity
    - Test BoqViewPanel renders trade sections with line items
    - Test MappingRulesPanel respects role-based visibility (QS/admin only)
    - _Requirements: 1.5, 7.1, 10.3_

- [x] 14. Wire integrations and end-to-end flow
  - [x] 14.1 Wire Document Register, Project Passport, and audit trail integration
    - On successful parse: create DocumentRecord in Document Register with type "BIM Model", schema version, blob URL
    - On re-upload: mark previous model as "superseded" in Document Register
    - On extraction: emit BimExtractionEvent to Project Passport (filename, schema, count, coverage %)
    - On BoQ generation: emit BimBoqEvent to Project Passport (status, sections, line items)
    - On validation errors: emit BimQualityRiskIndicator to Project Passport (medium/high severity)
    - On procurement package issuance: record in Project Passport under procurement phase
    - On all write operations: emit audit event via bimAuditAdapter
    - _Requirements: 1.6, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [x] 14.2 Wire SpecForge sync and procurement issuance
    - On SpecForge sync: create spec items from BoQ line items, create sections if missing, store BoqSpecForgeLink records
    - On re-extraction: compare current BoQ with linked SpecForge items, present added/removed/changed
    - Handle user-edited SpecForge items: flag discrepancy without overwriting
    - On procurement package issue: record issuance event in audit trail with packageId, recipient count, timestamp
    - On outdated model: display warning when procurement package references superseded model
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.5, 9.6_

  - [x]* 14.3 Write integration tests for end-to-end flows
    - Test upload → parse → extract → validate → map → generate BoQ pipeline
    - Test BoQ → SpecForge sync → re-extract → comparison flow
    - Test procurement package creation and issuance audit trail
    - Test Document Register supersession on re-upload
    - Test Project Passport event emission
    - _Requirements: 1.6, 8.1–8.6, 9.5, 11.1–11.6_

- [x] 15. Final checkpoint — Full feature verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation of the extraction pipeline
- Property tests validate universal correctness properties using fast-check
- Unit tests validate specific examples, edge cases, and integration adapters
- The implementation uses TypeScript throughout (React 19 frontend, Express 5 API, service layer)
- web-ifc WASM handles IFC/STEP file parsing; no custom geometry computation
- All UI components follow the workspace template pattern (Hero → Stat Row → Panels) within the AppShell grid

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3"] },
    { "id": 3, "tasks": ["2.4", "3.1"] },
    { "id": 4, "tasks": ["3.2", "4.1"] },
    { "id": 5, "tasks": ["4.2", "6.1"] },
    { "id": 6, "tasks": ["6.2", "7.1"] },
    { "id": 7, "tasks": ["7.2", "7.3", "8.1"] },
    { "id": 8, "tasks": ["8.2", "10.1", "10.2", "10.3"] },
    { "id": 9, "tasks": ["10.4", "11.1"] },
    { "id": 10, "tasks": ["11.2", "11.3"] },
    { "id": 11, "tasks": ["11.4", "13.1"] },
    { "id": 12, "tasks": ["13.2", "13.3"] },
    { "id": 13, "tasks": ["13.4", "14.1"] },
    { "id": 14, "tasks": ["14.2"] },
    { "id": 15, "tasks": ["14.3"] }
  ]
}
```
