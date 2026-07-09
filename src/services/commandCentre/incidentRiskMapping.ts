/**
 * Project Command Centre — H&S Incident to Risk Register Mapping
 *
 * Maps Health & Safety incidents logged via the Toolbox into the Command Centre
 * Risk Register. When an H&S incident is recorded for an active project, this
 * service creates a corresponding risk entry with:
 *   - category: "health_and_safety"
 *   - severity: derived deterministically from the incident severity
 *   - status: "open"
 *
 * @module commandCentre/incidentRiskMapping
 * @validates Requirements 12.4
 */

import type { RiskSeverity, RiskItem } from '@/services/commandCentre/types';
import type { Severity } from '@/types';

// ── Incident Interface ───────────────────────────────────────────────────────

/**
 * Represents an H&S incident logged via the Toolbox Health & Safety tool.
 */
export interface HSIncident {
  id: string;
  projectId: string;
  title: string;
  description: string;
  severity: Severity;
  location?: string;
  reportedBy: string;
  reportedByName?: string;
  occurredAt: string;
  createdAt: string;
}

// ── Severity Mapping ─────────────────────────────────────────────────────────

/**
 * Deterministic severity mapping table.
 *
 * Maps H&S incident severity levels to Command Centre risk severity levels.
 * The mapping is one-to-one since both use the same enum values, but this
 * function serves as the explicit, tested contract point.
 *
 * Incident Severity → Risk Severity:
 *   critical → critical
 *   high     → high
 *   medium   → medium
 *   low      → low
 */
const INCIDENT_TO_RISK_SEVERITY_MAP: Record<Severity, RiskSeverity> = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
};

/**
 * Maps an H&S incident severity level to the corresponding risk severity level.
 *
 * @param incidentSeverity - The severity of the H&S incident
 * @returns The corresponding risk severity for the Command Centre Risk Register
 *
 * @example
 * mapIncidentSeverityToRiskSeverity('critical') // → 'critical'
 * mapIncidentSeverityToRiskSeverity('high')     // → 'high'
 * mapIncidentSeverityToRiskSeverity('medium')   // → 'medium'
 * mapIncidentSeverityToRiskSeverity('low')      // → 'low'
 */
export function mapIncidentSeverityToRiskSeverity(incidentSeverity: Severity): RiskSeverity {
  const mapped = INCIDENT_TO_RISK_SEVERITY_MAP[incidentSeverity];
  if (!mapped) {
    // Fallback for any unexpected value — treat as high to surface it
    console.warn(`[IncidentRiskMapping] Unknown incident severity: ${incidentSeverity}, defaulting to 'high'`);
    return 'high';
  }
  return mapped;
}

// ── Risk Entry Creation ──────────────────────────────────────────────────────

/**
 * Creates a risk entry from an H&S incident for the Command Centre Risk Register.
 *
 * The generated risk entry will have:
 *   - category: "health_and_safety"
 *   - severity: derived deterministically from the incident severity
 *   - status: "open"
 *
 * This function creates the risk data object. To persist it to Firestore,
 * pass the result to `riskRegisterService.createRisk()`.
 *
 * @param projectId - The active project ID
 * @param incident - The H&S incident data from the Toolbox
 * @returns A risk entry object ready for persistence
 *
 * @validates Requirement 12.4
 */
export function createRiskFromHSIncident(
  projectId: string,
  incident: HSIncident,
): Omit<RiskItem, 'id'> {
  const now = new Date().toISOString();
  const riskSeverity = mapIncidentSeverityToRiskSeverity(incident.severity);

  return {
    projectId,
    description: `H&S Incident: ${incident.title}${incident.description ? ` — ${incident.description}` : ''}`,
    category: 'health_and_safety',
    severity: riskSeverity,
    status: 'open',
    ownerId: incident.reportedBy,
    ownerName: incident.reportedByName || incident.reportedBy,
    mitigationPlan: undefined,
    createdBy: incident.reportedBy,
    createdAt: now,
    updatedAt: now,
    aiGenerated: false,
  };
}

// ── Service Export ───────────────────────────────────────────────────────────

export const incidentRiskMapping = {
  mapIncidentSeverityToRiskSeverity,
  createRiskFromHSIncident,
};

export default incidentRiskMapping;
