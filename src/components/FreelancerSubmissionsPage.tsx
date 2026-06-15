import React, { useEffect, useMemo, useState } from 'react';
import { collectionGroup, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { CheckCircle2, Clock, FileText, Loader2, Send } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { JobCard, UserProfile } from '@/types';
import FileManager from './FileManager';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Textarea } from './ui/textarea';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
type LoadState = 'loading' | 'ready' | 'error';

export default function FreelancerSubmissionsPage({ user }: { user: UserProfile }) {
  const [state, setState] = useState<LoadState>('loading');
  const [tasks, setTasks] = useState<JobCard[]>([]);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [submissionNotes, setSubmissionNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    setState('loading');
    const unsubscribe = onSnapshot(query(collectionGroup(db, 'tasks'), where('assigneeId', '==', user.uid)), (snapshot) => {
      setTasks(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as JobCard)));
      setState('ready');
    }, (error) => {
      console.error('Failed to load freelancer submissions tasks:', error);
      setState('error');
    });
    return () => unsubscribe();
  }, [user.uid]);

  const stats = useMemo(() => ({
    total: tasks.length,
    inProgress: tasks.filter((task) => task.status === 'in-progress').length,
    completed: tasks.filter((task) => task.status === 'completed').length,
    submitted: tasks.filter((task) => task.submissionStatus === 'submitted').length,
    readyForInvoice: tasks.filter((task) => task.paymentStatus === 'ready_for_invoice').length,
  }), [tasks]);

  const updateTaskRecords = async (task: JobCard, patch: Record<string, unknown>) => {
    const taskDocId = task.jobTaskId ?? task.id;
    await updateDoc(getDemoDoc( `jobs/${task.jobId}/tasks`, taskDocId), patch);
    await updateDoc(getDemoDoc( 'delegatedTasks', taskDocId), patch).catch(() => undefined);
  };

  const updateStatus = async (task: JobCard, status: JobCard['status']) => {
    setUpdatingTaskId(task.id);
    try {
      const now = new Date().toISOString();
      await updateTaskRecords(task, {
        status,
        updatedAt: now,
        completedAt: status === 'completed' ? now : null,
        ...(status === 'in-progress' ? { submissionStatus: 'not_submitted', paymentStatus: 'not_ready' } : {}),
      });
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const submitDeliverable = async (task: JobCard) => {
    setUpdatingTaskId(task.id);
    try {
      const now = new Date().toISOString();
      await updateTaskRecords(task, {
        status: 'completed',
        submissionStatus: 'submitted',
        submittedAt: now,
        completedAt: now,
        updatedAt: now,
        paymentStatus: 'review_pending',
        notes: submissionNotes[task.id]?.trim() || task.notes,
      });
      setSubmissionNotes((current) => ({ ...current, [task.id]: '' }));
    } finally {
      setUpdatingTaskId(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="freelancer-submissions-page">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">Submissions & Feedback</Badge>
              <CardTitle className="font-heading text-3xl mt-3 flex items-center gap-3"><Send className="h-7 w-7 text-primary" /> Freelancer deliverables</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">Live assigned work cards with status updates and production file upload/evidence management. Payment release and BEP approval remain in dedicated human-confirmed workflows.</CardDescription>
            </div>
            <Badge className="capitalize w-fit">{user.role}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-5 gap-4">
          {state === 'loading' && <div className="md:col-span-5 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading assigned work...</div>}
          {state === 'error' && <div className="md:col-span-5 text-sm text-destructive">Unable to load assigned work. Check project/task access.</div>}
          <MetricCard icon={<FileText />} label="Assigned" value={stats.total} />
          <MetricCard icon={<Clock />} label="In progress" value={stats.inProgress} />
          <MetricCard icon={<Send />} label="Submitted" value={stats.submitted} />
          <MetricCard icon={<CheckCircle2 />} label="Completed" value={stats.completed} />
          <MetricCard icon={<CheckCircle2 />} label="Invoice ready" value={stats.readyForInvoice} />
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
        <CardHeader><CardTitle className="font-heading text-xl">Assigned deliverables</CardTitle><CardDescription>Task records assigned to this freelancer. No mock submissions are generated.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {tasks.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No assigned deliverables are visible yet.</p> : tasks.map((task) => (
            <div key={task.id} className="rounded-xl border border-border p-4 text-sm">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div><p className="font-semibold">{task.assigneeRole || 'Deliverable'}</p><p className="mt-1 text-xs text-muted-foreground">Due: {task.deadline || 'No deadline'} · {task.notes || 'No notes recorded'}</p></div>
                <div className="flex flex-wrap gap-2"><Badge>{task.status}</Badge>{task.submissionStatus && <Badge variant="secondary">{task.submissionStatus.replaceAll('_', ' ')}</Badge>}{task.paymentStatus && <Badge variant="outline">{task.paymentStatus.replaceAll('_', ' ')}</Badge>}</div>
              </div>
              {task.reviewFeedback && <p className="mt-3 rounded-lg bg-primary/5 p-3 text-xs text-primary">BEP feedback: {task.reviewFeedback}</p>}
              <div className="mt-4 space-y-3">
                <Textarea value={submissionNotes[task.id] ?? ''} onChange={(event) => setSubmissionNotes((current) => ({ ...current, [task.id]: event.target.value }))} placeholder="Submission note, file references, revision notes, or deliverable checklist" />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={updatingTaskId === task.id} onClick={() => updateStatus(task, 'in-progress')}>Start / resume work</Button>
                  <Button type="button" size="sm" className="gap-2" disabled={updatingTaskId === task.id} onClick={() => submitDeliverable(task)}>{updatingTaskId === task.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit for BEP review</Button>
                </div>
                <p className="text-xs text-muted-foreground">Submission marks this deliverable review-pending only. BEP approval and payment/invoice readiness remain human-confirmed.</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <FileManager user={user} />
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-background/70 p-4"><div className="flex items-center gap-2 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}<p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p></div><p className="mt-3 font-heading text-3xl font-black">{value}</p></div>;
}
