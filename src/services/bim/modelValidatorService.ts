/**
 * Model Validator Service — BIM/IFC Quantity Extraction Bridge
 *
 * Validates parsed IFC models for data quality issues and produces
 * categorised findings reports with summary statistics.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
 */

import { randomUUID } from 'crypto';
import type {
  ParsedIfcModel,
  ExtractedQuantity,
  IfcElement,
  ValidationReport,
  ValidationFinding,
  ModelStatistics,
  MappedElement,
} from './types';

/**
 * Validates a parsed model and extraction result, producing a report
 * with categorised findings and summary statistics.
 *
 * Findings are categorised by severity:
 * - "error" — blocks BoQ generation
 * - "warning" — allows generation with caveats
 * - "info" — advisory only
 */
export function validateModel(
  model: ParsedIfcModel,
  quantities: ExtractedQuantity[],
): ValidationReport {
  const findings: ValidationFinding[] = [];

  // Run all find functions
  findings.push(...findDuplicateGlobalIds(model.elements));
  findings.push(...findMissingQuantities(model.elements));
  findings.push(...findUnclassifiedElements(model.elements));
  findings.push(...findMissingMaterials(model.elements));

  // Edge case: zero extractable quantities — all elements lack quantity sets
  const elementsWithQuantities = model.elements.filter(
    (el) => el.quantitySets.length > 0
  );
  if (model.elements.length > 0 && elementsWithQuantities.length === 0 && quantities.length === 0) {
    findings.push({
      id: randomUUID(),
      type: 'no_extractable_quantities',
      severity: 'error',
      message:
        'The model contains no extractable quantity data. All elements lack quantity sets and BoQ generation cannot proceed.',
    });
  }

  const statistics = computeStatistics(model.elements);
  const boqBlocked = isBoqBlocked(findings);

  return {
    modelId: model.fileId,
    findings,
    statistics,
    boqBlocked,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Checks for duplicate GlobalIds within the model.
 * Duplicate GlobalIds produce error-severity findings.
 */
export function findDuplicateGlobalIds(elements: IfcElement[]): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const seen = new Map<string, IfcElement>();

  for (const element of elements) {
    const existing = seen.get(element.globalId);
    if (existing) {
      findings.push({
        id: randomUUID(),
        type: 'duplicate_globalid',
        severity: 'error',
        message: `Duplicate GlobalId "${element.globalId}" found on element "${element.name}" (${element.entityType}). This GlobalId is also used by "${existing.name}" (${existing.entityType}).`,
        elementGlobalId: element.globalId,
        elementType: element.entityType,
        details: {
          duplicateOf: existing.name,
          duplicateOfType: existing.entityType,
        },
      });
    } else {
      seen.set(element.globalId, element);
    }
  }

  return findings;
}

/**
 * Identifies elements that have geometry (hasGeometry: true) but no quantity sets.
 * These produce warning-severity findings.
 */
export function findMissingQuantities(elements: IfcElement[]): ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  for (const element of elements) {
    if (element.hasGeometry && element.quantitySets.length === 0) {
      findings.push({
        id: randomUUID(),
        type: 'missing_quantities',
        severity: 'warning',
        message: `Element "${element.name}" (${element.entityType}) has geometry but no IfcElementQuantity set. Recommend assigning quantity sets for accurate extraction.`,
        elementGlobalId: element.globalId,
        elementType: element.entityType,
      });
    }
  }

  return findings;
}

/**
 * Identifies IfcBuildingElementProxy elements that have no classification reference.
 * These produce warning-severity findings.
 */
export function findUnclassifiedElements(elements: IfcElement[]): ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  for (const element of elements) {
    if (element.entityType === 'IfcBuildingElementProxy' && !element.classification) {
      findings.push({
        id: randomUUID(),
        type: 'unclassified_element',
        severity: 'warning',
        message: `Element "${element.name}" is an IfcBuildingElementProxy with no classification reference. Manual classification is recommended for accurate trade section mapping.`,
        elementGlobalId: element.globalId,
        elementType: element.entityType,
      });
    }
  }

  return findings;
}

/**
 * Identifies elements with no material assignment.
 * These produce info-severity findings.
 */
export function findMissingMaterials(elements: IfcElement[]): ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  for (const element of elements) {
    if (element.materials.length === 0) {
      findings.push({
        id: randomUUID(),
        type: 'missing_material',
        severity: 'info',
        message: `Element "${element.name}" (${element.entityType}) has no material assignment.`,
        elementGlobalId: element.globalId,
        elementType: element.entityType,
      });
    }
  }

  return findings;
}

/**
 * Computes model statistics from elements and optionally mapped elements.
 *
 * Statistics include:
 * - totalElements: count of all elements
 * - elementsByType: count per IFC entity type
 * - elementsWithQuantities: count of elements with at least one quantity set
 * - elementsWithoutQuantities: count of elements with no quantity sets
 * - unclassifiedElements: count of IfcBuildingElementProxy without classification
 * - elementsByTradeSection: count per trade section (populated if mappedElements provided)
 * - quantityCoveragePercent: (withQuantities / total) * 100
 */
export function computeStatistics(
  elements: IfcElement[],
  mappedElements?: MappedElement[],
): ModelStatistics {
  const totalElements = elements.length;

  // Count elements by IFC entity type
  const elementsByType: Record<string, number> = {};
  for (const element of elements) {
    elementsByType[element.entityType] = (elementsByType[element.entityType] || 0) + 1;
  }

  // Count elements with/without quantities
  const elementsWithQuantities = elements.filter(
    (el) => el.quantitySets.length > 0
  ).length;
  const elementsWithoutQuantities = totalElements - elementsWithQuantities;

  // Count unclassified elements (IfcBuildingElementProxy without classification)
  const unclassifiedElements = elements.filter(
    (el) => el.entityType === 'IfcBuildingElementProxy' && !el.classification
  ).length;

  // Count elements by trade section (only if mappedElements provided)
  const elementsByTradeSection: Record<string, number> = {};
  if (mappedElements) {
    for (const mapped of mappedElements) {
      elementsByTradeSection[mapped.tradeSection] =
        (elementsByTradeSection[mapped.tradeSection] || 0) + 1;
    }
  }

  // Compute quantity coverage percentage
  const quantityCoveragePercent =
    totalElements > 0 ? (elementsWithQuantities / totalElements) * 100 : 0;

  return {
    totalElements,
    elementsByType,
    elementsWithQuantities,
    elementsWithoutQuantities,
    unclassifiedElements,
    elementsByTradeSection,
    quantityCoveragePercent,
  };
}

/**
 * Determines if BoQ generation should be blocked based on findings.
 * Returns true if ANY finding has severity 'error'.
 */
export function isBoqBlocked(findings: ValidationFinding[]): boolean {
  return findings.some((f) => f.severity === 'error');
}
