import type { DocumentRecord, DrawingRecord, ReadinessFinding, ReadinessReport, SheetType } from '@/services/documentRegisterService';
import { revisionFindings } from '@/services/revisionControlService';

const requiredMunicipalSheets: SheetType[] = ['site_plan', 'floor_plan', 'section', 'elevation'];
const requiredTenderSheets: SheetType[] = ['floor_plan', 'section', 'elevation'];

export function municipalSubmissionReadiness(documents: DocumentRecord[], drawings: DrawingRecord[]): ReadinessReport {
  const findings: ReadinessFinding[] = [];
  addMissingSheets(findings, drawings, requiredMunicipalSheets, 'for_municipal_submission', 'MUNICIPAL_SHEET_MISSING');
  const hasMunicipalForm = documents.some((doc) => doc.documentType === 'municipal_form' && ['approved', 'issued'].includes(doc.status));
  if (!hasMunicipalForm) findings.push({ code: 'MUNICIPAL_FORM_NOT_READY', priority: 'high', message: 'Municipal application form is not approved/issued.', assignedRoles: ['architect', 'client_developer', 'admin'] });
  return { checkName: 'municipal_submission', ready: findings.length === 0, findings };
}

export function tenderPackReadiness(documents: DocumentRecord[], drawings: DrawingRecord[]): ReadinessReport {
  const findings: ReadinessFinding[] = [];
  addMissingSheets(findings, drawings, requiredTenderSheets, 'for_tender', 'TENDER_SHEET_MISSING');
  const specReady = documents.some((doc) => doc.documentType === 'specification' && doc.issuePurpose === 'for_tender' && doc.status === 'issued');
  if (!specReady) findings.push({ code: 'TENDER_SPECIFICATION_NOT_ISSUED', priority: 'high', message: 'Tender specification is not issued.', assignedRoles: ['architect', 'quantity_surveyor', 'admin'] });
  return { checkName: 'tender_pack', ready: findings.length === 0, findings };
}

export function constructionIssueReadiness(drawings: DrawingRecord[]): ReadinessReport {
  const findings = revisionFindings(drawings);
  const currentConstruction = drawings.filter((drawing) => drawing.issuePurpose === 'for_construction' && drawing.status === 'issued');
  if (currentConstruction.length === 0) findings.push({ code: 'NO_CURRENT_CONSTRUCTION_DRAWINGS', priority: 'critical', message: 'No current issued-for-construction drawings found.', assignedRoles: ['architect', 'contractor', 'admin'] });
  return { checkName: 'construction_issue', ready: findings.length === 0, findings };
}

export function closeoutPackReadiness(documents: DocumentRecord[], drawings: DrawingRecord[]): ReadinessReport {
  const findings: ReadinessFinding[] = [];
  const closeoutPackReady = documents.some((doc) => doc.documentType === 'closeout_pack' && doc.status === 'issued');
  const asBuiltDrawings = drawings.some((drawing) => drawing.issuePurpose === 'as_built' && drawing.status === 'issued');
  if (!closeoutPackReady) findings.push({ code: 'CLOSEOUT_PACK_NOT_ISSUED', priority: 'high', message: 'Closeout pack is not issued.', assignedRoles: ['contractor', 'architect', 'client_developer', 'admin'] });
  if (!asBuiltDrawings) findings.push({ code: 'AS_BUILT_DRAWINGS_MISSING', priority: 'medium', message: 'No issued as-built drawings found for closeout.', assignedRoles: ['architect', 'contractor', 'admin'] });
  return { checkName: 'closeout_pack', ready: findings.length === 0, findings };
}

export function allReadinessReports(documents: DocumentRecord[], drawings: DrawingRecord[]): ReadinessReport[] {
  return [municipalSubmissionReadiness(documents, drawings), tenderPackReadiness(documents, drawings), constructionIssueReadiness(drawings), closeoutPackReadiness(documents, drawings)];
}

function addMissingSheets(findings: ReadinessFinding[], drawings: DrawingRecord[], sheetTypes: SheetType[], issuePurpose: DrawingRecord['issuePurpose'], code: string): void {
  for (const sheetType of sheetTypes) {
    const present = drawings.some((drawing) => drawing.sheetType === sheetType && drawing.issuePurpose === issuePurpose && drawing.status === 'issued');
    if (!present) findings.push({ code, priority: 'medium', message: `Missing issued ${sheetType} drawing for ${issuePurpose}.`, assignedRoles: ['architect', 'admin'] });
  }
}
