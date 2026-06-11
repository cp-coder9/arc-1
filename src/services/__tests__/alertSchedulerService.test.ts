import { describe, expect, it, beforeEach } from 'vitest';
import {
  registerAlertRule,
  getAlertRule,
  getAlertRulesForProject,
  evaluateAlertRule,
  evaluateAllAlerts,
  getAlertEvents,
  getAlertEventCount,
  acknowledgeAlertEvent,
  disableAlertRule,
  enableAlertRule,
  resetAlertState,
} from '../alertSchedulerService';
import type { WorkflowRecord } from '../../types/analyticsReporting';

describe('alertSchedulerService', () => {
  beforeEach(() => {
    resetAlertState();
  });

  // ── Rule Registration ──────────────────────────────────────────────────────
  describe('registerAlertRule', () => {
    it('registers a rule and returns it with generated ID', () => {
      const rule = registerAlertRule({
        name: 'Retention Release Pending',
        description: 'Alert when retention release conditions are met',
        condition: { type: 'blocker_present', value: 'retention_release_pending' },
        severity: 'high',
        recipientRole: 'principal_agent',
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });

      expect(rule.ruleId).toMatch(/^alert-rule-/);
      expect(rule.enabled).toBe(true);
      expect(rule.requiresAcknowledgement).toBe(true);
      expect(rule.cooldownMinutes).toBe(60);
    });

    it('allows custom cooldown and acknowledgement settings', () => {
      const rule = registerAlertRule({
        name: 'Low Priority Alert',
        description: 'Test',
        condition: { type: 'status_check', operator: 'eq', value: 'blocked' },
        severity: 'low',
        recipientRole: 'contractor',
        requiresAcknowledgement: false,
        cooldownMinutes: 120,
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });

      expect(rule.requiresAcknowledgement).toBe(false);
      expect(rule.cooldownMinutes).toBe(120);
    });
  });

  describe('getAlertRule', () => {
    it('retrieves a registered rule by ID', () => {
      const rule = registerAlertRule({
        name: 'Test Rule',
        description: 'Test',
        condition: { type: 'status_check', value: 'ready' },
        severity: 'medium',
        recipientRole: 'platform_admin',
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });

      const found = getAlertRule(rule.ruleId);
      expect(found).toBeDefined();
      expect(found?.name).toBe('Test Rule');
    });

    it('returns undefined for non-existent rule', () => {
      expect(getAlertRule('nonexistent')).toBeUndefined();
    });
  });

  describe('getAlertRulesForProject', () => {
    it('returns project-specific and tenant-wide rules', () => {
      registerAlertRule({
        name: 'Project Rule',
        description: 'Specific',
        condition: { type: 'status_check', value: 'blocked' },
        severity: 'high',
        recipientRole: 'principal_agent',
        projectId: 'project-1',
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });
      registerAlertRule({
        name: 'Tenant Rule',
        description: 'Wide',
        condition: { type: 'status_check', value: 'blocked' },
        severity: 'medium',
        recipientRole: 'platform_admin',
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });
      registerAlertRule({
        name: 'Other Project Rule',
        description: 'Other',
        condition: { type: 'status_check', value: 'blocked' },
        severity: 'low',
        recipientRole: 'contractor',
        projectId: 'project-2',
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });

      const rules = getAlertRulesForProject('project-1');
      expect(rules).toHaveLength(2);
      expect(rules.map((r) => r.name)).toContain('Project Rule');
      expect(rules.map((r) => r.name)).toContain('Tenant Rule');
    });
  });

  // ── Rule Enable/Disable ────────────────────────────────────────────────────
  describe('disableAlertRule / enableAlertRule', () => {
    it('disables and re-enables a rule', () => {
      const rule = registerAlertRule({
        name: 'Toggle Rule',
        description: 'Test',
        condition: { type: 'status_check', value: 'blocked' },
        severity: 'high',
        recipientRole: 'principal_agent',
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });

      expect(disableAlertRule(rule.ruleId)).toBe(true);
      expect(getAlertRule(rule.ruleId)?.enabled).toBe(false);

      expect(enableAlertRule(rule.ruleId)).toBe(true);
      expect(getAlertRule(rule.ruleId)?.enabled).toBe(true);
    });

    it('returns false for non-existent rule', () => {
      expect(disableAlertRule('nonexistent')).toBe(false);
      expect(enableAlertRule('nonexistent')).toBe(false);
    });
  });

  // ── Condition Evaluation ───────────────────────────────────────────────────
  describe('evaluateAlertRule', () => {
    it('triggers on blocker_present condition', () => {
      const rule = registerAlertRule({
        name: 'Retention Alert',
        description: 'Retention release pending',
        condition: { type: 'blocker_present', value: 'retention_release_pending' },
        severity: 'high',
        recipientRole: 'principal_agent',
        cooldownMinutes: 0,
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });

      const records: WorkflowRecord[] = [
        { id: 'rec-1', type: 'retention', title: 'Retention Hold', status: 'blocked', payload: {}, blockers: ['retention_release_pending'], approvalsRequired: [] },
      ];

      const result = evaluateAlertRule(rule, records);
      expect(result.triggered).toBe(true);
      expect(result.matchedRecords).toContain('rec-1');
      expect(result.event).toBeDefined();
      expect(result.event?.ruleId).toBe(rule.ruleId);
    });

    it('does not trigger when condition not met', () => {
      const rule = registerAlertRule({
        name: 'Insurance Alert',
        description: 'Insurance expired',
        condition: { type: 'blocker_present', value: 'insurance_expired' },
        severity: 'critical',
        recipientRole: 'platform_admin',
        cooldownMinutes: 0,
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });

      const records: WorkflowRecord[] = [
        { id: 'rec-1', type: 'milestone', title: 'Design', status: 'ready', payload: {}, blockers: [], approvalsRequired: [] },
      ];

      const result = evaluateAlertRule(rule, records);
      expect(result.triggered).toBe(false);
      expect(result.matchedRecords).toHaveLength(0);
    });

    it('evaluates status_check condition', () => {
      const rule = registerAlertRule({
        name: 'Blocked Status Alert',
        description: 'Record is blocked',
        condition: { type: 'status_check', operator: 'eq', value: 'blocked' },
        severity: 'medium',
        recipientRole: 'principal_agent',
        cooldownMinutes: 0,
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });

      const records: WorkflowRecord[] = [
        { id: 'rec-1', type: 'task', title: 'Blocked Task', status: 'blocked', payload: {}, blockers: ['some_blocker'], approvalsRequired: [] },
        { id: 'rec-2', type: 'task', title: 'Ready Task', status: 'ready', payload: {}, blockers: [], approvalsRequired: [] },
      ];

      const result = evaluateAlertRule(rule, records);
      expect(result.triggered).toBe(true);
      expect(result.matchedRecords).toContain('rec-1');
      expect(result.matchedRecords).not.toContain('rec-2');
    });

    it('evaluates threshold_exceeded condition', () => {
      const rule = registerAlertRule({
        name: 'Cost Overrun Alert',
        description: 'Cost exceeds budget',
        condition: { type: 'threshold_exceeded', field: 'cost', operator: 'gt', value: 1_000_000 },
        severity: 'high',
        recipientRole: 'platform_admin',
        cooldownMinutes: 0,
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });

      const records: WorkflowRecord[] = [
        { id: 'rec-1', type: 'payment', title: 'Over Budget', status: 'active', payload: { cost: 1_500_000 }, blockers: [], approvalsRequired: [] },
        { id: 'rec-2', type: 'payment', title: 'Under Budget', status: 'active', payload: { cost: 500_000 }, blockers: [], approvalsRequired: [] },
      ];

      const result = evaluateAlertRule(rule, records);
      expect(result.triggered).toBe(true);
      expect(result.matchedRecords).toContain('rec-1');
    });

    it('respects throttling cooldown', () => {
      const rule = registerAlertRule({
        name: 'Throttled Alert',
        description: 'Should throttle',
        condition: { type: 'status_check', value: 'blocked' },
        severity: 'medium',
        recipientRole: 'principal_agent',
        cooldownMinutes: 60,
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });

      const records: WorkflowRecord[] = [
        { id: 'rec-1', type: 'task', title: 'Blocked', status: 'blocked', payload: {}, blockers: [], approvalsRequired: [] },
      ];

      const first = evaluateAlertRule(rule, records);
      expect(first.triggered).toBe(true);
      expect(first.throttled).toBe(false);

      const second = evaluateAlertRule(rule, records);
      expect(second.throttled).toBe(true); // throttled because just fired
    });

    it('does not evaluate disabled rules', () => {
      const rule = registerAlertRule({
        name: 'Disabled Rule',
        description: 'Should not fire',
        condition: { type: 'status_check', value: 'blocked' },
        severity: 'high',
        recipientRole: 'principal_agent',
        cooldownMinutes: 0,
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });
      disableAlertRule(rule.ruleId);

      const records: WorkflowRecord[] = [
        { id: 'rec-1', type: 'task', title: 'Blocked', status: 'blocked', payload: {}, blockers: [], approvalsRequired: [] },
      ];

      const result = evaluateAlertRule(rule, records);
      expect(result.triggered).toBe(false);
    });

    it('evaluates date_check condition', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const rule = registerAlertRule({
        name: 'Expiry Alert',
        description: 'Expiry date has passed',
        condition: { type: 'date_check', field: 'expiryDate', operator: 'lt', value: null },
        severity: 'high',
        recipientRole: 'platform_admin',
        cooldownMinutes: 0,
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });

      const records: WorkflowRecord[] = [
        { id: 'rec-1', type: 'insurance', title: 'Expired Insurance', status: 'active', payload: { expiryDate: yesterday.toISOString() }, blockers: [], approvalsRequired: [] },
      ];

      const result = evaluateAlertRule(rule, records);
      expect(result.triggered).toBe(true);
    });
  });

  // ── Alert Events ───────────────────────────────────────────────────────────
  describe('getAlertEvents', () => {
    it('returns events filtered by project', () => {
      const rule = registerAlertRule({
        name: 'Test Alert',
        description: 'Test',
        condition: { type: 'status_check', value: 'blocked' },
        severity: 'high',
        recipientRole: 'principal_agent',
        projectId: 'project-A',
        cooldownMinutes: 0,
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });

      const records: WorkflowRecord[] = [
        { id: 'rec-1', type: 'task', title: 'Blocked', status: 'blocked', payload: {}, blockers: [], approvalsRequired: [] },
      ];

      evaluateAlertRule(rule, records);

      const events = getAlertEvents({ projectId: 'project-A' });
      expect(events).toHaveLength(1);

      const otherEvents = getAlertEvents({ projectId: 'project-other' });
      expect(otherEvents).toHaveLength(0);
    });

    it('filters unacknowledged only', () => {
      const rule = registerAlertRule({
        name: 'Test Alert',
        description: 'Test',
        condition: { type: 'status_check', value: 'blocked' },
        severity: 'high',
        recipientRole: 'principal_agent',
        cooldownMinutes: 0,
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });

      const records: WorkflowRecord[] = [
        { id: 'rec-1', type: 'task', title: 'Blocked', status: 'blocked', payload: {}, blockers: [], approvalsRequired: [] },
      ];

      const evalResult = evaluateAlertRule(rule, records);
      acknowledgeAlertEvent(evalResult.event!.eventId, 'user-1');

      const all = getAlertEvents({ projectId: 'tenant-wide' });
      expect(all).toHaveLength(1);

      const unacknowledged = getAlertEvents({ projectId: 'tenant-wide', unacknowledgedOnly: true });
      expect(unacknowledged).toHaveLength(0);
    });
  });

  describe('acknowledgeAlertEvent', () => {
    it('acknowledges an alert event', () => {
      const rule = registerAlertRule({
        name: 'Test Alert',
        description: 'Test',
        condition: { type: 'status_check', value: 'blocked' },
        severity: 'medium',
        recipientRole: 'principal_agent',
        cooldownMinutes: 0,
        tenantId: 'tenant-1',
        createdBy: 'user-1',
      });

      const records: WorkflowRecord[] = [
        { id: 'rec-1', type: 'task', title: 'Blocked', status: 'blocked', payload: {}, blockers: [], approvalsRequired: [] },
      ];

      const evalResult = evaluateAlertRule(rule, records);
      const event = acknowledgeAlertEvent(evalResult.event!.eventId, 'user-1');

      expect(event?.acknowledged).toBe(true);
      expect(event?.acknowledgedBy).toBe('user-1');
      expect(event?.acknowledgedAt).toBeDefined();
    });

    it('returns undefined for non-existent event', () => {
      expect(acknowledgeAlertEvent('nonexistent', 'user-1')).toBeUndefined();
    });
  });
});
