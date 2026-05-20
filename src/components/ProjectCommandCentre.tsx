import React, { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, FileText, Landmark, ListChecks, Loader2, WalletCards } from 'lucide-react';
import { db } from '../lib/firebase';
import { subscribeToMergedQuerySnapshots } from '../lib/firestoreQueryMerge';
import { getProjectCommandCentreGuidance } from '../services/projectCommandCentreService';
import { getRoleProfileCompletion } from '../services/roleProfileService';
import type { DelegatedTask, Job, Project, TenderPackage, UserProfile } from '../types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

type ProjectCommandCentreProps = {
  user: UserProfile;
  onNavigate?: (pageId: string) => void;
};

type CommandJob = Job & { project?: Project };
type CommandPackage = TenderPackage & { source?: 'marketplace' | 'awarded' | 'admin' };
type CommandDelegatedTask = DelegatedTask & { source?: 'delegated' };

type LoadState = 'loading' | 'ready';

const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });

const ROLE_COMMAND_VISUALS: Record<UserProfile['role'], { viewLabel: string; headline: string; description: string; accent: string; accentSoft: string }> = {
  client: { viewLabel: 'Client View', headline: 'Always know what to do next.', description: 'A guided command centre for approvals, progress, payments, and accountable decisions.', accent: '#005b4e', accentSoft: 'rgba(0, 91, 78, 0.12)' },
  architect: { viewLabel: 'Architect View', headline: 'Coordinate professional delivery.', description: 'Track design decisions, compliance blockers, and project handoffs without changing workflow data.', accent: '#006b5c', accentSoft: 'rgba(0, 107, 92, 0.12)' },
  bep: { viewLabel: 'BEP View', headline: 'Manage your professional deliverables.', description: 'Professional oversight and coordination hub for live project records and next actions.', accent: '#7046a8', accentSoft: 'rgba(112, 70, 168, 0.12)' },
  contractor: { viewLabel: 'Contractor View', headline: 'Drive the construction programme.', description: 'Manage critical path, site blockers, procurement approvals, and delivery evidence.', accent: '#2f72a7', accentSoft: 'rgba(47, 114, 167, 0.12)' },
  subcontractor: { viewLabel: 'Subcontractor View', headline: 'Keep package delivery moving.', description: 'Focus package tasks, evidence, RFIs, claims, and close-out records from visible live work.', accent: '#d26a38', accentSoft: 'rgba(210, 106, 56, 0.14)' },
  supplier: { viewLabel: 'Supplier View', headline: 'Make procurement traceable.', description: 'Track orders, deliveries, product records, warranties, and project commitments.', accent: '#1d8d6f', accentSoft: 'rgba(29, 141, 111, 0.13)' },
  freelancer: { viewLabel: 'Freelancer View', headline: 'Deliver assigned work clearly.', description: 'Stay aligned to delegated tasks, submissions, comments, and resource bookings.', accent: '#165a4c', accentSoft: 'rgba(22, 90, 76, 0.12)' },
  admin: { viewLabel: 'Admin View', headline: 'Whole-system platform oversight.', description: 'Monitor system health, governance queues, disputes, and operational controls.', accent: '#ba1a1a', accentSoft: 'rgba(186, 26, 26, 0.11)' },
};

const canListProjectsByRole = (user: UserProfile) => ['client', 'architect', 'bep', 'admin'].includes(user.role);

function timestampMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime() || 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value === 'object' && 'seconds' in value && typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

function sortByRecent<T extends { createdAt?: unknown; updatedAt?: unknown }>(items: T[]) {
  return [...items].sort((a, b) => timestampMs(b.updatedAt ?? b.createdAt) - timestampMs(a.updatedAt ?? a.createdAt));
}

function jobQueriesForUser(user: UserProfile) {
  const jobs = collection(db, 'jobs');

  if (user.role === 'client') {
    return [query(jobs, where('clientId', '==', user.uid), limit(25))];
  }

  if (user.role === 'architect' || user.role === 'bep' || user.role === 'freelancer') {
    return [
      query(jobs, where('selectedProfessionalId', '==', user.uid), limit(25)),
      query(jobs, where('selectedBepId', '==', user.uid), limit(25)),
      query(jobs, where('selectedArchitectId', '==', user.uid), limit(25)),
    ];
  }

  if (user.role === 'admin') {
    return [query(jobs, limit(25))];
  }

  return [];
}

function tenderQueriesForUser(user: UserProfile) {
  const tenders = collection(db, 'tender_packages');

  if (user.role === 'admin') {
    return [{ source: 'admin' as const, q: query(tenders, limit(25)) }];
  }

  if (user.role === 'contractor' || user.role === 'subcontractor' || user.role === 'supplier') {
    return [
      { source: 'marketplace' as const, q: query(tenders, where('status', '==', 'published'), limit(25)) },
      { source: 'awarded' as const, q: query(tenders, where('awardedContractorId', '==', user.uid), limit(25)) },
    ];
  }

  return [];
}

function delegatedTaskQueryForUser(user: UserProfile) {
  if (user.role !== 'freelancer') return null;
  return query(collection(db, 'delegatedTasks'), where('assigneeId', '==', user.uid), limit(25));
}

function projectQueriesForUser(user: UserProfile) {
  const projects = collection(db, 'projects');

  if (user.role === 'client') {
    return [query(projects, where('clientId', '==', user.uid), limit(25))];
  }

  if (user.role === 'architect' || user.role === 'bep') {
    return [
      query(projects, where('leadProfessionalId', '==', user.uid), limit(25)),
      query(projects, where('leadBepId', '==', user.uid), limit(25)),
      query(projects, where('leadArchitectId', '==', user.uid), limit(25)),
    ];
  }

  if (user.role === 'admin') {
    return [query(projects, limit(25))];
  }

  return [];
}

export default function ProjectCommandCentre({ user, onNavigate }: ProjectCommandCentreProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [jobs, setJobs] = useState<CommandJob[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [packages, setPackages] = useState<CommandPackage[]>([]);
  const [delegatedTasks, setDelegatedTasks] = useState<CommandDelegatedTask[]>([]);

  useEffect(() => {
    setState('loading');
    const jobQueries = jobQueriesForUser(user);
    const unsubscribeJobs = jobQueries.length > 0 ? subscribeToMergedQuerySnapshots<CommandJob>(jobQueries, (docSnap) => ({ id: docSnap.id, ...docSnap.data() } as CommandJob), (items) => {
      setJobs(sortByRecent(items));
      setState('ready');
    }, (error) => {
      console.warn('Command centre job projection unavailable; continuing without job context:', error);
      setJobs([]);
      setState('ready');
    }) : null;

    const delegatedTaskQuery = delegatedTaskQueryForUser(user);
    const unsubscribeDelegatedTasks = delegatedTaskQuery ? onSnapshot(delegatedTaskQuery, (snapshot) => {
      setDelegatedTasks(sortByRecent(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data(), source: "delegated" } as CommandDelegatedTask))));
      setState("ready");
    }, (error) => {
      console.warn("Command centre delegated task projection unavailable; continuing without freelancer task context:", error);
      setDelegatedTasks([]);
      setState("ready");
    }) : null;

    const projectQueries = projectQueriesForUser(user);
    const unsubscribeProjects = projectQueries.length > 0 && canListProjectsByRole(user) ? subscribeToMergedQuerySnapshots<Project>(projectQueries, (docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Project), (items) => {
      setProjects(sortByRecent(items));
    }, (error) => {
      console.warn('Command centre project projection unavailable; continuing without project context:', error);
      setProjects([]);
    }) : null;

    const packageQueries = tenderQueriesForUser(user);
    const packageMap = new Map<string, CommandPackage>();
    const unsubscribePackages = packageQueries.map(({ source, q }) => onSnapshot(q, (snapshot) => {
      snapshot.docs.forEach((doc) => {
        const existing = packageMap.get(doc.id);
        const nextSource = existing?.source === 'awarded' ? 'awarded' : source;
        packageMap.set(doc.id, { id: doc.id, ...doc.data(), source: nextSource } as CommandPackage);
      });
      setPackages(sortByRecent(Array.from(packageMap.values())));
      setState('ready');
    }, (error) => {
      console.warn('Command centre package projection unavailable; continuing without package context:', error);
      setState('ready');
    }));

    if (jobQueries.length === 0 && packageQueries.length === 0 && !delegatedTaskQuery) setState('ready');

    return () => {
      unsubscribeJobs?.();
      unsubscribeProjects?.();
      unsubscribeDelegatedTasks?.();
      unsubscribePackages.forEach((unsubscribe) => unsubscribe());
    };
  }, [user]);

  const joinedJobs = useMemo(() => jobs.map((job) => ({ ...job, project: projects.find((project) => project.jobId === job.id) })), [jobs, projects]);
  const activeJob = joinedJobs.find((job) => job.status === 'in-progress') ?? joinedJobs[0];
  const activePackage = packages.find((pkg) => pkg.source === 'awarded' || pkg.status === 'awarded') ?? packages[0];
  const activeTask = delegatedTasks.find((task) => task.status === 'in-progress') ?? delegatedTasks.find((task) => task.status === 'pending') ?? delegatedTasks[0];
  const activeProject = activeJob ? activeJob.project : projects[0];
  const profileCompletion = useMemo(() => getRoleProfileCompletion(user.role, user as unknown as Record<string, unknown>), [user]);
  const commandGuidance = getProjectCommandCentreGuidance({
    activeRole: user.role,
    activeProject,
    activeJob,
    activePackage,
    activeTask,
    profileCompletion,
  });
  const nextAction = commandGuidance.nextAction;
  const roleVisual = ROLE_COMMAND_VISUALS[user.role];
  const openApprovals = activeJob?.requirements?.filter(Boolean).length ?? (activeTask ? Number(activeTask.submissionStatus !== 'approved') : activePackage ? activePackage.scope?.length ?? 0 : 0);
  const atRisk = activeJob?.deadline && new Date(activeJob.deadline).getTime() < Date.now() && activeJob.status !== 'completed';

  return (
    <div className="space-y-6" data-testid="project-command-centre">
      <Card className="rounded-[1.25rem] border-border bg-card/95 beos-soft-shadow overflow-hidden" style={{ borderTop: `5px solid ${roleVisual.accent}` }}>
        <CardHeader className="bg-[#f4faff]/80 border-b border-border/70">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="rounded-full beos-label-caps">Command Centre</Badge>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <CardTitle className="font-sans text-3xl sm:text-4xl font-black tracking-[-0.055em]">{activeJob?.title ?? roleVisual.headline}</CardTitle>
                <Badge className="rounded-full border-0 text-white" style={{ backgroundColor: roleVisual.accent }}>{roleVisual.viewLabel}</Badge>
              </div>
              <CardDescription className="mt-3 max-w-3xl text-base leading-relaxed">
                {activeJob || activePackage || activeTask ? roleVisual.description : `${roleVisual.description} No visible live project or package record is selected yet.`} It never performs approval, payment, signature, or submission actions without the dedicated human-confirmed workflow.
              </CardDescription>
            </div>
            <div className="rounded-[1.1rem] border border-border bg-white/80 p-3 min-w-[180px]">
              <p className="beos-label-caps text-muted-foreground">Live projection</p>
              <p className="mt-2 text-2xl font-black tracking-[-0.055em]" style={{ color: roleVisual.accent }}>{joinedJobs.length + packages.length + delegatedTasks.length}</p>
              <p className="text-xs text-muted-foreground">visible job/package/task records</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
          {state === 'loading' && <div className="lg:col-span-3 flex items-center gap-3 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading live project state...</div>}
          <div className="lg:col-span-2 rounded-[1.25rem] border p-5 space-y-4" style={{ borderColor: roleVisual.accent, backgroundColor: roleVisual.accentSoft }}>
            <div className="flex items-center gap-3">
              <span className="rounded-[0.8rem] bg-white p-2" style={{ color: roleVisual.accent }}><ListChecks className="h-5 w-5" /></span>
              <h3 className="font-sans text-xl font-black tracking-[-0.03em]">Next Best Action</h3>
            </div>
            <p className="text-2xl font-black tracking-[-0.045em]">{nextAction.label}</p>
            <p className="text-sm text-muted-foreground leading-relaxed">{nextAction.detail}</p>
            <Button onClick={() => onNavigate?.(nextAction.target)} className="rounded-full gap-2 beos-button-shadow" style={{ backgroundColor: roleVisual.accent }}>Take next action <ArrowRight className="h-4 w-4" /></Button>
          </div>
          <div className="rounded-[1.25rem] border border-border bg-background/70 p-5 space-y-2">
            <h3 className="beos-label-caps text-muted-foreground">Current Stage</h3>
            <p className="beos-metric capitalize">{commandGuidance.stageLabel}</p>
            <p className="text-xs text-muted-foreground">From canonical project lifecycle records, with legacy scoping mapped to intake.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5">
        <MetricCard icon={<CheckCircle2 />} label="Open approvals / requirements" value={openApprovals} detail={activeJob ? 'Requirements and decision points visible from the active job.' : 'Package scope/evidence decision points visible to this role.'} accent={roleVisual.accent} />
        <MetricCard icon={<ShieldProfileIcon />} label="Profile readiness" value={`${Math.round(profileCompletion.completionRatio * 100)}%`} detail={profileCompletion.isComplete ? 'Role profile, payment, verification, and signature fields are complete.' : profileCompletion.blockers[0]} tone={profileCompletion.isComplete ? 'default' : 'danger'} target="profile" onNavigate={onNavigate} accent={roleVisual.accent} />
        <MetricCard icon={<AlertTriangle />} label="At risk / overdue" value={atRisk ? 1 : 0} detail={activeJob?.deadline ? `Deadline: ${activeJob.deadline}` : 'No deadline recorded.'} tone={atRisk ? 'danger' : 'default'} accent={roleVisual.accent} />
        <MetricCard icon={<FileText />} label="Documents" value="Files" detail="Open the file manager/toolbox for project documents and evidence." target="toolbox" onNavigate={onNavigate} accent={roleVisual.accent} />
        <MetricCard icon={<WalletCards />} label="Budget & payments" value={activeJob ? currency.format(activeJob.budget || 0) : activePackage?.estimatedBudget ? currency.format(activePackage.estimatedBudget) : 'No budget'} detail="Payments remain routed through invoice, escrow, and governance workflows." target="payments" onNavigate={onNavigate} accent={roleVisual.accent} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 rounded-[1.25rem] border-border bg-card/90 beos-soft-shadow">
          <CardHeader>
            <CardTitle className="font-sans text-xl font-black tracking-[-0.03em]">AI Summary</CardTitle>
            <CardDescription>Generated deterministically from live project/job fields. Human review required.</CardDescription>
          </CardHeader>
          <CardContent><p className="text-sm text-muted-foreground leading-relaxed">{commandGuidance.aiSummary}</p></CardContent>
        </Card>
        <Card className="rounded-[1.25rem] border-border bg-card/90 beos-soft-shadow">
          <CardHeader>
            <CardTitle className="font-sans text-xl font-black tracking-[-0.03em]">Key Dates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" /> Deadline: {activeJob?.deadline ?? activePackage?.deadline ?? activeTask?.deadline ?? 'Not recorded'}</div>
            <div className="flex items-center gap-2"><Landmark className="h-4 w-4 text-primary" /> Created: {activeJob?.createdAt ?? activePackage?.createdAt ?? activeTask?.createdAt ?? activeProject?.createdAt ?? 'Not recorded'}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[1.25rem] border-border bg-card/90 beos-soft-shadow">
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="font-sans text-xl font-black tracking-[-0.03em]">Recent Activity</CardTitle>
              <CardDescription>Latest live jobs, package records, and delegated tasks visible to this role. No mock activity is generated.</CardDescription>
            </div>
            <Badge variant="outline" className="w-fit rounded-full">live data</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {joinedJobs.length === 0 && packages.length === 0 && delegatedTasks.length === 0 ? <p className="text-sm text-muted-foreground">No live job, project, package, or delegated task records are currently visible for this role.</p> : (
            <>
              {joinedJobs.slice(0, 5).map((job) => (
                <div key={`job-${job.id}`} className="rounded-[1rem] border border-border bg-background/60 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div><p className="font-semibold">{job.title}</p><p className="text-xs text-muted-foreground">{job.location ?? 'Location not recorded'} · {job.createdAt}</p></div>
                  <Badge variant={job.status === 'in-progress' ? 'default' : 'secondary'} className="rounded-full">{job.status}</Badge>
                </div>
              ))}
              {joinedJobs.length < 5 && packages.slice(0, 5 - joinedJobs.length).map((pkg) => (
                <div key={`package-${pkg.id}`} className="rounded-[1rem] border border-border bg-background/60 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div><p className="font-semibold">{pkg.title}</p><p className="text-xs text-muted-foreground">Package · {pkg.createdAt} · {pkg.source === 'awarded' ? 'awarded to you' : 'visible opportunity'}</p></div>
                  <Badge variant={pkg.status === 'awarded' ? 'default' : 'secondary'} className="rounded-full">{pkg.status}</Badge>
                </div>
              ))}
              {joinedJobs.length + packages.length < 5 && delegatedTasks.slice(0, 5 - joinedJobs.length - packages.length).map((task) => (
                <div key={"task-" + task.id} className="rounded-[1rem] border border-border bg-background/60 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div><p className="font-semibold">{task.assigneeRole || "Delegated task"}</p><p className="text-xs text-muted-foreground">Freelancer task · {task.createdAt} · due {task.deadline || "not recorded"}</p></div>
                  <Badge variant={task.status === "completed" ? "default" : "secondary"} className="rounded-full">{task.submissionStatus?.replaceAll("_", " ") ?? task.status}</Badge>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ShieldProfileIcon() {
  return <CheckCircle2 />;
}

function MetricCard({ icon, label, value, detail, tone = 'default', target, onNavigate, accent }: { icon: React.ReactNode; label: string; value: React.ReactNode; detail: string; tone?: 'default' | 'danger'; target?: string; onNavigate?: (pageId: string) => void; accent: string }) {
  return (
    <Card className={`rounded-[1.25rem] border-border bg-card/90 beos-soft-shadow ${tone === 'danger' ? 'border-destructive/40' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3 [&>svg]:h-5 [&>svg]:w-5" style={{ color: tone === 'danger' ? '#d95747' : accent }}>{icon}<CardTitle className="font-sans text-base font-black tracking-[-0.02em] text-foreground">{label}</CardTitle></div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="beos-metric">{value}</div>
        <p className="text-xs text-muted-foreground leading-relaxed">{detail}</p>
        {target && <Button variant="outline" size="sm" className="rounded-full" onClick={() => onNavigate?.(target)}>Open</Button>}
      </CardContent>
    </Card>
  );
}
