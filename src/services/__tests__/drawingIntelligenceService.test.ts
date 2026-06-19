import { describe, expect, it } from 'vitest';
import {
  analyseDocument,
  analyseDocuments,
} from '../drawingIntelligenceService';
import { sampleDocuments, sampleDrawings } from '../sampleDocumentData';

describe('drawingIntelligenceService', () => {
  it('analyses a single document', () => {
    const doc = sampleDocuments[0];
    const result = analyseDocument(doc, sampleDrawings);
    expect(result.documentId).toBe('doc-a100');
    expect(result.classification).toBe('drawing');
    expect(result.detectedDiscipline).toBe('architectural');
    expect(result.extractedDrawingNumber).toBe('A-100');
    expect(result.extractedRevision).toBe('B');
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it('detects review requirement for pending_review documents', () => {
    const doc = sampleDocuments[5];
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
});
