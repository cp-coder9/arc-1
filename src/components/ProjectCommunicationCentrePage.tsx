import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, query, type DocumentData, type Query, where } from 'firebase/firestore';
import { AlertTriangle, Bot, CheckCircle2, FileText, Loader2, MessageCircle, Paperclip, Search, Send, ShieldCheck, Smartphone, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { subscribeToMergedQuerySnapshots } from '@/lib/firestoreQueryMerge';
import type { Job, Message, ProjectCommunicationCaptureType, ProjectStage, UserProfile } from '@/types';
import { PROJECT_STAGE_LABELS, PROJECT_STAGE_ORDER } from '@/types';
import { messagingService } from '@/services/messagingService';
import { getPhaseCommunicationConfig, PROJECT_COMMUNICATION_CAPTURE_TYPES } from '@/services/phaseCommunicationConfig';
import { buildProjectCommunicationCentreModel, type ProjectCommunicationThreadCard } from '@/services/projectCommunicationCentreService';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

type LoadState = 'loading' | 'ready' | 'error';

type MessageScope = {
  canSend: boolean;
  reason: string;
};

function timestampMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime() || 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && value && 'toDate' in value && typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value === 'object' && value && 'seconds' in value && typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

function sortByRecent<T extends { createdAt?: unknown; updatedAt?: unknown }>(items: T[]) {
  return [...items].sort((a, b) => timestampMs(b.updatedAt ?? b.createdAt) - timestampMs(a.updatedAt ?? a.createdAt));
}

function sortByOldest<T extends { createdAt?: unknown }>(items: T[]) {
  return [...items].sort((a, b) => timestampMs(a.createdAt) - timestampMs(b.createdAt));
}

function jobsForUser(user: UserProfile): Query<DocumentData>[] {
  const jobs = collection(db, 'jobs');
  if (user.role === 'admin') return [query(jobs, limit(50))];
  if (user.role === 'client') return [query(jobs, where('clientId', '==', user.uid), limit(50))];
  if (user.role === 'architect' || user.role === 'bep') return [
    query(jobs, where('selectedProfessionalId', '==', user.uid), limit(50)),
    query(jobs, where('selectedBepId', '==', user.uid), limit(50)),
    query(jobs, where('selectedArchitectId', '==', user.uid), limit(50)),
  ];
  if (user.role === 'freelancer') return [query(jobs, where('selectedArchitectId', '==', user.uid), limit(50))];
  return [query(jobs, where('status', '==', 'open'), limit(50))];
}

function selectedProfessionalId(job?: Job) {
  return String((job as unknown as Record<string, unknown> | undefined)?.selectedProfessionalId ?? (job as unknown as Record<string, unknown> | undefined)?.selectedBepId ?? job?.selectedArchitectId ?? '');
}

function scopeForJob(user: UserProfile, job?: Job): MessageScope {
  if (!job) return { canSend: false, reason: 'Select a live project before opening a governed communication thread.' };
  if (job.clientId === user.uid || selectedProfessionalId(job) === user.uid) return { canSend: true, reason: 'You are a project participant; messages are stored as governed project records.' };
  if (user.role === 'admin') return { canSend: false, reason: 'Admins can review the message centre but must not impersonate project participants.' };
  return { canSend: false, reason: 'This role needs a live appointment, package award, or project-team link before direct messaging is enabled.' };
}

function messageAuthor(message: Message, user: UserProfile) {
  if (message.senderId === user.uid) return 'You';
  return message.senderRole ? message.senderRole.replace('-', ' ') : 'Project participant';
}

function safeProjectId(job?: Job) {
  return job ? `project-${job.id}` : undefined;
}

function ProjectChatApplet({ user, selectedJob, messages, scope }: { user: UserProfile; selectedJob?: Job; messages: Message[]; scope: MessageScope }) {
  const defaultStage = (selectedJob as unknown as { currentStage?: ProjectStage } | undefined)?.currentStage ?? 'delivery';
  const [phase, setPhase] = useState<ProjectStage>(defaultStage);
  const [captureType, setCaptureType] = useState<ProjectCommunicationCaptureType>('chat');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => setPhase(defaultStage), [defaultStage, selectedJob?.id]);

  const phaseConfig = getPhaseCommunicationConfig(phase);

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedJob || !scope.canSend || !draft.trim()) return;
    setSending(true);
    try {
      await messagingService.sendMessage({
        jobId: selectedJob.id,
        projectId: safeProjectId(selectedJob),
        phase,
        captureType,
        structuredStatus: 'raw',
        visibility: captureType === 'approval_request' ? 'client_professional' : 'job_participants',
        senderId: user.uid,
        senderRole: user.role,
        content: draft.trim(),
      });
      setDraft('');
      toast.success('Project communication captured as a governed record');
    } catch (error) {
      console.warn('Project communication send failed:', error);
      toast.error('Message could not be sent. Check project membership and permissions.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm" data-testid="project-chat-applet">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <Badge variant="secondary" className="uppercase tracking-widest"><Smartphone className="mr-1 h-3 w-3" /> ProjectChatApplet</Badge>
            <CardTitle className="mt-3 font-heading text-2xl">Mobile-style project capture</CardTitle>
            <CardDescription>WhatsApp-familiar chat, phase selector, capture type, prompts, files, RFIs, approvals, and audit-aware records.</CardDescription>
          </div>
          <Badge className="w-fit capitalize">{user.role}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            Phase
            <select value={phase} onChange={(event) => setPhase(event.target.value as ProjectStage)} className="h-11 rounded-xl border border-input bg-background px-3 text-sm">
              {PROJECT_STAGE_ORDER.map(stage => <option key={stage} value={stage}>{PROJECT_STAGE_LABELS[stage]}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Capture type
            <select value={captureType} onChange={(event) => setCaptureType(event.target.value as ProjectCommunicationCaptureType)} className="h-11 rounded-xl border border-input bg-background px-3 text-sm">
              {PROJECT_COMMUNICATION_CAPTURE_TYPES.map(type => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}
            </select>
          </label>
        </div>

        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
          <div className="mb-2 flex items-center gap-2 font-semibold text-foreground"><Sparkles className="h-4 w-4 text-primary" /> Phase prompts</div>
          <div className="flex flex-wrap gap-2">
            {phaseConfig.suggestedPrompts.map(prompt => <Badge key={prompt} variant="outline" className="rounded-full">{prompt}</Badge>)}
          </div>
        </div>

        <div className="max-h-[22rem] space-y-3 overflow-y-auto rounded-2xl border border-border bg-background/40 p-3">
          {messages.length === 0 && <p className="p-4 text-sm text-muted-foreground">No messages are recorded for this project yet.</p>}
          {messages.map((message) => {
            const mine = message.senderId === user.uid;
            return (
              <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[86%] rounded-2xl border p-3 text-sm ${mine ? 'border-primary/20 bg-primary text-primary-foreground' : 'border-border bg-card'}`}>
                  <div className="mb-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-widest opacity-75">
                    <span>{messageAuthor(message, user)}</span>
                    <span>{message.phase ?? 'legacy'}</span>
                    <span>{message.captureType ?? 'chat'}</span>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                </div>
              </div>
            );
          })}
        </div>

        <form onSubmit={sendMessage} className="grid gap-3 border-t border-border pt-4">
          <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Capture a project message, photo note, RFI, approval request, or site record..." disabled={!scope.canSend || sending} />
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="flex gap-2 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {scope.reason}</p>
            <Button type="submit" disabled={!scope.canSend || sending || !draft.trim()} className="w-fit rounded-xl gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Capture
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ProjectMessageCentre({ cards }: { cards: ProjectCommunicationThreadCard[] }) {
  const [selectedId, setSelectedId] = useState('');
  const selected = cards.find(card => card.id === selectedId) ?? cards[0];

  return (
    <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm" data-testid="project-message-centre">
      <CardHeader>
        <Badge variant="secondary" className="w-fit uppercase tracking-widest"><MessageCircle className="mr-1 h-3 w-3" /> ProjectMessageCentre</Badge>
        <CardTitle className="font-heading text-2xl">Desktop message centre</CardTitle>
        <CardDescription>Searchable governance view for assignment, conversion, approvals, attachments, record links, and audit follow-up.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-3">
          {cards.length === 0 && <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No communication records match the current filters.</p>}
          {cards.map(card => (
            <button key={card.id} type="button" onClick={() => setSelectedId(card.id)} className={`w-full rounded-2xl border p-4 text-left transition hover:border-primary/40 ${selected?.id === card.id ? 'border-primary/40 bg-primary/5' : 'border-border bg-background/60'}`}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline">{card.phase}</Badge>
                <Badge variant="secondary">{card.captureType.replaceAll('_', ' ')}</Badge>
                <Badge variant={card.structuredStatus === 'raw' ? 'destructive' : 'default'}>{card.structuredStatus}</Badge>
                {card.requiresHumanApproval && <Badge className="gap-1"><AlertTriangle className="h-3 w-3" /> approval</Badge>}
              </div>
              <h3 className="font-semibold">{card.jobTitle}</h3>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{card.content}</p>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Paperclip className="h-3 w-3" /> {card.attachmentCount} files</span>
                <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {card.linkedRecordCount} links</span>
                {card.legacyFallback && <span>legacy fallback</span>}
              </div>
            </button>
          ))}
        </div>

        <aside className="rounded-2xl border border-border bg-background/70 p-4">
          {!selected ? <p className="text-sm text-muted-foreground">Select a message to review details.</p> : (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Structured detail</p>
                <h3 className="mt-1 font-heading text-xl">{selected.jobTitle}</h3>
              </div>
              <p className="rounded-xl bg-muted/60 p-3 text-sm leading-relaxed">{selected.content}</p>
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Visibility</span><strong>{selected.visibility}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Actions</span><strong>{selected.actionCount}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">recordLinks</span><strong>{selected.linkedRecordCount}</strong></div>
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Suggested conversions</p>
                <div className="flex flex-wrap gap-2">{selected.suggestedConversionRoutes.map(route => <Badge key={route} variant="outline">{route}</Badge>)}</div>
              </div>
              {selected.requiresHumanApproval && (
                <div className="rounded-2xl border border-amber-300/40 bg-amber-50 p-3 text-sm text-amber-900">
                  <div className="mb-1 flex items-center gap-2 font-semibold"><Bot className="h-4 w-4" /> AI draft only</div>
                  <p>{selected.aiSummary ?? 'Review and approve before issuing any formal instruction, approval, or submission.'}</p>
                </div>
              )}
            </div>
          )}
        </aside>
      </CardContent>
    </Card>
  );
}

export default function ProjectCommunicationCentrePage({ user }: { user: UserProfile }) {
  const [state, setState] = useState<LoadState>('loading');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageState, setMessageState] = useState<LoadState>('ready');
  const [phaseFilter, setPhaseFilter] = useState<ProjectStage | 'all'>('all');
  const [captureFilter, setCaptureFilter] = useState<ProjectCommunicationCaptureType | 'all'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setState('loading');
    const unsubscribe = subscribeToMergedQuerySnapshots<Job>(jobsForUser(user), (docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Job), (items) => {
      setJobs(sortByRecent(items));
      setState('ready');
    }, (error) => {
      console.warn('Project communication jobs unavailable:', error);
      setJobs([]);
      setState('error');
    });
    return () => unsubscribe();
  }, [user]);

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) ?? jobs[0], [jobs, selectedJobId]);
  const scope = useMemo(() => scopeForJob(user, selectedJob), [user, selectedJob]);

  useEffect(() => {
    if (!selectedJob) {
      setMessages([]);
      setMessageState('ready');
      return undefined;
    }
    setMessageState('loading');
    const unsubscribe = onSnapshot(query(collection(db, 'messages'), where('jobId', '==', selectedJob.id), limit(100)), (snapshot) => {
      setMessages(sortByOldest(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Message))));
      setMessageState('ready');
    }, (error) => {
      console.warn('Project communication thread unavailable:', error);
      setMessages([]);
      setMessageState('error');
    });
    return () => unsubscribe();
  }, [selectedJob]);

  const centreModel = useMemo(() => buildProjectCommunicationCentreModel({
    jobs,
    messages,
    selectedJobId: selectedJob?.id,
    filters: { phase: phaseFilter, captureType: captureFilter, search },
  }), [jobs, messages, selectedJob?.id, phaseFilter, captureFilter, search]);

  return (
    <div className="space-y-6" data-testid="project-communication-centre-page">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">Project Communications</Badge>
              <CardTitle className="font-heading text-3xl mt-3 flex items-center gap-3"><MessageCircle className="h-7 w-7 text-primary" /> Project Communication Engine</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">Native Architex communication layer: mobile capture plus desktop message centre, backed by project permissions, lifecycle stages, AI draft suggestions, and auditable records.</CardDescription>
            </div>
            <Badge className="capitalize w-fit">{user.role}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {state === 'loading' && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading visible projects...</div>}
          {state === 'error' && <div className="text-sm text-destructive">Unable to load project communications for this role. Check Firestore permissions.</div>}
          {jobs.length > 0 ? (
            <select value={selectedJob?.id ?? ''} onChange={(event) => setSelectedJobId(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm md:max-w-2xl">
              {jobs.map((job) => <option key={job.id} value={job.id}>{job.title} · {job.status}</option>)}
            </select>
          ) : state !== 'loading' && <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No live project context is visible for communications.</div>}
          <div className="grid gap-3 md:grid-cols-5">
            <Metric label="Messages" value={centreModel.summary.totalMessages} />
            <Metric label="Unread" value={centreModel.summary.unreadMessages} />
            <Metric label="Raw captures" value={centreModel.summary.unconvertedMessages} />
            <Metric label="Attachments" value={centreModel.summary.attachmentMessages} />
            <Metric label="Approval queue" value={centreModel.summary.humanApprovalQueue} danger={centreModel.summary.humanApprovalQueue > 0} />
          </div>
        </CardContent>
      </Card>

      {messageState === 'error' && <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">This role cannot read the selected communication thread yet.</p>}

      <ProjectChatApplet user={user} selectedJob={selectedJob} messages={messages} scope={scope} />

      <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          <label className="grid gap-2 text-sm font-medium">
            Filter phase
            <select value={phaseFilter} onChange={(event) => setPhaseFilter(event.target.value as ProjectStage | 'all')} className="h-11 rounded-xl border border-input bg-background px-3 text-sm">
              <option value="all">All phases</option>
              {PROJECT_STAGE_ORDER.map(stage => <option key={stage} value={stage}>{PROJECT_STAGE_LABELS[stage]}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Filter capture
            <select value={captureFilter} onChange={(event) => setCaptureFilter(event.target.value as ProjectCommunicationCaptureType | 'all')} className="h-11 rounded-xl border border-input bg-background px-3 text-sm">
              <option value="all">All capture types</option>
              {PROJECT_COMMUNICATION_CAPTURE_TYPES.map(type => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Search
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search messages, phases, roles..." /></div>
          </label>
        </CardContent>
      </Card>

      <ProjectMessageCentre cards={centreModel.threadCards} />
    </div>
  );
}

function Metric({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${danger ? 'border-amber-300/50 bg-amber-50 text-amber-950' : 'border-border bg-background/70'}`}>
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-center gap-2 text-2xl font-black">{danger ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5 text-primary" />} {value}</p>
    </div>
  );
}
