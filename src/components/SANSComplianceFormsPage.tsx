import React, { useEffect, useMemo, useState } from 'react';
import { collectionGroup, limit, onSnapshot, query, where } from 'firebase/firestore';
import { AlertTriangle, CheckCircle2, FileText, Loader2, ShieldCheck } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { AIReviewResult, Submission, UserProfile } from '@/types';
import ComplianceReport from './ComplianceReport';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
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

function submissionsQuery(user: UserProfile) {
  const submissions = collectionGroup(db, 'submissions');
  if (user.role === 'admin') return query(submissions, limit(50));
  return query(submissions, where('architectId', '==', user.uid), limit(50));
}

function toAIReviewResult(submission: Submission): AIReviewResult {
  return {
    status: submission.status === 'ai_passed' || submission.status === 'approved' ? 'passed' : 'failed',
    feedback: submission.aiFeedback || submission.adminFeedback || 'No AI feedback text is stored for this submission yet.',
    categories: submission.aiStructuredFeedback || [],
    visualReportUrl: submission.visualReportUrl,
    traceLog: submission.traceability?.map((item) => `${item.timestamp} ${item.actor}: ${item.action} ${item.details}`).join('\n') || 'No trace log entries are stored for this submission.',
    findings: submission.findings,
    signOffChecklist: submission.signOffChecklist,
    riskStatus: submission.riskStatus,
    mode: submission.executionMode,
    disclaimers: ['This SANS/NBR compliance report is generated from stored review records only. It does not certify, approve, or guarantee compliance. Professional and municipal review remains required.'],
  };
}

function statusVariant(status: Submission['status']) {
  if (['ai_failed', 'admin_rejected'].includes(status)) return 'destructive' as const;
  if (['ai_passed', 'approved'].includes(status)) return 'default' as const;
  return 'secondary' as const;
}

export default function SANSComplianceFormsPage({ user }: { user: UserProfile }) {
  const [state, setState] = useState<LoadState>('loading');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selected, setSelected] = useState<Submission | null>(null);

  useEffect(() => {
    setState('loading');
    const unsubscribe = onSnapshot(submissionsQuery(user), (snapshot) => {
      setSubmissions(sortByRecent(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Submission))));
      setState('ready');
    }, (error) => {
      console.error('Failed to load SANS compliance submissions:', error);
      setState('error');
    });
    return () => unsubscribe();
  }, [user]);

  const stats = useMemo(() => ({
    total: submissions.length,
    ready: submissions.filter((submission) => submission.status === 'ai_passed' || submission.status === 'approved').length,
    issues: submissions.filter((submission) => submission.status === 'ai_failed' || submission.status === 'admin_rejected').length,
    signOffs: submissions.reduce((sum, submission) => sum + (submission.signOffChecklist?.length ?? 0), 0),
  }), [submissions]);

  if (selected) {
    return (
      <div className="space-y-4" data-testid="sans-forms-page">
        <Button variant="outline" onClick={() => setSelected(null)}>Back to compliance forms</Button>
        <ComplianceReport result={toAIReviewResult(selected)} drawingUrl={selected.drawingUrl} drawingName={selected.drawingName} projectName={`Job ${selected.jobId}`} userRole={user.role} submissionId={selected.id} userId={user.uid} />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="sans-forms-page">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">SANS / Compliance Forms</Badge>
              <CardTitle className="font-heading text-3xl mt-3 flex items-center gap-3"><FileText className="h-7 w-7 text-primary" /> Stored compliance report register</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">Live SANS/NBR report surface built from stored AI review submissions, findings, citations, trace logs, and professional sign-off checklists. No forms are auto-certified.</CardDescription>
            </div>
            <Badge className="capitalize w-fit">{user.role}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          {state === 'loading' && <div className="md:col-span-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading stored compliance reports...</div>}
          {state === 'error' && <div className="md:col-span-4 text-sm text-destructive">Unable to load compliance submissions. Check Firestore rules and indexes.</div>}
          <MetricCard icon={<FileText />} label="Submissions" value={stats.total} />
          <MetricCard icon={<CheckCircle2 />} label="AI passed / approved" value={stats.ready} />
          <MetricCard icon={<AlertTriangle />} label="Issues / rejected" value={stats.issues} danger={stats.issues > 0} />
          <MetricCard icon={<ShieldCheck />} label="Sign-off items" value={stats.signOffs} />
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
        <CardHeader><CardTitle className="font-heading text-xl">Compliance report records</CardTitle><CardDescription>Open a stored report to print or download certificate artifacts through the existing PDF generation path where available.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {submissions.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No stored SANS/NBR review submissions are visible.</p> : submissions.map((submission) => (
            <div key={submission.id} className="rounded-xl border border-border p-4 text-sm">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div><p className="font-semibold">{submission.drawingName}</p><p className="mt-1 text-xs text-muted-foreground">Job {submission.jobId} · {submission.createdAt || 'Date not recorded'} · {submission.riskStatus || submission.executionMode || 'standard review'}</p></div>
                <div className="flex flex-wrap gap-2"><Badge variant={statusVariant(submission.status)}>{submission.status}</Badge><Button size="sm" onClick={() => setSelected(submission)}>Open report</Button></div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">{(submission.findings?.length ?? 0) > 0 && <Badge variant="outline">{submission.findings?.length} findings</Badge>}{(submission.signOffChecklist?.length ?? 0) > 0 && <Badge variant="outline">{submission.signOffChecklist?.length} sign-offs</Badge>}{(submission.aiStructuredFeedback?.length ?? 0) > 0 && <Badge variant="outline">{submission.aiStructuredFeedback?.length} categories</Badge>}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ icon, label, value, danger = false }: { icon: React.ReactNode; label: string; value: React.ReactNode; danger?: boolean }) {
  return <div className={`rounded-2xl border bg-background/70 p-4 ${danger ? 'border-destructive/40' : 'border-border'}`}><div className="flex items-center gap-2 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}<p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p></div><p className="mt-3 font-heading text-3xl font-black">{value}</p></div>;
}
