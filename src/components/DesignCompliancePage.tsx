import React, { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { AlertTriangle, CheckCircle2, Loader2, Network, Users } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { Job, Project, ProjectTeamMember, UserProfile } from '@/types';
import { DISCIPLINE_REGISTRY } from '@/types';
import { subscribeToMergedQuerySnapshots } from '@/lib/firestoreQueryMerge';
import { subscribeToProjectByJobId } from '@/services/projectLifecycleService';
import { getDisciplineCoverage, subscribeToTeam } from '@/services/teamService';
import ResponsibilityMatrix from './ResponsibilityMatrix';
import TeamBuilder from './TeamBuilder';
import DrawingChecklistTracker from './DrawingChecklistTracker';
import { Badge } from './ui/badge';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
type LoadState = 'loading' | 'ready' | 'error';

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
  if (user.role === 'admin') return [query(jobs, limit(25))];
  if (user.role === 'client') return [query(jobs, where('clientId', '==', user.uid), limit(25))];
  return [
    query(jobs, where('selectedProfessionalId', '==', user.uid), limit(25)),
    query(jobs, where('selectedBepId', '==', user.uid), limit(25)),
    query(jobs, where('selectedArchitectId', '==', user.uid), limit(25)),
  ];
}

export default function DesignCompliancePage({ user }: { user: UserProfile }) {
  const [state, setState] = useState<LoadState>('loading');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [professionals, setProfessionals] = useState<UserProfile[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [project, setProject] = useState<Project | null>(null);
  const [teamMembers, setTeamMembers] = useState<ProjectTeamMember[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToMergedQuerySnapshots<Job>(jobQueriesForUser(user), (docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Job), (items) => {
      setJobs(sortByRecent(items));
      setState('ready');
    }, (error) => {
      console.error('Failed to load design compliance jobs:', error);
      setState('error');
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const professionalQuery = query(getDemoCol( 'users'), where('role', 'in', ['architect', 'bep', 'freelancer']), limit(50));
    const unsubscribe = onSnapshot(professionalQuery, (snapshot) => {
      setProfessionals(snapshot.docs.map((docSnap) => ({ uid: docSnap.id, ...docSnap.data() } as UserProfile)));
    }, (error) => console.error('Failed to load design professionals:', error));
    return () => unsubscribe();
  }, []);

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) ?? jobs.find((job) => job.status === 'in-progress') ?? jobs[0], [jobs, selectedJobId]);

  useEffect(() => {
    if (!selectedJob?.id) {
      setProject(null);
      return undefined;
    }
    return subscribeToProjectByJobId(selectedJob.id, setProject);
  }, [selectedJob?.id]);

  useEffect(() => {
    if (!project?.id) {
      setTeamMembers([]);
      return undefined;
    }
    return subscribeToTeam(project.id, setTeamMembers);
  }, [project?.id]);

  const coverage = useMemo(() => {
    if (!selectedJob) return { filled: [], missing: [] };
    if (!project) return { filled: [], missing: DISCIPLINE_REGISTRY.filter((discipline) => discipline.requiredFor.includes(selectedJob.category)).map((discipline) => discipline.key) };
    return getDisciplineCoverage({ ...project, category: selectedJob.category, teamMembers });
  }, [project, selectedJob, teamMembers]);

  const labelFor = (key: string) => DISCIPLINE_REGISTRY.find((discipline) => discipline.key === key)?.label ?? key;

  return (
    <div className="space-y-6" data-testid="design-compliance-page">
      <section className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-border/40">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <span className="glass-pill text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-widest text-foreground-muted">Design &amp; Compliance</span>
              <h1 className="font-heading text-3xl mt-3 text-foreground">Design team responsibility matrix</h1>
              <p className="mt-2 max-w-3xl text-base text-foreground-muted">Live discipline coverage, responsibility assignment, professional invitations, and compliance gaps from project records. Missing disciplines remain command-centre blockers until covered by accountable humans.</p>
            </div>
            <Badge className="capitalize w-fit">{user.role}</Badge>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {state === 'loading' && <div className="flex items-center gap-2 text-sm text-foreground-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading design records...</div>}
          {state === 'error' && <div className="text-sm text-destructive">Unable to load design records. Check Firestore rules and indexes.</div>}
          {jobs.length > 0 && <select value={selectedJob?.id ?? ''} onChange={(event) => setSelectedJobId(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm md:max-w-xl">{jobs.map((job) => <option key={job.id} value={job.id}>{job.title} · {job.category}</option>)}</select>}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard icon={<CheckCircle2 />} label="Filled disciplines" value={coverage.filled.length} />
        <MetricCard icon={<AlertTriangle />} label="Missing disciplines" value={coverage.missing.length} danger={coverage.missing.length > 0} />
        <MetricCard icon={<Users />} label="Professionals visible" value={professionals.length} />
      </div>

      {!selectedJob && <div className="glass-panel rounded-2xl p-8 text-center text-sm text-foreground-muted">No live design projects are visible for this role.</div>}
      {selectedJob && !project && <div className="glass-panel rounded-2xl p-5 border-amber-300/60"><p className="font-semibold text-foreground">Project lifecycle record not found.</p><p className="text-sm text-foreground-muted">Team assignment activates once this job has an associated project record.</p></div>}

      {coverage.missing.length > 0 && (
        <section className="glass-panel rounded-2xl p-6">
          <div className="mb-4">
            <h2 className="font-heading text-xl flex items-center gap-2 text-foreground"><Network className="h-5 w-5 text-primary" /> Coverage gaps</h2>
            <p className="text-sm text-foreground-muted mt-1">These disciplines still need assignment, invitation acceptance, or professional confirmation.</p>
          </div>
          <div className="flex flex-wrap gap-2">{coverage.missing.map((discipline) => <Badge key={discipline} variant="outline" className="border-dashed">{labelFor(discipline)}</Badge>)}</div>
        </section>
      )}

      {selectedJob && project && <DrawingChecklistTracker project={project} job={selectedJob} user={user} />}
      {selectedJob && <ResponsibilityMatrix job={selectedJob} project={project} teamMembers={teamMembers} professionals={professionals} currentUser={user} />}
      {selectedJob && <TeamBuilder job={selectedJob} project={project} teamMembers={teamMembers} professionals={professionals} currentUser={user} />}
    </div>
  );
}

function MetricCard({ icon, label, value, danger = false }: { icon: React.ReactNode; label: string; value: React.ReactNode; danger?: boolean }) {
  return (
    <div className={`glass-tile rounded-xl p-5 space-y-3 ${danger ? 'border-destructive/40' : ''}`}>
      <div className={`flex items-center gap-2 [&>svg]:h-5 [&>svg]:w-5 ${danger ? 'text-destructive' : 'text-primary'}`}>
        {icon}
        <h3 className="text-xs font-bold uppercase tracking-widest text-foreground-muted">{label}</h3>
      </div>
      <p className="font-heading text-3xl font-black text-foreground">{value}</p>
    </div>
  );
}
