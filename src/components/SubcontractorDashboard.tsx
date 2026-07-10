import React, { useEffect, useMemo, useState } from 'react';
import { collection, collectionGroup, limit, onSnapshot, query, where } from 'firebase/firestore';
import { Hammer, FileText, MessageSquareWarning, PackageCheck, ShieldCheck, UploadCloud } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { Bid, TenderPackage, UserProfile } from '@/types';
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
export default function SubcontractorDashboard({ user }: { user: UserProfile }) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const [publishedPackages, setPublishedPackages] = useState<TenderPackage[]>([]);
  const [myBids, setMyBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubPackages = onSnapshot(
      query(getDemoCol( 'tender_packages'), where('status', '==', 'published'), limit(50)),
      (snapshot) => {
        setPublishedPackages(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as TenderPackage)));
        setLoading(false);
      },
      (error) => {
        console.warn('Subcontractor package projection unavailable:', error);
        setPublishedPackages([]);
        setLoading(false);
      },
    );
    const unsubBids = onSnapshot(
      query(collectionGroup(db, 'bids'), where('contractorId', '==', user.uid), limit(50)),
      (snapshot) => setMyBids(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Bid))),
      (error) => {
        console.warn('Subcontractor bid projection unavailable:', error);
        setMyBids([]);
      },
    );
    return () => {
      unsubPackages();
      unsubBids();
    };
  }, [user.uid]);

  const stats = useMemo(() => ({
    available: publishedPackages.length,
    submitted: myBids.length,
    awarded: myBids.filter((bid) => bid.status === 'awarded').length,
    active: myBids.filter((bid) => ['submitted', 'shortlisted', 'awarded'].includes(bid.status)).length,
  }), [myBids, publishedPackages.length]);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden" data-testid="subcontractor-dashboard">
      <main className="md:ml-64 p-4 md:p-6 space-y-6" id="main-content">
        {/* ── Page header ────────────────────────────────────────────────── */}
        <header className="glass-panel rounded-2xl p-5 md:p-6">
          <div className="flex items-start gap-3">
            <MobileMenuTrigger user={user} className="mt-1 shrink-0" />
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  <Hammer className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <Badge variant="secondary" className="w-fit rounded-full uppercase tracking-widest text-[10px] mb-1">Subcontractor workspace</Badge>
                  <h1 className="text-2xl md:text-3xl font-heading font-bold text-foreground tracking-tight">Package Delivery Dashboard</h1>
                </div>
              </div>
              <p className="text-sm text-foreground-muted mt-2 max-w-2xl leading-relaxed">
                Package-scoped execution tools for shop drawings, RFIs, samples, payment-claim evidence, snags, and close-out records.
              </p>
              <Breadcrumbs className="mt-2" />
            </div>
          </div>
        </header>

        {/* ── Stats ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCardAnimated label="Available packages" value={stats.available} icon={<PackageCheck size={20} aria-hidden="true" />} delay={prefersReducedMotion ? 0 : 0 * 0.05} prefersReducedMotion={prefersReducedMotion} />
          <StatCardAnimated label="Submitted bids" value={stats.submitted} icon={<FileText size={20} aria-hidden="true" />} delay={prefersReducedMotion ? 0 : 1 * 0.05} prefersReducedMotion={prefersReducedMotion} />
          <StatCardAnimated label="Active packages" value={stats.active} icon={<UploadCloud size={20} aria-hidden="true" />} delay={prefersReducedMotion ? 0 : 2 * 0.05} prefersReducedMotion={prefersReducedMotion} />
          <StatCardAnimated label="Awarded" value={stats.awarded} icon={<ShieldCheck size={20} aria-hidden="true" />} delay={prefersReducedMotion ? 0 : 3 * 0.05} prefersReducedMotion={prefersReducedMotion} />
        </div>

        {/* ── Guidance ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="glass-card p-5 rounded-2xl">
            <div className="flex items-center gap-2 mb-2">
              <div className="glass-icon-box p-2 rounded-xl"><FileText size={16} aria-hidden="true" /></div>
              <h3 className="font-heading font-semibold">Submit package evidence</h3>
            </div>
            <p className="text-sm text-foreground-muted">Upload shop drawings, samples, RFIs, payment-claim backup, and close-out documents through the package workspace.</p>
          </div>
          <div className="glass-card p-5 rounded-2xl">
            <div className="flex items-center gap-2 mb-2">
              <div className="glass-icon-box p-2 rounded-xl"><MessageSquareWarning size={16} aria-hidden="true" /></div>
              <h3 className="font-heading font-semibold">Raise governed RFIs</h3>
            </div>
            <p className="text-sm text-foreground-muted">Keep execution questions linked to package records so client, BEP, and contractor decisions stay auditable.</p>
          </div>
          <div className="glass-card p-5 rounded-2xl">
            <div className="flex items-center gap-2 mb-2">
              <div className="glass-icon-box p-2 rounded-xl"><ShieldCheck size={16} aria-hidden="true" /></div>
              <h3 className="font-heading font-semibold">Respect approval gates</h3>
            </div>
            <p className="text-sm text-foreground-muted">Payment claims, completion, and close-out remain contractor/client/admin reviewed. No self-approval path is exposed.</p>
          </div>
        </div>

        {/* ── Workspace ──────────────────────────────────────────────────── */}
        <PackageProcurementWorkspace user={user} mode="packages" />
      </main>
    </div>
  );
}
