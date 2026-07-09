import { describe, it, expect } from 'vitest';
import {
  emitDeadlineWarning,
  emitPhaseOverdue,
  emitEAPRequired,
  emitMonitoringReminder,
  emitEventTriggeredReminder,
  emitNonCompliantAlert,
  emitAuthorizationExpiryWarning,
  emitNetZeroDeviation,
  emitGreenStarAtRisk,
} from '../../services/eia/eiaEventService';
import type { ArchitexRole, WorkflowEvent } from '../../services/lifecycleTypes';

describe('eiaEventService', () => {
  describe('emitDeadlineWarning', () => {
    it('emits a deadline_warning type event with medium priority', () => {
      const roles: ArchitexRole[] = ['architect', 'engineer'];
      const event = emitDeadlineWarning('proj-1', 'authority_review', 10, roles);

      expect(event.type).toBe('task_overdue');
      expect(event.projectId).toBe('proj-1');
      expect(event.priority).toBe('medium');
      expect(event.assignedRoles).toEqual(roles);
      expect(event.title).toContain('authority_review');
      expect(event.detail).toContain('10 days');
    });

    it('handles singular day correctly', () => {
      const event = emitDeadlineWarning('proj-1', 'decision', 1, ['architect']);
      expect(event.detail).toContain('1 day remaining');
    });
  });

  describe('emitPhaseOverdue', () => {
    it('emits a blocker type event with critical priority', () => {
      const roles: ArchitexRole[] = ['architect'];
      const event = emitPhaseOverdue('proj-2', 'bar_submission', 5, roles);

      expect(event.type).toBe('municipal_blocker');
      expect(event.projectId).toBe('proj-2');
      expect(event.priority).toBe('critical');
      expect(event.assignedRoles).toEqual(roles);
      expect(event.title).toContain('overdue');
      expect(event.detail).toContain('5 days');
    });
  });

  describe('emitEAPRequired', () => {
    it('emits an action_required event with high priority', () => {
      const roles: ArchitexRole[] = ['architect', 'engineer'];
      const event = emitEAPRequired('proj-3', roles);

      expect(event.type).toBe('approval_required');
      expect(event.projectId).toBe('proj-3');
      expect(event.priority).toBe('high');
      expect(event.assignedRoles).toEqual(roles);
      expect(event.title).toContain('EAP');
      expect(event.detail).toContain('Environmental Assessment Practitioner');
    });
  });

  describe('emitMonitoringReminder', () => {
    it('emits a deadline_warning event for 24h monitoring', () => {
      const event = emitMonitoringReminder('proj-4', 'EMPr-001', 'Site Manager');

      expect(event.type).toBe('task_overdue');
      expect(event.projectId).toBe('proj-4');
      expect(event.priority).toBe('medium');
      expect(event.title).toContain('EMPr-001');
      expect(event.detail).toContain('24 hours');
      expect(event.detail).toContain('Site Manager');
    });
  });

  describe('emitEventTriggeredReminder', () => {
    it('emits a deadline_warning event for 48h event-triggered monitoring', () => {
      const event = emitEventTriggeredReminder('proj-5', 'EMPr-010', 'Contractor');

      expect(event.type).toBe('task_overdue');
      expect(event.projectId).toBe('proj-5');
      expect(event.priority).toBe('medium');
      expect(event.title).toContain('EMPr-010');
      expect(event.detail).toContain('48 hours');
      expect(event.detail).toContain('Contractor');
    });
  });

  describe('emitNonCompliantAlert', () => {
    it('emits an action_required event with high priority', () => {
      const event = emitNonCompliantAlert('proj-6', 'EMPr-005', 'Environmental Officer');

      expect(event.type).toBe('approval_required');
      expect(event.projectId).toBe('proj-6');
      expect(event.priority).toBe('high');
      expect(event.title).toContain('non-compliance');
      expect(event.detail).toContain('non-compliant');
      expect(event.detail).toContain('Environmental Officer');
    });
  });

  describe('emitAuthorizationExpiryWarning', () => {
    it('emits an action_required event at 60-day threshold', () => {
      const event = emitAuthorizationExpiryWarning('proj-7', 'EA/2024/001', 45);

      expect(event.type).toBe('approval_required');
      expect(event.projectId).toBe('proj-7');
      expect(event.priority).toBe('high');
      expect(event.title).toContain('EA/2024/001');
      expect(event.detail).toContain('45 days');
      expect(event.detail).toContain('amendment');
    });
  });

  describe('emitNetZeroDeviation', () => {
    it('emits an info event when deviation exceeds 10pp', () => {
      const event = emitNetZeroDeviation('proj-8', 'net_zero_carbon', 15.3);

      expect(event.type).toBe('risk_detected');
      expect(event.projectId).toBe('proj-8');
      expect(event.priority).toBe('medium');
      expect(event.title).toContain('net_zero_carbon');
      expect(event.detail).toContain('15.3');
    });
  });

  describe('emitGreenStarAtRisk', () => {
    it('emits an action_required event for at-risk credits', () => {
      const event = emitGreenStarAtRisk('proj-9', 'Daylight', 'ieq');

      expect(event.type).toBe('approval_required');
      expect(event.projectId).toBe('proj-9');
      expect(event.priority).toBe('high');
      expect(event.title).toContain('Daylight');
      expect(event.detail).toContain('ieq');
      expect(event.detail).toContain('30 days');
    });
  });

  describe('common event structure', () => {
    it('all events include id, createdAt, and sourceModule', () => {
      const event = emitDeadlineWarning('proj-x', 'test', 7, ['architect']);

      expect(event.id).toBeTruthy();
      expect(event.id).toMatch(/^eia_evt_/);
      expect(event.createdAt).toBeTruthy();
      expect(event.sourceModule).toBe('documents');
    });
  });
});
