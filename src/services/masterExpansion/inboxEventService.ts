import {
  LifecycleEvaluation,
  Priority,
  ProjectMetadata,
  ProjectRecord,
  RiskFinding,
  WorkflowEvent,
} from '@/types/architexMasterTypes';
import { detectProjectRisks } from './riskEngineService';
import { evaluateLifecycle } from './projectLifecycleEngine';

// ─── Inbox Event Generation ─────────────────────────────────────────────────

/**
 * Generate Platform Spine-compatible workflow events from current project state.
 * Each risk finding and lifecycle blocker produces an inbox event that routes
 * to the correct roles and surfaces in the project workspace.
 *
 * Events map to Platform Spine event types:
 *   - municipal_blocker → approval_required or risk_detected
 *   - payment_due → payment review required
 *   - risk_detected → generic project risk
 *   - project_phase_changed → phase advancement notice
 */
export function workflowEventsFromProjectState(
  metadata: ProjectMetadata,
  records: ProjectRecord<unknown>[],
): WorkflowEvent[] {
  const lifecycle = evaluateLifecycle(metadata, records);
  const risks = detectProjectRisks(records, lifecycle);

  const events: WorkflowEvent[] = [];

  // Risk-based events
  for (let i = 0; i < risks.length; i++) {
    const risk = risks[i];
    events.push({
      id: `evt-${metadata.projectId}-risk-${i + 1}`,
      type: mapRiskToEventType(risk),
      projectId: metadata.projectId,
      title: formatRiskTitle(risk),
      detail: risk.message,
      priority: risk.severity,
      sourceModule: mapRiskToSourceModule(risk),
      assignedRoles: risk.assignedRoles,
      createdAt: new Date().toISOString(),
    });
  }

  // Blocker-based events for missing records not already covered by risks
  for (let i = 0; i < lifecycle.missingRecords.length; i++) {
    const missing = lifecycle.missingRecords[i];
    const alreadyCovered = risks.some((r) =>
      r.code.includes(missing.recordType.toUpperCase()),
    );
    if (!alreadyCovered) {
      events.push({
        id: `evt-${metadata.projectId}-missing-${i + 1}`,
        type: 'approval_required',
        projectId: metadata.projectId,
        title: `Missing required record: ${missing.recordType}`,
        detail: missing.reason,
        priority: missing.priority,
        sourceModule: 'projects',
        assignedRoles: [metadata.leadProfessionalRole, 'platform_admin'],
        createdAt: new Date().toISOString(),
      });
    }
  }

  // Phase-specific blocker events
  if (!lifecycle.mayAdvance) {
    for (const blocker of lifecycle.blockers) {
      const isAlreadyEmitted = events.some((e) =>
        blocker.includes(e.title) || e.detail.includes(blocker),
      );
      if (!isAlreadyEmitted) {
        events.push({
          id: `evt-${metadata.projectId}-blocker-${events.length + 1}`,
          type: 'risk_detected',
          projectId: metadata.projectId,
          title: `Phase blocker: ${metadata.currentPhase}`,
          detail: blocker,
          priority: blocker.includes('CRITICAL') ? 'critical' : 'high',
          sourceModule: 'projects',
          assignedRoles: [metadata.leadProfessionalRole, 'client', 'platform_admin'],
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  return events;
}

/**
 * Generate a single inbox event for a specific missing approval.
 * Used when a specific approval gate is identified as missing.
 */
export function generateMissingApprovalEvent(
  projectId: string,
  recordType: string,
  requiredRoles: string[],
): WorkflowEvent {
  return {
    id: `evt-${projectId}-approval-${Date.now()}`,
    type: 'approval_required',
    projectId,
    title: `Missing approval: ${recordType}`,
    detail: `Required approval record "${recordType}" is missing. Roles that can provide it: ${requiredRoles.join(', ')}.`,
    priority: 'high',
    sourceModule: 'projects',
    assignedRoles: requiredRoles.map((r) => r as WorkflowEvent['assignedRoles'][0]),
    createdAt: new Date().toISOString(),
  };
}

// ─── Event Type Mapping ─────────────────────────────────────────────────────

function mapRiskToEventType(risk: RiskFinding): WorkflowEvent['type'] {
  if (
    risk.code.includes('APPROVAL') ||
    risk.code.includes('MUNICIPAL') ||
    risk.code.includes('MISSING')
  ) {
    return 'municipal_blocker';
  }
  if (risk.code.includes('PAYMENT')) {
    return 'payment_due';
  }
  return 'risk_detected';
}

function mapRiskToSourceModule(risk: RiskFinding): WorkflowEvent['sourceModule'] {
  if (risk.code.includes('PAYMENT')) return 'finance';
  if (risk.code.includes('DRAWING') || risk.code.includes('DOCUMENT'))
    return 'documents';
  return 'projects';
}

function formatRiskTitle(risk: RiskFinding): string {
  return risk.code
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
