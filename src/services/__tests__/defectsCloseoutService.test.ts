import { describe, expect, it } from 'vitest';
import {
  categorizeDefect,
  evaluateDefectSeverity,
  verifyDefectCloseout,
  buildDefectsRegisterSummary,
  linkDefectToLiability,
  isDefectClosed,
} from '../defectsCloseoutService';
import type { DefectItem } from '../defectsCloseoutService';

function makeDefect(overrides: Partial<DefectItem> = {}): DefectItem {
  return {
    id: 'defect-1',
    projectId: 'project-1',
    title: 'Test defect',
    category: 'patent',
    severity: 'medium',
    status: 'open',
    reportedBy: 'architect-1',
    reportedAt: '2026-06-09T00:00:00.000Z',
    evidenceUrls: [],
    createdAt: '2026-06-09T00:00:00.000Z',
    updatedAt: '2026-06-09T00:00:00.000Z',
    ...overrides,
  };
}

describe('defectsCloseoutService', () => {
  describe('categorizeDefect', () => {
    it('categorises visible defects discovered during construction as patent', () => {
      expect(categorizeDefect({
        title: 'Cracked tile',
        discoveredDuringConstruction: true,
        visibleAtHandover: true,
      })).toBe('patent');
    });

    it('categorises hidden defects found after handover as latent', () => {
      expect(categorizeDefect({
        title: 'Hidden pipe leak',
        discoveredDuringConstruction: false,
        visibleAtHandover: false,
      })).toBe('latent');
    });

    it('categorises construction-discovered but invisible defects as latent', () => {
      expect(categorizeDefect({
        title: 'Subsurface issue',
        discoveredDuringConstruction: true,
        visibleAtHandover: false,
      })).toBe('latent');
    });
  });

  describe('evaluateDefectSeverity', () => {
    it('marks safety risks as critical', () => {
      expect(evaluateDefectSeverity({
        safetyRisk: true,
        functionalityImpact: false,
        aestheticOnly: false,
        regulatoryNonCompliance: false,
      })).toBe('critical');
    });

    it('marks regulatory non-compliance as critical', () => {
      expect(evaluateDefectSeverity({
        safetyRisk: false,
        functionalityImpact: false,
        aestheticOnly: false,
        regulatoryNonCompliance: true,
      })).toBe('critical');
    });

    it('marks functionality impact as high', () => {
      expect(evaluateDefectSeverity({
        safetyRisk: false,
        functionalityImpact: true,
        aestheticOnly: false,
        regulatoryNonCompliance: false,
      })).toBe('high');
    });

    it('marks aesthetic-only as low', () => {
      expect(evaluateDefectSeverity({
        safetyRisk: false,
        functionalityImpact: false,
        aestheticOnly: true,
        regulatoryNonCompliance: false,
      })).toBe('low');
    });

    it('defaults to medium', () => {
      expect(evaluateDefectSeverity({
        safetyRisk: false,
        functionalityImpact: false,
        aestheticOnly: false,
        regulatoryNonCompliance: false,
      })).toBe('medium');
    });
  });

  describe('verifyDefectCloseout', () => {
    it('verifies when evidence is reviewed and exists', () => {
      const defect = makeDefect({ status: 'ready_for_inspection', evidenceUrls: ['https://files/evidence.jpg'] });
      const result = verifyDefectCloseout(defect, {
        verifiedBy: 'architect-1',
        evidenceReviewed: true,
        inspectionNotes: 'All good',
      });
      expect(result.status).toBe('verified');
      expect(result.reinspectionRequired).toBe(false);
    });

    it('requires rectification when no evidence', () => {
      const defect = makeDefect({ evidenceUrls: [] });
      const result = verifyDefectCloseout(defect, {
        verifiedBy: 'architect-1',
        evidenceReviewed: false,
      });
      expect(result.status).toBe('requires_rectification');
      expect(result.reinspectionRequired).toBe(true);
    });

    it('marks disputed when defect is disputed', () => {
      const defect = makeDefect({ status: 'disputed' });
      const result = verifyDefectCloseout(defect, {
        verifiedBy: 'architect-1',
        evidenceReviewed: true,
      });
      expect(result.status).toBe('disputed');
    });
  });

  describe('buildDefectsRegisterSummary', () => {
    it('builds summary with patent and latent breakdowns', () => {
      const summary = buildDefectsRegisterSummary([
        makeDefect({ id: '1', category: 'patent', status: 'closed', severity: 'low' }),
        makeDefect({ id: '2', category: 'patent', status: 'open', severity: 'high' }),
        makeDefect({ id: '3', category: 'latent', status: 'open', severity: 'critical' }),
      ]);
      expect(summary.total).toBe(3);
      expect(summary.patent).toEqual({ total: 2, open: 1, closed: 1 });
      expect(summary.latent).toEqual({ total: 1, open: 1, closed: 0 });
      expect(summary.bySeverity).toEqual({ low: 1, medium: 0, high: 1, critical: 1 });
      expect(summary.openDefects).toHaveLength(2);
      expect(summary.closedDefects).toBe(1);
    });

    it('flags overdue critical and high severity defects for attention', () => {
      const pastDue = new Date();
      pastDue.setDate(pastDue.getDate() - 5);
      const summary = buildDefectsRegisterSummary([
        makeDefect({ id: '1', category: 'patent', severity: 'critical', status: 'open', dueDate: pastDue.toISOString().slice(0, 10) }),
      ]);
      expect(summary.requiresAttention).toHaveLength(1);
    });

    it('handles empty defects array', () => {
      const summary = buildDefectsRegisterSummary([]);
      expect(summary.total).toBe(0);
      expect(summary.requiresAttention).toHaveLength(0);
    });
  });

  describe('linkDefectToLiability', () => {
    it('transfers defect to liability period', () => {
      const defect = makeDefect({ status: 'open' });
      const linked = linkDefectToLiability(defect, 'liability-period-1');
      expect(linked.status).toBe('transferred_to_liability');
      expect(linked.linkedToLiabilityPeriod).toBe('liability-period-1');
    });
  });

  describe('isDefectClosed', () => {
    it.each(['closed', 'verified'] as const)('returns true for %s', (status) => {
      expect(isDefectClosed(status)).toBe(true);
    });

    it.each(['open', 'in_progress', 'disputed'] as const)('returns false for %s', (status) => {
      expect(isDefectClosed(status)).toBe(false);
    });
  });
});
