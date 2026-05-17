import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { addDoc, collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { Loader2, MessageCircle, Send, ShieldCheck } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { Job, Message, UserProfile } from '@/types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';

type LoadState = 'loading' | 'ready' | 'error';

type MessageScope = {
  canSend: boolean;
  reason: string;
};

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

function sortByOldest<T extends { createdAt?: unknown }>(items: T[]) {
  return [...items].sort((a, b) => timestampMs(a.createdAt) - timestampMs(b.createdAt));
}

function jobsForUser(user: UserProfile) {
  const jobs = collection(db, 'jobs');
  if (user.role === 'admin') return query(jobs, limit(40));
  if (user.role === 'client') return query(jobs, where('clientId', '==', user.uid), limit(40));
  if (user.role === 'architect' || user.role === 'bep' || user.role === 'freelancer') return query(jobs, where('selectedArchitectId', '==', user.uid), limit(40));
  return query(jobs, where('status', '==', 'open'), limit(40));
}

function scopeForJob(user: UserProfile, job?: Job): MessageScope {
  if (!job) return { canSend: false, reason: 'Select a live project or job before opening a governed message thread.' };
  if (job.clientId === user.uid || job.selectedArchitectId === user.uid) return { canSend: true, reason: 'You are a live project participant for this thread.' };
  if (user.role === 'admin') return { canSend: false, reason: 'Admins can monitor visible job context here, but do not impersonate project participants in client/BEP threads.' };
  return { canSend: false, reason: 'This role needs a live appointment, package award, or project-team link before direct project messaging is enabled.' };
}

function messageAuthor(message: Message, user: UserProfile) {
  if (message.senderId === user.uid) return 'You';
  return message.senderRole ? message.senderRole.replace('-', ' ') : 'Project participant';
}

export default function ProjectMessengerPage({ user }: { user: UserProfile }) {
  const [state, setState] = useState<LoadState>('loading');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [messageState, setMessageState] = useState<LoadState>('ready');

  useEffect(() => {
    setState('loading');
    const unsubscribe = onSnapshot(jobsForUser(user), (snapshot) => {
      setJobs(sortByRecent(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Job))));
      setState('ready');
    }, (error) => {
      console.warn('Project messenger jobs unavailable; continuing without job context:', error);
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
    const unsubscribe = onSnapshot(query(collection(db, 'messages'), where('jobId', '==', selectedJob.id), limit(75)), (snapshot) => {
      setMessages(sortByOldest(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Message))));
      setMessageState('ready');
    }, (error) => {
      console.warn('Project messenger thread unavailable for this role/job:', error);
      setMessages([]);
      setMessageState('error');
    });

    return () => unsubscribe();
  }, [selectedJob]);

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedJob || !scope.canSend || !draft.trim()) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'messages'), {
        jobId: selectedJob.id,
        senderId: user.uid,
        senderRole: user.role,
        content: draft.trim(),
        isRead: false,
        createdAt: new Date().toISOString(),
      });
      setDraft('');
      toast.success('Message sent to the governed project thread');
    } catch (error) {
      console.warn('Project message send failed:', error);
      toast.error('Message could not be sent. Check project membership and permissions.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="project-messenger-page">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">Project Messenger</Badge>
              <CardTitle className="font-heading text-3xl mt-3 flex items-center gap-3"><MessageCircle className="h-7 w-7 text-primary" /> Governed project messages</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">
                Live job-linked message threads. The tool only sends messages when Firestore rules confirm that the user is a project participant; no simulated conversations are shown.
              </CardDescription>
            </div>
            <Badge className="capitalize w-fit">{user.role}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {state === 'loading' && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading visible jobs...</div>}
          {state === 'error' && <div className="text-sm text-destructive">Unable to load the message workspace for this role. Check Firestore permissions.</div>}
          {jobs.length > 0 ? (
            <select value={selectedJob?.id ?? ''} onChange={(event) => setSelectedJobId(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm md:max-w-2xl">
              {jobs.map((job) => <option key={job.id} value={job.id}>{job.title} · {job.status}</option>)}
            </select>
          ) : state !== 'loading' && <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No live job context is visible for messaging.</div>}
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p>{scope.reason}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-xl">Thread</CardTitle>
          <CardDescription>{selectedJob ? selectedJob.title : 'Select a job to view its live thread.'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {messageState === 'loading' && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading thread...</div>}
          {messageState === 'error' && <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">This role cannot read the selected message thread yet.</p>}
          {messageState === 'ready' && messages.length === 0 && <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No messages are recorded for this job.</p>}
          <div className="space-y-3">
            {messages.map((message) => {
              const mine = message.senderId === user.uid;
              return (
                <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[82%] rounded-2xl border p-4 text-sm ${mine ? 'border-primary/20 bg-primary text-primary-foreground' : 'border-border bg-background/80'}`}>
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-75">
                      <span>{messageAuthor(message, user)}</span>
                      <span>{message.createdAt ? new Date(message.createdAt).toLocaleString() : 'No timestamp'}</span>
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <form onSubmit={sendMessage} className="grid gap-3 border-t border-border pt-4">
            <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a project message..." disabled={!scope.canSend || sending} />
            <Button type="submit" disabled={!scope.canSend || sending || !draft.trim()} className="w-fit rounded-xl gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send message
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
