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


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
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
  engineer: { viewLabel: 'Engineer View', headline: 'Lead engineering delivery.', description: 'Manage calculations, compliance sign-off, and technical coordination.', accent: '#1565c0', accentSoft: 'rgba(21, 101, 192, 0.12)' },
  quantity_surveyor: { viewLabel: 'QS View', headline: 'Own the commercial position.', description: 'Track cost plans, BoQs, valuations, and financial governance.', accent: '#00838f', accentSoft: 'rgba(0, 131, 143, 0.12)' },
  town_planner: { viewLabel: 'Planner View', headline: 'Secure planning certainty.', description: 'Manage zoning applications, land use consents, and statutory pathways.', accent: '#6a1b9a', accentSoft: 'rgba(106, 27, 154, 0.12)' },
  energy_professional: { viewLabel: 'Energy View', headline: 'Drive sustainability compliance.', description: 'Lead energy modelling, XA sign-off, and green building targets.', accent: '#2e7d32', accentSoft: 'rgba(46, 125, 50, 0.12)' },
  fire_engineer: { viewLabel: 'Fire View', headline: 'Own life safety design.', description: 'Manage rational fire designs, detection layouts, and SANS 10400-T.', accent: '#c62828', accentSoft: 'rgba(198, 40, 40, 0.12)' },
  site_manager: { viewLabel: 'Site View', headline: 'Run the site.', description: 'Track daily programme, H&S, deliveries, and site evidence.', accent: '#e65100', accentSoft: 'rgba(230, 81, 0, 0.12)' },
  developer: { viewLabel: 'Developer View', headline: 'Govern the portfolio.', description: 'Oversee project health, investment returns, and programme strategy.', accent: '#37474f', accentSoft: 'rgba(55, 71, 79, 0.12)' },
  firm_admin: { viewLabel: 'Firm View', headline: 'Run the practice.', description: 'Manage staff, CPD, registrations, and practice operations.', accent: '#4e342e', accentSoft: 'rgba(78, 52, 46, 0.12)' },
  platform_admin: { viewLabel: 'Platform View', headline: 'Full platform control.', description: 'Govern system configuration, compliance, and platform-wide operations.', accent: '#ba1a1a', accentSoft: 'rgba(186, 26, 26, 0.11)' },
  land_surveyor: { viewLabel: 'Surveyor View', headline: 'Verify boundaries and cadastral records.', description: 'Manage site surveys, SG diagrams, servitudes, and subdivision workflows.', accent: '#5d4037', accentSoft: 'rgba(93, 64, 55, 0.12)' },
  cpm: { viewLabel: 'CPM View', headline: 'Coordinate programme delivery.', description: 'Oversee construction programme, risk management, and delivery governance.', accent: '#1a237e', accentSoft: 'rgba(26, 35, 126, 0.12)' },
  health_safety: { viewLabel: 'H&S View', headline: 'Govern site safety.', description: 'Manage safety files, permits, inductions, incidents, and OHS compliance.', accent: '#f57c00', accentSoft: 'rgba(245, 124, 0, 0.12)' },
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
  const jobs = getDemoCol( 'jobs');

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
  const tenders = getDemoCol( 'tender_packages');

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
  return query(getDemoCol( 'delegatedTasks'), where('assigneeId', '==', user.uid), limit(25));
}

function projectQueriesForUser(user: UserProfile) {
  const projects = getDemoCol( 'projects');

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
      <section className="glass-panel rounded-2xl overflow-hidden" style={{ borderTop: `4px solid ${roleVisual.accent}` }}>
        <div className="p-6 border-b border-border/40">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <span className="glass-pill text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wide text-foreground-muted">Command Centre</span>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-[-0.04em] text-foreground">{activeJob?.title ?? roleVisual.headline}</h1>
                <span className="rounded-full border-0 text-white text-xs font-semibold px-3 py-1" style={{ backgroundColor: roleVisual.accent }}>{roleVisual.viewLabel}</span>
              </div>
              <p className="mt-3 max-w-3xl text-base leading-relaxed text-foreground-muted">
                {activeJob || activePackage || activeTask ? roleVisual.description : `${roleVisual.description} No visible live project or package record is selected yet.`} It never performs approval, payment, signature, or submission actions without the dedicated human-confirmed workflow.
              </p>
            </div>
            <div className="glass-tile rounded-xl p-4 min-w-[180px]">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Live projection</p>
              <p className="mt-2 text-2xl font-black tracking-[-0.04em]" style={{ color: roleVisual.accent }}>{joinedJobs.length + packages.length + delegatedTasks.length}</p>
              <p className="text-xs text-foreground-muted">visible job/package/task records</p>
            </div>
          </div>
        </div>
        <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
          {state === 'loading' && <div className="lg:col-span-3 flex items-center gap-3 text-foreground-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading live project state...</div>}
          <div className="lg:col-span-2 glass-tile rounded-xl p-5 space-y-4" style={{ borderColor: roleVisual.accent }}>
            <div className="flex items-center gap-3">
              <span className="glass-icon-box p-2" style={{ color: roleVisual.accent }}><ListChecks className="h-5 w-5" /></span>
              <h3 className="font-heading text-xl font-bold tracking-[-0.02em] text-foreground">Next Best Action</h3>
            </div>
            <p className="text-2xl font-black tracking-[-0.04em] text-foreground">{nextAction.label}</p>
            <p className="text-sm text-foreground-muted leading-relaxed">{nextAction.detail}</p>
            <Button onClick={() => onNavigate?.(nextAction.target)} className="rounded-full gap-2 text-white" style={{ backgroundColor: roleVisual.accent }}>Take next action <ArrowRight className="h-4 w-4" /></Button>
          </div>
          <div className="glass-tile rounded-xl p-5 space-y-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Current Stage</h3>
            <p className="text-2xl font-black tracking-[-0.04em] capitalize text-foreground">{commandGuidance.stageLabel}</p>
            <p className="text-xs text-foreground-muted">From canonical project lifecycle records, with legacy scoping mapped to intake.</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5">
        <MetricCard icon={<CheckCircle2 />} label="Open approvals / requirements" value={openApprovals} detail={activeJob ? 'Requirements and decision points visible from the active job.' : 'Package scope/evidence decision points visible to this role.'} accent={roleVisual.accent} />
        <MetricCard icon={<ShieldProfileIcon />} label="Profile readiness" value={`${Math.round(profileCompletion.completionRatio * 100)}%`} detail={profileCompletion.isComplete ? 'Role profile, payment, verification, and signature fields are complete.' : profileCompletion.blockers[0]} tone={profileCompletion.isComplete ? 'default' : 'danger'} target="profile" onNavigate={onNavigate} accent={roleVisual.accent} />
        <MetricCard icon={<AlertTriangle />} label="At risk / overdue" value={atRisk ? 1 : 0} detail={activeJob?.deadline ? `Deadline: ${activeJob.deadline}` : 'No deadline recorded.'} tone={atRisk ? 'danger' : 'default'} accent={roleVisual.accent} />
        <MetricCard icon={<FileText />} label="Documents" value="Files" detail="Open the file manager/toolbox for project documents and evidence." target="toolbox" onNavigate={onNavigate} accent={roleVisual.accent} />
        <MetricCard icon={<WalletCards />} label="Budget & payments" value={activeJob ? currency.format(activeJob.budget || 0) : activePackage?.estimatedBudget ? currency.format(activePackage.estimatedBudget) : 'No budget'} detail="Payments remain routed through invoice, escrow, and governance workflows." target="payments" onNavigate={onNavigate} accent={roleVisual.accent} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <section className="lg:col-span-2 glass-panel rounded-2xl p-6">
          <div className="mb-4">
            <h2 className="font-heading text-xl font-bold tracking-[-0.02em] text-foreground">AI Summary</h2>
            <p className="text-sm text-foreground-muted">Generated deterministically from live project/job fields. Human review required.</p>
          </div>
          <p className="text-sm text-foreground-muted leading-relaxed">{commandGuidance.aiSummary}</p>
        </section>
        <section className="glass-panel rounded-2xl p-6">
          <h2 className="font-heading text-xl font-bold tracking-[-0.02em] text-foreground mb-4">Key Dates</h2>
          <div className="space-y-3 text-sm text-foreground">
            <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" /> Deadline: {activeJob?.deadline ?? activePackage?.deadline ?? activeTask?.deadline ?? 'Not recorded'}</div>
            <div className="flex items-center gap-2"><Landmark className="h-4 w-4 text-primary" aria-hidden="true" /> Created: {activeJob?.createdAt ?? activePackage?.createdAt ?? activeTask?.createdAt ?? activeProject?.createdAt ?? 'Not recorded'}</div>
          </div>
        </section>
      </div>

      <section className="glass-panel rounded-2xl p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h2 className="font-heading text-xl font-bold tracking-[-0.02em] text-foreground">Recent Activity</h2>
            <p className="text-sm text-foreground-muted">Latest live jobs, package records, and delegated tasks visible to this role. No mock activity is generated.</p>
          </div>
          <span className="glass-pill w-fit rounded-full text-xs px-3 py-1 text-foreground-muted">live data</span>
        </div>
        <div className="space-y-3">
          {joinedJobs.length === 0 && packages.length === 0 && delegatedTasks.length === 0 ? <p className="text-sm text-foreground-muted">No live job, project, package, or delegated task records are currently visible for this role.</p> : (
            <>
              {joinedJobs.slice(0, 5).map((job) => (
                <div key={`job-${job.id}`} className="glass-record rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div><p className="font-semibold text-foreground">{job.title}</p><p className="text-xs text-foreground-muted">{job.location ?? 'Location not recorded'} · {job.createdAt}</p></div>
                  <Badge variant={job.status === 'in-progress' ? 'default' : 'secondary'} className="rounded-full">{job.status}</Badge>
                </div>
              ))}
              {joinedJobs.length < 5 && packages.slice(0, 5 - joinedJobs.length).map((pkg) => (
                <div key={`package-${pkg.id}`} className="glass-record rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div><p className="font-semibold text-foreground">{pkg.title}</p><p className="text-xs text-foreground-muted">Package · {pkg.createdAt} · {pkg.source === 'awarded' ? 'awarded to you' : 'visible opportunity'}</p></div>
                  <Badge variant={pkg.status === 'awarded' ? 'default' : 'secondary'} className="rounded-full">{pkg.status}</Badge>
                </div>
              ))}
              {joinedJobs.length + packages.length < 5 && delegatedTasks.slice(0, 5 - joinedJobs.length - packages.length).map((task) => (
                <div key={"task-" + task.id} className="glass-record rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div><p className="font-semibold text-foreground">{task.assigneeRole || "Delegated task"}</p><p className="text-xs text-foreground-muted">Freelancer task · {task.createdAt} · due {task.deadline || "not recorded"}</p></div>
                  <Badge variant={task.status === "completed" ? "default" : "secondary"} className="rounded-full">{task.submissionStatus?.replaceAll("_", " ") ?? task.status}</Badge>
                </div>
              ))}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function ShieldProfileIcon() {
  return <CheckCircle2 />;
}

function MetricCard({ icon, label, value, detail, tone = 'default', target, onNavigate, accent }: { icon: React.ReactNode; label: string; value: React.ReactNode; detail: string; tone?: 'default' | 'danger'; target?: string; onNavigate?: (pageId: string) => void; accent: string }) {
  return (
    <div className={`glass-tile rounded-xl p-5 space-y-2 ${tone === 'danger' ? 'border-destructive/40' : ''}`}>
      <div className="flex items-center gap-3 [&>svg]:h-5 [&>svg]:w-5" style={{ color: tone === 'danger' ? '#d95747' : accent }}>{icon}<h3 className="font-heading text-base font-bold tracking-[-0.01em] text-foreground">{label}</h3></div>
      <div className="text-2xl font-black tracking-[-0.04em] text-foreground">{value}</div>
      <p className="text-xs text-foreground-muted leading-relaxed">{detail}</p>
      {target && <Button variant="outline" size="sm" className="rounded-full" onClick={() => onNavigate?.(target)}>Open</Button>}
    </div>
  );
}
