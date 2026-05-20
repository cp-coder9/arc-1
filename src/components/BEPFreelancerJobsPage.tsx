import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { Briefcase, CheckCircle2, Clock, Loader2, Plus, Send, Users } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { Job, JobCard, UserProfile } from '@/types';
import { subscribeToMergedQuerySnapshots } from '@/lib/firestoreQueryMerge';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

type LoadState = 'loading' | 'ready' | 'error';
type DirectoryProfile = {
  uid: string;
  displayName?: string;
  email?: string;
  role: string;
  professionalLabel?: string;
  professionalLabels?: string[];
  region?: string;
  averageRating?: number;
  totalReviews?: number;
};

export default function BEPFreelancerJobsPage({ user }: { user: UserProfile }) {
  const [state, setState] = useState<LoadState>('loading');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [freelancers, setFreelancers] = useState<DirectoryProfile[]>([]);
  const [tasks, setTasks] = useState<JobCard[]>([]);
  const [saving, setSaving] = useState(false);
  const [reviewingTaskId, setReviewingTaskId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ jobId: '', freelancerId: '', assigneeRole: '', deadline: '', notes: '', priority: 'medium', estimatedHours: '' });

  useEffect(() => {
    setState('loading');
    const jobsUnsub = subscribeToMergedQuerySnapshots<Job>([
      query(collection(db, 'jobs'), where('selectedProfessionalId', '==', user.uid)),
      query(collection(db, 'jobs'), where('selectedBepId', '==', user.uid)),
      query(collection(db, 'jobs'), where('selectedArchitectId', '==', user.uid)),
    ], (docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Job), (loadedJobs) => {
      setJobs(loadedJobs);
      setState('ready');
    }, (error) => {
      console.error('Failed to load BEP jobs:', error);
      setState('error');
    });
    const freelancersUnsub = onSnapshot(query(collection(db, 'directoryProfiles'), where('role', '==', 'freelancer')), (snapshot) => {
      setFreelancers(snapshot.docs.map((docSnap) => ({ uid: docSnap.id, ...docSnap.data() } as DirectoryProfile)));
    }, (error) => {
      console.error('Failed to load freelancer directory:', error);
      setState('error');
    });
    const tasksUnsub = subscribeToMergedQuerySnapshots<JobCard>([
      query(collection(db, 'delegatedTasks'), where('professionalId', '==', user.uid)),
      query(collection(db, 'delegatedTasks'), where('bepId', '==', user.uid)),
      query(collection(db, 'delegatedTasks'), where('architectId', '==', user.uid)),
    ], (docSnap) => ({ id: docSnap.id, ...docSnap.data() } as JobCard), (items) => {
      setTasks(items);
    }, (error) => {
      console.error('Failed to load delegated task register:', error);
    });
    return () => {
      jobsUnsub();
      freelancersUnsub();
      tasksUnsub();
    };
  }, [user.uid]);

  useEffect(() => {
    if (!form.jobId && jobs[0]) setForm((current) => ({ ...current, jobId: jobs[0].id }));
    if (!form.freelancerId && freelancers[0]) setForm((current) => ({ ...current, freelancerId: freelancers[0].uid }));
  }, [form.freelancerId, form.jobId, freelancers, jobs]);

  const selectedFreelancer = freelancers.find((freelancer) => freelancer.uid === form.freelancerId);
  const selectedJob = jobs.find((job) => job.id === form.jobId);
  const activeTasks = useMemo(() => tasks.filter((task) => task.status !== 'completed'), [tasks]);

  const createDelegatedTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedJob || !selectedFreelancer) return;
    setSaving(true);
    setFeedback(null);
    try {
      const now = new Date().toISOString();
      const taskRef = doc(collection(db, `jobs/${selectedJob.id}/tasks`));
      const delegatedTaskRef = doc(db, 'delegatedTasks', taskRef.id);
      const taskData = {
        id: taskRef.id,
        jobId: selectedJob.id,
        jobTaskId: taskRef.id,
        professionalId: user.uid,
        bepId: user.uid,
        architectId: user.uid,
        assigneeId: selectedFreelancer.uid,
        assigneeName: selectedFreelancer.displayName || selectedFreelancer.email || 'Freelancer',
        assigneeRole: form.assigneeRole.trim(),
        deadline: form.deadline,
        notes: form.notes.trim(),
        status: 'pending',
        submissionStatus: 'not_submitted',
        paymentStatus: 'not_ready',
        priority: form.priority,
        estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : null,
        requirements: [],
        createdAt: now,
        updatedAt: now,
        humanApprovalRequired: true,
      };
      const batch = writeBatch(db);
      batch.set(taskRef, taskData);
      batch.set(delegatedTaskRef, taskData);
      await batch.commit();
      setForm((current) => ({ ...current, assigneeRole: '', deadline: '', notes: '', priority: 'medium', estimatedHours: '' }));
      setFeedback('Freelancer work package created and mirrored to the delegated task register. Contract/payment approval remains separate.');
    } catch (error) {
      console.error('Failed to create freelancer task:', error);
      setFeedback('Unable to create freelancer work package.');
    } finally {
      setSaving(false);
    }
  };

  const reviewTask = async (task: JobCard, decision: 'changes_requested' | 'approved') => {
    if (task.submissionStatus !== 'submitted') {
      setFeedback('Freelancer deliverable must be submitted for BEP review before invoice readiness can be recorded.');
      return;
    }
    setReviewingTaskId(task.id);
    setFeedback(null);
    try {
      const now = new Date().toISOString();
      const patch = {
        status: decision === 'approved' ? 'completed' : 'in-progress',
        submissionStatus: decision,
        reviewFeedback: reviewFeedback[task.id]?.trim() || (decision === 'approved' ? 'Approved for invoice/payment readiness review.' : 'Changes requested by BEP.'),
        reviewedAt: now,
        updatedAt: now,
        paymentStatus: decision === 'approved' ? 'ready_for_invoice' : 'not_ready',
        completedAt: decision === 'approved' ? now : null,
      } as const;
      await updateDoc(doc(db, 'delegatedTasks', task.id), patch);
      if (task.jobId) {
        await updateDoc(doc(db, `jobs/${task.jobId}/tasks`, task.jobTaskId ?? task.id), patch).catch(() => undefined);
      }
      setReviewFeedback((current) => ({ ...current, [task.id]: '' }));
      setFeedback(decision === 'approved' ? 'Deliverable approved for invoice readiness. No payment was released.' : 'Revision request recorded for the freelancer.');
    } catch (error) {
      console.error('Failed to review freelancer task:', error);
      setFeedback('Unable to update freelancer review status.');
    } finally {
      setReviewingTaskId(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="bep-freelancers-page">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">BEP Freelancer Jobs</Badge>
              <CardTitle className="font-heading text-3xl mt-3 flex items-center gap-3"><Users className="h-7 w-7 text-primary" /> Delegated professional work packages</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">Assign real project job cards to verified freelancer directory profiles. This creates traceable task records only; agreements, payments, and sign-off remain human-confirmed workflows.</CardDescription>
            </div>
            <Badge className="capitalize w-fit">{user.role}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          {state === 'loading' && <div className="md:col-span-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading BEP jobs and freelancer directory...</div>}
          {state === 'error' && <div className="md:col-span-4 text-sm text-destructive">Unable to load BEP freelancer records. Check project/directory permissions.</div>}
          <MetricCard icon={<Briefcase />} label="BEP jobs" value={jobs.length} />
          <MetricCard icon={<Users />} label="Freelancers" value={freelancers.length} />
          <MetricCard icon={<Clock />} label="Active tasks" value={activeTasks.length} />
          <MetricCard icon={<Send />} label="Completed" value={tasks.filter((task) => task.status === 'completed').length} />
        </CardContent>
      </Card>

      {feedback && <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-primary">{feedback}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-6">
        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader><CardTitle className="font-heading text-xl flex items-center gap-2"><Plus className="h-5 w-5" /> Create freelancer work package</CardTitle><CardDescription>Use only live jobs and live freelancer directory profiles. No placeholder freelancers are generated.</CardDescription></CardHeader>
          <CardContent>
            <form onSubmit={createDelegatedTask} className="space-y-4">
              <select value={form.jobId} onChange={(event) => setForm((current) => ({ ...current, jobId: event.target.value }))} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm" required>
                {jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
              </select>
              <select value={form.freelancerId} onChange={(event) => setForm((current) => ({ ...current, freelancerId: event.target.value }))} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm" required>
                {freelancers.map((freelancer) => <option key={freelancer.uid} value={freelancer.uid}>{freelancer.displayName || freelancer.email || freelancer.uid} · {freelancer.region || 'No region'}</option>)}
              </select>
              <Input value={form.assigneeRole} onChange={(event) => setForm((current) => ({ ...current, assigneeRole: event.target.value }))} placeholder="Work package role, e.g. Door schedule / 3D views" required />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input type="date" value={form.deadline} onChange={(event) => setForm((current) => ({ ...current, deadline: event.target.value }))} required />
                <select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))} className="h-11 rounded-xl border border-input bg-background px-3 text-sm"><option value="low">Low priority</option><option value="medium">Medium priority</option><option value="high">High priority</option></select>
                <Input type="number" min="0" value={form.estimatedHours} onChange={(event) => setForm((current) => ({ ...current, estimatedHours: event.target.value }))} placeholder="Est. hours" />
              </div>
              <Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Brief, inputs, deliverables, review requirements, file naming, and human sign-off expectations" required />
              <Button type="submit" disabled={saving || jobs.length === 0 || freelancers.length === 0}>{saving ? 'Creating...' : 'Create task'}</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader><CardTitle className="font-heading text-xl">Freelancer directory</CardTitle><CardDescription>Visible freelancer profiles from `directoryProfiles`.</CardDescription></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {freelancers.length === 0 ? <p className="md:col-span-2 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No freelancer directory profiles are visible.</p> : freelancers.slice(0, 8).map((freelancer) => <div key={freelancer.uid} className="rounded-xl border border-border p-4 text-sm"><p className="font-semibold">{freelancer.displayName || freelancer.email || freelancer.uid}</p><p className="text-xs text-muted-foreground">{freelancer.professionalLabel || freelancer.professionalLabels?.join(', ') || 'No speciality'} · {freelancer.region || 'No region'}</p><Badge variant="secondary" className="mt-3">{freelancer.totalReviews || 0} reviews</Badge></div>)}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
        <CardHeader><CardTitle className="font-heading text-xl">Delegated task register</CardTitle><CardDescription>Tasks created from this BEP workspace and visible in freelancer assigned-work/submissions pages.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {tasks.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No delegated freelancer work packages are recorded yet.</p> : tasks.map((task) => {
            const reviewEnabled = task.submissionStatus === 'submitted';
            return <div key={task.id} className="rounded-xl border border-border p-4 text-sm"><div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3"><div><p className="font-semibold">{task.assigneeRole}</p><p className="text-xs text-muted-foreground">{task.assigneeName} · due {task.deadline} · {task.estimatedHours || 0}h estimated</p></div><div className="flex flex-wrap gap-2"><Badge>{task.status}</Badge>{task.submissionStatus && <Badge variant="secondary">{task.submissionStatus.replaceAll('_', ' ')}</Badge>}{task.paymentStatus && <Badge variant="outline">{task.paymentStatus.replaceAll('_', ' ')}</Badge>}</div></div><p className="mt-3 text-muted-foreground">{task.notes}</p>{task.reviewFeedback && <p className="mt-2 rounded-lg bg-primary/5 p-3 text-xs text-primary">BEP feedback: {task.reviewFeedback}</p>}<div className="mt-3 space-y-2"><Textarea value={reviewFeedback[task.id] ?? ''} onChange={(event) => setReviewFeedback((current) => ({ ...current, [task.id]: event.target.value }))} placeholder="BEP review feedback for submitted deliverables" /><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={!reviewEnabled || reviewingTaskId === task.id} onClick={() => reviewTask(task, 'changes_requested')}>Request changes</Button><Button type="button" size="sm" className="gap-2" disabled={!reviewEnabled || reviewingTaskId === task.id} onClick={() => reviewTask(task, 'approved')}>{reviewingTaskId === task.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Approve for invoice readiness</Button></div>{!reviewEnabled && <p className="text-xs text-muted-foreground">BEP review actions unlock after the freelancer submits this deliverable.</p>}</div></div>;
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-background/70 p-4"><div className="flex items-center gap-2 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}<p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p></div><p className="mt-3 font-heading text-3xl font-black">{value}</p></div>;
}
