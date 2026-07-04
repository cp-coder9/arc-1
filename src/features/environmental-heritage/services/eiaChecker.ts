/**
 * Environmental & Heritage Module — EIA Checker Service
 *
 * Pure business logic for EIA screening determination. Evaluates selected
 * NEMA Listed Activities to determine the required assessment pathway
 * (Basic Assessment or Scoping & EIR) and identifies the competent authority.
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8
 */

import type {
  AssessmentType,
  GeographicContext,
  ScreeningReport,
  SelectedActivity,
} from '../types';

// ─── Service Result Pattern ───────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── Province to Department Mapping ───────────────────────────────────────────

const PROVINCE_DEPARTMENT_MAP: Record<string, string> = {
  'Gauteng': 'Gauteng Department of Agriculture and Rural Development',
  'Western Cape': 'Western Cape Department of Environmental Affairs and Development Planning',
  'KwaZulu-Natal': 'KwaZulu-Natal Department of Economic Development, Tourism and Environmental Affairs',
  'Eastern Cape': 'Eastern Cape Department of Economic Development, Environmental Affairs and Tourism',
  'Free State': 'Free State Department of Economic, Small Business Development, Tourism and Environmental Affairs',
  'Limpopo': 'Limpopo Department of Economic Development, Environment and Tourism',
  'Mpumalanga': 'Mpumalanga Department of Agriculture, Rural Development, Land and Environmental Affairs',
  'North West': 'North West Department of Economic Development, Environment, Conservation and Tourism',
  'Northern Cape': 'Northern Cape Department of Agriculture, Environmental Affairs, Rural Development and Land Reform',
};

const DFFE_AUTHORITY = 'DFFE';
const DEFAULT_PROVINCIAL_DEPARTMENT = 'Provincial Environmental Department';

// ─── Assessment Type Determination ───────────────────────────────────────────

/**
 * Determines the required environmental assessment type based on selected
 * NEMA Listed Activities.
 *
 * Rules:
 * - Any LN2 activity → Scoping & EIR, competent authority = DFFE
 * - Only LN1/LN3 activities → Basic Assessment, competent authority = provincial dept
 * - No activities → None, competent authority = N/A
 *
 * Validates: Requirements 15.2, 15.3, 15.7
 */
export function determineAssessmentType(
  selectedActivities: SelectedActivity[],
  province?: string,
): ServiceResult<{ assessmentType: AssessmentType; competentAuthority: string }> {
  // No activities selected → no assessment required
  if (!selectedActivities || selectedActivities.length === 0) {
    return {
      success: true,
      data: {
        assessmentType: 'none',
        competentAuthority: 'N/A',
      },
    };
  }

  // Check for any Listing Notice 2 activity
  const hasLN2 = selectedActivities.some(
    (activity) => activity.listingNotice === 'listing_notice_2',
  );

  if (hasLN2) {
    return {
      success: true,
      data: {
        assessmentType: 'scoping_and_eir',
        competentAuthority: DFFE_AUTHORITY,
      },
    };
  }

  // Only LN1 and/or LN3 activities → Basic Assessment
  // Competent authority is derived from province
  const provincialDepartment = province
    ? (PROVINCE_DEPARTMENT_MAP[province] ?? DEFAULT_PROVINCIAL_DEPARTMENT)
    : DEFAULT_PROVINCIAL_DEPARTMENT;

  return {
    success: true,
    data: {
      assessmentType: 'basic_assessment',
      competentAuthority: provincialDepartment,
    },
  };
}

// ─── Geographic Context Validation ───────────────────────────────────────────

/**
 * Validates that the geographic context has the required province field.
 * Province is mandatory for accurate Listing Notice 3 assessment.
 *
 * Validates: Requirement 15.7
 */
function validateGeographicContext(
  geographic: GeographicContext,
): ServiceResult<GeographicContext> {
  if (!geographic.province || geographic.province.trim() === '') {
    return {
      success: false,
      error: {
        code: 'PROVINCE_REQUIRED',
        message:
          'Province is required for accurate Listing Notice 3 assessment. Please specify the province where the project is located.',
      },
    };
  }

  return { success: true, data: geographic };
}

// ─── Next Steps Generation ───────────────────────────────────────────────────

/**
 * Generates recommended next steps based on the determined assessment type.
 *
 * Validates: Requirement 15.3
 */
function generateNextSteps(
  assessmentType: AssessmentType,
  competentAuthority: string,
  geographic: GeographicContext,
): string[] {
  const steps: string[] = [];

  switch (assessmentType) {
    case 'scoping_and_eir':
      steps.push('Appoint registered EAP');
      steps.push('Prepare Scoping Report');
      steps.push('Submit to DFFE');
      break;

    case 'basic_assessment':
      steps.push('Appoint registered EAP');
      steps.push('Prepare Basic Assessment Report (BAR)');
      steps.push(`Submit to ${competentAuthority}`);
      break;

    case 'none':
      steps.push('No Environmental Authorisation required based on current screening');
      break;
  }

  // Add geographic context notes for LN3 zone applicability
  if (assessmentType !== 'none') {
    if (geographic.isCoastalZone) {
      steps.push('Note: Project is in a coastal zone — confirm Listing Notice 3 applicability with EAP');
    }
    if (geographic.isUrbanArea) {
      steps.push('Note: Project is in an urban area — confirm Listing Notice 3 applicability with EAP');
    }
    if (geographic.isSensitiveEnvironment) {
      steps.push('Note: Project is in a sensitive environment — confirm Listing Notice 3 applicability with EAP');
    }
  }

  return steps;
}

// ─── Screening Report Generation ─────────────────────────────────────────────

/**
 * Generates a complete EIA screening report assembling project context,
 * selected activities, geographic context, assessment determination,
 * and recommended next steps.
 *
 * Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5, 15.7
 */
export function generateScreeningReport(
  project: { projectId: string; projectName: string },
  activities: SelectedActivity[],
  geographic: GeographicContext,
  actor: { uid: string; displayName: string },
  now: Date,
): ServiceResult<ScreeningReport> {
  // Validate geographic context — province is required
  const geoValidation = validateGeographicContext(geographic);
  if (!geoValidation.success) {
    return geoValidation as ServiceResult<ScreeningReport>;
  }

  // Determine assessment type using province from geographic context
  const determination = determineAssessmentType(activities, geographic.province);
  if (!determination.success) {
    return determination as ServiceResult<ScreeningReport>;
  }

  const { assessmentType, competentAuthority } = determination.data;

  // Generate next steps based on assessment type and geographic context
  const nextSteps = generateNextSteps(assessmentType, competentAuthority, geographic);

  // Assemble the screening report
  const report: ScreeningReport = {
    id: generateId(),
    projectId: project.projectId,
    projectName: project.projectName,
    screeningDate: now.toISOString().split('T')[0],
    performedBy: actor.displayName,
    activitiesSelected: activities,
    assessmentType,
    competentAuthority,
    geographicContext: geographic,
    nextSteps,
    createdAt: now.toISOString(),
  };

  return { success: true, data: report };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generates a simple unique ID for the screening report */
function generateId(): string {
  return `scr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
