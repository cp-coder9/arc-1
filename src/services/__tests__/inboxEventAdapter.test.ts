import { describe, expect, it, beforeEach } from 'vitest';
import {
  buildComplianceInboxEvent,
  buildVerificationRequiredEvent,
  buildDocumentExpiringEvent,
  buildDocumentExpiredEvent,
  buildRegistrationRenewalEvent,
  buildInsuranceExpiringEvent,
  buildComplianceCheckFailedEvent,
  buildRiskAlertEvent,
  buildConsentRequiredEvent,
  inbox,
  getInboxEvents,
  acknowledgeInboxEvent,
  getInboxEventCount,
  resetInboxState,
} from '../inboxEventAdapter';

describe('inboxEventAdapter — trust_verification_compliance', () => {
  beforeEach(() => resetInboxState());

  it('builds a compliance inbox event with correct envelope', () => {
    const event = buildComplianceInboxEvent({
      recipientRole: 'admin',
      title: 'Test Event',
      sourceObjectId: 'obj-1',
      priority: 'high',
      eventType: 'verification_required',
      description: 'Test description',
      projectId: 'proj-1',
    });

    expect(event.recipientRole).toBe('admin');
    expect(event.priority).toBe('high');
    expect(event.eventType).toBe('verification_required');
    expect(event.moduleKey).toBe('trust_verification_compliance');
    expect(event.acknowledged).toBe(false);
    expect(event.eventId).toMatch(/inbox-trust-/);
  });

  it('builds verification required event', () => {
    const event = buildVerificationRequiredEvent('admin', 'prof-1', 'professional');
    expect(event.eventType).toBe('verification_required');
    expect(event.title).toContain('professional');
  });

  it('builds document expiring event with critical priority when <7 days', () => {
    const event = buildDocumentExpiringEvent('admin', 'PI Certificate', 'doc-1', 5);
    expect(event.priority).toBe('critical');
    expect(event.eventType).toBe('document_expiring');
  });

  it('builds document expiring event with high priority when <30 days', () => {
    const event = buildDocumentExpiringEvent('admin', 'PI Certificate', 'doc-1', 20);
    expect(event.priority).toBe('high');
  });

  it('builds document expired event', () => {
    const event = buildDocumentExpiredEvent('admin', 'Tax Clearance', 'doc-2');
    expect(event.priority).toBe('critical');
    expect(event.eventType).toBe('document_expired');
  });

  it('builds registration renewal event', () => {
    const event = buildRegistrationRenewalEvent('professional', 'SACAP', 'SACAP-001', 10);
    expect(event.priority).toBe('critical'); // <=14 days
    expect(event.eventType).toBe('registration_renewal');
  });

  it('builds insurance expiring event', () => {
    const event = buildInsuranceExpiringEvent('professional', 'ABC Insurers', 'POL-001', 10);
    expect(event.priority).toBe('critical'); // <=14 days
    expect(event.eventType).toBe('insurance_renewal');
  });

  it('builds compliance check failed event', () => {
    const event = buildComplianceCheckFailedEvent('admin', 'contractor-1', 'Health & Safety', 'proj-1');
    expect(event.priority).toBe('high');
    expect(event.eventType).toBe('compliance_check');
  });

  it('builds risk alert event', () => {
    const event = buildRiskAlertEvent('admin', 'prof-1', 'critical', 3);
    expect(event.priority).toBe('critical');
    expect(event.eventType).toBe('risk_alert');
  });

  it('builds consent required event', () => {
    const event = buildConsentRequiredEvent('admin', 'user-1', 'professional_verification');
    expect(event.priority).toBe('high');
    expect(event.eventType).toBe('consent_required');
  });

  it('legacy inbox() function works correctly', () => {
    const event = inbox('admin', 'Legacy Event', 'obj-legacy', 'medium');
    expect(event.recipientRole).toBe('admin');
    expect(event.eventType).toBe('verification_required');
  });

  it('queries inbox events with filters', () => {
    buildComplianceInboxEvent({ recipientRole: 'admin', title: 'E1', sourceObjectId: 'o1', priority: 'high', eventType: 'risk_alert' });
    buildComplianceInboxEvent({ recipientRole: 'bep', title: 'E2', sourceObjectId: 'o2', priority: 'medium', eventType: 'document_expiring' });
    buildComplianceInboxEvent({ recipientRole: 'admin', title: 'E3', sourceObjectId: 'o3', priority: 'low', eventType: 'verification_required' });

    expect(getInboxEvents({ recipientRole: 'admin' })).toHaveLength(2);
    expect(getInboxEvents({ priority: 'high' })).toHaveLength(1);
    expect(getInboxEvents({ unacknowledgedOnly: true })).toHaveLength(3);
  });

  it('acknowledges an inbox event', () => {
    const event = buildComplianceInboxEvent({ recipientRole: 'admin', title: 'Test', sourceObjectId: 'o1', priority: 'medium', eventType: 'verification_required' });
    const acked = acknowledgeInboxEvent(event.eventId, 'admin-1');
    expect(acked?.acknowledged).toBe(true);
    expect(acked?.acknowledgedBy).toBe('admin-1');
  });

  it('returns undefined for non-existent event acknowledgment', () => {
    expect(acknowledgeInboxEvent('nonexistent', 'admin-1')).toBeUndefined();
  });

  it('counts inbox events', () => {
    buildComplianceInboxEvent({ recipientRole: 'admin', title: 'E1', sourceObjectId: 'o1', priority: 'high', eventType: 'risk_alert' });
    buildComplianceInboxEvent({ recipientRole: 'admin', title: 'E2', sourceObjectId: 'o2', priority: 'medium', eventType: 'document_expiring' });
    expect(getInboxEventCount()).toBe(2);
    expect(getInboxEventCount({ recipientRole: 'admin' })).toBe(2);
    expect(getInboxEventCount({ recipientRole: 'bep' })).toBe(0);
  });
});
