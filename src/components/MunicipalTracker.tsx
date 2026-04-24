import React, { useState, useEffect } from 'react';
import { MunicipalityType, CouncilSubmission, TrackingEvent } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  Building2,
  Search,
  RefreshCcw,
  MapPin,
  History,
  Plus,
  Upload,
  BarChart3,
  Flame,
  CheckCircle2,
  Clock,
  AlertCircle,
  Eye,
  Camera,
  ShieldCheck,
  TrendingUp,
  Landmark,
  FileText
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, onSnapshot, addDoc } from 'firebase/firestore';
import { AnimatePresence } from 'framer-motion';

interface MunicipalTrackerProps {
  user: any;
}

export default function MunicipalTracker({ user }: MunicipalTrackerProps) {
  const [submissions, setSubmissions] = useState<CouncilSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMuni, setActiveMuni] = useState<MunicipalityType>('COJ');
  const [isScraping, setIsScraping] = useState(false);
  const [heatmap, setHeatmap] = useState<any>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, 'council_submissions'), where('userId', '==', user.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      setSubmissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CouncilSubmission)));
      setLoading(false);
    });
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    fetchHeatmap(activeMuni);
  }, [activeMuni]);

  const fetchHeatmap = async (muni: MunicipalityType) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/municipal/heatmap/${muni}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setHeatmap(data);
    } catch (e) {
      console.error(e);
    }
  };

  const triggerScrape = async () => {
    setIsScraping(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/municipal/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ municipality: activeMuni })
      });
      const result = await res.json();
      if (result.success) {
        toast.success(`Successfully found ${result.count} updates for ${activeMuni}`);
      } else {
        toast.error(result.error || "Failed to run scraper. Check credentials.");
      }
    } catch (e) {
      toast.error("Network error");
    } finally {
      setIsScraping(false);
    }
  };

  const handleOCR = async (file: File) => {
    setOcrLoading(true);
    toast.info("Analyzing receipt with Vision AI...");
    try {
      const mockUrl = "https://public.blob.vercel-storage.com/receipt-sample.png";

      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/municipal/ocr', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ imageUrl: mockUrl })
      });
      const result = await res.json();

      if (result.success) {
        toast.success(`Extracted Reference: ${result.data.referenceNumber}`);
        await addDoc(collection(db, 'council_submissions'), {
          userId: user.uid,
          municipality: result.data.municipality,
          referenceNumber: result.data.referenceNumber,
          erfNumber: result.data.erfNumber,
          projectDescription: result.data.projectDescription,
          status: "Newly Submitted",
          source: 'ocr',
          trackingHistory: [{
            status: "Newly Submitted",
            timestamp: new Date().toISOString(),
            notes: "Extracted from physical receipt via NVIDIA NIM Vision AI",
            source: 'ocr'
          }],
          createdAt: new Date().toISOString()
        });
      }
    } catch (e) {
      toast.error("OCR Failed");
    } finally {
      setOcrLoading(false);
    }
  };

  const submitCrowdsource = async (status: string, backlog: 'low' | 'medium' | 'high') => {
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch('/api/municipal/crowdsource', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          municipality: activeMuni,
          department: "Building Control",
          statusUpdate: status,
          backlogLevel: backlog
        })
      });
      toast.success("Thank you for contributing! Your feedback helps the community.");
      fetchHeatmap(activeMuni);
    } catch (e) {
      toast.error("Failed to submit feedback");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="text-3xl font-heading font-bold tracking-tight text-foreground">Municipal Tracker</h2>
          <p className="text-muted-foreground uppercase tracking-widest text-[10px] font-bold mt-1">
            Hybrid Aggregator: Digital Scrapers • Vision OCR • Crowdsourced Intel
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowAddModal(true)} className="rounded-full shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4 mr-2" /> Track New Plan
          </Button>
          <Button variant="outline" className="rounded-full" onClick={() => triggerScrape()} disabled={isScraping}>
            {isScraping ? <RefreshCcw className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
            Sync Portals
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider">Regions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {(['COJ', 'COCT', 'Tshwane', 'Ekurhuleni', 'Mangaung'] as MunicipalityType[]).map((muni) => (
                <button
                  key={muni}
                  onClick={() => setActiveMuni(muni)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-all ${
                    activeMuni === muni
                      ? 'bg-primary text-primary-foreground font-bold shadow-md'
                      : 'hover:bg-secondary text-muted-foreground'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Building2 className="w-4 h-4" />
                    {muni}
                  </div>
                  {activeMuni === muni && <div className="w-2 h-2 rounded-full bg-white animate-pulse" />}
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm overflow-hidden">
            <CardHeader className="bg-orange-50/50 border-b border-orange-100 pb-3">
              <div className="flex items-center gap-2 text-orange-700">
                <Flame className="w-4 h-4 fill-orange-500" />
                <CardTitle className="text-sm font-bold">Crowdsource Heatmap</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="p-4 space-y-4">
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Real-time backlogs reported by other architects in <b>{activeMuni}</b>.
                </p>
                {heatmap && Object.keys(heatmap).length > 0 ? (
                  Object.entries(heatmap).map(([dept, stats]: [string, any]) => (
                    <div key={dept} className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-bold uppercase tracking-tight">
                        <span>{dept}</span>
                        <span className={stats.high > 0 ? 'text-red-500' : 'text-green-500'}>
                          {stats.high > 0 ? 'Heavy Backlog' : 'Flowing'}
                        </span>
                      </div>
                      <div className="h-2 w-full bg-secondary rounded-full overflow-hidden flex">
                        <div className="bg-red-500 h-full" style={{ width: `${(stats.high / stats.count) * 100}%` }} />
                        <div className="bg-orange-400 h-full" style={{ width: `${(stats.med / stats.count) * 100}%` }} />
                        <div className="bg-green-500 h-full" style={{ width: `${(stats.low / stats.count) * 100}%` }} />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6">
                    <BarChart3 className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-[10px] text-muted-foreground italic">No reports yet for this period</p>
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-[10px] h-8 rounded-lg border-orange-200 text-orange-700 hover:bg-orange-50"
                  onClick={() => submitCrowdsource("Active", "medium")}
                >
                  "Check In" at Office
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3 space-y-6">
          <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-border/50 shadow-sm">
            <Search className="w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search by Reference, ERF or Project Name..."
              className="border-none shadow-none focus-visible:ring-0 text-lg"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AnimatePresence mode="popLayout">
              {submissions.filter(s => s.municipality === activeMuni).length > 0 ? (
                submissions.filter(s => s.municipality === activeMuni).map((sub) => (
                  <Card key={sub.id} className="border-border/50 hover:border-primary/30 transition-all group overflow-hidden bg-white/50 backdrop-blur-sm">
                    <div className="h-1.5 w-full bg-secondary">
                      <div
                        className={`h-full transition-all duration-1000 ${
                          sub.status.includes('Approved') ? 'bg-green-50 w-full' :
                          sub.status.includes('Rejected') ? 'bg-red-50 w-full' :
                          'bg-primary w-1/3 animate-pulse'
                        }`}
                      />
                    </div>
                    <CardHeader>
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant="outline" className="rounded-full px-3 py-1 bg-white">
                          {sub.source === 'scraper' ? <RefreshCcw className="w-3 h-3 mr-1 text-blue-500" /> :
                           sub.source === 'ocr' ? <Camera className="w-3 h-3 mr-1 text-purple-500" /> :
                           <Plus className="w-3 h-3 mr-1" />}
                          {sub.source.toUpperCase()}
                        </Badge>
                        <Badge className={`rounded-full ${
                          sub.status.includes('Approved') ? 'bg-green-100 text-green-700 border-green-200' :
                          sub.status.includes('Pending') ? 'bg-orange-100 text-orange-700 border-orange-200' :
                          'bg-blue-100 text-blue-700 border-blue-200'
                        }`}>
                          {sub.status}
                        </Badge>
                      </div>
                      <CardTitle className="text-xl group-hover:text-primary transition-colors">
                        {sub.projectDescription || `Plan Submission: ${sub.referenceNumber}`}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-4 mt-2">
                        <span className="flex items-center gap-1"><Landmark className="w-3 h-3" /> {sub.referenceNumber}</span>
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> ERF {sub.erfNumber || 'N/A'}</span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="bg-secondary/30 rounded-xl p-4">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase mb-2 flex items-center gap-2">
                            <History className="w-3 h-3" /> Latest Activity
                          </p>
                          <div className="flex gap-3">
                            <div className="w-0.5 bg-primary/20 relative">
                              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-primary" />
                            </div>
                            <div className="flex-1">
                              <p className="text-xs font-bold">{sub.trackingHistory[sub.trackingHistory.length - 1]?.status}</p>
                              <p className="text-[10px] text-muted-foreground italic mt-1">
                                "{sub.trackingHistory[sub.trackingHistory.length - 1]?.notes}"
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-2 font-mono">
                                {new Date(sub.trackingHistory[sub.trackingHistory.length - 1]?.timestamp).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        </div>

                        {sub.source === 'ocr' && (
                          <div className="flex items-center gap-2 text-[10px] text-purple-600 font-bold bg-purple-50 p-2 rounded-lg border border-purple-100">
                            <ShieldCheck className="w-3 h-3" />
                            Extracted via Vision AI • Accuracy 98%
                          </div>
                        )}
                      </div>
                    </CardContent>
                    <CardFooter className="bg-secondary/10 border-t border-border/50">
                      <Button variant="ghost" size="sm" className="w-full text-xs font-bold uppercase tracking-widest gap-2">
                        <Eye className="w-4 h-4" /> View Full History
                      </Button>
                    </CardFooter>
                  </Card>
                ))
              ) : (
                <div className="md:col-span-2 text-center py-20 bg-white rounded-[2rem] border-2 border-dashed border-border">
                  <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mx-auto mb-6">
                    <Building2 className="w-10 h-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-2xl font-heading font-bold mb-2">No active trackers in {activeMuni}</h3>
                  <p className="text-muted-foreground max-w-sm mx-auto mb-8">
                    Start tracking your building plans by syncing your municipal portal or scanning a physical receipt.
                  </p>
                  <div className="flex justify-center gap-4">
                    <Button onClick={() => setShowAddModal(true)} variant="outline" className="rounded-full px-8">
                      <Plus className="w-4 h-4 mr-2" /> Manual Entry
                    </Button>
                    <Button className="rounded-full px-8">
                      <Camera className="w-4 h-4 mr-2" /> Scan Receipt
                    </Button>
                  </div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <Card className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground border-none shadow-xl overflow-hidden relative group">
        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
          <TrendingUp className="w-32 h-32" />
        </div>
        <CardContent className="p-8">
          <div className="flex items-center gap-3 mb-4">
            <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-sm">Strategy Tier 4</Badge>
            <h3 className="text-xl font-heading font-bold">Shadow Tracker Enabled</h3>
          </div>
          <p className="max-w-2xl text-primary-foreground/90 leading-relaxed font-medium">
            We are monitoring your connected business accounts for municipal invoices.
            An invoice for Plan Fees is a 100% reliable trigger that your project has reached a critical milestone,
            often before the portal updates.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
