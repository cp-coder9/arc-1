import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, limit, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { AlertTriangle, ClipboardCheck, FileCheck2, Loader2, PackageCheck, Plus, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import type { GanttTask, RFI, SiteInspection, TenderPackage, UserProfile } from '@/types';
import { evaluatePackageReadiness, type DeliveryEvidenceItem, type DeliveryEvidenceType, type SnagItem } from '@/services/packageReadinessService';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
type LoadState = 'loading' | 'ready' | 'error';
type PackageSnagRecord = SnagItem & { createdAt?: string; updatedAt?: string; createdBy?: string; projectId?: string; jobId?: string; assigneeId?: string };
type PackageEvidenceRecord = DeliveryEvidenceItem & { packageId: string; projectId?: string; jobId?: string; createdBy?: string; updatedAt?: string };

type EvidenceFormState = {
  title: string;
  type: DeliveryEvidenceType;
  dueDate: string;
};

const evidenceTypeOptions: Array<{ value: DeliveryEvidenceType; label: string }> = [
  { value: 'closeout_document', label: 'Close-out document' },
  { value: 'site_log', label: 'Site log summary' },
  { value: 'inspection', label: 'Inspection record' },
  { value: 'delivery_note', label: 'Delivery note' },
  { value: 'shop_drawing', label: 'Shop drawing approval' },
  { value: 'sample_approval', label: 'Sample / material approval' },
  { value: 'warranty', label: 'Warranty certificate' },
  { value: 'manual', label: 'Manual / O&M document' },
  { value: 'certificate', label: 'Compliance certificate' },
  { value: 'payment_claim_evidence', label: 'Payment claim evidence' },
  { value: 'snag', label: 'Snag close-out evidence' },
  { value: 'supplier_quote', label: 'Supplier quote' },
  { value: 'purchase_order', label: 'Purchase order' },
  { value: 'wage_record', label: 'Wage record' },
  { value: 'plant_record', label: 'Plant record' },
];

function timestampMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime() || 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value === 'object' && 'seconds' in value && typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

function sortByRecent<T>(items: T[]) {
  const timeFor = (item: T) => {
    const record = item as Record<string, unknown>;
    return timestampMs(record.updatedAt ?? record.createdAt ?? record.dueDate ?? record.endDate ?? record.deadline);
  };
  return [...items].sort((a, b) => timeFor(b) - timeFor(a));
}

function tenderQueriesForUser(user: UserProfile) {
  const tenders = getDemoCol( 'tender_packages');
  if (user.role === 'admin') return [query(tenders, limit(50))];
  if (user.role === 'contractor') {
    return [query(tenders, where('status', '==', 'published'), limit(50)), query(tenders, where('awardedContractorId', '==', user.uid), limit(50))];
  }
  if (user.role === 'subcontractor' || user.role === 'supplier') {
    return [query(tenders, where('status', '==', 'published'), limit(50)), query(tenders, where('awardedContractorId', '==', user.uid), limit(50))];
  }
  return [];
}

function statusVariant(status?: string) {
  if (!status) return 'secondary' as const;
  if (['approved', 'closed', 'ready_for_closeout', 'ready_for_inspection', 'ready_for_review'].includes(status)) return 'default' as const;
  if (['blocked', 'critical', 'high', 'rejected'].includes(status)) return 'destructive' as const;
  return 'secondary' as const;
}

function canWriteCloseoutRecords(user: UserProfile, tender?: TenderPackage) {
  if (!tender) return false;
  if (user.role === 'admin') return true;
  if (tender.createdBy === user.uid || tender.awardedContractorId === user.uid) return true;
  return false;
}

function canUpdateSnag(user: UserProfile, snag: PackageSnagRecord) {
  return user.role === 'admin' || snag.createdBy === user.uid || snag.assigneeId === user.uid || snag.assignedTo === user.uid;
}

export default function PackageCloseoutPage({ user }: { user: UserProfile }) {
  const [state, setState] = useState<LoadState>('loading');
  const [tenders, setTenders] = useState<TenderPackage[]>([]);
  const [selectedTenderId, setSelectedTenderId] = useState('');
  const [snags, setSnags] = useState<PackageSnagRecord[]>([]);
  const [evidence, setEvidence] = useState<PackageEvidenceRecord[]>([]);
  const [rfis, setRfis] = useState<RFI[]>([]);
  const [tasks, setTasks] = useState<GanttTask[]>([]);
  const [inspections, setInspections] = useState<SiteInspection[]>([]);
  const [snagTitle, setSnagTitle] = useState('');
  const [snagDescription, setSnagDescription] = useState('');
  const [snagSeverity, setSnagSeverity] = useState<SnagItem['severity']>('medium');
  const [snagDueDate, setSnagDueDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [evidenceForm, setEvidenceForm] = useState<EvidenceFormState>({
    title: '',
    type: 'closeout_document',
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState<'snag' | 'evidence' | 'status' | null>(null);

  useEffect(() => {
    setState('loading');
    const tenderMap = new Map<string, TenderPackage>();
    const unsubs = tenderQueriesForUser(user).map((tenderQuery) => onSnapshot(tenderQuery, (snapshot) => {
      snapshot.docs.forEach((docSnap) => tenderMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as TenderPackage));
      setTenders(sortByRecent(Array.from(tenderMap.values())));
      setState('ready');
    }, (error) => {
      console.warn('Package close-out projection unavailable:', error);
      setState('error');
    }));
    if (unsubs.length === 0) setState('ready');
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [user]);

  const selectedTender = useMemo(() => tenders.find((tender) => tender.id === selectedTenderId) ?? tenders[0], [selectedTenderId, tenders]);

  useEffect(() => {
    const packageIds = tenders.map((tender) => tender.id).slice(0, 10);
    if (packageIds.length === 0) {
      setSnags([]);
      setEvidence([]);
      setRfis([]);
      setTasks([]);
      setInspections([]);
      return undefined;
    }

    const unsubs = [
      onSnapshot(query(getDemoCol( 'package_snags'), where('packageId', 'in', packageIds)), (snapshot) => setSnags(sortByRecent(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as PackageSnagRecord)))), (error) => { console.warn('Package close-out snags unavailable:', error); setSnags([]); }),
      onSnapshot(query(getDemoCol( 'package_delivery_evidence'), where('packageId', 'in', packageIds)), (snapshot) => setEvidence(sortByRecent(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as PackageEvidenceRecord)))), (error) => { console.warn('Package close-out evidence unavailable:', error); setEvidence([]); }),
      onSnapshot(query(getDemoCol( 'rfis'), where('packageId', 'in', packageIds)), (snapshot) => setRfis(sortByRecent(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as RFI)))), (error) => { console.warn('Package close-out RFIs unavailable:', error); setRfis([]); }),
      onSnapshot(query(getDemoCol( 'gantt_tasks'), where('packageId', 'in', packageIds)), (snapshot) => setTasks(sortByRecent(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as GanttTask)))), (error) => { console.warn('Package close-out programme tasks unavailable:', error); setTasks([]); }),
      onSnapshot(query(getDemoCol( 'site_inspections'), where('packageId', 'in', packageIds)), (snapshot) => setInspections(sortByRecent(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as SiteInspection)))), (error) => { console.warn('Package close-out inspections unavailable:', error); setInspections([]); }),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [tenders]);

  const selectedSnags = useMemo(() => selectedTender ? snags.filter((snag) => snag.packageId === selectedTender.id) : [], [selectedTender, snags]);
  const selectedEvidence = useMemo(() => selectedTender ? evidence.filter((item) => item.packageId === selectedTender.id) : [], [evidence, selectedTender]);
  const selectedRfis = useMemo(() => selectedTender ? rfis.filter((rfi: any) => rfi.packageId === selectedTender.id) : [], [rfis, selectedTender]);
  const selectedTasks = useMemo(() => selectedTender ? tasks.filter((task: any) => task.packageId === selectedTender.id) : [], [tasks, selectedTender]);
  const selectedInspections = useMemo(() => selectedTender ? inspections.filter((inspection: any) => inspection.packageId === selectedTender.id) : [], [inspections, selectedTender]);

  const readiness = useMemo(() => selectedTender ? evaluatePackageReadiness({
    tender: selectedTender,
    programmeTasks: selectedTasks,
    rfis: selectedRfis,
    inspections: selectedInspections,
    evidence: selectedEvidence,
    snags: selectedSnags,
  }) : null, [selectedEvidence, selectedInspections, selectedRfis, selectedSnags, selectedTasks, selectedTender]);

  const openSnagCount = selectedSnags.filter((snag) => snag.status !== 'closed' && snag.status !== 'rejected').length;
  const approvedEvidenceCount = selectedEvidence.filter((item) => item.status === 'approved' || item.status === 'closed').length;
  const writable = canWriteCloseoutRecords(user, selectedTender);

  const submitSnag = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTender || !snagTitle.trim() || !writable) return;
    setSaving('snag');
    const now = new Date().toISOString();
    try {
      await addDoc(getDemoCol( 'package_snags'), {
        packageId: selectedTender.id,
        projectId: selectedTender.projectId,
        jobId: selectedTender.jobId,
        title: snagTitle.trim(),
        description: snagDescription.trim(),
        severity: snagSeverity,
        status: 'open',
        assignedTo: selectedTender.awardedContractorId ?? user.uid,
        assigneeId: selectedTender.awardedContractorId ?? user.uid,
        dueDate: snagDueDate,
        createdBy: user.uid,
        createdAt: now,
        updatedAt: now,
      });
      setSnagTitle('');
      setSnagDescription('');
      toast.success('Snag recorded against the live package');
    } catch (error) {
      console.warn('Package snag capture failed:', error);
      toast.error('Snag could not be saved. Check package permissions.');
    } finally {
      setSaving(null);
    }
  };

  const submitEvidence = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTender || !evidenceForm.title.trim() || !writable) return;
    setSaving('evidence');
    const now = new Date().toISOString();
    try {
      await addDoc(getDemoCol( 'package_delivery_evidence'), {
        packageId: selectedTender.id,
        projectId: selectedTender.projectId,
        jobId: selectedTender.jobId,
        type: evidenceForm.type,
        title: evidenceForm.title.trim(),
        status: 'submitted',
        createdBy: user.uid,
        createdAt: now,
        updatedAt: now,
        dueDate: evidenceForm.dueDate,
        requiredForCloseout: ['closeout_document', 'inspection', 'snag', 'delivery_note', 'shop_drawing', 'sample_approval', 'warranty', 'manual', 'certificate'].includes(evidenceForm.type),
        metadata: {
          source: 'package-closeout-page',
          humanReviewRequired: true,
        },
      });
      setEvidenceForm((current) => ({ ...current, title: '' }));
      toast.success('Close-out evidence submitted for human review');
    } catch (error) {
      console.warn('Package evidence capture failed:', error);
      toast.error('Evidence could not be saved. Check package permissions.');
    } finally {
      setSaving(null);
    }
  };

  const markReadyForInspection = async (snag: PackageSnagRecord) => {
    if (!canUpdateSnag(user, snag)) return;
    setSaving('status');
    try {
      await updateDoc(getDemoDoc( 'package_snags', snag.id), {
        status: 'ready_for_inspection',
        updatedAt: new Date().toISOString(),
      });
      toast.success('Snag marked ready for inspection');
    } catch (error) {
      console.warn('Package snag status update failed:', error);
      toast.error('Snag status could not be updated.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="package-closeout-page">
      <Card className="overflow-hidden rounded-[2rem] border-border bg-card/95 shadow-sm">
        <CardHeader className="border-b border-border bg-primary/5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">Snagging / Close-Out</Badge>
              <CardTitle className="mt-3 flex items-center gap-3 font-heading text-3xl">
                <PackageCheck className="h-7 w-7 text-primary" /> Package close-out controls
              </CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">
                Contractor package close-out backed by live snags, delivery evidence, RFIs, programme tasks, and inspections. Evidence is submitted for human review, not auto-approved.
              </CardDescription>
            </div>
            <Badge className="w-fit capitalize">{user.role}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          {state === 'loading' && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading package close-out records...</div>}
          {state === 'error' && <div className="text-sm text-destructive">Unable to load package close-out records. Check Firestore permissions.</div>}
          {tenders.length > 0 ? (
            <select value={selectedTender?.id ?? ''} onChange={(event) => setSelectedTenderId(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm md:max-w-2xl">
              {tenders.map((tender) => <option key={tender.id} value={tender.id}>{tender.title} · {tender.status}</option>)}
            </select>
          ) : state !== 'loading' && <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No close-out package is visible for this role yet.</div>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard icon={<ShieldCheck />} label="Readiness" value={readiness ? `${readiness.score}%` : 'N/A'} tone={readiness?.status} />
        <MetricCard icon={<AlertTriangle />} label="Open snags" value={openSnagCount} tone={openSnagCount > 0 ? 'blocked' : 'ready_for_closeout'} />
        <MetricCard icon={<FileCheck2 />} label="Approved evidence" value={approvedEvidenceCount} />
        <MetricCard icon={<ClipboardCheck />} label="Blockers" value={readiness?.blockers.length ?? 0} tone={(readiness?.blockers.length ?? 0) > 0 ? 'blocked' : 'ready_for_closeout'} />
      </div>

      {readiness && (
        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-xl">Close-out readiness</CardTitle>
            <CardDescription>{readiness.summary}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ReadinessList title="Blockers" items={readiness.blockers} empty="No blockers detected from linked package records." destructive />
            <ReadinessList title="Warnings" items={readiness.warnings} empty="No warnings detected from linked package records." />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
            <CardHeader>
              <CardTitle className="font-heading text-xl">Snag register</CardTitle>
              <CardDescription>{selectedTender ? selectedTender.title : 'Select a package to view live snags.'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedSnags.length === 0 ? <EmptyMessage text="No snags are linked to this package." /> : selectedSnags.map((snag) => (
                <div key={snag.id} className="rounded-xl border border-border p-4 text-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">{snag.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Due {snag.dueDate ?? 'not set'} · assigned {snag.assignedTo ?? 'not assigned'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={statusVariant(snag.severity)}>{snag.severity}</Badge>
                      <Badge variant={statusVariant(snag.status)}>{snag.status.replaceAll('_', ' ')}</Badge>
                    </div>
                  </div>
                  {canUpdateSnag(user, snag) && !['ready_for_inspection', 'closed', 'rejected'].includes(snag.status) && (
                    <Button type="button" variant="outline" size="sm" className="mt-3 rounded-full" disabled={saving === 'status'} onClick={() => markReadyForInspection(snag)}>
                      Mark ready for inspection
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
            <CardHeader>
              <CardTitle className="font-heading text-xl">Close-out evidence</CardTitle>
              <CardDescription>Submitted evidence remains review-gated until an authorized human approves or closes it.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedEvidence.length === 0 ? <EmptyMessage text="No close-out evidence is linked to this package." /> : selectedEvidence.map((item) => (
                <div key={item.id} className="rounded-xl border border-border p-4 text-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">{item.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.type.replaceAll('_', ' ')} · {item.dueDate ?? item.createdAt ?? 'No date recorded'}</p>
                    </div>
                    <Badge variant={statusVariant(item.status)}>{item.status.replaceAll('_', ' ')}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-heading text-xl"><Plus className="h-5 w-5 text-primary" /> Record snag</CardTitle>
              <CardDescription>Create a real package-linked snag for close-out tracking.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitSnag} className="space-y-3">
                <Input value={snagTitle} onChange={(event) => setSnagTitle(event.target.value)} placeholder="Snag title" required disabled={!selectedTender || !writable || saving !== null} />
                <Textarea value={snagDescription} onChange={(event) => setSnagDescription(event.target.value)} placeholder="Location, evidence notes, corrective action" disabled={!selectedTender || !writable || saving !== null} />
                <select value={snagSeverity} onChange={(event) => setSnagSeverity(event.target.value as SnagItem['severity'])} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" disabled={!selectedTender || !writable || saving !== null}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
                <Input type="date" value={snagDueDate} onChange={(event) => setSnagDueDate(event.target.value)} disabled={!selectedTender || !writable || saving !== null} />
                <Button type="submit" disabled={!selectedTender || !writable || !snagTitle.trim() || saving !== null} className="w-full rounded-xl gap-2">
                  {saving === 'snag' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save snag
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-heading text-xl"><FileCheck2 className="h-5 w-5 text-primary" /> Submit evidence</CardTitle>
              <CardDescription>Evidence is stored as submitted and requires authorized review.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitEvidence} className="space-y-3">
                <Input value={evidenceForm.title} onChange={(event) => setEvidenceForm((current) => ({ ...current, title: event.target.value }))} placeholder="Evidence title" required disabled={!selectedTender || !writable || saving !== null} />
                <select value={evidenceForm.type} onChange={(event) => setEvidenceForm((current) => ({ ...current, type: event.target.value as DeliveryEvidenceType }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" disabled={!selectedTender || !writable || saving !== null}>
                  {evidenceTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <Input type="date" value={evidenceForm.dueDate} onChange={(event) => setEvidenceForm((current) => ({ ...current, dueDate: event.target.value }))} disabled={!selectedTender || !writable || saving !== null} />
                <Button type="submit" disabled={!selectedTender || !writable || !evidenceForm.title.trim() || saving !== null} className="w-full rounded-xl gap-2">
                  {saving === 'evidence' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Submit evidence
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: string }) {
  return (
    <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}<CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</CardTitle></div>
      </CardHeader>
      <CardContent className="flex items-end justify-between gap-3">
        <p className="font-heading text-3xl font-black">{value}</p>
        {tone && <Badge variant={statusVariant(tone)}>{tone.replaceAll('_', ' ')}</Badge>}
      </CardContent>
    </Card>
  );
}

function ReadinessList({ title, items, empty, destructive = false }: { title: string; items: string[]; empty: string; destructive?: boolean }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <h3 className="font-heading text-lg font-bold">{title}</h3>
      {items.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{empty}</p> : (
        <ul className="mt-3 space-y-2 text-sm">
          {items.map((item) => <li key={item} className={destructive ? 'text-destructive' : 'text-muted-foreground'}>• {item}</li>)}
        </ul>
      )}
    </div>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{text}</p>;
}
