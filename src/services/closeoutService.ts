import { PDFDocument, PageSizes, StandardFonts, rgb } from 'pdf-lib';
import { collection, doc, getDoc, getDocs, query, runTransaction, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { uploadAndTrackFile } from '@/lib/uploadService';
import { getLedgerForProject } from './financialLedgerService';
import { transitionStage } from './projectLifecycleService';
import { Job, LedgerEntry, Project, ProjectTeamMember, TenderPackage } from '@/types';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
export interface ProjectSummary {
  project: Project;
  job: Job | null;
  teamMembers: ProjectTeamMember[];
  tenders: TenderPackage[];
  ledgerEntries: LedgerEntry[];
  budget: { planned: number; actualReleased: number; escrowHeld: number };
  timeline: { startedAt: string; currentStage: string; completedAt?: string };
  artifacts?: { completionCertificateUrl?: string; finalReport?: string; archivedAt?: string };
}

export const CLOSEOUT_ARTIFACTS_REQUIRED_ERROR = 'Cannot archive project: persisted completion certificate and final report artifacts are required.';
export const CLOSEOUT_GATE_REQUIRED_ERROR = 'Cannot archive project: close-out gate has unresolved blockers.';

export interface CloseoutGateAuditMetadata {
  reviewedBy?: string;
  reviewedAt?: string;
  source?: string;
}

export interface CloseoutGateValidationInput {
  snags?: Array<{ id?: string; title?: string; status?: string }>;
  certificates?: Array<{ id?: string; title?: string; status?: string; url?: string }>;
  warranties?: Array<{ id?: string; title?: string; status?: string; url?: string }>;
  finalAccount?: { status?: string; approvedBy?: string; approvedAt?: string; amount?: number };
  handoverPack?: { status?: string; url?: string; documentCount?: number; approvedBy?: string; approvedAt?: string };
  unresolvedBlockers?: string[];
  audit?: CloseoutGateAuditMetadata;
}

export interface CloseoutGateValidationResult {
  ready: boolean;
  blockers: string[];
  audit: { reviewedBy?: string; reviewedAt?: string; source: string };
}

export interface CloseoutSnagRecord {
  id: string;
  title: string;
  status?: string;
  trade?: string;
  subcontractorId?: string;
  dueDate?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical' | string;
  drawingRef?: string;
  evidenceUrls?: string[];
}

export interface SnagRectificationTask {
  snagId: string;
  title: string;
  assignedTo: string;
  trade: string;
  priority: 'normal' | 'high' | 'urgent';
  dueDate?: string;
  drawingRef?: string;
  requiresPhotoEvidence: boolean;
  paymentGate: 'blocked_until_evidence' | 'ready_for_professional_review';
  nextAction: string;
}

export type HandoverPackDocumentCategory = 'final_account' | 'safety_sheet' | 'compliance_certificate' | 'manufacturer_warranty' | 'manual' | 'as_built' | 'other';

export interface HandoverPackDocumentInput {
  id: string;
  title: string;
  category?: HandoverPackDocumentCategory | string;
  type?: string;
  status?: string;
  url?: string;
  packageId?: string;
  uploadedBy?: string;
  uploadedAt?: string;
}

export interface HandoverPackManifestItem extends HandoverPackDocumentInput {
  category: HandoverPackDocumentCategory;
  ready: boolean;
  blockers: string[];
}

export interface HandoverPackManifest {
  ready: boolean;
  items: HandoverPackManifestItem[];
  missingCategories: HandoverPackDocumentCategory[];
  blockers: string[];
  documentCount: number;
}

const CLOSED_SNAG_STATUSES = new Set(['closed', 'resolved', 'accepted']);
const ACCEPTED_DOCUMENT_STATUSES = new Set(['approved', 'accepted', 'closed', 'issued']);
const APPROVED_FINAL_ACCOUNT_STATUSES = new Set(['approved', 'accepted', 'settled', 'closed']);
const REQUIRED_HANDOVER_CATEGORIES: HandoverPackDocumentCategory[] = ['final_account', 'safety_sheet', 'compliance_certificate', 'manufacturer_warranty'];

function normaliseStatus(value?: string): string {
  return String(value ?? '').trim().toLowerCase();
}

function hasEvidence(urls?: string[]): boolean {
  return (urls ?? []).some((url) => typeof url === 'string' && url.trim().length > 0);
}

function priorityForSnag(snag: CloseoutSnagRecord, todayIso?: string): SnagRectificationTask['priority'] {
  const severity = normaliseStatus(snag.severity);
  if (severity === 'critical' || severity === 'high') return 'urgent';
  if (snag.dueDate && todayIso && snag.dueDate < todayIso) return 'urgent';
  if (severity === 'medium') return 'high';
  return 'normal';
}

function hasUsableUrl(value?: string): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function evaluateCloseoutGate(input: CloseoutGateValidationInput = {}): CloseoutGateValidationResult {
  const blockers: string[] = [];
  const unresolvedSnags = (input.snags ?? []).filter((snag) => !CLOSED_SNAG_STATUSES.has(String(snag.status ?? '').toLowerCase()));
  if (unresolvedSnags.length > 0) blockers.push(`${unresolvedSnags.length} snag${unresolvedSnags.length === 1 ? '' : 's'} unresolved.`);

  const certificates = input.certificates ?? [];
  if (certificates.length === 0) blockers.push('No close-out certificates recorded.');
  const incompleteCertificates = certificates.filter((certificate) => !ACCEPTED_DOCUMENT_STATUSES.has(String(certificate.status ?? '').toLowerCase()) || !hasUsableUrl(certificate.url));
  if (incompleteCertificates.length > 0) blockers.push(`${incompleteCertificates.length} certificate${incompleteCertificates.length === 1 ? '' : 's'} missing approval or file link.`);

  const warranties = input.warranties ?? [];
  if (warranties.length === 0) blockers.push('No warranties recorded.');
  const incompleteWarranties = warranties.filter((warranty) => !ACCEPTED_DOCUMENT_STATUSES.has(String(warranty.status ?? '').toLowerCase()) || !hasUsableUrl(warranty.url));
  if (incompleteWarranties.length > 0) blockers.push(`${incompleteWarranties.length} warranty record${incompleteWarranties.length === 1 ? '' : 's'} missing approval or file link.`);

  if (!APPROVED_FINAL_ACCOUNT_STATUSES.has(String(input.finalAccount?.status ?? '').toLowerCase()) || !input.finalAccount?.approvedBy || !input.finalAccount?.approvedAt) {
    blockers.push('Final account must be approved with approver and timestamp.');
  }

  if (!ACCEPTED_DOCUMENT_STATUSES.has(String(input.handoverPack?.status ?? '').toLowerCase()) || !hasUsableUrl(input.handoverPack?.url) || !input.handoverPack?.documentCount) {
    blockers.push('Handover pack must be approved, linked, and contain documents.');
  }

  (input.unresolvedBlockers ?? []).filter((blocker) => blocker.trim().length > 0).forEach((blocker) => blockers.push(blocker));

  if (!input.audit?.reviewedBy || !input.audit?.reviewedAt) {
    blockers.push('Close-out audit metadata must include reviewer and reviewed timestamp.');
  }

  return {
    ready: blockers.length === 0,
    blockers,
    audit: { reviewedBy: input.audit?.reviewedBy, reviewedAt: input.audit?.reviewedAt, source: input.audit?.source ?? 'closeout_gate' },
  };
}

export function buildSnagRectificationPlan(snags: CloseoutSnagRecord[] = [], options: { defaultAssignee?: string; todayIso?: string } = {}): SnagRectificationTask[] {
  return snags
    .filter((snag) => !CLOSED_SNAG_STATUSES.has(normaliseStatus(snag.status)))
    .map((snag) => {
      const assignedTo = snag.subcontractorId?.trim() || options.defaultAssignee?.trim() || 'unassigned_trade_lead';
      const trade = snag.trade?.trim() || 'general';
      const evidenceProvided = hasEvidence(snag.evidenceUrls);
      return {
        snagId: snag.id,
        title: snag.title,
        assignedTo,
        trade,
        priority: priorityForSnag(snag, options.todayIso),
        dueDate: snag.dueDate,
        drawingRef: snag.drawingRef,
        requiresPhotoEvidence: !evidenceProvided,
        paymentGate: evidenceProvided ? 'ready_for_professional_review' : 'blocked_until_evidence',
        nextAction: evidenceProvided
          ? 'Professional team to inspect uploaded rectification evidence before retention release.'
          : `Assign ${trade} rectification and upload photographic evidence before final retention can progress.`,
      };
    });
}

export function buildHandoverPackManifest(documents: HandoverPackDocumentInput[] = []): HandoverPackManifest {
  const items = documents.map((document) => {
    const category = normaliseHandoverCategory(document.category ?? document.type);
    const blockers: string[] = [];
    if (!ACCEPTED_DOCUMENT_STATUSES.has(normaliseStatus(document.status))) blockers.push('Document must be approved, accepted, issued, or closed.');
    if (!hasUsableUrl(document.url)) blockers.push('Document must include a persisted file link.');
    return { ...document, category, ready: blockers.length === 0, blockers };
  });

  const readyCategories = new Set(items.filter((item) => item.ready).map((item) => item.category));
  const missingCategories = REQUIRED_HANDOVER_CATEGORIES.filter((category) => !readyCategories.has(category));
  const blockers = [
    ...missingCategories.map((category) => `Missing ready handover document category: ${category.replaceAll('_', ' ')}.`),
    ...items.flatMap((item) => item.blockers.map((blocker) => `${item.title}: ${blocker}`)),
  ];

  return { ready: blockers.length === 0, items, missingCategories, blockers, documentCount: items.length };
}

function normaliseHandoverCategory(value?: string): HandoverPackDocumentCategory {
  const normalised = normaliseStatus(value).replaceAll('-', '_').replaceAll(' ', '_');
  if (['final_account', 'final_account_statement', 'final_accounts'].includes(normalised)) return 'final_account';
  if (['safety_sheet', 'material_safety_sheet', 'msds', 'sds'].includes(normalised)) return 'safety_sheet';
  if (['compliance_certificate', 'certificate', 'coc', 'completion_certificate'].includes(normalised)) return 'compliance_certificate';
  if (['manufacturer_warranty', 'warranty'].includes(normalised)) return 'manufacturer_warranty';
  if (['manual', 'operation_manual', 'maintenance_manual'].includes(normalised)) return 'manual';
  if (['as_built', 'as_built_drawing', 'record_drawing'].includes(normalised)) return 'as_built';
  return 'other';
}

function hasPersistedCloseoutArtifacts(project: Project, certificateData?: Record<string, unknown>, reportData?: Record<string, unknown>): boolean {
  const artifacts = (project as any).closeoutArtifacts ?? {};
  const certificateUrl = typeof artifacts.completionCertificateUrl === 'string' && artifacts.completionCertificateUrl.trim().length > 0;
  const report = typeof artifacts.finalReport === 'string' && artifacts.finalReport.trim().length > 0;
  const certificateDoc = typeof certificateData?.url === 'string' && certificateData.url.trim().length > 0 && certificateData.type === 'completion_certificate';
  const reportDoc = typeof reportData?.report === 'string' && reportData.report.trim().length > 0 && reportData.type === 'final_report';
  return certificateUrl && report && certificateDoc && reportDoc;
}

function assertProjectCloseoutGate(project: Project): void {
  const gate = evaluateCloseoutGate((project as any).closeoutGate ?? {});
  if (!gate.ready) {
    throw new Error(`${CLOSEOUT_GATE_REQUIRED_ERROR} ${gate.blockers.join(' ')}`);
  }
}

export function summaryHasPersistedCloseoutArtifacts(summary: ProjectSummary | null): boolean {
  return Boolean(summary?.artifacts?.completionCertificateUrl?.trim() && summary.artifacts.finalReport?.trim());
}

async function getProjectOrThrow(projectId: string): Promise<Project> {
  const snap = await getDoc(getDemoDoc( 'projects', projectId));
  if (!snap.exists()) throw new Error(`Project ${projectId} not found`);
  return { id: snap.id, ...snap.data() } as Project;
}

export async function getProjectSummary(projectId: string): Promise<ProjectSummary> {
  const project = await getProjectOrThrow(projectId);
  const [jobSnap, tenderSnap, ledgerEntries] = await Promise.all([
    getDoc(getDemoDoc( 'jobs', project.jobId)),
    getDocs(query(getDemoCol( 'tender_packages'), where('projectId', '==', projectId))),
    getLedgerForProject(projectId).catch(() => [] as LedgerEntry[]),
  ]);
  const job = jobSnap.exists() ? { id: jobSnap.id, ...jobSnap.data() } as Job : null;
  const tenders = tenderSnap.docs.map((item) => ({ id: item.id, ...item.data() }) as TenderPackage);
  const actualReleased = ledgerEntries.filter((entry) => entry.type === 'milestone_release').reduce((sum, entry) => sum + entry.amount, 0);
  const escrowHeld = ledgerEntries.reduce((sum, entry) => entry.type === 'escrow_deposit' ? sum + entry.amount : entry.type === 'milestone_release' || entry.type === 'refund' ? sum - entry.amount : sum, 0);
  return {
    project,
    job,
    teamMembers: project.teamMembers ?? [],
    tenders,
    ledgerEntries,
    budget: { planned: job?.budget ?? 0, actualReleased, escrowHeld: Math.max(0, escrowHeld) },
    timeline: { startedAt: project.createdAt, currentStage: project.currentStage, completedAt: (project as any).archivedAt },
    artifacts: (project as any).closeoutArtifacts,
  };
}

export async function generateCompletionCertificate(projectId: string): Promise<string> {
  const summary = await getProjectSummary(projectId);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage(PageSizes.A4);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { height } = page.getSize();
  page.drawText('ARCHITEX COMPLETION CERTIFICATE', { x: 70, y: height - 100, size: 22, font: bold, color: rgb(0.05, 0.1, 0.2) });
  page.drawText(`Project: ${summary.job?.title || summary.project.id}`, { x: 70, y: height - 160, size: 14, font: bold });
  page.drawText(`Job ID: ${summary.project.jobId}`, { x: 70, y: height - 190, size: 11, font });
  page.drawText(`Issued: ${new Date().toLocaleDateString('en-ZA')}`, { x: 70, y: height - 220, size: 11, font });
  page.drawText('This certificate records platform close-out completion only. It does not replace statutory, municipal, SACAP, ECSA, NHBRC, occupancy, or practical-completion certification by competent persons.', { x: 70, y: height - 270, size: 10, font, maxWidth: 460, lineHeight: 14 });
  page.drawText(`Team members recorded: ${summary.teamMembers.length}`, { x: 70, y: height - 340, size: 11, font });
  page.drawText(`Released via ledger: ZAR ${summary.budget.actualReleased.toLocaleString('en-ZA')}`, { x: 70, y: height - 365, size: 11, font });
  page.drawText('Generated by Architex lifecycle close-out automation.', { x: 70, y: 90, size: 10, font });
  const bytes = await pdf.save();
  const uploadedBy = summary.project.leadArchitectId || summary.project.clientId;
  const url = await uploadAndTrackFile(new Blob([bytes as any], { type: 'application/pdf' }), { fileName: `completion-certificate-${projectId}-${Date.now()}.pdf`, fileType: 'application/pdf', fileSize: bytes.length, uploadedBy, context: 'certificate', jobId: summary.project.jobId });
  await setDoc(getDemoDoc( 'projects', projectId, 'closeout_artifacts', 'completion_certificate'), { url, generatedAt: new Date().toISOString(), type: 'completion_certificate' }, { merge: true });
  await updateDoc(getDemoDoc( 'projects', projectId), { closeoutArtifacts: { ...(summary.artifacts || {}), completionCertificateUrl: url }, updatedAt: new Date().toISOString() });
  return url;
}

export async function generateFinalReport(projectId: string): Promise<string> {
  const summary = await getProjectSummary(projectId);
  const report = [`# Final Project Report: ${summary.job?.title || projectId}`, '', `- Project ID: ${projectId}`, `- Job ID: ${summary.project.jobId}`, `- Current stage: ${summary.project.currentStage}`, `- Team members: ${summary.teamMembers.length}`, `- Tender packages: ${summary.tenders.length}`, `- Planned budget: ZAR ${summary.budget.planned.toLocaleString('en-ZA')}`, `- Ledger milestone releases: ZAR ${summary.budget.actualReleased.toLocaleString('en-ZA')}`, '', '## Close-out note', 'This report is generated from Architex production records and remains advisory. Professional statutory certificates must be retained separately where required.'].join('\n');
  await setDoc(getDemoDoc( 'projects', projectId, 'closeout_artifacts', 'final_report'), { report, generatedAt: new Date().toISOString(), type: 'final_report' }, { merge: true });
  await updateDoc(getDemoDoc( 'projects', projectId), { closeoutArtifacts: { ...(summary.artifacts || {}), finalReport: report }, updatedAt: new Date().toISOString() });
  return report;
}

export async function archiveProject(projectId: string): Promise<void> {
  const projectRef = getDemoDoc( 'projects', projectId);
  const certificateRef = getDemoDoc( 'projects', projectId, 'closeout_artifacts', 'completion_certificate');
  const reportRef = getDemoDoc( 'projects', projectId, 'closeout_artifacts', 'final_report');

  await runTransaction(db, async (transaction) => {
    const projectSnap = await transaction.get(projectRef);
    if (!projectSnap.exists()) throw new Error(`Project ${projectId} not found`);

    const project = { id: projectSnap.id, ...projectSnap.data() } as Project;
    const [certificateSnap, reportSnap] = await Promise.all([
      transaction.get(certificateRef),
      transaction.get(reportRef),
    ]);

    if (!certificateSnap.exists() || !reportSnap.exists() || !hasPersistedCloseoutArtifacts(project, certificateSnap.data(), reportSnap.data())) {
      throw new Error(CLOSEOUT_ARTIFACTS_REQUIRED_ERROR);
    }

    assertProjectCloseoutGate(project);

    const now = new Date().toISOString();
    const actorId = project.leadArchitectId || project.clientId;
    const projectUpdate: Record<string, unknown> = { archived: true, archivedAt: now, updatedAt: now };

    if (project.currentStage !== 'closeout') {
      const updatedHistory = project.stageHistory.map((entry) => entry.stage === project.currentStage && !entry.exitedAt ? { ...entry, exitedAt: now } : entry);
      updatedHistory.push({ stage: 'closeout', enteredAt: now, actorId, note: 'Project archived at close-out' });
      projectUpdate.currentStage = 'closeout';
      projectUpdate.stageHistory = updatedHistory;
    }

    transaction.update(projectRef, projectUpdate);
    transaction.update(getDemoDoc( 'jobs', project.jobId), { status: 'completed', updatedAt: now });
  });
}

export const closeoutService = { getProjectSummary, generateCompletionCertificate, generateFinalReport, archiveProject, summaryHasPersistedCloseoutArtifacts, evaluateCloseoutGate, buildSnagRectificationPlan };
export default closeoutService;
