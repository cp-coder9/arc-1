import React, { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { ClipboardList, Factory, FileCheck2, PackageOpen, ShieldCheck, Truck } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { TenderPackage, UserProfile } from '@/types';
import type { DeliveryEvidenceItem, ProcurementCommitment } from '@/services/packageReadinessService';
import PackageProcurementWorkspace from './PackageProcurementWorkspace';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
type SupplierRecord = ProcurementCommitment | DeliveryEvidenceItem;

function timestampMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime() || 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return ((value as { toDate: () => Date }).toDate()).getTime();
  }
  return 0;
}

export default function SupplierDashboard({ user }: { user: UserProfile }) {
  const [publishedPackages, setPublishedPackages] = useState<TenderPackage[]>([]);
  const [commitments, setCommitments] = useState<ProcurementCommitment[]>([]);
  const [evidence, setEvidence] = useState<DeliveryEvidenceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubPackages = onSnapshot(
      query(getDemoCol( 'tender_packages'), where('status', '==', 'published'), limit(50)),
      (snapshot) => {
        setPublishedPackages(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as TenderPackage)));
        setLoading(false);
      },
      (error) => {
        console.warn('Supplier package projection unavailable:', error);
        setPublishedPackages([]);
        setLoading(false);
      },
    );
    const unsubCommitments = onSnapshot(
      query(getDemoCol( 'package_procurement_commitments'), where('actorId', '==', user.uid), limit(50)),
      (snapshot) => setCommitments(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as ProcurementCommitment))),
      (error) => {
        console.warn('Supplier commitment projection unavailable:', error);
        setCommitments([]);
      },
    );
    const unsubEvidence = onSnapshot(
      query(getDemoCol( 'package_delivery_evidence'), where('submittedBy', '==', user.uid), limit(50)),
      (snapshot) => setEvidence(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as DeliveryEvidenceItem))),
      (error) => {
        console.warn('Supplier delivery evidence projection unavailable:', error);
        setEvidence([]);
      },
    );
    return () => {
      unsubPackages();
      unsubCommitments();
      unsubEvidence();
    };
  }, [user.uid]);

  const stats = useMemo(() => ({
    available: publishedPackages.length,
    quotes: commitments.filter((item) => item.type === 'supplier_quote').length,
    deliveryNotes: evidence.filter((item) => item.type === 'delivery_note').length,
    closeoutDocs: evidence.filter((item) => ['warranty', 'manual', 'certificate'].includes(item.type)).length,
  }), [commitments, evidence, publishedPackages.length]);
  const recentRecords = useMemo<SupplierRecord[]>(() => [...commitments, ...evidence]
    .sort((a, b) => timestampMs((b as SupplierRecord & { updatedAt?: string; createdAt?: string }).updatedAt ?? (b as SupplierRecord & { createdAt?: string }).createdAt) - timestampMs((a as SupplierRecord & { updatedAt?: string; createdAt?: string }).updatedAt ?? (a as SupplierRecord & { createdAt?: string }).createdAt))
    .slice(0, 5), [commitments, evidence]);

  return (
    <div className="space-y-8" data-testid="supplier-dashboard">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <Badge variant="secondary" className="w-fit rounded-full uppercase tracking-widest">Supplier workspace</Badge>
              <CardTitle className="font-heading text-3xl md:text-5xl font-black tracking-[-0.055em] flex items-center gap-3">
                <Factory className="h-8 w-8 text-primary" /> Supply Chain Dashboard
              </CardTitle>
              <CardDescription className="max-w-3xl text-base leading-relaxed">
                Quote response, product-data, lead-time, delivery-note, warranty, manual, and certificate tools for supplier-scoped delivery. Supplier actions remain procurement/evidence scoped.
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit rounded-full capitalize">{user.professionalLabel || 'Supplier'}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <Metric label="Open packages" value={stats.available} icon={<PackageOpen className="h-5 w-5" />} loading={loading} />
          <Metric label="Quotes" value={stats.quotes} icon={<ClipboardList className="h-5 w-5" />} />
          <Metric label="Delivery notes" value={stats.deliveryNotes} icon={<Truck className="h-5 w-5" />} />
          <Metric label="Close-out docs" value={stats.closeoutDocs} icon={<FileCheck2 className="h-5 w-5" />} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
        <Card className="rounded-2xl border-border bg-card/95 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-xl flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Supplier authority boundary</CardTitle>
            <CardDescription>Suppliers can provide evidence and respond to procurement requests, but cannot issue subcontract orders, accept their own deliveries, or release payments.</CardDescription>
          </CardHeader>
        </Card>
        <Card className="rounded-2xl border-border bg-card/95 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-xl">Recent supplier records</CardTitle>
            <CardDescription>{recentRecords.length ? 'Latest quote/evidence records for this supplier.' : 'No supplier records found yet.'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentRecords.map((record) => (
              <div key={record.id} className="rounded-xl border border-border bg-background/70 p-3 text-sm">
                <p className="font-bold text-foreground">{record.title}</p>
                <p className="text-xs text-muted-foreground capitalize">{record.type.replaceAll('_', ' ')}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <PackageProcurementWorkspace user={user} mode="procurement" />
    </div>
  );
}

function Metric({ label, value, icon, loading = false }: { label: string; value: number; icon: React.ReactNode; loading?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-background/70 p-4 shadow-sm">
      <div className="flex items-center justify-between text-primary">{icon}<Badge variant="outline" className="rounded-full">live</Badge></div>
      <p className="mt-4 text-3xl font-heading font-black tracking-[-0.05em]">{loading ? '…' : value}</p>
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
    </div>
  );
}
