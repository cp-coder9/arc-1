import { describe, expect, it, vi } from 'vitest';
import {
  evaluateComplianceRisk,
  buildRiskDashboardSummary,
  assertEntityRiskBelowThreshold,
  buildRiskTrigger,
  RISK_WEIGHTS,
} from '../complianceRiskService';

describe('complianceRiskService', () => {
  it('evaluates compliance risk with triggers', () => {
    vi.setSystemTime(new Date('2026-06-10T10:00:00.000Z'));
    const score = evaluateComplianceRisk({
      entityId: 'prof-1',
      entityType: 'professional',
      triggers: [
        buildRiskTrigger('expired_registration', 'SACAP-12345', 'SACAP registration expired'),
        buildRiskTrigger('expired_insurance', 'POL-001', 'PI insurance expired'),
      ],
    });

    expect(score.entityId).toBe('prof-1');
    expect(score.entityType).toBe('professional');
    expect(score.triggers).toHaveLength(2);
    expect(score.riskLevel).toBe('critical'); // expired registration = critical
    expect(score.criticalTriggerCount).toBeGreaterThanOrEqual(1);
    expect(score.overallScore).toBeGreaterThan(50);
    vi.useRealTimers();
  });

  it('scores low-risk entities correctly', () => {
    const score = evaluateComplianceRisk({
      entityId: 'prof-2',
      entityType: 'professional',
      triggers: [
        buildRiskTrigger('expiring_document', 'Doc-1', 'Document expiring soon', { severity: 'low' }),
      ],
    });
    expect(score.riskLevel).toBe('low');
    expect(score.criticalTriggerCount).toBe(0);
    expect(score.highTriggerCount).toBe(0);
  });

  it('scores medium-risk entities with multiple medium triggers', () => {
    const score = evaluateComplianceRisk({
      entityId: 'prof-3',
      entityType: 'professional',
      triggers: [
        buildRiskTrigger('expiring_document', 'Doc-1', 'Doc 1 expiring'),
        buildRiskTrigger('expiring_registration', 'REG-1', 'Registration expiring'),
      ],
    });
    // Two medium triggers → at least medium risk
    expect(['medium', 'high']).toContain(score.riskLevel);
  });

  it('scores high-risk entities with high-severity triggers', () => {
    const score = evaluateComplianceRisk({
      entityId: 'prof-4',
      entityType: 'professional',
      triggers: [
        buildRiskTrigger('missing_document', 'Doc-Missing', 'Required document missing'),
        buildRiskTrigger('compliance_check_failed', 'Check-1', 'Compliance check failed'),
        buildRiskTrigger('missing_insurance', 'Ins-None', 'No PI insurance'),
      ],
    });
    expect(score.riskLevel).toBe('high');
    expect(score.highTriggerCount).toBeGreaterThanOrEqual(3);
  });

  it('caps overall score at 100', () => {
    const score = evaluateComplianceRisk({
      entityId: 'prof-5',
      entityType: 'professional',
      triggers: [
        buildRiskTrigger('expired_registration', 'R1', 'E1'),
        buildRiskTrigger('suspended_registration', 'R2', 'E2'),
        buildRiskTrigger('expired_insurance', 'I1', 'E3'),
        buildRiskTrigger('breach_notification_outstanding', 'B1', 'E4'),
        buildRiskTrigger('expired_document', 'D1', 'E5'),
        buildRiskTrigger('missing_document', 'D2', 'E6'),
        buildRiskTrigger('compliance_check_expired', 'C1', 'E7'),
        buildRiskTrigger('audit_exception', 'A1', 'E8'),
      ],
    });
    expect(score.overallScore).toBeLessThanOrEqual(100);
    expect(score.riskLevel).toBe('critical');
    expect(score.recommendations.length).toBeGreaterThan(0);
  });

  it('includes actionable recommendations for critical risks', () => {
    const score = evaluateComplianceRisk({
      entityId: 'prof-6',
      entityType: 'professional',
      triggers: [
        buildRiskTrigger('missing_insurance', 'NONE', 'No PI insurance on record'),
        buildRiskTrigger('expired_registration', 'SACAP-OLD', 'SACAP registration expired'),
      ],
    });
    expect(score.recommendations.some((r) => r.includes('insurance'))).toBe(true);
    expect(score.recommendations.some((r) => r.includes('registration'))).toBe(true);
  });

  it('requires entityId', () => {
    expect(() =>
      evaluateComplianceRisk({
        entityId: '',
        entityType: 'professional',
        triggers: [],
      }),
    ).toThrow(/entityId is required/);
  });

  it('builds risk dashboard summary', () => {
    const scores = [
      evaluateComplianceRisk({ entityId: 'e-1', entityType: 'professional', triggers: [buildRiskTrigger('expired_registration', 'R1', 'E1')] }),
      evaluateComplianceRisk({ entityId: 'e-2', entityType: 'company', triggers: [buildRiskTrigger('expiring_document', 'D1', 'E2', { severity: 'low' })] }),
      evaluateComplianceRisk({ entityId: 'e-3', entityType: 'contractor', triggers: [buildRiskTrigger('compliance_check_failed', 'C1', 'E3')] }),
    ];

    const dashboard = buildRiskDashboardSummary(scores);
    expect(dashboard.totalEntitiesAssessed).toBe(3);
    expect(dashboard.countsByLevel.critical).toBeGreaterThanOrEqual(1);
    expect(dashboard.topRisks).toHaveLength(3);
    expect(dashboard.commonTriggers.length).toBeGreaterThan(0);
  });

  it('asserts entity risk below threshold', () => {
    const lowScore = evaluateComplianceRisk({
      entityId: 'e-1', entityType: 'professional',
      triggers: [buildRiskTrigger('expiring_document', 'D1', 'E1', { severity: 'low' })],
    });
    expect(() => assertEntityRiskBelowThreshold(lowScore)).not.toThrow();
  });

  it('throws when risk exceeds threshold', () => {
    const criticalScore = evaluateComplianceRisk({
      entityId: 'e-1', entityType: 'professional',
      triggers: [buildRiskTrigger('expired_registration', 'R1', 'E1')],
    });
    expect(() =>
      assertEntityRiskBelowThreshold(criticalScore, { maxRiskLevel: 'medium' }),
    ).toThrow(/exceeds maximum allowed/);
  });

  it('blocks when critical triggers present', () => {
    const criticalScore = evaluateComplianceRisk({
      entityId: 'e-1', entityType: 'professional',
      triggers: [buildRiskTrigger('expired_registration', 'R1', 'Expired')],
    });
    expect(() =>
      assertEntityRiskBelowThreshold(criticalScore, { maxRiskLevel: 'critical', blockCritical: true }),
    ).toThrow(/critical risk trigger/);
  });

  it('blocks on expired registration when option is set', () => {
    const score = evaluateComplianceRisk({
      entityId: 'e-1', entityType: 'professional',
      triggers: [buildRiskTrigger('expired_registration', 'R1', 'Expired')],
    });
    expect(() =>
      assertEntityRiskBelowThreshold(score, { maxRiskLevel: 'critical', blockCritical: false, blockExpiredRegistration: true }),
    ).toThrow(/expired or suspended/);
  });

  it('blocks on expired insurance when option is set', () => {
    const score = evaluateComplianceRisk({
      entityId: 'e-1', entityType: 'professional',
      triggers: [buildRiskTrigger('expired_insurance', 'I1', 'Expired')],
    });
    expect(() =>
      assertEntityRiskBelowThreshold(score, { maxRiskLevel: 'critical', blockCritical: false, blockExpiredInsurance: true }),
    ).toThrow(/expired or missing/);
  });

  it('defines risk weights for all trigger types', () => {
    expect(RISK_WEIGHTS.expired_registration).toBe(100);
    expect(RISK_WEIGHTS.expiring_document).toBe(30);
    expect(RISK_WEIGHTS.missing_insurance).toBe(85);
    expect(RISK_WEIGHTS.breach_notification_outstanding).toBe(95);
    expect(RISK_WEIGHTS.consent_withdrawn).toBe(60);
    expect(RISK_WEIGHTS.audit_exception).toBe(70);
  });
});
