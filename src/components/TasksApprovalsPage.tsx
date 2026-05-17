import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { addDoc, collection, collectionGroup, limit, onSnapshot, query, updateDoc, where, doc } from 'firebase/firestore';
import { CheckCircle2, ClipboardCheck, Clock, Loader2, Plus, UserCheck } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { Job, JobCard, Project, UserProfile } from '@/types';
import ProjectCoordinationRegister from './ProjectCoordinationRegister';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

type LoadState = 'loading' | 'ready' | 'error';
type ApprovalRecord = { id: string; projectId?: string; jobId?: string; title?: string; description?: string; status?: string; requestedBy?: string; assignedTo?: string; dueDate?: string; createdAt?: string; category?: string };

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
  if (user.role === 'architect' || user.role === 'bep' || user.role === 'freelancer') return query(jobs, where('selectedArchitectId', '==', user.uid), limit(25));
  return query(jobs, where('status', '==', 'open'), limit(25));
}

function projectsForUser(user: UserProfile) {
  const projects = collection(db, 'projects');
  if (user.role === 'admin') return query(projects, limit(25));
  if (user.role === 'client') return query(projects, where('clientId', '==', user.uid), limit(25));
  if (user.role === 'architect' || user.role === 'bep') return query(projects, where('leadArchitectId', '==', user.uid), limit(25));
  return null;
}

function statusVariant(status?: string) {
  if (status === 'completed' || status === 'approved' || status === 'closed') return 'default' as const;
  if (status === 'overdue' || status === 'rejected' || status === 'blocked') return 'destructive' as const;
  return 'secondary' as const;
}

function canCreateTasks(user: UserProfile) {
  return ['admin', 'architect', 'bep'].includes(user.role);
}

export default function TasksApprovalsPage({ user }: { user: UserProfile }) {
  const [state, setState] = useState<LoadState>('loading');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<JobCard[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [assigneeName, setAssigneeName] = useState('');
  const [assigneeRole, setAssigneeRole] = useState('');
  const [deadline, setDeadline] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setState('loading');
    const unsubJobs = onSnapshot(jobsForUser(user), (snapshot) => {
      setJobs(sortByRecent(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Job))));
      setState('ready');
    }, (error) => {
      console.error('Failed to load task jobs:', error);
      setState('error');
    });
    const projectQuery = projectsForUser(user);
    const unsubProjects = projectQuery ? onSnapshot(projectQuery, (snapshot) => setProjects(sortByRecent(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Project)))), (error) => console.warn('Task project projection unavailable; continuing without projects:', error)) : null;
    return () => { unsubJobs(); unsubProjects?.(); };
  }, [user]);

  useEffect(() => {
    const jobIds = jobs.map((job) => job.id).slice(0, 10);
    const projectIds = projects.map((project) => project.id).slice(0, 10);
    const unsubs: Array<() => void> = [];
    if (user.role === 'admin') {
      unsubs.push(onSnapshot(query(collectionGroup(db, 'tasks'), limit(50)), (snapshot) => setTasks(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as JobCard))), (error) => console.error('Failed to load admin tasks:', error)));
      unsubs.push(onSnapshot(query(collectionGroup(db, 'approvals'), limit(50)), (snapshot) => setApprovals(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as ApprovalRecord))), (error) => console.error('Failed to load admin approvals:', error)));
    } else if (jobIds.length > 0) {
      unsubs.push(onSnapshot(query(collectionGroup(db, 'tasks'), where('jobId', 'in', jobIds), limit(50)), (snapshot) => setTasks(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as JobCard))), (error) => console.error('Failed to load visible tasks:', error)));
    }
    if (projectIds.length > 0 && user.role !== 'admin') {
      unsubs.push(onSnapshot(query(collectionGroup(db, 'approvals'), where('projectId', 'in', projectIds), limit(50)), (snapshot) => setApprovals(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as ApprovalRecord))), (error) => console.error('Failed to load visible approvals:', error)));
    }
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [jobs, projects, user.role]);

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) ?? jobs[0], [jobs, selectedJobId]);
  const selectedProject = useMemo(() => {
    if (projects.length === 0) return undefined;
    if (!selectedJob) return projects[0];
    return projects.find((project) => project.jobId === selectedJob.id) ?? projects[0];
  }, [projects, selectedJob]);
  const visibleTasks = useMemo(() => selectedJob ? tasks.filter((task) => task.jobId === selectedJob.id) : tasks, [selectedJob, tasks]);
  const overdueCount = visibleTasks.filter((task) => task.status !== 'completed' && task.deadline && new Date(task.deadline).getTime() < Date.now()).length;
  const pendingApprovals = approvals.filter((approval) => !['approved', 'closed', 'rejected'].includes(String(approval.status))).length;

  const createTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedJob || !assigneeName.trim() || !assigneeRole.trim() || !deadline) return;
    setSaving(true);
    try {
      await addDoc(collection(db, `jobs/${selectedJob.id}/tasks`), {
        jobId: selectedJob.id,
        architectId: user.uid,
        assigneeName: assigneeName.trim(),
        assigneeRole: assigneeRole.trim(),
        deadline,
        notes: notes.trim(),
        status: 'pending',
        priority: overdueCount > 0 ? 'high' : 'medium',
        createdAt: new Date().toISOString(),
      });
      setAssigneeName('');
      setAssigneeRole('');
      setDeadline('');
      setNotes('');
    } finally {
      setSaving(false);
    }
  };

  const updateTaskStatus = async (task: JobCard, status: JobCard['status']) => {
    await updateDoc(doc(db, `jobs/${task.jobId}/tasks`, task.id), {
      status,
      completedAt: status === 'completed' ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="space-y-6" data-testid="tasks-approvals-page">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">Tasks & Approvals</Badge>
              <CardTitle className="font-heading text-3xl mt-3">Role-filtered action queue</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">Live job task cards and project approval records. Status changes are persisted to the task record; contractual, payment, and sign-off decisions remain in their dedicated human-confirmed workflows.</CardDescription>
            </div>
            <Badge className="capitalize w-fit">{user.role}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {state === 'loading' && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading live tasks...</div>}
          {state === 'error' && <div className="text-sm text-destructive">Unable to load tasks. Check Firestore rules and indexes.</div>}
          {jobs.length > 0 && <select value={selectedJob?.id ?? ''} onChange={(event) => setSelectedJobId(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm md:max-w-xl">{jobs.map((job) => <option key={job.id} value={job.id}>{job.title} · {job.status}</option>)}</select>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard icon={<ClipboardCheck />} label="Visible tasks" value={visibleTasks.length} />
        <MetricCard icon={<Clock />} label="Overdue" value={overdueCount} danger={overdueCount > 0} />
        <MetricCard icon={<UserCheck />} label="Pending approvals" value={pendingApprovals} />
        <MetricCard icon={<CheckCircle2 />} label="Completed" value={visibleTasks.filter((task) => task.status === 'completed').length} />
      </div>

      {selectedProject && <ProjectCoordinationRegister project={selectedProject} job={selectedJob} user={user} />}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6">
        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader><CardTitle className="font-heading text-xl">Task cards</CardTitle><CardDescription>Tasks from visible job subcollections. No mock tasks are generated.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {visibleTasks.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No task cards are visible for this project.</p> : visibleTasks.map((task) => (
              <div key={task.id} className="rounded-xl border border-border p-4 text-sm">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div><p className="font-semibold">{task.assigneeName} <span className="text-muted-foreground">({task.assigneeRole})</span></p><p className="mt-1 text-xs text-muted-foreground">Due: {task.deadline || 'No deadline'} · {task.notes || 'No notes'}</p></div>
                  <select value={task.status} onChange={(event) => updateTaskStatus(task, event.target.value as JobCard['status'])} className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-bold uppercase tracking-widest">
                    <option value="pending">Pending</option><option value="in-progress">In Progress</option><option value="completed">Completed</option>
                  </select>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
            <CardHeader><CardTitle className="font-heading text-xl">Open approvals</CardTitle><CardDescription>Project approval records visible to this role.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {approvals.length === 0 ? <p className="text-sm text-muted-foreground">No approval records visible.</p> : approvals.slice(0, 8).map((approval) => <div key={approval.id} className="rounded-xl border border-border p-3 text-sm"><div className="flex items-start justify-between gap-2"><p className="font-semibold">{approval.title || approval.category || 'Approval request'}</p><Badge variant={statusVariant(approval.status)}>{approval.status || 'pending'}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{approval.description || approval.dueDate || approval.createdAt || 'No detail recorded'}</p></div>)}
            </CardContent>
          </Card>
          {canCreateTasks(user) && selectedJob && <Card className="rounded-2xl border-border bg-card/90 shadow-sm"><CardHeader><CardTitle className="font-heading text-xl flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /> Assign task</CardTitle><CardDescription>Create a real job task card for the selected project.</CardDescription></CardHeader><CardContent><form onSubmit={createTask} className="space-y-3"><Input value={assigneeName} onChange={(e) => setAssigneeName(e.target.value)} placeholder="Assignee name" required /><Input value={assigneeRole} onChange={(e) => setAssigneeRole(e.target.value)} placeholder="Role / discipline" required /><Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} required /><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Task notes / deliverable" /><Button type="submit" disabled={saving} className="w-full rounded-xl gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create task</Button></form></CardContent></Card>}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, danger = false }: { icon: React.ReactNode; label: string; value: React.ReactNode; danger?: boolean }) {
  return <Card className={`rounded-2xl bg-card/90 shadow-sm ${danger ? 'border-destructive/40' : 'border-border'}`}><CardHeader className="pb-3"><div className="flex items-center gap-2 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}<CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</CardTitle></div></CardHeader><CardContent><p className="font-heading text-3xl font-black">{value}</p></CardContent></Card>;
}
