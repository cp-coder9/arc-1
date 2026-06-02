import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { addDoc, collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { ArrowRight, Briefcase, CheckCircle2, Loader2, MapPin, ShieldCheck, Sparkles } from 'lucide-react';
import { db } from '../lib/firebase';
import type { Application, Job, UserProfile } from '../types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';
import { subscribeToMergedQuerySnapshots } from '@/lib/firestoreQueryMerge';

type ApplicationWithJob = Application & { jobId: string };
type ApplicationDraft = { proposal: string; feeSummary: string; timeline: string; exclusions: string };
type MarketplaceProfile = UserProfile & { mainSpecialization?: string; portfolioUrl?: string; sacapNumber?: string };

const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });

function timestampMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime() || 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value === 'object' && 'seconds' in value && typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

function sortJobs(jobs: Job[]) {
  return [...jobs].sort((a, b) => timestampMs(b.updatedAt ?? b.createdAt) - timestampMs(a.updatedAt ?? a.createdAt));
}

function scoreJobForUser(job: Job, user: UserProfile) {
  const profile = user as MarketplaceProfile;
  let score = 45;
  const searchable = [job.title, job.description, job.category, job.location, ...(job.requirements ?? [])].join(' ').toLowerCase();
  const labels = [profile.professionalLabel, ...(profile.professionalLabels ?? []), profile.mainSpecialization, profile.region].filter(Boolean).map((item) => String(item).toLowerCase());
  labels.forEach((label) => {
    if (label && searchable.includes(label)) score += 10;
  });
  if (profile.region && job.location?.toLowerCase().includes(profile.region.toLowerCase())) score += 12;
  if (job.requirements?.length) score += Math.min(12, job.requirements.length * 2);
  if (profile.sacapNumber || profile.hasPIInsurance) score += 8;
  return Math.min(96, score);
}

function emptyDraft(): ApplicationDraft {
  return { proposal: '', feeSummary: '', timeline: '', exclusions: '' };
}

export default function BEPClientMarketplacePage({ user }: { user: UserProfile }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<ApplicationWithJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, ApplicationDraft>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const applicationUnsubs: Array<() => void> = [];
    const jobsQuery = query(collection(db, 'jobs'), where('status', '==', 'open'), limit(40));
    const unsubJobs = onSnapshot(jobsQuery, (snapshot) => {
      applicationUnsubs.splice(0).forEach((unsubscribe) => unsubscribe());
      const liveJobs = sortJobs(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Job)));
      setJobs(liveJobs);
      setSelectedJobId((current) => current || liveJobs[0]?.id || '');
      setApplications([]);

      if (liveJobs.length === 0) setLoading(false);
      liveJobs.forEach((job) => {
        const appQueries = [
          query(collection(db, `jobs/${job.id}/applications`), where('professionalId', '==', user.uid), limit(3)),
          query(collection(db, `jobs/${job.id}/applications`), where('bepId', '==', user.uid), limit(3)),
          query(collection(db, `jobs/${job.id}/applications`), where('architectId', '==', user.uid), limit(3)),
        ];
        const unsubApps = subscribeToMergedQuerySnapshots<ApplicationWithJob>(appQueries, (docSnap) => ({ id: docSnap.id, jobId: job.id, ...docSnap.data() } as ApplicationWithJob), (nextForJob) => {
          setApplications((current) => {
            const withoutJob = current.filter((application) => application.jobId !== job.id);
            return [...withoutJob, ...nextForJob];
          });
          setLoading(false);
        }, (error) => {
          console.warn('BEP marketplace applications unavailable:', error);
          setLoading(false);
        });
        applicationUnsubs.push(unsubApps);
      });
    }, (error) => {
      console.warn('BEP marketplace jobs unavailable:', error);
      setJobs([]);
      setLoading(false);
    });

    return () => {
      unsubJobs();
      applicationUnsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [user.uid]);

  const rankedJobs = useMemo(() => jobs.map((job) => ({ job, score: scoreJobForUser(job, user), application: applications.find((item) => item.jobId === job.id) })).sort((a, b) => b.score - a.score), [applications, jobs, user]);
  const selected = rankedJobs.find((item) => item.job.id === selectedJobId) ?? rankedJobs[0];
  const selectedDraft = drafts[selected?.job.id ?? ''] ?? emptyDraft();

  const updateDraft = (jobId: string, patch: Partial<ApplicationDraft>) => setDrafts((current) => ({ ...current, [jobId]: { ...(current[jobId] ?? emptyDraft()), ...patch } }));

  const submitProposal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || selected.application) return;
    const draft = drafts[selected.job.id] ?? emptyDraft();
    if (!draft.proposal.trim() || !draft.feeSummary.trim() || !draft.timeline.trim()) {
      toast.error('Complete proposal, fee summary, and timeline before submitting.');
      return;
    }

    setSubmittingId(selected.job.id);
    try {
      const profile = user as MarketplaceProfile;
      const now = new Date().toISOString();
      await addDoc(collection(db, `jobs/${selected.job.id}/applications`), {
        jobId: selected.job.id,
        professionalId: user.uid,
        bepId: user.uid,
        architectId: user.uid,
        architectName: user.displayName || user.email || 'Design professional',
        applicantRole: user.role,
        proposal: draft.proposal.trim(),
        notes: [
          `Fee summary: ${draft.feeSummary.trim()}`,
          `Timeline: ${draft.timeline.trim()}`,
          draft.exclusions.trim() ? `Exclusions/assumptions: ${draft.exclusions.trim()}` : '',
        ].filter(Boolean).join('\n'),
        portfolioUrl: profile.portfolioUrl ?? '',
        sacapNumber: profile.sacapNumber ?? '',
        specializations: profile.professionalLabels ?? (profile.professionalLabel ? [profile.professionalLabel] : []),
        averageRating: profile.averageRating ?? null,
        completedJobs: profile.completedJobs ?? 0,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      });
      setDrafts((current) => ({ ...current, [selected.job.id]: emptyDraft() }));
      toast.success('Proposal submitted for client comparison.');
    } catch (error) {
      console.warn('BEP marketplace proposal submit failed:', error);
      toast.error('Proposal could not be submitted. Check role and job visibility.');
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="bep-client-marketplace-page">
      <Card className="overflow-hidden rounded-[2rem] border-border bg-card/95 shadow-sm">
        <CardHeader className="border-b border-border bg-primary/5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Badge variant="secondary" className="w-fit uppercase tracking-widest">BEP Tools</Badge>
              <CardTitle className="mt-3 flex items-center gap-3 font-heading text-3xl"><Briefcase className="h-7 w-7 text-primary" /> Client Marketplace</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base leading-relaxed">
                Review live client opportunities, prepare a scoped proposal, and submit it into the same proposal comparison workflow the client sees. No fabricated opportunities are shown.
              </CardDescription>
            </div>
            <Badge className="w-fit capitalize">{user.role}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 p-6 md:grid-cols-3">
          <Metric label="Open briefs" value={jobs.length} />
          <Metric label="Submitted by you" value={applications.length} />
          <Metric label="Best fit" value={rankedJobs[0] ? `${rankedJobs[0].score}%` : 'n/a'} />
        </CardContent>
      </Card>

      {loading && <Card className="rounded-2xl"><CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading live marketplace opportunities...</CardContent></Card>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {rankedJobs.map(({ job, score, application }) => (
            <Card key={job.id} className={`rounded-2xl border-border bg-card/90 shadow-sm transition-colors ${selected?.job.id === job.id ? 'ring-2 ring-primary/30' : ''}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Badge variant="secondary" className="mb-3">{job.category}</Badge>
                    <CardTitle className="font-heading text-xl">{job.title}</CardTitle>
                    <CardDescription className="mt-2 line-clamp-3">{job.description}</CardDescription>
                  </div>
                  <div className="rounded-2xl bg-primary/10 px-4 py-3 text-center text-primary"><p className="text-2xl font-black">{score}</p><p className="text-[10px] font-bold uppercase tracking-widest">fit</p></div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Info label="Budget" value={currency.format(job.budget || 0)} />
                  <Info label="Deadline" value={job.deadline || 'Not recorded'} />
                  <Info label="Location" value={job.location || 'South Africa'} />
                  <Info label="Status" value={application ? application.status : 'not submitted'} />
                </div>
                {job.requirements?.length ? <div className="flex flex-wrap gap-2">{job.requirements.slice(0, 5).map((requirement) => <Badge key={requirement} variant="outline" className="rounded-full">{requirement}</Badge>)}</div> : null}
              </CardContent>
              <CardFooter>
                <Button type="button" variant={selected?.job.id === job.id ? 'default' : 'outline'} className="w-full rounded-xl gap-2" onClick={() => setSelectedJobId(job.id)}>
                  {application ? <CheckCircle2 className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />} {application ? 'View submitted proposal' : 'Prepare proposal'}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        <Card className="rounded-2xl border-border bg-card/95 shadow-sm xl:sticky xl:top-24 xl:self-start">
          <CardHeader>
            <CardTitle className="font-heading text-xl flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Proposal workspace</CardTitle>
            <CardDescription>{selected ? selected.job.title : 'Select a live client brief to prepare a proposal.'}</CardDescription>
          </CardHeader>
          <CardContent>
            {selected ? selected.application ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 className="mb-2 h-5 w-5" /> You have submitted a proposal for this client brief. The client can compare and appoint from their proposal comparison tool.</div>
                <Info label="Submitted proposal" value={selected.application.proposal} />
                <Info label="Status" value={selected.application.status} />
              </div>
            ) : (
              <form onSubmit={submitProposal} className="space-y-3">
                <Textarea value={selectedDraft.proposal} onChange={(event) => updateDraft(selected.job.id, { proposal: event.target.value })} placeholder="Scope response: approach, deliverables, assumptions, and governance notes" className="min-h-32" required />
                <Input value={selectedDraft.feeSummary} onChange={(event) => updateDraft(selected.job.id, { feeSummary: event.target.value })} placeholder="Fee summary, e.g. Stage-based fee with exclusions" required />
                <Input value={selectedDraft.timeline} onChange={(event) => updateDraft(selected.job.id, { timeline: event.target.value })} placeholder="Timeline, e.g. 3 weeks to concept sign-off" required />
                <Textarea value={selectedDraft.exclusions} onChange={(event) => updateDraft(selected.job.id, { exclusions: event.target.value })} placeholder="Exclusions, assumptions, information required" />
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0" /> Proposal submission is live and auditable. Contract, appointment, and escrow remain separate client-confirmed steps.</div>
                <Button type="submit" disabled={submittingId === selected.job.id} className="w-full rounded-xl gap-2">{submittingId === selected.job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Submit proposal</Button>
              </form>
            ) : <p className="text-sm text-muted-foreground">No live opportunities are available.</p>}
          </CardContent>
        </Card>
      </div>

      {!loading && rankedJobs.length === 0 && (
        <Card className="rounded-2xl border-border bg-card/90"><CardContent className="p-10 text-center text-sm text-muted-foreground"><MapPin className="mx-auto mb-3 h-8 w-8 text-primary" /> No open client briefs are currently visible.</CardContent></Card>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-background/70 p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p><p className="mt-1 font-heading text-3xl font-black text-primary">{value}</p></div>;
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-background/60 p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold leading-relaxed">{value}</p></div>;
}
