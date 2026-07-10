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

// ─── Glass system & design components ────────────────────────────────────────
import { RoleAwareSidebar } from '@/components/navigation/RoleAwareSidebar';
import { MobileMenuTrigger } from '@/components/navigation/MobileMenuTrigger';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { GlassButton } from '@/components/ui/GlassButton';
import { StatCardAnimated } from '@/components/animated/StatCardAnimated';
import { DashboardSection } from '@/components/composite/DashboardSection';
import { GlassTable } from '@/components/composite/GlassTable';
import { useReducedMotion } from '@/hooks/useReducedMotion';
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
  const prefersReducedMotion = useReducedMotion() ?? false;
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
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden" data-testid="supplier-dashboard">
      <main className="md:ml-64 p-4 md:p-6 space-y-6" id="main-content">
        {/* ── Page header ────────────────────────────────────────────────── */}
        <header className="glass-panel rounded-2xl p-5 md:p-6">
          <div className="flex items-start gap-3">
            <MobileMenuTrigger user={user} className="mt-1 shrink-0" />
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  <Factory className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <Badge variant="secondary" className="w-fit rounded-full uppercase tracking-widest text-[10px] mb-1">Supplier workspace</Badge>
                  <h1 className="text-2xl md:text-3xl font-heading font-bold text-foreground tracking-tight">Supply Chain Dashboard</h1>
                </div>
              </div>
              <p className="text-sm text-foreground-muted mt-2 max-w-2xl leading-relaxed">
                Quote response, product-data, lead-time, delivery-note, warranty, manual, and certificate tools for supplier-scoped delivery.
              </p>
              <Breadcrumbs className="mt-2" />
            </div>
          </div>
        </header>

        {/* ── Stats ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCardAnimated label="Open packages" value={stats.available} icon={<PackageOpen size={20} aria-hidden="true" />} delay={prefersReducedMotion ? 0 : 0 * 0.05} prefersReducedMotion={prefersReducedMotion} />
          <StatCardAnimated label="Quotes" value={stats.quotes} icon={<ClipboardList size={20} aria-hidden="true" />} delay={prefersReducedMotion ? 0 : 1 * 0.05} prefersReducedMotion={prefersReducedMotion} />
          <StatCardAnimated label="Delivery notes" value={stats.deliveryNotes} icon={<Truck size={20} aria-hidden="true" />} delay={prefersReducedMotion ? 0 : 2 * 0.05} prefersReducedMotion={prefersReducedMotion} />
          <StatCardAnimated label="Close-out docs" value={stats.closeoutDocs} icon={<FileCheck2 size={20} aria-hidden="true" />} delay={prefersReducedMotion ? 0 : 3 * 0.05} prefersReducedMotion={prefersReducedMotion} />
        </div>

        {/* ── Info + Recent records ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
          <DashboardSection title="Supplier authority boundary" icon={<ShieldCheck size={18} aria-hidden="true" />}>
            <p className="text-sm text-foreground-muted leading-relaxed">Suppliers can provide evidence and respond to procurement requests, but cannot issue subcontract orders, accept their own deliveries, or release payments.</p>
          </DashboardSection>

          <DashboardSection title="Recent supplier records">
            <div className="space-y-2">
              {recentRecords.length === 0 && <p className="text-sm text-foreground-muted italic">No supplier records found yet.</p>}
              {recentRecords.map((record) => (
                <div key={record.id} className="glass-record rounded-xl p-3 text-sm">
                  <p className="font-bold text-foreground">{record.title}</p>
                  <p className="text-xs text-foreground-muted capitalize">{record.type.replaceAll('_', ' ')}</p>
                </div>
              ))}
            </div>
          </DashboardSection>
        </div>

        {/* ── Workspace ──────────────────────────────────────────────────── */}
        <PackageProcurementWorkspace user={user} mode="procurement" />
      </main>
    </div>
  );
}



