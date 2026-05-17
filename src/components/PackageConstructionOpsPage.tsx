import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { addDoc, collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { AlertTriangle, CalendarDays, Camera, CheckCircle2, ClipboardCheck, FileWarning, Loader2, MessageSquarePlus, Plus } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { GanttTask, RFI, SiteInspection, SiteLog, TenderPackage, UserProfile } from '@/types';
import type { SnagItem } from '@/services/packageReadinessService';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';

type LoadState = 'loading' | 'ready' | 'error';
type CaptureType = 'rfi' | 'site_instruction' | 'site_log' | 'programme_task' | 'inspection';

type SiteInstructionRecord = {
  id: string;
  packageId: string;
  projectId: string;
  jobId?: string;
  title: string;
  instruction: string;
  issuedBy: string;
  assignedTo?: string;
  status: 'issued' | 'acknowledged' | 'closed';
  dueDate: string;
  costImpactStatus: 'none' | 'potential' | 'confirmed';
  programmeImpactStatus: 'none' | 'potential' | 'confirmed';
  humanReviewRequired: boolean;
  createdAt: string;
  updatedAt?: string;
};

type ConstructionRecord = RFI | SiteLog | GanttTask | SiteInspection | SnagItem | SiteInstructionRecord;

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
    return timestampMs(record.updatedAt ?? record.createdAt ?? record.date ?? record.dueDate ?? record.startDate);
  };
  return [...items].sort((a, b) => timeFor(b) - timeFor(a));
}

function tenderQueriesForUser(user: UserProfile) {
  const tenders = collection(db, 'tender_packages');
  if (user.role === 'admin') return [query(tenders, limit(50))];
  if (user.role === 'contractor' || user.role === 'subcontractor' || user.role === 'supplier') return [query(tenders, where('status', '==', 'published'), limit(50)), query(tenders, where('awardedContractorId', '==', user.uid), limit(50))];
  return [];
}

function statusVariant(status?: string) {
  if (!status) return 'secondary' as const;
  if (['completed', 'closed', 'resolved', 'approved', 'pass', 'awarded'].includes(status)) return 'default' as const;
  if (['blocked', 'overdue', 'rejected', 'delayed'].includes(status)) return 'destructive' as const;
  return 'secondary' as const;
}

function recordTitle(record: ConstructionRecord) {
  if ('subject' in record && record.subject) return record.subject;
  if ('title' in record && record.title) return record.title;
  if ('workDescription' in record && record.workDescription) return record.workDescription;
  if ('description' in record && record.description) return record.description;
  return 'Construction record';
}

function recordStatus(record: ConstructionRecord) {
  if ('status' in record && record.status) return String(record.status);
  if ('severity' in record && record.severity) return String(record.severity);
  return 'recorded';
}

function canCaptureSiteRecords(role: UserProfile['role']) {
  return role === 'contractor' || role === 'subcontractor' || role === 'admin';
}

export default function PackageConstructionOpsPage({ user }: { user: UserProfile }) {
  const [state, setState] = useState<LoadState>('loading');
  const [tenders, setTenders] = useState<TenderPackage[]>([]);
  const [selectedTenderId, setSelectedTenderId] = useState('');
  const [rfis, setRfis] = useState<RFI[]>([]);
  const [siteInstructions, setSiteInstructions] = useState<SiteInstructionRecord[]>([]);
  const [siteLogs, setSiteLogs] = useState<SiteLog[]>([]);
  const [tasks, setTasks] = useState<GanttTask[]>([]);
  const [inspections, setInspections] = useState<SiteInspection[]>([]);
  const [snags, setSnags] = useState<SnagItem[]>([]);
  const [captureType, setCaptureType] = useState<CaptureType>('rfi');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setState('loading');
    const tenderMap = new Map<string, TenderPackage>();
    const unsubs = tenderQueriesForUser(user).map((tenderQuery) => onSnapshot(tenderQuery, (snapshot) => {
      snapshot.docs.forEach((docSnap) => tenderMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as TenderPackage));
      setTenders(sortByRecent(Array.from(tenderMap.values())));
      setState('ready');
    }, (error) => {
      console.warn('Construction package projection unavailable:', error);
      setState('error');
    }));
    if (unsubs.length === 0) setState('ready');
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [user]);

  const selectedTender = useMemo(() => tenders.find((tender) => tender.id === selectedTenderId) ?? tenders[0], [selectedTenderId, tenders]);

  useEffect(() => {
    const packageIds = tenders.map((tender) => tender.id).slice(0, 10);
    if (packageIds.length === 0) {
      setRfis([]);
      setSiteInstructions([]);
      setSiteLogs([]);
      setTasks([]);
      setInspections([]);
      setSnags([]);
      return undefined;
    }

    const unsubs = [
      onSnapshot(query(collection(db, 'rfis'), where('packageId', 'in', packageIds)), (snapshot) => setRfis(sortByRecent(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as RFI)))), (error) => { console.warn('Package RFIs unavailable:', error); setRfis([]); }),
      onSnapshot(query(collection(db, 'site_instructions'), where('packageId', 'in', packageIds)), (snapshot) => setSiteInstructions(sortByRecent(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as SiteInstructionRecord)))), (error) => { console.warn('Package site instructions unavailable:', error); setSiteInstructions([]); }),
      onSnapshot(query(collection(db, 'site_logs'), where('packageId', 'in', packageIds)), (snapshot) => setSiteLogs(sortByRecent(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as SiteLog)))), (error) => { console.warn('Package site logs unavailable:', error); setSiteLogs([]); }),
      onSnapshot(query(collection(db, 'gantt_tasks'), where('packageId', 'in', packageIds)), (snapshot) => setTasks(sortByRecent(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as GanttTask)))), (error) => { console.warn('Package programme tasks unavailable:', error); setTasks([]); }),
      onSnapshot(query(collection(db, 'site_inspections'), where('packageId', 'in', packageIds)), (snapshot) => setInspections(sortByRecent(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as SiteInspection)))), (error) => { console.warn('Package inspections unavailable:', error); setInspections([]); }),
      onSnapshot(query(collection(db, 'package_snags'), where('packageId', 'in', packageIds)), (snapshot) => setSnags(sortByRecent(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as SnagItem)))), (error) => { console.warn('Package snags unavailable:', error); setSnags([]); }),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [tenders]);

  const selectedRecords = useMemo(() => {
    if (!selectedTender) return [] as ConstructionRecord[];
    const byPackage = (record: any) => record.packageId === selectedTender.id || record.projectId === selectedTender.projectId;
    return sortByRecent<ConstructionRecord>([...rfis, ...siteInstructions, ...siteLogs, ...tasks, ...inspections, ...snags].filter(byPackage));
  }, [inspections, rfis, selectedTender, siteInstructions, siteLogs, snags, tasks]);

  const submitCapture = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTender || !title.trim()) return;
    setSaving(true);
    const now = new Date().toISOString();
    const common = {
      packageId: selectedTender.id,
      projectId: selectedTender.projectId,
      jobId: selectedTender.jobId,
      createdBy: user.uid,
      updatedAt: now,
    };
    try {
      if (captureType === 'rfi') {
        await addDoc(collection(db, 'rfis'), {
          ...common,
          subject: title.trim(),
          question: details.trim() || title.trim(),
          requestedBy: user.uid,
          assignedTo: selectedTender.createdBy,
          priority: 'medium',
          dueDate,
          status: 'open',
          attachments: [],
          createdAt: now,
        });
      } else if (captureType === 'site_instruction') {
        await addDoc(collection(db, 'site_instructions'), {
          ...common,
          title: title.trim(),
          instruction: details.trim() || title.trim(),
          issuedBy: user.uid,
          assignedTo: selectedTender.createdBy,
          dueDate,
          status: 'issued',
          costImpactStatus: details.toLowerCase().includes('cost') ? 'potential' : 'none',
          programmeImpactStatus: details.toLowerCase().includes('delay') || details.toLowerCase().includes('programme') ? 'potential' : 'none',
          humanReviewRequired: true,
          createdAt: now,
        });
      } else if (captureType === 'site_log') {
        await addDoc(collection(db, 'site_logs'), {
          ...common,
          date: new Date().toISOString().slice(0, 10),
          weather: 'cloudy',
          workDescription: details.trim() || title.trim(),
          labourCount: undefined,
          materialsUsed: [],
          issues: [],
          photos: [],
          createdAt: now,
        });
      } else if (captureType === 'inspection') {
        await addDoc(collection(db, 'site_inspections'), {
          ...common,
          inspectionType: 'custom',
          date: dueDate,
          inspector: user.uid,
          checklist: [{ item: title.trim(), result: 'na', comment: details.trim() || 'Scheduled for human inspection and sign-off.' }],
          overallResult: 'conditional',
          notes: details.trim() || title.trim(),
          photos: [],
          signOffStatus: 'scheduled',
          humanReviewRequired: true,
          createdAt: now,
        });
      } else {
        await addDoc(collection(db, 'gantt_tasks'), {
          ...common,
          title: title.trim(),
          phase: 'Package delivery',
          startDate: new Date().toISOString().slice(0, 10),
          endDate: dueDate,
          progress: 0,
          status: 'not_started',
          assignedTo: user.uid,
          dependsOn: [],
          createdAt: now,
        });
      }
      setTitle('');
      setDetails('');
      toast.success('Construction record saved');
    } catch (error) {
      console.warn('Construction record capture failed:', error);
      toast.error('Construction record could not be saved. Check package visibility and permissions.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="package-construction-ops-page">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">Construction OS</Badge>
              <CardTitle className="font-heading text-3xl mt-3 flex items-center gap-3"><ClipboardCheck className="h-7 w-7 text-primary" /> Package construction controls</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">
                Contractor, subcontractor, and supplier package operations backed by live RFIs, site instructions, site logs, programme tasks, inspections, and snags. Nothing is fabricated when no package records exist.
              </CardDescription>
            </div>
            <Badge className="capitalize w-fit">{user.role}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {state === 'loading' && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading construction packages...</div>}
          {state === 'error' && <div className="text-sm text-destructive">Unable to load construction packages. Check Firestore permissions.</div>}
          {tenders.length > 0 ? (
            <select value={selectedTender?.id ?? ''} onChange={(event) => setSelectedTenderId(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm md:max-w-2xl">
              {tenders.map((tender) => <option key={tender.id} value={tender.id}>{tender.title} · {tender.status}</option>)}
            </select>
          ) : state !== 'loading' && <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No construction package is visible for this role yet.</div>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        <MetricCard icon={<MessageSquarePlus />} label="RFIs" value={rfis.length} />
        <MetricCard icon={<FileWarning />} label="Instructions" value={siteInstructions.length} />
        <MetricCard icon={<Camera />} label="Site logs" value={siteLogs.length} />
        <MetricCard icon={<CalendarDays />} label="Programme tasks" value={tasks.length} />
        <MetricCard icon={<CheckCircle2 />} label="Inspections" value={inspections.length} />
        <MetricCard icon={<AlertTriangle />} label="Snags" value={snags.length} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_390px] gap-6">
        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader><CardTitle className="font-heading text-xl">Selected package activity</CardTitle><CardDescription>{selectedTender ? selectedTender.title : 'Select a package to view records.'}</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {selectedRecords.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No construction records are linked to this package.</p> : selectedRecords.slice(0, 12).map((record: any) => (
              <div key={`${record.id}-${recordTitle(record)}`} className="rounded-xl border border-border p-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{recordTitle(record)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{record.date || record.dueDate || record.startDate || record.createdAt || 'No date recorded'}</p>
                  </div>
                  <Badge variant={statusVariant(recordStatus(record))}>{recordStatus(record).replaceAll('_', ' ')}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader><CardTitle className="font-heading text-xl flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /> Capture construction record</CardTitle><CardDescription>Writes a real package-linked record. Site instructions and inspections remain human-reviewed and do not auto-certify work.</CardDescription></CardHeader>
          <CardContent>
            <form onSubmit={submitCapture} className="space-y-3">
              <select value={captureType} onChange={(event) => setCaptureType(event.target.value as CaptureType)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="rfi">RFI</option>
                {canCaptureSiteRecords(user.role) && <option value="site_instruction">Site instruction</option>}
                {canCaptureSiteRecords(user.role) && <option value="site_log">Site log</option>}
                {canCaptureSiteRecords(user.role) && <option value="programme_task">Programme task</option>}
                {canCaptureSiteRecords(user.role) && <option value="inspection">Inspection / sign-off</option>}
              </select>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Record title / subject" required disabled={!selectedTender || saving} />
              <Textarea value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Details, question, work completed, or programme note" disabled={!selectedTender || saving} />
              <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} disabled={!selectedTender || saving} />
              <Button type="submit" disabled={!selectedTender || saving || !title.trim()} className="w-full rounded-xl gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save record</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return <Card className="rounded-2xl border-border bg-card/90 shadow-sm"><CardHeader className="pb-3"><div className="flex items-center gap-2 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}<CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</CardTitle></div></CardHeader><CardContent><p className="font-heading text-3xl font-black">{value}</p></CardContent></Card>;
}
