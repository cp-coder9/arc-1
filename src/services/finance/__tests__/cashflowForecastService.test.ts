/**
 * Tests for Cashflow Forecast Service
 */
import { describe, it, expect } from 'vitest';
import {
  createCashflowForecast,
  calculateCashflowProjections,
  compareActualsVsForecast,
  mergeForecasts,
} from '../cashflowForecastService';
import type { CashflowForecast, PaymentMilestone, PaymentCertificate } from '../types';

const mockSchedule: PaymentMilestone[] = [
  {
    milestoneId: 'deposit',
    label: 'Deposit',
    percent: 10,
    amount: { currency: 'ZAR', amount: 100_000 },
    dueTrigger: 'appointment confirmed',
    status: 'provider_confirmed_paid',
  },
  {
    milestoneId: 'structure',
    label: 'Structure',
    percent: 30,
    amount: { currency: 'ZAR', amount: 300_000 },
    dueTrigger: 'QS cert',
    status: 'approval_required',
  },
  {
    milestoneId: 'enclosure',
    label: 'Enclosure',
    percent: 30,
    amount: { currency: 'ZAR', amount: 300_000 },
    dueTrigger: 'QS cert',
    status: 'approval_required',
  },
  {
    milestoneId: 'completion',
    label: 'Completion',
    percent: 25,
    amount: { currency: 'ZAR', amount: 250_000 },
    dueTrigger: 'practical completion',
    status: 'approval_required',
  },
  {
    milestoneId: 'retention',
    label: 'Retention',
    percent: 5,
    amount: { currency: 'ZAR', amount: 50_000 },
    dueTrigger: 'defects release',
    status: 'approval_required',
  },
];

const mockCertificate: PaymentCertificate = {
  certificateId: 'cert-001',
  claimId: 'claim-001',
  claimedAmount: { currency: 'ZAR', amount: 300_000 },
  certifiedAmount: { currency: 'ZAR', amount: 290_000 },
  retentionHeld: { currency: 'ZAR', amount: 14_500 },
  disputedAmount: { currency: 'ZAR', amount: 10_000 },
  approvedForRelease: { currency: 'ZAR', amount: 275_500 },
  reviewerRoles: ['quantity_surveyor', 'lead_professional'],
  status: 'approval_required',
};

describe('cashflowForecastService', () => {
  describe('createCashflowForecast', () => {
    it('creates a forecast from schedule and certificate', () => {
      const forecast = createCashflowForecast(
        'project-001',
        mockSchedule,
        mockCertificate,
      );
      expect(forecast.forecastId).toContain('forecast-project-001');
      expect(forecast.totalScheduled.amount).toBe(1_000_000);
      expect(forecast.nextRelease).toEqual(mockCertificate.approvedForRelease);
      expect(forecast.retentionHeld).toEqual(mockCertificate.retentionHeld);
    });

    it('includes default advisory notes', () => {
      const forecast = createCashflowForecast(
        'project-001',
        mockSchedule,
        mockCertificate,
      );
      expect(forecast.notes.length).toBeGreaterThan(0);
      expect(
        forecast.notes.some((n) => n.includes('advisory')),
      ).toBe(true);
    });

    it('appends custom notes', () => {
      const forecast = createCashflowForecast(
        'project-001',
        mockSchedule,
        mockCertificate,
        ['Custom note 1'],
      );
      expect(forecast.notes).toContain('Custom note 1');
    });
  });

  describe('calculateCashflowProjections', () => {
    it('calculates projections from schedule', () => {
      const projections = calculateCashflowProjections(mockSchedule);
      expect(projections.projectedOutflow).toBe(1_000_000);
      expect(projections.projectedInflow).toBe(1_000_000);
    });

    it('net position reflects confirmed minus scheduled', () => {
      const projections = calculateCashflowProjections(mockSchedule);
      // confirmed = 100k (first milestone), scheduled = 1000k
      expect(projections.netPosition).toBe(100_000 - 1_000_000);
    });
  });

  describe('compareActualsVsForecast', () => {
    const forecast: CashflowForecast = {
      forecastId: 'forecast-001',
      projectId: 'project-001',
      totalScheduled: { currency: 'ZAR', amount: 1_000_000 },
      nextRelease: { currency: 'ZAR', amount: 275_500 },
      retentionHeld: { currency: 'ZAR', amount: 14_500 },
      notes: [],
    };

    it('reports on_track when variance < 5%', () => {
      const result = compareActualsVsForecast(forecast, 1_020_000);
      expect(result.status).toBe('on_track');
    });

    it('reports ahead when variance > 5%', () => {
      const result = compareActualsVsForecast(forecast, 1_100_000);
      expect(result.status).toBe('ahead');
    });

    it('reports behind when variance < -5%', () => {
      const result = compareActualsVsForecast(forecast, 900_000);
      expect(result.status).toBe('behind');
    });
  });

  describe('mergeForecasts', () => {
    it('merges multiple forecasts', () => {
      const f1: CashflowForecast = {
        forecastId: 'f1',
        projectId: 'project-001',
        totalScheduled: { currency: 'ZAR', amount: 500_000 },
        nextRelease: { currency: 'ZAR', amount: 100_000 },
        retentionHeld: { currency: 'ZAR', amount: 25_000 },
        notes: ['Note 1'],
      };
      const f2: CashflowForecast = {
        forecastId: 'f2',
        projectId: 'project-001',
        totalScheduled: { currency: 'ZAR', amount: 300_000 },
        nextRelease: { currency: 'ZAR', amount: 50_000 },
        retentionHeld: { currency: 'ZAR', amount: 15_000 },
        notes: ['Note 2'],
      };
      const merged = mergeForecasts([f1, f2], 'project-001');
      expect(merged.totalScheduled.amount).toBe(800_000);
      expect(merged.nextRelease.amount).toBe(150_000);
      expect(merged.retentionHeld.amount).toBe(40_000);
      expect(merged.notes).toContain('Note 1');
      expect(merged.notes).toContain('Note 2');
    });
  });
});
