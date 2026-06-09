/**
 * NBR / SANS 10400 Pre-check Service
 * Advisory prompts per SANS part (A through XA).
 * Flags potential issues for professional review — NOT formal compliance.
 *
 * Part of Pack 6: Municipal Submission Readiness
 */
import type {
  ProjectScopeFacts,
  ReadinessCheck,
} from '@/types/municipalSubmissionReadiness';

/**
 * Build NBR/SANS 10400 advisory pre-check readiness checks.
 * These are advisory prompts flagged for professional review.
 * They do NOT self-certify statutory compliance.
 */
export function buildNbrSansPrechecks(
  project: ProjectScopeFacts
): ReadinessCheck[] {
  return [
    // ── Part A: General Principles & Occupancy ──
    {
      id: 'nbr-001',
      category: 'nbr_sans_advisory_precheck',
      label: `Occupancy classification captured: ${project.occupancyType.replace(/_/g, ' ')}`,
      status: 'requires_professional_review',
      owner: 'lead_professional',
    },
    {
      id: 'nbr-002',
      category: 'nbr_sans_advisory_precheck',
      label: 'Alteration/additions classification — confirm NBR Part A application',
      status:
        project.alterationToExisting || project.additions
          ? 'requires_professional_review'
          : 'not_applicable',
      owner: 'lead_professional',
    },

    // ── Part B: Structural Design ──
    {
      id: 'nbr-010',
      category: 'nbr_sans_advisory_precheck',
      label: 'Structural adequacy review (SANS 10400-B)',
      status: project.changesLoadBearing
        ? 'requires_professional_review'
        : 'not_applicable',
      owner: 'structural_engineer',
    },

    // ── Part C: Dimensions ──
    {
      id: 'nbr-011',
      category: 'nbr_sans_advisory_precheck',
      label: 'Room dimensions and habitable space compliance (SANS 10400-C)',
      status: 'requires_professional_review',
      owner: 'architect',
    },

    // ── Part D: Public Safety ──
    {
      id: 'nbr-012',
      category: 'nbr_sans_advisory_precheck',
      label: 'Public safety / access review (SANS 10400-D)',
      status:
        project.publicAccessOrAssembly ||
        project.occupancyType === 'public_assembly'
          ? 'requires_professional_review'
          : 'not_applicable',
      owner: 'architect',
    },

    // ── Part F: Site Operations ──
    {
      id: 'nbr-020',
      category: 'nbr_sans_advisory_precheck',
      label: 'Site operations / demolition safety (SANS 10400-F)',
      status: project.alterationToExisting
        ? 'requires_professional_review'
        : 'not_applicable',
      owner: 'architect',
    },

    // ── Part G: Excavations ──
    {
      id: 'nbr-021',
      category: 'nbr_sans_advisory_precheck',
      label: 'Excavations and earthworks review (SANS 10400-G)',
      status: project.changesDrainageOrStormwater
        ? 'requires_professional_review'
        : 'not_applicable',
      owner: 'civil_engineer',
    },

    // ── Part H: Foundations ──
    {
      id: 'nbr-022',
      category: 'nbr_sans_advisory_precheck',
      label: 'Foundation design review (SANS 10400-H)',
      status: project.newBuild || project.changesLoadBearing
        ? 'requires_professional_review'
        : 'not_applicable',
      owner: 'structural_engineer',
    },

    // ── Part J: Floors ──
    {
      id: 'nbr-023',
      category: 'nbr_sans_advisory_precheck',
      label: 'Floor construction review (SANS 10400-J)',
      status: project.newBuild
        ? 'requires_professional_review'
        : 'not_applicable',
      owner: 'structural_engineer',
    },

    // ── Part K: Walls ──
    {
      id: 'nbr-024',
      category: 'nbr_sans_advisory_precheck',
      label: 'Wall construction review (SANS 10400-K)',
      status: project.changesLoadBearing
        ? 'requires_professional_review'
        : 'not_applicable',
      owner: 'structural_engineer',
    },

    // ── Part L: Roofs ──
    {
      id: 'nbr-025',
      category: 'nbr_sans_advisory_precheck',
      label: 'Roof assembly review (SANS 10400-L)',
      status: project.newBuild || project.alterationToExisting
        ? 'requires_professional_review'
        : 'not_applicable',
      owner: 'structural_engineer',
    },

    // ── Part O: Lighting & Ventilation ──
    {
      id: 'nbr-030',
      category: 'nbr_sans_advisory_precheck',
      label: 'Natural lighting and ventilation review (SANS 10400-O)',
      status: 'requires_professional_review',
      owner: 'architect',
    },

    // ── Part P: Drainage ──
    {
      id: 'nbr-031',
      category: 'nbr_sans_advisory_precheck',
      label: 'Drainage/stormwater/services review (SANS 10400-P)',
      status: project.changesDrainageOrStormwater
        ? 'requires_professional_review'
        : 'not_applicable',
      owner: 'civil_engineer',
    },

    // ── Part R: Stormwater Disposal ──
    {
      id: 'nbr-032',
      category: 'nbr_sans_advisory_precheck',
      label: 'Stormwater disposal review (SANS 10400-R)',
      status: project.changesDrainageOrStormwater
        ? 'requires_professional_review'
        : 'not_applicable',
      owner: 'civil_engineer',
    },

    // ── Part T: Fire Protection ──
    {
      id: 'nbr-040',
      category: 'nbr_sans_advisory_precheck',
      label: 'Fire/life-safety review (SANS 10400-T)',
      status:
        project.publicAccessOrAssembly ||
        project.occupancyType === 'public_assembly'
          ? 'requires_professional_review'
          : 'not_applicable',
      owner: 'fire_consultant',
    },

    // ── Part V: Space Heating ──
    {
      id: 'nbr-041',
      category: 'nbr_sans_advisory_precheck',
      label: 'Space heating / HVAC review (SANS 10400-V)',
      status: project.envelopeEnergyImpact
        ? 'requires_professional_review'
        : 'not_applicable',
      owner: 'energy_consultant',
    },

    // ── Part X: Environmental Sustainability ──
    {
      id: 'nbr-042',
      category: 'nbr_sans_advisory_precheck',
      label: 'Environmental sustainability review (SANS 10400-X)',
      status: 'optional' as any,
      owner: 'lead_professional',
    },

    // ── Part XA: Energy Usage ──
    {
      id: 'nbr-050',
      category: 'nbr_sans_advisory_precheck',
      label: 'SANS 10400-XA energy review (fenestration, envelope, hot water)',
      status: project.envelopeEnergyImpact
        ? 'requires_professional_review'
        : 'not_applicable',
      owner: 'energy_consultant',
    },
  ];
}
