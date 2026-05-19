import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { addDoc, collection, collectionGroup, limit, onSnapshot, query, where } from 'firebase/firestore';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Factory, FileText, Loader2, PackageCheck, Plus, Search, ShoppingCart } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { Bid, GanttTask, Project, RFI, SiteInspection, SiteLog, TenderPackage, UserProfile } from '@/types';
import { assessContractorWorkflow } from '@/services/contractorWorkflowService';
import { buildMaterialSchedule, draftPurchaseOrderForHumanApproval, extractBoQBoMItems, matchSupplierCatalogue } from '@/services/procurementWorkflowService';
import type { DeliveryEvidenceItem, DeliveryEvidenceType, ProcurementCommitment, SnagItem } from '@/services/packageReadinessService';
import TenderWizard from './TenderWizard';
import BidSubmission from './BidSubmission';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

interface PackageProcurementWorkspaceProps {
  user: UserProfile;
  mode: 'packages' | 'procurement';
}

type LoadState = 'loading' | 'ready' | 'error';
type CommitmentType = ProcurementCommitment['type'];
type SupplierProfile = {
  uid: string;
  displayName?: string;
  email?: string;
  professionalLabel?: string;
  professionalLabels?: string[];
  region?: string;
  averageRating?: number;
  totalReviews?: number;
  cidbGrading?: string;
  tradeLicense?: string;
};

const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });
const COMMITMENT_TYPES: CommitmentType[] = ['supplier_quote', 'purchase_order', 'delivery_note', 'subcontract_order', 'payment_claim'];
const ROLE_COMMITMENT_TYPES: Partial<Record<UserProfile['role'], CommitmentType[]>> = {
  supplier: ['supplier_quote', 'delivery_note', 'payment_claim'],
  subcontractor: ['subcontract_order', 'payment_claim'],
};
const ROLE_DEFAULT_COMMITMENT_TYPE: Partial<Record<UserProfile['role'], CommitmentType>> = {
  supplier: 'supplier_quote',
  subcontractor: 'subcontract_order',
};
const PACKAGE_EVIDENCE_TYPES: Array<{ value: DeliveryEvidenceType; label: string; requiredForCloseout?: boolean }> = [
  { value: 'delivery_note', label: 'Delivery note', requiredForCloseout: true },
  { value: 'supplier_quote', label: 'Product data / lead times' },
  { value: 'shop_drawing', label: 'Shop drawing approval', requiredForCloseout: true },
  { value: 'sample_approval', label: 'Sample / material approval', requiredForCloseout: true },
  { value: 'rfi', label: 'RFIs / site instructions' },
  { value: 'warranty', label: 'Warranty certificate', requiredForCloseout: true },
  { value: 'manual', label: 'Manual / O&M document', requiredForCloseout: true },
  { value: 'certificate', label: 'Compliance certificate', requiredForCloseout: true },
  { value: 'payment_claim_evidence', label: 'Payment claim evidence' },
  { value: 'closeout_document', label: 'Close-out document', requiredForCloseout: true },
];
const ROLE_EVIDENCE_TYPES: Partial<Record<UserProfile['role'], DeliveryEvidenceType[]>> = {
  supplier: ['delivery_note', 'supplier_quote', 'warranty', 'manual', 'certificate', 'payment_claim_evidence'],
  subcontractor: ['shop_drawing', 'sample_approval', 'rfi', 'payment_claim_evidence', 'closeout_document'],
};

function allowedCommitmentTypesForRole(role: UserProfile['role']) {
  return ROLE_COMMITMENT_TYPES[role] ?? COMMITMENT_TYPES;
}

function defaultCommitmentTypeForRole(role: UserProfile['role']) {
  return ROLE_DEFAULT_COMMITMENT_TYPE[role] ?? allowedCommitmentTypesForRole(role)[0] ?? 'supplier_quote';
}

function allowedEvidenceTypesForRole(role: UserProfile['role']) {
  return ROLE_EVIDENCE_TYPES[role] ?? PACKAGE_EVIDENCE_TYPES.map((option) => option.value);
}

function sourceLabelForBoMItem(sourceType: string) {
  if (sourceType === 'tender_scope') return 'tender package scope item';
  if (sourceType === 'drawing_or_specification') return 'linked drawing/specification document';
  if (sourceType === 'bid_line_item') return 'awarded bid line item';
  return 'manual procurement item';
}

function tenderQueriesForUser(user: UserProfile) {
  const tenders = collection(db, 'tender_packages');

  if (user.role === 'admin') return [query(tenders, limit(50))];
  if (user.role === 'bep' || user.role === 'architect') return [query(tenders, where('createdBy', '==', user.uid), limit(50)), query(tenders, where('status', '==', 'published'), limit(50))];
  if (user.role === 'contractor' || user.role === 'subcontractor' || user.role === 'supplier') return [query(tenders, where('status', '==', 'published'), limit(50)), query(tenders, where('awardedContractorId', '==', user.uid), limit(50))];
  return [query(tenders, where('status', '==', 'published'), limit(50))];
}

function projectQueriesForUser(user: UserProfile) {
  const projects = collection(db, 'projects');
  if (user.role === 'admin') return [query(projects, limit(25))];
  if (user.role === 'client') return [query(projects, where('clientId', '==', user.uid), limit(25))];
  if (user.role === 'bep' || user.role === 'architect') return [query(projects, where('leadArchitectId', '==', user.uid), limit(25))];
  return [];
}

function canCreateTender(user: UserProfile) {
  return user.role === 'admin' || user.role === 'bep' || user.role === 'architect';
}

function canRequestCommitment(user: UserProfile) {
  return ['admin', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier'].includes(user.role);
}

function canSubmitPackageEvidence(user: UserProfile) {
  return ['admin', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier'].includes(user.role);
}

function canSubmitPackageBid(user: UserProfile) {
  return user.role === 'contractor' || user.role === 'subcontractor';
}

function statusTone(status: string) {
  if (['blocked', 'overdue', 'rejected', 'cancelled'].includes(status)) return 'destructive' as const;
  if (['ready_for_closeout', 'ready_for_review', 'approved', 'issued', 'delivered', 'awarded'].includes(status)) return 'default' as const;
  return 'secondary' as const;
}

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
    return timestampMs(record.updatedAt ?? record.createdAt ?? record.dueDate ?? record.deadline);
  };
  return [...items].sort((a, b) => timeFor(b) - timeFor(a));
}

export default function PackageProcurementWorkspace({ user, mode }: PackageProcurementWorkspaceProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [tenders, setTenders] = useState<TenderPackage[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [myBids, setMyBids] = useState<Bid[]>([]);
  const [commitments, setCommitments] = useState<ProcurementCommitment[]>([]);
  const [evidence, setEvidence] = useState<DeliveryEvidenceItem[]>([]);
  const [rfis, setRfis] = useState<RFI[]>([]);
  const [tasks, setTasks] = useState<GanttTask[]>([]);
  const [siteLogs, setSiteLogs] = useState<SiteLog[]>([]);
  const [inspections, setInspections] = useState<SiteInspection[]>([]);
  const [snags, setSnags] = useState<SnagItem[]>([]);
  const [supplierProfiles, setSupplierProfiles] = useState<SupplierProfile[]>([]);
  const [selectedTenderId, setSelectedTenderId] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftType, setDraftType] = useState<CommitmentType>('supplier_quote');
  const [draftAmount, setDraftAmount] = useState('');
  const [draftDueDate, setDraftDueDate] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [evidenceTitle, setEvidenceTitle] = useState('');
  const [evidenceType, setEvidenceType] = useState<DeliveryEvidenceType>('delivery_note');
  const [evidenceDueDate, setEvidenceDueDate] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [saving, setSaving] = useState(false);
  const roleCommitmentTypes = useMemo(() => allowedCommitmentTypesForRole(user.role), [user.role]);
  const roleEvidenceTypes = useMemo(() => allowedEvidenceTypesForRole(user.role), [user.role]);
  const roleEvidenceOptions = useMemo(() => PACKAGE_EVIDENCE_TYPES.filter((option) => roleEvidenceTypes.includes(option.value)), [roleEvidenceTypes]);

  useEffect(() => {
    setDraftType(defaultCommitmentTypeForRole(user.role));
    setEvidenceType(allowedEvidenceTypesForRole(user.role)[0] ?? 'delivery_note');
  }, [user.role]);

  useEffect(() => {
    setState('loading');
    const tenderMap = new Map<string, TenderPackage>();
    const unsubs = tenderQueriesForUser(user).map((tenderQuery) => onSnapshot(tenderQuery, (snapshot) => {
      snapshot.docs.forEach((docSnap) => tenderMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as TenderPackage));
      setTenders(Array.from(tenderMap.values()).sort((a, b) => String(b.updatedAt ?? b.createdAt).localeCompare(String(a.updatedAt ?? a.createdAt))));
      setState('ready');
    }, (error) => {
      console.warn('Package workspace tender projection unavailable; continuing with visible records only:', error);
      setState('ready');
    }));

    const projectMap = new Map<string, Project>();
    projectQueriesForUser(user).forEach((projectQuery) => {
      unsubs.push(onSnapshot(projectQuery, (snapshot) => {
        snapshot.docs.forEach((docSnap) => projectMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as Project));
        setProjects(Array.from(projectMap.values()));
      }, (error) => console.warn('Package workspace project projection unavailable; continuing without project context:', error)));
    });

    unsubs.push(onSnapshot(query(collectionGroup(db, 'bids'), where('contractorId', '==', user.uid)), (snapshot) => {
      setMyBids(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Bid)));
    }, (error) => console.warn('Package bid projection unavailable; continuing without bid context:', error)));

    unsubs.push(onSnapshot(query(collection(db, 'directoryProfiles'), where('role', '==', 'supplier'), limit(50)), (snapshot) => {
      setSupplierProfiles(snapshot.docs.map((docSnap) => ({ uid: docSnap.id, ...docSnap.data() } as SupplierProfile)));
    }, (error) => console.warn('Supplier catalogue projection unavailable; continuing without supplier directory:', error)));

    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [user]);

  useEffect(() => {
    const packageIds = tenders.map((tender) => tender.id).slice(0, 10);
    if (packageIds.length === 0) {
      setCommitments([]);
      setEvidence([]);
      setRfis([]);
      setTasks([]);
      setSiteLogs([]);
      setInspections([]);
      setSnags([]);
      return undefined;
    }

    const unsubs = [
      onSnapshot(query(collection(db, 'package_procurement_commitments'), where('packageId', 'in', packageIds)), (snapshot) => setCommitments(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as ProcurementCommitment))), (error) => { console.warn('Package procurement commitments unavailable:', error); setCommitments([]); }),
      onSnapshot(query(collection(db, 'package_delivery_evidence'), where('packageId', 'in', packageIds)), (snapshot) => setEvidence(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as DeliveryEvidenceItem))), (error) => { console.warn('Package delivery evidence unavailable:', error); setEvidence([]); }),
      onSnapshot(query(collection(db, 'rfis'), where('packageId', 'in', packageIds)), (snapshot) => setRfis(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as RFI))), (error) => { console.warn('Package RFIs unavailable:', error); setRfis([]); }),
      onSnapshot(query(collection(db, 'gantt_tasks'), where('packageId', 'in', packageIds)), (snapshot) => setTasks(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as GanttTask))), (error) => { console.warn('Package programme tasks unavailable:', error); setTasks([]); }),
      onSnapshot(query(collection(db, 'site_logs'), where('packageId', 'in', packageIds)), (snapshot) => setSiteLogs(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as SiteLog))), (error) => { console.warn('Package site logs unavailable:', error); setSiteLogs([]); }),
      onSnapshot(query(collection(db, 'site_inspections'), where('packageId', 'in', packageIds)), (snapshot) => setInspections(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as SiteInspection))), (error) => { console.warn('Package inspections unavailable:', error); setInspections([]); }),
      onSnapshot(query(collection(db, 'package_snags'), where('packageId', 'in', packageIds)), (snapshot) => setSnags(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as SnagItem))), (error) => { console.warn('Package snags unavailable:', error); setSnags([]); }),
    ];

    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [tenders]);

  const selectedTender = useMemo(() => tenders.find((tender) => tender.id === selectedTenderId) ?? tenders[0], [selectedTenderId, tenders]);
  const selectedProject = useMemo(() => projects.find((project) => project.id === selectedTender?.projectId) ?? projects[0], [projects, selectedTender]);
  const activeBid = useMemo(() => myBids.find((bid) => bid.tenderPackageId === selectedTender?.id || bid.tenderPackageId === selectedTenderId), [myBids, selectedTender?.id, selectedTenderId]);
  const tendersAvailableForBid = useMemo(() => tenders.filter((tender) => tender.status === 'published' && !myBids.some((bid) => bid.tenderPackageId === tender.id)), [myBids, tenders]);
  const selectedCommitments = useMemo(() => selectedTender ? sortByRecent(commitments.filter((item) => item.packageId === selectedTender.id && roleCommitmentTypes.includes(item.type))) : [], [commitments, roleCommitmentTypes, selectedTender]);
  const selectedEvidence = useMemo(() => selectedTender ? sortByRecent(evidence.filter((item) => item.packageId === selectedTender.id && roleEvidenceTypes.includes(item.type))) : [], [evidence, roleEvidenceTypes, selectedTender]);
  const selectedReadiness = useMemo(() => {
    if (!selectedTender) return null;
    return assessContractorWorkflow({
      tender: selectedTender,
      awardedBid: activeBid,
      programmeTasks: tasks.filter((task: any) => task.packageId === selectedTender.id || task.projectId === selectedTender.projectId),
      rfis: rfis.filter((rfi: any) => rfi.packageId === selectedTender.id || rfi.projectId === selectedTender.projectId),
      siteLogs: siteLogs.filter((log: any) => log.packageId === selectedTender.id || log.projectId === selectedTender.projectId),
      inspections: inspections.filter((inspection: any) => inspection.packageId === selectedTender.id || inspection.projectId === selectedTender.projectId),
      evidence: evidence.filter((item) => item.packageId === selectedTender.id),
      procurementCommitments: commitments.filter((item) => item.packageId === selectedTender.id),
      snags: snags.filter((item) => item.packageId === selectedTender.id),
    });
  }, [activeBid, commitments, evidence, inspections, rfis, selectedTender, siteLogs, snags, tasks]);
  const extractedBoMItems = useMemo(() => {
    if (!selectedTender) return [];
    return buildMaterialSchedule(extractBoQBoMItems({
      tender: selectedTender,
      awardedBid: activeBid,
      programmeTasks: tasks.filter((task: any) => task.packageId === selectedTender.id || task.projectId === selectedTender.projectId),
    })).slice(0, 12);
  }, [activeBid, selectedTender, tasks]);
  const supplierCatalogueMatches = useMemo(() => {
    const packageText = `${selectedTender?.title ?? ''} ${selectedTender?.description ?? ''} ${(selectedTender?.scope ?? []).join(' ')} ${(selectedTender?.requiredCertifications ?? []).join(' ')}`;
    return matchSupplierCatalogue(packageText, supplierProfiles).map((match) => ({
      ...match,
      matchTerms: match.matchTerms.slice(0, 4),
    }));
  }, [selectedTender, supplierProfiles]);

  const stats = useMemo(() => ({
    packages: tenders.length,
    procurementItems: commitments.length,
    pendingApprovals: commitments.filter((item) => item.status === 'pending_approval').length,
    awarded: tenders.filter((tender) => tender.status === 'awarded').length,
  }), [commitments, tenders]);

  const submitCommitment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTender || !draftTitle.trim()) return;
    if (!roleCommitmentTypes.includes(draftType)) return;
    setSaving(true);
    try {
      const requiresApproval = draftType === 'purchase_order' || draftType === 'subcontract_order' || draftType === 'payment_claim';
      const now = new Date().toISOString();
      const amount = draftAmount ? Number(draftAmount) : undefined;
      const note = draftNote.trim() || undefined;
      const baseRecord = draftType === 'purchase_order'
        ? draftPurchaseOrderForHumanApproval({
          packageId: selectedTender.id,
          projectId: selectedTender.projectId,
          jobId: selectedTender.jobId,
          title: draftTitle,
          amount,
          dueDate: draftDueDate || undefined,
          requestedBy: user,
          sourceItems: extractedBoMItems,
          note,
          createdAt: now,
        })
        : {
          packageId: selectedTender.id,
          projectId: selectedTender.projectId,
          jobId: selectedTender.jobId,
          type: draftType,
          title: draftTitle.trim(),
          status: requiresApproval ? 'pending_approval' : 'draft',
          amount,
          dueDate: draftDueDate || undefined,
          note,
          requestedBy: user.uid,
          requestedByRole: user.role,
          humanReviewRequired: requiresApproval,
          createdAt: now,
          updatedAt: now,
        };
      await addDoc(collection(db, 'package_procurement_commitments'), {
        ...baseRecord,
        requestedByName: user.displayName || user.email,
      });
      setDraftTitle('');
      setDraftAmount('');
      setDraftDueDate('');
      setDraftNote('');
    } finally {
      setSaving(false);
    }
  };

  const submitPackageEvidence = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTender || !evidenceTitle.trim()) return;
    if (!roleEvidenceTypes.includes(evidenceType)) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const evidenceConfig = PACKAGE_EVIDENCE_TYPES.find((option) => option.value === evidenceType);
      await addDoc(collection(db, 'package_delivery_evidence'), {
        packageId: selectedTender.id,
        projectId: selectedTender.projectId,
        jobId: selectedTender.jobId,
        type: evidenceType,
        title: evidenceTitle.trim(),
        status: 'submitted',
        createdBy: user.uid,
        requestedBy: user.uid,
        requestedByRole: user.role,
        createdAt: now,
        updatedAt: now,
        dueDate: evidenceDueDate || undefined,
        requiredForCloseout: Boolean(evidenceConfig?.requiredForCloseout),
        metadata: {
          source: 'package-procurement-workspace',
          reference: evidenceReference.trim() || undefined,
          note: evidenceNote.trim() || undefined,
          humanReviewRequired: true,
        },
      });
      setEvidenceTitle('');
      setEvidenceReference('');
      setEvidenceNote('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid={`package-procurement-workspace-${mode}`}>
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">{mode === 'procurement' ? 'BoQ / BoM Procurement' : 'Subcontractor Packages'}</Badge>
              <CardTitle className="font-heading text-3xl mt-3">Package delivery workspace</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">
                Live tender package, bid, procurement, RFI, site evidence, snag, and close-out readiness projection. Approval, order, claim, and payment effects remain human-reviewed records.
              </CardDescription>
            </div>
            <Badge className="capitalize w-fit">{user.role}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          {state === 'loading' && <div className="md:col-span-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading live packages...</div>}
          {state === 'error' && <div className="md:col-span-4 text-sm text-destructive">Unable to load packages. Check Firestore permissions and indexes.</div>}
          <MetricCard icon={<PackageCheck />} label="Packages" value={stats.packages} />
          <MetricCard icon={<ShoppingCart />} label="Procurement records" value={stats.procurementItems} />
          <MetricCard icon={<ClipboardCheck />} label="Pending approvals" value={stats.pendingApprovals} />
          <MetricCard icon={<CheckCircle2 />} label="Awarded" value={stats.awarded} />
        </CardContent>
      </Card>

      {canCreateTender(user) && selectedProject && (
        <TenderWizard projectId={selectedProject.id} jobId={selectedProject.jobId} createdBy={user.uid} onCreated={setSelectedTenderId} />
      )}

      {canSubmitPackageBid(user) && (
        <BidSubmission tenders={tendersAvailableForBid} contractorId={user.uid} contractorName={user.displayName || user.email} onSubmitted={setSelectedTenderId} />
      )}

      {user.role === 'supplier' && (
        <Card className="rounded-2xl border-primary/20 bg-primary/5 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-xl">Supplier quote path</CardTitle>
            <CardDescription>Suppliers record the supplier quote path, supplier API catalogue matches, product data / lead times, delivery notes, warranties, and payment evidence against the selected package. Contractor/subcontractor bid submission remains CIDB/NHBRC-verification gated.</CardDescription>
          </CardHeader>
        </Card>
      )}

      {user.role === 'subcontractor' && (
        <Card className="rounded-2xl border-primary/20 bg-primary/5 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-xl">Assigned package scope</CardTitle>
            <CardDescription>Subcontractors record assigned package scope, shop drawings/samples, RFIs / site instructions, subcontract orders, payment claims, and closeout evidence only.</CardDescription>
          </CardHeader>
        </Card>
      )}

      {mode === 'procurement' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
            <CardHeader>
              <CardTitle className="font-heading text-xl flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> Drawing-to-BoM Extractor</CardTitle>
              <CardDescription>Extracts a procurement-ready BoM view from the selected live package scope, linked drawings/specifications, and priced bid lines where available. It does not invent quantities or supplier pricing.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selectedTender ? <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Select a live package to derive a BoM from its scope and documents.</p> : extractedBoMItems.length === 0 ? <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No scope, bid line items, or drawing/specification document names are available for this package yet.</p> : extractedBoMItems.map((item) => (
                <div key={item.id} className="rounded-xl border border-border bg-background/70 p-4 text-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">{item.description}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Source: {sourceLabelForBoMItem(item.sourceType)} · {item.sourceReference}{item.quantity ? ` · Qty ${item.quantity}` : ''}{item.requiredBy ? ` · Required by ${item.requiredBy}` : ''}</p>
                    </div>
                    {item.total != null ? <Badge variant="secondary">{currency.format(item.total)}</Badge> : <Badge variant="outline">needs pricing</Badge>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
            <CardHeader>
              <CardTitle className="font-heading text-xl flex items-center gap-2"><Search className="h-5 w-5 text-primary" /> Supplier API Catalogue</CardTitle>
              <CardDescription>Live supplier directory projection for procurement matching. It surfaces registered supplier profiles and package-relevant keywords only; quote requests still use the review-gated procurement record form.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {supplierCatalogueMatches.length === 0 ? <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No supplier directory profiles are visible yet.</p> : supplierCatalogueMatches.slice(0, 8).map(({ supplier, labels, matchTerms }) => (
                <div key={supplier.uid} className="rounded-xl border border-border bg-background/70 p-4 text-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">{supplier.displayName || supplier.email || supplier.uid}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{labels || 'No supplier specialisation recorded'} · {supplier.region || 'No region'}</p>
                    </div>
                    <Badge variant={matchTerms.length ? 'default' : 'outline'}>{matchTerms.length ? `${matchTerms.length} match terms` : 'directory profile'}</Badge>
                  </div>
                  {matchTerms.length > 0 && <p className="mt-3 text-xs text-primary">Matched package terms: {matchTerms.join(', ')}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-xl flex items-center gap-2"><Factory className="h-5 w-5 text-primary" /> Package register</CardTitle>
            <CardDescription>Only live tender package records visible to this role are shown.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {tenders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No tender/package records are currently visible for this role.</div>
            ) : tenders.map((tender) => {
              const isSelected = tender.id === selectedTender?.id;
              const bid = myBids.find((item) => item.tenderPackageId === tender.id);
              return (
                <button key={tender.id} type="button" onClick={() => setSelectedTenderId(tender.id)} className={`w-full rounded-2xl border p-4 text-left transition-colors ${isSelected ? 'border-primary bg-primary/5' : 'border-border bg-background/70 hover:border-primary/40'}`}>
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={statusTone(tender.status)}>{tender.status}</Badge>
                        {bid && <Badge variant="outline">My bid: {bid.status}</Badge>}
                      </div>
                      <h3 className="mt-2 font-heading text-lg font-bold">{tender.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{tender.description}</p>
                    </div>
                    <div className="shrink-0 text-left md:text-right text-sm">
                      <p className="font-mono font-bold text-primary">{tender.estimatedBudget ? currency.format(tender.estimatedBudget) : 'Budget TBC'}</p>
                      <p className="text-xs text-muted-foreground">Deadline: {tender.deadline || 'TBC'}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-xl flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-primary" /> Package claims, delivery and warranties</CardTitle>
            <CardDescription>{selectedTender ? selectedTender.title : 'Select a package to inspect payment claims, orders, delivery records, and close-out evidence.'}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">Procurement / payment records</h3>
                <Badge variant="secondary">{selectedCommitments.length}</Badge>
              </div>
              {selectedCommitments.length === 0 ? <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No package claims, orders, or delivery commitments are recorded yet.</p> : selectedCommitments.map((item) => (
                <div key={item.id} className="rounded-xl border border-border bg-background/70 p-4 text-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">{item.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.type.replaceAll('_', ' ')} · {item.dueDate || 'No due date'}{item.amount ? ` · ${currency.format(item.amount)}` : ''}</p>
                    </div>
                    <Badge variant={statusTone(item.status)}>{item.status.replaceAll('_', ' ')}</Badge>
                  </div>
                  {item.type === 'purchase_order' && <p className="mt-3 text-xs font-semibold text-primary">Purchase order assistant output is pending human approval; it cannot be issued until an authorised approval is recorded.</p>}
                  {item.type === 'payment_claim' && <p className="mt-3 text-xs font-semibold text-primary">Payment application is review-gated. No invoice, escrow release, or payment is executed by this record.</p>}
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">Delivery / close-out evidence</h3>
                <Badge variant="secondary">{selectedEvidence.length}</Badge>
              </div>
              {selectedEvidence.length === 0 ? <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No delivery notes, warranties, manuals, certificates, or claim evidence are linked yet.</p> : selectedEvidence.map((item) => (
                <div key={item.id} className="rounded-xl border border-border bg-background/70 p-4 text-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">{item.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.type.replaceAll('_', ' ')} · {item.dueDate || item.createdAt || 'No date'}{item.requiredForCloseout ? ' · close-out required' : ''}</p>
                    </div>
                    <Badge variant={statusTone(item.status)}>{item.status.replaceAll('_', ' ')}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
            <CardHeader>
              <CardTitle className="font-heading text-xl">Readiness gates</CardTitle>
              <CardDescription>{selectedTender ? selectedTender.title : 'Select a package to inspect readiness.'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedReadiness ? <p className="text-sm text-muted-foreground">No package selected.</p> : (
                <>
                  <div className="rounded-2xl border border-border bg-background/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <Badge variant={statusTone(selectedReadiness.readiness.status)}>{selectedReadiness.readiness.status.replaceAll('_', ' ')}</Badge>
                      <span className="font-heading text-2xl font-black">{selectedReadiness.readiness.score}/100</span>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{selectedReadiness.readiness.summary}</p>
                  </div>
                  {selectedReadiness.gates.map((gate) => (
                    <div key={gate.id} className="rounded-xl border border-border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold">{gate.label}</p>
                        <Badge variant={gate.status === 'blocked' ? 'destructive' : gate.status === 'pass' ? 'default' : 'secondary'}>{gate.status}</Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground">{gate.detail}</p>
                      {gate.humanConfirmationRequired && <p className="mt-2 text-xs font-semibold text-primary">Human confirmation required before downstream action.</p>}
                    </div>
                  ))}
                  {(selectedReadiness.readiness.blockers.length > 0 || selectedReadiness.readiness.warnings.length > 0) && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Items needing attention</div>
                      <ul className="mt-2 list-disc pl-5 space-y-1">
                        {[...selectedReadiness.readiness.blockers, ...selectedReadiness.readiness.warnings].slice(0, 6).map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {canRequestCommitment(user) && selectedTender && (
            <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
              <CardHeader>
                <CardTitle className="font-heading text-xl flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /> Record procurement request</CardTitle>
                <CardDescription>Creates a real pending approval/draft record. It does not issue payments, orders, or contracts automatically.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={submitCommitment} className="space-y-3">
                  <Input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder={user.role === 'supplier' ? 'Supplier quote, delivery note, or payment claim title' : user.role === 'subcontractor' ? 'Subcontract order or payment claim title' : 'Quote, purchase order, delivery note, subcontract order, or payment claim title'} required />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select value={draftType} onChange={(event) => setDraftType(event.target.value as CommitmentType)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                      {roleCommitmentTypes.map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}
                    </select>
                    <Input type="number" min="0" value={draftAmount} onChange={(event) => setDraftAmount(event.target.value)} placeholder="Amount (ZAR, optional)" />
                  </div>
                  <Input type="date" value={draftDueDate} onChange={(event) => setDraftDueDate(event.target.value)} />
                  <Textarea value={draftNote} onChange={(event) => setDraftNote(event.target.value)} placeholder="Notes, supplier reference, delivery constraints, or claim basis" />
                  <Button type="submit" disabled={saving || !draftTitle.trim()} className="w-full rounded-xl gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Save procurement record</Button>
                </form>
              </CardContent>
            </Card>
          )}

          {canSubmitPackageEvidence(user) && selectedTender && (
            <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
              <CardHeader>
                <CardTitle className="font-heading text-xl flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /> Submit delivery / warranty evidence</CardTitle>
                <CardDescription>Records real package-linked evidence for supplier deliveries, shop drawings, warranties, manuals, certificates, and payment claim support. Evidence is submitted for human review.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={submitPackageEvidence} className="space-y-3">
                  <Input value={evidenceTitle} onChange={(event) => setEvidenceTitle(event.target.value)} placeholder="Evidence title" required />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select value={evidenceType} onChange={(event) => setEvidenceType(event.target.value as DeliveryEvidenceType)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                      {roleEvidenceOptions.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                    </select>
                    <Input type="date" value={evidenceDueDate} onChange={(event) => setEvidenceDueDate(event.target.value)} />
                  </div>
                  <Input value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Reference number, delivery note, certificate or claim ref" />
                  <Textarea value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} placeholder="Evidence notes, delivery constraints, warranty period, or payment claim basis" />
                  <Button type="submit" disabled={saving || !evidenceTitle.trim()} className="w-full rounded-xl gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Submit evidence for review</Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-background/70 p-4">
      <div className="flex items-center gap-2 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}<p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p></div>
      <p className="mt-3 font-heading text-3xl font-black">{value}</p>
    </div>
  );
}
