/**
 * Drawing Intelligence Service
 *
 * Simulated OCR/AI analysis for drawings and documents.
 * Defines structured output shapes for future real AI integrations.
 * Currently simulates extracted metadata using structured sample data.
 *
 * @module documents_drawing_intelligence
 */

import type {
  Discipline,
  DocumentRecord,
  DocumentType,
  DrawingIntelligenceResult,
  DrawingRecord,
  IssuePurpose,
  ReadinessFinding,
  SheetType,
} from '@/types/documentTypes';

// ── Document Analysis ────────────────────────────────────────────────────────

/** Analyse a single document — simulate OCR/AI title-block extraction. */
export function analyseDocument(
  document: DocumentRecord,
  drawings: DrawingRecord[],
): DrawingIntelligenceResult {
  const drawing = drawings.find((d) => d.documentId === document.documentId);
  const findings: ReadinessFinding[] = [];

  // Review required finding
  if (document.status === 'pending_review') {
    findings.push({
      code: 'DOCUMENT_REVIEW_REQUIRED',
      priority: 'medium',
      message: `${document.title} requires review before issue.`,
      assignedRoles: [document.reviewerRole ?? 'architect'],
      relatedDocumentId: document.documentId,
      relatedDrawingId: drawing?.drawingId,
    });
  }

  // Candidate professional supervision
  if (document.authorRole === 'candidate_professional' && document.status !== 'draft') {
    findings.push({
      code: 'CANDIDATE_SUPERVISION_REQUIRED',
      priority: 'high',
      message: `${document.title} requires responsible professional supervision before formal issue.`,
      assignedRoles: ['candidate_professional', document.reviewerRole ?? 'architect', 'admin'],
      relatedDocumentId: document.documentId,
    });
  }

  return {
    documentId: document.documentId,
    classification: document.documentType,
    detectedDiscipline: document.discipline,
    extractedDrawingNumber: drawing?.drawingNumber,
    extractedRevision: drawing?.currentRevision,
    detectedIssuePurpose: document.issuePurpose,
    confidence: computeConfidence(document),
    findings,
  };
}

/** Batch-analyse all documents with their associated drawings. */
export function analyseDocuments(
  documents: DocumentRecord[],
  drawings: DrawingRecord[],
): DrawingIntelligenceResult[] {
  return documents.map((doc) => analyseDocument(doc, drawings));
}

// ── Title Block Simulation ───────────────────────────────────────────────────

/** Simulated title-block extraction result. */
export interface SimulatedTitleBlock {
  drawingNumber: string | null;
  title: string | null;
  revision: string | null;
  scale: string | null;
  date: string | null;
  author: string | null;
  discipline: Discipline | null;
  sheetType: SheetType | null;
  confidence: 'low' | 'medium' | 'high';
  rawSimulation: boolean;
}

/** Simulate extracting title-block data from a drawing record. */
export function simulateTitleBlockExtraction(drawing: DrawingRecord): SimulatedTitleBlock {
  return {
    drawingNumber: drawing.drawingNumber,
    title: drawing.title,
    revision: drawing.currentRevision,
    scale: drawing.scale || 'Not specified',
    date: new Date().toISOString().split('T')[0],
    author: 'Simulated Architect',
    discipline: drawing.discipline,
    sheetType: drawing.sheetType,
    confidence: 'medium',
    rawSimulation: true,
  };
}

/** Batch title-block simulation. */
export function simulateBatchTitleBlockExtraction(
  drawings: DrawingRecord[],
): Map<string, SimulatedTitleBlock> {
  const results = new Map<string, SimulatedTitleBlock>();
  for (const drawing of drawings) {
    results.set(drawing.drawingId, simulateTitleBlockExtraction(drawing));
  }
  return results;
}

// ── Missing Sheet Detection ──────────────────────────────────────────────────

/** Required sheets per issue-purpose context. */
const REQUIRED_SHEETS_FOR_PURPOSE: Record<IssuePurpose, SheetType[]> = {
  for_review: ['site_plan', 'floor_plan', 'section', 'elevation'],
  for_information: [],
  for_municipal_submission: ['site_plan', 'floor_plan', 'section', 'elevation', 'detail'],
  for_tender: ['floor_plan', 'section', 'elevation', 'schedule'],
  for_construction: ['floor_plan', 'section', 'elevation', 'detail', 'schedule'],
  as_built: ['site_plan', 'floor_plan', 'section', 'elevation', 'detail'],
  closeout: ['site_plan', 'floor_plan', 'section', 'elevation', 'detail', 'schedule'],
};

/** Detect which sheet types are missing for a given issue-purpose. */
export function detectMissingSheets(
  drawings: DrawingRecord[],
  issuePurpose: IssuePurpose,
): SheetType[] {
  const required = REQUIRED_SHEETS_FOR_PURPOSE[issuePurpose] || [];
  const activeDrawings = drawings.filter(
    (d) => d.issuePurpose === issuePurpose && d.status !== 'superseded',
  );
  const presentSheets = new Set(activeDrawings.map((d) => d.sheetType));
  return required.filter((s) => !presentSheets.has(s));
}

/** Detect missing sheets grouped by discipline. */
export function detectMissingSheetsByDiscipline(
  drawings: DrawingRecord[],
  issuePurpose: IssuePurpose,
  discipline: Discipline,
): SheetType[] {
  const disciplineDrawings = drawings.filter(
    (d) => d.discipline === discipline && d.issuePurpose === issuePurpose && d.status !== 'superseded',
  );
  return detectMissingSheets(disciplineDrawings, issuePurpose);
}

// ── Classification & Detection Simulation ────────────────────────────────────

/** Simulate automatic document type classification. */
export function simulateDocumentClassification(
  title: string,
  documentType: DocumentType,
): { classifiedAs: DocumentType; confidence: number; alternativeTypes: DocumentType[] } {
  // Simple keyword-based simulation
  const lower = title.toLowerCase();
  const alternatives: DocumentType[] = [];

  if (lower.includes('drawing') || lower.includes('plan') || lower.includes('section')) {
    if (!['drawing'].includes(documentType)) alternatives.push('drawing');
  }
  if (lower.includes('spec') || lower.includes('schedule of')) {
    if (!['specification'].includes(documentType)) alternatives.push('specification');
  }

  return {
    classifiedAs: documentType,
    confidence: 0.82,
    alternativeTypes: alternatives.slice(0, 3),
  };
}

/** Simulate issue-purpose detection from document metadata. */
export function simulateIssuePurposeDetection(
  document: DocumentRecord,
): { detected: IssuePurpose; confidence: number } {
  const phaseToPurpose: Record<string, IssuePurpose> = {
    municipal_submission: 'for_municipal_submission',
    tender_procurement: 'for_tender',
    construction_execution: 'for_construction',
    closeout: 'closeout',
  };

  const detected = phaseToPurpose[document.phase] || 'for_review';
  return { detected, confidence: detected === document.issuePurpose ? 0.9 : 0.6 };
}

// ── Confidence Scoring ───────────────────────────────────────────────────────

function computeConfidence(doc: DocumentRecord): number {
  // Higher confidence for documents with complete metadata
  let base = 0.7;
  if (doc.reviewerRole) base += 0.1;
  if (doc.linkedProjectRecordId) base += 0.05;
  if (doc.status === 'issued') base += 0.05;
  return Math.min(base, 0.99);
}

/** Generate a summary of intelligence results. */
export function intelligenceSummary(results: DrawingIntelligenceResult[]): {
  totalDocuments: number;
  averageConfidence: number;
  documentsNeedingReview: number;
  candidateSupervisionRequired: number;
} {
  return {
    totalDocuments: results.length,
    averageConfidence:
      results.length > 0
        ? results.reduce((sum, r) => sum + r.confidence, 0) / results.length
        : 0,
    documentsNeedingReview: results.filter((r) =>
      r.findings.some((f) => f.code === 'DOCUMENT_REVIEW_REQUIRED'),
    ).length,
    candidateSupervisionRequired: results.filter((r) =>
      r.findings.some((f) => f.code === 'CANDIDATE_SUPERVISION_REQUIRED'),
    ).length,
  };
}
