/**
 * Unit tests for agentRecommendationService (Pack 2)
 * Tests recommendation generation, human approval guardrails, priority ordering.
 */
import { describe, expect, it } from 'vitest';
import {
  recommendationsFromPassport,
  createRecommendation,
} from '../masterExpansion/agentRecommendationService';
import type {
  ProjectPassportSummary,
  WorkflowEvent,
} from '@/types/architexMasterTypes';

function makePassport(
  overrides: Partial<ProjectPassportSummary> = {},
): ProjectPassportSummary {
  return {
    tenantId: 't1',
    projectId: 'p1',
    currentPhase: 'construction_execution',
    totalRecords: 5,
    currentDrawingRevisions: 2,
    openRisks: 3,
    pendingApprovals: 1,
    outstandingPayments: 1,
    missingRequiredRecords: ['municipal_submission_item', 'snag'],
    nextBestActions: ['Upload municipal approval', 'Resolve outstanding snags'],
    projectName: 'Test Project',
    clientName: 'Test Client',
    municipality: 'City of Cape Town',
    approvalStatus: 'missing',
    documentStatus: 'ready',
    financialStatus: 'pending_review',
    riskLevel: 'high',
    lifecycle: {
      phase: 'construction_execution',
      requiredRecordTypes: ['site_diary', 'snag'],
      presentRequiredRecordTypes: ['site_diary'],
      missingRecords: [
        {
          recordType: 'snag',
          priority: 'high',
          reason: 'Required for Construction: snag',
        },
        {
          recordType: 'municipal_submission_item',
          priority: 'critical',
          reason: 'Required municipal approval missing',
        },
      ],
      mayAdvance: false,
      blockers: [
        '[HIGH] Missing snag',
        '[CRITICAL] Construction requires municipal approval evidence',
      ],
      nextBestActions: [
        'Upload municipal approval',
        'Create baseline snag register',
      ],
    },
    ...overrides,
  };
}

function makeEvent(overrides: Partial<WorkflowEvent> = {}): WorkflowEvent {
  return {
    id: 'evt-1',
    type: 'risk_detected',
    projectId: 'p1',
    title: 'Construction Without Approval Evidence',
    detail: 'Construction phase requires municipal approval evidence.',
    priority: 'critical',
    sourceModule: 'projects',
    assignedRoles: ['client', 'architect', 'platform_admin'],
    createdAt: '2026-06-09T00:00:00Z',
    ...overrides,
  };
}

describe('recommendationsFromPassport', () => {
  it('generates recommendations from passport and events', () => {
    const passport = makePassport();
    const events = [makeEvent()];
    const recs = recommendationsFromPassport(passport, events);

    expect(recs.length).toBeGreaterThan(0);
  });

  it('each recommendation has required fields', () => {
    const passport = makePassport();
    const events = [makeEvent()];
    const recs = recommendationsFromPassport(passport, events);

    for (const rec of recs) {
      expect(rec.id).toBeTruthy();
      expect(rec.scope).toMatch(/^(user|project)$/);
      expect(rec.title).toBeTruthy();
      expect(rec.rationale).toBeTruthy();
      expect(rec.priority).toBeTruthy();
      expect(rec.recommendedActionLabel).toBeTruthy();
      expect(rec.relatedRoute).toBeTruthy();
      expect(typeof rec.requiresHumanApproval).toBe('boolean');
    }
  });

  it('generates recommendation for each missing record', () => {
    const passport = makePassport();
    const recs = recommendationsFromPassport(passport, []);

    const missingRecs = recs.filter((r) => r.id.startsWith('rec-missing-'));
    expect(missingRecs.length).toBeGreaterThanOrEqual(
      (passport.missingRequiredRecords ?? []).length,
    );
  });

  it('generates blocker resolution recommendations', () => {
    const passport = makePassport();
    const recs = recommendationsFromPassport(passport, []);

    const blockerRecs = recs.filter((r) => r.id.startsWith('rec-blocker-'));
    expect(blockerRecs.length).toBeGreaterThan(0);
  });

  it('flags critical recommendations for human approval', () => {
    const passport = makePassport();
    const events = [makeEvent()];

    const recs = recommendationsFromPassport(passport, events);
    const criticalRecs = recs.filter((r) => r.priority === 'critical');
    for (const rec of criticalRecs) {
      expect(rec.requiresHumanApproval).toBe(true);
    }
  });

  it('generates approval status recommendation when missing', () => {
    const passport = makePassport({ approvalStatus: 'missing' });
    const recs = recommendationsFromPassport(passport, []);

    const approvalRec = recs.find((r) => r.id === 'rec-approval-missing');
    expect(approvalRec).toBeDefined();
    expect(approvalRec!.requiresHumanApproval).toBe(true);
  });

  it('generates financial status recommendation when pending review', () => {
    const passport = makePassport({ financialStatus: 'pending_review' });
    const recs = recommendationsFromPassport(passport, []);

    const finRec = recs.find((r) => r.id === 'rec-financial-pending');
    expect(finRec).toBeDefined();
  });

  it('generates document status recommendation when incomplete', () => {
    const passport = makePassport({ documentStatus: 'incomplete' });
    const recs = recommendationsFromPassport(passport, []);

    const docRec = recs.find((r) => r.id === 'rec-docs-incomplete');
    expect(docRec).toBeDefined();
  });

  it('sorts recommendations by priority (critical first)', () => {
    const passport = makePassport();
    const events = [makeEvent()];
    const recs = recommendationsFromPassport(passport, events);

    if (recs.length >= 2) {
      const rankOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      for (let i = 1; i < recs.length; i++) {
        expect(rankOrder[recs[i - 1].priority]).toBeGreaterThanOrEqual(
          rankOrder[recs[i].priority],
        );
      }
    }
  });

  it('includes event-based recommendations for critical events', () => {
    const passport = makePassport();
    const events = [makeEvent({ priority: 'critical' })];
    const recs = recommendationsFromPassport(passport, events);

    const eventRecs = recs.filter((r) => r.id.startsWith('rec-event-'));
    expect(eventRecs.length).toBeGreaterThan(0);
  });
});

describe('createRecommendation', () => {
  it('creates a single recommendation with the right shape', () => {
    const rec = createRecommendation({
      projectId: 'p1',
      title: 'Test Recommendation',
      rationale: 'Test rationale',
      priority: 'high',
      actionLabel: 'Test Action',
      route: '/projects/p1/test',
      requiresApproval: true,
      relatedRecordType: 'snag',
    });

    expect(rec.id).toContain('rec-p1');
    expect(rec.scope).toBe('project');
    expect(rec.title).toBe('Test Recommendation');
    expect(rec.priority).toBe('high');
    expect(rec.requiresHumanApproval).toBe(true);
    expect(rec.relatedRecordType).toBe('snag');
    expect(rec.relatedRoute).toBe('/projects/p1/test');
  });
});
