import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { AlertTriangle, CalendarClock, CheckCircle2, Download, FileText, Landmark, Loader2, Save } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { CouncilSubmission, GanttTask, Job, Project, UserProfile } from '@/types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

type LoadState = 'loading' | 'ready' | 'error';
type ReportStatus = 'on_track' | 'watch' | 'at_risk' | 'complete';

type ProgressSnapshot = {
  id?: string;
  jobId: string;
  projectId?: string;
  clientId: string;
  title: string;
  status: ReportStatus;
  summary: string;
  progressPercent: number;
  generatedAt: string;
  humanApprovalRequired: boolean;
  approvedBy?: string;
  approvedAt?: string;
};

const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });

function timestampMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime() || 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value === 'object' && 'seconds' in value && typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

function sortByRecent<T extends { createdAt?: unknown; updatedAt?: unknown; generatedAt?: unknown }>(items: T[]) {
  return [...items].sort((a, b) => timestampMs(b.updatedAt ?? b.generatedAt ?? b.createdAt) - timestampMs(a.updatedAt ?? a.generatedAt ?? a.createdAt));
}

function jobQueryForClient(user: UserProfile) {
  if (user.role === 'admin') return query(collection(db, 'jobs'), limit(25));
  return query(collection(db, 'jobs'), where('clientId', '==', user.uid), limit(25));
}

function projectQueryForClient(user: UserProfile) {
  if (user.role === 'admin') return query(collection(db, 'projects'), limit(25));
  return query(collection(db, 'projects'), where('clientId', '==', user.uid), limit(25));
}

function statusFor(job?: Job, project?: Project, tasks: GanttTask[] = [], submissions: CouncilSubmission[] = []): ReportStatus {
  if (!job) return 'watch';
  if (job.status === 'completed' || project?.currentStage === 'closeout') return 'complete';
  const overdue = Boolean(job.deadline && new Date(job.deadline).getTime() < Date.now());
  const delayedTasks = tasks.filter((task) => task.status === 'delayed').length;
  const municipalQueries = submissions.filter((submission) => submission.status === 'queries_raised' || submission.status === 'rejected').length;
  if (overdue || delayedTasks > 0 || municipalQueries > 0) return 'at_risk';
  if (tasks.some((task) => task.status !== 'completed')) return 'watch';
  return 'on_track';
}

function progressPercent(job?: Job, project?: Project, tasks: GanttTask[] = []) {
  if (job?.status === 'completed' || project?.currentStage === 'closeout') return 100;
  if (tasks.length > 0) {
    const total = tasks.reduce((sum, task) => sum + Math.max(0, Math.min(100, task.progress || 0)), 0);
    return Math.round(total / tasks.length);
  }
  const stageOrder = ['intake', 'scoping', 'appointment', 'coordination', 'compliance', 'tender', 'delivery', 'payments', 'closeout'];
  const index = project?.currentStage ? stageOrder.indexOf(project.currentStage) : -1;
  if (index >= 0) return Math.round(((index + 1) / stageOrder.length) * 100);
  if (job?.status === 'in-progress') return 35;
  if (job?.status === 'open') return 10;
  return 0;
}

function buildSummary(job: Job | undefined, project: Project | undefined, tasks: GanttTask[], submissions: CouncilSubmission[], status: ReportStatus, progress: number) {
  if (!job) return 'No live client project has been selected. Create or appoint a project before generating progress reports.';
  const stage = project?.currentStage ? `The project is currently in the ${project.currentStage.replaceAll('_', ' ')} stage.` : `The job status is ${job.status}.`;
  const programme = tasks.length > 0
    ? `${tasks.filter((task) => task.status === 'completed').length}/${tasks.length} programme tasks are complete.`
    : 'No programme tasks are linked yet.';
  const municipal = submissions.length > 0
    ? `Municipal tracking has ${submissions.length} submission record${submissions.length === 1 ? '' : 's'}, latest status: ${submissions[0].status}.`
    : 'No municipal submission record is linked yet.';
  const riskNote = status === 'at_risk'
    ? 'There are risks or queries needing accountable team follow-up.'
    : status === 'watch'
      ? 'Some dependencies still need monitoring before the next client decision.'
      : 'No immediate blockers are visible from the linked records.';
  return `${job.title} is ${progress}% progressed. ${stage} ${programme} ${municipal} ${riskNote} AI/plain-language summaries are advisory and require accountable human approval before external issue.`;
}

async function generatePdfDownload(snapshot: ProgressSnapshot, job?: Job, project?: Project, tasks: GanttTask[] = [], submissions: CouncilSubmission[] = []) {
  const { PDFDocument, PageSizes, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const page = pdf.addPage(PageSizes.A4);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { height } = page.getSize();
  const lines = [
    'ARCHITEX CLIENT PROGRESS REPORT',
    `Project: ${snapshot.title}`,
    `Generated: ${new Date(snapshot.generatedAt).toLocaleString('en-ZA')}`,
    `Status: ${snapshot.status.replaceAll('_', ' ')}`,
    `Progress: ${snapshot.progressPercent}%`,
    `Budget recorded: ${job ? currency.format(job.budget || 0) : 'N/A'}`,
    `Lifecycle stage: ${project?.currentStage ?? job?.status ?? 'N/A'}`,
    `Programme tasks: ${tasks.length}`,
    `Municipal records: ${submissions.length}`,
    '',
    'Plain-language summary:',
    snapshot.summary,
    '',
    'Governance note: This report is generated from live Architex records. It is not a statutory certificate, payment certificate, municipal approval, or professional sign-off. Accountable humans must approve before external reliance.',
  ];

  page.drawText(lines[0], { x: 50, y: height - 70, size: 18, font: bold, color: rgb(0.05, 0.1, 0.2) });
  let y = height - 115;
  lines.slice(1).forEach((line) => {
    const maxWidth = 88;
    const chunks = line.length > maxWidth ? line.match(new RegExp(`.{1,${maxWidth}}(\\s|$)`, 'g')) ?? [line] : [line];
    chunks.forEach((chunk) => {
      page.drawText(chunk.trim(), { x: 50, y, size: line.endsWith(':') ? 12 : 10, font: line.endsWith(':') ? bold : regular, maxWidth: 500, lineHeight: 14 });
      y -= 16;
    });
    if (line === '') y -= 8;
  });

  const bytes = await pdf.save();
  const blob = new Blob([bytes as any], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `architex-progress-${snapshot.jobId}-${Date.now()}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ClientProgressReports({ user }: { user: UserProfile }) {
  const [state, setState] = useState<LoadState>('loading');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<GanttTask[]>([]);
  const [submissions, setSubmissions] = useState<CouncilSubmission[]>([]);
  const [snapshots, setSnapshots] = useState<ProgressSnapshot[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setState('loading');
    const unsubJobs = onSnapshot(jobQueryForClient(user), (snapshot) => {
      setJobs(sortByRecent(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Job))));
      setState('ready');
    }, (error) => {
      console.error('Failed to load client progress jobs:', error);
      setState('error');
    });
    const unsubProjects = onSnapshot(projectQueryForClient(user), (snapshot) => {
      setProjects(sortByRecent(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Project))));
    }, (error) => console.error('Failed to load client progress projects:', error));
    const unsubSnapshots = onSnapshot(query(collection(db, 'project_progress_reports'), where(user.role === 'admin' ? 'humanApprovalRequired' : 'clientId', '==', user.role === 'admin' ? true : user.uid), limit(25)), (snapshot) => {
      setSnapshots(sortByRecent(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as ProgressSnapshot))));
    }, (error) => console.error('Failed to load progress report snapshots:', error));
    return () => {
      unsubJobs();
      unsubProjects();
      unsubSnapshots();
    };
  }, [user]);

  useEffect(() => {
    const projectIds = projects.map((project) => project.id).slice(0, 10);
    const jobIds = jobs.map((job) => job.id).slice(0, 10);
    const unsubs: Array<() => void> = [];
    if (projectIds.length > 0) {
      unsubs.push(onSnapshot(query(collection(db, 'gantt_tasks'), where('projectId', 'in', projectIds)), (snapshot) => setTasks(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as GanttTask))), (error) => console.error('Failed to load progress programme tasks:', error)));
    }
    if (jobIds.length > 0) {
      unsubs.push(onSnapshot(query(collection(db, 'council_submissions'), where('jobId', 'in', jobIds)), (snapshot) => setSubmissions(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as CouncilSubmission))), (error) => console.error('Failed to load progress municipal submissions:', error)));
    }
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [jobs, projects]);

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) ?? jobs.find((job) => job.status === 'in-progress') ?? jobs[0], [jobs, selectedJobId]);
  const selectedProject = useMemo(() => projects.find((project) => project.jobId === selectedJob?.id), [projects, selectedJob?.id]);
  const linkedTasks = useMemo(() => tasks.filter((task) => task.projectId === selectedProject?.id), [tasks, selectedProject?.id]);
  const linkedSubmissions = useMemo(() => submissions.filter((submission) => submission.jobId === selectedJob?.id).sort((a, b) => String(b.lastCheckedAt ?? b.submittedAt ?? '').localeCompare(String(a.lastCheckedAt ?? a.submittedAt ?? ''))), [submissions, selectedJob?.id]);
  const reportStatus = statusFor(selectedJob, selectedProject, linkedTasks, linkedSubmissions);
  const reportProgress = progressPercent(selectedJob, selectedProject, linkedTasks);
  const currentSnapshot: ProgressSnapshot = useMemo(() => ({
    jobId: selectedJob?.id ?? 'unselected',
    projectId: selectedProject?.id,
    clientId: selectedJob?.clientId ?? user.uid,
    title: selectedJob?.title ?? 'No active project',
    status: reportStatus,
    summary: buildSummary(selectedJob, selectedProject, linkedTasks, linkedSubmissions, reportStatus, reportProgress),
    progressPercent: reportProgress,
    generatedAt: new Date().toISOString(),
    humanApprovalRequired: true,
  }), [linkedSubmissions, linkedTasks, reportProgress, reportStatus, selectedJob, selectedProject, user.uid]);

  const saveSnapshot = async () => {
    if (!selectedJob) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'project_progress_reports'), {
        ...currentSnapshot,
        createdBy: user.uid,
        createdByRole: user.role,
        sourceCollections: ['jobs', 'projects', 'gantt_tasks', 'council_submissions'],
      });
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      await generatePdfDownload(currentSnapshot, selectedJob, selectedProject, linkedTasks, linkedSubmissions);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="client-progress-reports">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">Client Progress Reports</Badge>
              <CardTitle className="font-heading text-3xl mt-3">Plain-language project progress</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">
                Generates client-readable progress from live lifecycle, programme, municipal, budget, approval, and risk records. Snapshots are saved for audit and require accountable human approval before issue.
              </CardDescription>
            </div>
            <Badge className="capitalize w-fit">{user.role}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {state === 'loading' && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading live project records...</div>}
          {state === 'error' && <div className="text-sm text-destructive">Unable to load progress records. Check Firestore rules and indexes.</div>}
          {jobs.length > 0 && (
            <select value={selectedJob?.id ?? ''} onChange={(event) => setSelectedJobId(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm md:max-w-xl">
              {jobs.map((job) => <option key={job.id} value={job.id}>{job.title} · {job.status}</option>)}
            </select>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard icon={<CheckCircle2 />} label="Progress" value={`${reportProgress}%`} />
        <MetricCard icon={<CalendarClock />} label="Stage" value={selectedProject?.currentStage ?? selectedJob?.status ?? 'N/A'} />
        <MetricCard icon={<FileText />} label="Programme tasks" value={linkedTasks.length} />
        <MetricCard icon={<Landmark />} label="Municipal records" value={linkedSubmissions.length} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div>
                <CardTitle className="font-heading text-2xl">{currentSnapshot.title}</CardTitle>
                <CardDescription>Generated {new Date(currentSnapshot.generatedAt).toLocaleString()}</CardDescription>
              </div>
              <Badge variant={reportStatus === 'at_risk' ? 'destructive' : reportStatus === 'complete' || reportStatus === 'on_track' ? 'default' : 'secondary'}>{reportStatus.replaceAll('_', ' ')}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-2xl border border-border bg-background/70 p-5">
              <h3 className="font-heading text-lg font-bold">AI/plain-language summary</h3>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{currentSnapshot.summary}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <InfoBlock label="Budget recorded" value={selectedJob ? currency.format(selectedJob.budget || 0) : 'Not recorded'} />
              <InfoBlock label="Deadline" value={selectedJob?.deadline || 'Not recorded'} />
              <InfoBlock label="Completed tasks" value={`${linkedTasks.filter((task) => task.status === 'completed').length}/${linkedTasks.length}`} />
              <InfoBlock label="Latest municipal status" value={linkedSubmissions[0]?.status ?? 'No submission linked'} />
            </div>
            {reportStatus === 'at_risk' && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Risk attention required</div>
                <p className="mt-1">Review overdue deadlines, delayed programme items, municipal queries, or rejected submissions before approving this report.</p>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-3 border-t border-border pt-5">
              <Button onClick={saveSnapshot} disabled={!selectedJob || saving} className="rounded-xl gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save audit snapshot</Button>
              <Button variant="outline" onClick={downloadPdf} disabled={!selectedJob || downloading} className="rounded-xl gap-2">{downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download PDF</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-xl">Report snapshots</CardTitle>
            <CardDescription>Saved audit records. No mock reports are generated.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshots.length === 0 ? <p className="text-sm text-muted-foreground">No saved progress snapshots yet.</p> : snapshots.slice(0, 8).map((snapshot) => (
              <div key={snapshot.id ?? snapshot.generatedAt} className="rounded-xl border border-border p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{snapshot.title}</p>
                  <Badge variant={snapshot.humanApprovalRequired ? 'secondary' : 'default'}>{snapshot.humanApprovalRequired ? 'approval required' : 'approved'}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{snapshot.progressPercent}% · {new Date(snapshot.generatedAt).toLocaleString()}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}<CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</CardTitle></div>
      </CardHeader>
      <CardContent><p className="font-heading text-2xl font-black capitalize">{value}</p></CardContent>
    </Card>
  );
}

function InfoBlock({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-background/70 p-4"><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p><p className="mt-2 font-semibold">{value}</p></div>;
}
