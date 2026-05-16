import React, { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, FileText, Landmark, ListChecks, Loader2, WalletCards } from 'lucide-react';
import { db } from '../lib/firebase';
import type { Job, Project, UserProfile } from '../types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

type ProjectCommandCentreProps = {
  user: UserProfile;
  onNavigate?: (pageId: string) => void;
};

type CommandJob = Job & { project?: Project };

type LoadState = 'loading' | 'ready' | 'error';

const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });

function jobQueryForUser(user: UserProfile) {
  const jobs = collection(db, 'jobs');

  if (user.role === 'client') {
    return query(jobs, where('clientId', '==', user.uid), orderBy('createdAt', 'desc'), limit(10));
  }

  if (user.role === 'architect' || user.role === 'bep' || user.role === 'freelancer') {
    return query(jobs, where('selectedArchitectId', '==', user.uid), orderBy('createdAt', 'desc'), limit(10));
  }

  if (user.role === 'admin') {
    return query(jobs, orderBy('createdAt', 'desc'), limit(15));
  }

  return query(jobs, where('status', 'in', ['open', 'in-progress']), orderBy('createdAt', 'desc'), limit(10));
}

function projectQueryForUser(user: UserProfile) {
  const projects = collection(db, 'projects');

  if (user.role === 'client') {
    return query(projects, where('clientId', '==', user.uid), orderBy('createdAt', 'desc'), limit(10));
  }

  if (user.role === 'architect' || user.role === 'bep') {
    return query(projects, where('leadArchitectId', '==', user.uid), orderBy('createdAt', 'desc'), limit(10));
  }

  if (user.role === 'admin') {
    return query(projects, orderBy('createdAt', 'desc'), limit(15));
  }

  return query(projects, orderBy('updatedAt', 'desc'), limit(15));
}

function resolveNextAction(user: UserProfile, activeJob?: CommandJob) {
  if (!activeJob) {
    if (user.role === 'client') return { label: 'Create a guided project brief', target: 'client-intake', detail: 'Start with the client intake workflow so BEPs can price and scope real requirements.' };
    if (user.role === 'contractor') return { label: 'Review tender marketplace', target: 'packages', detail: 'No active delivery project is linked yet. Review available package/tender work.' };
    return { label: 'Complete profile and verification', target: 'profile', detail: 'Project routing depends on verified role, profile, billing, and signature readiness.' };
  }

  if (activeJob.status === 'open' && user.role === 'client') {
    return { label: 'Compare BEP proposals', target: 'client-proposals', detail: 'Review fit, fee, exclusions, risk notes, and verification before appointment.' };
  }

  if (activeJob.status === 'open') {
    return { label: 'Prepare proposal or scope response', target: 'technical-brief', detail: 'Use the technical brief and proposal workflow before appointment or package acceptance.' };
  }

  if (activeJob.status === 'in-progress') {
    if (user.role === 'client') return { label: 'Review progress and approvals', target: 'client-progress', detail: 'Check plain-language progress, approvals, payments, and municipal status.' };
    if (user.role === 'contractor' || user.role === 'subcontractor' || user.role === 'supplier') return { label: 'Resolve delivery tasks and packages', target: 'packages', detail: 'Prioritise package readiness, procurement commitments, RFIs, and close-out evidence.' };
    return { label: 'Review tasks and compliance blockers', target: 'tasks', detail: 'Resolve open approvals, missing information, drawing checks, and design-team dependencies.' };
  }

  return { label: 'Review project records', target: 'journey', detail: 'Open the project journey for stage history, documents, payments, and audit trail.' };
}

function buildAiSummary(user: UserProfile, activeJob?: CommandJob, project?: Project) {
  if (!activeJob) {
    return 'No active project was found from live Firestore records for this role. The safest next step is to complete onboarding/profile readiness or create/invite work through the scoped workflow pages.';
  }

  const stage = project?.currentStage ? ` Current lifecycle stage is ${project.currentStage}.` : '';
  const requirements = activeJob.requirements?.length ? ` Requirements tracked: ${activeJob.requirements.slice(0, 3).join(', ')}.` : '';
  return `${activeJob.title} is ${activeJob.status} with a recorded budget of ${currency.format(activeJob.budget || 0)}.${stage}${requirements} AI guidance is advisory only and requires accountable human review before approvals, payments, submissions, or contract actions.`;
}

export default function ProjectCommandCentre({ user, onNavigate }: ProjectCommandCentreProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [jobs, setJobs] = useState<CommandJob[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    setState('loading');
    const unsubscribeJobs = onSnapshot(jobQueryForUser(user), (snapshot) => {
      setJobs(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as CommandJob)));
      setState('ready');
    }, (error) => {
      console.error('Command centre job projection failed:', error);
      setState('error');
    });

    const unsubscribeProjects = onSnapshot(projectQueryForUser(user), (snapshot) => {
      setProjects(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Project)));
    }, (error) => {
      console.error('Command centre project projection failed:', error);
    });

    return () => {
      unsubscribeJobs();
      unsubscribeProjects();
    };
  }, [user]);

  const joinedJobs = useMemo(() => jobs.map((job) => ({ ...job, project: projects.find((project) => project.jobId === job.id) })), [jobs, projects]);
  const activeJob = joinedJobs.find((job) => job.status === 'in-progress') ?? joinedJobs[0];
  const activeProject = activeJob?.project ?? projects[0];
  const nextAction = resolveNextAction(user, activeJob);
  const openApprovals = activeJob?.requirements?.filter(Boolean).length ?? 0;
  const atRisk = activeJob?.deadline && new Date(activeJob.deadline).getTime() < Date.now() && activeJob.status !== 'completed';

  return (
    <div className="space-y-6" data-testid="project-command-centre">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">Project Command Centre</Badge>
              <CardTitle className="font-heading text-3xl mt-3">{activeJob?.title ?? 'No active project selected'}</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">
                Role-aware live projection from Firestore jobs/projects for {user.role}. It never performs approval, payment, signature, or submission actions without the dedicated human-confirmed workflow.
              </CardDescription>
            </div>
            <Badge className="capitalize w-fit">{user.role}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
          {state === 'loading' && <div className="lg:col-span-3 flex items-center gap-3 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading live project state...</div>}
          {state === 'error' && <div className="lg:col-span-3 text-destructive">Unable to load command-centre projection. Check Firestore rules and indexes for this role.</div>}
          <div className="lg:col-span-2 rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <ListChecks className="h-5 w-5 text-primary" />
              <h3 className="font-heading text-xl font-bold">Next Best Action</h3>
            </div>
            <p className="text-lg font-semibold">{nextAction.label}</p>
            <p className="text-sm text-muted-foreground leading-relaxed">{nextAction.detail}</p>
            <Button onClick={() => onNavigate?.(nextAction.target)} className="rounded-xl gap-2">Take next action <ArrowRight className="h-4 w-4" /></Button>
          </div>
          <div className="rounded-2xl border border-border bg-background/70 p-5 space-y-2">
            <h3 className="font-heading text-lg font-bold">Current Stage</h3>
            <p className="text-2xl font-black capitalize">{activeProject?.currentStage?.replaceAll('-', ' ') ?? activeJob?.status ?? 'Not started'}</p>
            <p className="text-xs text-muted-foreground">From project lifecycle or job status records.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <MetricCard icon={<CheckCircle2 />} label="Open approvals / requirements" value={openApprovals} detail="Requirements and decision points visible from the active job." />
        <MetricCard icon={<AlertTriangle />} label="At risk / overdue" value={atRisk ? 1 : 0} detail={activeJob?.deadline ? `Deadline: ${activeJob.deadline}` : 'No deadline recorded.'} tone={atRisk ? 'danger' : 'default'} />
        <MetricCard icon={<FileText />} label="Documents" value="Files" detail="Open the file manager/toolbox for project documents and evidence." target="toolbox" onNavigate={onNavigate} />
        <MetricCard icon={<WalletCards />} label="Budget & payments" value={activeJob ? currency.format(activeJob.budget || 0) : 'No budget'} detail="Payments remain routed through invoice, escrow, and governance workflows." target="payments" onNavigate={onNavigate} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 rounded-2xl border-border bg-card/90">
          <CardHeader>
            <CardTitle className="font-heading text-xl">AI Summary</CardTitle>
            <CardDescription>Generated deterministically from live project/job fields. Human review required.</CardDescription>
          </CardHeader>
          <CardContent><p className="text-sm text-muted-foreground leading-relaxed">{buildAiSummary(user, activeJob, activeProject)}</p></CardContent>
        </Card>
        <Card className="rounded-2xl border-border bg-card/90">
          <CardHeader>
            <CardTitle className="font-heading text-xl">Key Dates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" /> Deadline: {activeJob?.deadline ?? 'Not recorded'}</div>
            <div className="flex items-center gap-2"><Landmark className="h-4 w-4 text-primary" /> Created: {activeJob?.createdAt ?? activeProject?.createdAt ?? 'Not recorded'}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-border bg-card/90">
        <CardHeader>
          <CardTitle className="font-heading text-xl">Recent Activity</CardTitle>
          <CardDescription>Latest live jobs visible to this role. No mock activity is generated.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {joinedJobs.length === 0 ? <p className="text-sm text-muted-foreground">No live job or project records are currently visible for this role.</p> : joinedJobs.slice(0, 5).map((job) => (
            <div key={job.id} className="rounded-xl border border-border p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div><p className="font-semibold">{job.title}</p><p className="text-xs text-muted-foreground">{job.location ?? 'Location not recorded'} · {job.createdAt}</p></div>
              <Badge variant={job.status === 'in-progress' ? 'default' : 'secondary'}>{job.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ icon, label, value, detail, tone = 'default', target, onNavigate }: { icon: React.ReactNode; label: string; value: React.ReactNode; detail: string; tone?: 'default' | 'danger'; target?: string; onNavigate?: (pageId: string) => void }) {
  return (
    <Card className={`rounded-2xl border-border bg-card/90 ${tone === 'danger' ? 'border-destructive/40' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}<CardTitle className="font-heading text-base">{label}</CardTitle></div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-2xl font-black">{value}</div>
        <p className="text-xs text-muted-foreground leading-relaxed">{detail}</p>
        {target && <Button variant="outline" size="sm" className="rounded-xl" onClick={() => onNavigate?.(target)}>Open</Button>}
      </CardContent>
    </Card>
  );
}
