/**
 * Tests: Project Record Adapter
 *
 * Verifies all 9 record type mappings, correct payload shapes,
 * and proper ProjectRecord envelope construction.
 */
import { describe, expect, it } from 'vitest';
import {
  buildPayload,
  buildProjectRecord,
  groupRecordsByType,
  linkedRecordIds,
  projectRecordsFromDocuments,
  recordTypeForDocument,
  recordsRequiringApproval,
} from '../projectRecordAdapter';
import { sampleDocuments, sampleDrawings } from '../sampleDocumentData';
import type { DocumentRecord, ProjectRecord } from '@/types/documentTypes';

describe('projectRecordAdapter', () => {
  // ── Record Type Mapping ──
  it('maps drawing documents to correct project record types', () => {
    // doc-a100: municipal submission drawing → drawing_revision
    const doc0 = sampleDocuments[0];
    const drawing0 = sampleDrawings.find((d) => d.documentId === doc0.documentId);
    expect(recordTypeForDocument(doc0, Boolean(drawing0))).toBe('drawing_revision');

    // doc-a101: construction drawing → technical_drawings
    const doc2 = sampleDocuments[2];
    const drawing2 = sampleDrawings.find((d) => d.documentId === doc2.documentId);
    expect(recordTypeForDocument(doc2, Boolean(drawing2))).toBe('technical_drawings');

    // doc-a102 (superseded): still technical_drawings since it's for_construction
    const doc3 = sampleDocuments[3];
    const drawing3 = sampleDrawings.find((d) => d.documentId === doc3.documentId);
    expect(recordTypeForDocument(doc3, Boolean(drawing3))).toBe('technical_drawings');

    // doc-a102-new: construction → technical_drawings
    const doc4 = sampleDocuments[4];
    const drawing4 = sampleDrawings.find((d) => d.documentId === doc4.documentId);
    expect(recordTypeForDocument(doc4, Boolean(drawing4))).toBe('technical_drawings');

    // doc-spec-001: specification without drawing → drawing_revision (default)
    const doc5 = sampleDocuments[5];
    const drawing5 = sampleDrawings.find((d) => d.documentId === doc5.documentId);
    expect(recordTypeForDocument(doc5, Boolean(drawing5))).toBe('drawing_revision');

    // doc-mun-form-001: municipal_form → drawing_revision (default)
    const doc1 = sampleDocuments[1];
    const drawing1 = sampleDrawings.find((d) => d.documentId === doc1.documentId);
    expect(recordTypeForDocument(doc1, Boolean(drawing1))).toBe('drawing_revision');

    // doc-closeout-001: closeout_pack → closeout_pack
    const doc6 = sampleDocuments[6];
    const drawing6 = sampleDrawings.find((d) => d.documentId === doc6.documentId);
    expect(recordTypeForDocument(doc6, Boolean(drawing6))).toBe('closeout_pack');

    // doc-approval-001: approval_letter → municipal_approval_letter
    const doc7 = sampleDocuments[7];
    const drawing7 = sampleDrawings.find((d) => d.documentId === doc7.documentId);
    expect(recordTypeForDocument(doc7, Boolean(drawing7))).toBe('municipal_approval_letter');
  });

  it('maps document types to correct project record types', () => {
    const baseDoc: DocumentRecord = { ...sampleDocuments[0] };
    expect(recordTypeForDocument({ ...baseDoc, documentType: 'submission_pack' }, false)).toBe('municipal_submission_pack');
    expect(recordTypeForDocument({ ...baseDoc, documentType: 'approval_letter' }, false)).toBe('municipal_approval_letter');
    expect(recordTypeForDocument({ ...baseDoc, documentType: 'tender_pack' }, false)).toBe('tender_pack');
    expect(recordTypeForDocument({ ...baseDoc, documentType: 'site_instruction' }, false)).toBe('site_instruction');
    expect(recordTypeForDocument({ ...baseDoc, documentType: 'rfi' }, false)).toBe('rfi');
    expect(recordTypeForDocument({ ...baseDoc, documentType: 'payment_certificate' }, false)).toBe('payment_certificate');
    expect(recordTypeForDocument({ ...baseDoc, documentType: 'closeout_pack' }, false)).toBe('closeout_pack');
  });

  // ── ProjectRecord Construction ──
  it('converts all documents to ProjectRecords', () => {
    const records = projectRecordsFromDocuments(sampleDocuments, sampleDrawings);
    expect(records.length).toBe(sampleDocuments.length);
    expect(records.every((r) => r.moduleKey === 'documents')).toBe(true);
    expect(records.every((r) => r.tenantId === 'tenant-architex-demo')).toBe(true);
  });

  it('builds a single ProjectRecord with correct envelope', () => {
    const doc = sampleDocuments[0];
    const drawing = sampleDrawings[0];
    const record = buildProjectRecord(doc, drawing);

    expect(record.id).toBe('project-record-doc-a100');
    expect(record.tenantId).toBe('tenant-architex-demo');
    expect(record.projectId).toBe('project-sandton-upgrade');
    expect(record.moduleKey).toBe('documents');
    expect(record.title).toBe('Architectural Site Plan');
    expect(record.status).toBe('issued');
  });

  // ── Payload Construction ──
  it('builds payload with drawing fields when drawing exists', () => {
    const payload = buildPayload(sampleDocuments[0], sampleDrawings[0]);
    expect(payload.documentId).toBe('doc-a100');
    expect(payload.documentType).toBe('drawing');
    expect(payload.drawingNumber).toBe('A-100');
    expect(payload.revision).toBe('B');
    expect(payload.sheetType).toBe('site_plan');
  });

  it('builds payload without drawing fields when no drawing linked', () => {
    const payload = buildPayload(sampleDocuments[5]); // specification
    expect(payload.documentId).toBe('doc-spec-001');
    expect(payload.documentType).toBe('specification');
    expect(payload.drawingNumber).toBeUndefined();
  });

  it('adds type-specific fields to payload', () => {
    const submissionPackPayload = buildPayload({
      ...sampleDocuments[0],
      documentType: 'submission_pack',
    });
    expect(submissionPackPayload.submissionType).toBe('municipal');

    const tenderPackPayload = buildPayload({
      ...sampleDocuments[0],
      documentType: 'tender_pack',
    });
    expect(tenderPackPayload.packType).toBe('tender');

    const rfiPayload = buildPayload({
      ...sampleDocuments[0],
      documentType: 'rfi',
    });
    expect(rfiPayload.rfiType).toBe('request_for_information');
  });

  // ── Grouping & Filtering ──
  it('groups records by type', () => {
    const records = projectRecordsFromDocuments(sampleDocuments, sampleDrawings);
    const groups = groupRecordsByType(records);
    expect(Object.keys(groups).length).toBeGreaterThanOrEqual(3);
    expect(groups.technical_drawings).toBeDefined();
    expect(groups.closeout_pack).toBeDefined();
  });

  it('filters records requiring approval', () => {
    const records = projectRecordsFromDocuments(sampleDocuments, sampleDrawings);
    const pending = recordsRequiringApproval(records);
    // The specification (doc-spec-001) is pending_review
    expect(pending.length).toBeGreaterThanOrEqual(1);
    expect(pending.every((r) => r.approvals.required)).toBe(true);
  });

  it('collects linked record IDs', () => {
    const records = projectRecordsFromDocuments(sampleDocuments, sampleDrawings);
    const ids = linkedRecordIds(records);
    expect(ids.length).toBeGreaterThan(0);
  });

  // ── Approval Metadata ──
  it('sets approval metadata correctly', () => {
    // pending_review document
    const pendingDoc = sampleDocuments[5]; // specification, pending_review
    const record = buildProjectRecord(pendingDoc);
    expect(record.approvals.required).toBe(true);
    expect(record.approvals.pendingRoles).toContain('quantity_surveyor');

    // issued document
    const issuedDoc = sampleDocuments[0]; // drawing, issued
    const issuedRecord = buildProjectRecord(issuedDoc, sampleDrawings[0]);
    expect(issuedRecord.approvals.required).toBe(false);
  });
});
