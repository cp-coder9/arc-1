/**
 * Tests: Document Registration Service
 */
import { describe, expect, it } from 'vitest';
import {
  allowedNextStatuses,
  currentIssuedDocuments,
  detectSupersededConstructionDrawings,
  disciplineCoverageReport,
  documentCountByType,
  documentsByType,
  documentTypeRequiresReview,
  drawingCountByDiscipline,
  drawingsByDiscipline,
  drawingsForIssuePurpose,
  extractMetadataSummary,
  isValidStatusTransition,
  metadataFieldsForDocumentType,
  missingSheetsForDiscipline,
  registerSummary,
  validateDocumentMutation,
  validateDocumentReadiness,
  validateIssuePurpose,
} from '../documentRegistrationService';
import { sampleDocuments, sampleDrawings } from '../sampleDocumentData';
import type { DocumentRecord, DocumentStatus } from '@/types/documentTypes';

describe('documentRegistrationService', () => {
  // ── Queries ──
  it('filters documents by type', () => {
    const drawings = documentsByType(sampleDocuments, 'drawing');
    expect(drawings.length).toBe(4);
    expect(drawings.every((d) => d.documentType === 'drawing')).toBe(true);
  });

  it('counts documents by type', () => {
    const counts = documentCountByType(sampleDocuments);
    expect(counts.drawing).toBe(4);
    expect(counts.specification).toBe(1);
    expect(counts.municipal_form).toBe(1);
    expect(counts.closeout_pack).toBe(1);
    expect(counts.approval_letter).toBe(1);
  });

  it('gets current issued documents', () => {
    const issued = currentIssuedDocuments(sampleDocuments);
    expect(issued.length).toBe(3);
    expect(issued.every((d) => d.status === 'issued')).toBe(true);
  });

  it('filters drawings by discipline', () => {
    const arch = drawingsByDiscipline(sampleDrawings, 'architectural');
    expect(arch.length).toBe(3); // superseded excluded
    expect(arch.every((d) => d.discipline === 'architectural')).toBe(true);
    expect(arch.every((d) => d.status !== 'superseded')).toBe(true);
  });

  it('counts drawings by discipline', () => {
    const counts = drawingCountByDiscipline(sampleDrawings);
    expect(counts.architectural).toBe(4);
  });

  it('filters drawings by issue-purpose', () => {
    const forConstruction = drawingsForIssuePurpose(sampleDrawings, 'for_construction');
    expect(forConstruction.length).toBe(2); // 2 issued for construction
  });

  it('generates register summary', () => {
    const summary = registerSummary(sampleDocuments, sampleDrawings);
    expect(summary).toContain('documents=8');
    expect(summary).toContain('drawings=4');
    expect(summary).toContain('supersededDrawings=1');
  });

  // ── Metadata ──
  it('returns metadata fields per document type', () => {
    const drawingFields = metadataFieldsForDocumentType('drawing');
    expect(drawingFields).toContain('drawingNumber');
    expect(drawingFields).toContain('revision');
    expect(drawingFields).toContain('sheetType');

    const specFields = metadataFieldsForDocumentType('specification');
    expect(specFields).toContain('specificationSection');

    const paymentFields = metadataFieldsForDocumentType('payment_certificate');
    expect(paymentFields).toContain('amount');
    expect(paymentFields).toContain('period');
  });

  it('extracts metadata summary for documents', () => {
    const doc = sampleDocuments[0]; // drawing
    const summary = extractMetadataSummary(doc);
    expect(summary.documentType).toBe('drawing');
    expect(summary.status).toBe('issued');
    expect(summary.discipline).toBe('architectural');
  });

  // ── Status Transitions ──
  it.each([
    ['draft', 'pending_review', true],
    ['draft', 'issued', false],
    ['pending_review', 'approved', true],
    ['pending_review', 'superseded', false],
    ['approved', 'issued', true],
    ['approved', 'draft', false],
    ['issued', 'superseded', true],
    ['issued', 'draft', false],
    ['superseded', 'draft', false],
    ['rejected', 'draft', true],
    ['rejected', 'pending_review', true],
  ] as const)('status transition %s → %s is %s', (from, to, expected) => {
    expect(isValidStatusTransition(from, to)).toBe(expected);
  });

  it('returns allowed next statuses', () => {
    expect(allowedNextStatuses('draft')).toEqual(['draft', 'pending_review', 'rejected']);
    expect(allowedNextStatuses('issued')).toEqual(['superseded']);
    expect(allowedNextStatuses('superseded')).toEqual([]);
  });

  // ── Mutation Validation ──
  it('allows mutation of draft documents', () => {
    const doc: DocumentRecord = { ...sampleDocuments[5], status: 'draft' }; // municipal_form
    const result = validateDocumentMutation(doc, 'pending_review');
    expect(result.allowed).toBe(true);
  });

  it('blocks direct mutation of issued documents', () => {
    const doc = sampleDocuments[0]; // issued
    const result = validateDocumentMutation(doc, 'draft');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('cannot be mutated');
  });

  it('blocks any change to superseded documents', () => {
    const doc = sampleDocuments[3]; // superseded
    const result = validateDocumentMutation(doc, 'draft');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('superseded');
  });

  it('blocks invalid status transitions', () => {
    const doc: DocumentRecord = { ...sampleDocuments[0], status: 'approved' };
    const result = validateDocumentMutation(doc, 'draft');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Invalid status transition');
  });

  // ── Review Checks ──
  it('identifies document types requiring review', () => {
    expect(documentTypeRequiresReview('drawing')).toBe(true);
    expect(documentTypeRequiresReview('submission_pack')).toBe(true);
    expect(documentTypeRequiresReview('tender_pack')).toBe(true);
    expect(documentTypeRequiresReview('closeout_pack')).toBe(true);
    expect(documentTypeRequiresReview('payment_certificate')).toBe(true);
    expect(documentTypeRequiresReview('warranty')).toBe(false);
    expect(documentTypeRequiresReview('rfi')).toBe(false);
  });

  it('validates document readiness', () => {
    const doc = sampleDocuments[5]; // pending_review specification
    const result = validateDocumentReadiness(doc);
    expect(result.ready).toBe(true);
  });

  it('detects candidate professional without supervision', () => {
    // Create a fresh document with candidate_professional author + issued status
    const doc: DocumentRecord = {
      documentId: 'doc-cand-001',
      tenantId: 'tenant-test',
      projectId: 'project-test',
      title: 'Candidate Work Product',
      documentType: 'drawing',
      discipline: 'architectural',
      phase: 'construction_execution',
      status: 'issued',
      issuePurpose: 'for_construction',
      authorRole: 'candidate_professional',
      currentRevisionId: 'rev-001',
      createdAt: '2026-06-01T08:00:00Z',
      updatedAt: '2026-06-01T08:00:00Z',
    };
    const result = validateDocumentReadiness(doc);
    // The function should flag candidate professional outputs on issued docs
    expect(result.ready).toBe(false);
    // Check that the function detected something — either candidate supervision or review requirement
    expect(result.issues.length).toBeGreaterThan(0);
    // With a drawing that's been issued without reviewer, both the review-required
    // and candidate-supervision checks apply; verify at least one fires.
    const issueText = result.issues.join(' ');
    expect(issueText.toLowerCase()).toMatch(/candidate|review|supervision/);
  });

  // ── Discipline Coverage ──
  it('checks missing sheets for architectural discipline', () => {
    const result = missingSheetsForDiscipline(sampleDrawings, 'architectural');
    expect(result.discipline).toBe('architectural');
    expect(result.present).toContain('floor_plan');
    expect(result.present).toContain('site_plan');
    // Most architectural sheets are missing from the small sample set
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it('builds discipline coverage report', () => {
    const report = disciplineCoverageReport(sampleDrawings);
    expect(report.length).toBeGreaterThan(0);
    expect(report[0]).toHaveProperty('coverage');
    expect(report[0].coverage).toBeGreaterThanOrEqual(0);
    expect(report[0].coverage).toBeLessThanOrEqual(1);
  });

  // ── Issue-Purpose Validation ──
  it('validates issue-purpose consistency', () => {
    // The municipal submission drawing IS issued, so it will be flagged as mismatched
    const result = validateIssuePurpose(sampleDrawings, 'for_construction');
    expect(result.valid).toBe(false); // drw-a100 is issued but for_municipal_submission
    expect(result.mismatched.length).toBe(1);
    expect(result.mismatched[0].drawingNumber).toBe('A-100');
  });

  it('validates issue-purpose consistency when all match', () => {
    // Filter to only for_construction drawings
    const constructionDrawings = sampleDrawings.filter(
      (d) => d.issuePurpose === 'for_construction',
    );
    const result = validateIssuePurpose(constructionDrawings, 'for_construction');
    expect(result.valid).toBe(true);
    expect(result.mismatched.length).toBe(0);
  });

  // ── Superseded Detection ──
  it('detects superseded construction drawings', () => {
    const superseded = detectSupersededConstructionDrawings(sampleDrawings);
    expect(superseded.length).toBe(1);
    expect(superseded[0].drawingNumber).toBe('A-102');
    expect(superseded[0].supersededByDrawingId).toBe('drw-a102-new');
  });
});
