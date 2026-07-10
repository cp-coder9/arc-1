/**
 * Site Execution Adapter — Environmental & Heritage
 *
 * Integrates environmental incidents with the daily site log.
 * Allows the Site Execution module to surface environmental
 * incident logging as part of the daily log interface.
 *
 * Requirements: 20.5
 */

import type { PlatformIntegrationService, ActionCentreWritePayload } from '../../p1-shared/services/platformIntegration';
import type { IntegrationWriteResult } from '../../p1-shared/types';
import type { IncidentType } from '../types';

// ─── Typed Payloads ───────────────────────────────────────────────────────────

export interface EnvironmentalIncidentLogPayload {
  projectId: string;
  incidentId: string;
  emprId: string;
  incidentType: IncidentType;
  description: string;
  locationOnSite: string;
  date: string;
  reportedBy: string;
  reportedByName: string;
  immediateRemedialAction: string;
}

export interface DailyLogEnvironmentalEntry {
  projectId: string;
  date: string;
  entryType: 'environmental_incident';
  incidentId: string;
  incidentType: IncidentType;
  description: string;
  locationOnSite: string;
  remedialAction: string;
  reportedBy: string;
}

// ─── Adapter Interface ────────────────────────────────────────────────────────

export interface EnvironmentalSiteExecutionAdapter {
  /** Write an environmental incident to the site daily log. */
  writeIncidentToDailyLog(payload: EnvironmentalIncidentLogPayload): Promise<IntegrationWriteResult>;

  /** Build a daily log entry from an environmental incident payload. */
  buildDailyLogEntry(payload: EnvironmentalIncidentLogPayload): DailyLogEnvironmentalEntry;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCE_MODULE = 'environmental-heritage';

const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  spill: 'Chemical/Fuel Spill',
  clearing: 'Unauthorised Clearing',
  dust: 'Excessive Dust',
  water_pollution: 'Water Pollution',
  noise: 'Noise Exceedance',
  waste: 'Waste Management Breach',
  other: 'Other Environmental Incident',
};

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates an Environmental & Heritage → Site Execution adapter.
 *
 * Maps environmental incidents to daily site log entries and notifies
 * site management via Action Centre. Pre-fills site reference and date
 * from the active site log context.
 */
export function createSiteExecutionAdapter(
  platform: PlatformIntegrationService,
): EnvironmentalSiteExecutionAdapter {
  return {
    async writeIncidentToDailyLog(payload: EnvironmentalIncidentLogPayload): Promise<IntegrationWriteResult> {
      const incidentLabel = INCIDENT_TYPE_LABELS[payload.incidentType];
      const subject = `Environmental Incident: ${incidentLabel} at ${payload.locationOnSite} — ${payload.description.slice(0, 80)}`;

      const actionPayload: ActionCentreWritePayload = {
        projectId: payload.projectId,
        sourceModule: SOURCE_MODULE,
        actionType: 'environmental_incident',
        subject: subject.slice(0, 200),
        priority: 'high',
        targetRole: 'site_manager',
      };

      return platform.writeToActionCentre(actionPayload);
    },

    buildDailyLogEntry(payload: EnvironmentalIncidentLogPayload): DailyLogEnvironmentalEntry {
      return {
        projectId: payload.projectId,
        date: payload.date,
        entryType: 'environmental_incident',
        incidentId: payload.incidentId,
        incidentType: payload.incidentType,
        description: payload.description,
        locationOnSite: payload.locationOnSite,
        remedialAction: payload.immediateRemedialAction,
        reportedBy: payload.reportedBy,
      };
    },
  };
}
