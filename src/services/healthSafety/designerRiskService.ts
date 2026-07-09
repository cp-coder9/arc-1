/**
 * Designer Risk Capture Service
 *
 * Enables Designers to record design-related hazard information and risk assessments
 * per Regulation 6(1) of the Construction Regulations 2014.
 *
 * Satisfies Requirements 4.1, 4.2, 4.3, 4.4
 */

import type { DesignerRiskAssessment } from './hsTypes';
import { DesignerRiskAssessmentSchema } from './hsSchemas';
import { ADVISORY_DISCLAIMER } from './hsConstants';

/**
 * Captures a new designer risk assessment.
 * Validates input against DesignerRiskAssessmentSchema, generates a unique ID,
 * and sets createdAt/updatedAt timestamps.
 *
 * @param input - All fields except id, createdAt, and updatedAt
 * @returns The complete DesignerRiskAssessment record
 * @throws ZodError if input validation fails
 *
 * Satisfies Requirements 4.1, 4.2
 */
export function captureDesignerRisk(
  input: Omit<DesignerRiskAssessment, 'id' | 'createdAt' | 'updatedAt'>
): DesignerRiskAssessment {
  // Validate input against the schema
  DesignerRiskAssessmentSchema.parse(input);

  const now = new Date().toISOString();

  return {
    ...input,
    id: `hs-dra-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Filters assessments by projectId.
 *
 * @param projectId - The project to filter by
 * @param assessments - The full set of designer risk assessments
 * @returns Only those assessments matching the given projectId
 *
 * Satisfies Requirement 4.3
 */
export function getProjectDesignerRisks(
  projectId: string,
  assessments: DesignerRiskAssessment[]
): DesignerRiskAssessment[] {
  return assessments.filter((a) => a.projectId === projectId);
}

/**
 * Generates a summary report of all design-related risks for inclusion in the Safety File.
 * Mentions every hazardDescription, design discipline, risk level, and recommended controls.
 * Includes the advisory disclaimer.
 *
 * @param assessments - The set of designer risk assessments to summarise
 * @returns A formatted summary string, or an empty-set notice if no assessments provided
 *
 * Satisfies Requirement 4.4
 */
export function generateDesignerRiskSummary(
  assessments: DesignerRiskAssessment[]
): string {
  if (assessments.length === 0) {
    return 'No designer risk assessments have been recorded for this project.';
  }

  const lines: string[] = [
    'Designer Risk Assessment Summary',
    '================================',
    '',
  ];

  for (const assessment of assessments) {
    lines.push(`Discipline: ${assessment.designDiscipline}`);
    lines.push(`Hazard: ${assessment.hazardDescription}`);
    lines.push(`Design Element: ${assessment.associatedDesignElement}`);
    lines.push(`Risk Level: ${assessment.riskLevel}`);
    lines.push(
      `Recommended Controls: ${assessment.recommendedControls.length > 0 ? assessment.recommendedControls.join('; ') : 'None specified'}`
    );
    lines.push('');
  }

  lines.push('---');
  lines.push(ADVISORY_DISCLAIMER);

  return lines.join('\n');
}
