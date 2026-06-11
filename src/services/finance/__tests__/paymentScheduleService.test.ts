/**
 * Tests for Payment Schedule Service
 */
import { describe, it, expect } from 'vitest';
import {
  buildPaymentSchedule,
  buildCustomPaymentSchedule,
  findNextPaymentDue,
  totalScheduledAmount,
  totalReleasedAmount,
  DEFAULT_PAYMENT_MILESTONE_TEMPLATES,
} from '../paymentScheduleService';
import { createCommercialBaseline } from '../commercialBaselineService';
import type { AwardSnapshot, PaymentMilestone } from '../types';

const mockAward: AwardSnapshot = {
  awardId: 'award-001',
  projectId: 'project-001',
  appointedPartyId: 'party-001',
  appointedPartyName: 'Test Contractor',
  contractSum: { currency: 'ZAR', amount: 1_000_000 },
  vatIncluded: true,
  exclusions: [],
  qualifications: [],
  approvedAtIso: '2026-07-01T00:00:00.000Z',
};

const baseline = createCommercialBaseline(mockAward);

describe('paymentScheduleService', () => {
  describe('buildPaymentSchedule', () => {
    it('builds 5 default milestones', () => {
      const schedule = buildPaymentSchedule(baseline);
      expect(schedule).toHaveLength(5);
    });

    it('percentages sum to 100%', () => {
      const schedule = buildPaymentSchedule(baseline);
      const totalPct = schedule.reduce((s, m) => s + m.percent, 0);
      expect(totalPct).toBe(100);
    });

    it('total amounts equal current contract sum', () => {
      const schedule = buildPaymentSchedule(baseline);
      const total = schedule.reduce((s, m) => s + m.amount.amount, 0);
      // Allow small rounding differences
      expect(Math.abs(total - 1_000_000)).toBeLessThanOrEqual(5);
    });

    it('all milestones start as approval_required', () => {
      const schedule = buildPaymentSchedule(baseline);
      expect(schedule.every((m) => m.status === 'approval_required')).toBe(true);
    });

    it('throws if template percentages do not sum to 100', () => {
      const badTemplates = [
        { milestoneId: 'a', label: 'A', percent: 30, dueTrigger: 'test' },
        { milestoneId: 'b', label: 'B', percent: 30, dueTrigger: 'test' },
      ];
      expect(() => buildPaymentSchedule(baseline, badTemplates)).toThrow(
        /percentages must total 100%/,
      );
    });

    it('handles custom templates', () => {
      const customTemplates = [
        { milestoneId: 'm1', label: 'Milestone 1', percent: 50, dueTrigger: 'trigger 1' },
        { milestoneId: 'm2', label: 'Milestone 2', percent: 50, dueTrigger: 'trigger 2' },
      ];
      const schedule = buildPaymentSchedule(baseline, customTemplates);
      expect(schedule).toHaveLength(2);
      expect(schedule[0].label).toBe('Milestone 1');
      expect(schedule[1].label).toBe('Milestone 2');
    });
  });

  describe('buildCustomPaymentSchedule', () => {
    it('builds schedule from custom amounts', () => {
      const schedule = buildCustomPaymentSchedule(baseline, [
        { milestoneId: 'c1', label: 'Custom 1', amount: 300_000, dueTrigger: 'start' },
        { milestoneId: 'c2', label: 'Custom 2', amount: 700_000, dueTrigger: 'end' },
      ]);
      expect(schedule).toHaveLength(2);
      expect(schedule[0].amount.amount).toBe(300_000);
      expect(schedule[1].amount.amount).toBe(700_000);
    });

    it('calculates percentages correctly', () => {
      const schedule = buildCustomPaymentSchedule(baseline, [
        { milestoneId: 'c1', label: 'Half', amount: 500_000, dueTrigger: 'mid' },
        { milestoneId: 'c2', label: 'Half', amount: 500_000, dueTrigger: 'end' },
      ]);
      expect(schedule[0].percent).toBe(50);
    });
  });

  describe('findNextPaymentDue', () => {
    it('finds first non-completed milestone', () => {
      const schedule = buildPaymentSchedule(baseline);
      const next = findNextPaymentDue(schedule);
      expect(next).toBeTruthy();
      expect(next!.milestoneId).toBe('deposit');
    });

    it('returns null when all milestones are paid', () => {
      const schedule = buildPaymentSchedule(baseline).map((m) => ({
        ...m,
        status: 'provider_confirmed_paid' as const,
      }));
      expect(findNextPaymentDue(schedule)).toBeNull();
    });

    it('skips disputed milestones to find next payable', () => {
      const schedule = buildPaymentSchedule(baseline);
      schedule[0].status = 'disputed_locked';
      const next = findNextPaymentDue(schedule);
      expect(next!.milestoneId).not.toBe('deposit');
    });
  });

  describe('totalScheduledAmount', () => {
    it('sums all milestone amounts', () => {
      const schedule = buildPaymentSchedule(baseline);
      expect(totalScheduledAmount(schedule)).toBeGreaterThan(0);
    });
  });

  describe('totalReleasedAmount', () => {
    it('returns sum of confirmed paid milestones', () => {
      const schedule = buildPaymentSchedule(baseline);
      schedule[0].status = 'provider_confirmed_paid';
      schedule[1].status = 'provider_confirmed_paid';
      const total = schedule[0].amount.amount + schedule[1].amount.amount;
      expect(totalReleasedAmount(schedule)).toBe(total);
    });

    it('returns 0 when nothing is paid', () => {
      const schedule = buildPaymentSchedule(baseline);
      expect(totalReleasedAmount(schedule)).toBe(0);
    });
  });

  describe('DEFAULT_PAYMENT_MILESTONE_TEMPLATES', () => {
    it('has 5 milestones', () => {
      expect(DEFAULT_PAYMENT_MILESTONE_TEMPLATES).toHaveLength(5);
    });

    it('percentages sum to 100', () => {
      const total = DEFAULT_PAYMENT_MILESTONE_TEMPLATES.reduce(
        (s, t) => s + t.percent,
        0,
      );
      expect(total).toBe(100);
    });
  });
});
