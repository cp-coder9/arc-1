import { describe, expect, it } from 'vitest';
import {
  allReadinessReports,
  closeoutPackReadiness,
  constructionIssueReadiness,
  municipalSubmissionReadiness,
  tenderPackReadiness,
} from '../readinessCheckService';
import { sampleDocuments, sampleDrawings } from '../sampleDocumentData';

describe('readinessCheckService', () => {
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
  });

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
  });

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
      expect(report.findings.some((f) => f.code === 'NO_CURRENT_CONSTRUCTION_DRAWINGS')).toBe(
        false,
      );
    });
  });

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
  });

  describe('allReadinessReports', () => {
    it('returns all 4 readiness reports', () => {
      const reports = allReadinessReports(sampleDocuments, sampleDrawings);
      expect(reports.length).toBe(4);
      expect(reports.map((r) => r.checkName).sort()).toEqual([
        'closeout_pack',
        'construction_issue',
        'municipal_submission',
        'tender_pack',
      ]);
    });

    it('no report should be ready with demo data', () => {
      const reports = allReadinessReports(sampleDocuments, sampleDrawings);
      const readyCount = reports.filter((r) => r.ready).length;
      expect(readyCount).toBe(0);
    });
  });
});
