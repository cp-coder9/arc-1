/**
 * Tests: Drawing Intelligence Service
 *
 * Title block simulation, confidence scoring, missing sheet detection,
 * document classification, and issue-purpose detection.
 */
import { describe, expect, it } from 'vitest';
import {
  analyseDocument,
  analyseDocuments,
  detectMissingSheets,
  detectMissingSheetsByDiscipline,
  intelligenceSummary,
  simulateBatchTitleBlockExtraction,
  simulateDocumentClassification,
  simulateIssuePurposeDetection,
  simulateTitleBlockExtraction,
} from '../drawingIntelligenceService';
import { sampleDocuments, sampleDrawings } from '../sampleDocumentData';

describe('drawingIntelligenceService', () => {
  // ── Document Analysis ──
  it('analyses a single document', () => {
    const doc = sampleDocuments[0]; // issued drawing
    const result = analyseDocument(doc, sampleDrawings);
    expect(result.documentId).toBe('doc-a100');
    expect(result.classification).toBe('drawing');
    expect(result.detectedDiscipline).toBe('architectural');
    expect(result.extractedDrawingNumber).toBe('A-100');
    expect(result.extractedRevision).toBe('B');
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it('detects review requirement for pending_review documents', () => {
    const doc = sampleDocuments[5]; // pending_review specification
    const result = analyseDocument(doc, sampleDrawings);
    expect(result.findings.some((f) => f.code === 'DOCUMENT_REVIEW_REQUIRED')).toBe(true);
  });

  it('detects candidate professional supervision requirement', () => {
    const doc = { ...sampleDocuments[0], authorRole: 'candidate_professional' as const, status: 'pending_review' as const };
    const result = analyseDocument(doc, sampleDrawings);
    expect(result.findings.some((f) => f.code === 'CANDIDATE_SUPERVISION_REQUIRED')).toBe(true);
  });

  it('batch-analyses all documents', () => {
    const results = analyseDocuments(sampleDocuments, sampleDrawings);
    expect(results.length).toBe(sampleDocuments.length);
    expect(results.every((r) => r.confidence > 0)).toBe(true);
  });

  // ── Title Block Simulation ──
  it('simulates title block extraction', () => {
    const drawing = sampleDrawings[0];
    const result = simulateTitleBlockExtraction(drawing);

    expect(result.drawingNumber).toBe('A-100');
    expect(result.title).toBe('Site Plan');
    expect(result.revision).toBe('B');
    expect(result.scale).toBe('1:200');
    expect(result.discipline).toBe('architectural');
    expect(result.sheetType).toBe('site_plan');
    expect(result.confidence).toBe('medium');
    expect(result.rawSimulation).toBe(true);
  });

  it('batch-simulates title block extraction', () => {
    const results = simulateBatchTitleBlockExtraction(sampleDrawings);
    expect(results.size).toBe(sampleDrawings.length);
    expect(results.get('drw-a100')?.drawingNumber).toBe('A-100');
  });

  // ── Missing Sheet Detection ──
  it('detects missing sheets for municipal submission', () => {
    const missing = detectMissingSheets(sampleDrawings, 'for_municipal_submission');
    // Only 1 municipal submission drawing in the sample (site plan), so floor_plan, section, elevation, detail are missing
    expect(missing.length).toBeGreaterThan(0);
    expect(missing).toContain('floor_plan');
    expect(missing).toContain('section');
    expect(missing).toContain('elevation');
  });

  it('returns empty missing sheets for for_review', () => {
    // for_review requires site_plan, floor_plan, section, elevation
    const missing = detectMissingSheets(sampleDrawings, 'for_review');
    // No drawings have issuePurpose 'for_review', so all are missing
    expect(missing.length).toBe(4);
  });

  it('detects missing sheets by discipline and purpose', () => {
    const missing = detectMissingSheetsByDiscipline(
      sampleDrawings,
      'for_municipal_submission',
      'architectural',
    );
    expect(missing.length).toBeGreaterThan(0);
  });

  // ── Classification Simulation ──
  it('simulates document classification', () => {
    const result = simulateDocumentClassification('Ground Floor Plan', 'drawing');
    expect(result.classifiedAs).toBe('drawing');
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('suggests alternative types based on keywords', () => {
    const result = simulateDocumentClassification('Roof Section Drawing', 'specification');
    expect(result.alternativeTypes).toContain('drawing');
  });

  // ── Issue-Purpose Detection ──
  it('detects issue-purpose from phase', () => {
    const doc = sampleDocuments[0]; // phase=municipal_submission, issuePurpose=for_municipal_submission
    const result = simulateIssuePurposeDetection(doc);
    expect(result.detected).toBe('for_municipal_submission');
    expect(result.confidence).toBe(0.9); // matching
  });

  it('gives lower confidence when phase and purpose mismatch', () => {
    const doc = {
      ...sampleDocuments[0],
      phase: 'closeout' as const,
      issuePurpose: 'for_construction' as const,
    };
    const result = simulateIssuePurposeDetection(doc);
    expect(result.detected).toBe('closeout');
    expect(result.confidence).toBe(0.6);
  });

  // ── Intelligence Summary ──
  it('computes intelligence summary', () => {
    const results = analyseDocuments(sampleDocuments, sampleDrawings);
    const summary = intelligenceSummary(results);

    expect(summary.totalDocuments).toBe(sampleDocuments.length);
    expect(summary.averageConfidence).toBeGreaterThan(0);
    expect(summary.averageConfidence).toBeLessThan(1);
    // The specification is pending_review, so should be counted
    expect(summary.documentsNeedingReview).toBeGreaterThanOrEqual(1);
  });
});
