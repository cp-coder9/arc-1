// ── Types ──────────────────────────────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type RiskEntityType =
  | 'professional'
  | 'company'
  | 'contractor'
  | 'supplier'
  | 'project';

export type RiskTriggerType =
  | 'expired_registration'
  | 'expiring_registration'
  | 'suspended_registration'
  | 'expired_document'
  | 'expiring_document'
  | 'missing_document'
  | 'expired_insurance'
  | 'expiring_insurance'
  | 'insurance_coverage_gap'
  | 'missing_insurance'
  | 'compliance_check_failed'
  | 'compliance_check_expired'
  | 'badge_expired'
  | 'consent_withdrawn'
  | 'consent_expired'
  | 'breach_notification_outstanding'
  | 'data_subject_request_overdue'
  | 'audit_exception';

export interface RiskTrigger {
  type: RiskTriggerType;
  severity: RiskLevel;
  source: string; // e.g., document title, registration number
  description: string;
  detectedAt: string;
  actionable: boolean;
  recommendedAction?: string;
}

export interface ComplianceRiskInput {
  entityId: string;
  entityType: RiskEntityType;
  projectId?: string;
  triggers: RiskTrigger[];
}

export interface ComplianceRiskScore {
  entityId: string;
  entityType: RiskEntityType;
  projectId?: string;
  triggers: RiskTrigger[];
  overallScore: number; // 0-100, 0 = best (no risk), 100 = worst (critical risk)
  riskLevel: RiskLevel;
  criticalTriggerCount: number;
  highTriggerCount: number;
  mediumTriggerCount: number;
  lowTriggerCount: number;
  lastEvaluatedAt: string;
  recommendations: string[];
}

export interface RiskDashboardSummary {
  generatedAt: string;
  totalEntitiesAssessed: number;
  countsByLevel: Record<RiskLevel, number>;
  topRisks: ComplianceRiskScore[];
  commonTriggers: { type: RiskTriggerType; count: number; severity: RiskLevel }[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

export const RISK_WEIGHTS: Record<RiskTriggerType, number> = {
  expired_registration: 100,
  expiring_registration: 40,
  suspended_registration: 100,
  expired_document: 80,
  expiring_document: 30,
  missing_document: 60,
  expired_insurance: 90,
  expiring_insurance: 35,
  insurance_coverage_gap: 70,
  missing_insurance: 85,
  compliance_check_failed: 75,
  compliance_check_expired: 80,
  badge_expired: 50,
  consent_withdrawn: 60,
  consent_expired: 45,
  breach_notification_outstanding: 95,
  data_subject_request_overdue: 65,
  audit_exception: 70,
};

export const RISK_TRIGGER_SEVERITY: Record<RiskTriggerType, RiskLevel> = {
  expired_registration: 'critical',
  expiring_registration: 'medium',
  suspended_registration: 'critical',
  expired_document: 'high',
  expiring_document: 'medium',
  missing_document: 'high',
  expired_insurance: 'critical',
  expiring_insurance: 'medium',
  insurance_coverage_gap: 'high',
  missing_insurance: 'high',
  compliance_check_failed: 'high',
  compliance_check_expired: 'high',
  badge_expired: 'medium',
  consent_withdrawn: 'high',
  consent_expired: 'medium',
  breach_notification_outstanding: 'critical',
  data_subject_request_overdue: 'high',
  audit_exception: 'high',
};

export const RISK_TRIGGER_LABELS: Record<RiskTriggerType, string> = {
  expired_registration: 'Professional Registration Expired',
  expiring_registration: 'Professional Registration Expiring Soon',
  suspended_registration: 'Professional Registration Suspended',
  expired_document: 'Compliance Document Expired',
  expiring_document: 'Compliance Document Expiring',
  missing_document: 'Required Document Missing',
  expired_insurance: 'PI Insurance Expired',
  expiring_insurance: 'PI Insurance Expiring',
  insurance_coverage_gap: 'Insurance Coverage Gap',
  missing_insurance: 'PI Insurance Not On Record',
  compliance_check_failed: 'Compliance Check Failed',
  compliance_check_expired: 'Compliance Check Expired',
  badge_expired: 'Verification Badge Expired',
  consent_withdrawn: 'POPIA Consent Withdrawn',
  consent_expired: 'POPIA Consent Expired',
  breach_notification_outstanding: 'Breach Notification Outstanding',
  data_subject_request_overdue: 'Data Subject Request Overdue',
  audit_exception: 'Audit Exception Detected',
};

const SEVERITY_SCORE: Record<RiskLevel, number> = {
  critical: 100,
  high: 70,
  medium: 40,
  low: 10,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function severityCount(triggers: RiskTrigger[], level: RiskLevel): number {
  return triggers.filter((t) => t.severity === level).length;
}

// ── Risk Evaluation ────────────────────────────────────────────────────────────

export function evaluateComplianceRisk(
  input: ComplianceRiskInput,
): ComplianceRiskScore {
  if (!input.entityId?.trim()) {
    throw Object.assign(new Error('entityId is required'), { status: 400 });
  }

  const now = new Date().toISOString();
  const triggers = input.triggers.map((t) => ({
    ...t,
    severity: t.severity || RISK_TRIGGER_SEVERITY[t.type] || 'medium',
  }));

  // Calculate weighted score (0-100)
  const weightedSum = triggers.reduce((sum, trigger) => {
    const weight = RISK_WEIGHTS[trigger.type] || 50;
    return sum + weight;
  }, 0);

  // Cap at 100
  const overallScore = Math.min(100, Math.round(weightedSum / Math.max(1, triggers.length)));

  // Determine risk level from triggers
  const hasCritical = triggers.some((t) => t.severity === 'critical');
  const highCount = severityCount(triggers, 'high');
  const mediumCount = severityCount(triggers, 'medium');

  let riskLevel: RiskLevel;
  if (hasCritical) {
    riskLevel = 'critical';
  } else if (highCount >= 2 || overallScore >= 70) {
    riskLevel = 'high';
  } else if (mediumCount >= 2 || overallScore >= 40) {
    riskLevel = 'medium';
  } else {
    riskLevel = 'low';
  }

  // Generate recommendations
  const recommendations = generateRiskRecommendations(triggers);

  return {
    entityId: input.entityId.trim(),
    entityType: input.entityType,
    projectId: input.projectId?.trim(),
    triggers,
    overallScore,
    riskLevel,
    criticalTriggerCount: severityCount(triggers, 'critical'),
    highTriggerCount: severityCount(triggers, 'high'),
    mediumTriggerCount: severityCount(triggers, 'medium'),
    lowTriggerCount: severityCount(triggers, 'low'),
    lastEvaluatedAt: now,
    recommendations,
  };
}

function generateRiskRecommendations(triggers: RiskTrigger[]): string[] {
  const recommendations: string[] = [];

  const criticalTriggers = triggers.filter((t) => t.severity === 'critical');
  const highTriggers = triggers.filter((t) => t.severity === 'high');

  if (criticalTriggers.length > 0) {
    recommendations.push(
      `${criticalTriggers.length} critical risk trigger(s) require immediate attention`,
    );
    for (const trigger of criticalTriggers) {
      if (trigger.recommendedAction) {
        recommendations.push(`CRITICAL: ${trigger.recommendedAction}`);
      } else if (trigger.actionable) {
        recommendations.push(`CRITICAL: Resolve ${RISK_TRIGGER_LABELS[trigger.type] || trigger.type} — ${trigger.description}`);
      }
    }
  }

  if (highTriggers.length > 0) {
    recommendations.push(`${highTriggers.length} high-severity risk trigger(s) should be addressed within 7 days`);
  }

  if (triggers.some((t) => t.type === 'missing_insurance')) {
    recommendations.push('PI insurance must be obtained before engaging in professional services');
  }

  if (triggers.some((t) => t.type === 'expired_registration' || t.type === 'suspended_registration')) {
    recommendations.push('Professional registration must be reinstated — statutory sign-off is blocked');
  }

  if (triggers.some((t) => t.type === 'breach_notification_outstanding')) {
    recommendations.push('Outstanding breach notification must be reported to the Information Regulator within 72 hours of discovery');
  }

  return recommendations;
}

// ── Dashboard Summary ──────────────────────────────────────────────────────────

export function buildRiskDashboardSummary(
  scores: ComplianceRiskScore[],
  options: { now?: Date } = {},
): RiskDashboardSummary {
  const now = (options.now || new Date()).toISOString();

  const countsByLevel: Record<RiskLevel, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  for (const score of scores) {
    countsByLevel[score.riskLevel] += 1;
  }

  // Top risks sorted by score descending
  const topRisks = [...scores]
    .sort((a, b) => b.overallScore - a.overallScore)
    .slice(0, 20);

  // Common trigger types across all entities
  const triggerCounts = new Map<RiskTriggerType, { count: number; severity: RiskLevel }>();
  for (const score of scores) {
    for (const trigger of score.triggers) {
      const existing = triggerCounts.get(trigger.type);
      if (existing) {
        existing.count += 1;
      } else {
        triggerCounts.set(trigger.type, {
          count: 1,
          severity: RISK_TRIGGER_SEVERITY[trigger.type] || 'medium',
        });
      }
    }
  }

  const commonTriggers = Array.from(triggerCounts.entries())
    .map(([type, data]) => ({ type, count: data.count, severity: data.severity }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    generatedAt: now,
    totalEntitiesAssessed: scores.length,
    countsByLevel,
    topRisks,
    commonTriggers,
  };
}

// ── Risk Blocking Check ────────────────────────────────────────────────────────

export function assertEntityRiskBelowThreshold(
  score: ComplianceRiskScore,
  options: {
    maxRiskLevel?: RiskLevel;
    blockCritical?: boolean;
    blockExpiredRegistration?: boolean;
    blockExpiredInsurance?: boolean;
  } = {},
): void {
  const maxRiskLevel = options.maxRiskLevel || 'high';
  const blockCritical = options.blockCritical !== false;

  const severityOrder: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
  const maxIndex = severityOrder.indexOf(maxRiskLevel);
  const currentIndex = severityOrder.indexOf(score.riskLevel);

  if (currentIndex > maxIndex) {
    throw Object.assign(
      new Error(`Entity risk level (${score.riskLevel}) exceeds maximum allowed (${maxRiskLevel})`),
      { status: 409, riskScore: score, maxAllowedRiskLevel: maxRiskLevel },
    );
  }

  if (blockCritical && score.criticalTriggerCount > 0) {
    throw Object.assign(
      new Error(`${score.criticalTriggerCount} critical risk trigger(s) must be resolved before proceeding`),
      { status: 409, riskScore: score },
    );
  }

  if (options.blockExpiredRegistration && score.triggers.some(
    (t) => t.type === 'expired_registration' || t.type === 'suspended_registration',
  )) {
    throw Object.assign(
      new Error('Professional registration is expired or suspended — cannot proceed'),
      { status: 409, riskScore: score },
    );
  }

  if (options.blockExpiredInsurance && score.triggers.some(
    (t) => t.type === 'expired_insurance' || t.type === 'missing_insurance',
  )) {
    throw Object.assign(
      new Error('PI insurance is expired or missing — cannot proceed'),
      { status: 409, riskScore: score },
    );
  }
}

/**
 * Create a risk trigger from a standard compliance event.
 */
export function buildRiskTrigger(
  type: RiskTriggerType,
  source: string,
  description: string,
  options: { severity?: RiskLevel; recommendedAction?: string } = {},
): RiskTrigger {
  return {
    type,
    severity: options.severity || RISK_TRIGGER_SEVERITY[type] || 'medium',
    source,
    description,
    detectedAt: new Date().toISOString(),
    actionable: true,
    recommendedAction: options.recommendedAction,
  };
}
