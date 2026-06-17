import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';
import { CheckCircle2, Loader2, Network, ShieldCheck, Users } from 'lucide-react';
import { db } from '../lib/firebase';
import type { Job, Project, UserProfile } from '../types';
import { getDisciplineCoverage } from '../services/teamService';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import ResponsibilityMatrix from './ResponsibilityMatrix';
import TeamBuilder from './TeamBuilder';


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

function projectQueryForUser(user: UserProfile) {
  const projects = getDemoCol( 'projects');
  if (user.role === 'admin') return query(projects, limit(40));
  return query(projects, where('leadArchitectId', '==', user.uid), limit(40));
}

function isDesignProfessional(profile: UserProfile) {
  return ['architect', 'bep', 'freelancer'].includes(profile.role);
}

export default function DesignTeamMatrixPage({ user }: { user: UserProfile }) {
  const [state, setState] = useState<LoadState>('loading');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [professionals, setProfessionals] = useState<UserProfile[]>([]);

  useEffect(() => {
    setState('loading');
    const unsubProjects = onSnapshot(projectQueryForUser(user), (snapshot) => {
      const liveProjects = sortByRecent(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Project)));
      setProjects(liveProjects);
      setSelectedProjectId((current) => current || liveProjects[0]?.id || '');
      setState('ready');
    }, (error) => {
      console.warn('Design team project matrix unavailable:', error);
      setProjects([]);
      setState('error');
    });

    const unsubProfessionals = onSnapshot(query(getDemoCol( 'users'), limit(150)), (snapshot) => {
      setProfessionals(snapshot.docs.map((docSnap) => ({ uid: docSnap.id, ...docSnap.data() } as UserProfile)).filter(isDesignProfessional));
    }, (error) => {
      console.warn('Design team professional directory unavailable:', error);
      setProfessionals([]);
    });

    return () => {
      unsubProjects();
      unsubProfessionals();
    };
  }, [user]);

  const selectedProject = useMemo(() => projects.find((project) => project.id === selectedProjectId) ?? projects[0], [projects, selectedProjectId]);

  useEffect(() => {
    if (!selectedProject?.jobId) {
      setJob(null);
      return undefined;
    }
    return onSnapshot(getDemoDoc( 'jobs', selectedProject.jobId), (snapshot) => {
      setJob(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Job) : null);
    }, (error) => {
      console.warn('Design team job context unavailable:', error);
      setJob(null);
    });
  }, [selectedProject?.jobId]);

  const coverage = useMemo(() => selectedProject ? getDisciplineCoverage({ ...selectedProject, category: job?.category }) : null, [job?.category, selectedProject]);
  const teamMembers = selectedProject?.teamMembers ?? [];
  const activeMembers = teamMembers.filter((member) => member.status === 'active').length;
  const pendingMembers = teamMembers.filter((member) => member.status === 'invited').length;

  return (
    <div className="space-y-6" data-testid="design-team-matrix-page">
      <Card className="overflow-hidden rounded-[2rem] border-border bg-card/95 shadow-sm">
        <CardHeader className="border-b border-border bg-primary/5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Badge variant="secondary" className="w-fit uppercase tracking-widest">BEP Tools</Badge>
              <CardTitle className="mt-3 flex items-center gap-3 font-heading text-3xl"><Network className="h-7 w-7 text-primary" /> Design Team Matrix</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base leading-relaxed">
                Manage live discipline coverage, consultant invitations, and responsibility gaps using the existing project team roster. No synthetic team members are generated.
              </CardDescription>
            </div>
            <Badge className="w-fit capitalize">{user.role}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          {state === 'loading' && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading live project team matrix...</div>}
          {state === 'error' && <div className="text-sm text-destructive">Unable to load design team projects. Check project permissions.</div>}
          {projects.length > 0 ? (
            <select value={selectedProject?.id ?? ''} onChange={(event) => setSelectedProjectId(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm md:max-w-2xl">
              {projects.map((project) => <option key={project.id} value={project.id}>{project.id} · {project.currentStage}</option>)}
            </select>
          ) : state !== 'loading' && (
            <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No lead design-team projects are visible for this role yet.</div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Metric icon={<Users />} label="Team members" value={teamMembers.length} />
        <Metric icon={<CheckCircle2 />} label="Active" value={activeMembers} />
        <Metric icon={<Loader2 />} label="Invited" value={pendingMembers} />
        <Metric icon={<ShieldCheck />} label="Missing disciplines" value={coverage?.missing.length ?? 0} />
      </div>

      {selectedProject && job ? (
        <div className="space-y-6">
          <Card className="rounded-2xl border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="font-heading text-xl">{job.title}</CardTitle>
              <CardDescription>{job.category} project. Filled disciplines: {coverage?.filled.length ?? 0}. Missing disciplines: {coverage?.missing.length ?? 0}.</CardDescription>
            </CardHeader>
            {coverage?.missing.length ? <CardContent className="flex flex-wrap gap-2">{coverage.missing.map((discipline) => <Badge key={discipline} variant="outline" className="rounded-full">{discipline}</Badge>)}</CardContent> : null}
          </Card>
          <ResponsibilityMatrix job={job} project={selectedProject} teamMembers={teamMembers} professionals={professionals} currentUser={user} />
          <TeamBuilder job={job} project={selectedProject} teamMembers={teamMembers} professionals={professionals} currentUser={user} />
        </div>
      ) : state !== 'loading' && (
        <Card className="rounded-2xl border-border bg-card/90"><CardContent className="p-10 text-center text-sm text-muted-foreground">Select a live project with a linked job to load the responsibility matrix and team builder.</CardContent></Card>
      )}
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return <Card className="rounded-2xl border-border bg-card/90 shadow-sm"><CardHeader className="pb-3"><div className="flex items-center gap-2 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}<CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</CardTitle></div></CardHeader><CardContent><p className="font-heading text-3xl font-black">{value}</p></CardContent></Card>;
}
