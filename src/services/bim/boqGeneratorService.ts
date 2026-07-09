/**
 * BoQ Generator Service — BIM/IFC Quantity Extraction Bridge
 *
 * Aggregates mapped IFC elements into structured Bills of Quantities conforming
 * to ASAQS/JBCC South African measurement conventions. Handles line item grouping,
 * ASAQS section numbering, measurement descriptions, and flagged element summaries.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.8, 12.1, 12.2, 12.3, 12.4, 12.6
 */

import { randomUUID } from 'node:crypto';
import type {
  BoqDocument,
  BoqSection,
  BoqLineItem,
  MappedElement,
  FlaggedElementSummary,
  BoqTotals,
  BoqGenerationOptions,
  ValidationReport,
  AsaqsTradeSection,
  MeasurementUnit,
  IfcEntityType,
  ProcurementPackage,
  ProcurementLineItem,
  PackageCoverSheet,
} from './types';

// ─── ASAQS Section Numbering ────────────────────────────────────────────────

/**
 * Standard ASAQS trade section numbering order.
 * Section 1: Preliminaries through to Section 16: Painting, plus 99: Unclassified.
 */
const ASAQS_SECTION_ORDER: Record<AsaqsTradeSection, string> = {
  'Preliminaries': '1',
  'Earthworks': '2',
  'Concrete': '3',
  'Formwork': '4',
  'Reinforcement': '5',
  'Masonry': '6',
  'Waterproofing': '7',
  'Roofwork': '8',
  'Carpentry and Joinery': '9',
  'Ceilings and Partitions': '10',
  'Floor Coverings': '11',
  'Glazing': '12',
  'Ironmongery': '13',
  'Plumbing and Drainage': '14',
  'Electrical': '15',
  'Painting': '16',
  'Unclassified': '99',
};

// ─── Element Type Display Names ─────────────────────────────────────────────

const ELEMENT_TYPE_DESCRIPTIONS: Record<IfcEntityType, string> = {
  'IfcWall': 'Walls',
  'IfcWallStandardCase': 'Walls',
  'IfcSlab': 'Slabs',
  'IfcColumn': 'Columns',
  'IfcBeam': 'Beams',
  'IfcDoor': 'Doors',
  'IfcWindow': 'Windows',
  'IfcRoof': 'Roofing',
  'IfcStair': 'Stairs',
  'IfcRailing': 'Railings',
  'IfcCurtainWall': 'Curtain walls',
  'IfcPlate': 'Plates and cladding',
  'IfcMember': 'Structural members',
  'IfcPile': 'Piles',
  'IfcFooting': 'Footings',
  'IfcCovering': 'Floor coverings',
  'IfcBuildingElementProxy': 'Building elements',
  'IfcPipeSegment': 'Pipe segments',
  'IfcPipeFitting': 'Pipe fittings',
  'IfcDuctSegment': 'Duct segments',
  'IfcDuctFitting': 'Duct fittings',
  'IfcCableSegment': 'Cable segments',
  'IfcCableFitting': 'Cable fittings',
  'IfcFlowTerminal': 'Flow terminals',
  'IfcEnergyConversionDevice': 'Energy conversion devices',
  'IfcFlowController': 'Flow controllers',
  'IfcFlowStorageDevice': 'Flow storage devices',
};

// ─── Measurement Unit Labels ────────────────────────────────────────────────

const UNIT_QUALIFICATIONS: Record<MeasurementUnit, string> = {
  'm²': 'measured in square metres',
  'm³': 'measured in cubic metres',
  'm': 'measured in linear metres',
  'nr': 'enumerated',
  'kg': 'measured in kilograms',
  'item': 'measured as items',
};

// ─── Default Options ────────────────────────────────────────────────────────

const DEFAULT_OPTIONS: Required<BoqGenerationOptions> = {
  currency: 'ZAR',
  includeJbccPreambles: true,
  roundingPrecision: 2,
};

// ─── Main Generator ─────────────────────────────────────────────────────────

/**
 * Generates a structured BoQ document from mapped elements.
 * Aggregates identical line items and formats per JBCC/ASAQS conventions.
 *
 * @param mappedElements - Elements with trade section assignments from the mapping engine
 * @param projectId - The project this BoQ belongs to
 * @param extractionId - The extraction result this BoQ was generated from
 * @param validationReport - Validation report for flagged element extraction
 * @param options - Generation options (currency, JBCC preambles, rounding)
 * @returns Structured BoqDocument ready for export or persistence
 */
export function generateBoq(
  mappedElements: MappedElement[],
  projectId: string,
  extractionId: string,
  validationReport: ValidationReport,
  options?: BoqGenerationOptions,
): BoqDocument {
  const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };

  // Aggregate line items from mapped elements
  const lineItems = aggregateLineItems(mappedElements, resolvedOptions.roundingPrecision);

  // Group line items by trade section into BoqSections
  const sectionsMap = new Map<AsaqsTradeSection, BoqLineItem[]>();
  for (const item of lineItems) {
    // Determine trade section from the mapped elements that contributed to this item
    const tradeSection = findTradeSectionForItem(item, mappedElements);
    const existing = sectionsMap.get(tradeSection) || [];
    existing.push(item);
    sectionsMap.set(tradeSection, existing);
  }

  // Build BoqSection array
  const sections: BoqSection[] = [];
  for (const [tradeSection, items] of sectionsMap.entries()) {
    sections.push({
      sectionNumber: ASAQS_SECTION_ORDER[tradeSection] || '99',
      tradeSection,
      title: tradeSection,
      lineItems: items,
    });
  }

  // Assign ASAQS section numbers and sort
  const numberedSections = assignSectionNumbers(sections);

  // Build flagged elements summary from validation report
  const flaggedElementsSummary = buildFlaggedElementsSummary(validationReport);

  // Compute totals
  const totals: BoqTotals = {
    totalLineItems: lineItems.length,
    totalSections: numberedSections.length,
    totalElements: mappedElements.length,
  };

  return {
    boqId: randomUUID(),
    projectId,
    extractionId,
    title: `Bill of Quantities — ${projectId}`,
    status: 'draft',
    revision: 'A',
    generatedAt: new Date().toISOString(),
    generatedBy: 'system',
    currency: resolvedOptions.currency,
    sections: numberedSections,
    flaggedElementsSummary,
    totals,
  };
}

// ─── Line Item Aggregation ──────────────────────────────────────────────────

/**
 * Aggregates quantities for identical line items.
 * Groups by (tradeSection, elementType, material, measurementUnit),
 * sums the total quantity, and collects all contributing GlobalIds.
 *
 * @param mappedElements - Elements with trade section assignments
 * @param precision - Rounding precision for quantities (default 2)
 * @returns Aggregated BoQ line items
 */
export function aggregateLineItems(
  mappedElements: MappedElement[],
  precision: number = 2,
): BoqLineItem[] {
  // Group key: tradeSection|elementType|material|measurementUnit
  const groups = new Map<string, {
    tradeSection: AsaqsTradeSection;
    elementType: IfcEntityType;
    material: string | undefined;
    unit: MeasurementUnit;
    totalQuantity: number;
    globalIds: string[];
    elements: MappedElement[];
  }>();

  for (const mapped of mappedElements) {
    const material = getPrimaryMaterial(mapped);
    const key = `${mapped.tradeSection}|${mapped.element.entityType}|${material || ''}|${mapped.measurementUnit}`;

    const existing = groups.get(key);
    if (existing) {
      existing.totalQuantity += getElementQuantity(mapped);
      existing.globalIds.push(mapped.element.globalId);
      existing.elements.push(mapped);
    } else {
      groups.set(key, {
        tradeSection: mapped.tradeSection,
        elementType: mapped.element.entityType,
        material,
        unit: mapped.measurementUnit,
        totalQuantity: getElementQuantity(mapped),
        globalIds: [mapped.element.globalId],
        elements: [mapped],
      });
    }
  }

  // Convert groups to line items (section numbering assigned later)
  const lineItems: BoqLineItem[] = [];
  // Group by trade section for sequential numbering within each section
  const bySectionMap = new Map<AsaqsTradeSection, typeof groups extends Map<string, infer V> ? V[] : never>();

  for (const group of groups.values()) {
    const sectionGroups = bySectionMap.get(group.tradeSection) || [];
    sectionGroups.push(group);
    bySectionMap.set(group.tradeSection, sectionGroups);
  }

  for (const [tradeSection, sectionGroups] of bySectionMap.entries()) {
    const sectionNumber = ASAQS_SECTION_ORDER[tradeSection] || '99';
    let index = 1;

    for (const group of sectionGroups) {
      const roundedQuantity = roundToDecimalPlaces(group.totalQuantity, precision);
      const description = buildAsaqsDescription({
        element: group.elements[0].element,
        tradeSection: group.tradeSection,
        tradeSectionCode: ASAQS_SECTION_ORDER[group.tradeSection] || '99',
        measurementUnit: group.unit,
        matchedRuleId: group.elements[0].matchedRuleId,
        isUnclassified: group.elements[0].isUnclassified,
      });

      lineItems.push({
        itemNumber: `${sectionNumber}.${String(index).padStart(2, '0')}`,
        description,
        unit: group.unit,
        quantity: roundedQuantity,
        rate: undefined,
        amount: undefined,
        sourceElementCount: group.globalIds.length,
        sourceElementGlobalIds: group.globalIds,
        elementType: group.elementType,
        material: group.material,
        specForgeItemId: undefined,
      });

      index++;
    }
  }

  return lineItems;
}

// ─── ASAQS Description Builder ──────────────────────────────────────────────

/**
 * Generates ASAQS-compliant measurement descriptions.
 * Pattern: "{Element type description}, {material spec}, {measurement qualification}"
 *
 * @param element - Mapped element to describe
 * @returns ASAQS measurement description string
 */
export function buildAsaqsDescription(element: MappedElement): string {
  const elementDescription = ELEMENT_TYPE_DESCRIPTIONS[element.element.entityType]
    || element.element.entityType;

  const material = getPrimaryMaterial(element);
  const materialSpec = material || 'general';

  const measurementQualification = UNIT_QUALIFICATIONS[element.measurementUnit]
    || `measured in ${element.measurementUnit}`;

  return `${elementDescription}, ${materialSpec}, ${measurementQualification}`;
}

// ─── Section Numbering ──────────────────────────────────────────────────────

/**
 * Assigns ASAQS section numbers per standard convention and sorts sections
 * in the standard ASAQS order.
 *
 * Section 1: Preliminaries, Section 2: Earthworks, Section 3: Concrete, etc.
 *
 * @param sections - Unordered BoQ sections
 * @returns Sections sorted and numbered per ASAQS standard
 */
export function assignSectionNumbers(sections: BoqSection[]): BoqSection[] {
  return sections
    .map((section) => ({
      ...section,
      sectionNumber: ASAQS_SECTION_ORDER[section.tradeSection] || '99',
    }))
    .sort((a, b) => {
      const numA = parseInt(a.sectionNumber, 10);
      const numB = parseInt(b.sectionNumber, 10);
      return numA - numB;
    })
    .map((section) => ({
      ...section,
      lineItems: section.lineItems.map((item, idx) => ({
        ...item,
        itemNumber: `${section.sectionNumber}.${String(idx + 1).padStart(2, '0')}`,
      })),
    }));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Gets the primary material name from a mapped element.
 * Uses the first material layer's name if available.
 */
function getPrimaryMaterial(mapped: MappedElement): string | undefined {
  if (mapped.element.materials.length > 0) {
    return mapped.element.materials[0].materialName;
  }
  return undefined;
}

/**
 * Gets the total quantity value for a mapped element by summing
 * all quantities from its quantity sets that match the measurement unit context.
 * Falls back to 1 for 'nr'/'item' units if no quantities present.
 */
function getElementQuantity(mapped: MappedElement): number {
  const quantitySets = mapped.element.quantitySets;
  if (quantitySets.length === 0) {
    // For count-based units, each element counts as 1
    if (mapped.measurementUnit === 'nr' || mapped.measurementUnit === 'item') {
      return 1;
    }
    return 0;
  }

  // Sum all quantity values from all sets
  let total = 0;
  for (const qs of quantitySets) {
    for (const q of qs.quantities) {
      total += q.value;
    }
  }

  return total;
}

/**
 * Finds the trade section for a line item based on the mapped elements that
 * contributed to it (via element type matching).
 */
function findTradeSectionForItem(
  item: BoqLineItem,
  mappedElements: MappedElement[],
): AsaqsTradeSection {
  // Find the first mapped element that matches this line item's GlobalIds
  for (const mapped of mappedElements) {
    if (item.sourceElementGlobalIds.includes(mapped.element.globalId)) {
      return mapped.tradeSection;
    }
  }
  return 'Unclassified';
}

/**
 * Builds the flagged elements summary from the validation report.
 * Includes elements that are unclassified or have missing quantities.
 */
function buildFlaggedElementsSummary(
  validationReport: ValidationReport,
): FlaggedElementSummary[] {
  const flaggedTypes = new Set(['unclassified_element', 'missing_quantities']);

  return validationReport.findings
    .filter((f) => flaggedTypes.has(f.type) && f.elementGlobalId)
    .map((f) => ({
      globalId: f.elementGlobalId!,
      elementType: f.elementType || 'IfcBuildingElementProxy',
      findingType: f.type,
      message: f.message,
    }));
}

/**
 * Rounds a number to the specified decimal places.
 */
function roundToDecimalPlaces(value: number, places: number): number {
  const factor = Math.pow(10, places);
  return Math.round(value * factor) / factor;
}


// ─── Procurement Package Creation ───────────────────────────────────────────

/**
 * Regex pattern matching IFC GlobalId format (22 character base64 encoded GUID).
 * Used to strip internal model references from supplier-facing descriptions.
 */
const GLOBAL_ID_PATTERN = /[0-9A-Za-z_$]{22}/g;

/**
 * IFC entity type names that should be stripped from supplier descriptions.
 * These are technical model identifiers, not meaningful to suppliers.
 */
const IFC_ENTITY_TYPE_NAMES: Set<string> = new Set([
  'IfcWall', 'IfcWallStandardCase', 'IfcSlab', 'IfcColumn', 'IfcBeam',
  'IfcDoor', 'IfcWindow', 'IfcRoof', 'IfcStair', 'IfcRailing',
  'IfcCurtainWall', 'IfcPlate', 'IfcMember', 'IfcPile', 'IfcFooting',
  'IfcCovering', 'IfcBuildingElementProxy',
  'IfcPipeSegment', 'IfcPipeFitting', 'IfcDuctSegment', 'IfcDuctFitting',
  'IfcCableSegment', 'IfcCableFitting', 'IfcFlowTerminal',
  'IfcEnergyConversionDevice', 'IfcFlowController', 'IfcFlowStorageDevice',
]);

/**
 * Regex pattern matching any IFC entity type name in a string.
 */
const IFC_ENTITY_TYPE_PATTERN = /\bIfc[A-Z][A-Za-z]*/g;

/**
 * Creates a procurement package from selected BoQ trade sections.
 * Strips internal references (GlobalIds, IFC entity types) from descriptions
 * to produce supplier-facing line items.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.6
 *
 * @param boq - Source BoQ document
 * @param selectedSections - Trade sections to include in the package
 * @param selectedLineItems - Optional item numbers to filter within selected sections
 * @param coverSheet - Cover sheet details (project name, number, title, issue date, revision, QS contact)
 * @returns ProcurementPackage ready for issue to suppliers
 */
export function createProcurementPackage(
  boq: BoqDocument,
  selectedSections: AsaqsTradeSection[],
  selectedLineItems: string[] | undefined,
  coverSheet: PackageCoverSheet,
): ProcurementPackage {
  // Filter BoQ sections to those selected
  const matchingSections = boq.sections.filter(
    (section) => selectedSections.includes(section.tradeSection),
  );

  // Collect line items from matching sections
  let rawLineItems: BoqLineItem[] = [];
  for (const section of matchingSections) {
    rawLineItems.push(...section.lineItems);
  }

  // If specific line items are requested, filter further by item number
  if (selectedLineItems && selectedLineItems.length > 0) {
    const itemNumberSet = new Set(selectedLineItems);
    rawLineItems = rawLineItems.filter((item) => itemNumberSet.has(item.itemNumber));
  }

  // Transform to procurement line items (supplier-facing, stripped of internal references)
  const procurementLineItems: ProcurementLineItem[] = rawLineItems.map((item) => ({
    itemNumber: item.itemNumber,
    description: stripInternalReferences(item.description),
    unit: item.unit,
    quantity: item.quantity,
  }));

  // Build the package title from selected sections
  const title = selectedSections.length === 1
    ? selectedSections[0]
    : selectedSections.join(', ');

  return {
    packageId: randomUUID(),
    projectId: boq.projectId,
    boqId: boq.boqId,
    title,
    tradeSections: [...selectedSections],
    lineItems: procurementLineItems,
    coverSheet,
    revision: boq.revision,
    issuedAt: undefined,
    issuedBy: undefined,
    recipientCount: undefined,
    modelSuperseded: false,
  };
}

/**
 * Strips internal IFC model references from a description string.
 * Removes GlobalIds (22-char base64 identifiers) and IFC entity type names,
 * producing a clean human-readable description suitable for suppliers.
 *
 * @param description - Raw BoQ description potentially containing model references
 * @returns Cleaned description without GlobalIds or IFC entity type names
 */
export function stripInternalReferences(description: string): string {
  let cleaned = description;

  // Replace IFC entity type names with their human-readable equivalents
  cleaned = cleaned.replace(IFC_ENTITY_TYPE_PATTERN, (match) => {
    if (IFC_ENTITY_TYPE_NAMES.has(match)) {
      return ELEMENT_TYPE_DESCRIPTIONS[match as IfcEntityType] || '';
    }
    return match;
  });

  // Remove GlobalId patterns (22-char alphanumeric with _ and $)
  cleaned = cleaned.replace(GLOBAL_ID_PATTERN, '');

  // Clean up resulting whitespace artifacts (double spaces, leading/trailing commas)
  cleaned = cleaned
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*$/g, '')
    .replace(/^\s*,\s*/g, '')
    .trim();

  return cleaned;
}
