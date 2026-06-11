/**
 * Drawing Readiness Service
 * Checks drawing/document register readiness for municipal submission.
 *
 * Part of Pack 6: Municipal Submission Readiness
 */
import type {
  DrawingRegisterItem,
  ProjectScopeFacts,
  ReadinessCheck,
  CheckStatus,
} from '@/types/municipalSubmissionReadiness';

function drawingStatus(
  project: ProjectScopeFacts,
  kind: DrawingRegisterItem['kind']
): CheckStatus {
  const item = project.drawingRegister.find((d) => d.kind === kind);
  if (!item) return 'missing';
  return item.status === 'signed_off' ? 'complete' : 'requires_professional_review';
}

/**
 * Build drawing register readiness checks based on project scope.
 * Only includes checks for drawing types relevant to the project triggers.
 */
export function buildDrawingReadinessChecks(
  project: ProjectScopeFacts
): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [
    {
      id: 'draw-001',
      category: 'drawing_register',
      label: 'Site plan',
      status: drawingStatus(project, 'site_plan'),
      owner: 'architect',
    },
    {
      id: 'draw-002',
      category: 'drawing_register',
      label: 'Floor plans',
      status: drawingStatus(project, 'floor_plan'),
      owner: 'architect',
    },
    {
      id: 'draw-003',
      category: 'drawing_register',
      label: 'Elevations',
      status: drawingStatus(project, 'elevation'),
      owner: 'architect',
    },
    {
      id: 'draw-004',
      category: 'drawing_register',
      label: 'Sections',
      status: drawingStatus(project, 'section'),
      owner: 'architect',
    },
    {
      id: 'draw-005',
      category: 'drawing_register',
      label: 'Door/window schedules',
      status: drawingStatus(project, 'schedule'),
      owner: 'architect',
    },
    {
      id: 'draw-010',
      category: 'drawing_register',
      label: 'Structural drawings',
      status: project.changesLoadBearing
        ? drawingStatus(project, 'structural_drawing')
        : 'not_applicable',
      owner: 'structural_engineer',
    },
    {
      id: 'draw-011',
      category: 'drawing_register',
      label: 'Drainage layout',
      status: project.changesDrainageOrStormwater
        ? drawingStatus(project, 'drainage_layout')
        : 'not_applicable',
      owner: 'civil_engineer',
    },
    {
      id: 'draw-012',
      category: 'drawing_register',
      label: 'Fire plan',
      status:
        project.publicAccessOrAssembly ||
        project.occupancyType === 'public_assembly'
          ? drawingStatus(project, 'fire_plan')
          : 'not_applicable',
      owner: 'fire_consultant',
    },
    {
      id: 'draw-013',
      category: 'drawing_register',
      label: 'Energy calculation',
      status: project.envelopeEnergyImpact
        ? drawingStatus(project, 'energy_calculation')
        : 'not_applicable',
      owner: 'energy_consultant',
    },
  ];

  return checks;
}
