import React, { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { AlertTriangle, CheckCircle2, Loader2, Network, Users } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { Job, Project, ProjectTeamMember, UserProfile } from '@/types';
import { DISCIPLINE_REGISTRY } from '@/types';
import { subscribeToProjectByJobId } from '@/services/projectLifecycleService';
import { getDisciplineCoverage, subscribeToTeam } from '@/services/teamService';
import ResponsibilityMatrix from './ResponsibilityMatrix';
import TeamBuilder from './TeamBuilder';
import DrawingChecklistTracker from './DrawingChecklistTracker';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

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

function jobsForUser(user: UserProfile) {
  const jobs = collection(db, 'jobs');
  if (user.role === 'admin') return query(jobs, limit(25));
  if (user.role === 'client') return query(jobs, where('clientId', '==', user.uid), limit(25));
  return query(jobs, where('selectedArchitectId', '==', user.uid), limit(25));
}

export default function DesignCompliancePage({ user }: { user: UserProfile }) {
  const [state, setState] = useState<LoadState>('loading');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [professionals, setProfessionals] = useState<UserProfile[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [project, setProject] = useState<Project | null>(null);
  const [teamMembers, setTeamMembers] = useState<ProjectTeamMember[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(jobsForUser(user), (snapshot) => {
      setJobs(sortByRecent(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Job))));
      setState('ready');
    }, (error) => {
      console.error('Failed to load design compliance jobs:', error);
      setState('error');
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const professionalQuery = query(collection(db, 'users'), where('role', 'in', ['architect', 'bep', 'freelancer']), limit(50));
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
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">Design & Compliance</Badge>
              <CardTitle className="font-heading text-3xl mt-3">Design team responsibility matrix</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">Live discipline coverage, responsibility assignment, professional invitations, and compliance gaps from project records. Missing disciplines remain command-centre blockers until covered by accountable humans.</CardDescription>
            </div>
            <Badge className="capitalize w-fit">{user.role}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {state === 'loading' && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading design records...</div>}
          {state === 'error' && <div className="text-sm text-destructive">Unable to load design records. Check Firestore rules and indexes.</div>}
          {jobs.length > 0 && <select value={selectedJob?.id ?? ''} onChange={(event) => setSelectedJobId(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm md:max-w-xl">{jobs.map((job) => <option key={job.id} value={job.id}>{job.title} · {job.category}</option>)}</select>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard icon={<CheckCircle2 />} label="Filled disciplines" value={coverage.filled.length} />
        <MetricCard icon={<AlertTriangle />} label="Missing disciplines" value={coverage.missing.length} danger={coverage.missing.length > 0} />
        <MetricCard icon={<Users />} label="Professionals visible" value={professionals.length} />
      </div>

      {!selectedJob && <Card className="rounded-2xl border-dashed border-border"><CardContent className="p-8 text-center text-sm text-muted-foreground">No live design projects are visible for this role.</CardContent></Card>}
      {selectedJob && !project && <Card className="rounded-2xl border-amber-200 bg-amber-50 text-amber-900"><CardContent className="p-5"><p className="font-semibold">Project lifecycle record not found.</p><p className="text-sm">Team assignment activates once this job has an associated project record.</p></CardContent></Card>}

      {coverage.missing.length > 0 && <Card className="rounded-2xl border-border bg-card/90"><CardHeader><CardTitle className="font-heading text-xl flex items-center gap-2"><Network className="h-5 w-5 text-primary" /> Coverage gaps</CardTitle><CardDescription>These disciplines still need assignment, invitation acceptance, or professional confirmation.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2">{coverage.missing.map((discipline) => <Badge key={discipline} variant="outline" className="border-dashed">{labelFor(discipline)}</Badge>)}</CardContent></Card>}

      {selectedJob && project && <DrawingChecklistTracker project={project} job={selectedJob} user={user} />}
      {selectedJob && <ResponsibilityMatrix job={selectedJob} project={project} teamMembers={teamMembers} professionals={professionals} currentUser={user} />}
      {selectedJob && <TeamBuilder job={selectedJob} project={project} teamMembers={teamMembers} professionals={professionals} currentUser={user} />}
    </div>
  );
}

function MetricCard({ icon, label, value, danger = false }: { icon: React.ReactNode; label: string; value: React.ReactNode; danger?: boolean }) {
  return <Card className={`rounded-2xl bg-card/90 shadow-sm ${danger ? 'border-destructive/40' : 'border-border'}`}><CardHeader className="pb-3"><div className="flex items-center gap-2 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}<CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</CardTitle></div></CardHeader><CardContent><p className="font-heading text-3xl font-black">{value}</p></CardContent></Card>;
}
