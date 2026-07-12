/**
 * Risk Engine Adapter — Environmental & Heritage
 *
 * Emits risk events for environmental/heritage compliance issues:
 * - EA application overdue (prescribed 107-day period exceeded)
 * - Heritage clearance pending with construction start approaching
 * - EMPr audit rating of major or critical non-conformance
 * - ROD condition compliance overdue
 *
 * Requirements: 20.6
 */

import type { PlatformIntegrationService, RiskEngineWritePayload } from '../../p1-shared/services/platformIntegration';
import type { IntegrationWriteResult } from '../../p1-shared/types';
import type { ECOAuditRating } from '../types';

// ─── Typed Payloads ───────────────────────────────────────────────────────────

export interface EAOverdueRiskPayload {
  projectId: string;
  applicationId: string;
  applicationReference: string;
  daysSinceSubmission: number;
  prescribedPeriodDays: number;
  competentAuthority: string;
}

export interface HeritagePendingRiskPayload {
  projectId: string;
  assessmentId: string;
  notificationDate: string;
  constructionStartDate?: string;
  daysUntilConstruction?: number;
}

export interface EMPrNonConformanceRiskPayload {
  projectId: string;
  emprId: string;
  auditId: string;
  auditDate: string;
  overallRating: Extract<ECOAuditRating, 'major_non_conformance' | 'critical_non_conformance'>;
  findingsCount: number;
}

export interface RODOverdueRiskPayload {
  projectId: string;
  conditionId: string;
  authorisationId: string;
  conditionNumber: number;
  conditionText: string;
  complianceDeadline: string;
  daysOverdue: number;
}

// ─── Adapter Interface ────────────────────────────────────────────────────────

export interface EnvironmentalRiskEngineAdapter {
  /** Raise risk event for EA application exceeding prescribed processing period. */
  raiseEAOverdueRisk(payload: EAOverdueRiskPayload): Promise<IntegrationWriteResult>;

  /** Raise risk event for heritage clearance pending with construction approaching. */
  raiseHeritagePendingRisk(payload: HeritagePendingRiskPayload): Promise<IntegrationWriteResult>;

  /** Raise risk event for EMPr audit with major or critical non-conformance. */
  raiseEMPrNonConformanceRisk(payload: EMPrNonConformanceRiskPayload): Promise<IntegrationWriteResult>;

  /** Raise risk event for ROD condition compliance deadline exceeded. */
  raiseRODOverdueRisk(payload: RODOverdueRiskPayload): Promise<IntegrationWriteResult>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RISK_CATEGORY_EA = 'environmental authorisation';
const RISK_CATEGORY_HERITAGE = 'heritage compliance';
const RISK_CATEGORY_EMPR = 'environmental management';
const RISK_CATEGORY_ROD = 'ROD condition compliance';

/** Prescribed period for EA decision (107 calendar days for Basic Assessment). */
export const EA_PRESCRIBED_PERIOD_DAYS = 107;

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates an Environmental & Heritage → Risk Engine adapter.
 *
 * Maps environmental/heritage compliance issues to RiskEngineWritePayload
 * and writes via PlatformIntegrationService. On failure, the platform
 * integration service handles retry queue enqueuing automatically.
 */
export function createEnvironmentalRiskEngineAdapter(
  platform: PlatformIntegrationService,
): EnvironmentalRiskEngineAdapter {
  return {
    async raiseEAOverdueRisk(payload: EAOverdueRiskPayload): Promise<IntegrationWriteResult> {
      const overdueBy = payload.daysSinceSubmission - payload.prescribedPeriodDays;
      const description = `Environmental Authorisation application ${payload.applicationReference} has exceeded the prescribed ${payload.prescribedPeriodDays}-day processing period by ${overdueBy} days. Competent authority: ${payload.competentAuthority}.`;

      const riskPayload: RiskEngineWritePayload = {
        projectId: payload.projectId,
        category: RISK_CATEGORY_EA,
        severity: 'high',
        description,
        recordRef: `env:ea:${payload.applicationId}`,
        mitigationAction: 'Follow up with competent authority regarding application status and decision timeline',
      };

      return platform.writeToRiskEngine(riskPayload);
    },

    async raiseHeritagePendingRisk(payload: HeritagePendingRiskPayload): Promise<IntegrationWriteResult> {
      const constructionPart = payload.daysUntilConstruction != null
        ? ` Construction start in ${payload.daysUntilConstruction} days.`
        : '';
      const description = `Heritage clearance pending since ${payload.notificationDate}. Assessment not yet completed.${constructionPart} Construction may not commence without heritage clearance.`;

      const severity = payload.daysUntilConstruction != null && payload.daysUntilConstruction <= 30
        ? 'critical' as const
        : 'high' as const;

      const riskPayload: RiskEngineWritePayload = {
        projectId: payload.projectId,
        category: RISK_CATEGORY_HERITAGE,
        severity,
        description,
        recordRef: `env:heritage:${payload.assessmentId}`,
        mitigationAction: 'Expedite heritage assessment process or adjust construction programme',
      };

      return platform.writeToRiskEngine(riskPayload);
    },

    async raiseEMPrNonConformanceRisk(payload: EMPrNonConformanceRiskPayload): Promise<IntegrationWriteResult> {
      const severityLevel = payload.overallRating === 'critical_non_conformance' ? 'critical' as const : 'high' as const;
      const ratingLabel = payload.overallRating === 'critical_non_conformance'
        ? 'Critical Non-Conformance'
        : 'Major Non-Conformance';

      const description = `ECO audit dated ${payload.auditDate} rated ${ratingLabel} with ${payload.findingsCount} findings. Immediate corrective action required per EMPr conditions.`;

      const riskPayload: RiskEngineWritePayload = {
        projectId: payload.projectId,
        category: RISK_CATEGORY_EMPR,
        severity: severityLevel,
        description,
        recordRef: `env:empr:${payload.emprId}:audit:${payload.auditId}`,
        mitigationAction: 'Address corrective actions immediately and schedule follow-up ECO audit',
      };

      return platform.writeToRiskEngine(riskPayload);
    },

    async raiseRODOverdueRisk(payload: RODOverdueRiskPayload): Promise<IntegrationWriteResult> {
      const conditionExcerpt = payload.conditionText.length > 100
        ? payload.conditionText.slice(0, 100) + '...'
        : payload.conditionText;

      const description = `ROD Condition #${payload.conditionNumber} overdue by ${payload.daysOverdue} days (deadline: ${payload.complianceDeadline}). Condition: "${conditionExcerpt}"`;

      const severity = payload.daysOverdue > 30 ? 'critical' as const : 'high' as const;

      const riskPayload: RiskEngineWritePayload = {
        projectId: payload.projectId,
        category: RISK_CATEGORY_ROD,
        severity,
        description,
        recordRef: `env:rod:${payload.authorisationId}:condition:${payload.conditionId}`,
        mitigationAction: 'Submit compliance evidence or request extension from competent authority',
      };

      return platform.writeToRiskEngine(riskPayload);
    },
  };
}
