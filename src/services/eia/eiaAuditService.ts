// ─── EIA Audit Service ───────────────────────────────────────────────────────
// Wraps writeAuditEntry for all EIA-specific actions.
// Records: screening runs, phase completions, authorization recordings,
// compliance audits, EAP appointments.
// Requirements: 12.6, 4.7, 5.6

import type { EIAAuditEntry } from './eiaTypes';

// In-memory audit log (replaced by Firestore persistence in integration layer)
const auditEntries: EIAAuditEntry[] = [];

let idCounter = 0;

function generateId(): string {
  idCounter += 1;
  return `eia-audit-${Date.now()}-${idCounter}`;
}

function now(): string {
  return new Date().toISOString();
}

/**
 * Low-level audit entry writer. All EIA-specific helpers delegate here.
 */
export function writeAuditEntry(
  action: string,
  actorId: string,
  projectId: string,
  outcome: string,
  metadata?: Record<string, unknown>
): EIAAuditEntry {
  const entry: EIAAuditEntry = {
    id: generateId(),
    action,
    actorId,
    projectId,
    timestamp: now(),
    outcome,
    metadata,
  };
  auditEntries.push(entry);
  return entry;
}

/**
 * Records a screening run in the audit trail.
 */
export function auditScreeningRun(
  actorId: string,
  projectId: string,
  recommendation: string
): EIAAuditEntry {
  return writeAuditEntry(
    'screening_run',
    actorId,
    projectId,
    recommendation,
    { recommendation }
  );
}

/**
 * Records a phase completion (Basic Assessment or Full EIA) in the audit trail.
 */
export function auditPhaseCompletion(
  actorId: string,
  projectId: string,
  phase: string,
  referenceNumber?: string
): EIAAuditEntry {
  return writeAuditEntry(
    'phase_completion',
    actorId,
    projectId,
    `completed_${phase}`,
    { phase, ...(referenceNumber ? { referenceNumber } : {}) }
  );
}

/**
 * Records an authorization being recorded in the audit trail.
 */
export function auditAuthorizationRecorded(
  actorId: string,
  projectId: string,
  referenceNumber: string,
  status: string
): EIAAuditEntry {
  return writeAuditEntry(
    'authorization_recorded',
    actorId,
    projectId,
    status,
    { referenceNumber, status }
  );
}

/**
 * Records an EMPr compliance audit in the audit trail.
 */
export function auditComplianceAudit(
  actorId: string,
  projectId: string,
  overallStatus: string
): EIAAuditEntry {
  return writeAuditEntry(
    'compliance_audit',
    actorId,
    projectId,
    overallStatus,
    { overallStatus }
  );
}

/**
 * Records an EAP appointment action (appointed, replaced, withdrawn) in the audit trail.
 */
export function auditEAPAppointment(
  actorId: string,
  projectId: string,
  practitionerName: string,
  action: 'appointed' | 'replaced' | 'withdrawn'
): EIAAuditEntry {
  return writeAuditEntry(
    `eap_${action}`,
    actorId,
    projectId,
    action,
    { practitionerName, action }
  );
}

/**
 * Query audit entries for a project (most recent first).
 */
export function queryEIAAuditEntries(
  projectId: string,
  limit = 50
): EIAAuditEntry[] {
  return auditEntries
    .filter((e) => e.projectId === projectId)
    .reverse()
    .slice(0, limit);
}

/**
 * Returns all audit entries (for testing purposes).
 */
export function getAllAuditEntries(): EIAAuditEntry[] {
  return [...auditEntries];
}

/**
 * Clears all audit entries (for testing purposes).
 */
export function clearAuditEntries(): void {
  auditEntries.length = 0;
  idCounter = 0;
}
