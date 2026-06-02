import React, { useEffect, useMemo, useState } from 'react';
import { collection, collectionGroup, limit, onSnapshot, query, where } from 'firebase/firestore';
import { Hammer, FileText, MessageSquareWarning, PackageCheck, ShieldCheck, UploadCloud } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { Bid, TenderPackage, UserProfile } from '@/types';
import PackageProcurementWorkspace from './PackageProcurementWorkspace';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

export default function SubcontractorDashboard({ user }: { user: UserProfile }) {
  const [publishedPackages, setPublishedPackages] = useState<TenderPackage[]>([]);
  const [myBids, setMyBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubPackages = onSnapshot(
      query(collection(db, 'tender_packages'), where('status', '==', 'published'), limit(50)),
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
    <div className="space-y-8" data-testid="subcontractor-dashboard">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <Badge variant="secondary" className="w-fit rounded-full uppercase tracking-widest">Subcontractor workspace</Badge>
              <CardTitle className="font-heading text-3xl md:text-5xl font-black tracking-[-0.055em] flex items-center gap-3">
                <Hammer className="h-8 w-8 text-primary" /> Package Delivery Dashboard
              </CardTitle>
              <CardDescription className="max-w-3xl text-base leading-relaxed">
                Package-scoped execution tools for shop drawings, RFIs, samples, payment-claim evidence, snags, and close-out records. This dashboard does not grant whole-project procurement or client approval authority.
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit rounded-full capitalize">{user.professionalLabel || user.role}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <Metric label="Available packages" value={stats.available} icon={<PackageCheck className="h-5 w-5" />} loading={loading} />
          <Metric label="Submitted bids" value={stats.submitted} icon={<FileText className="h-5 w-5" />} />
          <Metric label="Active packages" value={stats.active} icon={<UploadCloud className="h-5 w-5" />} />
          <Metric label="Awarded" value={stats.awarded} icon={<ShieldCheck className="h-5 w-5" />} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <GuidanceCard icon={<FileText />} title="Submit package evidence" description="Upload shop drawings, samples, RFIs, payment-claim backup, and close-out documents through the package workspace." />
        <GuidanceCard icon={<MessageSquareWarning />} title="Raise governed RFIs" description="Keep execution questions linked to package records so client, BEP, and contractor decisions stay auditable." />
        <GuidanceCard icon={<ShieldCheck />} title="Respect approval gates" description="Payment claims, completion, and close-out remain contractor/client/admin reviewed. No self-approval path is exposed." />
      </div>

      <PackageProcurementWorkspace user={user} mode="packages" />
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

function GuidanceCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <Card className="rounded-2xl border-border bg-card/95 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-heading">{icon}{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}
