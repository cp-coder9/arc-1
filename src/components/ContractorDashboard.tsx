import React, { useEffect, useMemo, useState } from 'react';
import { collection, collectionGroup, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Bid, TenderPackage, UserProfile } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Briefcase, Building2, CheckCircle2, Clock, FileText, HardHat, Search, ShieldCheck, TrendingUp } from 'lucide-react';
import BidSubmission from './BidSubmission';
import ContractorBidCalculatorPanel from './ContractorBidCalculatorPanel';
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
export default function ContractorDashboard({ user }: { user: UserProfile }) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const [publishedTenders, setPublishedTenders] = useState<TenderPackage[]>([]);
  const [myBids, setMyBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBidSubmission, setShowBidSubmission] = useState(false);
  const [showBidCalculator, setShowBidCalculator] = useState(false);

  useEffect(() => {
    const unsubscribeTenders = onSnapshot(
      query(getDemoCol( 'tender_packages'), where('status', '==', 'published')),
      (snapshot) => {
        setPublishedTenders(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as TenderPackage)));
        setLoading(false);
      },
      (error) => {
        console.error('Failed to load contractor tenders:', error);
        setPublishedTenders([]);
        setLoading(false);
      }
    );

    const unsubscribeBids = onSnapshot(
      query(collectionGroup(db, 'bids'), where('contractorId', '==', user.uid)),
      (snapshot) => {
        setMyBids(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Bid)));
      },
      (error) => {
        console.error('Failed to load contractor bids:', error);
        setMyBids([]);
      }
    );

    return () => {
      unsubscribeTenders();
      unsubscribeBids();
    };
  }, [user.uid]);

  const stats = useMemo(() => ({
    openTenders: publishedTenders.length,
    activeBids: myBids.filter((bid) => ['submitted', 'shortlisted'].includes(bid.status)).length,
    awarded: myBids.filter((bid) => bid.status === 'awarded').length,
  }), [myBids, publishedTenders.length]);

  const formatDeadline = (deadline?: string) => {
    if (!deadline) return 'Deadline TBC';
    const parsed = new Date(deadline);
    return Number.isNaN(parsed.getTime()) ? deadline : parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <main className="md:ml-64 p-4 md:p-6 space-y-6" id="main-content">
        {/* ── Page header ────────────────────────────────────────────────── */}
        <header className="glass-panel rounded-2xl p-5 md:p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <MobileMenuTrigger user={user} className="mt-1 shrink-0" />
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                    <HardHat className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h1 className="text-2xl md:text-3xl font-heading font-bold text-foreground tracking-tight">Contractor Portal</h1>
                </div>
                <p className="text-sm text-foreground-muted mt-1 max-w-xl leading-relaxed">Tender opportunities, construction readiness, and delivery workspace access.</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="outline" className="rounded-full px-3 py-1 bg-primary/5 text-primary border-primary/10 font-bold uppercase tracking-widest text-[10px]">
                    {user.professionalLabel || 'Contractor'}
                  </Badge>
                  {user.cidbGrading && <Badge variant="outline" className="rounded-full px-3 py-1 bg-accent/10 text-primary border-accent/20 font-bold uppercase tracking-widest text-[10px]">CIDB {user.cidbGrading}</Badge>}
                  {user.region && <Badge variant="outline" className="rounded-full px-3 py-1 bg-secondary/50 text-muted-foreground border-border font-bold uppercase tracking-widest text-[10px]">{user.region}</Badge>}
                </div>
                <Breadcrumbs className="mt-2" />
              </div>
            </div>
          </div>
        </header>

        {/* ── Stats ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCardAnimated label="Open Tenders" value={stats.openTenders} icon={<FileText size={20} aria-hidden="true" />} delay={prefersReducedMotion ? 0 : 0 * 0.05} prefersReducedMotion={prefersReducedMotion} />
          <StatCardAnimated label="Active Bids" value={stats.activeBids} icon={<TrendingUp size={20} aria-hidden="true" />} delay={prefersReducedMotion ? 0 : 1 * 0.05} prefersReducedMotion={prefersReducedMotion} />
          <StatCardAnimated label="Awarded" value={stats.awarded} icon={<CheckCircle2 size={20} aria-hidden="true" />} delay={prefersReducedMotion ? 0 : 2 * 0.05} prefersReducedMotion={prefersReducedMotion} />
        </div>

        {/* ── Main content ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          <DashboardSection title="Tender Marketplace" description="Published tender packages available to eligible contractors." icon={<Search size={18} aria-hidden="true" />}>
            <div className="space-y-3">
              {publishedTenders.map((tender) => (
                <div key={tender.id} className="glass-record p-5 rounded-2xl">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div>
                      <Badge variant="secondary" className="uppercase text-[10px] tracking-widest mb-2">{tender.status}</Badge>
                      <h3 className="font-heading font-bold text-lg">{tender.title}</h3>
                      <p className="text-sm text-foreground-muted mt-1 line-clamp-2">{tender.description}</p>
                    </div>
                    <div className="text-left md:text-right shrink-0">
                      <p className="text-lg font-mono font-bold text-[var(--landing-accent)]">{tender.estimatedBudget ? `R ${tender.estimatedBudget.toLocaleString()}` : 'Budget TBC'}</p>
                      <p className="text-[10px] uppercase tracking-widest font-bold text-foreground-muted flex items-center gap-1 md:justify-end"><Clock size={12} aria-hidden="true" /> {formatDeadline(tender.deadline)}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-3">
                    {tender.requiredDisciplines?.slice(0, 4).map((discipline) => <Badge key={discipline} variant="outline" className="text-[10px] uppercase tracking-widest">{discipline}</Badge>)}
                    <GlassButton size="sm" variant="solid" className="ml-auto" onClick={() => setShowBidCalculator(true)}>Prepare Bid</GlassButton>
                  </div>
                </div>
              ))}
              {publishedTenders.length === 0 && (
                <div className="text-center py-16 text-foreground-muted">
                  <Briefcase className="w-8 h-8 mx-auto mb-3 opacity-50" aria-hidden="true" />
                  <p className="italic">{loading ? 'Loading tender opportunities...' : 'No published tenders are currently available.'}</p>
                </div>
              )}
            </div>
          </DashboardSection>

          {showBidCalculator && (
            <div className="lg:col-span-2">
              <DashboardSection title="Bid Calculator">
                <ContractorBidCalculatorPanel
                  user={user}
                  onBidLinesReady={() => {
                    setShowBidCalculator(false);
                    setShowBidSubmission(true);
                  }}
                />
                <GlassButton variant="outline" size="sm" onClick={() => setShowBidCalculator(false)} className="mt-4">Close</GlassButton>
              </DashboardSection>
            </div>
          )}

          {showBidSubmission && (
            <div className="lg:col-span-2">
              <BidSubmission
                tenders={publishedTenders}
                contractorId={user.uid}
                contractorName={user.displayName || user.email || 'Contractor'}
                onSubmitted={() => setShowBidSubmission(false)}
              />
            </div>
          )}

          <div className="space-y-4">
            <DashboardSection title="Firm-Ready" icon={<Building2 size={18} aria-hidden="true" />}>
              <p className="text-sm text-foreground-muted leading-relaxed">Contractor accounts can be linked into firm workspaces for team delivery in future phases.</p>
              <Badge variant="outline" className="mt-3 rounded-full px-4 py-1.5 bg-primary/5 text-primary border-primary/10 font-bold uppercase tracking-widest text-[10px]">
                Explicit project access required
              </Badge>
            </DashboardSection>

            <DashboardSection title="Compliance Readiness" icon={<ShieldCheck size={18} aria-hidden="true" />}>
              <p className="text-sm text-foreground-muted leading-relaxed">Keep CIDB, NHBRC, insurance, regional coverage, and trade credentials up to date for better tender matching.</p>
            </DashboardSection>
          </div>
        </div>
      </main>
    </div>
  );
}

