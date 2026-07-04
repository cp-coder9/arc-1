/**
 * Audit Trail Adapter — Environmental & Heritage
 *
 * Writes project-scoped audit events for all environmental state transitions:
 * - Screening results
 * - EA stage transitions
 * - Heritage stage transitions
 * - ROD condition state changes
 * - EMPr compliance events (audits, incidents, corrective actions)
 *
 * Each record includes: timestamp, actor identity, event type,
 * module source, and event-specific data.
 *
 * Requirements: 20.7
 */

import type { PlatformIntegrationService, AuditTrailWritePayload } from '../../p1-shared/services/platformIntegration';
import type { IntegrationWriteResult } from '../../p1-shared/types';

// ─── Module Source Constants ──────────────────────────────────────────────────

export type EnvironmentalModuleSource =
  | 'EIA_Checker'
  | 'EA_Tracker'
  | 'Heritage_Workflow'
  | 'ROD_Register'
  | 'EMPr_Compliance';

// ─── Typed Payloads ───────────────────────────────────────────────────────────

export interface EnvironmentalAuditPayload {
  projectId: string;
  actorId: string;
  moduleSource: EnvironmentalModuleSource;
  action: string;
  recordRef: string;
  timestamp: string;
  previousValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
}

// ─── Pre-defined Event Types ──────────────────────────────────────────────────

export type EnvironmentalAuditAction =
  | 'screening_completed'
  | 'ea_application_submitted'
  | 'ea_stage_transition'
  | 'ea_decision_issued'
  | 'heritage_notification_submitted'
  | 'heritage_stage_transition'
  | 'heritage_determination_issued'
  | 'rod_condition_created'
  | 'rod_condition_state_change'
  | 'rod_condition_evidence_submitted'
  | 'empr_record_created'
  | 'eco_audit_completed'
  | 'corrective_action_issued'
  | 'corrective_action_state_change'
  | 'environmental_incident_logged';

// ─── Adapter Interface ────────────────────────────────────────────────────────

export interface EnvironmentalAuditTrailAdapter {
  /** Write an environmental audit event to the project audit trail. */
  writeAuditEvent(payload: EnvironmentalAuditPayload): Promise<IntegrationWriteResult>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODULE_ID = 'environmental-heritage';

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates an Environmental & Heritage → Audit Trail adapter.
 *
 * Maps environmental/heritage state transitions to AuditTrailWritePayload
 * and writes via PlatformIntegrationService. All events are immutable
 * records scoped to the project. On failure, the platform integration
 * service handles retry queue enqueuing automatically.
 */
export function createEnvironmentalAuditTrailAdapter(
  platform: PlatformIntegrationService,
): EnvironmentalAuditTrailAdapter {
  return {
    async writeAuditEvent(payload: EnvironmentalAuditPayload): Promise<IntegrationWriteResult> {
      const auditPayload: AuditTrailWritePayload = {
        projectId: payload.projectId,
        moduleId: MODULE_ID,
        action: `[${payload.moduleSource}] ${payload.action}`,
        recordRef: payload.recordRef,
        actorId: payload.actorId,
        timestamp: payload.timestamp,
        previousValues: payload.previousValues,
        newValues: payload.newValues,
      };

      return platform.writeToAuditTrail(auditPayload);
    },
  };
}
