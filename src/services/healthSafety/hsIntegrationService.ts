/**
 * H&S Integration Service
 *
 * Bridges the Health & Safety module with Project Passport, Action Centre,
 * and Site Execution (Pack 9). Provides:
 * - WorkflowEvent factory for H&S compliance events
 * - Site context safety data for Site Execution daily logs
 * - Compliance report generation with advisory disclaimer
 * - Action Centre inbox event creation with deep-link navigation
 */

import type { Permit, Induction, HazardEntry, SafetyFile } from './hsTypes';
import type { WorkflowEvent } from '../lifecycleTypes';
import { getUninductedWorkers } from './inductionTrackerService';
import { getHighRiskHazards } from './hiraService';
import { calculateComplianceScore } from './safetyFileService';
import { ADVISORY_DISCLAIMER } from './hsConstants';

let eventSeq = 1;

/**
 * Creates a properly-shaped WorkflowEvent for H&S compliance events.
 *
 * Used when H&S compliance events occur (plan approved, permit issued,
 * incident logged, score changed) to write corresponding records to
 * Project Passport via the platform event bus.
 */
export function createHSWorkflowEvent(params: {
  type: WorkflowEvent['type'];
  projectId: string;
  title: string;
  detail: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedRoles: string[];
}): WorkflowEvent {
  return {
    id: `hs-evt-${Date.now()}-${eventSeq++}`,
    type: params.type,
    projectId: params.projectId,
    title: params.title,
    detail: params.detail,
    priority: params.priority,
    sourceModule: 'health_safety',
    assignedRoles: params.assignedRoles as WorkflowEvent['assignedRoles'],
    createdAt: new Date().toISOString(),
  };
}

/**
 * Returns site context safety data for Site Execution (Pack 9).
 *
 * Called during daily site log creation to surface:
 * - Active permits for the project
 * - Workers who have not completed site induction
 * - Hazards with high or critical residual risk
 */
export function getSiteContextSafetyData(
  projectId: string,
  permits: Permit[],
  workforce: string[],
  inductions: Induction[],
  hazards: HazardEntry[]
): {
  activePermits: Permit[];
  uninductedWorkers: string[];
  highRiskHazards: HazardEntry[];
} {
  const activePermits = permits.filter(
    (p) => p.projectId === projectId && p.state === 'active'
  );

  const uninductedWorkers = getUninductedWorkers(projectId, workforce, inductions);

  const highRiskHazards = getHighRiskHazards(hazards);

  return {
    activePermits,
    uninductedWorkers,
    highRiskHazards,
  };
}

/**
 * Generates a formatted compliance report string for the given Safety File.
 *
 * Lists each section with its current status and includes the overall
 * compliance score. MUST include the ADVISORY_DISCLAIMER per Requirement 11.5.
 */
export function generateComplianceReport(file: SafetyFile): string {
  const score = calculateComplianceScore(file);

  const lines: string[] = [
    '═══════════════════════════════════════════════════',
    '  HEALTH & SAFETY COMPLIANCE REPORT',
    '═══════════════════════════════════════════════════',
    '',
    `Project ID: ${file.projectId}`,
    `Safety File ID: ${file.id}`,
    `Generated: ${new Date().toISOString()}`,
    '',
    '───────────────────────────────────────────────────',
    '  SECTION STATUS',
    '───────────────────────────────────────────────────',
    '',
  ];

  for (const section of file.sections) {
    const statusIcon =
      section.status === 'complete' ? '✓' :
      section.status === 'not_applicable' ? '—' :
      section.status === 'expired' ? '⚠' : '✗';
    lines.push(`  [${statusIcon}] ${section.title} (${section.regulationRef}) — ${section.status}`);
  }

  lines.push('');
  lines.push('───────────────────────────────────────────────────');
  lines.push(`  COMPLIANCE SCORE: ${score}%`);
  lines.push('───────────────────────────────────────────────────');
  lines.push('');
  lines.push(ADVISORY_DISCLAIMER);

  return lines.join('\n');
}

/**
 * Creates an Action Centre inbox event with proper structure for H&S context navigation.
 *
 * Includes a deep-link URL enabling users to navigate directly to the
 * relevant H&S context (permit, incident, plan, etc.) from the Action Centre.
 */
export function createInboxEvent(params: {
  projectId: string;
  title: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  dueDate?: string;
  responsibleRole: string;
  deepLink: string;
}): WorkflowEvent {
  const detail = params.dueDate
    ? `Action required by ${params.dueDate}. Navigate: ${params.deepLink}`
    : `Action required. Navigate: ${params.deepLink}`;

  return {
    id: `hs-inbox-${Date.now()}-${eventSeq++}`,
    type: 'approval_required',
    projectId: params.projectId,
    title: params.title,
    detail,
    priority: params.priority,
    sourceModule: 'health_safety',
    assignedRoles: [params.responsibleRole] as WorkflowEvent['assignedRoles'],
    createdAt: new Date().toISOString(),
  };
}
