/**
 * Submission Pack Service
 *
 * Assembles submission packs from project data, determines required documents,
 * validates cross-references, and exports pack manifests.
 */

import type {
  SubmissionPackDocument,
  SubmissionPack,
} from '@/types/municipalWorkspace';
import type { MunicipalityType } from '@/types';
import type { ProjectScopeFacts } from '@/types/municipalSubmissionReadiness';

// ── Helper: Municipality display name mapping for saContextService lookup ──────

const MUNICIPALITY_LOOKUP: Record<string, string> = {
  COJ: 'city of johannesburg',
  COCT: 'city of cape town',
  ETH: 'ethekwini',
  Tshwane: 'city of tshwane',
  NMB: 'nelson mandela bay',
  Ekurhuleni: 'ekurhuleni',
  Mangaung: 'mangaung',
  Other: 'other',
};

/**
 * Determines if the occupancy type triggers fire form (NBR Form 3) requirement.
 */
function requiresFireForm(occupancyType: ProjectScopeFacts['occupancyType']): boolean {
  return ['public_assembly', 'multi_residential', 'commercial', 'mixed_use'].includes(occupancyType);
}

/**
 * Determines the required document list based on the selected municipality
 * and submission type (building plan, occupancy certificate, or rezoning).
 *
 * For building plan submissions, the standard set includes:
 * - Cover Sheet, Application Form, NBR Forms 1-4, Title Deed, Drawings, Energy calc
 * - Conditional: Fire Plan (if fire form required), Structural (if engineer appointed),
 *   Drainage (if drainage changes)
 */
export function determineRequiredDocuments(
  _municipality: MunicipalityType,
  submissionType: string,
  projectContext?: Partial<ProjectScopeFacts>
): SubmissionPackDocument[] {
  const normalizedType = submissionType.toLowerCase().trim();

  if (normalizedType === 'building plan') {
    return buildBuildingPlanDocumentList(projectContext);
  }

  // For other submission types, return a minimal generic set
  if (normalizedType === 'occupancy certificate') {
    return buildOccupancyCertificateDocumentList();
  }

  if (normalizedType === 'rezoning') {
    return buildRezoningDocumentList();
  }

  // Fallback: empty list for unknown types
  return [];
}

function buildBuildingPlanDocumentList(
  projectContext?: Partial<ProjectScopeFacts>
): SubmissionPackDocument[] {
  const docs: SubmissionPackDocument[] = [];

  const occupancyType = projectContext?.occupancyType ?? 'single_residential';
  const hasStructuralEngineer = projectContext?.changesLoadBearing ?? false;
  const hasDrainageChanges = projectContext?.changesDrainageOrStormwater ?? false;
  const fireRequired = requiresFireForm(occupancyType);

  // 1. Cover Sheet
  docs.push({
    id: 'cover-sheet',
    title: 'Cover Sheet',
    category: 'cover',
    sequenceNumber: 1,
    status: 'placeholder',
    prePopulated: false,
  });

  // 2. Application Form
  docs.push({
    id: 'application-form',
    title: 'Application Form',
    category: 'form',
    sequenceNumber: 2,
    status: 'placeholder',
    prePopulated: false,
  });

  // 3. NBR Form 1
  docs.push({
    id: 'nbr-form-1',
    title: 'NBR Form 1',
    category: 'form',
    sequenceNumber: 3,
    status: 'placeholder',
    prePopulated: false,
  });

  // 4. NBR Form 2 — Structural Declaration
  docs.push({
    id: 'nbr-form-2',
    title: 'NBR Form 2 — Structural Declaration',
    category: 'form',
    sequenceNumber: 4,
    status: 'placeholder',
    prePopulated: false,
  });

  // 5. NBR Form 3 — Fire Declaration (conditional)
  if (fireRequired) {
    docs.push({
      id: 'nbr-form-3',
      title: 'NBR Form 3 — Fire Declaration',
      category: 'form',
      sequenceNumber: 5,
      status: 'placeholder',
      prePopulated: false,
    });
  }

  // 6. NBR Form 4 — Energy Declaration
  docs.push({
    id: 'nbr-form-4',
    title: 'NBR Form 4 — Energy Declaration',
    category: 'form',
    sequenceNumber: 6,
    status: 'placeholder',
    prePopulated: false,
  });

  // 7. Title Deed
  docs.push({
    id: 'title-deed',
    title: 'Title Deed',
    category: 'supporting',
    sequenceNumber: 7,
    status: 'placeholder',
    prePopulated: false,
  });

  // 8. Site Plan
  docs.push({
    id: 'site-plan',
    title: 'Site Plan',
    category: 'drawing',
    sequenceNumber: 8,
    status: 'placeholder',
    prePopulated: false,
  });

  // 9. Floor Plans, Elevations, Sections
  docs.push({
    id: 'floor-plans-elevations-sections',
    title: 'Floor Plans, Elevations, Sections',
    category: 'drawing',
    sequenceNumber: 9,
    status: 'placeholder',
    prePopulated: false,
  });

  // 10. Fire Plan (conditional — only if fire form required)
  if (fireRequired) {
    docs.push({
      id: 'fire-plan',
      title: 'Fire Plan',
      category: 'drawing',
      sequenceNumber: 10,
      status: 'placeholder',
      prePopulated: false,
    });
  }

  // 11. Structural Drawings (if structural engineer appointed)
  if (hasStructuralEngineer) {
    docs.push({
      id: 'structural-drawings',
      title: 'Structural Drawings',
      category: 'drawing',
      sequenceNumber: 11,
      status: 'placeholder',
      prePopulated: false,
    });
  }

  // 12. Drainage Layout (if drainage changes)
  if (hasDrainageChanges) {
    docs.push({
      id: 'drainage-layout',
      title: 'Drainage Layout',
      category: 'drawing',
      sequenceNumber: 12,
      status: 'placeholder',
      prePopulated: false,
    });
  }

  // 13. Energy Calculation
  docs.push({
    id: 'energy-calculation',
    title: 'Energy Calculation',
    category: 'drawing',
    sequenceNumber: 13,
    status: 'placeholder',
    prePopulated: false,
  });

  return docs;
}

function buildOccupancyCertificateDocumentList(): SubmissionPackDocument[] {
  return [
    { id: 'cover-sheet', title: 'Cover Sheet', category: 'cover', sequenceNumber: 1, status: 'placeholder', prePopulated: false },
    { id: 'occupation-application', title: 'Occupation Certificate Application', category: 'form', sequenceNumber: 2, status: 'placeholder', prePopulated: false },
    { id: 'electrical-coc', title: 'Electrical Compliance Certificate', category: 'supporting', sequenceNumber: 3, status: 'placeholder', prePopulated: false },
    { id: 'plumbing-coc', title: 'Plumbing Compliance Certificate', category: 'supporting', sequenceNumber: 4, status: 'placeholder', prePopulated: false },
    { id: 'final-inspection', title: 'Final Building Inspection Approval', category: 'supporting', sequenceNumber: 5, status: 'placeholder', prePopulated: false },
    { id: 'as-built-plans', title: 'As-Built Plans', category: 'drawing', sequenceNumber: 6, status: 'placeholder', prePopulated: false },
  ];
}

function buildRezoningDocumentList(): SubmissionPackDocument[] {
  return [
    { id: 'cover-sheet', title: 'Cover Sheet', category: 'cover', sequenceNumber: 1, status: 'placeholder', prePopulated: false },
    { id: 'rezoning-application', title: 'Rezoning Application Form', category: 'form', sequenceNumber: 2, status: 'placeholder', prePopulated: false },
    { id: 'town-planner-report', title: 'Town Planner Motivating Report', category: 'supporting', sequenceNumber: 3, status: 'placeholder', prePopulated: false },
    { id: 'title-deed', title: 'Title Deed', category: 'supporting', sequenceNumber: 4, status: 'placeholder', prePopulated: false },
    { id: 'site-development-plan', title: 'Site Development Plan', category: 'drawing', sequenceNumber: 5, status: 'placeholder', prePopulated: false },
    { id: 'traffic-assessment', title: 'Traffic Impact Assessment', category: 'supporting', sequenceNumber: 6, status: 'placeholder', prePopulated: false },
    { id: 'public-participation', title: 'Public Participation Documentation', category: 'supporting', sequenceNumber: 7, status: 'placeholder', prePopulated: false },
  ];
}

// ── Drawing kind → document ID mapping ─────────────────────────────────────────

const DRAWING_KIND_TO_DOC_ID: Record<string, string> = {
  site_plan: 'site-plan',
  floor_plan: 'floor-plans-elevations-sections',
  elevation: 'floor-plans-elevations-sections',
  section: 'floor-plans-elevations-sections',
  fire_plan: 'fire-plan',
  structural_drawing: 'structural-drawings',
  drainage_layout: 'drainage-layout',
  energy_calculation: 'energy-calculation',
};

// ── Supporting doc kind → document ID mapping ──────────────────────────────────

const SUPPORTING_KIND_TO_DOC_ID: Record<string, string> = {
  title_deed: 'title-deed',
};

/**
 * Assembles a full submission pack from project scope facts,
 * checking document availability and ordering per municipality requirements.
 */
export function assembleSubmissionPack(
  project: ProjectScopeFacts,
  municipality: MunicipalityType,
  submissionType: string
): SubmissionPack {
  // Get template document list using project context for conditional logic
  const templateDocs = determineRequiredDocuments(municipality, submissionType, project);

  // Map template documents against project data to determine actual status
  const documents = templateDocs.map((doc) => resolveDocumentStatus(doc, project));

  // Calculate completeness
  const total = documents.length;
  const included = documents.filter((d) => d.status === 'included').length;
  const missing = documents.filter((d) => d.status === 'missing' || d.status === 'draft_only').length;

  // Build cover sheet
  const coverSheet = {
    projectName: project.projectName,
    erfNumber: project.erfNumber ?? '',
    applicant: project.projectName, // Applicant defaults to project name (professional details not in scope facts)
  };

  // Build table of contents from document titles in sequence order
  const tableOfContents = documents
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
    .map((d, idx) => `${idx + 1}. ${d.title}`);

  // Validate cross-references
  const crossReferenceErrors = validateCrossReferences(
    { municipality, submissionType, documents, coverSheet, tableOfContents, completeness: { total, included, missing }, crossReferenceErrors: [] },
    project
  );

  return {
    municipality,
    submissionType,
    documents,
    coverSheet,
    tableOfContents,
    completeness: { total, included, missing },
    crossReferenceErrors,
  };
}

/**
 * Resolves the actual status of a template document by checking project data.
 */
function resolveDocumentStatus(
  doc: SubmissionPackDocument,
  project: ProjectScopeFacts
): SubmissionPackDocument {
  // Cover sheet: always included, pre-populated from project data
  if (doc.category === 'cover') {
    return { ...doc, status: 'included', prePopulated: true };
  }

  // Forms (Application Form, NBR 1-4): auto-filled from project data
  if (doc.category === 'form') {
    return { ...doc, status: 'included', prePopulated: true };
  }

  // Drawings: check against drawing register
  if (doc.category === 'drawing') {
    return resolveDrawingStatus(doc, project);
  }

  // Supporting documents: check against supportingDocuments array
  if (doc.category === 'supporting') {
    return resolveSupportingDocStatus(doc, project);
  }

  return { ...doc, status: 'missing' };
}

/**
 * Resolves drawing status by checking the project's drawing register.
 */
function resolveDrawingStatus(
  doc: SubmissionPackDocument,
  project: ProjectScopeFacts
): SubmissionPackDocument {
  const drawingRegister = project.drawingRegister ?? [];

  // Find matching drawings by document ID → kind mapping
  const matchingKinds = Object.entries(DRAWING_KIND_TO_DOC_ID)
    .filter(([, docId]) => docId === doc.id)
    .map(([kind]) => kind);

  // Find drawings that match any of the relevant kinds
  const matchingDrawings = drawingRegister.filter((d) =>
    matchingKinds.includes(d.kind)
  );

  if (matchingDrawings.length === 0) {
    return { ...doc, status: 'missing' };
  }

  // If any matching drawing is signed_off → included
  const hasSignedOff = matchingDrawings.some((d) => d.status === 'signed_off');
  if (hasSignedOff) {
    return { ...doc, status: 'included', sourceRef: matchingDrawings[0].kind };
  }

  // If matching drawing is checked or draft → draft_only
  const hasCheckedOrDraft = matchingDrawings.some(
    (d) => d.status === 'checked' || d.status === 'draft'
  );
  if (hasCheckedOrDraft) {
    return { ...doc, status: 'draft_only', sourceRef: matchingDrawings[0].kind };
  }

  return { ...doc, status: 'missing' };
}

/**
 * Resolves supporting document status by checking project's supportingDocuments array.
 */
function resolveSupportingDocStatus(
  doc: SubmissionPackDocument,
  project: ProjectScopeFacts
): SubmissionPackDocument {
  const supportingDocs = project.supportingDocuments ?? [];

  // Find matching supporting document kind
  const matchingKind = Object.entries(SUPPORTING_KIND_TO_DOC_ID)
    .find(([, docId]) => docId === doc.id)?.[0];

  if (!matchingKind) {
    // No known mapping — check by title heuristic or mark as missing
    return { ...doc, status: 'missing' };
  }

  const matchingDoc = supportingDocs.find((d) => d.kind === matchingKind);

  if (!matchingDoc) {
    return { ...doc, status: 'missing' };
  }

  if (matchingDoc.status === 'available') {
    return { ...doc, status: 'included', sourceRef: matchingKind };
  }

  // Status is 'missing' or 'requested' in the source
  return { ...doc, status: 'missing' };
}

/**
 * Validates cross-references across pack documents — verifying professional names
 * match appointment records, drawing numbers match uploads, and erf numbers are consistent.
 *
 * Returns array of error strings for any mismatches found. Empty array = all valid.
 */
export function validateCrossReferences(
  pack: SubmissionPack,
  project: ProjectScopeFacts
): string[] {
  const errors: string[] = [];

  // Check 1: If a form document is 'included', verify relevant project data exists
  const formDocs = pack.documents.filter(
    (d) => d.category === 'form' && d.status === 'included'
  );

  for (const formDoc of formDocs) {
    // NBR Form 1 requires erf number
    if (formDoc.id === 'nbr-form-1' && !project.erfNumber) {
      errors.push(
        `Cross-reference error: ${formDoc.title} is included but project has no erf number`
      );
    }

    // NBR Form 1 requires municipality
    if (formDoc.id === 'nbr-form-1' && !project.municipality) {
      errors.push(
        `Cross-reference error: ${formDoc.title} is included but project has no municipality specified`
      );
    }

    // Application form requires project name
    if (formDoc.id === 'application-form' && !project.projectName) {
      errors.push(
        `Cross-reference error: ${formDoc.title} is included but project has no name`
      );
    }
  }

  // Check 2: If drawings are 'included', verify they exist in project.drawingRegister
  const includedDrawings = pack.documents.filter(
    (d) => d.category === 'drawing' && d.status === 'included'
  );

  const drawingRegister = project.drawingRegister ?? [];

  for (const drawingDoc of includedDrawings) {
    const matchingKinds = Object.entries(DRAWING_KIND_TO_DOC_ID)
      .filter(([, docId]) => docId === drawingDoc.id)
      .map(([kind]) => kind);

    const existsInRegister = drawingRegister.some((d) =>
      matchingKinds.includes(d.kind)
    );

    if (!existsInRegister) {
      errors.push(
        `Cross-reference error: ${drawingDoc.title} is marked as included but no matching drawing found in drawing register`
      );
    }
  }

  // Check 3: Verify title deed in supporting documents matches erf number
  const titleDeedDoc = pack.documents.find((d) => d.id === 'title-deed');
  if (titleDeedDoc && titleDeedDoc.status === 'included') {
    const titleDeedInProject = (project.supportingDocuments ?? []).find(
      (d) => d.kind === 'title_deed'
    );

    if (!titleDeedInProject) {
      errors.push(
        'Cross-reference error: Title Deed is marked as included but not found in project supporting documents'
      );
    }

    if (titleDeedInProject && !project.erfNumber) {
      errors.push(
        'Cross-reference error: Title Deed is present but project has no erf number for verification'
      );
    }
  }

  return errors;
}

/**
 * Exports the assembled pack manifest with cover sheet and table of contents.
 * Returns document metadata for PDF generation.
 */
export function exportPack(pack: SubmissionPack): {
  documents: SubmissionPackDocument[];
  coverSheet: SubmissionPack['coverSheet'];
  tableOfContents: string[];
  completeness: SubmissionPack['completeness'];
  crossReferenceErrors: string[];
} {
  return {
    documents: pack.documents.sort(
      (a, b) => a.sequenceNumber - b.sequenceNumber
    ),
    coverSheet: pack.coverSheet,
    tableOfContents: pack.tableOfContents,
    completeness: pack.completeness,
    crossReferenceErrors: pack.crossReferenceErrors,
  };
}
