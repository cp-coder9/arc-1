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
export default function ContractorDashboard({ user }: { user: UserProfile }) {
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
    <div className="space-y-12">
      <div className="dashboard-header flex flex-col lg:flex-row lg:items-end justify-between gap-8" style={{ borderTopColor: '#2f72a7' }}>
        <div className="flex-1">
          <div className="flex items-center gap-4 mb-2">
            <div className="h-14 w-14 rounded-3xl bg-primary/10 text-primary flex items-center justify-center shadow-sm">
              <HardHat className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-3xl md:text-5xl font-heading font-black tracking-[-0.055em] text-foreground">Contractor Portal</h1>
              <p className="text-muted-foreground text-base md:text-lg max-w-2xl mt-2 leading-relaxed">Tender opportunities, construction readiness, and delivery workspace access.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 mt-5">
            <Badge variant="outline" className="rounded-full px-4 py-1.5 bg-primary/5 text-primary border-primary/10 font-bold uppercase tracking-widest text-[10px]">
              {user.professionalLabel || 'Contractor'}
            </Badge>
            {user.cidbGrading && <Badge variant="outline" className="rounded-full px-4 py-1.5 bg-accent/10 text-primary border-accent/20 font-bold uppercase tracking-widest text-[10px]">CIDB {user.cidbGrading}</Badge>}
            {user.region && <Badge variant="outline" className="rounded-full px-4 py-1.5 bg-secondary/50 text-muted-foreground border-border font-bold uppercase tracking-widest text-[10px]">{user.region}</Badge>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard label="Open Tenders" value={stats.openTenders} icon={<FileText size={20} />} />
        <StatCard label="Active Bids" value={stats.activeBids} icon={<TrendingUp size={20} />} tone="accent" />
        <StatCard label="Awarded" value={stats.awarded} icon={<CheckCircle2 size={20} />} tone="success" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
        <Card className="beos-section-card">
          <CardHeader className="p-8 border-b border-border bg-primary/5">
            <CardTitle className="font-heading text-2xl flex items-center gap-2"><Search className="text-primary" /> Tender Marketplace</CardTitle>
            <CardDescription>Published tender packages available to eligible contractors.</CardDescription>
          </CardHeader>
          <CardContent className="p-8 space-y-4">
            {publishedTenders.map((tender) => (
              <div key={tender.id} className="beos-record-card p-5">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div>
                    <Badge variant="secondary" className="uppercase text-[10px] tracking-widest mb-3">{tender.status}</Badge>
                    <h3 className="font-heading font-bold text-xl">{tender.title}</h3>
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{tender.description}</p>
                  </div>
                  <div className="text-left md:text-right shrink-0">
                    <p className="text-lg font-mono font-bold text-primary">{tender.estimatedBudget ? `R ${tender.estimatedBudget.toLocaleString()}` : 'Budget TBC'}</p>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-1 md:justify-end"><Clock size={12} /> {formatDeadline(tender.deadline)}</p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
                  {tender.requiredDisciplines?.slice(0, 4).map((discipline) => <Badge key={discipline} variant="outline" className="text-[10px] uppercase tracking-widest">{discipline}</Badge>)}
                  <Button size="sm" className="ml-auto rounded-full font-bold" onClick={() => setShowBidCalculator(true)}>Prepare Bid</Button>
                </div>
              </div>
            ))}
            {publishedTenders.length === 0 && (
              <div className="empty-state py-20 px-6">
                <Briefcase className="w-10 h-10 mx-auto mb-4 text-primary" />
                <p className="text-muted-foreground italic">{loading ? 'Loading tender opportunities...' : 'No published tenders are currently available.'}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {showBidCalculator && (
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Bid Calculator</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowBidCalculator(false)}>Close</Button>
                </div>
              </CardHeader>
              <CardContent>
                <ContractorBidCalculatorPanel
                  user={user}
                  onBidLinesReady={(lines) => {
                    setShowBidCalculator(false);
                    setShowBidSubmission(true);
                  }}
                />
              </CardContent>
            </Card>
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

        <div className="space-y-6">
          <Card className="beos-section-card">
            <CardHeader className="bg-primary text-primary-foreground p-8">
              <CardTitle className="font-heading text-2xl flex items-center gap-2"><Building2 /> Firm-ready</CardTitle>
              <CardDescription className="text-primary-foreground/75">Contractor accounts can be linked into firm workspaces for team delivery in future phases.</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">Phase 1 enables contractor identity, tender eligibility, and secure firm membership foundations without changing project access semantics.</p>
              <Badge variant="outline" className="rounded-full px-4 py-1.5 bg-primary/5 text-primary border-primary/10 font-bold uppercase tracking-widest text-[10px]">
                Explicit project access required
              </Badge>
            </CardContent>
          </Card>

          <Card className="beos-section-card">
            <CardHeader className="p-6 border-b border-border bg-secondary/30">
              <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2"><ShieldCheck size={16} /> Compliance readiness</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-3 text-sm text-muted-foreground">
              <p>Keep CIDB, NHBRC, insurance, regional coverage, and trade credentials up to date for better tender matching.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, tone = 'default' }: { label: string; value: string | number; icon: React.ReactNode; tone?: 'default' | 'accent' | 'success' }) {
  const toneClass = {
    default: 'bg-primary/10 text-primary',
    accent: 'bg-accent/10 text-primary',
    success: 'bg-primary-light/10 text-primary-light',
  }[tone];

  return (
    <Card className="beos-stat-card">
      <CardContent className="p-8 flex items-center gap-6">
        <div className={`p-4 rounded-2xl ${toneClass}`}>{icon}</div>
        <div>
          <p className="beos-label-caps text-muted-foreground mb-1">{label}</p>
          <p className="beos-metric">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
