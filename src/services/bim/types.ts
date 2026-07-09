/**
 * BIM/IFC Quantity Extraction Bridge — Core Types
 *
 * Data model interfaces, type aliases, and constants for the BIM service layer.
 * Covers IFC parsing, quantity extraction, mapping rules, BoQ generation,
 * validation, export, and integration with SpecForge, Project Passport,
 * Document Register, Procurement, and Audit Trail.
 *
 * Requirements: 1.1–1.7, 2.1–2.6, 3.1–3.7, 5.1–5.8, 6.1–6.8, 10.1–10.7
 */

import type { UserRole } from '@/types';

// ─── IFC Schema Detection ─────────────────────────────────────────────────

export type IfcSchemaVersion = 'IFC2X3' | 'IFC4' | 'IFC4X3';

export type IfcEntityType =
  // Structural
  | 'IfcWall' | 'IfcWallStandardCase' | 'IfcSlab' | 'IfcColumn' | 'IfcBeam'
  | 'IfcDoor' | 'IfcWindow' | 'IfcRoof' | 'IfcStair' | 'IfcRailing'
  | 'IfcCurtainWall' | 'IfcPlate' | 'IfcMember' | 'IfcPile' | 'IfcFooting'
  | 'IfcCovering' | 'IfcBuildingElementProxy'
  // MEP
  | 'IfcPipeSegment' | 'IfcPipeFitting' | 'IfcDuctSegment' | 'IfcDuctFitting'
  | 'IfcCableSegment' | 'IfcCableFitting' | 'IfcFlowTerminal'
  | 'IfcEnergyConversionDevice' | 'IfcFlowController' | 'IfcFlowStorageDevice';

export type QuantityType = 'area' | 'volume' | 'length' | 'count' | 'weight';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export type ValidationFindingType =
  | 'missing_quantities'
  | 'unclassified_element'
  | 'missing_material'
  | 'duplicate_globalid'
  | 'out_of_bounds_quantity'
  | 'no_extractable_quantities'
  | 'parse_warning';

// ─── Parsed IFC Model ─────────────────────────────────────────────────────

export interface ParsedIfcModel {
  fileId: string;
  fileName: string;
  schemaVersion: IfcSchemaVersion;
  parsedAt: string; // ISO 8601
  spatialHierarchy: SpatialNode;
  elements: IfcElement[];
  elementCount: number;
}

export interface SpatialNode {
  globalId: string;
  name: string;
  type: 'IfcProject' | 'IfcSite' | 'IfcBuilding' | 'IfcBuildingStorey';
  children: SpatialNode[];
  elementIds: string[]; // GlobalIds of contained elements
}

export interface IfcElement {
  globalId: string;
  entityType: IfcEntityType;
  name: string;
  predefinedType?: string;
  spatialContainment: string; // GlobalId of containing storey/building
  classification?: IfcClassification;
  materials: MaterialLayer[];
  quantitySets: ElementQuantitySet[];
  propertySets: PropertySet[];
  hasGeometry: boolean;
  taggedMetadata: Record<string, string | number>; // fireRating, acousticRating, thermalTransmittance
}

export interface IfcClassification {
  systemName: string; // e.g., 'Uniclass', 'OmniClass'
  code: string;
  description: string;
}

export interface MaterialLayer {
  materialName: string;
  thicknessMm: number;
  category?: string;
}

export interface ElementQuantitySet {
  setName: string; // e.g., 'BaseQuantities', 'Qto_WallBaseQuantities'
  quantities: ExtractedQuantity[];
}

export interface ExtractedQuantity {
  name: string; // e.g., 'NetSideArea', 'GrossVolume'
  type: QuantityType;
  value: number;
  unit: string; // SI unit: 'm²', 'm³', 'm', 'kg', 'nr'
  sourceElementGlobalId: string;
  sourceSetName: string;
}

// ─── Property Sets ────────────────────────────────────────────────────────

export interface PropertySet {
  setName: string; // e.g., 'Pset_WallCommon'
  isRecognised: boolean; // true for known Pset_* names
  properties: PropertyValue[];
}

export interface PropertyValue {
  name: string;
  value: string | number | boolean;
  rawValue?: string; // preserved when type parsing fails
  unit?: string;
  parseWarning?: boolean;
}

// ─── Extraction Result ────────────────────────────────────────────────────

export interface ExtractionResult {
  extractionId: string;
  projectId: string;
  fileId: string;
  fileName: string;
  schemaVersion: IfcSchemaVersion;
  extractedAt: string; // ISO 8601
  extractedBy: string; // user uid
  elements: IfcElement[];
  quantities: ExtractedQuantity[];
  validationReport: ValidationReport;
  supersedes?: string; // extractionId of previous extraction
  status: 'draft' | 'active' | 'superseded';
}

// ─── Validation ───────────────────────────────────────────────────────────

export interface ValidationReport {
  modelId: string;
  findings: ValidationFinding[];
  statistics: ModelStatistics;
  boqBlocked: boolean; // true if any error-severity findings
  generatedAt: string;
}

export interface ValidationFinding {
  id: string;
  type: ValidationFindingType;
  severity: ValidationSeverity;
  message: string;
  elementGlobalId?: string;
  elementType?: IfcEntityType;
  details?: Record<string, unknown>;
}

export interface ModelStatistics {
  totalElements: number;
  elementsByType: Record<string, number>;
  elementsWithQuantities: number;
  elementsWithoutQuantities: number;
  unclassifiedElements: number;
  elementsByTradeSection: Record<string, number>;
  quantityCoveragePercent: number; // (withQuantities / total) * 100
}

// ─── Mapping Rules ────────────────────────────────────────────────────────

export type MeasurementUnit = 'm²' | 'm³' | 'm' | 'nr' | 'kg' | 'item';

export type AsaqsTradeSection =
  | 'Preliminaries' | 'Earthworks' | 'Concrete' | 'Formwork'
  | 'Reinforcement' | 'Masonry' | 'Waterproofing' | 'Roofwork'
  | 'Carpentry and Joinery' | 'Ceilings and Partitions'
  | 'Floor Coverings' | 'Glazing' | 'Ironmongery'
  | 'Plumbing and Drainage' | 'Electrical' | 'Painting'
  | 'Unclassified';

export interface MappingRule {
  ruleId: string;
  ifcEntityType: IfcEntityType;
  predefinedType?: string; // optional — increases specificity
  classificationCode?: string; // optional — increases specificity
  tradeSection: AsaqsTradeSection;
  tradeSectionCode: string; // e.g., '3' for Concrete
  measurementUnit: MeasurementUnit;
  description?: string;
  scope: 'default' | 'firm' | 'project';
  scopeId?: string; // firmId or projectId when scope != 'default'
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Specificity score for rule precedence:
 * - type+predefinedType+classification = 3
 * - type+predefinedType = 2
 * - type+classification = 2
 * - type only = 1
 */
export type RuleSpecificity = 1 | 2 | 3;

// ─── BoQ Document ─────────────────────────────────────────────────────────

export interface BoqDocument {
  boqId: string;
  projectId: string;
  extractionId: string;
  title: string;
  status: 'draft' | 'issued' | 'superseded';
  revision: string;
  generatedAt: string;
  generatedBy: string;
  currency: string; // default 'ZAR'
  sections: BoqSection[];
  flaggedElementsSummary: FlaggedElementSummary[];
  totals: BoqTotals;
}

export interface BoqSection {
  sectionNumber: string; // ASAQS section number, e.g., '3'
  tradeSection: AsaqsTradeSection;
  title: string;
  lineItems: BoqLineItem[];
  subtotal?: number;
}

export interface BoqLineItem {
  itemNumber: string; // sequential within section, e.g., '3.01'
  description: string; // ASAQS measurement description pattern
  unit: MeasurementUnit;
  quantity: number; // rounded to 2dp
  rate?: number; // blank in export, filled by tenderer
  amount?: number; // blank in export, computed as qty × rate
  sourceElementCount: number;
  sourceElementGlobalIds: string[];
  elementType: IfcEntityType;
  material?: string;
  specForgeItemId?: string; // linked SpecForge item if created
}

export interface FlaggedElementSummary {
  globalId: string;
  elementType: IfcEntityType;
  findingType: ValidationFindingType;
  message: string;
}

export interface BoqTotals {
  totalLineItems: number;
  totalSections: number;
  totalElements: number;
}

// ─── Procurement Package ──────────────────────────────────────────────────

export interface ProcurementPackage {
  packageId: string;
  projectId: string;
  boqId: string;
  title: string; // trade section name
  tradeSections: AsaqsTradeSection[];
  lineItems: ProcurementLineItem[];
  coverSheet: PackageCoverSheet;
  revision: string;
  issuedAt?: string;
  issuedBy?: string;
  recipientCount?: number;
  modelSuperseded: boolean; // true if source model has newer version
}

export interface ProcurementLineItem {
  itemNumber: string;
  description: string; // supplier-facing, no GlobalIds or IFC types
  unit: MeasurementUnit;
  quantity: number;
}

export interface PackageCoverSheet {
  projectName: string;
  projectNumber: string;
  packageTitle: string;
  issueDate: string;
  revisionNumber: string;
  qsContactName: string;
  qsContactEmail: string;
}

// ─── SpecForge Integration ────────────────────────────────────────────────

export interface BoqSpecForgeLink {
  boqLineItemId: string; // itemNumber within BoQ
  specForgeItemId: string;
  boqId: string;
  extractionId: string;
  linkedAt: string;
  quantityAtLink: number;
  currentModelQuantity?: number;
  userOverridden: boolean;
}

export interface ExtractionComparison {
  previousExtractionId: string;
  currentExtractionId: string;
  added: BoqLineItem[];
  removed: BoqLineItem[];
  changed: QuantityChange[];
}

export interface QuantityChange {
  lineItemId: string;
  description: string;
  previousQuantity: number;
  currentQuantity: number;
  delta: number;
  deltaPercent: number;
}

// ─── Project Passport Events ──────────────────────────────────────────────

export interface BimExtractionEvent {
  type: 'bim_extraction';
  projectId: string;
  fileName: string;
  schemaVersion: IfcSchemaVersion;
  elementCount: number;
  quantityCoveragePercent: number;
  extractedAt: string;
}

export interface BimBoqEvent {
  type: 'bim_boq_generated';
  projectId: string;
  boqId: string;
  status: 'draft' | 'issued' | 'superseded';
  tradeSectionCount: number;
  lineItemCount: number;
  generatedAt: string;
}

export interface BimQualityRiskIndicator {
  category: 'model_quality';
  severity: 'medium' | 'high';
  errorCount: number;
  message: string;
}

// ─── Audit Events ─────────────────────────────────────────────────────────

export type BimAuditAction =
  | 'bim_upload'
  | 'bim_extraction'
  | 'bim_boq_generated'
  | 'bim_mapping_rule_created'
  | 'bim_mapping_rule_updated'
  | 'bim_mapping_rule_deleted'
  | 'bim_procurement_package_created'
  | 'bim_procurement_package_issued'
  | 'bim_export';

// ─── Mapped Element (Mapping Engine Output) ───────────────────────────────

export interface MappedElement {
  element: IfcElement;
  tradeSection: AsaqsTradeSection;
  tradeSectionCode: string;
  measurementUnit: MeasurementUnit;
  matchedRuleId: string;
  isUnclassified: boolean;
}

// ─── BoQ Generation Options ───────────────────────────────────────────────

export interface BoqGenerationOptions {
  currency?: string; // default 'ZAR'
  includeJbccPreambles?: boolean; // default true
  roundingPrecision?: number; // default 2
}

// ─── Error Response ───────────────────────────────────────────────────────

export interface BimErrorResponse {
  error: string; // machine-readable code: 'PARSE_ERROR', 'FILE_TOO_LARGE', 'BOQ_BLOCKED', etc.
  message: string; // human-readable description
  line?: number; // for parse errors
  findings?: ValidationFinding[]; // for BOQ_BLOCKED
  details?: Record<string, unknown>;
}

// ─── Constants ────────────────────────────────────────────────────────────

/** Recognised Pset names for special tagging */
export const RECOGNISED_PSETS = [
  'Pset_WallCommon',
  'Pset_SlabCommon',
  'Pset_ColumnCommon',
  'Pset_DoorCommon',
  'Pset_WindowCommon',
  'Pset_BeamCommon',
  'Pset_RoofCommon',
  'Pset_CoveringCommon',
] as const;

/** Tagged metadata keys extracted from recognised property sets */
export const TAGGED_METADATA_KEYS = {
  FireRating: 'fireRating',
  AcousticRating: 'acousticRating',
  ThermalTransmittance: 'thermalTransmittance',
} as const;

// ─── Role-Based Access Control ────────────────────────────────────────────

/** Roles permitted to upload IFC files and initiate parsing */
export const BIM_UPLOAD_ROLES: UserRole[] = [
  'quantity_surveyor',
  'architect',
  'engineer',
  'contractor',
  'platform_admin',
];

/** Roles permitted to extract quantities and generate BoQs */
export const BIM_EXTRACT_ROLES: UserRole[] = [
  'quantity_surveyor',
  'architect',
  'engineer',
  'platform_admin',
];

/** Roles permitted to create and modify custom mapping rules */
export const BIM_MAPPING_ROLES: UserRole[] = [
  'quantity_surveyor',
  'platform_admin',
];

/** Roles permitted to export BoQs and create procurement packages */
export const BIM_EXPORT_ROLES: UserRole[] = [
  'quantity_surveyor',
  'contractor',
  'platform_admin',
];
