/**
 * Workspace Orchestrator Service
 *
 * Coordinates all municipal workspace sub-services, integrates with the
 * existing readiness pipeline, persists results, and generates Action Centre events.
 */

import type {
  LandUseCheckInput,
  LandUseCheckResult,
  CirculationSimulationResult,
  SubmissionPack,
} from '@/types/municipalWorkspace';
import type {
  ProjectScopeFacts,
  MunicipalSubmissionReadinessResult,
  SubmissionInboxEvent,
} from '@/types/municipalSubmissionReadiness';
import type { MunicipalityType } from '@/types';
import { assessMunicipalSubmissionReadiness } from '@/services/municipalSubmissionReadinessService';
import { validateLandUse } from './landUseSchemeService';
import { simulateCirculation } from './circulationSimulatorService';
import { assembleSubmissionPack } from './submissionPackService';

/**
 * Unified workspace assessment result combining readiness pipeline output,
 * circulation simulation, and submission pack assembly.
 */
export interface WorkspaceAssessment {
  readiness: MunicipalSubmissionReadinessResult;
  circulation: CirculationSimulationResult;
  pack: SubmissionPack;
}

/**
 * Runs a full workspace assessment — calls existing readiness pipeline,
 * land use validation (if input provided), circulation simulation, and pack assembly.
 *
 * Flow:
 *   1. Run existing readiness pipeline (assessMunicipalSubmissionReadiness)
 *   2. Run land use validation (if input provided)
 *   3. Run circulation simulation with land use + readiness results
 *   4. Assemble submission pack for the project's municipality
 */
export function assessWorkspaceReadiness(
  project: ProjectScopeFacts,
  landUseInput?: LandUseCheckInput
): WorkspaceAssessment {
  // Step 1: Run existing readiness pipeline
  const readiness = assessMunicipalSubmissionReadiness(project);

  // Step 2: Run land use validation if input provided
  const landUseResult: LandUseCheckResult = landUseInput
    ? validateLandUse(landUseInput)
    : { status: 'zone_not_found' as const, checks: [], consentRequired: false, consentUses: [] };

  // Step 3: Run circulation simulation with all available data
  const circulation = simulateCirculation(project, landUseResult, readiness.readiness);

  // Step 4: Assemble submission pack for the project's municipality
  const municipality: MunicipalityType = (project.municipality as MunicipalityType) ?? 'Other';
  const pack = assembleSubmissionPack(project, municipality, 'building plan');

  return { readiness, circulation, pack };
}

/**
 * Writes workspace assessment results back to Project Passport (Firestore).
 *
 * Firestore path structure:
 *   projects/{projectId}/municipal_workspace/assessment
 *     - readinessScore: number
 *     - overallConfidence: number
 *     - packCompleteness: { total, included, missing }
 *     - assessedAt: ISO timestamp
 *     - departmentScores: Record<DepartmentId, number>
 *     - blockers: string[]
 *
 * Note: Actual Firestore write will be wired during integration.
 * This stub logs what would be persisted for development/testing visibility.
 */
export async function persistWorkspaceResults(
  projectId: string,
  assessment: WorkspaceAssessment
): Promise<void> {
  // TODO: Wire Firestore write during integration task.
  // Target path: projects/{projectId}/municipal_workspace/assessment
  const snapshot = {
    projectId,
    readinessScore: assessment.readiness.readiness.score,
    overallConfidence: assessment.circulation.overallConfidence,
    packCompleteness: assessment.pack.completeness,
    assessedAt: new Date().toISOString(),
    departmentScores: Object.fromEntries(
      assessment.circulation.departments.map((d) => [d.departmentId, d.confidenceScore])
    ),
    blockers: assessment.readiness.readiness.blockers,
  };

  console.log(
    `[persistWorkspaceResults] Would persist assessment snapshot for project ${projectId}:`,
    JSON.stringify(snapshot, null, 2)
  );
}

/**
 * Generates Action Centre inbox events from workspace assessment blockers
 * and overdue sign-offs.
 *
 * Sources for events:
 *   1. Readiness pipeline blockers → action_required events
 *   2. Submission pack missing documents → action_required events
 *   3. Circulation departments needing attention or failing → action_required/blocked events
 */
export function generateWorkspaceActions(
  assessment: WorkspaceAssessment
): SubmissionInboxEvent[] {
  const events: SubmissionInboxEvent[] = [];

  // 1. Generate events from readiness blockers
  const blockers = assessment.readiness.readiness.blockers;
  for (const blocker of blockers) {
    events.push({
      id: `action-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      recipient: 'lead_professional',
      title: blocker,
      severity: 'action_required',
    });
  }

  // 2. Generate events from pack missing documents
  const missingDocs = assessment.pack.documents.filter((d) => d.status === 'missing');
  for (const doc of missingDocs) {
    events.push({
      id: `pack-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      recipient: 'lead_professional',
      title: `Missing document: ${doc.title}`,
      severity: 'action_required',
    });
  }

  // 3. Generate events from departments needing attention or failing
  const attentionDepts = assessment.circulation.departments.filter(
    (d) => d.status === 'attention' || d.status === 'fail'
  );
  for (const dept of attentionDepts) {
    events.push({
      id: `dept-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      recipient: 'lead_professional',
      title: `${dept.departmentName}: ${dept.actionItems[0] ?? 'Requires attention'}`,
      severity: dept.status === 'fail' ? 'blocked' : 'action_required',
    });
  }

  return events;
}
