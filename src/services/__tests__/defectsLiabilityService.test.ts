import { describe, expect, it } from 'vitest';
import {
  createLiabilityPeriod,
  evaluateLiabilityPeriodExpiry,
  evaluateRetentionReleaseEligibility,
  shouldRecallContractor,
  buildDefectsLiabilitySummary,
} from '../defectsLiabilityService';
import type { DefectsLiabilityPeriod, LiabilityDefectReport } from '../defectsLiabilityService';

function makeLiabilityDefect(overrides: Partial<LiabilityDefectReport> = {}): LiabilityDefectReport {
  return {
    id: 'ld-1',
    liabilityPeriodId: 'liability-p1',
    projectId: 'project-1',
    title: 'Test liability defect',
    description: 'A defect found during liability period',
    category: 'newly_discovered',
    severity: 'medium',
    status: 'reported',
    reportedBy: 'client-1',
    reportedAt: '2026-06-09T00:00:00.000Z',
    evidenceUrls: [],
    createdAt: '2026-06-09T00:00:00.000Z',
    updatedAt: '2026-06-09T00:00:00.000Z',
    ...overrides,
  };
}

describe('defectsLiabilityService', () => {
  describe('createLiabilityPeriod', () => {
    it('creates a period with correct end date', () => {
      const period = createLiabilityPeriod({
        projectId: 'project-1',
        startDate: '2026-06-09T00:00:00.000Z',
        durationMonths: 12,
        contractorId: 'contractor-1',
        contractorName: 'Build Co',
      });

      expect(period.projectId).toBe('project-1');
      expect(period.durationMonths).toBe(12);
      expect(period.status).toBe('active'); // start date is now
      expect(new Date(period.endDate).getTime()).toBeGreaterThan(new Date(period.startDate).getTime());
    });

    it('marks as pending when start date is in the future', () => {
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 3);
      const period = createLiabilityPeriod({
        projectId: 'project-1',
        startDate: futureDate.toISOString(),
        durationMonths: 12,
      });
      expect(period.status).toBe('pending');
    });

    it('marks as expired when end date is in the past', () => {
      const pastStart = new Date();
      pastStart.setFullYear(pastStart.getFullYear() - 2);
      const period = createLiabilityPeriod({
        projectId: 'project-1',
        startDate: pastStart.toISOString(),
        durationMonths: 12,
      });
      expect(period.status).toBe('expired');
    });

    it('defaults to 12 months for endDate when duration not specified', () => {
      const period = createLiabilityPeriod({
        projectId: 'project-1',
        startDate: '2026-06-09T00:00:00.000Z',
      });
      expect(period.durationMonths).toBeUndefined();
      expect(new Date(period.endDate).getTime()).toBeGreaterThan(new Date(period.startDate).getTime());
    });
  });

  describe('evaluateLiabilityPeriodExpiry', () => {
    it('calculates days remaining correctly', () => {
      const futureEnd = new Date();
      futureEnd.setDate(futureEnd.getDate() + 180);
      const period: DefectsLiabilityPeriod = {
        id: 'lp-1',
        projectId: 'p1',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: futureEnd.toISOString(),
        durationMonths: 12,
        status: 'active',
        retentionReleaseTriggered: false,
        createdAt: '',
        updatedAt: '',
      };
      const result = evaluateLiabilityPeriodExpiry(period);
      expect(result.expired).toBe(false);
      expect(result.daysRemaining).toBeGreaterThan(0);
    });

    it('detects expired period', () => {
      const pastEnd = new Date();
      pastEnd.setDate(pastEnd.getDate() - 10);
      const period: DefectsLiabilityPeriod = {
        id: 'lp-1', projectId: 'p1', startDate: '2025-01-01T00:00:00.000Z',
        endDate: pastEnd.toISOString(), durationMonths: 12, status: 'expired',
        retentionReleaseTriggered: false, createdAt: '', updatedAt: '',
      };
      const result = evaluateLiabilityPeriodExpiry(period);
      expect(result.expired).toBe(true);
    });

    it('detects expiring soon within 90 days', () => {
      const soonEnd = new Date();
      soonEnd.setDate(soonEnd.getDate() + 45);
      const period: DefectsLiabilityPeriod = {
        id: 'lp-1', projectId: 'p1', startDate: '2025-06-01T00:00:00.000Z',
        endDate: soonEnd.toISOString(), durationMonths: 12, status: 'expiring_soon',
        retentionReleaseTriggered: false, createdAt: '', updatedAt: '',
      };
      const result = evaluateLiabilityPeriodExpiry(period);
      expect(result.expiringSoon).toBe(true);
    });
  });

  describe('evaluateRetentionReleaseEligibility', () => {
    it('eligible when period expired and defects resolved', () => {
      const period: DefectsLiabilityPeriod = {
        id: 'lp-1', projectId: 'p1', startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2026-01-01T00:00:00.000Z', durationMonths: 12, status: 'expired',
        retentionReleaseTriggered: false, createdAt: '', updatedAt: '',
      };
      const result = evaluateRetentionReleaseEligibility({
        period,
        defects: [makeLiabilityDefect({ id: '1', status: 'verified' })],
        allDefectsResolved: true,
      });
      expect(result.eligible).toBe(true);
    });

    it('blocks when defects are unresolved', () => {
      const pastEnd = new Date();
      pastEnd.setDate(pastEnd.getDate() - 30);
      const period: DefectsLiabilityPeriod = {
        id: 'lp-1', projectId: 'p1', startDate: '2025-01-01T00:00:00.000Z',
        endDate: pastEnd.toISOString(), durationMonths: 12, status: 'expired',
        retentionReleaseTriggered: false, createdAt: '', updatedAt: '',
      };
      const result = evaluateRetentionReleaseEligibility({
        period,
        defects: [makeLiabilityDefect({ status: 'reported' })],
        allDefectsResolved: false,
      });
      expect(result.eligible).toBe(false);
    });

    it('blocks when period is still active', () => {
      const futureEnd = new Date();
      futureEnd.setDate(futureEnd.getDate() + 200);
      const period: DefectsLiabilityPeriod = {
        id: 'lp-1', projectId: 'p1', startDate: '2026-01-01T00:00:00.000Z',
        endDate: futureEnd.toISOString(), durationMonths: 12, status: 'active',
        retentionReleaseTriggered: false, createdAt: '', updatedAt: '',
      };
      const result = evaluateRetentionReleaseEligibility({
        period,
        defects: [],
        allDefectsResolved: true,
      });
      expect(result.eligible).toBe(false);
    });
  });

  describe('shouldRecallContractor', () => {
    it('recalls when critical defect unresolved for >30 days', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 45);
      const result = shouldRecallContractor([
        makeLiabilityDefect({ id: '1', severity: 'critical', status: 'reported', reportedAt: oldDate.toISOString() }),
      ]);
      expect(result.shouldRecall).toBe(true);
      expect(result.defectIds).toContain('1');
    });

    it('recalls when 3+ critical/high defects exist', () => {
      const result = shouldRecallContractor([
        makeLiabilityDefect({ id: '1', severity: 'critical', status: 'reported' }),
        makeLiabilityDefect({ id: '2', severity: 'high', status: 'under_review' }),
        makeLiabilityDefect({ id: '3', severity: 'high', status: 'accepted_by_contractor' }),
      ]);
      expect(result.shouldRecall).toBe(true);
      expect(result.defectIds).toHaveLength(3);
    });

    it('does not recall for low/medium defects only', () => {
      const result = shouldRecallContractor([
        makeLiabilityDefect({ id: '1', severity: 'low', status: 'reported' }),
        makeLiabilityDefect({ id: '2', severity: 'medium', status: 'reported' }),
      ]);
      expect(result.shouldRecall).toBe(false);
    });

    it('does not recall when defects are already resolved', () => {
      const result = shouldRecallContractor([
        makeLiabilityDefect({ id: '1', severity: 'critical', status: 'verified' }),
      ]);
      expect(result.shouldRecall).toBe(false);
    });
  });

  describe('buildDefectsLiabilitySummary', () => {
    it('builds a comprehensive summary', () => {
      const futureEnd = new Date();
      futureEnd.setDate(futureEnd.getDate() + 180);
      const period: DefectsLiabilityPeriod = {
        id: 'lp-1', projectId: 'p1', startDate: '2026-01-01T00:00:00.000Z',
        endDate: futureEnd.toISOString(), durationMonths: 12, status: 'active',
        retentionReleaseTriggered: false, createdAt: '', updatedAt: '',
      };

      const summary = buildDefectsLiabilitySummary(period, [
        makeLiabilityDefect({ id: '1', status: 'reported', severity: 'high' }),
        makeLiabilityDefect({ id: '2', status: 'verified', severity: 'medium' }),
      ], []);

      expect(summary.openDefectCount).toBe(1);
      expect(summary.requiresAttention).toBe(true);
      expect(summary.retentionReleaseEligible).toBe(false);
      expect(summary.period).toBe(period);
    });
  });
});
