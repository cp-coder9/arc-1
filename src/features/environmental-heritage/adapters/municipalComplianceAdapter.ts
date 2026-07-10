/**
 * Municipal Compliance Adapter — Environmental & Heritage
 *
 * Adds Environmental Authorisation and Heritage Clearance line items
 * to the municipal readiness checklist. Maps domain states to
 * readiness statuses: pending, in_progress, cleared, blocked.
 *
 * Requirements: 20.1, 20.2
 */

import type { PlatformIntegrationService, ActionCentreWritePayload } from '../../p1-shared/services/platformIntegration';
import type { IntegrationWriteResult } from '../../p1-shared/types';

// ─── Readiness Line Item Status ───────────────────────────────────────────────

export type ReadinessItemStatus = 'pending' | 'in_progress' | 'cleared' | 'blocked';

// ─── Typed Payloads ───────────────────────────────────────────────────────────

export interface EAReadinessPayload {
  projectId: string;
  status: ReadinessItemStatus;
  applicationReference?: string;
  decisionDate?: string;
  lastUpdated: string;
}

export interface HeritageReadinessPayload {
  projectId: string;
  status: ReadinessItemStatus;
  permitReference?: string;
  determinationDate?: string;
  lastUpdated: string;
}

export interface ReadinessChecklistItem {
  projectId: string;
  module: string;
  lineItem: string;
  status: ReadinessItemStatus;
  reference?: string;
  lastUpdated: string;
}

// ─── Adapter Interface ────────────────────────────────────────────────────────

export interface EnvironmentalMunicipalComplianceAdapter {
  /** Add or update the Environmental Authorisation readiness checklist item. */
  writeEAReadiness(payload: EAReadinessPayload): Promise<IntegrationWriteResult>;

  /** Add or update the Heritage Clearance readiness checklist item. */
  writeHeritageReadiness(payload: HeritageReadinessPayload): Promise<IntegrationWriteResult>;

  /** Build a readiness checklist item from EA state. */
  buildEAChecklistItem(payload: EAReadinessPayload): ReadinessChecklistItem;

  /** Build a readiness checklist item from heritage state. */
  buildHeritageChecklistItem(payload: HeritageReadinessPayload): ReadinessChecklistItem;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCE_MODULE = 'environmental-heritage';
const EA_LINE_ITEM = 'Environmental Authorisation';
const HERITAGE_LINE_ITEM = 'Heritage Clearance';

const STATUS_LABELS: Record<ReadinessItemStatus, string> = {
  pending: 'Pending — screening complete, application not yet submitted',
  in_progress: 'In Progress — application submitted, decision not yet issued',
  cleared: 'Cleared — authorisation/permit granted',
  blocked: 'Blocked — refused or appeal pending',
};

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates an Environmental & Heritage → Municipal Compliance adapter.
 *
 * Maps EA and Heritage domain states to readiness checklist items and
 * writes via PlatformIntegrationService. Uses Action Centre for status
 * notifications when items transition to blocked state.
 */
export function createMunicipalComplianceAdapter(
  platform: PlatformIntegrationService,
): EnvironmentalMunicipalComplianceAdapter {
  return {
    async writeEAReadiness(payload: EAReadinessPayload): Promise<IntegrationWriteResult> {
      const subject = `${EA_LINE_ITEM}: ${STATUS_LABELS[payload.status]}`;
      const priority = payload.status === 'blocked' ? 'critical' : 'normal';

      const actionPayload: ActionCentreWritePayload = {
        projectId: payload.projectId,
        sourceModule: SOURCE_MODULE,
        actionType: 'readiness_update',
        subject: subject.slice(0, 200),
        priority,
        targetRole: 'architect',
      };

      return platform.writeToActionCentre(actionPayload);
    },

    async writeHeritageReadiness(payload: HeritageReadinessPayload): Promise<IntegrationWriteResult> {
      const subject = `${HERITAGE_LINE_ITEM}: ${STATUS_LABELS[payload.status]}`;
      const priority = payload.status === 'blocked' ? 'critical' : 'normal';

      const actionPayload: ActionCentreWritePayload = {
        projectId: payload.projectId,
        sourceModule: SOURCE_MODULE,
        actionType: 'readiness_update',
        subject: subject.slice(0, 200),
        priority,
        targetRole: 'architect',
      };

      return platform.writeToActionCentre(actionPayload);
    },

    buildEAChecklistItem(payload: EAReadinessPayload): ReadinessChecklistItem {
      return {
        projectId: payload.projectId,
        module: SOURCE_MODULE,
        lineItem: EA_LINE_ITEM,
        status: payload.status,
        reference: payload.applicationReference,
        lastUpdated: payload.lastUpdated,
      };
    },

    buildHeritageChecklistItem(payload: HeritageReadinessPayload): ReadinessChecklistItem {
      return {
        projectId: payload.projectId,
        module: SOURCE_MODULE,
        lineItem: HERITAGE_LINE_ITEM,
        status: payload.status,
        reference: payload.permitReference,
        lastUpdated: payload.lastUpdated,
      };
    },
  };
}
