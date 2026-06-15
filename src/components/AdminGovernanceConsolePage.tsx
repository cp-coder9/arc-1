import React, { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, query, type DocumentData, type Query } from 'firebase/firestore';
import { AlertTriangle, Bot, CheckCircle2, ClipboardList, CreditCard, Landmark, Loader2, MessageSquareWarning, ShieldCheck, Users } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/types';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
type AdminGovernanceConsolePageProps = { user: UserProfile };
type GovernanceSignal = { id: string; title: string; description: string; collectionName: string; status?: string; actor?: string; createdAt?: string };
type GovernanceDataset = { id: string; label: string; description: string; collectionName: string; icon: React.ReactNode; query: Query<DocumentData>; riskStatuses?: string[] };

const RISK_STATUSES = ['blocked', 'disputed', 'failed', 'flagged', 'held', 'overdue', 'pending_review', 'rejected', 'requires_review'];

function datasetQuery(collectionName: string) { return query(getDemoCol( collectionName), limit(50)); }
function valueAsString(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') return value.toDate().toISOString();
  return undefined;
}
function statusVariant(status?: string) {
  const normalized = status?.toLowerCase();
  if (!normalized) return 'secondary' as const;
  if (RISK_STATUSES.includes(normalized)) return 'destructive' as const;
  if (['approved', 'completed', 'released', 'resolved', 'active'].includes(normalized)) return 'default' as const;
  return 'secondary' as const;
}
function signalFromDoc(collectionName: string, id: string, data: Record<string, unknown>): GovernanceSignal {
  const status = valueAsString(data.status ?? data.state ?? data.reviewStatus ?? data.paymentStatus ?? data.escalationStatus);
  return {
    id: collectionName + '-' + id,
    collectionName,
    status,
    title: valueAsString(data.title ?? data.subject ?? data.name ?? data.description ?? data.type) ?? collectionName + ' record',
    description: valueAsString(data.summary ?? data.description ?? data.note ?? data.reason ?? data.message) ?? 'No summary recorded',
    actor: valueAsString(data.userId ?? data.actorId ?? data.requestedBy ?? data.createdBy ?? data.clientId),
    createdAt: valueAsString(data.createdAt ?? data.updatedAt ?? data.submittedAt),
  };
}

export default function AdminGovernanceConsolePage({ user }: AdminGovernanceConsolePageProps) {
  const datasets = useMemo<GovernanceDataset[]>(() => [
    { id: 'projects', label: 'All projects', description: 'Platform-wide project records across client, BEP, contractor, and package workflows.', collectionName: 'projects', icon: <ClipboardList />, query: datasetQuery('projects') },
    { id: 'disputes', label: 'Disputes', description: 'Open dispute and evidence-hold records requiring governance attention.', collectionName: 'disputes', icon: <MessageSquareWarning />, query: datasetQuery('disputes'), riskStatuses: ['open', 'held', 'disputed', 'pending_review'] },
    { id: 'escrow', label: 'Escrow wallets', description: 'Funded, held, partially released, and released escrow records.', collectionName: 'escrow', icon: <Landmark />, query: datasetQuery('escrow'), riskStatuses: ['held', 'partially_released', 'disputed'] },
    { id: 'payments', label: 'Payments / claims', description: 'Gateway payments, professional invoices, construction claims, and package payments.', collectionName: 'payments', icon: <CreditCard />, query: datasetQuery('payments'), riskStatuses: ['failed', 'held', 'pending_review', 'rejected'] },
    { id: 'messages', label: 'Messaging', description: 'Project messages and instruction threads that may need moderation or escalation.', collectionName: 'messages', icon: <MessageSquareWarning />, query: datasetQuery('messages'), riskStatuses: ['flagged', 'escalated'] },
    { id: 'ai', label: 'AI review queue', description: 'Human-review gates for AI-assisted drawing checks, recommendations, and automation.', collectionName: 'ai_review_queue', icon: <Bot />, query: datasetQuery('ai_review_queue'), riskStatuses: ['pending_review', 'requires_review', 'rejected'] },
    { id: 'users', label: 'User roles', description: 'Client, BEP, contractor, subcontractor, supplier, freelancer, and admin user records.', collectionName: 'users', icon: <Users />, query: datasetQuery('users') },
    { id: 'logs', label: 'System audit logs', description: 'Audit trail entries for approvals, access changes, AI actions, and governance events.', collectionName: 'system_logs', icon: <ShieldCheck />, query: datasetQuery('system_logs'), riskStatuses: ['failed', 'blocked'] },
  ], []);

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [risks, setRisks] = useState<Record<string, number>>({});
  const [signals, setSignals] = useState<GovernanceSignal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const signalMap = new Map<string, GovernanceSignal>();
    const unsubscribes = datasets.map((dataset) => onSnapshot(dataset.query, (snapshot) => {
      const docs = snapshot.docs.map((docSnap) => ({ id: docSnap.id, data: docSnap.data() as Record<string, unknown> }));
      setCounts((current) => ({ ...current, [dataset.id]: docs.length }));
      setRisks((current) => ({
        ...current,
        [dataset.id]: docs.filter(({ data }) => {
          const normalizedStatus = String(data.status ?? data.state ?? data.reviewStatus ?? data.paymentStatus ?? '').toLowerCase();
          return (dataset.riskStatuses ?? RISK_STATUSES).includes(normalizedStatus);
        }).length,
      }));
      docs.slice(0, 3).forEach(({ id, data }) => signalMap.set(dataset.id + '-' + id, signalFromDoc(dataset.collectionName, id, data)));
      setSignals(Array.from(signalMap.values()).slice(0, 12));
      setLoading(false);
    }, (error) => {
      console.warn('Admin governance dataset ' + dataset.collectionName + ' unavailable; continuing with remaining datasets:', error);
      setCounts((current) => ({ ...current, [dataset.id]: 0 }));
      setRisks((current) => ({ ...current, [dataset.id]: 0 }));
      setLoading(false);
    }));
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [datasets]);

  const riskCounts: number[] = Object.values(risks).map((count) => Number(count));
  const totalRisks = riskCounts.reduce((total, count) => total + count, 0);
  const toolHealth = datasets.length === 0 ? 100 : Math.max(0, Math.round(((datasets.length - riskCounts.filter((count) => count > 0).length) / datasets.length) * 100));

  if (user.role !== 'admin') {
    return <Card className="rounded-2xl border-border bg-card/90"><CardHeader><CardTitle>Admin console unavailable</CardTitle><CardDescription>This whole-system governance console is restricted to admin users.</CardDescription></CardHeader></Card>;
  }

  return (
    <div className="space-y-6" data-testid="admin-governance-console">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">Admin / Governance</Badge>
              <CardTitle className="font-heading text-3xl mt-3">Whole-system governance console</CardTitle>
              <CardDescription className="mt-2 max-w-4xl text-base leading-relaxed">Platform-wide command view across projects, roles, escrow wallets, disputes, messaging, AI orchestration/training queues, payment records, and audit logs. It is observational by default: holds, releases, signatures, and payment changes remain in dedicated human-approved workflows.</CardDescription>
            </div>
            <Badge className="w-fit rounded-full">{user.email}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricCard icon={<ClipboardList />} label="Datasets mounted" value={datasets.length} />
          <MetricCard icon={<AlertTriangle />} label="Risk signals" value={totalRisks} danger={totalRisks > 0} />
          <MetricCard icon={<CheckCircle2 />} label="Tool health" value={toolHealth + '%'} />
          <MetricCard icon={<Loader2 className={loading ? 'animate-spin' : ''} />} label="Live state" value={loading ? 'Loading' : 'Ready'} />
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {datasets.map((dataset) => (
          <Card key={dataset.id} className="rounded-2xl border-border bg-card/90 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 text-primary [&>svg]:h-5 [&>svg]:w-5">{dataset.icon}<CardTitle className="text-base font-bold">{dataset.label}</CardTitle></div>
                <Badge variant={Number(risks[dataset.id] ?? 0) > 0 ? 'destructive' : 'secondary'}>{counts[dataset.id] ?? 0}</Badge>
              </div>
              <CardDescription className="leading-relaxed">{dataset.description}</CardDescription>
            </CardHeader>
            <CardContent><p className="text-xs text-muted-foreground">Collection: <span className="font-mono">{dataset.collectionName}</span> · risk records: {risks[dataset.id] ?? 0}</p></CardContent>
          </Card>
        ))}
      </div>
      <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
        <CardHeader><CardTitle className="font-heading text-xl">Global queue preview</CardTitle><CardDescription>Recent live records from governance-critical collections. No synthetic sample rows are generated.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {signals.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No governance records are visible with current Firestore permissions.</p> : signals.map((signal) => (
            <div key={signal.id} className="rounded-xl border border-border bg-background/70 p-4 text-sm">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                <div><p className="font-semibold">{signal.title}</p><p className="mt-1 text-xs text-muted-foreground">{signal.collectionName} · {signal.actor ?? 'no actor'} · {signal.createdAt ?? 'no timestamp'}</p><p className="mt-2 text-muted-foreground leading-relaxed">{signal.description}</p></div>
                <Badge variant={statusVariant(signal.status)}>{signal.status ?? 'recorded'}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ icon, label, value, danger = false }: { icon: React.ReactNode; label: string; value: React.ReactNode; danger?: boolean }) {
  return <Card className={'rounded-2xl bg-card/90 shadow-sm ' + (danger ? 'border-destructive/40' : 'border-border')}><CardHeader className="pb-3"><div className="flex items-center gap-2 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}<CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</CardTitle></div></CardHeader><CardContent><p className="font-heading text-2xl font-black">{value}</p></CardContent></Card>;
}
