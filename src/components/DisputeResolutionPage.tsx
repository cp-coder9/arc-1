import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { addDoc, collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { AlertTriangle, Gavel, Loader2, Plus, ShieldCheck } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { Dispute, Job, UserProfile } from '@/types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';
import { getSelectedProfessionalId, isSelectedProfessional } from '@/lib/professionalRoleCompatibility';
import { subscribeToMergedQuerySnapshots } from '@/lib/firestoreQueryMerge';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
type LoadState = 'loading' | 'ready' | 'error';

/** Maximum disputes shown in cross-project mode */
const CROSS_PROJECT_LIMIT = 75;

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
  if (user.role === 'admin') return [query(jobs, limit(40))];
  if (user.role === 'client') return [query(jobs, where('clientId', '==', user.uid), limit(40))];
  if (user.role === 'architect' || user.role === 'bep' || user.role === 'freelancer') return [
    query(jobs, where('selectedProfessionalId', '==', user.uid), limit(40)),
    query(jobs, where('selectedBepId', '==', user.uid), limit(40)),
    query(jobs, where('selectedArchitectId', '==', user.uid), limit(40)),
  ];
  return [query(jobs, where('status', '==', 'open'), limit(40))];
}

/**
 * Build dispute queries scoped by role for cross-project mode.
 * - admin: all disputes (limited to 75)
 * - client: disputes on jobs where they are clientId (fetched via job context, plus filed/against)
 * - architect/bep/freelancer: disputes on assigned jobs (fetched via job context, plus filed/against)
 * - other roles: only disputes they filed or filed against them
 */
function disputeQueriesForUser(user: UserProfile) {
  const disputes = getDemoCol( 'disputes');
  if (user.role === 'admin') return [query(disputes, limit(CROSS_PROJECT_LIMIT))];
  // For client, architect, bep, freelancer: fetch disputes filed by/against them.
  // Job-based visibility is handled via client-side filtering against loaded jobs.
  return [
    query(disputes, where('filedBy', '==', user.uid), limit(CROSS_PROJECT_LIMIT)),
    query(disputes, where('filedAgainst', '==', user.uid), limit(CROSS_PROJECT_LIMIT)),
  ];
}

/**
 * Filter disputes by role-scoped visibility in cross-project mode.
 * - admin: sees all disputes
 * - client: disputes on jobs where they are clientId
 * - architect/bep/freelancer: disputes on jobs where they are assigned (selectedProfessionalId/selectedBepId/selectedArchitectId)
 * - other roles: disputes they filed or filed against them
 */
export function filterDisputesByRoleScope(disputes: Dispute[], jobs: Job[], user: UserProfile): Dispute[] {
  if (user.role === 'admin') return disputes.slice(0, CROSS_PROJECT_LIMIT);

  const userJobIds = new Set<string>();

  if (user.role === 'client') {
    jobs.filter((job) => job.clientId === user.uid).forEach((job) => userJobIds.add(job.id));
  } else if (user.role === 'architect' || user.role === 'bep' || user.role === 'freelancer') {
    jobs.filter((job) => isSelectedProfessional(job, user.uid)).forEach((job) => userJobIds.add(job.id));
  }

  // For client/architect/bep/freelancer: disputes on their jobs OR filed by/against them
  if (user.role === 'client' || user.role === 'architect' || user.role === 'bep' || user.role === 'freelancer') {
    const filtered = disputes.filter(
      (dispute) => userJobIds.has(dispute.jobId) || dispute.filedBy === user.uid || dispute.filedAgainst === user.uid
    );
    return filtered.slice(0, CROSS_PROJECT_LIMIT);
  }

  // Other roles: only disputes they filed or filed against them
  const filtered = disputes.filter(
    (dispute) => dispute.filedBy === user.uid || dispute.filedAgainst === user.uid
  );
  return filtered.slice(0, CROSS_PROJECT_LIMIT);
}

function counterpartyForJob(user: UserProfile, job?: Job) {
  if (!job) return '';
  if (job.clientId === user.uid) return getSelectedProfessionalId(job);
  if (isSelectedProfessional(job, user.uid)) return job.clientId || '';
  return '';
}

function canFileDispute(user: UserProfile, job?: Job) {
  if (!job) return false;
  return job.clientId === user.uid || isSelectedProfessional(job, user.uid);
}

function statusVariant(status?: string) {
  if (status === 'resolved') return 'default' as const;
  if (status === 'rejected') return 'destructive' as const;
  return 'secondary' as const;
}

interface DisputeResolutionPageProps {
  user: UserProfile;
  /** When provided, page operates in project-scoped mode — only disputes for this project's job are shown */
  projectId?: string;
}

export default function DisputeResolutionPage({ user, projectId }: DisputeResolutionPageProps) {
  const [jobState, setJobState] = useState<LoadState>('loading');
  const [disputeState, setDisputeState] = useState<LoadState>('loading');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [reason, setReason] = useState('');
  const [requestedResolution, setRequestedResolution] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setJobState('loading');
    const unsubscribe = subscribeToMergedQuerySnapshots<Job>(jobQueriesForUser(user), (docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Job), (items) => {
      setJobs(sortByRecent(items));
      setJobState('ready');
    }, (error) => {
      console.warn('Dispute job context unavailable:', error);
      setJobs([]);
      setJobState('error');
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    setDisputeState('loading');
    const disputeMap = new Map<string, Dispute>();
    const unsubs = disputeQueriesForUser(user).map((disputeQuery) => onSnapshot(disputeQuery, (snapshot) => {
      snapshot.docs.forEach((docSnap) => disputeMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as Dispute));
      setDisputes(sortByRecent(Array.from(disputeMap.values())));
      setDisputeState('ready');
    }, (error) => {
      console.warn('Dispute register unavailable for this role:', error);
      setDisputeState('error');
    }));
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [user]);

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) ?? jobs[0], [jobs, selectedJobId]);

  // Determine visible disputes based on mode
  const visibleDisputes = useMemo(() => {
    if (projectId) {
      // Project-scoped mode: show only disputes for jobs belonging to this project
      // A project's job is identified by the job whose project reference matches, or by the projectId being a job ID
      // Since Project.jobId links to Job.id, filter disputes whose jobId matches any job associated with this project
      const projectJobs = jobs.filter((job) => job.id === projectId || (job as unknown as { projectId?: string }).projectId === projectId);
      const projectJobIds = new Set(projectJobs.map((job) => job.id));
      // If we couldn't find jobs matching the projectId, try using projectId directly as a jobId
      if (projectJobIds.size === 0) {
        projectJobIds.add(projectId);
      }
      return disputes.filter((dispute) => projectJobIds.has(dispute.jobId));
    }

    // Cross-project mode: apply role-scoped visibility with 75-record limit
    return filterDisputesByRoleScope(disputes, jobs, user);
  }, [disputes, jobs, user, projectId]);

  const canFile = canFileDispute(user, selectedJob);

  const submitDispute = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedJob || !canFile || !reason.trim() || !requestedResolution.trim()) return;
    const filedAgainst = counterpartyForJob(user, selectedJob);
    if (!filedAgainst) {
      toast.error('A counterparty must be appointed before a dispute can be filed.');
      return;
    }
    setSaving(true);
    try {
      await addDoc(getDemoCol( 'disputes'), {
        jobId: selectedJob.id,
        filedBy: user.uid,
        filedAgainst,
        reason: reason.trim(),
        requestedResolution: requestedResolution.trim(),
        status: 'open',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setReason('');
      setRequestedResolution('');
      toast.success('Dispute filed for admin mediation');
    } catch (error) {
      console.warn('Dispute filing failed:', error);
      toast.error('Dispute could not be filed. Check project membership and rules.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="dispute-resolution-page">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">Dispute Resolution</Badge>
              <CardTitle className="font-heading text-3xl mt-3 flex items-center gap-3"><Gavel className="h-7 w-7 text-primary" /> Governed dispute centre</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">
                Live dispute records linked to jobs. Project participants can file a dispute; admin mediation, notes, and final resolution remain in the Admin Console.
              </CardDescription>
            </div>
            <Badge className="capitalize w-fit">{user.role}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {jobState === 'loading' && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading visible jobs...</div>}
          {jobState === 'error' && <div className="text-sm text-destructive">Unable to load job context for disputes.</div>}
          {jobs.length > 0 ? (
            <select value={selectedJob?.id ?? ''} onChange={(event) => setSelectedJobId(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm md:max-w-2xl">
              {jobs.map((job) => <option key={job.id} value={job.id}>{job.title} · {job.status}</option>)}
            </select>
          ) : jobState !== 'loading' && <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No job context is visible for this role.</div>}
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p>{canFile ? 'This selected job can file a dispute because you are a direct participant.' : 'Disputes require a direct client/BEP project participant relationship. Package issues should start in the package workspace until a counterparty is appointed.'}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_390px] gap-6">
        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-xl flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-primary" /> Visible dispute register</CardTitle>
            <CardDescription>Only disputes you filed, disputes filed against you, or admin-visible records are shown.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {disputeState === 'loading' && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading disputes...</div>}
            {disputeState === 'error' && <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">Dispute register is unavailable for this role until Firestore rules permit the scoped query.</p>}
            {disputeState === 'ready' && visibleDisputes.length === 0 && <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No disputes available</p>}
            {visibleDisputes.map((dispute) => (
              <div key={dispute.id} className="rounded-xl border border-border p-4 text-sm">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div>
                    <p className="font-semibold">{dispute.reason}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Requested: {dispute.requestedResolution}</p>
                    {dispute.adminNotes && <p className="mt-2 text-xs text-muted-foreground">Admin notes: {dispute.adminNotes}</p>}
                    {dispute.resolution && <p className="mt-2 text-xs text-muted-foreground">Resolution: {dispute.resolution}</p>}
                  </div>
                  <Badge variant={statusVariant(dispute.status)}>{dispute.status.replaceAll('_', ' ')}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader><CardTitle className="font-heading text-xl flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /> File dispute</CardTitle><CardDescription>Creates a real open dispute record for admin mediation.</CardDescription></CardHeader>
          <CardContent>
            <form onSubmit={submitDispute} className="space-y-3">
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="What happened?" required disabled={!canFile || saving} />
              <Textarea value={requestedResolution} onChange={(event) => setRequestedResolution(event.target.value)} placeholder="What resolution are you requesting?" required disabled={!canFile || saving} />
              <Button type="submit" disabled={!canFile || saving || !reason.trim() || !requestedResolution.trim()} className="w-full rounded-xl gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Submit for mediation
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
