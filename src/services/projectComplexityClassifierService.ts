/**
 * Project Complexity Classifier Service
 * Converts project scope facts into complexity classification with triggers.
 *
 * Part of Pack 6: Municipal Submission Readiness
 */
import type { ComplexityAssessment, ProjectComplexity, ProjectScopeFacts } from '@/types/municipalSubmissionReadiness';

/**
 * Classify a project's complexity based on scope facts.
 * Returns a complexity level (low/medium/high) along with trigger descriptions
 * that explain why certain professional inputs are needed.
 */
export function classifyProjectComplexity(
  project: ProjectScopeFacts
): ComplexityAssessment {
  const triggers: string[] = [];

  if (project.changesLoadBearing) {
    triggers.push('Load-bearing or structural changes indicated.');
  }
  if (project.changesDrainageOrStormwater) {
    triggers.push('Drainage/stormwater/services impact indicated.');
  }
  if (project.publicAccessOrAssembly || project.occupancyType === 'public_assembly') {
    triggers.push(
      'Public access/assembly or elevated fire-life-safety risk indicated.'
    );
  }
  if (project.envelopeEnergyImpact) {
    triggers.push('Building envelope/energy impact indicated.');
  }
  if (!project.zoningKnown || project.coverageOrParkingRisk) {
    triggers.push('Zoning, land-use, coverage or parking risk not resolved.');
  }
  if (project.boundaryOrServitudeUnclear) {
    triggers.push('Boundary/servitude/site verification issue indicated.');
  }
  if (project.heritagePotential) {
    triggers.push('Heritage trigger indicated.');
  }
  if (project.environmentalSensitivity) {
    triggers.push('Environmental sensitivity trigger indicated.');
  }
  if (project.trafficImpact) {
    triggers.push('Traffic/access impact trigger indicated.');
  }
  if (project.estimatedConstructionValueZar > 5_000_000) {
    triggers.push(
      'High-value project; stronger cost/risk coordination recommended.'
    );
  }

  const complexity: ProjectComplexity =
    triggers.length >= 5 ? 'high' : triggers.length >= 2 ? 'medium' : 'low';

  return { complexity, triggers, assessedAt: new Date().toISOString() };
}
