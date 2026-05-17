import React, { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { Briefcase, Loader2 } from 'lucide-react';
import { db } from '../lib/firebase';
import type { Job, Project, UserProfile } from '../types';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import GanttChart from './GanttChart';
import RFIManager from './RFIManager';
import SiteLogManager from './SiteLogManager';
import StageProgressTracker from './StageProgressTracker';
import FinancialDashboard from './FinancialDashboard';
import CloseoutWizard from './CloseoutWizard';
import InvoiceManagement from './InvoiceManagement';
import MunicipalTracker from './MunicipalTracker';
import ProjectMessengerPage from './ProjectMessengerPage';
import ContractSigningPage from './ContractSigningPage';
import DisputeResolutionPage from './DisputeResolutionPage';

type Props = {
  pageId: string;
  user: UserProfile;
};

type LoadState = 'loading' | 'ready';

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

function projectQueryForUser(user: UserProfile) {
  const projects = collection(db, 'projects');
  if (user.role === 'client') return query(projects, where('clientId', '==', user.uid), limit(25));
  if (user.role === 'architect' || user.role === 'bep') return query(projects, where('leadArchitectId', '==', user.uid), limit(25));
  if (user.role === 'admin') return query(projects, limit(25));
  return null;
}

function jobQueryForUser(user: UserProfile) {
  const jobs = collection(db, 'jobs');
  if (user.role === 'client') return query(jobs, where('clientId', '==', user.uid), limit(25));
  if (user.role === 'architect' || user.role === 'bep' || user.role === 'freelancer') return query(jobs, where('selectedArchitectId', '==', user.uid), limit(25));
  if (user.role === 'admin') return query(jobs, limit(25));
  return query(jobs, where('status', '==', 'open'), limit(25));
}

export default function ProjectWorkflowPage({ pageId, user }: Props) {
  const [state, setState] = useState<LoadState>('loading');
  const [projects, setProjects] = useState<Project[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    setState('loading');
    const projectQuery = projectQueryForUser(user);
    const unsubProjects = projectQuery && canListProjectsByRole(user) ? onSnapshot(projectQuery, (snapshot) => {
      setProjects(sortByRecent(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Project))));
      setState('ready');
    }, (error) => {
      console.warn('Workflow project projection unavailable; continuing without project context:', error);
      setProjects([]);
      setState('ready');
    }) : null;
    const unsubJobs = onSnapshot(jobQueryForUser(user), (snapshot) => {
      setJobs(sortByRecent(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Job))));
      if (!projectQuery) setState('ready');
    }, (error) => {
      console.warn('Workflow job projection unavailable; continuing without job context:', error);
      setJobs([]);
      setState('ready');
    });
    if (!projectQuery) setState('ready');
    return () => { unsubProjects?.(); unsubJobs(); };
  }, [user]);

  const activeProject = useMemo(() => projects[0], [projects]);
  const activeJob = useMemo(() => jobs.find((job) => job.id === activeProject?.jobId) ?? jobs[0], [activeProject?.jobId, jobs]);

  if (state === 'loading') {
    return <WorkflowFrame pageId={pageId} user={user}><div className="flex items-center gap-3 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading live project workflow...</div></WorkflowFrame>;
  }

  if ((pageId === 'payments' || pageId === 'escrow')) {
    return <WorkflowFrame pageId={pageId} user={user}><FinancialDashboard user={user} /></WorkflowFrame>;
  }

  if (pageId === 'municipal-tracker') {
    return <MunicipalTracker user={user} />;
  }

  if (pageId === 'messages') {
    return <ProjectMessengerPage user={user} />;
  }

  if (pageId === 'contracts') {
    return <ContractSigningPage user={user} />;
  }

  if (pageId === 'disputes') {
    return <DisputeResolutionPage user={user} />;
  }

  if (!activeProject && ['journey', 'programme', 'construction', 'snagging'].includes(pageId)) {
    return <WorkflowFrame pageId={pageId} user={user}><EmptyWorkflow icon={<Briefcase />} title="No active project found" description="This page only renders live project operations. Create or appoint a project first, then this workflow will load lifecycle, programme, RFI, site-log, and close-out records." /></WorkflowFrame>;
  }

  return (
    <WorkflowFrame pageId={pageId} user={user} project={activeProject} job={activeJob}>
      {pageId === 'journey' && activeProject && (
        <StageProgressTracker currentStage={activeProject.currentStage} stageHistory={activeProject.stageHistory} />
      )}
      {pageId === 'programme' && activeProject && (
        <GanttChart projectId={activeProject.id} teamMembers={activeProject.teamMembers} />
      )}
      {pageId === 'construction' && activeProject && (
        <div className="space-y-6">
          <GanttChart projectId={activeProject.id} teamMembers={activeProject.teamMembers} />
          <RFIManager projectId={activeProject.id} jobId={activeProject.jobId} currentUser={user} teamMembers={activeProject.teamMembers} />
          <SiteLogManager projectId={activeProject.id} jobId={activeProject.jobId} currentUserId={user.uid} />
        </div>
      )}
      {pageId === 'snagging' && activeProject && <CloseoutWizard projectId={activeProject.id} />}
      {pageId === 'invoicing' && <InvoiceManagement user={user} />}
    </WorkflowFrame>
  );
}

function WorkflowFrame({ pageId, user, project, job, children }: React.PropsWithChildren<{ pageId: string; user: UserProfile; project?: Project; job?: Job }>) {
  return (
    <div className="space-y-6" data-testid={`workflow-page-${pageId}`}>
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">{pageId.replaceAll('-', ' ')}</Badge>
              <CardTitle className="font-heading text-3xl mt-3">{job?.title ?? project?.id ?? 'Live workflow'}</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">Production workflow composed from existing services and live Firestore records for {user.role}. Unsafe approvals, payments, signatures, and submissions remain human-confirmed.</CardDescription>
            </div>
            <Badge className="capitalize w-fit">{user.role}</Badge>
          </div>
        </CardHeader>
      </Card>
      {children}
    </div>
  );
}

function EmptyWorkflow({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <Card className="rounded-2xl border-border bg-card/90">
      <CardContent className="p-8 flex items-start gap-4">
        <div className="rounded-2xl bg-primary/10 text-primary p-3 [&>svg]:h-6 [&>svg]:w-6">{icon}</div>
        <div>
          <h3 className="font-heading text-xl font-bold">{title}</h3>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
