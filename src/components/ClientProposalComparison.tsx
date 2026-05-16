import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { getIdToken } from 'firebase/auth';
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { auth, db } from '../lib/firebase';
import type { Application, Job, UserProfile } from '../types';
import { buildProposalComparison } from '../services/marketplaceWorkflowService';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

type ApplicationWithJob = Application & { job: Job };

const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });

export default function ClientProposalComparison({ user }: { user: UserProfile }) {
  const [applications, setApplications] = useState<ApplicationWithJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  useEffect(() => {
    const appUnsubs: Array<() => void> = [];
    const unsubJobs = onSnapshot(query(collection(db, 'jobs'), where('clientId', '==', user.uid)), (snapshot) => {
      appUnsubs.splice(0).forEach((unsub) => unsub());
      const liveJobs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Job));
      setApplications([]);

      if (liveJobs.length === 0) setLoading(false);
      liveJobs.forEach((job) => {
        const unsubApps = onSnapshot(collection(db, `jobs/${job.id}/applications`), (appsSnapshot) => {
          setApplications((current) => {
            const withoutJob = current.filter((application) => application.job.id !== job.id);
            const nextForJob = appsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data(), job } as ApplicationWithJob));
            return [...withoutJob, ...nextForJob];
          });
          setLoading(false);
        }, (error) => {
          console.error('Failed to load proposals for job:', job.id, error);
          setLoading(false);
        });
        appUnsubs.push(unsubApps);
      });
    }, (error) => {
      console.error('Failed to load client jobs for proposal comparison:', error);
      setLoading(false);
    });

    return () => {
      unsubJobs();
      appUnsubs.forEach((unsub) => unsub());
    };
  }, [user.uid]);

  const pending = useMemo(() => applications.filter((application) => application.status === 'pending'), [applications]);
  const comparison = useMemo(() => {
    if (pending.length < 2) return null;
    try {
      return buildProposalComparison({
        briefId: pending[0].job.id,
        clientId: user.uid,
        createdBy: user.uid,
        proposalIds: pending.map((application) => application.id),
        criteria: ['fit', 'fee transparency', 'programme', 'risk notes', 'verification readiness'],
        recommendationSummary: 'Advisory comparison generated from submitted application records. Client must confirm appointment before any contract or project change.',
        scores: Object.fromEntries(pending.map((application) => [application.id, scoreProposal(application)])),
      });
    } catch {
      return null;
    }
  }, [pending, user.uid]);

  const acceptApplication = async (application: ApplicationWithJob) => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      toast.error('Sign in again before accepting a proposal.');
      return;
    }
    setAcceptingId(application.id);
    try {
      const token = await getIdToken(firebaseUser);
      const response = await fetch(`/api/jobs/${application.job.id}/applications/${application.id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || body.details || 'Failed to accept proposal');
      toast.success('Proposal accepted and project workflow initiated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to accept proposal');
    } finally {
      setAcceptingId(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="client-proposal-comparison">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <Badge variant="secondary" className="w-fit uppercase tracking-widest">Client Tools</Badge>
          <CardTitle className="font-heading text-3xl flex items-center gap-3"><Users className="text-primary" /> BEP Proposal Comparison</CardTitle>
          <CardDescription>Compare real pending applications across your jobs by fit, fee clarity, timeline, exclusions, and risk notes. Appointment still requires your explicit confirmation.</CardDescription>
        </CardHeader>
      </Card>

      {loading && <Card className="rounded-2xl"><CardContent className="p-6 flex items-center gap-3 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading live proposal records...</CardContent></Card>}

      {comparison && (
        <Card className="rounded-2xl border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="font-heading text-xl">Advisory AI-ready comparison</CardTitle>
            <CardDescription>{comparison.recommendationSummary}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">{comparison.criteria?.map((criterion) => <Badge key={criterion} variant="outline">{criterion}</Badge>)}</div>
            <p className="text-xs text-muted-foreground">{comparison.limitations.join(' ')}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {pending.map((application) => (
          <Card key={`${application.job.id}-${application.id}`} className="rounded-2xl border-border bg-card/90">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge variant="secondary" className="mb-3">{application.job.title}</Badge>
                  <CardTitle className="font-heading text-xl">{application.architectName}</CardTitle>
                  <CardDescription>{application.proposal}</CardDescription>
                </div>
                <ProposalScore value={scoreProposal(application)} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Info label="Project budget" value={currency.format(application.job.budget || 0)} />
                <Info label="Deadline" value={application.job.deadline || 'Not recorded'} />
                <Info label="Category" value={application.job.category} />
                <Info label="Portfolio" value={application.portfolioUrl ? 'Provided' : 'Not provided'} />
              </div>
              {application.documents?.length ? <div className="flex flex-wrap gap-2">{application.documents.map((documentUrl) => <Badge key={documentUrl} variant="outline">Document</Badge>)}</div> : null}
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /> Confirm scope, exclusions, verification, contract, and escrow milestones before accepting.</div>
              <Button className="w-full rounded-xl" disabled={acceptingId === application.id || application.job.status !== 'open'} onClick={() => acceptApplication(application)}>
                {acceptingId === application.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-2" /> Accept proposal</>}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {!loading && pending.length === 0 && (
        <Card className="rounded-2xl border-border bg-card/90">
          <CardContent className="p-10 text-center space-y-3">
            <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
            <h3 className="font-heading text-xl font-bold">No pending proposals</h3>
            <p className="text-sm text-muted-foreground">Create a guided brief or publish a job opportunity to receive real BEP proposals.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function scoreProposal(application: ApplicationWithJob) {
  let score = 45;
  if (application.proposal?.length > 120) score += 15;
  if (application.portfolioUrl) score += 10;
  if (application.documents?.length) score += 10;
  if (application.job.requirements?.length) score += Math.min(10, application.job.requirements.length * 2);
  if (application.job.location) score += 5;
  return Math.min(95, score);
}

function ProposalScore({ value }: { value: number }) {
  return <div className="rounded-2xl bg-primary/10 text-primary px-4 py-3 text-center"><p className="text-2xl font-black">{value}</p><p className="text-[10px] uppercase tracking-widest font-bold">fit</p></div>;
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-xl border border-border p-3"><p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{label}</p><p className="font-semibold">{value}</p></div>;
}
