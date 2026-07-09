/**
 * Circulation Simulator Service
 *
 * Simulates how each municipal department would assess a submission,
 * producing per-department confidence scores and action items.
 */

import type {
  DepartmentId,
  DepartmentAssessment,
  CirculationSimulationResult,
  LandUseCheckResult,
} from '@/types/municipalWorkspace';
import type {
  ProjectScopeFacts,
  ReadinessAssessment,
} from '@/types/municipalSubmissionReadiness';

// ── Department Name Mapping ────────────────────────────────────────────────────

const DEPARTMENT_NAMES: Record<DepartmentId, string> = {
  town_planning: 'Town Planning',
  building_control: 'Building Control',
  fire: 'Fire Department',
  water_sanitation: 'Water & Sanitation',
  roads_transport: 'Roads & Transport',
  electrical: 'Electrical',
  environmental: 'Environmental',
  heritage: 'Heritage',
};

// ── Status Derivation ──────────────────────────────────────────────────────────

function deriveStatus(
  confidenceScore: number,
  checksTotal: number
): DepartmentAssessment['status'] {
  if (checksTotal === 0) return 'insufficient_data';
  if (confidenceScore >= 70) return 'pass';
  if (confidenceScore >= 40) return 'attention';
  return 'fail';
}

// ── Town Planning Assessment (Task 4.1) ────────────────────────────────────────

function assessTownPlanning(
  project: ProjectScopeFacts,
  supplementaryData: Record<string, unknown>
): DepartmentAssessment {
  const dataGaps: string[] = [];
  const actionItems: string[] = [];
  let checksTotal = 0;
  let checksPassed = 0;

  // Check 1: Zoning known
  checksTotal++;
  if (project.zoningKnown) {
    checksPassed++;
  } else {
    actionItems.push('Confirm zoning classification with municipality');
  }

  // Check 2: Coverage risk flag
  checksTotal++;
  if (!project.coverageOrParkingRisk) {
    checksPassed++;
  } else {
    actionItems.push('Verify coverage and parking comply with zoning scheme');
  }

  // Check 3: Boundary/servitude unclear
  checksTotal++;
  if (!project.boundaryOrServitudeUnclear) {
    checksPassed++;
  } else {
    actionItems.push('Obtain boundary survey or servitude diagram from land surveyor');
  }

  // Check 4: Traffic impact assessment needed
  checksTotal++;
  if (!project.trafficImpact) {
    checksPassed++;
  } else {
    // Traffic impact required — check if traffic study is available
    const hasTrafficComment = project.supportingDocuments.some(
      (d) => d.kind === 'traffic_comment' && d.status === 'available'
    );
    if (hasTrafficComment) {
      checksPassed++;
    } else {
      dataGaps.push('Traffic impact assessment not yet available');
      actionItems.push('Commission traffic impact assessment from traffic engineer');
      // Don't count as passed — it's a data gap, reduce total to not penalize
      checksTotal--;
    }
  }

  // Integrate with Land Use check results if available
  const landUseResult = supplementaryData.landUseResult as LandUseCheckResult | undefined;
  if (landUseResult) {
    checksTotal++;
    if (landUseResult.status === 'pass') {
      checksPassed++;
    } else if (landUseResult.status === 'fail') {
      const failedChecks = landUseResult.checks.filter((c) => c.status === 'fail');
      actionItems.push(
        `Land use scheme non-compliance: ${failedChecks.map((c) => c.parameter).join(', ')}`
      );
    } else {
      // zone_not_found
      dataGaps.push('Zone definition not found in scheme database');
      checksTotal--;
    }

    if (landUseResult.consentRequired) {
      actionItems.push(
        `Consent use application required for: ${landUseResult.consentUses.join(', ')}`
      );
    }
  }

  const confidenceScore = checksTotal > 0 ? Math.round((checksPassed / checksTotal) * 100) : 0;

  return {
    departmentId: 'town_planning',
    departmentName: DEPARTMENT_NAMES.town_planning,
    confidenceScore,
    status: deriveStatus(confidenceScore, checksTotal),
    checksTotal,
    checksPassed,
    dataGaps,
    actionItems,
  };
}

// ── Building Control Assessment (Task 4.2) ─────────────────────────────────────

function assessBuildingControl(
  project: ProjectScopeFacts,
  supplementaryData: Record<string, unknown>
): DepartmentAssessment {
  const dataGaps: string[] = [];
  const actionItems: string[] = [];
  let checksTotal = 0;
  let checksPassed = 0;

  // Structural check — triggered by changesLoadBearing
  if (project.changesLoadBearing) {
    checksTotal++;
    const hasStructuralDrawing = project.drawingRegister.some(
      (d) => d.kind === 'structural_drawing' && d.status === 'signed_off'
    );
    if (hasStructuralDrawing) {
      checksPassed++;
    } else {
      const hasDraftStructural = project.drawingRegister.some(
        (d) => d.kind === 'structural_drawing'
      );
      if (hasDraftStructural) {
        actionItems.push('Obtain structural engineer sign-off on structural drawings');
      } else {
        dataGaps.push('Structural drawings not yet in drawing register');
        actionItems.push('Commission structural drawings from structural engineer');
        checksTotal--;
      }
    }
  }

  // Energy/XA check — triggered by envelopeEnergyImpact
  if (project.envelopeEnergyImpact) {
    checksTotal++;
    const hasEnergyCalc = project.drawingRegister.some(
      (d) => d.kind === 'energy_calculation' && d.status === 'signed_off'
    );
    if (hasEnergyCalc) {
      checksPassed++;
    } else {
      const hasDraftEnergy = project.drawingRegister.some(
        (d) => d.kind === 'energy_calculation'
      );
      if (hasDraftEnergy) {
        actionItems.push('Obtain energy professional sign-off on XA calculations');
      } else {
        dataGaps.push('SANS 10400-XA energy calculations not yet available');
        actionItems.push('Commission SANS 10400-XA compliance calculations');
        checksTotal--;
      }
    }
  }

  // Accessibility check — triggered by publicAccessOrAssembly
  if (project.publicAccessOrAssembly) {
    checksTotal++;
    // Accessibility is typically shown on floor plans — check if floor plans are signed off
    const hasSignedFloorPlan = project.drawingRegister.some(
      (d) => d.kind === 'floor_plan' && d.status === 'signed_off'
    );
    if (hasSignedFloorPlan) {
      checksPassed++;
    } else {
      actionItems.push('Ensure floor plans show SANS 10400-S accessibility compliance');
    }
  }

  // Full NBR check — triggered by newBuild
  if (project.newBuild) {
    checksTotal++;
    // For new builds, check that all core drawing types are present and signed off
    const requiredDrawings: Array<'site_plan' | 'floor_plan' | 'elevation' | 'section'> = [
      'site_plan',
      'floor_plan',
      'elevation',
      'section',
    ];
    const signedCount = requiredDrawings.filter((kind) =>
      project.drawingRegister.some((d) => d.kind === kind && d.status === 'signed_off')
    ).length;

    if (signedCount === requiredDrawings.length) {
      checksPassed++;
    } else {
      const missingDrawings = requiredDrawings.filter(
        (kind) => !project.drawingRegister.some((d) => d.kind === kind && d.status === 'signed_off')
      );
      actionItems.push(`Complete and sign off drawings: ${missingDrawings.join(', ')}`);
    }
  }

  // If no triggers fired, building control has minimal involvement — high confidence
  if (checksTotal === 0) {
    checksTotal = 1;
    checksPassed = 1;
  }

  // Integrate with existing NBR/SANS precheck results if provided
  const nbrResult = supplementaryData.nbrPrecheckResult as
    | { passed: boolean; issues: string[] }
    | undefined;
  if (nbrResult) {
    checksTotal++;
    if (nbrResult.passed) {
      checksPassed++;
    } else {
      actionItems.push(...nbrResult.issues.map((issue) => `NBR precheck: ${issue}`));
    }
  }

  const confidenceScore = checksTotal > 0 ? Math.round((checksPassed / checksTotal) * 100) : 0;

  return {
    departmentId: 'building_control',
    departmentName: DEPARTMENT_NAMES.building_control,
    confidenceScore,
    status: deriveStatus(confidenceScore, checksTotal),
    checksTotal,
    checksPassed,
    dataGaps,
    actionItems,
  };
}

// ── Fire Department Assessment (Task 4.3) ──────────────────────────────────────

function assessFire(
  project: ProjectScopeFacts,
  supplementaryData: Record<string, unknown>
): DepartmentAssessment {
  const dataGaps: string[] = [];
  const actionItems: string[] = [];
  let checksTotal = 0;
  let checksPassed = 0;

  // Check 1: Public access / assembly occupancy (fire escape, capacity)
  if (project.publicAccessOrAssembly) {
    checksTotal++;
    const hasFirePlan = project.drawingRegister.some(
      (d) => d.kind === 'fire_plan' && d.status === 'signed_off'
    );
    if (hasFirePlan) {
      checksPassed++;
    } else {
      const hasDraftFirePlan = project.drawingRegister.some((d) => d.kind === 'fire_plan');
      if (hasDraftFirePlan) {
        actionItems.push('Obtain fire consultant sign-off on fire plans');
      } else {
        dataGaps.push('Fire protection plan not yet in drawing register');
        actionItems.push('Commission fire protection plans from fire consultant');
        checksTotal--;
      }
    }
  }

  // Check 2: Multi-storey implies fire rating and compartmentalization
  const isMultiStorey =
    project.occupancyType === 'multi_residential' ||
    project.occupancyType === 'commercial' ||
    project.occupancyType === 'public_assembly' ||
    project.occupancyType === 'mixed_use';

  if (isMultiStorey) {
    checksTotal++;
    // For multi-storey, fire plans are essential
    const hasFirePlan = project.drawingRegister.some(
      (d) => d.kind === 'fire_plan' && (d.status === 'signed_off' || d.status === 'checked')
    );
    if (hasFirePlan) {
      checksPassed++;
    } else {
      actionItems.push('Multi-storey building requires fire compartmentalization plans');
    }
  }

  // Check 3: Load-bearing changes imply fire rating implications
  if (project.changesLoadBearing) {
    checksTotal++;
    // Structural changes may affect fire ratings — need fire engineer input
    const hasFirePlan = project.drawingRegister.some((d) => d.kind === 'fire_plan');
    if (hasFirePlan) {
      checksPassed++;
    } else {
      actionItems.push('Structural changes require fire rating assessment for affected elements');
    }
  }

  // Integrate with fire compliance calculator outputs if available
  const fireCheckResult = supplementaryData.fireCheckResult as
    | { passed: boolean; issues: string[] }
    | undefined;
  if (fireCheckResult) {
    checksTotal++;
    if (fireCheckResult.passed) {
      checksPassed++;
    } else {
      actionItems.push(...fireCheckResult.issues.map((issue) => `Fire compliance: ${issue}`));
    }
  }

  // If no fire-relevant triggers, minimal involvement
  if (checksTotal === 0) {
    checksTotal = 1;
    checksPassed = 1;
  }

  const confidenceScore = checksTotal > 0 ? Math.round((checksPassed / checksTotal) * 100) : 0;

  return {
    departmentId: 'fire',
    departmentName: DEPARTMENT_NAMES.fire,
    confidenceScore,
    status: deriveStatus(confidenceScore, checksTotal),
    checksTotal,
    checksPassed,
    dataGaps,
    actionItems,
  };
}

// ── Water & Sanitation Assessment (Task 4.4) ───────────────────────────────────

function assessWaterSanitation(
  project: ProjectScopeFacts,
  supplementaryData: Record<string, unknown>
): DepartmentAssessment {
  const dataGaps: string[] = [];
  const actionItems: string[] = [];
  let checksTotal = 0;
  let checksPassed = 0;

  // Check 1: Changes drainage or stormwater
  if (project.changesDrainageOrStormwater) {
    checksTotal++;
    const hasDrainageLayout = project.drawingRegister.some(
      (d) => d.kind === 'drainage_layout' && d.status === 'signed_off'
    );
    if (hasDrainageLayout) {
      checksPassed++;
    } else {
      const hasDraftDrainage = project.drawingRegister.some(
        (d) => d.kind === 'drainage_layout'
      );
      if (hasDraftDrainage) {
        actionItems.push('Obtain civil engineer sign-off on drainage layout');
      } else {
        dataGaps.push('Drainage layout not yet in drawing register');
        actionItems.push('Commission drainage and stormwater layout from civil engineer');
        checksTotal--;
      }
    }
  }

  // Check 2: New build requires new water/sewer connections
  if (project.newBuild) {
    checksTotal++;
    // New builds need municipal connection applications — check for drainage layout
    const hasDrainageLayout = project.drawingRegister.some(
      (d) => d.kind === 'drainage_layout'
    );
    if (hasDrainageLayout) {
      checksPassed++;
    } else {
      dataGaps.push('New build requires drainage layout for connection application');
      actionItems.push('Prepare drainage layout showing proposed connection points');
      checksTotal--;
    }
  }

  // If neither trigger fires, very high confidence (minimal W&S involvement)
  if (checksTotal === 0) {
    checksTotal = 1;
    checksPassed = 1;
  }

  // Integrate with drainage/stormwater check results if available
  const drainageResult = supplementaryData.drainageCheckResult as
    | { passed: boolean; issues: string[] }
    | undefined;
  if (drainageResult) {
    checksTotal++;
    if (drainageResult.passed) {
      checksPassed++;
    } else {
      actionItems.push(
        ...drainageResult.issues.map((issue) => `Drainage/stormwater: ${issue}`)
      );
    }
  }

  const confidenceScore = checksTotal > 0 ? Math.round((checksPassed / checksTotal) * 100) : 0;

  return {
    departmentId: 'water_sanitation',
    departmentName: DEPARTMENT_NAMES.water_sanitation,
    confidenceScore,
    status: deriveStatus(confidenceScore, checksTotal),
    checksTotal,
    checksPassed,
    dataGaps,
    actionItems,
  };
}

// ── Roads & Transport Assessment (Task 4.5) ────────────────────────────────────

function assessRoadsTransport(
  project: ProjectScopeFacts,
  supplementaryData: Record<string, unknown>
): DepartmentAssessment {
  const dataGaps: string[] = [];
  const actionItems: string[] = [];
  let checksTotal = 0;
  let checksPassed = 0;

  // Check 1: Traffic impact — needs traffic study
  if (project.trafficImpact) {
    checksTotal++;
    const hasTrafficComment = project.supportingDocuments.some(
      (d) => d.kind === 'traffic_comment' && d.status === 'available'
    );
    if (hasTrafficComment) {
      checksPassed++;
    } else {
      dataGaps.push('Traffic impact assessment not available');
      actionItems.push('Commission traffic impact assessment from traffic engineer');
      checksTotal--;
    }
  }

  // Check 2: Site plan showing access — check drawing register
  checksTotal++;
  const hasSitePlan = project.drawingRegister.some(
    (d) => d.kind === 'site_plan' && (d.status === 'signed_off' || d.status === 'checked')
  );
  if (hasSitePlan) {
    checksPassed++;
  } else {
    const hasDraftSitePlan = project.drawingRegister.some((d) => d.kind === 'site_plan');
    if (hasDraftSitePlan) {
      actionItems.push('Site plan requires sign-off showing vehicular access points');
    } else {
      dataGaps.push('Site plan not available for access assessment');
      actionItems.push('Prepare site plan showing vehicular and pedestrian access');
      checksTotal--;
    }
  }

  // Check 3: Complex projects (commercial, mixed use) need parking/access detail
  const isComplex =
    project.occupancyType === 'commercial' ||
    project.occupancyType === 'mixed_use' ||
    project.occupancyType === 'public_assembly';
  if (isComplex) {
    checksTotal++;
    if (project.coverageOrParkingRisk) {
      actionItems.push('Verify parking provision meets scheme requirements for access');
    } else {
      checksPassed++;
    }
  }

  // If no checks apply at all, default to pass
  if (checksTotal === 0) {
    checksTotal = 1;
    checksPassed = 1;
  }

  const confidenceScore = checksTotal > 0 ? Math.round((checksPassed / checksTotal) * 100) : 0;

  return {
    departmentId: 'roads_transport',
    departmentName: DEPARTMENT_NAMES.roads_transport,
    confidenceScore,
    status: deriveStatus(confidenceScore, checksTotal),
    checksTotal,
    checksPassed,
    dataGaps,
    actionItems,
  };
}

// ── Electrical Assessment (Task 4.5) ───────────────────────────────────────────

function assessElectrical(
  project: ProjectScopeFacts,
  _supplementaryData: Record<string, unknown>
): DepartmentAssessment {
  const dataGaps: string[] = [];
  const actionItems: string[] = [];
  let checksTotal = 0;
  let checksPassed = 0;

  // Trigger: bulk supply required for large or multi-storey projects
  const needsBulkSupply =
    project.estimatedConstructionValueZar > 5_000_000 ||
    project.occupancyType === 'multi_residential' ||
    project.occupancyType === 'commercial' ||
    project.occupancyType === 'mixed_use' ||
    project.occupancyType === 'public_assembly';

  if (needsBulkSupply) {
    checksTotal++;
    // Bulk supply application is a data gap unless confirmed
    dataGaps.push('Bulk electrical supply application status unknown');
    actionItems.push('Confirm bulk electrical supply application with municipality');
    // Don't count as passed — it's a data gap
    checksTotal--;
  }

  // Basic electrical check — if no bulk supply trigger, high confidence
  if (checksTotal === 0) {
    checksTotal = 1;
    checksPassed = 1;
  }

  const confidenceScore = checksTotal > 0 ? Math.round((checksPassed / checksTotal) * 100) : 0;

  return {
    departmentId: 'electrical',
    departmentName: DEPARTMENT_NAMES.electrical,
    confidenceScore,
    status: deriveStatus(confidenceScore, checksTotal),
    checksTotal,
    checksPassed,
    dataGaps,
    actionItems,
  };
}

// ── Environmental Assessment (Task 4.5) ────────────────────────────────────────

function assessEnvironmental(
  project: ProjectScopeFacts,
  _supplementaryData: Record<string, unknown>
): DepartmentAssessment {
  const dataGaps: string[] = [];
  const actionItems: string[] = [];
  let checksTotal = 0;
  let checksPassed = 0;

  if (project.environmentalSensitivity) {
    // EIA required
    checksTotal++;
    const hasEnvironmentalComment = project.supportingDocuments.some(
      (d) => d.kind === 'environmental_comment' && d.status === 'available'
    );
    if (hasEnvironmentalComment) {
      checksPassed++;
    } else {
      dataGaps.push('Environmental impact assessment not yet available');
      actionItems.push('Commission Environmental Impact Assessment (EIA) from environmental practitioner');
      checksTotal--;
    }
  } else {
    // No environmental sensitivity — pass with note
    checksTotal = 1;
    checksPassed = 1;
  }

  const confidenceScore = checksTotal > 0 ? Math.round((checksPassed / checksTotal) * 100) : 0;

  return {
    departmentId: 'environmental',
    departmentName: DEPARTMENT_NAMES.environmental,
    confidenceScore,
    status: deriveStatus(confidenceScore, checksTotal),
    checksTotal,
    checksPassed,
    dataGaps,
    actionItems,
  };
}

// ── Heritage Assessment (Task 4.5) ─────────────────────────────────────────────

function assessHeritage(
  project: ProjectScopeFacts,
  _supplementaryData: Record<string, unknown>
): DepartmentAssessment {
  const dataGaps: string[] = [];
  const actionItems: string[] = [];
  let checksTotal = 0;
  let checksPassed = 0;

  if (project.heritagePotential) {
    // Section 38 assessment required
    checksTotal++;
    const hasHeritageComment = project.supportingDocuments.some(
      (d) => d.kind === 'heritage_comment' && d.status === 'available'
    );
    if (hasHeritageComment) {
      checksPassed++;
    } else {
      dataGaps.push('Heritage impact assessment (Section 38) not yet available');
      actionItems.push('Commission NHRA Section 38 assessment from heritage practitioner');
      checksTotal--;
    }
  } else {
    // No heritage potential — pass
    checksTotal = 1;
    checksPassed = 1;
  }

  const confidenceScore = checksTotal > 0 ? Math.round((checksPassed / checksTotal) * 100) : 0;

  return {
    departmentId: 'heritage',
    departmentName: DEPARTMENT_NAMES.heritage,
    confidenceScore,
    status: deriveStatus(confidenceScore, checksTotal),
    checksTotal,
    checksPassed,
    dataGaps,
    actionItems,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Runs a full departmental circulation simulation across all 8 departments.
 * Produces per-department confidence scores and an overall confidence rating.
 */
export function simulateCirculation(
  project: ProjectScopeFacts,
  landUseResult: LandUseCheckResult,
  _readinessAssessment: ReadinessAssessment
): CirculationSimulationResult {
  const supplementaryData: Record<string, unknown> = { landUseResult };

  const departments: DepartmentAssessment[] = [
    assessTownPlanning(project, supplementaryData),
    assessBuildingControl(project, supplementaryData),
    assessFire(project, supplementaryData),
    assessWaterSanitation(project, supplementaryData),
    assessRoadsTransport(project, supplementaryData),
    assessElectrical(project, supplementaryData),
    assessEnvironmental(project, supplementaryData),
    assessHeritage(project, supplementaryData),
  ];

  const totalScore = departments.reduce((sum, d) => sum + d.confidenceScore, 0);
  const overallConfidence = Math.round(totalScore / departments.length);

  return {
    overallConfidence,
    departments,
    simulatedAt: new Date().toISOString(),
    advisoryNotice:
      'All assessments are indicative and advisory only. They do not replace official municipal circulation.',
  };
}

/**
 * Runs a single department assessment with the provided project data
 * and any supplementary data relevant to that department.
 */
export function assessDepartment(
  departmentId: DepartmentId,
  project: ProjectScopeFacts,
  supplementaryData: Record<string, unknown>
): DepartmentAssessment {
  switch (departmentId) {
    case 'town_planning':
      return assessTownPlanning(project, supplementaryData);
    case 'building_control':
      return assessBuildingControl(project, supplementaryData);
    case 'fire':
      return assessFire(project, supplementaryData);
    case 'water_sanitation':
      return assessWaterSanitation(project, supplementaryData);
    case 'roads_transport':
      return assessRoadsTransport(project, supplementaryData);
    case 'electrical':
      return assessElectrical(project, supplementaryData);
    case 'environmental':
      return assessEnvironmental(project, supplementaryData);
    case 'heritage':
      return assessHeritage(project, supplementaryData);
    default:
      return {
        departmentId,
        departmentName: String(departmentId).replace(/_/g, ' '),
        confidenceScore: 0,
        status: 'insufficient_data',
        checksTotal: 0,
        checksPassed: 0,
        dataGaps: [`Unknown department: ${departmentId}`],
        actionItems: [],
      };
  }
}
