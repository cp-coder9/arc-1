/**
 * Tests: Readiness Check Service
 *
 * Coverage matrix for all four readiness checks plus
 * approval letter and warranty checks.
 */
import { describe, expect, it } from 'vitest';
import {
  allReadinessReports,
  approvalLetterReadiness,
  closeoutPackReadiness,
  constructionIssueReadiness,
  municipalSubmissionReadiness,
  tenderPackReadiness,
  warrantyReadiness,
} from '../readinessCheckService';
import { sampleDocuments, sampleDrawings } from '../sampleDocumentData';

describe('readinessCheckService', () => {
  // ── Municipal Submission ──
  describe('municipalSubmissionReadiness', () => {
    it('reports not ready when municipal form is draft', () => {
      const report = municipalSubmissionReadiness(sampleDocuments, sampleDrawings);
      expect(report.ready).toBe(false);
      expect(report.findings.some((f) => f.code === 'MUNICIPAL_FORM_NOT_READY')).toBe(true);
    });

    it('detects missing municipal sheets', () => {
      const report = municipalSubmissionReadiness(sampleDocuments, sampleDrawings);
      const sheetFindings = report.findings.filter(
        (f) => f.code === 'MUNICIPAL_SHEET_MISSING',
      );
      expect(sheetFindings.length).toBeGreaterThan(0);
      expect(sheetFindings[0].message).toContain('Missing issued');
    });

    it('detects missing approval letter', () => {
      const report = municipalSubmissionReadiness(sampleDocuments, sampleDrawings);
      expect(report.findings.some((f) => f.code === 'APPROVAL_LETTER_MISSING')).toBe(true);
    });

    it('detects missing discipline drawings', () => {
      const report = municipalSubmissionReadiness(sampleDocuments, sampleDrawings);
      const disciplineFindings = report.findings.filter(
        (f) => f.code === 'DISCIPLINE_DRAWING_MISSING',
      );
      // Several disciplines should be missing from the small sample
      expect(disciplineFindings.length).toBeGreaterThan(0);
    });
  });

  // ── Tender Pack ──
  describe('tenderPackReadiness', () => {
    it('reports not ready when specification is pending review', () => {
      const report = tenderPackReadiness(sampleDocuments, sampleDrawings);
      expect(report.ready).toBe(false);
      expect(report.findings.some((f) => f.code === 'TENDER_SPECIFICATION_NOT_ISSUED')).toBe(true);
    });

    it('detects missing tender sheets', () => {
      const report = tenderPackReadiness(sampleDocuments, sampleDrawings);
      const sheetFindings = report.findings.filter(
        (f) => f.code === 'TENDER_SHEET_MISSING',
      );
      expect(sheetFindings.length).toBeGreaterThan(0);
    });

    it('detects no tender drawings issued', () => {
      const report = tenderPackReadiness(sampleDocuments, sampleDrawings);
      expect(report.findings.some((f) => f.code === 'NO_TENDER_DRAWINGS_ISSUED')).toBe(true);
    });

    it('detects missing tender pack document', () => {
      const report = tenderPackReadiness(sampleDocuments, sampleDrawings);
      expect(report.findings.some((f) => f.code === 'TENDER_PACK_NOT_ISSUED')).toBe(true);
    });
  });

  // ── Construction Issue ──
  describe('constructionIssueReadiness', () => {
    it('detects superseded construction drawings', () => {
      const report = constructionIssueReadiness(sampleDrawings);
      expect(report.ready).toBe(false);
      expect(report.findings.some((f) => f.code === 'SUPERSEDED_CONSTRUCTION_DRAWING')).toBe(
        true,
      );
    });

    it('finds current construction drawings', () => {
      const report = constructionIssueReadiness(sampleDrawings);
      // Should NOT have NO_CURRENT_CONSTRUCTION_DRAWINGS since we have 2 issued-for-construction
      expect(report.findings.some((f) => f.code === 'NO_CURRENT_CONSTRUCTION_DRAWINGS')).toBe(
        false,
      );
    });

    it('detects missing construction sheets', () => {
      const report = constructionIssueReadiness(sampleDrawings);
      const sheetFindings = report.findings.filter(
        (f) => f.code === 'CONSTRUCTION_SHEET_MISSING',
      );
      // The small sample won't have all required construction sheets
      expect(sheetFindings.length).toBeGreaterThan(0);
    });
  });

  // ── Closeout Pack ──
  describe('closeoutPackReadiness', () => {
    it('reports not ready when closeout pack is draft', () => {
      const report = closeoutPackReadiness(sampleDocuments, sampleDrawings);
      expect(report.ready).toBe(false);
      expect(report.findings.some((f) => f.code === 'CLOSEOUT_PACK_NOT_ISSUED')).toBe(true);
    });

    it('detects missing as-built drawings', () => {
      const report = closeoutPackReadiness(sampleDocuments, sampleDrawings);
      expect(report.findings.some((f) => f.code === 'AS_BUILT_DRAWINGS_MISSING')).toBe(true);
    });

    it('detects missing closeout certificate', () => {
      const report = closeoutPackReadiness(sampleDocuments, sampleDrawings);
      expect(report.findings.some((f) => f.code === 'CLOSEOUT_CERTIFICATE_MISSING')).toBe(true);
    });
  });

  // ── Approval Letter ──
  describe('approvalLetterReadiness', () => {
    it('detects missing approval letter', () => {
      const report = approvalLetterReadiness(sampleDocuments);
      expect(report.ready).toBe(false);
      expect(report.findings.some((f) => f.code === 'APPROVAL_LETTER_MISSING')).toBe(true);
    });
  });

  // ── Warranty ──
  describe('warrantyReadiness', () => {
    it('detects missing warranty document', () => {
      const report = warrantyReadiness(sampleDocuments);
      expect(report.ready).toBe(false);
      expect(report.findings.some((f) => f.code === 'WARRANTY_DOCUMENT_MISSING')).toBe(true);
    });
  });

  // ── All Reports ──
  describe('allReadinessReports', () => {
    it('returns all 6 readiness reports', () => {
      const reports = allReadinessReports(sampleDocuments, sampleDrawings);
      expect(reports.length).toBe(6);
      expect(reports.map((r) => r.checkName).sort()).toEqual([
        'approval_letter',
        'closeout_pack',
        'construction_issue',
        'municipal_submission',
        'tender_pack',
        'warranty',
      ]);
    });

    it('no report should be ready with demo data', () => {
      const reports = allReadinessReports(sampleDocuments, sampleDrawings);
      const readyCount = reports.filter((r) => r.ready).length;
      // All reports should have at least one finding with current demo data
      expect(readyCount).toBe(0);
    });
  });
});
