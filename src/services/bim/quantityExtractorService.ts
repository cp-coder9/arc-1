/**
 * Quantity Extractor Service — Extract quantities and properties from parsed IFC models
 *
 * Walks elements in batches of 500, extracts all IfcElementQuantity sets,
 * normalises values to SI units, validates bounds, and extracts tagged metadata
 * from recognised Pset_* property sets.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

import type {
  ParsedIfcModel,
  ExtractionResult,
  ExtractedQuantity,
  QuantityType,
  PropertySet,
  PropertyValue,
  IfcElement,
  ValidationFinding,
  ValidationReport,
  ModelStatistics,
  ValidationFindingType,
  ValidationSeverity,
} from './types';
import { RECOGNISED_PSETS, TAGGED_METADATA_KEYS } from './types';

// ─── Constants ────────────────────────────────────────────────────────────

/** Batch size for processing elements to manage memory */
const BATCH_SIZE = 500;

/** Bounds thresholds for physically plausible values */
const QUANTITY_BOUNDS: Record<QuantityType, { max: number }> = {
  area: { max: 100_000 },     // 100,000 m²
  volume: { max: 1_000_000 }, // 1,000,000 m³
  length: { max: 10_000 },    // 10,000 m
  weight: { max: 10_000_000 }, // 10,000,000 kg
  count: { max: Number.MAX_SAFE_INTEGER },
};

/** Unit conversion factors to SI */
const UNIT_CONVERSIONS: Record<string, { factor: number; targetType: QuantityType[] }> = {
  // Area conversions → m²
  'ft²': { factor: 0.092903, targetType: ['area'] },
  'ft2': { factor: 0.092903, targetType: ['area'] },
  'sq ft': { factor: 0.092903, targetType: ['area'] },
  'sqft': { factor: 0.092903, targetType: ['area'] },
  'in²': { factor: 0.00064516, targetType: ['area'] },
  'in2': { factor: 0.00064516, targetType: ['area'] },
  'mm²': { factor: 0.000001, targetType: ['area'] },
  'mm2': { factor: 0.000001, targetType: ['area'] },
  'cm²': { factor: 0.0001, targetType: ['area'] },
  'cm2': { factor: 0.0001, targetType: ['area'] },
  'm²': { factor: 1, targetType: ['area'] },
  'm2': { factor: 1, targetType: ['area'] },

  // Volume conversions → m³
  'ft³': { factor: 0.0283168, targetType: ['volume'] },
  'ft3': { factor: 0.0283168, targetType: ['volume'] },
  'cu ft': { factor: 0.0283168, targetType: ['volume'] },
  'cuft': { factor: 0.0283168, targetType: ['volume'] },
  'in³': { factor: 0.0000163871, targetType: ['volume'] },
  'in3': { factor: 0.0000163871, targetType: ['volume'] },
  'mm³': { factor: 0.000000001, targetType: ['volume'] },
  'mm3': { factor: 0.000000001, targetType: ['volume'] },
  'cm³': { factor: 0.000001, targetType: ['volume'] },
  'cm3': { factor: 0.000001, targetType: ['volume'] },
  'm³': { factor: 1, targetType: ['volume'] },
  'm3': { factor: 1, targetType: ['volume'] },
  'l': { factor: 0.001, targetType: ['volume'] },
  'litre': { factor: 0.001, targetType: ['volume'] },
  'liter': { factor: 0.001, targetType: ['volume'] },

  // Length conversions → m
  'ft': { factor: 0.3048, targetType: ['length'] },
  'in': { factor: 0.0254, targetType: ['length'] },
  'inch': { factor: 0.0254, targetType: ['length'] },
  'inches': { factor: 0.0254, targetType: ['length'] },
  'mm': { factor: 0.001, targetType: ['length'] },
  'cm': { factor: 0.01, targetType: ['length'] },
  'm': { factor: 1, targetType: ['length'] },
  'yd': { factor: 0.9144, targetType: ['length'] },

  // Weight conversions → kg
  'lb': { factor: 0.453592, targetType: ['weight'] },
  'lbs': { factor: 0.453592, targetType: ['weight'] },
  'oz': { factor: 0.0283495, targetType: ['weight'] },
  'g': { factor: 0.001, targetType: ['weight'] },
  'gram': { factor: 0.001, targetType: ['weight'] },
  'tonne': { factor: 1000, targetType: ['weight'] },
  't': { factor: 1000, targetType: ['weight'] },
  'ton': { factor: 1000, targetType: ['weight'] },
  'kg': { factor: 1, targetType: ['weight'] },

  // Count (no conversion needed)
  'nr': { factor: 1, targetType: ['count'] },
  'ea': { factor: 1, targetType: ['count'] },
  'pcs': { factor: 1, targetType: ['count'] },
};

/** SI unit strings per quantity type */
const SI_UNIT_STRINGS: Record<QuantityType, string> = {
  area: 'm²',
  volume: 'm³',
  length: 'm',
  weight: 'kg',
  count: 'nr',
};

// ─── Public Functions ─────────────────────────────────────────────────────

/**
 * Extracts all quantities and property sets from parsed elements.
 * Processes in batches of 500 elements to manage memory.
 *
 * @param model - Parsed IFC model structure
 * @param projectId - Project identifier
 * @param extractedBy - User uid performing extraction
 * @returns ExtractionResult containing all extracted quantities and validation findings
 */
export function extractQuantities(
  model: ParsedIfcModel,
  projectId: string = '',
  extractedBy: string = ''
): ExtractionResult {
  const allQuantities: ExtractedQuantity[] = [];
  const findings: ValidationFinding[] = [];
  const elements = model.elements;

  // Process elements in batches of 500
  for (let batchStart = 0; batchStart < elements.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, elements.length);
    const batch = elements.slice(batchStart, batchEnd);

    for (const element of batch) {
      // Extract quantities from all quantity sets
      const elementQuantities = extractElementQuantities(element);
      allQuantities.push(...elementQuantities);

      // Extract tagged metadata from property sets
      const metadata = extractTaggedMetadata(element.propertySets);
      if (Object.keys(metadata).length > 0) {
        element.taggedMetadata = { ...element.taggedMetadata, ...metadata };
      }

      // Process property sets for parse warnings
      processPropertySets(element.propertySets, element.globalId, findings);

      // Flag elements with geometry but no quantity sets
      if (element.hasGeometry && element.quantitySets.length === 0) {
        findings.push({
          id: generateFindingId(),
          type: 'missing_quantities' as ValidationFindingType,
          severity: 'warning' as ValidationSeverity,
          message: `Element "${element.name || element.globalId}" (${element.entityType}) has geometry but no IfcElementQuantity set. Recommend quantity set assignment.`,
          elementGlobalId: element.globalId,
          elementType: element.entityType,
        });
      }

      // Check bounds on extracted quantities
      for (const qty of elementQuantities) {
        if (!checkQuantityBounds(qty.value, qty.type)) {
          findings.push({
            id: generateFindingId(),
            type: 'out_of_bounds_quantity' as ValidationFindingType,
            severity: 'warning' as ValidationSeverity,
            message: `Quantity "${qty.name}" on element ${qty.sourceElementGlobalId} has potentially implausible value: ${qty.value} ${qty.unit}`,
            elementGlobalId: qty.sourceElementGlobalId,
            details: {
              quantityName: qty.name,
              quantityType: qty.type,
              value: qty.value,
              unit: qty.unit,
            },
          });
        }
      }
    }
  }

  // Compute statistics
  const statistics = computeStatistics(elements);

  // Build validation report
  const validationReport: ValidationReport = {
    modelId: model.fileId,
    findings,
    statistics,
    boqBlocked: findings.some((f) => f.severity === 'error'),
    generatedAt: new Date().toISOString(),
  };

  return {
    extractionId: generateExtractionId(),
    projectId,
    fileId: model.fileId,
    fileName: model.fileName,
    schemaVersion: model.schemaVersion,
    extractedAt: new Date().toISOString(),
    extractedBy,
    elements: model.elements,
    quantities: allQuantities,
    validationReport,
    status: 'draft',
  };
}

/**
 * Normalises a quantity value to SI units.
 * Converts imperial/non-SI values to m², m³, m, kg as appropriate.
 *
 * @param value - The numeric value to convert
 * @param sourceUnit - The source unit string (e.g., 'ft²', 'mm', 'lb')
 * @param targetType - The target quantity type for correct unit selection
 * @returns The normalised value in SI units
 */
export function normaliseToSI(
  value: number,
  sourceUnit: string,
  targetType: QuantityType
): number {
  if (!sourceUnit) return value;

  const normalisedUnit = sourceUnit.trim().toLowerCase();

  // Look up conversion factor
  const conversion = UNIT_CONVERSIONS[normalisedUnit];

  if (conversion && conversion.targetType.includes(targetType)) {
    return value * conversion.factor;
  }

  // If the unit matches the SI unit for the target type, no conversion needed
  const siUnit = SI_UNIT_STRINGS[targetType];
  if (normalisedUnit === siUnit.toLowerCase()) {
    return value;
  }

  // No conversion found — return value as-is (already assumed to be in SI)
  return value;
}

/**
 * Checks if a quantity value exceeds physically plausible bounds.
 * Returns true if the value is within bounds, false if it's out of bounds.
 *
 * @param value - The quantity value to check
 * @param type - The quantity type (area, volume, length, weight, count)
 * @returns true if within bounds, false if negative or exceeds maximum
 */
export function checkQuantityBounds(value: number, type: QuantityType): boolean {
  // Negative values are always out of bounds
  if (value < 0) return false;

  // Check against upper bound for the type
  const bounds = QUANTITY_BOUNDS[type];
  if (bounds && value > bounds.max) return false;

  return true;
}

/**
 * Extracts tagged metadata (fireRating, acousticRating, thermalTransmittance)
 * from recognised property sets.
 *
 * Only looks at property sets that are recognised (in RECOGNISED_PSETS list)
 * and extracts properties whose names match TAGGED_METADATA_KEYS.
 *
 * @param propertySets - Array of property sets from an element
 * @returns Record of tagged metadata key → value
 */
export function extractTaggedMetadata(
  propertySets: PropertySet[]
): Record<string, string | number> {
  const metadata: Record<string, string | number> = {};

  for (const pset of propertySets) {
    // Only process recognised property sets
    if (!pset.isRecognised) continue;

    // Verify set name is in RECOGNISED_PSETS
    const isRecognisedSet = (RECOGNISED_PSETS as readonly string[]).includes(pset.setName);
    if (!isRecognisedSet) continue;

    // Look for tagged metadata keys in properties
    for (const prop of pset.properties) {
      const metadataKey = TAGGED_METADATA_KEYS[prop.name as keyof typeof TAGGED_METADATA_KEYS];
      if (metadataKey && !prop.parseWarning) {
        // Only extract if value is a string or number
        if (typeof prop.value === 'string' || typeof prop.value === 'number') {
          metadata[metadataKey] = prop.value;
        }
      }
    }
  }

  return metadata;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────

/**
 * Extracts all quantities from an element's quantity sets.
 * Each quantity is normalised to SI units and tagged with source info.
 */
function extractElementQuantities(element: IfcElement): ExtractedQuantity[] {
  const quantities: ExtractedQuantity[] = [];

  for (const qSet of element.quantitySets) {
    for (const qty of qSet.quantities) {
      // Normalise the value to SI
      const normalisedValue = normaliseToSI(qty.value, qty.unit, qty.type);
      const siUnit = SI_UNIT_STRINGS[qty.type];

      quantities.push({
        name: qty.name,
        type: qty.type,
        value: normalisedValue,
        unit: siUnit,
        sourceElementGlobalId: element.globalId,
        sourceSetName: qSet.setName,
      });
    }
  }

  return quantities;
}

/**
 * Processes property sets and generates findings for parse warnings.
 * Preserves raw values and continues processing without aborting.
 */
function processPropertySets(
  propertySets: PropertySet[],
  elementGlobalId: string,
  findings: ValidationFinding[]
): void {
  for (const pset of propertySets) {
    for (const prop of pset.properties) {
      if (prop.parseWarning) {
        findings.push({
          id: generateFindingId(),
          type: 'parse_warning' as ValidationFindingType,
          severity: 'warning' as ValidationSeverity,
          message: `Property "${prop.name}" in set "${pset.setName}" on element ${elementGlobalId} could not be parsed to expected type. Raw value preserved: "${prop.rawValue ?? prop.value}"`,
          elementGlobalId,
          details: {
            propertySetName: pset.setName,
            propertyName: prop.name,
            rawValue: prop.rawValue ?? String(prop.value),
          },
        });
      }
    }
  }
}

/**
 * Computes model statistics from elements.
 */
function computeStatistics(elements: IfcElement[]): ModelStatistics {
  const totalElements = elements.length;
  const elementsByType: Record<string, number> = {};
  let elementsWithQuantities = 0;
  let elementsWithoutQuantities = 0;
  let unclassifiedElements = 0;

  for (const element of elements) {
    // Count by type
    elementsByType[element.entityType] = (elementsByType[element.entityType] || 0) + 1;

    // Count with/without quantities
    if (element.quantitySets.length > 0) {
      elementsWithQuantities++;
    } else {
      elementsWithoutQuantities++;
    }

    // Count unclassified
    if (element.entityType === 'IfcBuildingElementProxy' && !element.classification) {
      unclassifiedElements++;
    }
  }

  const quantityCoveragePercent = totalElements > 0
    ? (elementsWithQuantities / totalElements) * 100
    : 0;

  return {
    totalElements,
    elementsByType,
    elementsWithQuantities,
    elementsWithoutQuantities,
    unclassifiedElements,
    elementsByTradeSection: {}, // Populated after mapping
    quantityCoveragePercent,
  };
}

/**
 * Generates a unique finding ID.
 */
function generateFindingId(): string {
  return `finding_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Generates a unique extraction ID.
 */
function generateExtractionId(): string {
  return `ext_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
