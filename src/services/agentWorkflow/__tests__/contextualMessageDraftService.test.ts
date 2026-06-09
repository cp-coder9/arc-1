/**
 * Tests for Contextual Message Draft Service — Pack 14
 */
import { describe, expect, it } from 'vitest';
import {
  getTemplateForEvent,
  draftMessage,
  extractMessageContext,
  draftMessagesForEvents,
} from '../contextualMessageDraftService';
import type { ProjectRecord } from '@/types/architexMasterTypes';

function makeRecord(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: 'rec-1', tenantId: 't1', projectId: 'p1', phase: 'brief_feasibility',
    moduleKey: 'finance', recordType: 'payment_certificate', title: 'Payment Cert #1',
    status: 'active',
    payload: { amount: 150000, status: 'pending_review' },
    approval: { status: 'pending_review', requiredApproverRoles: [] },
    audit: { createdByUserId: 'u1', createdAt: new Date().toISOString() },
    linkedRecordIds: [],
    ...overrides,
  };
}

describe('contextualMessageDraftService', () => {
  describe('getTemplateForEvent', () => {
    it('returns template for approval_required', () => {
      const tpl = getTemplateForEvent('approval_required');
      expect(tpl).toBeDefined();
      expect(tpl!.name).toBe('Missing Approval Notice');
      expect(tpl!.defaultTone).toBe('urgent');
    });

    it('returns template for payment_due', () => {
      const tpl = getTemplateForEvent('payment_due');
      expect(tpl).toBeDefined();
      expect(tpl!.defaultTone).toBe('formal');
    });

    it('returns undefined for unknown event type', () => {
      expect(getTemplateForEvent('nonexistent')).toBeUndefined();
    });
  });

  describe('draftMessage', () => {
    it('interpolates template variables', () => {
      const tpl = getTemplateForEvent('approval_required')!;
      const draft = draftMessage(tpl, {
        projectName: 'Test Project',
        phase: 'design_coordination',
        recordType: 'site_diary',
        reason: 'Missing signature',
      });

      expect(draft.subject).toContain('Test Project');
      expect(draft.body).toContain('site_diary');
      expect(draft.body).toContain('Missing signature');
      expect(draft.tone).toBe('urgent');
      expect(draft.requiresReview).toBe(true);
      expect(draft.generatedAt).toBeTruthy();
    });

    it('generates non-urgent draft for informative templates', () => {
      const tpl = getTemplateForEvent('project_phase_changed')!;
      const draft = draftMessage(tpl, {
        projectName: 'Building A',
        previousPhase: 'brief_feasibility',
        newPhase: 'design_coordination',
      });

      expect(draft.tone).toBe('informative');
      expect(draft.requiresReview).toBe(false);
    });

    it('leaves unmatched variables as placeholders', () => {
      const tpl = getTemplateForEvent('approval_required')!;
      const draft = draftMessage(tpl, { projectName: 'A' });

      // Unmatched placeholders should remain
      expect(draft.subject).toContain('A');
      expect(draft.body).toContain('{{phase}}'); // Should find a match or remain if unmatched key
    });
  });

  describe('extractMessageContext', () => {
    it('extracts payment info from records', () => {
      const records = [makeRecord({ recordType: 'payment_certificate', payload: { amount: 250000, status: 'pending_review' } })];
      const ctx = extractMessageContext(records, 'Project X', 'construction_execution');

      expect(ctx.projectName).toBe('Project X');
      expect(ctx.phase).toBe('construction_execution');
      expect(ctx.amount).toContain('250');
      expect(ctx.status).toBe('pending_review');
    });

    it('extracts missing record info', () => {
      const records = [
        makeRecord({
          recordType: 'site_diary',
          status: 'missing',
          approval: { status: 'pending_review', requiredApproverRoles: [] },
        }),
      ];

      const ctx = extractMessageContext(records, 'Project Y', 'construction_execution');
      expect(ctx.recordType).toBe('site_diary');
      expect(ctx.nextAction).toContain('site_diary');
    });

    it('handles empty records', () => {
      const ctx = extractMessageContext([], 'Project Z', 'closeout');
      expect(ctx.projectName).toBe('Project Z');
      expect(ctx.phase).toBe('closeout');
    });
  });

  describe('draftMessagesForEvents', () => {
    it('generates drafts for multiple event types', () => {
      const context = {
        projectName: 'Multi Event Project',
        phase: 'construction_execution',
        newPhase: 'construction_execution',
        previousPhase: 'tender_procurement',
        recordType: 'risk_alert',
        moduleName: 'risk_engine',
        reason: 'Unresolved risk',
        nextAction: 'Review risk register',
        amount: 'R50,000',
        status: 'pending',
      };

      const drafts = draftMessagesForEvents(
        ['approval_required', 'risk_detected', 'payment_due', 'project_phase_changed'],
        context,
      );

      expect(drafts.length).toBeGreaterThan(0);
      // Each draft should have its own ID
      const ids = new Set(drafts.map((d) => d.id));
      expect(ids.size).toBe(drafts.length);
    });

    it('skips events without templates or with missing vars', () => {
      const drafts = draftMessagesForEvents(['nonexistent'], { projectName: 'A' });
      expect(drafts).toHaveLength(0);
    });
  });
});
