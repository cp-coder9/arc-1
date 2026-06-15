import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { collection, doc, getDoc, limit, onSnapshot, query, where } from 'firebase/firestore';
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { auth, db } from '@/lib/firebase';
import type { AiActionLog, AiReviewQueueItem, HumanSignOffDomain } from '@/services/aiGovernanceService';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Textarea } from './ui/textarea';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
type QueueRecord = AiReviewQueueItem & {
  id: string;
  decision?: string;
  resolutionReason?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  updatedAt?: string;
};

type ActionLogRecord = AiActionLog & { id: string; reviewedBy?: string; reviewedAt?: string; reviewDecision?: string; reviewReason?: string };
type Decision = 'resolved' | 'dismissed' | 'rejected';

type ResolveState = {
  itemId: string;
  decision: Decision;
  reason: string;
  includeHumanSignOff: boolean;
  signOffDomain: HumanSignOffDomain;
  declaration: string;
};

const defaultResolveState: ResolveState = {
  itemId: '',
  decision: 'resolved',
  reason: '',
  includeHumanSignOff: false,
  signOffDomain: 'compliance_declaration',
  declaration: '',
};

function timestampMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime() || 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value === 'object' && 'seconds' in value && typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

function sortQueue(items: QueueRecord[]) {
  const priorityWeight: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  return [...items].sort((a, b) => (priorityWeight[b.priority] ?? 0) - (priorityWeight[a.priority] ?? 0) || timestampMs(b.createdAt) - timestampMs(a.createdAt));
}

function priorityVariant(priority: string) {
  if (priority === 'critical' || priority === 'high') return 'destructive' as const;
  return 'secondary' as const;
}

function actionStatusVariant(status?: string) {
  if (!status) return 'secondary' as const;
  if (status === 'human_confirmed' || status === 'advisory') return 'default' as const;
  if (status === 'rejected' || status === 'requires_review') return 'destructive' as const;
  return 'secondary' as const;
}

export default function AdminAIReviewQueue() {
  const [items, setItems] = useState<QueueRecord[]>([]);
  const [actionLogs, setActionLogs] = useState<Record<string, ActionLogRecord>>({});
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [resolveState, setResolveState] = useState<ResolveState>(defaultResolveState);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setState('loading');
    return onSnapshot(
      query(getDemoCol( 'ai_review_queue'), where('status', '==', 'open'), limit(50)),
      (snapshot) => {
        const records = sortQueue(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as QueueRecord)));
        setItems(records);
        setResolveState((current) => current.itemId && records.some((item) => item.id === current.itemId)
          ? current
          : { ...defaultResolveState, itemId: records[0]?.id ?? '' });
        setState('ready');
      },
      (error) => {
        console.warn('Admin AI review queue unavailable:', error);
        setItems([]);
        setState('error');
      },
    );
  }, []);

  useEffect(() => {
    const actionLogIds = Array.from(new Set(items.map((item) => item.actionLogId).filter(Boolean))) as string[];
    if (actionLogIds.length === 0) {
      setActionLogs({});
      return;
    }

    let cancelled = false;
    Promise.all(actionLogIds.map(async (id) => {
      try {
        const snap = await getDoc(getDemoDoc( 'ai_action_logs', id));
        return snap.exists() ? [id, { id: snap.id, ...snap.data() } as ActionLogRecord] as const : null;
      } catch (error) {
        console.warn('AI action log detail unavailable:', error);
        return null;
      }
    })).then((entries) => {
      if (cancelled) return;
      setActionLogs(Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, ActionLogRecord]>));
    });

    return () => { cancelled = true; };
  }, [items]);

  const selectedItem = useMemo(() => items.find((item) => item.id === resolveState.itemId) ?? items[0], [items, resolveState.itemId]);
  const selectedActionLog = selectedItem?.actionLogId ? actionLogs[selectedItem.actionLogId] : undefined;
  const stats = useMemo(() => ({
    open: items.length,
    critical: items.filter((item) => item.priority === 'critical').length,
    complianceFlags: items.filter((item) => item.flags?.length).length,
  }), [items]);

  const submitResolution = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedItem) return;
    if (!resolveState.reason.trim()) {
      toast.error('Reason is required before resolving an AI review item');
      return;
    }
    if (resolveState.includeHumanSignOff && !resolveState.declaration.trim()) {
      toast.error('Human sign-off declaration is required');
      return;
    }

    setSubmitting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Admin authentication token unavailable');
      const response = await apiFetch(`/api/admin/ai-review/${selectedItem.id}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          decision: resolveState.decision,
          reason: resolveState.reason.trim(),
          ...(resolveState.includeHumanSignOff ? {
            humanSignOff: {
              domain: resolveState.signOffDomain,
              target: {
                type: selectedItem.target?.type || 'ai_review_queue',
                id: selectedItem.target?.id || selectedItem.id,
                projectId: selectedItem.projectId,
              },
              declaration: resolveState.declaration.trim(),
            },
          } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'AI review resolution failed');
      toast.success('AI review queue item resolved');
      setResolveState({ ...defaultResolveState, itemId: '' });
    } catch (error: any) {
      console.warn('AI review resolution failed:', error);
      toast.error(error.message || 'AI review resolution failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="admin-ai-review-queue">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <QueueMetric icon={<ShieldCheck />} label="Open queue" value={stats.open} />
        <QueueMetric icon={<AlertTriangle />} label="Critical" value={stats.critical} destructive={stats.critical > 0} />
        <QueueMetric icon={<Sparkles />} label="Flagged outputs" value={stats.complianceFlags} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-xl">Open AI review items</CardTitle>
            <CardDescription>Live queue items from `ai_review_queue`. Empty means no pending AI output is being hidden.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {state === 'loading' && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading AI review queue...</div>}
            {state === 'error' && <div className="text-sm text-destructive">Unable to load AI review queue. Check admin Firestore permissions.</div>}
            {state === 'ready' && items.length === 0 && <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No open AI review items.</p>}
            {items.map((item) => {
              const actionLog = item.actionLogId ? actionLogs[item.actionLogId] : undefined;
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setResolveState((current) => ({ ...current, itemId: item.id }))}
                  className={`w-full rounded-2xl border p-4 text-left transition hover:border-primary/50 ${selectedItem?.id === item.id ? 'border-primary bg-primary/5' : 'border-border bg-background/80'}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">{actionLog?.actionKind?.replaceAll('_', ' ') ?? item.target?.type ?? 'AI review item'}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Project {item.projectId} · target {item.target?.type}/{item.target?.id}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={priorityVariant(item.priority)}>{item.priority}</Badge>
                      <Badge variant="secondary">{item.assignedRole}</Badge>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{item.reason}</p>
                  {actionLog?.outputSummary && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">AI output: {actionLog.outputSummary}</p>}
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading text-xl"><CheckCircle2 className="h-5 w-5 text-primary" /> Resolve review</CardTitle>
            <CardDescription>Resolution goes through `/api/admin/ai-review/:itemId/resolve`; direct browser writes remain blocked by Firestore rules.</CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedItem ? <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">Select an open queue item to resolve.</p> : (
              <form onSubmit={submitResolution} className="space-y-4">
                <div className="rounded-xl border border-border p-3 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground">{selectedItem.reason}</p>
                  <p className="mt-1">Action log: {selectedItem.actionLogId ?? 'not linked'}</p>
                  {selectedActionLog && <p className="mt-1">Status: <Badge variant={actionStatusVariant(selectedActionLog.status)}>{selectedActionLog.status.replaceAll('_', ' ')}</Badge></p>}
                </div>
                <select value={resolveState.decision} onChange={(event) => setResolveState((current) => ({ ...current, decision: event.target.value as Decision }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" disabled={submitting}>
                  <option value="resolved">Resolved</option>
                  <option value="dismissed">Dismissed</option>
                  <option value="rejected">Rejected</option>
                </select>
                <Textarea value={resolveState.reason} onChange={(event) => setResolveState((current) => ({ ...current, reason: event.target.value }))} placeholder="Admin resolution reason" required disabled={submitting} />
                <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
                  <input type="checkbox" className="mt-1" checked={resolveState.includeHumanSignOff} onChange={(event) => setResolveState((current) => ({ ...current, includeHumanSignOff: event.target.checked }))} disabled={submitting} />
                  <span><span className="font-semibold">Record human sign-off</span><span className="block text-xs text-muted-foreground">Use only after an authorized human has reviewed the evidence. AI cannot self-certify.</span></span>
                </label>
                {resolveState.includeHumanSignOff && (
                  <div className="space-y-3 rounded-xl border border-border p-3">
                    <select value={resolveState.signOffDomain} onChange={(event) => setResolveState((current) => ({ ...current, signOffDomain: event.target.value as HumanSignOffDomain }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" disabled={submitting}>
                      <option value="compliance_declaration">Compliance declaration</option>
                      <option value="professional_certificate">Professional certificate</option>
                      <option value="municipal_submission">Municipal submission</option>
                      <option value="escrow_release">Escrow release</option>
                      <option value="appointment_acceptance">Appointment acceptance</option>
                    </select>
                    <Textarea value={resolveState.declaration} onChange={(event) => setResolveState((current) => ({ ...current, declaration: event.target.value }))} placeholder="Human sign-off declaration" disabled={submitting} />
                  </div>
                )}
                <Button type="submit" disabled={submitting || !resolveState.reason.trim()} className="w-full rounded-xl gap-2">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Resolve queue item
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function QueueMetric({ icon, label, value, destructive = false }: { icon: React.ReactNode; label: string; value: React.ReactNode; destructive?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card/90 p-4 shadow-sm">
      <div className={`flex items-center gap-2 [&>svg]:h-5 [&>svg]:w-5 ${destructive ? 'text-destructive' : 'text-primary'}`}>{icon}<p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p></div>
      <p className="mt-3 font-heading text-3xl font-black">{value}</p>
    </div>
  );
}
