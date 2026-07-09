/**
 * BIM Passport Adapter — Unit Tests
 *
 * Tests for Project Passport event creation and risk indicator logic.
 *
 * Requirements: 11.1, 11.2, 11.3
 */

import {
  buildExtractionPassportEvent,
  buildBoqPassportEvent,
  buildQualityRiskIndicator,
} from '../bimPassportAdapter';
import type {
  ExtractionResult,
  BoqDocument,
  ValidationReport,
  IfcElement,
  ValidationFinding,
  BoqSection,
  BoqLineItem,
} from '../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeElement(overrides: Partial<IfcElement> = {}): IfcElement {
  return {
    globalId: `GID_${Math.random().toString(36).slice(2, 12)}`,
    entityType: 'IfcWall',
    name: 'Test Wall',
    spatialContainment: 'storey-001',
    materials: [{ materialName: 'Concrete', thicknessMm: 200 }],
    quantitySets: [
      {
        setName: 'BaseQuantities',
        quantities: [
          {
            name: 'NetSideArea',
            type: 'area',
            value: 25.5,
            unit: 'm²',
            sourceElementGlobalId: 'GID_src',
            sourceSetName: 'BaseQuantities',
          },
        ],
      },
    ],
    propertySets: [],
    hasGeometry: true,
    taggedMetadata: {},
    ...overrides,
  };
}

function makeExtractionResult(overrides: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    extractionId: 'ext-001',
    projectId: 'proj-001',
    fileId: 'file-001',
    fileName: 'office-block.ifc',
    schemaVersion: 'IFC4',
    extractedAt: '2026-07-01T10:00:00Z',
    extractedBy: 'user-001',
    elements: [makeElement(), makeElement(), makeElement()],
    quantities: [],
    validationReport: {
      modelId: 'model-001',
      findings: [],
      statistics: {
        totalElements: 3,
        elementsByType: { IfcWall: 3 },
        elementsWithQuantities: 3,
        elementsWithoutQuantities: 0,
        unclassifiedElements: 0,
        elementsByTradeSection: {},
        quantityCoveragePercent: 100,
      },
      boqBlocked: false,
      generatedAt: '2026-07-01T10:00:00Z',
    },
    status: 'active',
    ...overrides,
  };
}

function makeBoqDocument(overrides: Partial<BoqDocument> = {}): BoqDocument {
  return {
    boqId: 'boq-001',
    projectId: 'proj-001',
    extractionId: 'ext-001',
    title: 'Office Block BoQ',
    status: 'draft',
    revision: 'A',
    generatedAt: '2026-07-01T11:00:00Z',
    generatedBy: 'user-001',
    currency: 'ZAR',
    sections: [
      {
        sectionNumber: '3',
        tradeSection: 'Concrete',
        title: 'Concrete',
        lineItems: [
          {
            itemNumber: '3.01',
            description: 'Reinforced concrete in columns',
            unit: 'm³',
            quantity: 12.5,
            sourceElementCount: 4,
            sourceElementGlobalIds: ['g1', 'g2', 'g3', 'g4'],
            elementType: 'IfcColumn',
          },
          {
            itemNumber: '3.02',
            description: 'Reinforced concrete in slabs',
            unit: 'm³',
            quantity: 85.3,
            sourceElementCount: 8,
            sourceElementGlobalIds: ['g5', 'g6', 'g7', 'g8', 'g9', 'g10', 'g11', 'g12'],
            elementType: 'IfcSlab',
          },
        ],
      },
      {
        sectionNumber: '5',
        tradeSection: 'Masonry',
        title: 'Masonry',
        lineItems: [
          {
            itemNumber: '5.01',
            description: 'Face brickwork',
            unit: 'm²',
            quantity: 340.0,
            sourceElementCount: 22,
            sourceElementGlobalIds: Array.from({ length: 22 }, (_, i) => `w${i}`),
            elementType: 'IfcWall',
          },
        ],
      },
    ],
    flaggedElementsSummary: [],
    totals: { totalLineItems: 3, totalSections: 2, totalElements: 34 },
    ...overrides,
  };
}

function makeValidationReport(overrides: Partial<ValidationReport> = {}): ValidationReport {
  return {
    modelId: 'model-001',
    findings: [],
    statistics: {
      totalElements: 100,
      elementsByType: { IfcWall: 50, IfcSlab: 30, IfcColumn: 20 },
      elementsWithQuantities: 80,
      elementsWithoutQuantities: 20,
      unclassifiedElements: 5,
      elementsByTradeSection: {},
      quantityCoveragePercent: 80,
    },
    boqBlocked: false,
    generatedAt: '2026-07-01T10:00:00Z',
    ...overrides,
  };
}

function makeErrorFinding(id: string): ValidationFinding {
  return {
    id,
    type: 'duplicate_globalid',
    severity: 'error',
    message: `Duplicate GlobalId: ${id}`,
  };
}

function makeWarningFinding(id: string): ValidationFinding {
  return {
    id,
    type: 'missing_quantities',
    severity: 'warning',
    message: `Missing quantities: ${id}`,
  };
}

// ─── buildExtractionPassportEvent ─────────────────────────────────────────

describe('buildExtractionPassportEvent', () => {
  it('produces event with correct type', () => {
    const result = makeExtractionResult();
    const event = buildExtractionPassportEvent(result);
    expect(event.type).toBe('bim_extraction');
  });

  it('includes projectId from extraction result', () => {
    const result = makeExtractionResult({ projectId: 'proj-xyz' });
    const event = buildExtractionPassportEvent(result);
    expect(event.projectId).toBe('proj-xyz');
  });

  it('includes fileName from extraction result', () => {
    const result = makeExtractionResult({ fileName: 'hospital-wing.ifc' });
    const event = buildExtractionPassportEvent(result);
    expect(event.fileName).toBe('hospital-wing.ifc');
  });

  it('includes schemaVersion from extraction result', () => {
    const result = makeExtractionResult({ schemaVersion: 'IFC2X3' });
    const event = buildExtractionPassportEvent(result);
    expect(event.schemaVersion).toBe('IFC2X3');
  });

  it('computes elementCount from elements array length', () => {
    const elements = [makeElement(), makeElement(), makeElement(), makeElement()];
    const result = makeExtractionResult({ elements });
    const event = buildExtractionPassportEvent(result);
    expect(event.elementCount).toBe(4);
  });

  it('computes quantityCoveragePercent from elements with quantities', () => {
    const withQuantities = makeElement(); // has quantitySets by default
    const withoutQuantities = makeElement({ quantitySets: [] });
    const result = makeExtractionResult({
      elements: [withQuantities, withQuantities, withoutQuantities],
    });
    const event = buildExtractionPassportEvent(result);
    // 2 out of 3 have quantities = 66.67%
    expect(event.quantityCoveragePercent).toBeCloseTo(66.67, 1);
  });

  it('returns 0% coverage when no elements exist', () => {
    const result = makeExtractionResult({ elements: [] });
    const event = buildExtractionPassportEvent(result);
    expect(event.quantityCoveragePercent).toBe(0);
  });

  it('returns 100% coverage when all elements have quantities', () => {
    const elements = [makeElement(), makeElement()];
    const result = makeExtractionResult({ elements });
    const event = buildExtractionPassportEvent(result);
    expect(event.quantityCoveragePercent).toBe(100);
  });

  it('includes extractedAt timestamp', () => {
    const result = makeExtractionResult({ extractedAt: '2026-08-15T14:30:00Z' });
    const event = buildExtractionPassportEvent(result);
    expect(event.extractedAt).toBe('2026-08-15T14:30:00Z');
  });

  it('handles elements with empty quantity sets (no quantities inside)', () => {
    const emptyQs = makeElement({
      quantitySets: [{ setName: 'BaseQuantities', quantities: [] }],
    });
    const result = makeExtractionResult({ elements: [emptyQs, makeElement()] });
    const event = buildExtractionPassportEvent(result);
    // Only 1 out of 2 has actual quantities
    expect(event.quantityCoveragePercent).toBe(50);
  });
});

// ─── buildBoqPassportEvent ────────────────────────────────────────────────

describe('buildBoqPassportEvent', () => {
  it('produces event with correct type', () => {
    const boq = makeBoqDocument();
    const event = buildBoqPassportEvent(boq);
    expect(event.type).toBe('bim_boq_generated');
  });

  it('includes projectId from BoQ', () => {
    const boq = makeBoqDocument({ projectId: 'proj-abc' });
    const event = buildBoqPassportEvent(boq);
    expect(event.projectId).toBe('proj-abc');
  });

  it('includes boqId from BoQ', () => {
    const boq = makeBoqDocument({ boqId: 'boq-999' });
    const event = buildBoqPassportEvent(boq);
    expect(event.boqId).toBe('boq-999');
  });

  it('includes status from BoQ', () => {
    const boq = makeBoqDocument({ status: 'issued' });
    const event = buildBoqPassportEvent(boq);
    expect(event.status).toBe('issued');
  });

  it('computes tradeSectionCount from sections array length', () => {
    const boq = makeBoqDocument();
    const event = buildBoqPassportEvent(boq);
    expect(event.tradeSectionCount).toBe(2);
  });

  it('computes lineItemCount as sum of all line items across sections', () => {
    const boq = makeBoqDocument();
    const event = buildBoqPassportEvent(boq);
    // 2 items in Concrete + 1 item in Masonry = 3
    expect(event.lineItemCount).toBe(3);
  });

  it('includes generatedAt timestamp from BoQ', () => {
    const boq = makeBoqDocument({ generatedAt: '2026-09-01T09:00:00Z' });
    const event = buildBoqPassportEvent(boq);
    expect(event.generatedAt).toBe('2026-09-01T09:00:00Z');
  });

  it('handles BoQ with no sections', () => {
    const boq = makeBoqDocument({ sections: [] });
    const event = buildBoqPassportEvent(boq);
    expect(event.tradeSectionCount).toBe(0);
    expect(event.lineItemCount).toBe(0);
  });

  it('handles sections with no line items', () => {
    const boq = makeBoqDocument({
      sections: [
        {
          sectionNumber: '1',
          tradeSection: 'Preliminaries',
          title: 'Preliminaries',
          lineItems: [],
        },
      ],
    });
    const event = buildBoqPassportEvent(boq);
    expect(event.tradeSectionCount).toBe(1);
    expect(event.lineItemCount).toBe(0);
  });
});

// ─── buildQualityRiskIndicator ────────────────────────────────────────────

describe('buildQualityRiskIndicator', () => {
  it('returns null when no error-severity findings', () => {
    const report = makeValidationReport({ findings: [] });
    const indicator = buildQualityRiskIndicator(report);
    expect(indicator).toBeNull();
  });

  it('returns null when findings are only warnings and info', () => {
    const report = makeValidationReport({
      findings: [
        makeWarningFinding('w1'),
        makeWarningFinding('w2'),
        { id: 'i1', type: 'missing_material', severity: 'info', message: 'No material' },
      ],
    });
    const indicator = buildQualityRiskIndicator(report);
    expect(indicator).toBeNull();
  });

  it('returns medium severity for 1 error', () => {
    const report = makeValidationReport({
      findings: [makeErrorFinding('e1')],
    });
    const indicator = buildQualityRiskIndicator(report);
    expect(indicator).not.toBeNull();
    expect(indicator!.severity).toBe('medium');
    expect(indicator!.errorCount).toBe(1);
  });

  it('returns medium severity for 2 errors', () => {
    const report = makeValidationReport({
      findings: [makeErrorFinding('e1'), makeErrorFinding('e2')],
    });
    const indicator = buildQualityRiskIndicator(report);
    expect(indicator!.severity).toBe('medium');
    expect(indicator!.errorCount).toBe(2);
  });

  it('returns medium severity for 3 errors', () => {
    const report = makeValidationReport({
      findings: [makeErrorFinding('e1'), makeErrorFinding('e2'), makeErrorFinding('e3')],
    });
    const indicator = buildQualityRiskIndicator(report);
    expect(indicator!.severity).toBe('medium');
    expect(indicator!.errorCount).toBe(3);
  });

  it('returns high severity for 4 errors', () => {
    const report = makeValidationReport({
      findings: [
        makeErrorFinding('e1'),
        makeErrorFinding('e2'),
        makeErrorFinding('e3'),
        makeErrorFinding('e4'),
      ],
    });
    const indicator = buildQualityRiskIndicator(report);
    expect(indicator!.severity).toBe('high');
    expect(indicator!.errorCount).toBe(4);
  });

  it('returns high severity for more than 4 errors', () => {
    const findings = Array.from({ length: 7 }, (_, i) => makeErrorFinding(`e${i}`));
    const report = makeValidationReport({ findings });
    const indicator = buildQualityRiskIndicator(report);
    expect(indicator!.severity).toBe('high');
    expect(indicator!.errorCount).toBe(7);
  });

  it('counts only error-severity findings, ignoring warnings', () => {
    const report = makeValidationReport({
      findings: [
        makeErrorFinding('e1'),
        makeWarningFinding('w1'),
        makeWarningFinding('w2'),
        makeErrorFinding('e2'),
      ],
    });
    const indicator = buildQualityRiskIndicator(report);
    expect(indicator!.errorCount).toBe(2);
    expect(indicator!.severity).toBe('medium');
  });

  it('has category "model_quality"', () => {
    const report = makeValidationReport({
      findings: [makeErrorFinding('e1')],
    });
    const indicator = buildQualityRiskIndicator(report);
    expect(indicator!.category).toBe('model_quality');
  });

  it('includes a descriptive message with singular for 1 error', () => {
    const report = makeValidationReport({
      findings: [makeErrorFinding('e1')],
    });
    const indicator = buildQualityRiskIndicator(report);
    expect(indicator!.message).toContain('1 error-severity finding');
  });

  it('includes a descriptive message with plural for multiple errors', () => {
    const report = makeValidationReport({
      findings: [makeErrorFinding('e1'), makeErrorFinding('e2'), makeErrorFinding('e3')],
    });
    const indicator = buildQualityRiskIndicator(report);
    expect(indicator!.message).toContain('3 error-severity findings');
  });
});
