import { PDFDocument, PageSizes, StandardFonts, rgb } from 'pdf-lib';
import { collection, doc, getDoc, getDocs, query, runTransaction, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { uploadAndTrackFile } from '@/lib/uploadService';
import { getLedgerForProject } from './financialLedgerService';
import { transitionStage } from './projectLifecycleService';
import { Job, LedgerEntry, Project, ProjectTeamMember, TenderPackage } from '@/types';

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

function hasPersistedCloseoutArtifacts(project: Project, certificateData?: Record<string, unknown>, reportData?: Record<string, unknown>): boolean {
  const artifacts = (project as any).closeoutArtifacts ?? {};
  const certificateUrl = typeof artifacts.completionCertificateUrl === 'string' && artifacts.completionCertificateUrl.trim().length > 0;
  const report = typeof artifacts.finalReport === 'string' && artifacts.finalReport.trim().length > 0;
  const certificateDoc = typeof certificateData?.url === 'string' && certificateData.url.trim().length > 0 && certificateData.type === 'completion_certificate';
  const reportDoc = typeof reportData?.report === 'string' && reportData.report.trim().length > 0 && reportData.type === 'final_report';
  return certificateUrl && report && certificateDoc && reportDoc;
}

export function summaryHasPersistedCloseoutArtifacts(summary: ProjectSummary | null): boolean {
  return Boolean(summary?.artifacts?.completionCertificateUrl?.trim() && summary.artifacts.finalReport?.trim());
}

async function getProjectOrThrow(projectId: string): Promise<Project> {
  const snap = await getDoc(doc(db, 'projects', projectId));
  if (!snap.exists()) throw new Error(`Project ${projectId} not found`);
  return { id: snap.id, ...snap.data() } as Project;
}

export async function getProjectSummary(projectId: string): Promise<ProjectSummary> {
  const project = await getProjectOrThrow(projectId);
  const [jobSnap, tenderSnap, ledgerEntries] = await Promise.all([
    getDoc(doc(db, 'jobs', project.jobId)),
    getDocs(query(collection(db, 'tender_packages'), where('projectId', '==', projectId))),
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
  await setDoc(doc(db, 'projects', projectId, 'closeout_artifacts', 'completion_certificate'), { url, generatedAt: new Date().toISOString(), type: 'completion_certificate' }, { merge: true });
  await updateDoc(doc(db, 'projects', projectId), { closeoutArtifacts: { ...(summary.artifacts || {}), completionCertificateUrl: url }, updatedAt: new Date().toISOString() });
  return url;
}

export async function generateFinalReport(projectId: string): Promise<string> {
  const summary = await getProjectSummary(projectId);
  const report = [`# Final Project Report: ${summary.job?.title || projectId}`, '', `- Project ID: ${projectId}`, `- Job ID: ${summary.project.jobId}`, `- Current stage: ${summary.project.currentStage}`, `- Team members: ${summary.teamMembers.length}`, `- Tender packages: ${summary.tenders.length}`, `- Planned budget: ZAR ${summary.budget.planned.toLocaleString('en-ZA')}`, `- Ledger milestone releases: ZAR ${summary.budget.actualReleased.toLocaleString('en-ZA')}`, '', '## Close-out note', 'This report is generated from Architex production records and remains advisory. Professional statutory certificates must be retained separately where required.'].join('\n');
  await setDoc(doc(db, 'projects', projectId, 'closeout_artifacts', 'final_report'), { report, generatedAt: new Date().toISOString(), type: 'final_report' }, { merge: true });
  await updateDoc(doc(db, 'projects', projectId), { closeoutArtifacts: { ...(summary.artifacts || {}), finalReport: report }, updatedAt: new Date().toISOString() });
  return report;
}

export async function archiveProject(projectId: string): Promise<void> {
  const projectRef = doc(db, 'projects', projectId);
  const certificateRef = doc(db, 'projects', projectId, 'closeout_artifacts', 'completion_certificate');
  const reportRef = doc(db, 'projects', projectId, 'closeout_artifacts', 'final_report');

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
    transaction.update(doc(db, 'jobs', project.jobId), { status: 'completed', updatedAt: now });
  });
}

export const closeoutService = { getProjectSummary, generateCompletionCertificate, generateFinalReport, archiveProject, summaryHasPersistedCloseoutArtifacts };
export default closeoutService;
