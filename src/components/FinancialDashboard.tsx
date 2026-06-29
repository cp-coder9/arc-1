import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, limit, onSnapshot, query, type DocumentData, type Query, where } from 'firebase/firestore';
import { AlertTriangle, CheckCircle2, CreditCard, Filter, Landmark, ReceiptText, RotateCcw } from 'lucide-react';
import { db } from '@/lib/firebase';
import { EscrowV2, Job, LedgerEntry, Project, UserProfile } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { subscribeToMergedQuerySnapshots } from '@/lib/firestoreQueryMerge';
import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';

// ─── Glass system & design components ────────────────────────────────────────
import { GlassButton } from '@/components/ui/GlassButton';
import { StatCardAnimated } from '@/components/animated/StatCardAnimated';
import { DashboardSection } from '@/components/composite/DashboardSection';
import { GlassTable } from '@/components/composite/GlassTable';
import { useReducedMotion } from '@/hooks/useReducedMotion';
const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });

const PAYMENT_GUARD_STEPS = [
  'Invoice, claim, contract, and milestone evidence must match before any payment is requested.',
  'Client/BEP/contractor/admin approvals must be recorded outside this read-only dashboard before provider action.',
  'PayFast/payment provider calls, escrow releases, refunds, and supplier orders remain disabled until explicit backend flags and human confirmations are active.',
  'This dashboard can surface pending releases and ledger state, but it cannot create money movement by itself.',
];

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

function projectQueriesForFinancialUser(user: UserProfile): Query<DocumentData>[] {
  const projects = getDemoCol( 'projects');
  if (user.role === 'client') return [query(projects, where('clientId', '==', user.uid), limit(100))];
  if (user.role === 'architect' || user.role === 'bep') return [
    query(projects, where('leadProfessionalId', '==', user.uid), limit(100)),
    query(projects, where('leadBepId', '==', user.uid), limit(100)),
    query(projects, where('leadArchitectId', '==', user.uid), limit(100)),
  ];
  return [];
}

function jobQueriesForFinancialUser(user: UserProfile): Query<DocumentData>[] {
  const jobs = getDemoCol( 'jobs');
  if (user.role === 'client') return [query(jobs, where('clientId', '==', user.uid), limit(100))];
  if (user.role === 'architect' || user.role === 'bep') return [
    query(jobs, where('selectedProfessionalId', '==', user.uid), limit(100)),
    query(jobs, where('selectedBepId', '==', user.uid), limit(100)),
    query(jobs, where('selectedArchitectId', '==', user.uid), limit(100)),
  ];
  return [];
}

export default function FinancialDashboard({ user }: { user?: UserProfile }) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [escrows, setEscrows] = useState<EscrowV2[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [visibleJobIds, setVisibleJobIds] = useState<string[]>([]);
  const [projectFilter, setProjectFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    const ledgerMap = new Map<string, LedgerEntry>();

    if (!user || user.role === 'admin') {
      unsubs.push(onSnapshot(query(getDemoCol( 'ledger'), limit(500)), (snapshot) => {
        setLedger(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as LedgerEntry)));
      }, (error) => { console.warn('Admin ledger projection unavailable:', error); setLedger([]); }));
      unsubs.push(onSnapshot(query(getDemoCol( 'escrow'), limit(200)), (snapshot) => {
        setEscrows(snapshot.docs.map((docSnap) => ({ jobId: docSnap.id, ...docSnap.data() } as EscrowV2)));
      }, (error) => { console.warn('Admin escrow projection unavailable:', error); setEscrows([]); }));
      unsubs.push(onSnapshot(query(getDemoCol( 'projects'), limit(200)), (snapshot) => {
        setProjects(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Project)));
      }, (error) => { console.warn('Admin financial project projection unavailable:', error); setProjects([]); }));
      return () => unsubs.forEach((unsubscribe) => unsubscribe());
    }

    const mergeLedger = (snapshot: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => {
      snapshot.docs.forEach((docSnap) => ledgerMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as LedgerEntry));
      setLedger(sortByRecent(Array.from(ledgerMap.values())));
    };

    unsubs.push(onSnapshot(query(getDemoCol( 'ledger'), where('payerId', '==', user.uid), limit(250)), mergeLedger, (error) => console.warn('Payer ledger projection unavailable:', error)));
    unsubs.push(onSnapshot(query(getDemoCol( 'ledger'), where('payeeId', '==', user.uid), limit(250)), mergeLedger, (error) => console.warn('Payee ledger projection unavailable:', error)));

    const projectQueries = projectQueriesForFinancialUser(user);
    if (projectQueries.length > 0) {
      unsubs.push(subscribeToMergedQuerySnapshots<Project>(projectQueries, (docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Project), (items) => {
        setProjects(sortByRecent(items));
      }, (error) => { console.warn('Financial project projection unavailable:', error); setProjects([]); }));
    } else {
      setProjects([]);
    }

    const jobQueries = jobQueriesForFinancialUser(user);
    if (jobQueries.length > 0) {
      unsubs.push(subscribeToMergedQuerySnapshots<Job>(jobQueries, (docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Job), (items) => {
        setVisibleJobIds(items.map((job) => job.id));
      }, (error) => { console.warn('Financial job projection unavailable:', error); setVisibleJobIds([]); }));
    } else {
      setVisibleJobIds([]);
    }

    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [user]);

  useEffect(() => {
    if (!user || user.role === 'admin') return undefined;
    if (!['client', 'architect', 'bep'].includes(user.role) || visibleJobIds.length === 0) {
      setEscrows([]);
      return undefined;
    }

    const escrowMap = new Map<string, EscrowV2>();
    const unsubs = visibleJobIds.slice(0, 25).map((jobId) => onSnapshot(getDemoDoc( 'escrow', jobId), (snapshot) => {
      if (snapshot.exists()) escrowMap.set(snapshot.id, { jobId: snapshot.id, ...snapshot.data() } as EscrowV2);
      else escrowMap.delete(jobId);
      setEscrows(sortByRecent(Array.from(escrowMap.values())));
    }, (error) => console.warn(`Escrow projection unavailable for job ${jobId}:`, error)));
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [user, visibleJobIds]);

  const filteredLedger = useMemo(() => ledger.filter((entry) => {
    const projectMatch = !projectFilter || entry.projectId.toLowerCase().includes(projectFilter.toLowerCase()) || entry.jobId.toLowerCase().includes(projectFilter.toLowerCase());
    const typeMatch = typeFilter === 'all' || entry.type === typeFilter;
    return projectMatch && typeMatch;
  }), [ledger, projectFilter, typeFilter]);

  const summary = useMemo(() => ({
    totalRevenue: ledger.filter((entry) => entry.type === 'platform_fee').reduce((sum, entry) => sum + entry.amount, 0),
    totalEscrowHeld: escrows.reduce((sum, escrow) => sum + (escrow.heldAmount || 0), 0),
    pendingReleases: escrows.reduce((sum, escrow) => sum + (escrow.milestones || []).filter((milestone) => milestone.status === 'release_requested').length, 0),
    refunds: ledger.filter((entry) => entry.type === 'refund').reduce((sum, entry) => sum + entry.amount, 0),
  }), [ledger, escrows]);

  const releaseRequestedMilestones = useMemo(() => escrows.flatMap((escrow) => (escrow.milestones || [])
    .filter((milestone) => milestone.status === 'release_requested')
    .map((milestone) => ({ escrow, milestone }))), [escrows]);

  const monthlyRevenue = useMemo(() => {
    const buckets = new Map<string, number>();
    ledger.filter((entry) => entry.type === 'platform_fee').forEach((entry) => {
      const key = entry.createdAt.slice(0, 7);
      buckets.set(key, (buckets.get(key) || 0) + entry.amount);
    });
    return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6);
  }, [ledger]);
  const maxRevenue = Math.max(...monthlyRevenue.map(([, value]) => value), 1);

  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);

  return (
    <div className="space-y-6" data-testid="financial-dashboard">
      <header className="glass-panel rounded-2xl p-5 md:p-6">
        <Badge variant="outline" className="uppercase text-[10px] tracking-widest mb-2">Financial console</Badge>
        <h2 className="text-2xl md:text-3xl font-heading font-bold tracking-tight flex items-center gap-3"><Landmark className="text-primary" aria-hidden="true" /> Payments, Escrow &amp; Ledger</h2>
        <p className="text-sm text-foreground-muted mt-2 max-w-3xl">Real-time Firestore-backed view of platform revenue, escrow balances, refunds, milestone releases and project-level financial activity.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCardAnimated icon={<ReceiptText size={20} aria-hidden="true" />} label="Total Revenue" value={currency.format(summary.totalRevenue)} delay={prefersReducedMotion ? 0 : 0 * 0.05} prefersReducedMotion={prefersReducedMotion} />
        <StatCardAnimated icon={<Landmark size={20} aria-hidden="true" />} label="Escrow Held" value={currency.format(summary.totalEscrowHeld)} delay={prefersReducedMotion ? 0 : 1 * 0.05} prefersReducedMotion={prefersReducedMotion} />
        <StatCardAnimated icon={<CreditCard size={20} aria-hidden="true" />} label="Pending Releases" value={summary.pendingReleases.toString()} delay={prefersReducedMotion ? 0 : 2 * 0.05} prefersReducedMotion={prefersReducedMotion} />
        <StatCardAnimated icon={<RotateCcw size={20} aria-hidden="true" />} label="Refunds" value={currency.format(summary.refunds)} delay={prefersReducedMotion ? 0 : 3 * 0.05} prefersReducedMotion={prefersReducedMotion} />
      </div>

      <DashboardSection title="Payment and escrow execution guard" icon={<AlertTriangle size={18} aria-hidden="true" />} description="Human-confirmed governance boundary for provider calls, invoice payments, milestone releases, refunds, and escrow actions.">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {PAYMENT_GUARD_STEPS.map((step) => <div key={step} className="flex gap-2 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--landing-accent)]" aria-hidden="true" /><span>{step}</span></div>)}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 mt-4">
          <Button type="button" disabled variant="outline" className="rounded-xl opacity-80">Initiate payment disabled</Button>
          <Button type="button" disabled variant="outline" className="rounded-xl opacity-80">Release escrow disabled</Button>
          <Button type="button" disabled className="rounded-xl opacity-80">Provider submission disabled</Button>
        </div>
        <div className="glass-record rounded-xl p-4 mt-4">
          <p className="font-bold text-sm">Pending release requests visible: {releaseRequestedMilestones.length}</p>
          <p className="mt-1 text-xs text-foreground-muted">Use this count to triage human review. No release instruction is generated from this browser view.</p>
        </div>
      </DashboardSection>

      <DashboardSection title="Monthly Platform Revenue" description="CSS-only chart from ledger platform fee entries.">
        <div className="flex h-52 items-end gap-4 rounded-2xl border border-white/10 bg-white/5 p-5">
          {monthlyRevenue.length === 0 && <p className="text-sm text-foreground-muted italic">No platform fee ledger entries yet.</p>}
          {monthlyRevenue.map(([month, amount]) => <div key={month} className="flex flex-1 flex-col items-center gap-2"><div className="w-full rounded-t-xl bg-[var(--landing-accent)]/60" style={{ height: `${Math.max(8, (amount / maxRevenue) * 160)}px` }} /><span className="text-[10px] font-bold text-foreground-muted">{month}</span><span className="text-[10px] font-black">{currency.format(amount)}</span></div>)}
        </div>
      </DashboardSection>

      <DashboardSection title="Ledger" description="Filter transactions by project/job ID and type." icon={<Filter size={18} aria-hidden="true" />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <Input value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} placeholder="Filter by project or job ID" className="rounded-xl" />
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm">
            <option value="all">All transaction types</option>
            <option value="escrow_deposit">Escrow deposits</option>
            <option value="milestone_release">Milestone releases</option>
            <option value="platform_fee">Platform fees</option>
            <option value="refund">Refunds</option>
            <option value="invoice_payment">Invoice payments</option>
          </select>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Project</TableHead><TableHead>Description</TableHead><TableHead>Direction</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
          <TableBody>
            {filteredLedger.map((entry) => <TableRow key={entry.id} className="glass-record"><TableCell className="text-xs">{new Date(entry.createdAt).toLocaleDateString('en-ZA')}</TableCell><TableCell><Badge variant="outline" className="uppercase text-[10px]">{entry.type.replaceAll('_', ' ')}</Badge></TableCell><TableCell className="font-mono text-xs">{entry.projectId}</TableCell><TableCell className="text-sm">{entry.description}</TableCell><TableCell className="capitalize text-xs">{entry.direction}</TableCell><TableCell className="text-right font-bold">{currency.format(entry.amount)}</TableCell></TableRow>)}
            {filteredLedger.length === 0 && <TableRow><TableCell colSpan={6} className="py-12 text-center text-foreground-muted italic">No ledger entries match the current filters.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </DashboardSection>

      <DashboardSection title="Per-Project Escrow Overview" description="Milestone release progress by project escrow.">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {escrows.map((escrow) => {
            const project = escrow.linkedProjectId ? projectById.get(escrow.linkedProjectId) : undefined;
            const released = (escrow.milestones || []).filter((milestone) => milestone.status === 'released').length;
            const total = escrow.milestones?.length || 0;
            return <div key={escrow.jobId} className="glass-record rounded-2xl p-5"><div className="flex justify-between gap-3"><div><p className="font-bold text-sm">{project?.id || escrow.linkedProjectId || escrow.jobId}</p><p className="text-xs text-foreground-muted">Job {escrow.jobId}</p></div><Badge variant="outline" className="uppercase text-[10px]">{escrow.status.replaceAll('_', ' ')}</Badge></div><div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[var(--landing-accent)]/60" style={{ width: `${total ? (released / total) * 100 : 0}%` }} /></div><p className="mt-2 text-xs text-foreground-muted">{released}/{total} milestones released · Held {currency.format(escrow.heldAmount || 0)}</p></div>;
          })}
          {escrows.length === 0 && <p className="text-sm text-foreground-muted italic">No escrow records found.</p>}
        </div>
      </DashboardSection>
    </div>
  );
}

