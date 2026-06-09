/**
 * Alert Scheduler Service
 *
 * Registers alert rules, evaluates them against ProjectRecords,
 * creates Inbox events when rules fire, and handles throttling.
 *
 * Guardrails:
 * - Automated alerts are configurable per-project.
 * - Alerts must be acknowledged before proceeding.
 * - Frequency throttling prevents alert fatigue.
 */

import type { AlertCondition, AlertEvent, AlertRule, Severity } from '../types/analyticsReporting';
import type { WorkflowRecord } from '../types/analyticsReporting';

// ── In-memory stores (production would use Firestore) ───────────────────────────

const alertRules = new Map<string, AlertRule>();
const alertEvents = new Map<string, AlertEvent>();
const lastFiredTimestamps = new Map<string, number>(); // ruleId -> lastFiredAt ms

let eventSeq = 1;
let ruleSeq = 1;

// ── Rule Registration ──────────────────────────────────────────────────────────

export function registerAlertRule(params: {
  name: string;
  description: string;
  condition: AlertCondition;
  severity: Severity;
  recipientRole: string;
  requiresAcknowledgement?: boolean;
  cooldownMinutes?: number;
  projectId?: string;
  tenantId: string;
  createdBy: string;
}): AlertRule {
  const rule: AlertRule = {
    ruleId: `alert-rule-${ruleSeq++}`,
    name: params.name,
    description: params.description,
    condition: params.condition,
    severity: params.severity,
    recipientRole: params.recipientRole,
    requiresAcknowledgement: params.requiresAcknowledgement ?? true,
    cooldownMinutes: params.cooldownMinutes ?? 60,
    enabled: true,
    projectId: params.projectId,
    tenantId: params.tenantId,
    createdBy: params.createdBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  alertRules.set(rule.ruleId, rule);
  return rule;
}

export function getAlertRule(ruleId: string): AlertRule | undefined {
  return alertRules.get(ruleId);
}

export function getAlertRulesForProject(projectId: string): AlertRule[] {
  return [...alertRules.values()].filter(
    (r) => r.enabled && (r.projectId === projectId || r.projectId === undefined),
  );
}

export function getAlertRulesForTenant(tenantId: string): AlertRule[] {
  return [...alertRules.values()].filter((r) => r.enabled && r.tenantId === tenantId);
}

export function disableAlertRule(ruleId: string): boolean {
  const rule = alertRules.get(ruleId);
  if (!rule) return false;
  rule.enabled = false;
  rule.updatedAt = new Date().toISOString();
  return true;
}

export function enableAlertRule(ruleId: string): boolean {
  const rule = alertRules.get(ruleId);
  if (!rule) return false;
  rule.enabled = true;
  rule.updatedAt = new Date().toISOString();
  return true;
}

// ── Condition Evaluation ────────────────────────────────────────────────────────

function evaluateCondition(condition: AlertCondition, record: WorkflowRecord): boolean {
  switch (condition.type) {
    case 'blocker_present': {
      const blocker = condition.value as string;
      return record.blockers.some(
        (b) => b.includes(blocker) || (condition.metadata?.matchExact ? b === blocker : false),
      );
    }

    case 'status_check': {
      const expectedStatus = condition.value as string;
      const op = condition.operator || 'eq';
      switch (op) {
        case 'eq': return record.status === expectedStatus;
        case 'neq': return record.status !== expectedStatus;
        default: return false;
      }
    }

    case 'date_check': {
      const field = condition.field;
      if (!field) return false;
      const dateValue = (record.payload as Record<string, unknown>)?.[field] as string | undefined;
      if (!dateValue) return false;
      const targetDate = new Date(dateValue);
      const now = new Date();
      const op = condition.operator || 'lt';
      switch (op) {
        case 'lt': return targetDate < now; // date is in the past
        case 'lte': return targetDate <= now;
        case 'gt': return targetDate > now;
        case 'gte': return targetDate >= now;
        default: return false;
      }
    }

    case 'threshold_exceeded': {
      const field = condition.field;
      if (!field) return false;
      const actual = (record.payload as Record<string, unknown>)?.[field] as number | undefined;
      if (typeof actual !== 'number') return false;
      const threshold = condition.value as number;
      const op = condition.operator || 'gt';
      switch (op) {
        case 'gt': return actual > threshold;
        case 'gte': return actual >= threshold;
        case 'lt': return actual < threshold;
        case 'lte': return actual <= threshold;
        case 'eq': return actual === threshold;
        default: return false;
      }
    }

    case 'field_comparison': {
      const field = condition.field;
      if (!field) return false;
      const actual = (record.payload as Record<string, unknown>)?.[field];
      const expected = condition.value;
      const op = condition.operator || 'eq';
      switch (op) {
        case 'eq': return actual === expected;
        case 'neq': return actual !== expected;
        case 'contains': return String(actual).includes(String(expected));
        case 'in': {
          const list = expected as unknown[];
          if (!Array.isArray(list)) return false;
          return list.includes(actual);
        }
        default: return false;
      }
    }

    default:
      return false;
  }
}

// ── Throttling ──────────────────────────────────────────────────────────────────

function isThrottled(rule: AlertRule): boolean {
  const lastFired = lastFiredTimestamps.get(rule.ruleId);
  if (!lastFired) return false;
  const cooldownMs = rule.cooldownMinutes * 60 * 1000;
  return Date.now() - lastFired < cooldownMs;
}

function recordFiring(ruleId: string): void {
  lastFiredTimestamps.set(ruleId, Date.now());
}

// ── Alert Evaluation ────────────────────────────────────────────────────────────

export interface AlertEvaluationResult {
  rule: AlertRule;
  triggered: boolean;
  matchedRecords: string[];
  event?: AlertEvent;
  throttled: boolean;
}

export function evaluateAlertRule(
  rule: AlertRule,
  records: WorkflowRecord[],
): AlertEvaluationResult {
  if (!rule.enabled) {
    return { rule, triggered: false, matchedRecords: [], throttled: false };
  }

  if (isThrottled(rule)) {
    return { rule, triggered: true, matchedRecords: [], throttled: true };
  }

  const matchedRecords = records
    .filter((r) => evaluateCondition(rule.condition, r))
    .map((r) => r.id);

  if (matchedRecords.length === 0) {
    return { rule, triggered: false, matchedRecords: [], throttled: false };
  }

  // Fire alert
  const event: AlertEvent = {
    eventId: `alert-event-${eventSeq++}`,
    ruleId: rule.ruleId,
    title: `${rule.severity.toUpperCase()}: ${rule.name}`,
    description: rule.description,
    severity: rule.severity,
    recipientRole: rule.recipientRole,
    sourceObjectId: matchedRecords[0],
    projectId: rule.projectId || 'tenant-wide',
    tenantId: rule.tenantId,
    firedAt: new Date().toISOString(),
    acknowledged: false,
  };

  alertEvents.set(event.eventId, event);
  recordFiring(rule.ruleId);

  return { rule, triggered: true, matchedRecords, event, throttled: false };
}

/**
 * Evaluate all registered alert rules against a set of records.
 */
export function evaluateAllAlerts(
  records: WorkflowRecord[],
  options?: { projectId?: string; tenantId?: string },
): AlertEvaluationResult[] {
  const results: AlertEvaluationResult[] = [];

  for (const rule of alertRules.values()) {
    // Filter by project/tenant scope
    if (options?.projectId && rule.projectId && rule.projectId !== options.projectId) continue;
    if (options?.tenantId && rule.tenantId !== options.tenantId) continue;

    results.push(evaluateAlertRule(rule, records));
  }

  return results;
}

// ── Event Management ────────────────────────────────────────────────────────────

export function getAlertEvents(options?: {
  projectId?: string;
  unacknowledgedOnly?: boolean;
  severity?: Severity;
}): AlertEvent[] {
  let events = [...alertEvents.values()];

  if (options?.projectId) {
    events = events.filter((e) => e.projectId === options.projectId);
  }
  if (options?.unacknowledgedOnly) {
    events = events.filter((e) => !e.acknowledged);
  }
  if (options?.severity) {
    events = events.filter((e) => e.severity === options.severity);
  }

  return events.sort((a, b) => new Date(b.firedAt).getTime() - new Date(a.firedAt).getTime());
}

export function acknowledgeAlertEvent(
  eventId: string,
  acknowledgedBy: string,
): AlertEvent | undefined {
  const event = alertEvents.get(eventId);
  if (!event) return undefined;
  event.acknowledged = true;
  event.acknowledgedBy = acknowledgedBy;
  event.acknowledgedAt = new Date().toISOString();
  return event;
}

export function getAlertEventCount(options?: {
  projectId?: string;
  unacknowledgedOnly?: boolean;
}): number {
  return getAlertEvents(options).length;
}

// ── Reset (for testing) ─────────────────────────────────────────────────────────

export function resetAlertState(): void {
  alertRules.clear();
  alertEvents.clear();
  lastFiredTimestamps.clear();
  eventSeq = 1;
  ruleSeq = 1;
}
