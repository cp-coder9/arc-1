/**
 * Integration & Reporting Service — Tests
 *
 * - Property 11: Audit Trail Completeness
 * - Unit tests for Planning Reporting Service
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';

import {
  generateDocumentChecklist,
  auditEvent,
  surfaceAction,
} from '../services/planningIntegrationService';

import {
  generatePortfolioReport,
  generateClientReport,
  generateComplianceReport,
  getAverageProcessingTimes,
  getAtRiskApplications,
  getDashboardMetrics,
} from '../services/planningReportingService';

import type { PlanningApplication, Deadline, Objection, Hearing } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockApp(overrides: Partial<PlanningApplication> = {}): PlanningApplication {
  return {
    id: `app-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId: 'tenant-1',
    projectId: 'proj-1',
    referenceNumber: 'TP-2026-001',
    applicationType: 'rezoning',
    currentStage: 'circulation_advertising',
    status: 'active',
    municipalityId: 'muni-1',
    assignedTownPlannerId: 'tp-1',
    propertyDescription: 'Erf 123',
    erfNumber: 'ERF-123',
    titleDeedReference: 'T123/2025',
    applicantName: 'Test',
    applicantContactDetails: { name: 'Test', email: 't@t.com', phone: '0' },
    interdependencies: [],
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

function createMockDeadline(overrides: Partial<Deadline> = {}): Deadline {
  return {
    id: `dl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    applicationId: 'app-1',
    type: 'statutory',
    label: 'Test Deadline',
    dueDate: '2026-08-01',
    status: 'pending',
    daysRemaining: 30,
    alertGenerated: false,
    ...overrides,
  };
}

// ─── Property 11: Audit Trail Completeness ───────────────────────────────────

describe('Property 11: Audit Trail Completeness', () => {
  it('auditEvent accepts all required parameters without throwing', () => {
    expect(() => auditEvent({
      applicationId: 'app-1',
      projectId: 'proj-1',
      action: 'planning_application_created',
      actorId: 'user-1',
      details: { applicationType: 'rezoning' },
    })).not.toThrow();
  });

  it('surfaceAction accepts all required parameters without throwing', () => {
    expect(() => surfaceAction({
      applicationId: 'app-1',
      projectId: 'proj-1',
      priority: 'high',
      title: 'Test action',
      dueDate: '2026-07-01',
      assignedRoles: ['town_planner'],
    })).not.toThrow();
  });

  it('generateDocumentChecklist produces items for all stages of an application type', () => {
    const checklist = generateDocumentChecklist('app-1', 'rezoning');
    expect(checklist.length).toBeGreaterThan(0);
    // Should have items for multiple stages
    const stages = new Set(checklist.map((item) => item.stage));
    expect(stages.size).toBeGreaterThan(3);
    // All items should have required fields
    for (const item of checklist) {
      expect(item.id).toBeTruthy();
      expect(item.applicationId).toBe('app-1');
      expect(item.documentType).toBeTruthy();
      expect(item.status).toBe('required');
    }
  });
});

// ─── Unit Tests: Planning Reporting Service ──────────────────────────────────

describe('planningReportingService', () => {
  describe('generatePortfolioReport', () => {
    it('groups applications by status, municipality, and type', () => {
      const apps = [
        createMockApp({ status: 'active', municipalityId: 'muni-a', applicationType: 'rezoning' }),
        createMockApp({ status: 'active', municipalityId: 'muni-a', applicationType: 'subdivision' }),
        createMockApp({ status: 'draft', municipalityId: 'muni-b', applicationType: 'rezoning' }),
      ];

      const report = generatePortfolioReport(apps);
      expect(report.applicationsByStatus['active']).toBe(2);
      expect(report.applicationsByStatus['draft']).toBe(1);
      expect(report.applicationsByMunicipality['muni-a']).toBe(2);
      expect(report.applicationsByMunicipality['muni-b']).toBe(1);
      expect(report.applicationsByType['rezoning']).toBe(2);
      expect(report.applicationsByType['subdivision']).toBe(1);
      expect(report.activeApplications.length).toBe(3);
      expect(report.generatedAt).toBeTruthy();
    });

    it('returns empty groupings for empty input', () => {
      const report = generatePortfolioReport([]);
      expect(report.applicationsByStatus).toEqual({});
      expect(report.activeApplications).toEqual([]);
    });
  });

  describe('generateComplianceReport', () => {
    it('calculates compliance rate correctly', () => {
      const deadlines = [
        createMockDeadline({ dueDate: '2026-06-01', status: 'met' }),
        createMockDeadline({ dueDate: '2026-06-15', status: 'met' }),
        createMockDeadline({ dueDate: '2026-06-20', status: 'overdue' }),
      ];

      const report = generateComplianceReport(deadlines, { from: '2026-01-01', to: '2026-12-31' });
      expect(report.deadlinesMet).toBe(2);
      expect(report.deadlinesMissed).toBe(1);
      expect(report.complianceRate).toBe(67); // 2/3 = 66.67 → rounded to 67
      expect(report.missedDeadlineDetails).toHaveLength(1);
    });

    it('returns 100% compliance when no deadlines in range', () => {
      const report = generateComplianceReport([], { from: '2026-01-01', to: '2026-12-31' });
      expect(report.complianceRate).toBe(100);
    });
  });

  describe('getAverageProcessingTimes', () => {
    it('returns 0 for empty input', () => {
      expect(getAverageProcessingTimes([])).toBe(0);
    });

    it('calculates average days from creation to now', () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const apps = [
        createMockApp({ createdAt: thirtyDaysAgo }),
      ];
      const avg = getAverageProcessingTimes(apps);
      expect(avg).toBeGreaterThanOrEqual(29);
      expect(avg).toBeLessThanOrEqual(31);
    });
  });

  describe('getAtRiskApplications', () => {
    it('identifies applications with overdue deadlines', () => {
      const app = createMockApp({ id: 'risk-app' });
      const deadlines = [
        createMockDeadline({ applicationId: 'risk-app', dueDate: '2020-01-01', status: 'pending' }),
      ];

      const atRisk = getAtRiskApplications([app], deadlines);
      expect(atRisk.length).toBe(1);
      expect(atRisk[0].riskLevel).toBe('high');
      expect(atRisk[0].riskReasons[0]).toContain('overdue');
    });

    it('returns empty for applications with no deadline issues', () => {
      const app = createMockApp({ id: 'safe-app' });
      const deadlines = [
        createMockDeadline({ applicationId: 'safe-app', dueDate: '2030-12-31', status: 'pending' }),
      ];

      const atRisk = getAtRiskApplications([app], deadlines);
      expect(atRisk.length).toBe(0);
    });
  });

  describe('getDashboardMetrics', () => {
    it('returns correct counts', () => {
      const apps = [
        createMockApp({ status: 'active' }),
        createMockApp({ status: 'draft' }),
        createMockApp({ status: 'approved' }),
      ];
      const deadlines: Deadline[] = [
        createMockDeadline({ dueDate: '2020-01-01', status: 'pending' }), // overdue
      ];
      const objections: Objection[] = [
        {
          id: 'obj-1', applicationId: 'app-1', objectorName: 'Test',
          objectorContactDetails: { name: 'T', email: 't@t.com', phone: '0' },
          dateReceived: '2026-01-01', groundsOfObjection: 'Test',
          supportingDocumentIds: [], status: 'received', isLate: false,
        },
      ];
      const hearings: Hearing[] = [];

      const metrics = getDashboardMetrics(apps, deadlines, objections, hearings);
      expect(metrics.totalActive).toBe(2); // active + draft
      expect(metrics.overdueDeadlines).toBe(1);
      expect(metrics.pendingObjectionResponses).toBe(1);
      expect(metrics.hearingsThisMonth).toBe(0);
    });
  });
});
