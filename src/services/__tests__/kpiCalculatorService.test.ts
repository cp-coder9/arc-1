import { describe, expect, it } from 'vitest';
import {
  computeScheduleVariance,
  computeCostToComplete,
  computeDefectLiabilityRemaining,
  computeRetentionReleaseReadiness,
  computeComplianceGapCount,
  computeAllKPIs,
} from '../kpiCalculatorService';
import type { KPIInputData } from '../kpiCalculatorService';

describe('kpiCalculatorService', () => {
  // ── Schedule Variance ──────────────────────────────────────────────────────
  describe('computeScheduleVariance', () => {
    it('returns zeros for empty milestones', () => {
      const result = computeScheduleVariance([]);
      expect(result.plannedMilestones).toBe(0);
      expect(result.completedOnTime).toBe(0);
      expect(result.delayed).toBe(0);
      expect(result.variancePercent).toBe(0);
    });

    it('computes positive variance when milestones are on time', () => {
      const result = computeScheduleVariance([
        { id: 'm1', title: 'Design', plannedDate: '2026-06-01', actualDate: '2026-05-30', status: 'completed' },
        { id: 'm2', title: 'Submit', plannedDate: '2026-06-15', actualDate: '2026-06-10', status: 'completed' },
      ]);
      expect(result.plannedMilestones).toBe(2);
      expect(result.completedOnTime).toBe(2);
      expect(result.delayed).toBe(0);
      expect(result.variancePercent).toBe(100);
    });

    it('computes negative variance when milestones are delayed', () => {
      const result = computeScheduleVariance([
        { id: 'm1', title: 'Design', plannedDate: '2026-06-01', status: 'completed', actualDate: '2026-06-05' },
        { id: 'm2', title: 'Submit', plannedDate: '2026-06-15', status: 'delayed' },
      ]);
      expect(result.plannedMilestones).toBe(2);
      expect(result.delayed).toBe(1);
      expect(result.variancePercent).toBeLessThan(0);
    });

    it('handles milestones with no planned date', () => {
      const result = computeScheduleVariance([
        { id: 'm1', title: 'Kickoff', plannedDate: '', status: 'completed' },
      ]);
      expect(result.plannedMilestones).toBe(1);
    });
  });

  // ── Cost to Complete ───────────────────────────────────────────────────────
  describe('computeCostToComplete', () => {
    it('returns zeros for empty cost items', () => {
      const result = computeCostToComplete([]);
      expect(result.budgetedAmount).toBe(0);
      expect(result.remainingBudget).toBe(0);
      expect(result.percentComplete).toBe(0);
    });

    it('computes remaining budget correctly', () => {
      const result = computeCostToComplete([
        { category: 'Structure', budgeted: 1_000_000, committed: 800_000, actual: 400_000 },
        { category: 'Finishes', budgeted: 500_000, committed: 300_000, actual: 100_000 },
      ]);
      expect(result.budgetedAmount).toBe(1_500_000);
      expect(result.committedAmount).toBe(1_100_000);
      expect(result.actualSpend).toBe(500_000);
      expect(result.remainingBudget).toBe(1_000_000);
      expect(result.percentComplete).toBe(33);
    });

    it('handles 100% spend', () => {
      const result = computeCostToComplete([
        { category: 'Design', budgeted: 200_000, committed: 200_000, actual: 200_000 },
      ]);
      expect(result.percentComplete).toBe(100);
      expect(result.remainingBudget).toBe(0);
    });
  });

  // ── Defect Liability ───────────────────────────────────────────────────────
  describe('computeDefectLiabilityRemaining', () => {
    it('computes remaining days in the future', () => {
      const futureEnd = new Date();
      futureEnd.setDate(futureEnd.getDate() + 90);
      const pastStart = new Date();
      pastStart.setDate(pastStart.getDate() - 10);

      const result = computeDefectLiabilityRemaining({
        startDate: pastStart.toISOString(),
        endDate: futureEnd.toISOString(),
        totalDays: 100,
      });
      expect(result.remainingDays).toBeGreaterThan(0);
      expect(result.isExpired).toBe(false);
    });

    it('detects expired defect liability', () => {
      const pastEnd = new Date();
      pastEnd.setDate(pastEnd.getDate() - 30);
      const pastStart = new Date();
      pastStart.setDate(pastStart.getDate() - 100);

      const result = computeDefectLiabilityRemaining({
        startDate: pastStart.toISOString(),
        endDate: pastEnd.toISOString(),
        totalDays: 70,
      });
      expect(result.isExpired).toBe(true);
      expect(result.remainingDays).toBe(0);
    });
  });

  // ── Retention Release ──────────────────────────────────────────────────────
  describe('computeRetentionReleaseReadiness', () => {
    it('returns not ready when no conditions are met', () => {
      const result = computeRetentionReleaseReadiness(500_000, [
        { description: 'Practical completion', met: false },
        { description: 'Defects list cleared', met: false },
      ]);
      expect(result.isReadyForRelease).toBe(false);
      expect(result.releasableAmount).toBe(0);
    });

    it('returns ready when all conditions met', () => {
      const result = computeRetentionReleaseReadiness(500_000, [
        { description: 'Practical completion', met: true },
        { description: 'Defects list cleared', met: true },
      ]);
      expect(result.isReadyForRelease).toBe(true);
      expect(result.releasableAmount).toBe(500_000);
    });

    it('returns proportional amount for partial conditions', () => {
      const result = computeRetentionReleaseReadiness(300_000, [
        { description: 'Condition A', met: true },
        { description: 'Condition B', met: false },
      ]);
      expect(result.conditionsMet).toBe(1);
      expect(result.totalConditions).toBe(2);
      expect(result.isReadyForRelease).toBe(false);
      expect(result.releasableAmount).toBe(150_000);
    });

    it('handles empty conditions', () => {
      const result = computeRetentionReleaseReadiness(100_000, []);
      expect(result.isReadyForRelease).toBe(false);
      expect(result.releasableAmount).toBe(0);
    });
  });

  // ── Compliance Gap Count ───────────────────────────────────────────────────
  describe('computeComplianceGapCount', () => {
    it('returns zeros for empty compliance items', () => {
      const result = computeComplianceGapCount([]);
      expect(result.totalGaps).toBe(0);
    });

    it('counts expired registrations', () => {
      const result = computeComplianceGapCount([
        { type: 'registration', name: 'SACAP', status: 'expired' },
        { type: 'registration', name: 'ECSA', status: 'valid' },
      ]);
      expect(result.expiredRegistrations).toBe(1);
      expect(result.totalGaps).toBe(1);
    });

    it('counts lapsed insurance and missing documents', () => {
      const result = computeComplianceGapCount([
        { type: 'insurance', name: 'PI Insurance', status: 'expired' },
        { type: 'insurance', name: 'Public Liability', status: 'missing' },
        { type: 'document', name: 'Tax Clearance', status: 'missing' },
        { type: 'document', name: 'BEE Certificate', status: 'expired' },
      ]);
      expect(result.lapsedInsurance).toBe(2);
      expect(result.missingDocuments).toBe(2);
      expect(result.totalGaps).toBe(4);
    });

    it('counts expiring-soon registrations as gaps', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 7);
      const result = computeComplianceGapCount([
        { type: 'registration', name: 'SACAP', status: 'expiring_soon', expiryDate: tomorrow.toISOString() },
      ]);
      expect(result.expiredRegistrations).toBe(1);
      expect(result.totalGaps).toBe(1);
    });
  });

  // ── Aggregate Computation ──────────────────────────────────────────────────
  describe('computeAllKPIs', () => {
    it('returns all 5 KPIs with version', () => {
      const input: KPIInputData = {
        projectId: 'project-1',
        milestones: [
          { id: 'm1', title: 'Milestone 1', plannedDate: '2026-06-01', status: 'completed', actualDate: '2026-05-28' },
        ],
        costLineItems: [
          { category: 'Construction', budgeted: 1_000_000, committed: 500_000, actual: 300_000 },
        ],
        defectLiability: {
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
          totalDays: 90,
        },
        retentionAmount: 200_000,
        retentionConditions: [
          { description: 'Condition A', met: true },
        ],
        complianceItems: [
          { type: 'registration', name: 'SACAP', status: 'valid' },
        ],
      };

      const result = computeAllKPIs(input);
      expect(result.projectId).toBe('project-1');
      expect(result.kpis).toHaveLength(5);
      expect(result.version).toBe(1);
      expect(result.kpis.map((k) => k.name)).toEqual([
        'schedule_variance',
        'cost_to_complete',
        'defect_liability_remaining_days',
        'retention_release_readiness',
        'compliance_gap_count',
      ]);
    });
  });
});
