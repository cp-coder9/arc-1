/**
 * South African Construction Context Service
 *
 * Pure utility functions for SA-specific construction context:
 * - SACAP Work Stage mapping from Architex 8-stage lifecycle
 * - NHBRC inspection stage documentation checklists (Stages 1–7)
 * - Municipal submission checklists by municipality and submission type
 *
 * All functions are deterministic — identical inputs produce identical outputs.
 * No side effects, no Firestore calls.
 *
 * @module commandCentre/saContextService
 */

// ── Types ────────────────────────────────────────────────────────────────────────

/** Architex OS 8-stage project lifecycle. */
export type ArchitexStage =
  | 'brief'
  | 'appoint'
  | 'design'
  | 'comply'
  | 'procure'
  | 'build'
  | 'pay'
  | 'closeout';

/** SACAP Work Stages (1–6). */
export type SACAPWorkStage =
  | 'Stage 1 - Inception'
  | 'Stage 2 - Concept & Viability'
  | 'Stage 3 - Design Development'
  | 'Stage 4 - Documentation & Procurement'
  | 'Stage 5 - Construction'
  | 'Stage 6 - Closeout';

/** NHBRC inspection stage number (1–7). */
export type NHBRCStageNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

// ── Constants ────────────────────────────────────────────────────────────────────

/**
 * Deterministic bijective mapping from Architex 8-stage lifecycle to SACAP Work Stages.
 *
 * Mapping rationale:
 * - Brief → Stage 1 (Inception): Project inception and client requirements
 * - Appoint → Stage 2 (Concept & Viability): Professional appointments, feasibility
 * - Design → Stage 3 (Design Development): Detailed design work
 * - Comply → Stage 4 (Documentation & Procurement): Documentation for regulatory compliance
 * - Procure → Stage 4 (Documentation & Procurement): Procurement falls under documentation phase
 * - Build → Stage 5 (Construction): Site execution
 * - Pay → Stage 5 (Construction): Payment certificates during construction
 * - Closeout → Stage 6 (Closeout): Project handover and closeout
 */
const ARCHITEX_TO_SACAP_MAP: Record<ArchitexStage, SACAPWorkStage> = {
  brief: 'Stage 1 - Inception',
  appoint: 'Stage 2 - Concept & Viability',
  design: 'Stage 3 - Design Development',
  comply: 'Stage 4 - Documentation & Procurement',
  procure: 'Stage 4 - Documentation & Procurement',
  build: 'Stage 5 - Construction',
  pay: 'Stage 5 - Construction',
  closeout: 'Stage 6 - Closeout',
};

/** All valid Architex stages for validation. */
const VALID_ARCHITEX_STAGES: ArchitexStage[] = [
  'brief',
  'appoint',
  'design',
  'comply',
  'procure',
  'build',
  'pay',
  'closeout',
];

/**
 * NHBRC inspection stage documentation checklists.
 *
 * Each stage has specific documentation requirements that must be satisfied
 * before the NHBRC inspector visits. These align with the NHBRC Home Building
 * Manual inspection schedule.
 */
const NHBRC_CHECKLISTS: Record<NHBRCStageNumber, string[]> = {
  1: [
    'Foundation excavation complete and open for inspection',
    'Soil classification report available',
    'Foundation design drawings on site',
    'Setting-out verified by land surveyor',
    'Building line and level pegs confirmed',
    'NHBRC enrolment certificate on site',
    'Approved building plans on site',
  ],
  2: [
    'Substructure walls completed to damp-proof course (DPC) level',
    'DPC membrane installed correctly',
    'Weep holes installed at correct spacing',
    'Subsoil drainage installed where required',
    'Compaction certificates for fill material',
    'Concrete cube test results for foundations',
    'Service penetrations sealed',
  ],
  3: [
    'Wall plate level confirmed',
    'Superstructure walls completed to wall plate level',
    'Lintels installed over all openings',
    'Window and door frames plumb and level',
    'Cavity ties installed at correct spacing',
    'Movement joints provided where required',
    'Brick force installed at required intervals',
  ],
  4: [
    'Roof structure complete and tied down',
    'Roof covering installed and watertight',
    'Timber treatment certificates for all roof timbers',
    'Truss design engineer certificate (ITC-SA A19)',
    'Fascia and barge boards installed',
    'Ridge and hip capping secure',
    'Roof ventilation provided per SANS 10400-K',
  ],
  5: [
    'Waterproofing membrane applied to wet areas',
    'Waterproofing test conducted (48-hour flood test)',
    'Waterproofing guarantee certificate from applicator',
    'Flashing installed at all roof-wall junctions',
    'DPC below shower trays and baths',
    'External wall waterproofing complete where required',
    'Window sills sloped away from building',
  ],
  6: [
    'Internal plastering complete',
    'Tiling complete in wet areas',
    'Paint system complete (primer + topcoats)',
    'Plumbing fixtures installed and tested',
    'Electrical installation certificate (CoC) issued',
    'Glazing complete with safety glass where required',
    'Floor finishes installed and level',
  ],
  7: [
    'All defects from previous inspections rectified',
    'Occupancy certificate applied for / obtained',
    'As-built drawings available',
    'Electrical compliance certificate (CoC) on file',
    'Plumbing compliance certificate on file',
    'Gas compliance certificate on file (if applicable)',
    'NHBRC final inspection request submitted',
    'Owner handover documentation pack prepared',
    'Warranty documentation provided to owner',
  ],
};

/**
 * Municipal submission checklists by municipality and submission type.
 *
 * Covers common South African municipalities and submission types.
 * Falls back to a generic checklist for unknown municipalities.
 */
const MUNICIPAL_CHECKLISTS: Record<string, Record<string, string[]>> = {
  'city of cape town': {
    'building plan': [
      'Completed application form (TC1)',
      'Title deed or proof of ownership',
      'Site plan (1:500) showing building lines and setbacks',
      'Floor plans, elevations, and sections (1:100)',
      'Site development plan',
      'Structural engineer design (if required)',
      'SANS 10400-XA energy compliance report',
      'Stormwater management plan',
      'Geo-technical report (if required by soil conditions)',
      'Payment of plan fees',
    ],
    'occupancy certificate': [
      'Completed occupation certificate application',
      'Electrical compliance certificate (CoC)',
      'Plumbing compliance certificate',
      'Final building inspection approval',
      'As-built plans (if deviations from approved plans)',
      'Fire compliance certificate (if applicable)',
      'Lift inspection certificate (if applicable)',
    ],
    'rezoning': [
      'Completed rezoning application form',
      'Motivating memorandum from town planner',
      'Title deed',
      'Power of attorney (if applicant is not owner)',
      'Site development plan showing proposed use',
      'Traffic impact assessment (if required)',
      'Environmental impact assessment (if required)',
      'Heritage impact assessment (if in heritage area)',
      'Public participation process documentation',
    ],
  },
  'city of johannesburg': {
    'building plan': [
      'Completed application form',
      'Title deed or ownership proof',
      'Site plan with building lines and contours',
      'Architectural drawings (plans, elevations, sections)',
      'Structural engineer drawings and letter',
      'SANS 10400-XA energy compliance',
      'Soil investigation report (Highveld dolomite areas)',
      'Dolomite risk assessment (if in dolomite area)',
      'Stormwater attenuation design',
      'Payment of scrutiny fees',
    ],
    'occupancy certificate': [
      'Building completion notification',
      'Electrical compliance certificate (CoC)',
      'Plumbing compliance certificate',
      'Final inspection by building inspector',
      'Fire department clearance (commercial/industrial)',
      'As-built plans for any approved deviations',
    ],
    'rezoning': [
      'Completed application (Form A)',
      'Town planner motivating report',
      'Title deed and SG diagram',
      'Site development plan',
      'Traffic impact assessment',
      'Environmental authorisation (if triggered)',
      'Notification to neighbours (registered mail)',
      'Published newspaper notice',
      'Rates clearance certificate',
    ],
  },
  'ethekwini': {
    'building plan': [
      'Completed application form',
      'Title deed or proof of ownership',
      'Site plan (1:200 or 1:500)',
      'Floor plans, elevations, and sections',
      'Structural design and engineer letter',
      'SANS 10400-XA rational energy design',
      'Geotechnical investigation report',
      'Environmental authorisation (if in sensitive area)',
      'Stormwater management plan',
      'Plan scrutiny fee payment receipt',
    ],
    'occupancy certificate': [
      'Occupation certificate application',
      'Electrical CoC',
      'Plumbing CoC',
      'Building inspector final sign-off',
      'Fire department approval (if applicable)',
      'Environmental compliance (if conditions set)',
    ],
    'rezoning': [
      'Scheme amendment application form',
      'Professional town planner report',
      'Title deed and surveyor diagram',
      'Site development plan',
      'Traffic impact study (if traffic generating)',
      'Environmental screening report',
      'Neighbour notification proof',
      'Ward councillor engagement record',
    ],
  },
  'city of tshwane': {
    'building plan': [
      'Completed NRCS application form',
      'Title deed or ownership documentation',
      'Site plan with setbacks, building lines, and contours',
      'Architectural working drawings',
      'Structural engineer design documentation',
      'SANS 10400-XA energy calculations',
      'Geotechnical report (dolomite areas)',
      'Stormwater management plan',
      'Plan submission fees paid',
    ],
    'occupancy certificate': [
      'Occupation certificate application form',
      'Electrical compliance certificate',
      'Plumbing compliance certificate',
      'Final building inspection report',
      'Fire compliance (if applicable)',
      'As-built drawings (if any deviations)',
    ],
    'rezoning': [
      'Township establishment / rezoning application',
      'Town planner motivation report',
      'Title deed and SG diagram',
      'Site development plan',
      'Traffic impact assessment',
      'Environmental impact assessment (if required)',
      'Public participation proof',
      'Service availability letters (water, sewer, electricity)',
    ],
  },
};

/** Generic municipal submission checklist used as fallback. */
const GENERIC_MUNICIPAL_CHECKLISTS: Record<string, string[]> = {
  'building plan': [
    'Completed municipal application form',
    'Title deed or proof of ownership',
    'Site plan showing building lines, setbacks, and contours',
    'Architectural floor plans, elevations, and sections',
    'Structural engineer design (if applicable)',
    'SANS 10400-XA energy compliance documentation',
    'Geotechnical report (if required by soil conditions)',
    'Stormwater management plan',
    'Payment of plan scrutiny fees',
  ],
  'occupancy certificate': [
    'Occupation certificate application',
    'Electrical compliance certificate (CoC)',
    'Plumbing compliance certificate',
    'Final building inspection approval',
    'As-built plans (if deviations from approved plans)',
    'Fire compliance certificate (if applicable)',
  ],
  'rezoning': [
    'Rezoning / scheme amendment application form',
    'Town planner motivating memorandum',
    'Title deed and surveyor general diagram',
    'Site development plan',
    'Traffic impact assessment (if required)',
    'Environmental authorisation (if triggered)',
    'Public participation documentation',
  ],
};

// ── Public Functions ─────────────────────────────────────────────────────────────

/**
 * Map an Architex 8-stage lifecycle stage to the corresponding SACAP Work Stage.
 *
 * The mapping is deterministic — the same Architex stage always produces the
 * same SACAP Work Stage label. The mapping is surjective (multiple Architex
 * stages may map to the same SACAP stage) since SACAP has 6 stages while
 * Architex has 8.
 *
 * @param architexStage - One of the 8 Architex lifecycle stages
 * @returns The corresponding SACAP Work Stage label
 * @throws Error if the provided stage is not a valid Architex stage
 */
export function mapToSACAPStage(architexStage: ArchitexStage): SACAPWorkStage {
  if (!VALID_ARCHITEX_STAGES.includes(architexStage)) {
    throw new Error(
      `Invalid Architex stage "${architexStage}". Must be one of: ${VALID_ARCHITEX_STAGES.join(', ')}`,
    );
  }

  return ARCHITEX_TO_SACAP_MAP[architexStage];
}

/**
 * Get the NHBRC inspection documentation checklist for a given stage.
 *
 * NHBRC inspections cover 7 stages of residential construction:
 * 1. Foundation
 * 2. Substructure (to DPC level)
 * 3. Frame (superstructure to wall plate)
 * 4. Roof
 * 5. Waterproofing
 * 6. Finishes
 * 7. Practical Completion
 *
 * @param stage - NHBRC inspection stage number (1–7)
 * @returns Array of documentation checklist items for the specified stage
 * @throws Error if stage is not between 1 and 7 inclusive
 */
export function getNHBRCChecklist(stage: NHBRCStageNumber): string[] {
  if (!Number.isInteger(stage) || stage < 1 || stage > 7) {
    throw new Error(
      `Invalid NHBRC stage "${stage}". Must be an integer between 1 and 7.`,
    );
  }

  return [...NHBRC_CHECKLISTS[stage]];
}

/**
 * Get the municipal submission checklist for a given municipality and submission type.
 *
 * Returns a municipality-specific checklist where available, falling back to a
 * generic checklist for unknown municipalities. Submission types include:
 * - "building plan" — New building plan submission
 * - "occupancy certificate" — Occupancy/completion certificate application
 * - "rezoning" — Zoning/scheme amendment application
 *
 * @param municipality - Municipality name (case-insensitive)
 * @param type - Submission type (case-insensitive)
 * @returns Array of checklist items for the municipality and submission type
 * @throws Error if the submission type is not recognised
 */
export function getMunicipalSubmissionChecklist(
  municipality: string,
  type: string,
): string[] {
  const normalizedMunicipality = municipality.toLowerCase().trim();
  const normalizedType = type.toLowerCase().trim();

  // Try municipality-specific checklist first
  const municipalityChecklists = MUNICIPAL_CHECKLISTS[normalizedMunicipality];
  if (municipalityChecklists) {
    const checklist = municipalityChecklists[normalizedType];
    if (checklist) {
      return [...checklist];
    }
  }

  // Fall back to generic checklist
  const genericChecklist = GENERIC_MUNICIPAL_CHECKLISTS[normalizedType];
  if (genericChecklist) {
    return [...genericChecklist];
  }

  throw new Error(
    `Unknown submission type "${type}". Supported types: building plan, occupancy certificate, rezoning.`,
  );
}

/**
 * Get all valid Architex lifecycle stages.
 *
 * Utility for validation and iteration over the complete stage set.
 */
export function getArchitexStages(): ArchitexStage[] {
  return [...VALID_ARCHITEX_STAGES];
}

/**
 * Get all valid NHBRC inspection stage numbers.
 *
 * Utility for iteration over the 7 NHBRC inspection stages.
 */
export function getNHBRCStageNumbers(): NHBRCStageNumber[] {
  return [1, 2, 3, 4, 5, 6, 7];
}

/**
 * Get the NHBRC stage name for a given stage number.
 *
 * @param stage - NHBRC inspection stage number (1–7)
 * @returns Human-readable stage name
 */
export function getNHBRCStageLabel(stage: NHBRCStageNumber): string {
  const labels: Record<NHBRCStageNumber, string> = {
    1: 'Foundation',
    2: 'Substructure',
    3: 'Frame',
    4: 'Roof',
    5: 'Waterproofing',
    6: 'Finishes',
    7: 'Practical Completion',
  };

  if (!Number.isInteger(stage) || stage < 1 || stage > 7) {
    throw new Error(
      `Invalid NHBRC stage "${stage}". Must be an integer between 1 and 7.`,
    );
  }

  return labels[stage];
}

/**
 * Get supported municipalities that have specific checklists.
 *
 * @returns Array of municipality names with custom checklists available
 */
export function getSupportedMunicipalities(): string[] {
  return Object.keys(MUNICIPAL_CHECKLISTS);
}

/**
 * Get supported submission types.
 *
 * @returns Array of supported submission type names
 */
export function getSupportedSubmissionTypes(): string[] {
  return Object.keys(GENERIC_MUNICIPAL_CHECKLISTS);
}
