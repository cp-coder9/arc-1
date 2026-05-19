import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';
import { AlertTriangle, CheckCircle2, FileSignature, Landmark, Loader2, ShieldCheck } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { EscrowV2, UserProfile } from '@/types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

type LoadState = 'loading' | 'ready' | 'error';

type AppointmentContract = {
  id: string;
  projectId: string;
  projectCode?: string;
  clientBriefId?: string;
  technicalBriefId?: string;
  clientId: string;
  bepId: string;
  status: string;
  professionalFee?: number;
  platformFee?: number;
  totalEscrowAmount?: number;
  scope?: string[];
  deliverables?: string[];
  exclusions?: string[];
  assumptions?: string[];
  milestones?: Array<{ id: string; name: string; percentage: number; amount: number; releaseConditions?: string[]; status?: string }>;
  downstreamFeeds?: string[];
  verificationId?: string;
  createdAt?: string;
  updatedAt?: string;
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

function money(cents?: number) {
  if (!Number.isFinite(cents)) return 'Not recorded';
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format((cents ?? 0) / 100);
}

function contractQueriesForUser(user: UserProfile) {
  const contracts = collection(db, 'appointment_contracts');
  if (user.role === 'admin') return [query(contracts, limit(50))];
  if (user.role === 'client') return [query(contracts, where('clientId', '==', user.uid), limit(50))];
  if (user.role === 'architect' || user.role === 'bep' || user.role === 'freelancer') return [query(contracts, where('bepId', '==', user.uid), limit(50))];
  return [];
}

function statusVariant(status?: string) {
  if (!status) return 'secondary' as const;
  if (status.includes('accepted') || status.includes('signed') || status.includes('active')) return 'default' as const;
  if (status.includes('rejected') || status.includes('cancelled') || status.includes('blocked')) return 'destructive' as const;
  return 'secondary' as const;
}

function roleGuidance(user: UserProfile) {
  if (user.role === 'client') return 'Review scope, deliverables, fee, platform fee, and escrow readiness before accepting any appointment contract.';
  if (user.role === 'bep' || user.role === 'architect') return 'Confirm that the technical brief, assumptions, exclusions, milestones, and PI/verification details are correct before signing.';
  if (user.role === 'admin') return 'Monitor generated contracts and escrow readiness. Contract or payment state changes remain server/admin-mediated.';
  return 'Package-level contracts and orders are managed in Procurement and Package workspaces until a formal appointment contract is generated for your role.';
}

const SIGNING_REVIEW_STEPS = [
  'Scope, assumptions, exclusions, and deliverables are checked against the accepted brief.',
  'Professional registration, insurance, tax, banking, and digital signature readiness are confirmed.',
  'Milestones, release conditions, platform fee, and escrow amount are reviewed by both sides.',
  'Any change, acceptance, signature, payment initiation, or escrow release must happen through a separately authorized workflow.',
];

function contractReadiness(contract: AppointmentContract, escrow: EscrowV2 | null) {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!contract.scope?.length) blockers.push('Contract scope is not recorded.');
  if (!contract.deliverables?.length) blockers.push('Deliverables are not recorded.');
  if (!contract.milestones?.length) blockers.push('Milestones and release conditions are not recorded.');
  if (!contract.verificationId) warnings.push('Verification reference is not linked to the contract.');
  if (!contract.totalEscrowAmount || contract.totalEscrowAmount <= 0) warnings.push('Escrow total is not recorded on the contract.');
  if (!escrow) warnings.push('No live escrow record is visible for this contract.');
  if (escrow && escrow.status === 'pending') warnings.push('Escrow exists but is still pending funding.');

  return {
    blockers,
    warnings,
    readyForHumanReview: blockers.length === 0,
  };
}

export default function ContractSigningPage({ user }: { user: UserProfile }) {
  const [state, setState] = useState<LoadState>('loading');
  const [contracts, setContracts] = useState<AppointmentContract[]>([]);
  const [selectedContractId, setSelectedContractId] = useState('');
  const [escrow, setEscrow] = useState<EscrowV2 | null>(null);

  useEffect(() => {
    const contractQueries = contractQueriesForUser(user);
    if (contractQueries.length === 0) {
      setContracts([]);
      setState('ready');
      return undefined;
    }

    setState('loading');
    const contractMap = new Map<string, AppointmentContract>();
    const unsubs = contractQueries.map((contractQuery) => onSnapshot(contractQuery, (snapshot) => {
      snapshot.docs.forEach((docSnap) => contractMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as AppointmentContract));
      setContracts(sortByRecent(Array.from(contractMap.values())));
      setState('ready');
    }, (error) => {
      console.warn('Appointment contracts unavailable for this role:', error);
      setState('error');
    }));
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [user]);

  const selectedContract = useMemo(() => contracts.find((contract) => contract.id === selectedContractId) ?? contracts[0], [contracts, selectedContractId]);

  useEffect(() => {
    if (!selectedContract?.projectId) {
      setEscrow(null);
      return undefined;
    }

    const unsubscribe = onSnapshot(doc(db, 'escrow', selectedContract.projectId), (snapshot) => {
      setEscrow(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as unknown as EscrowV2) : null);
    }, (error) => {
      console.warn('Contract escrow summary unavailable:', error);
      setEscrow(null);
    });
    return () => unsubscribe();
  }, [selectedContract?.projectId]);

  const milestones = selectedContract?.milestones ?? [];
  const readiness = selectedContract ? contractReadiness(selectedContract, escrow) : null;

  return (
    <div className="space-y-6" data-testid="contract-signing-page">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">Contracts & Signing</Badge>
              <CardTitle className="font-heading text-3xl mt-3 flex items-center gap-3"><FileSignature className="h-7 w-7 text-primary" /> Appointment contract register</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">
                Live generated appointment contracts, milestone scope, and escrow readiness. This page does not execute signatures or payments; it prepares auditable human review.
              </CardDescription>
            </div>
            <Badge className="capitalize w-fit">{user.role}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {state === 'loading' && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading contracts...</div>}
          {state === 'error' && <div className="text-sm text-destructive">Unable to load appointment contracts. Check Firestore rules for appointment contract reads.</div>}
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p>{roleGuidance(user)}</p>
          </div>
          {contracts.length > 0 ? (
            <select value={selectedContract?.id ?? ''} onChange={(event) => setSelectedContractId(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm md:max-w-2xl">
              {contracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.projectCode ?? contract.projectId} · {contract.status}</option>)}
            </select>
          ) : state !== 'loading' && <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No appointment contracts are visible for this role. Package orders and claims remain in the Procurement/Packages workspace.</div>}
        </CardContent>
      </Card>

      {selectedContract && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_390px] gap-6">
          <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div>
                  <CardTitle className="font-heading text-xl">{selectedContract.projectCode ?? selectedContract.projectId}</CardTitle>
                  <CardDescription>Technical brief {selectedContract.technicalBriefId ?? 'not linked'} · Verification {selectedContract.verificationId ?? 'not recorded'}</CardDescription>
                </div>
                <Badge variant={statusVariant(selectedContract.status)}>{selectedContract.status.replaceAll('_', ' ')}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <DetailList title="Scope" items={selectedContract.scope} empty="No scope lines recorded." />
              <DetailList title="Deliverables" items={selectedContract.deliverables} empty="No deliverables recorded." />
              <DetailList title="Assumptions" items={selectedContract.assumptions} empty="No assumptions recorded." />
              <DetailList title="Exclusions" items={selectedContract.exclusions} empty="No exclusions recorded." />
            </CardContent>
          </Card>

          <div className="space-y-6">
            {readiness && (
              <Card className="rounded-2xl border-amber-200 bg-amber-50/80 shadow-sm">
                <CardHeader>
                  <CardTitle className="font-heading text-xl flex items-center gap-2 text-amber-950"><AlertTriangle className="h-5 w-5" /> Human signing guard</CardTitle>
                  <CardDescription className="text-amber-900">This panel prepares a review decision only. It never submits a signature, accepts a contract, initiates payment, or releases escrow.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-amber-950">
                  <div className="grid gap-2">
                    {SIGNING_REVIEW_STEPS.map((step) => <div key={step} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>{step}</span></div>)}
                  </div>
                  {(readiness.blockers.length > 0 || readiness.warnings.length > 0) && (
                    <div className="rounded-xl border border-amber-300 bg-white/70 p-3">
                      {readiness.blockers.length > 0 && <p className="font-bold">Blockers: {readiness.blockers.join(' ')}</p>}
                      {readiness.warnings.length > 0 && <p className="mt-1 text-amber-900">Warnings: {readiness.warnings.join(' ')}</p>}
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Button type="button" disabled variant="outline" className="rounded-xl border-amber-300 bg-white/70 text-amber-950 disabled:opacity-80">Request signature disabled</Button>
                    <Button type="button" disabled className="rounded-xl bg-amber-900 text-white disabled:opacity-80">Accept / bind disabled</Button>
                  </div>
                  <p className="text-xs text-amber-900">Ready for human review: {readiness.readyForHumanReview ? 'yes, subject to external signature/payment controls' : 'no, resolve blockers first'}.</p>
                </CardContent>
              </Card>
            )}

            <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
              <CardHeader><CardTitle className="font-heading text-xl flex items-center gap-2"><Landmark className="h-5 w-5 text-primary" /> Financial readiness</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Metric label="Professional fee" value={money(selectedContract.professionalFee)} />
                <Metric label="Platform fee" value={money(selectedContract.platformFee)} />
                <Metric label="Escrow total" value={money(selectedContract.totalEscrowAmount)} />
                <Metric label="Escrow status" value={escrow?.status ? escrow.status.replaceAll('_', ' ') : 'No escrow record visible'} />
                <Metric label="Held" value={money(escrow?.heldAmount)} />
                <Metric label="Released" value={money(escrow?.releasedAmount)} />
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
              <CardHeader><CardTitle className="font-heading text-xl">Milestones</CardTitle><CardDescription>Release conditions are displayed for review only.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {milestones.length === 0 ? <p className="text-sm text-muted-foreground">No milestones recorded.</p> : milestones.map((milestone) => (
                  <div key={milestone.id} className="rounded-xl border border-border p-3 text-sm">
                    <div className="flex items-start justify-between gap-3"><p className="font-semibold">{milestone.name}</p><Badge variant="outline">{milestone.percentage}%</Badge></div>
                    <p className="mt-1 text-xs text-muted-foreground">{money(milestone.amount)}</p>
                    {!!milestone.releaseConditions?.length && <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">{milestone.releaseConditions.map((condition) => <li key={condition}>{condition}</li>)}</ul>}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailList({ title, items, empty }: { title: string; items?: string[]; empty: string }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</h3>
      {!items?.length ? <p className="text-sm text-muted-foreground">{empty}</p> : <ul className="grid gap-2 text-sm">{items.map((item) => <li key={item} className="rounded-xl border border-border bg-background/70 p-3">{item}</li>)}</ul>}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/70 px-3 py-2"><span className="text-muted-foreground">{label}</span><span className="font-semibold capitalize">{value}</span></div>;
}
