/**
 * Readiness Check Service
 *
 * Evaluates project readiness for key lifecycle gates:
 * municipal submission, tender pack, construction issue, closeout pack,
 * approval letter presence, and warranty document checks.
 *
 * @module documents_drawing_intelligence
 */

import type {
  Discipline,
  DocumentRecord,
  DrawingRecord,
  ReadinessFinding,
  ReadinessReport,
  SheetType,
} from '@/types/documentTypes';
import { revisionFindings } from './revisionControlService';

// ── Required Sheet Configurations ────────────────────────────────────────────

const REQUIRED_MUNICIPAL_SHEETS: SheetType[] = ['site_plan', 'floor_plan', 'section', 'elevation'];
const REQUIRED_TENDER_SHEETS: SheetType[] = ['floor_plan', 'section', 'elevation'];
const REQUIRED_CONSTRUCTION_SHEETS: SheetType[] = ['floor_plan', 'section', 'elevation', 'detail', 'schedule'];
const REQUIRED_AS_BUILT_SHEETS: SheetType[] = ['site_plan', 'floor_plan', 'section', 'elevation', 'detail'];

// ── Municipal Submission Readiness ───────────────────────────────────────────

export function municipalSubmissionReadiness(
  documents: DocumentRecord[],
  drawings: DrawingRecord[],
): ReadinessReport {
  const findings: ReadinessFinding[] = [];

  // Check for required sheet types
  addMissingSheets(
    findings,
    drawings,
    REQUIRED_MUNICIPAL_SHEETS,
    'for_municipal_submission',
    'MUNICIPAL_SHEET_MISSING',
  );

  // Check for municipal form
  const hasMunicipalForm = documents.some(
    (doc) =>
      doc.documentType === 'municipal_form' &&
      ['approved', 'issued'].includes(doc.status),
  );
  if (!hasMunicipalForm) {
    findings.push({
      code: 'MUNICIPAL_FORM_NOT_READY',
      priority: 'high',
      message: 'Municipal application form is not approved/issued.',
      assignedRoles: ['architect', 'client_developer', 'admin'],
    });
  }

  // Check for approval letter
  const hasApprovalLetter = documents.some(
    (doc) =>
      doc.documentType === 'approval_letter' &&
      ['approved', 'issued'].includes(doc.status),
  );
  if (!hasApprovalLetter) {
    findings.push({
      code: 'APPROVAL_LETTER_MISSING',
      priority: 'medium',
      message: 'No municipal approval letter is on record for this submission.',
      assignedRoles: ['architect', 'client_developer'],
    });
  }

  // Check discipline coverage for municipal submission
  const requiredDisciplines: Discipline[] = ['architectural', 'structural', 'civil', 'fire'];
  for (const discipline of requiredDisciplines) {
    const hasDiscipline = drawings.some(
      (d) =>
        d.discipline === discipline &&
        d.issuePurpose === 'for_municipal_submission' &&
        d.status === 'issued',
    );
    if (!hasDiscipline) {
      findings.push({
        code: 'DISCIPLINE_DRAWING_MISSING',
        priority: 'medium',
        message: `No issued ${discipline} drawings for municipal submission.`,
        assignedRoles: ['architect', 'admin'],
      });
    }
  }

  return {
    checkName: 'municipal_submission',
    ready: findings.length === 0,
    findings,
  };
}

// ── Tender Pack Readiness ────────────────────────────────────────────────────

export function tenderPackReadiness(
  documents: DocumentRecord[],
  drawings: DrawingRecord[],
): ReadinessReport {
  const findings: ReadinessFinding[] = [];

  addMissingSheets(
    findings,
    drawings,
    REQUIRED_TENDER_SHEETS,
    'for_tender',
    'TENDER_SHEET_MISSING',
  );

  // Tender specification must be issued
  const specReady = documents.some(
    (doc) =>
      doc.documentType === 'specification' &&
      doc.issuePurpose === 'for_tender' &&
      doc.status === 'issued',
  );
  if (!specReady) {
    findings.push({
      code: 'TENDER_SPECIFICATION_NOT_ISSUED',
      priority: 'high',
      message: 'Tender specification is not issued.',
      assignedRoles: ['architect', 'quantity_surveyor', 'admin'],
    });
  }

  // Tender drawings must be issued
  const tenderDrawings = drawings.filter(
    (d) => d.issuePurpose === 'for_tender' && d.status === 'issued',
  );
  if (tenderDrawings.length === 0) {
    findings.push({
      code: 'NO_TENDER_DRAWINGS_ISSUED',
      priority: 'high',
      message: 'No issued-for-tender drawings found.',
      assignedRoles: ['architect', 'admin'],
    });
  }

  // Tender pack document
  const hasTenderPack = documents.some(
    (doc) =>
      doc.documentType === 'tender_pack' &&
      ['approved', 'issued'].includes(doc.status),
  );
  if (!hasTenderPack) {
    findings.push({
      code: 'TENDER_PACK_NOT_ISSUED',
      priority: 'medium',
      message: 'Tender pack document is not approved/issued.',
      assignedRoles: ['architect', 'quantity_surveyor', 'admin'],
    });
  }

  return {
    checkName: 'tender_pack',
    ready: findings.length === 0,
    findings,
  };
}

// ── Construction Issue Readiness ─────────────────────────────────────────────

export function constructionIssueReadiness(drawings: DrawingRecord[]): ReadinessReport {
  const findings: ReadinessFinding[] = [];

  // Include superseded drawing findings
  findings.push(...revisionFindings(drawings));

  // Check for current construction drawings
  const currentConstruction = drawings.filter(
    (d) => d.issuePurpose === 'for_construction' && d.status === 'issued',
  );
  if (currentConstruction.length === 0) {
    findings.push({
      code: 'NO_CURRENT_CONSTRUCTION_DRAWINGS',
      priority: 'critical',
      message: 'No current issued-for-construction drawings found.',
      assignedRoles: ['architect', 'contractor', 'admin'],
    });
  }

  // Check required sheet types for construction
  addMissingSheets(
    findings,
    drawings,
    REQUIRED_CONSTRUCTION_SHEETS,
    'for_construction',
    'CONSTRUCTION_SHEET_MISSING',
  );

  return {
    checkName: 'construction_issue',
    ready: findings.length === 0,
    findings,
  };
}

// ── Closeout Pack Readiness ──────────────────────────────────────────────────

export function closeoutPackReadiness(
  documents: DocumentRecord[],
  drawings: DrawingRecord[],
): ReadinessReport {
  const findings: ReadinessFinding[] = [];

  // Closeout pack document check
  const closeoutPackReady = documents.some(
    (doc) =>
      doc.documentType === 'closeout_pack' &&
      doc.status === 'issued',
  );
  if (!closeoutPackReady) {
    findings.push({
      code: 'CLOSEOUT_PACK_NOT_ISSUED',
      priority: 'high',
      message: 'Closeout pack is not issued.',
      assignedRoles: ['contractor', 'architect', 'client_developer', 'admin'],
    });
  }

  // As-built drawings check
  const asBuiltDrawings = drawings.filter(
    (d) => d.issuePurpose === 'as_built' && d.status === 'issued',
  );
  if (asBuiltDrawings.length === 0) {
    findings.push({
      code: 'AS_BUILT_DRAWINGS_MISSING',
      priority: 'medium',
      message: 'No issued as-built drawings found for closeout.',
      assignedRoles: ['architect', 'contractor', 'admin'],
    });
  } else {
    // Check required sheet types for as-built
    addMissingSheets(
      findings,
      drawings,
      REQUIRED_AS_BUILT_SHEETS,
      'as_built',
      'AS_BUILT_SHEET_MISSING',
    );
  }

  // Closeout certificate check
  const hasCloseoutCertificate = documents.some(
    (doc) =>
      doc.documentType === 'closeout_certificate' &&
      ['approved', 'issued'].includes(doc.status),
  );
  if (!hasCloseoutCertificate) {
    findings.push({
      code: 'CLOSEOUT_CERTIFICATE_MISSING',
      priority: 'medium',
      message: 'No closeout certificate on record.',
      assignedRoles: ['architect', 'contractor', 'admin'],
    });
  }

  return {
    checkName: 'closeout_pack',
    ready: findings.length === 0,
    findings,
  };
}

// ── Approval Letter Readiness ────────────────────────────────────────────────

export function approvalLetterReadiness(documents: DocumentRecord[]): ReadinessReport {
  const findings: ReadinessFinding[] = [];

  const hasApprovalLetter = documents.some(
    (doc) =>
      doc.documentType === 'approval_letter' &&
      ['approved', 'issued'].includes(doc.status),
  );

  if (!hasApprovalLetter) {
    findings.push({
      code: 'APPROVAL_LETTER_MISSING',
      priority: 'high',
      message: 'Municipal approval letter is missing. Submission cannot proceed without approval confirmation.',
      assignedRoles: ['architect', 'client_developer', 'admin'],
    });
  }

  return {
    checkName: 'approval_letter',
    ready: findings.length === 0,
    findings,
  };
}

// ── Warranty Readiness ───────────────────────────────────────────────────────

export function warrantyReadiness(documents: DocumentRecord[]): ReadinessReport {
  const findings: ReadinessFinding[] = [];

  const hasWarranty = documents.some(
    (doc) =>
      doc.documentType === 'warranty' &&
      ['approved', 'issued'].includes(doc.status),
  );

  if (!hasWarranty) {
    findings.push({
      code: 'WARRANTY_DOCUMENT_MISSING',
      priority: 'medium',
      message: 'No warranty documents on record. Required for closeout handover.',
      assignedRoles: ['contractor', 'client_developer', 'admin'],
    });
  }

  return {
    checkName: 'warranty',
    ready: findings.length === 0,
    findings,
  };
}

// ── All Reports ──────────────────────────────────────────────────────────────

export function allReadinessReports(
  documents: DocumentRecord[],
  drawings: DrawingRecord[],
): ReadinessReport[] {
  return [
    municipalSubmissionReadiness(documents, drawings),
    tenderPackReadiness(documents, drawings),
    constructionIssueReadiness(drawings),
    closeoutPackReadiness(documents, drawings),
    approvalLetterReadiness(documents),
    warrantyReadiness(documents),
  ];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function addMissingSheets(
  findings: ReadinessFinding[],
  drawings: DrawingRecord[],
  sheetTypes: SheetType[],
  issuePurpose: DrawingRecord['issuePurpose'],
  code: string,
): void {
  for (const sheetType of sheetTypes) {
    const present = drawings.some(
      (d) =>
        d.sheetType === sheetType &&
        d.issuePurpose === issuePurpose &&
        d.status === 'issued',
    );
    if (!present) {
      findings.push({
        code,
        priority: 'medium',
        message: `Missing issued ${sheetType} drawing for ${issuePurpose.replace(/_/g, ' ')}.`,
        assignedRoles: ['architect', 'admin'],
      });
    }
  }
}
