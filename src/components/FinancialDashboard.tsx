import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { AlertTriangle, CheckCircle2, CreditCard, Filter, Landmark, ReceiptText, RotateCcw } from 'lucide-react';
import { db } from '@/lib/firebase';
import { EscrowV2, LedgerEntry, Project, UserProfile } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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

function projectQueryForFinancialUser(user: UserProfile) {
  const projects = collection(db, 'projects');
  if (user.role === 'client') return query(projects, where('clientId', '==', user.uid), limit(100));
  if (user.role === 'architect' || user.role === 'bep') return query(projects, where('leadArchitectId', '==', user.uid), limit(100));
  return null;
}

function jobQueryForFinancialUser(user: UserProfile) {
  const jobs = collection(db, 'jobs');
  if (user.role === 'client') return query(jobs, where('clientId', '==', user.uid), limit(100));
  if (user.role === 'architect' || user.role === 'bep') return query(jobs, where('selectedArchitectId', '==', user.uid), limit(100));
  return null;
}

export default function FinancialDashboard({ user }: { user?: UserProfile }) {
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
      unsubs.push(onSnapshot(query(collection(db, 'ledger'), orderBy('createdAt', 'desc'), limit(500)), (snapshot) => {
        setLedger(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as LedgerEntry)));
      }, (error) => { console.warn('Admin ledger projection unavailable:', error); setLedger([]); }));
      unsubs.push(onSnapshot(query(collection(db, 'escrow'), orderBy('updatedAt', 'desc'), limit(200)), (snapshot) => {
        setEscrows(snapshot.docs.map((docSnap) => ({ jobId: docSnap.id, ...docSnap.data() } as EscrowV2)));
      }, (error) => { console.warn('Admin escrow projection unavailable:', error); setEscrows([]); }));
      unsubs.push(onSnapshot(query(collection(db, 'projects'), limit(200)), (snapshot) => {
        setProjects(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Project)));
      }, (error) => { console.warn('Admin financial project projection unavailable:', error); setProjects([]); }));
      return () => unsubs.forEach((unsubscribe) => unsubscribe());
    }

    const mergeLedger = (snapshot: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => {
      snapshot.docs.forEach((docSnap) => ledgerMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as LedgerEntry));
      setLedger(sortByRecent(Array.from(ledgerMap.values())));
    };

    unsubs.push(onSnapshot(query(collection(db, 'ledger'), where('payerId', '==', user.uid), limit(250)), mergeLedger, (error) => console.warn('Payer ledger projection unavailable:', error)));
    unsubs.push(onSnapshot(query(collection(db, 'ledger'), where('payeeId', '==', user.uid), limit(250)), mergeLedger, (error) => console.warn('Payee ledger projection unavailable:', error)));

    const projectQuery = projectQueryForFinancialUser(user);
    if (projectQuery) {
      unsubs.push(onSnapshot(projectQuery, (snapshot) => {
        setProjects(sortByRecent(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Project))));
      }, (error) => { console.warn('Financial project projection unavailable:', error); setProjects([]); }));
    } else {
      setProjects([]);
    }

    const jobQuery = jobQueryForFinancialUser(user);
    if (jobQuery) {
      unsubs.push(onSnapshot(jobQuery, (snapshot) => {
        setVisibleJobIds(snapshot.docs.map((docSnap) => docSnap.id));
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
    const unsubs = visibleJobIds.slice(0, 25).map((jobId) => onSnapshot(doc(db, 'escrow', jobId), (snapshot) => {
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
    <div className="space-y-8" data-testid="financial-dashboard">
      <div className="rounded-[2rem] border border-border bg-white p-6 md:p-8 shadow-sm">
        <Badge variant="outline" className="uppercase text-[10px] tracking-widest mb-3">Financial console</Badge>
        <h2 className="text-3xl md:text-4xl font-heading font-black tracking-tight flex items-center gap-3"><Landmark className="text-primary" /> Payments, Escrow & Ledger</h2>
        <p className="text-sm md:text-base text-muted-foreground mt-3 max-w-3xl">Real-time Firestore-backed view of platform revenue, escrow balances, refunds, milestone releases and project-level financial activity.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <SummaryCard icon={<ReceiptText />} label="Total Revenue" value={currency.format(summary.totalRevenue)} />
        <SummaryCard icon={<Landmark />} label="Escrow Held" value={currency.format(summary.totalEscrowHeld)} />
        <SummaryCard icon={<CreditCard />} label="Pending Releases" value={summary.pendingReleases.toString()} />
        <SummaryCard icon={<RotateCcw />} label="Refunds" value={currency.format(summary.refunds)} />
      </div>

      <Card className="rounded-[2rem] border-amber-200 bg-amber-50/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-bold uppercase tracking-widest text-amber-950 flex items-center gap-2"><AlertTriangle size={16} /> Payment and escrow execution guard</CardTitle>
          <CardDescription className="text-amber-900">Human-confirmed governance boundary for provider calls, invoice payments, milestone releases, refunds, and escrow actions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-amber-950">
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {PAYMENT_GUARD_STEPS.map((step) => <div key={step} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>{step}</span></div>)}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Button type="button" disabled variant="outline" className="rounded-xl border-amber-300 bg-white/70 text-amber-950 disabled:opacity-80">Initiate payment disabled</Button>
            <Button type="button" disabled variant="outline" className="rounded-xl border-amber-300 bg-white/70 text-amber-950 disabled:opacity-80">Release escrow disabled</Button>
            <Button type="button" disabled className="rounded-xl bg-amber-900 text-white disabled:opacity-80">Provider submission disabled</Button>
          </div>
          <div className="rounded-2xl border border-amber-300 bg-white/70 p-4">
            <p className="font-bold">Pending release requests visible: {releaseRequestedMilestones.length}</p>
            <p className="mt-1 text-xs text-amber-900">Use this count to triage human review. No release instruction is generated from this browser view.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[2rem] border-border bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-bold uppercase tracking-widest text-primary">Monthly platform revenue</CardTitle>
          <CardDescription>CSS-only chart from ledger platform fee entries.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-56 items-end gap-4 rounded-2xl border border-border bg-secondary/20 p-5">
            {monthlyRevenue.length === 0 && <p className="text-sm text-muted-foreground italic">No platform fee ledger entries yet.</p>}
            {monthlyRevenue.map(([month, amount]) => <div key={month} className="flex flex-1 flex-col items-center gap-2"><div className="w-full rounded-t-xl bg-primary" style={{ height: `${Math.max(8, (amount / maxRevenue) * 170)}px` }} /><span className="text-[10px] font-bold text-muted-foreground">{month}</span><span className="text-[10px] font-black">{currency.format(amount)}</span></div>)}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[2rem] border-border bg-white shadow-sm overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm font-bold uppercase tracking-widest text-primary flex items-center gap-2"><Filter size={16} /> Ledger</CardTitle>
          <CardDescription>Filter transactions by project/job ID and type.</CardDescription>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3">
            <Input value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} placeholder="Filter by project or job ID" className="rounded-xl" />
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-10 rounded-xl border border-border bg-white px-3 text-sm">
              <option value="all">All transaction types</option>
              <option value="escrow_deposit">Escrow deposits</option>
              <option value="milestone_release">Milestone releases</option>
              <option value="platform_fee">Platform fees</option>
              <option value="refund">Refunds</option>
              <option value="invoice_payment">Invoice payments</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Project</TableHead><TableHead>Description</TableHead><TableHead>Direction</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
            <TableBody>
              {filteredLedger.map((entry) => <TableRow key={entry.id}><TableCell className="text-xs">{new Date(entry.createdAt).toLocaleDateString('en-ZA')}</TableCell><TableCell><Badge variant="outline" className="uppercase text-[10px]">{entry.type.replaceAll('_', ' ')}</Badge></TableCell><TableCell className="font-mono text-xs">{entry.projectId}</TableCell><TableCell className="text-sm">{entry.description}</TableCell><TableCell className="capitalize text-xs">{entry.direction}</TableCell><TableCell className="text-right font-bold">{currency.format(entry.amount)}</TableCell></TableRow>)}
              {filteredLedger.length === 0 && <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground italic">No ledger entries match the current filters.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="rounded-[2rem] border-border bg-white shadow-sm">
        <CardHeader><CardTitle className="text-sm font-bold uppercase tracking-widest text-primary">Per-project escrow overview</CardTitle><CardDescription>Milestone release progress by project escrow.</CardDescription></CardHeader>
        <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {escrows.map((escrow) => {
            const project = escrow.linkedProjectId ? projectById.get(escrow.linkedProjectId) : undefined;
            const released = (escrow.milestones || []).filter((milestone) => milestone.status === 'released').length;
            const total = escrow.milestones?.length || 0;
            return <div key={escrow.jobId} className="rounded-2xl border border-border p-5"><div className="flex justify-between gap-3"><div><p className="font-bold">{project?.id || escrow.linkedProjectId || escrow.jobId}</p><p className="text-xs text-muted-foreground">Job {escrow.jobId}</p></div><Badge variant="outline" className="uppercase text-[10px]">{escrow.status.replaceAll('_', ' ')}</Badge></div><div className="mt-4 h-3 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary" style={{ width: `${total ? (released / total) * 100 : 0}%` }} /></div><p className="mt-2 text-xs text-muted-foreground">{released}/{total} milestones released · Held {currency.format(escrow.heldAmount || 0)}</p></div>;
          })}
          {escrows.length === 0 && <p className="text-sm text-muted-foreground italic">No escrow records found.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <Card className="rounded-[1.5rem] border-border bg-white shadow-sm"><CardContent className="p-5 flex items-center gap-4"><div className="rounded-2xl bg-primary/10 p-3 text-primary">{icon}</div><div><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p><p className="text-2xl font-heading font-black">{value}</p></div></CardContent></Card>;
}
