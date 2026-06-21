import type { DocumentRecord, DrawingIntelligenceResult, DrawingRecord, ReadinessFinding } from '@/services/documentRegisterService';

export function analyseDocument(document: DocumentRecord, drawings: DrawingRecord[]): DrawingIntelligenceResult {
  const drawing = drawings.find((item) => item.documentId === document.documentId);
  const findings: ReadinessFinding[] = [];
  if (document.status === 'pending_review') {
    findings.push({ code: 'DOCUMENT_REVIEW_REQUIRED', priority: 'medium', message: `${document.title} requires review before issue.`, assignedRoles: [document.reviewerRole ?? 'architect'], relatedDocumentId: document.documentId, relatedDrawingId: drawing?.drawingId });
  }
  if (document.authorRole === 'candidate_professional' && document.status !== 'draft') {
    findings.push({ code: 'CANDIDATE_SUPERVISION_REQUIRED', priority: 'high', message: `${document.title} requires responsible professional supervision before formal issue.`, assignedRoles: ['candidate_professional', document.reviewerRole ?? 'architect', 'admin'], relatedDocumentId: document.documentId });
  }
  return {
    documentId: document.documentId,
    classification: document.documentType,
    detectedDiscipline: document.discipline,
    extractedDrawingNumber: drawing?.drawingNumber,
    extractedRevision: drawing?.currentRevision,
    detectedIssuePurpose: document.issuePurpose,
    confidence: 0.82,
    findings
  };
}

export function analyseDocuments(documents: DocumentRecord[], drawings: DrawingRecord[]): DrawingIntelligenceResult[] {
  return documents.map((document) => analyseDocument(document, drawings));
}

export interface TitleBlockResult {
  drawingNumber: string;
  title: string;
  revision: string;
  scale: string;
  discipline: string;
  sheetType: string;
  confidence: string;
  rawSimulation: boolean;
}

export function simulateTitleBlockExtraction(drawing: DrawingRecord): TitleBlockResult {
  return {
    drawingNumber: drawing.drawingNumber,
    title: drawing.title,
    revision: drawing.currentRevision,
    scale: drawing.scale ?? 'NTS',
    discipline: drawing.discipline,
    sheetType: drawing.sheetType,
    confidence: 'medium',
    rawSimulation: true,
  };
}

export function simulateBatchTitleBlockExtraction(drawings: DrawingRecord[]): Map<string, TitleBlockResult> {
  const map = new Map<string, TitleBlockResult>();
  for (const drawing of drawings) {
    map.set(drawing.drawingId, simulateTitleBlockExtraction(drawing));
  }
  return map;
}

const SHEET_REQUIREMENTS: Record<string, string[]> = {
  for_municipal_submission: ['site_plan', 'floor_plan', 'section', 'elevation', 'detail'],
  for_review: ['site_plan', 'floor_plan', 'section', 'elevation'],
  for_construction: ['site_plan', 'floor_plan', 'section', 'elevation', 'detail'],
  for_tender: ['floor_plan', 'section', 'elevation'],
  as_built: ['site_plan', 'floor_plan', 'section', 'elevation'],
};

export function detectMissingSheets(drawings: DrawingRecord[], issuePurpose: string): string[] {
  const required = SHEET_REQUIREMENTS[issuePurpose] ?? [];
  const present = new Set(
    drawings
      .filter((d) => d.issuePurpose === issuePurpose && d.status === 'issued')
      .map((d) => d.sheetType),
  );
  return required.filter((sheet) => !present.has(sheet as any));
}

export function detectMissingSheetsByDiscipline(drawings: DrawingRecord[], issuePurpose: string, discipline: string): string[] {
  const required = SHEET_REQUIREMENTS[issuePurpose] ?? [];
  const present = new Set(
    drawings
      .filter((d) => d.issuePurpose === issuePurpose && d.status === 'issued' && d.discipline === discipline)
      .map((d) => d.sheetType),
  );
  return required.filter((sheet) => !present.has(sheet as any));
}

export interface ClassificationResult {
  classifiedAs: string;
  confidence: number;
  alternativeTypes?: string[];
}

export function simulateDocumentClassification(title: string, documentType: string): ClassificationResult {
  const drawingKeywords = ['plan', 'section', 'elevation', 'detail', 'drawing', 'floor', 'site'];
  const isDrawing = drawingKeywords.some((kw) => title.toLowerCase().includes(kw));

  if (isDrawing && documentType !== 'drawing') {
    return {
      classifiedAs: documentType,
      confidence: 0.85,
      alternativeTypes: ['drawing'],
    };
  }

  return {
    classifiedAs: documentType,
    confidence: 0.92,
  };
}

export interface IssuePurposeResult {
  detected: string;
  confidence: number;
}

export function simulateIssuePurposeDetection(document: DocumentRecord): IssuePurposeResult {
  const phase = document.phase;
  const purpose = document.issuePurpose;

  if (phase === purpose.replace('for_', '')) {
    return { detected: purpose, confidence: 0.9 };
  }
  return { detected: phase, confidence: 0.6 };
}

export interface IntelligenceSummaryResult {
  totalDocuments: number;
  averageConfidence: number;
  documentsNeedingReview: number;
}

export function intelligenceSummary(results: DrawingIntelligenceResult[]): IntelligenceSummaryResult {
  const totalDocuments = results.length;
  const totalConfidence = results.reduce((sum, r) => sum + r.confidence, 0);
  const documentsNeedingReview = results.filter((r) => r.findings.length > 0).length;

  return {
    totalDocuments,
    averageConfidence: totalDocuments > 0 ? totalConfidence / totalDocuments : 0,
    documentsNeedingReview,
  };
}
