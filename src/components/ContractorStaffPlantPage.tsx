import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { addDoc, collection, onSnapshot, query, where } from 'firebase/firestore';
import { BriefcaseBusiness, ClipboardCheck, Hammer, HardHat, Loader2, Users } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
type LoadState = 'loading' | 'ready' | 'error';
type RecordStatus = 'available' | 'allocated' | 'pending_review' | 'approved' | 'inactive';

type StaffRecord = {
  id: string;
  contractorId: string;
  name: string;
  role: string;
  trade?: string;
  competencyExpiry?: string;
  status: RecordStatus;
  currentProjectRef?: string;
  createdAt?: string;
};

type PlantRecord = {
  id: string;
  contractorId: string;
  assetName: string;
  assetType: string;
  inspectionExpiry?: string;
  status: RecordStatus;
  currentProjectRef?: string;
  notes?: string;
  createdAt?: string;
};

type WageRecord = {
  id: string;
  contractorId: string;
  periodStart: string;
  periodEnd: string;
  workerCount: number;
  grossAmountCents: number;
  status: RecordStatus;
  projectRef?: string;
  notes?: string;
  humanReviewRequired: boolean;
  createdAt?: string;
};

const money = (cents = 0) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(cents / 100);

export default function ContractorStaffPlantPage({ user }: { user: UserProfile }) {
  const [state, setState] = useState<LoadState>('loading');
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [plant, setPlant] = useState<PlantRecord[]>([]);
  const [wages, setWages] = useState<WageRecord[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [staffForm, setStaffForm] = useState({ name: '', role: '', trade: '', competencyExpiry: '', projectRef: '' });
  const [plantForm, setPlantForm] = useState({ assetName: '', assetType: '', inspectionExpiry: '', projectRef: '', notes: '' });
  const [wageForm, setWageForm] = useState({ periodStart: '', periodEnd: '', workerCount: '', grossAmount: '', projectRef: '', notes: '' });

  useEffect(() => {
    setState('loading');
    const staffUnsub = onSnapshot(query(getDemoCol( 'contractor_staff_records'), where('contractorId', '==', user.uid)), (snapshot) => {
      setStaff(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as StaffRecord)));
      setState('ready');
    }, (error) => {
      console.error('Failed to load contractor staff records:', error);
      setState('error');
    });
    const plantUnsub = onSnapshot(query(getDemoCol( 'contractor_plant_records'), where('contractorId', '==', user.uid)), (snapshot) => {
      setPlant(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as PlantRecord)));
    }, (error) => {
      console.error('Failed to load contractor plant records:', error);
      setState('error');
    });
    const wagesUnsub = onSnapshot(query(getDemoCol( 'contractor_wage_records'), where('contractorId', '==', user.uid)), (snapshot) => {
      setWages(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as WageRecord)));
    }, (error) => {
      console.error('Failed to load contractor wage records:', error);
      setState('error');
    });
    return () => {
      staffUnsub();
      plantUnsub();
      wagesUnsub();
    };
  }, [user.uid]);

  const stats = useMemo(() => ({
    staff: staff.length,
    availableStaff: staff.filter((item) => item.status === 'available').length,
    plant: plant.length,
    wageReview: wages.filter((item) => item.status === 'pending_review').length,
  }), [plant, staff, wages]);

  const createStaff = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await addDoc(getDemoCol( 'contractor_staff_records'), {
        contractorId: user.uid,
        contractorName: user.displayName || user.email,
        name: staffForm.name.trim(),
        role: staffForm.role.trim(),
        trade: staffForm.trade.trim(),
        competencyExpiry: staffForm.competencyExpiry || null,
        currentProjectRef: staffForm.projectRef.trim(),
        status: 'available',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setStaffForm({ name: '', role: '', trade: '', competencyExpiry: '', projectRef: '' });
      setFeedback('Staff record saved for project allocation and close-out evidence.');
    } catch (error) {
      console.error('Failed to save staff record:', error);
      setFeedback('Unable to save staff record.');
    } finally {
      setSaving(false);
    }
  };

  const createPlant = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await addDoc(getDemoCol( 'contractor_plant_records'), {
        contractorId: user.uid,
        contractorName: user.displayName || user.email,
        assetName: plantForm.assetName.trim(),
        assetType: plantForm.assetType.trim(),
        inspectionExpiry: plantForm.inspectionExpiry || null,
        currentProjectRef: plantForm.projectRef.trim(),
        notes: plantForm.notes.trim(),
        status: 'available',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setPlantForm({ assetName: '', assetType: '', inspectionExpiry: '', projectRef: '', notes: '' });
      setFeedback('Plant/equipment record saved for allocation and inspection readiness.');
    } catch (error) {
      console.error('Failed to save plant record:', error);
      setFeedback('Unable to save plant record.');
    } finally {
      setSaving(false);
    }
  };

  const createWageRecord = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await addDoc(getDemoCol( 'contractor_wage_records'), {
        contractorId: user.uid,
        contractorName: user.displayName || user.email,
        periodStart: wageForm.periodStart,
        periodEnd: wageForm.periodEnd,
        workerCount: Number(wageForm.workerCount || 0),
        grossAmountCents: Math.round(Number(wageForm.grossAmount || 0) * 100),
        projectRef: wageForm.projectRef.trim(),
        notes: wageForm.notes.trim(),
        status: 'pending_review',
        humanReviewRequired: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setWageForm({ periodStart: '', periodEnd: '', workerCount: '', grossAmount: '', projectRef: '', notes: '' });
      setFeedback('Wage record saved for human review. No payroll or payment release was triggered.');
    } catch (error) {
      console.error('Failed to save wage record:', error);
      setFeedback('Unable to save wage record.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="contractor-staff-page">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">Staff, Wages & Plant</Badge>
              <CardTitle className="font-heading text-3xl mt-3 flex items-center gap-3"><Hammer className="h-7 w-7 text-primary" /> Contractor resource control</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">Live contractor records for labour capacity, plant/equipment readiness, and wage evidence. Wage records are audit evidence only and require human payment/payroll approval elsewhere.</CardDescription>
            </div>
            <Badge className="capitalize w-fit">{user.role}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          {state === 'loading' && <div className="md:col-span-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading contractor resources...</div>}
          {state === 'error' && <div className="md:col-span-4 text-sm text-destructive">Unable to load contractor records. Check access rules.</div>}
          <MetricCard icon={<Users />} label="Staff records" value={stats.staff} />
          <MetricCard icon={<HardHat />} label="Available staff" value={stats.availableStaff} />
          <MetricCard icon={<BriefcaseBusiness />} label="Plant records" value={stats.plant} />
          <MetricCard icon={<ClipboardCheck />} label="Wage review queue" value={stats.wageReview} />
        </CardContent>
      </Card>

      {feedback && <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-primary">{feedback}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader><CardTitle className="font-heading text-xl">Add staff record</CardTitle><CardDescription>Capture labour capacity and competency expiry for project allocation.</CardDescription></CardHeader>
          <CardContent><form onSubmit={createStaff} className="space-y-3"><Input value={staffForm.name} onChange={(event) => setStaffForm((current) => ({ ...current, name: event.target.value }))} placeholder="Worker / team name" required /><Input value={staffForm.role} onChange={(event) => setStaffForm((current) => ({ ...current, role: event.target.value }))} placeholder="Role" required /><Input value={staffForm.trade} onChange={(event) => setStaffForm((current) => ({ ...current, trade: event.target.value }))} placeholder="Trade" /><Input type="date" value={staffForm.competencyExpiry} onChange={(event) => setStaffForm((current) => ({ ...current, competencyExpiry: event.target.value }))} /><Input value={staffForm.projectRef} onChange={(event) => setStaffForm((current) => ({ ...current, projectRef: event.target.value }))} placeholder="Project/package reference" /><Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save staff'}</Button></form></CardContent>
        </Card>

        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader><CardTitle className="font-heading text-xl">Add plant/equipment</CardTitle><CardDescription>Track inspection readiness for machinery, tools, vehicles, and access equipment.</CardDescription></CardHeader>
          <CardContent><form onSubmit={createPlant} className="space-y-3"><Input value={plantForm.assetName} onChange={(event) => setPlantForm((current) => ({ ...current, assetName: event.target.value }))} placeholder="Asset name" required /><Input value={plantForm.assetType} onChange={(event) => setPlantForm((current) => ({ ...current, assetType: event.target.value }))} placeholder="Asset type" required /><Input type="date" value={plantForm.inspectionExpiry} onChange={(event) => setPlantForm((current) => ({ ...current, inspectionExpiry: event.target.value }))} /><Input value={plantForm.projectRef} onChange={(event) => setPlantForm((current) => ({ ...current, projectRef: event.target.value }))} placeholder="Project/package reference" /><Textarea value={plantForm.notes} onChange={(event) => setPlantForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Inspection, operator, or allocation notes" /><Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save plant'}</Button></form></CardContent>
        </Card>

        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader><CardTitle className="font-heading text-xl">Add wage evidence</CardTitle><CardDescription>Save a wage register record for human review. This does not pay anyone.</CardDescription></CardHeader>
          <CardContent><form onSubmit={createWageRecord} className="space-y-3"><div className="grid grid-cols-2 gap-2"><Input type="date" value={wageForm.periodStart} onChange={(event) => setWageForm((current) => ({ ...current, periodStart: event.target.value }))} required /><Input type="date" value={wageForm.periodEnd} onChange={(event) => setWageForm((current) => ({ ...current, periodEnd: event.target.value }))} required /></div><Input type="number" min="0" value={wageForm.workerCount} onChange={(event) => setWageForm((current) => ({ ...current, workerCount: event.target.value }))} placeholder="Worker count" required /><Input type="number" min="0" step="0.01" value={wageForm.grossAmount} onChange={(event) => setWageForm((current) => ({ ...current, grossAmount: event.target.value }))} placeholder="Gross amount in ZAR" required /><Input value={wageForm.projectRef} onChange={(event) => setWageForm((current) => ({ ...current, projectRef: event.target.value }))} placeholder="Project/package reference" /><Textarea value={wageForm.notes} onChange={(event) => setWageForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Evidence notes or payroll batch reference" /><Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save for review'}</Button></form></CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <RecordList title="Staff" empty="No staff records yet." records={staff.map((item) => ({ id: item.id, title: item.name, subtitle: `${item.role}${item.trade ? ` · ${item.trade}` : ''}`, meta: item.competencyExpiry ? `Competency expires ${item.competencyExpiry}` : 'No competency expiry', status: item.status }))} />
        <RecordList title="Plant & equipment" empty="No plant records yet." records={plant.map((item) => ({ id: item.id, title: item.assetName, subtitle: item.assetType, meta: item.inspectionExpiry ? `Inspection expires ${item.inspectionExpiry}` : item.notes || 'No inspection expiry', status: item.status }))} />
        <RecordList title="Wage evidence" empty="No wage records yet." records={wages.map((item) => ({ id: item.id, title: `${item.periodStart} to ${item.periodEnd}`, subtitle: `${item.workerCount} workers · ${money(item.grossAmountCents)}`, meta: item.notes || 'Human review required', status: item.status }))} />
      </div>
    </div>
  );
}

function RecordList({ title, empty, records }: { title: string; empty: string; records: Array<{ id: string; title: string; subtitle: string; meta: string; status: string }> }) {
  return <Card className="rounded-2xl border-border bg-card/90 shadow-sm"><CardHeader><CardTitle className="font-heading text-xl">{title}</CardTitle></CardHeader><CardContent className="space-y-3">{records.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{empty}</p> : records.map((record) => <div key={record.id} className="rounded-xl border border-border p-4 text-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{record.title}</p><p className="text-xs text-muted-foreground">{record.subtitle}</p></div><Badge variant="secondary">{record.status.replace(/_/g, ' ')}</Badge></div><p className="mt-3 text-xs text-muted-foreground">{record.meta}</p></div>)}</CardContent></Card>;
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-background/70 p-4"><div className="flex items-center gap-2 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}<p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p></div><p className="mt-3 font-heading text-3xl font-black">{value}</p></div>;
}
