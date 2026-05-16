import React, { useEffect, useMemo, useState } from 'react';
import { collection, collectionGroup, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { AlertTriangle, Bot, CheckCircle2, Download, FileSearch, FileText, Loader2, ShieldCheck } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { Job, Submission, UserProfile } from '@/types';
import FileManager from './FileManager';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

type LoadState = 'loading' | 'ready' | 'error';

function jobQueryForDrawingChecker(user: UserProfile) {
  const jobs = collection(db, 'jobs');
  if (user.role === 'admin') return query(jobs, orderBy('createdAt', 'desc'), limit(25));
  if (user.role === 'client') return query(jobs, where('clientId', '==', user.uid), orderBy('createdAt', 'desc'), limit(25));
  return query(jobs, where('selectedArchitectId', '==', user.uid), orderBy('createdAt', 'desc'), limit(25));
}

function submissionQueryForDrawingChecker(user: UserProfile) {
  const submissions = collectionGroup(db, 'submissions');
  if (user.role === 'admin') return query(submissions, orderBy('createdAt', 'desc'), limit(50));
  return query(submissions, where('architectId', '==', user.uid), orderBy('createdAt', 'desc'), limit(50));
}

function modeLabel(user: UserProfile) {
  if (user.role === 'freelancer') return 'Freelancer pre-check';
  if (user.role === 'admin') return 'Admin AI review queue';
  return 'BEP professional compliance review';
}

function statusVariant(status: Submission['status']) {
  if (['ai_failed', 'admin_rejected'].includes(status)) return 'destructive' as const;
  if (['ai_passed', 'approved'].includes(status)) return 'default' as const;
  return 'secondary' as const;
}

export default function AIDrawingChecker({ user }: { user: UserProfile }) {
  const [state, setState] = useState<LoadState>('loading');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');

  useEffect(() => {
    setState('loading');
    const unsubscribeJobs = onSnapshot(jobQueryForDrawingChecker(user), (snapshot) => {
      setJobs(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Job)));
      setState('ready');
    }, (error) => {
      console.error('Failed to load drawing checker jobs:', error);
      setState('error');
    });
    const unsubscribeSubmissions = onSnapshot(submissionQueryForDrawingChecker(user), (snapshot) => {
      setSubmissions(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Submission)));
    }, (error) => console.error('Failed to load drawing checker submissions:', error));
    return () => {
      unsubscribeJobs();
      unsubscribeSubmissions();
    };
  }, [user]);

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) ?? jobs.find((job) => job.status === 'in-progress') ?? jobs[0], [jobs, selectedJobId]);
  const visibleSubmissions = useMemo(() => selectedJob ? submissions.filter((submission) => submission.jobId === selectedJob.id) : submissions, [selectedJob, submissions]);
  const stats = useMemo(() => ({
    reviewed: visibleSubmissions.length,
    passed: visibleSubmissions.filter((submission) => submission.status === 'ai_passed' || submission.status === 'approved').length,
    failed: visibleSubmissions.filter((submission) => submission.status === 'ai_failed' || submission.status === 'admin_rejected').length,
    signOffs: visibleSubmissions.reduce((sum, submission) => sum + (submission.signOffChecklist?.length ?? 0), 0),
  }), [visibleSubmissions]);

  return (
    <div className="space-y-6" data-testid="ai-drawing-checker">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">AI Drawing Checker</Badge>
              <CardTitle className="font-heading text-3xl mt-3">Drawing compliance and review archive</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">
                Dedicated drawing checker surface backed by the existing upload manager, multi-agent SANS/NBR review orchestration, and live submission records. AI output remains advisory until a responsible professional signs off.
              </CardDescription>
            </div>
            <Badge className="capitalize w-fit">{modeLabel(user)}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {state === 'loading' && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading drawing records...</div>}
          {state === 'error' && <div className="text-sm text-destructive">Unable to load drawing checker records. Check Firestore rules and indexes.</div>}
          {jobs.length > 0 && (
            <select value={selectedJob?.id ?? ''} onChange={(event) => setSelectedJobId(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm md:max-w-xl">
              {jobs.map((job) => <option key={job.id} value={job.id}>{job.title} · {job.status}</option>)}
            </select>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard icon={<FileSearch />} label="Reviews" value={stats.reviewed} />
        <MetricCard icon={<CheckCircle2 />} label="AI passed / approved" value={stats.passed} />
        <MetricCard icon={<AlertTriangle />} label="Issues / rejected" value={stats.failed} danger={stats.failed > 0} />
        <MetricCard icon={<ShieldCheck />} label="Sign-off items" value={stats.signOffs} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
        <div className="space-y-6">
          <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
            <CardHeader>
              <CardTitle className="font-heading text-xl flex items-center gap-2"><Bot className="h-5 w-5 text-primary" /> Upload and quick scan</CardTitle>
              <CardDescription>
                Use the production file manager to upload project-linked PDF/image drawings and run the existing quick-scan orchestration. A project/job ID is required for traceability.
              </CardDescription>
            </CardHeader>
          </Card>
          <FileManager user={user} />
        </div>

        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-xl">Review archive</CardTitle>
            <CardDescription>Live records from job submission subcollections. No review results are simulated.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {visibleSubmissions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No AI drawing review submissions are visible for the selected project.</div>
            ) : visibleSubmissions.slice(0, 12).map((submission) => (
              <div key={submission.id} className="rounded-xl border border-border p-4 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{submission.drawingName}</p>
                    <p className="text-xs text-muted-foreground">{submission.createdAt || 'Date not recorded'} · {submission.riskStatus ?? submission.executionMode ?? 'standard review'}</p>
                  </div>
                  <Badge variant={statusVariant(submission.status)}>{submission.status}</Badge>
                </div>
                {submission.aiFeedback && <p className="mt-3 text-muted-foreground leading-relaxed line-clamp-4">{submission.aiFeedback}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {(submission.findings?.length ?? 0) > 0 && <Badge variant="outline">{submission.findings?.length} findings</Badge>}
                  {(submission.signOffChecklist?.length ?? 0) > 0 && <Badge variant="outline">{submission.signOffChecklist?.length} sign-offs</Badge>}
                  {submission.visualReportUrl && (
                    <Button asChild size="sm" variant="outline" className="ml-auto rounded-xl gap-2">
                      <a href={submission.visualReportUrl} target="_blank" rel="noreferrer"><Download className="h-3 w-3" /> Visual report</a>
                    </Button>
                  )}
                  {submission.drawingUrl && (
                    <Button asChild size="sm" variant="ghost" className="rounded-xl gap-2">
                      <a href={submission.drawingUrl} target="_blank" rel="noreferrer"><FileText className="h-3 w-3" /> Drawing</a>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, danger = false }: { icon: React.ReactNode; label: string; value: React.ReactNode; danger?: boolean }) {
  return (
    <Card className={`rounded-2xl bg-card/90 shadow-sm ${danger ? 'border-destructive/40' : 'border-border'}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}<CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</CardTitle></div>
      </CardHeader>
      <CardContent><p className="font-heading text-3xl font-black">{value}</p></CardContent>
    </Card>
  );
}
