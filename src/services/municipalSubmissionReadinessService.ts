/**
 * Municipal Submission Readiness — Unified Service
 *
 * Wires together all Pack 6 services:
 *   1. classifyProjectComplexity
 *   2. routeProfessionalTeam
 *   3. buildMunicipalRequirementChecks
 *   4. buildNbrSansPrechecks
 *   5. buildDrawingReadinessChecks
 *   6. assembleEvidencePack
 *   7. assessReadiness
 *   8. createInboxEvents
 *   9. recommendSubmissionActions
 *  10. createAuditTrail
 *
 * Produces a single MunicipalSubmissionReadinessResult for the unified
 * GET /api/projects/:projectId/submission-readiness endpoint and the
 * submission readiness dashboard.
 *
 * Part of Pack 6: Municipal Submission Readiness
 */

import type {
  MunicipalSubmissionReadinessResult,
  ProjectScopeFacts,
} from '@/types/municipalSubmissionReadiness';
import { classifyProjectComplexity } from './projectComplexityClassifierService';
import { routeProfessionalTeam } from './professionalTeamRouterService';
import { buildMunicipalRequirementChecks } from './municipalRequirementMatrixService';
import { buildNbrSansPrechecks } from './nbrSansPrecheckService';
import { buildDrawingReadinessChecks } from './drawingReadinessService';
import {
  buildProfessionalTeamChecks,
  assessReadiness,
} from './readinessScoreService';
import { assembleEvidencePack } from './submissionEvidencePackService';
import { createInboxEvents } from './inboxEventAdapterService';
import { recommendSubmissionActions } from './submissionRecommendationService';
import { createAuditTrail } from './auditTrailService';

/**
 * Run the complete municipal submission readiness pipeline.
 *
 * Flow: Classify → Route → Checks → Score → Evidence Pack → Inbox → Audit
 */
export function assessMunicipalSubmissionReadiness(
  project: ProjectScopeFacts
): MunicipalSubmissionReadinessResult {
  const now = new Date().toISOString();

  // Step 1: Classify project complexity
  const complexity = classifyProjectComplexity(project);

  // Step 2: Route professional team (trigger-based)
  const professionalRoutes = routeProfessionalTeam(project, complexity);

  // Step 3: Aggregate all readiness checks
  const municipalChecks = buildMunicipalRequirementChecks(project);
  const nbrChecks = buildNbrSansPrechecks(project);
  const drawingChecks = buildDrawingReadinessChecks(project);
  const teamChecks = buildProfessionalTeamChecks(professionalRoutes);

  const allChecks = [
    ...municipalChecks,
    ...nbrChecks,
    ...drawingChecks,
    ...teamChecks,
  ];

  // Step 4: Assess readiness score
  const readiness = assessReadiness(allChecks);

  // Step 5: Assemble evidence pack
  const evidencePack = assembleEvidencePack(readiness, professionalRoutes);

  // Step 6: Create inbox events
  const inboxEvents = createInboxEvents(readiness, professionalRoutes);

  // Step 7: Generate agent recommendations
  const recommendations = recommendSubmissionActions(
    readiness,
    professionalRoutes
  );

  // Step 8: Create audit trail
  const auditTrail = createAuditTrail(complexity, readiness);

  return {
    projectId: project.projectId,
    projectName: project.projectName,
    assessedAt: now,
    complexity,
    professionalRoutes,
    checks: allChecks,
    readiness,
    evidencePack,
    inboxEvents,
    recommendations,
    auditTrail,
  };
}

/**
 * Build a ProjectScopeFacts from common data sources (job, project record, etc.).
 * This is a convenience adapter for API and component use.
 */
export function buildScopeFactsFromProject(params: {
  projectId: string;
  projectName: string;
  municipality?: string;
  province?: string;
  propertyDescription?: string;
  erfNumber?: string;
  zoningKnown?: boolean;
  occupancyType?: ProjectScopeFacts['occupancyType'];
  alterationToExisting?: boolean;
  additions?: boolean;
  newBuild?: boolean;
  changesLoadBearing?: boolean;
  changesDrainageOrStormwater?: boolean;
  publicAccessOrAssembly?: boolean;
  envelopeEnergyImpact?: boolean;
  coverageOrParkingRisk?: boolean;
  boundaryOrServitudeUnclear?: boolean;
  heritagePotential?: boolean;
  environmentalSensitivity?: boolean;
  trafficImpact?: boolean;
  estimatedConstructionValueZar?: number;
  drawingRegister?: ProjectScopeFacts['drawingRegister'];
  supportingDocuments?: ProjectScopeFacts['supportingDocuments'];
}): ProjectScopeFacts {
  return {
    projectId: params.projectId,
    projectName: params.projectName,
    municipality: params.municipality,
    province: params.province,
    propertyDescription: params.propertyDescription,
    erfNumber: params.erfNumber,
    zoningKnown: params.zoningKnown ?? false,
    occupancyType: params.occupancyType ?? 'single_residential',
    alterationToExisting: params.alterationToExisting ?? false,
    additions: params.additions ?? false,
    newBuild: params.newBuild ?? false,
    changesLoadBearing: params.changesLoadBearing ?? false,
    changesDrainageOrStormwater: params.changesDrainageOrStormwater ?? false,
    publicAccessOrAssembly: params.publicAccessOrAssembly ?? false,
    envelopeEnergyImpact: params.envelopeEnergyImpact ?? false,
    coverageOrParkingRisk: params.coverageOrParkingRisk ?? false,
    boundaryOrServitudeUnclear: params.boundaryOrServitudeUnclear ?? false,
    heritagePotential: params.heritagePotential ?? false,
    environmentalSensitivity: params.environmentalSensitivity ?? false,
    trafficImpact: params.trafficImpact ?? false,
    estimatedConstructionValueZar: params.estimatedConstructionValueZar ?? 0,
    drawingRegister: params.drawingRegister ?? [],
    supportingDocuments: params.supportingDocuments ?? [],
  };
}
