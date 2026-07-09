/**
 * BIM Passport Adapter — Project Passport Integration
 *
 * Transforms BIM extraction results, BoQ documents, and validation reports
 * into Project Passport events and risk indicators.
 *
 * Requirements: 11.1, 11.2, 11.3
 */

import type {
  ExtractionResult,
  BoqDocument,
  ValidationReport,
  BimExtractionEvent,
  BimBoqEvent,
  BimQualityRiskIndicator,
} from './types';

/**
 * Creates a Project Passport event from an extraction result.
 *
 * Requirement 11.1: Record extraction event with model filename, schema version,
 * element count, quantity coverage percentage, and extraction timestamp.
 */
export function buildExtractionPassportEvent(result: ExtractionResult): BimExtractionEvent {
  const elementCount = result.elements.length;
  const elementsWithQuantities = result.elements.filter(
    (el) => el.quantitySets.length > 0 && el.quantitySets.some((qs) => qs.quantities.length > 0),
  ).length;
  const quantityCoveragePercent =
    elementCount > 0 ? (elementsWithQuantities / elementCount) * 100 : 0;

  return {
    type: 'bim_extraction',
    projectId: result.projectId,
    fileName: result.fileName,
    schemaVersion: result.schemaVersion,
    elementCount,
    quantityCoveragePercent,
    extractedAt: result.extractedAt,
  };
}

/**
 * Creates a Project Passport event from BoQ generation.
 *
 * Requirement 11.2: Update project record with BoQ status, trade section count,
 * total line item count, and generation timestamp.
 */
export function buildBoqPassportEvent(boq: BoqDocument): BimBoqEvent {
  const tradeSectionCount = boq.sections.length;
  const lineItemCount = boq.sections.reduce(
    (total, section) => total + section.lineItems.length,
    0,
  );

  return {
    type: 'bim_boq_generated',
    projectId: boq.projectId,
    boqId: boq.boqId,
    status: boq.status,
    tradeSectionCount,
    lineItemCount,
    generatedAt: boq.generatedAt,
  };
}

/**
 * Creates a risk indicator from validation error findings.
 *
 * Requirement 11.3: Set risk indicator for BIM quality with severity proportional
 * to the error count: 1–3 errors → medium, 4+ errors → high, 0 errors → null.
 */
export function buildQualityRiskIndicator(
  report: ValidationReport,
): BimQualityRiskIndicator | null {
  const errorCount = report.findings.filter((f) => f.severity === 'error').length;

  if (errorCount === 0) {
    return null;
  }

  const severity: 'medium' | 'high' = errorCount >= 4 ? 'high' : 'medium';

  return {
    category: 'model_quality',
    severity,
    errorCount,
    message:
      errorCount === 1
        ? '1 error-severity finding detected in BIM model'
        : `${errorCount} error-severity findings detected in BIM model`,
  };
}
