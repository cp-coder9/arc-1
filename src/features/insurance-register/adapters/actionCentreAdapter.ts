/**
 * Action Centre Adapter — Insurance Register
 *
 * Surfaces renewal warnings (60/30/14 day), claims notifications,
 * and non-compliance alerts using PlatformIntegrationService.writeToActionCentre().
 *
 * Requirements: 4.3, 4.8
 */

import type { PlatformIntegrationService, ActionCentreWritePayload } from '../../p1-shared/services/platformIntegration';
import type { IntegrationWriteResult } from '../../p1-shared/types';
import type { InsurancePolicy, InsurancePolicyType, ClaimsNotification } from '../types';

// ─── Adapter Payload Types ────────────────────────────────────────────────────

export type RenewalWarningLevel = 60 | 30 | 14;

export interface RenewalWarningPayload {
  type: 'renewal_warning';
  projectId: string;
  policy: InsurancePolicy;
  daysUntilExpiry: RenewalWarningLevel;
  targetUserId?: string;
  targetRole?: string;
}

export interface ClaimsNotificationPayload {
  type: 'claims_notification';
  projectId: string;
  claim: ClaimsNotification;
  targetUserId?: string;
  targetRole?: string;
}

export interface NonComplianceAlertPayload {
  type: 'non_compliance_alert';
  projectId: string;
  policyType: InsurancePolicyType;
  targetUserId?: string;
  targetRole?: string;
}

export type ActionCentreAdapterPayload =
  | RenewalWarningPayload
  | ClaimsNotificationPayload
  | NonComplianceAlertPayload;

// ─── Adapter Interface ────────────────────────────────────────────────────────

export interface InsuranceActionCentreAdapter {
  write(payload: ActionCentreAdapterPayload): Promise<IntegrationWriteResult>;
}

// ─── Priority Mapping ─────────────────────────────────────────────────────────

function getRenewalPriority(daysUntilExpiry: RenewalWarningLevel): ActionCentreWritePayload['priority'] {
  switch (daysUntilExpiry) {
    case 14: return 'critical';
    case 30: return 'high';
    case 60: return 'normal';
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates an Insurance Register → Action Centre adapter.
 *
 * Maps renewal warnings, claims notifications, and non-compliance alerts
 * to ActionCentreWritePayload and writes via PlatformIntegrationService.
 * On failure, the platform integration service handles retry queue enqueuing.
 */
export function createActionCentreAdapter(
  platformIntegration: PlatformIntegrationService,
): InsuranceActionCentreAdapter {
  return {
    async write(payload: ActionCentreAdapterPayload): Promise<IntegrationWriteResult> {
      const actionCentrePayload = mapToActionCentrePayload(payload);
      return platformIntegration.writeToActionCentre(actionCentrePayload);
    },
  };
}

// ─── Payload Mapping ──────────────────────────────────────────────────────────

function mapToActionCentrePayload(payload: ActionCentreAdapterPayload): ActionCentreWritePayload {
  switch (payload.type) {
    case 'renewal_warning':
      return {
        projectId: payload.projectId,
        sourceModule: 'insurance-register',
        actionType: 'renewal_warning',
        subject: `${payload.policy.policyType} policy (${payload.policy.policyNumber}) expires in ${payload.daysUntilExpiry} days`,
        deadline: payload.policy.expiryDate,
        priority: getRenewalPriority(payload.daysUntilExpiry),
        targetUserId: payload.targetUserId,
        targetRole: payload.targetRole,
      };

    case 'claims_notification':
      return {
        projectId: payload.projectId,
        sourceModule: 'insurance-register',
        actionType: 'claims_notification',
        subject: `Insurance claim registered: ${payload.claim.affectedPolicyType} — ${payload.claim.description.slice(0, 100)}`,
        deadline: payload.claim.notificationDeadline,
        priority: 'high',
        targetUserId: payload.targetUserId,
        targetRole: payload.targetRole,
      };

    case 'non_compliance_alert':
      return {
        projectId: payload.projectId,
        sourceModule: 'insurance-register',
        actionType: 'non_compliance_alert',
        subject: `No active ${payload.policyType} policy — insurance requirement non-compliant`,
        priority: 'critical',
        targetUserId: payload.targetUserId,
        targetRole: payload.targetRole,
      };
  }
}
