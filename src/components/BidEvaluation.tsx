import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { Award, Sparkles } from 'lucide-react';
import type { Bid, TenderPackage } from '@/types';
import { awardBid, closeTender, rejectBid, shortlistBid, subscribeToBids } from '@/services/tenderService';
import { compareBids } from '@/services/bidComparisonService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function BidEvaluation({ tender }: { tender: TenderPackage }) {
  const [bids, setBids] = useState<Bid[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => subscribeToBids(tender.id, setBids), [tender.id]);

  const runComparison = async () => {
    setRunning(true);
    try {
      await compareBids(tender, bids);
      toast.success('AI comparison completed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI comparison failed');
    } finally {
      setRunning(false);
    }
  };

  const handleAward = async (bidId: string) => {
    try { await awardBid(tender.id, bidId); toast.success('Contract awarded'); } catch (error) { toast.error(error instanceof Error ? error.message : 'Award failed'); }
  };

  return <Card className="rounded-[2rem] border-border bg-white shadow-sm"><CardHeader><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><CardTitle>{tender.title}</CardTitle><CardDescription>{bids.length} bid(s) received · Status {tender.status}</CardDescription></div><div className="flex gap-2"><Button variant="outline" onClick={() => closeTender(tender.id)} disabled={tender.status !== 'published'}>Close Tender</Button><Button onClick={runComparison} disabled={running || bids.length === 0}><Sparkles className="mr-2 h-4 w-4" />Run AI Comparison</Button></div></div></CardHeader><CardContent className="space-y-6"><div className="rounded-2xl border border-border overflow-hidden"><Table><TableHeader><TableRow><TableHead>Contractor</TableHead><TableHead>Total</TableHead><TableHead>Timeline</TableHead><TableHead>Status</TableHead><TableHead>AI</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{bids.map((bid) => <TableRow key={bid.id}><TableCell className="font-bold">{bid.contractorName}</TableCell><TableCell>R {bid.totalAmount.toLocaleString()}</TableCell><TableCell>{bid.proposedTimeline}</TableCell><TableCell><Badge variant="outline">{bid.status}</Badge></TableCell><TableCell>{typeof bid.aiScore === 'number' ? <Badge>{bid.aiScore}/100</Badge> : <span className="text-xs text-muted-foreground">Not scored</span>}<p className="max-w-xs text-xs text-muted-foreground">{bid.aiNotes}</p></TableCell><TableCell className="text-right space-x-2"><Button size="sm" variant="outline" onClick={() => shortlistBid(tender.id, bid.id)} disabled={bid.status === 'awarded'}>Shortlist</Button><Button size="sm" variant="outline" onClick={() => rejectBid(tender.id, bid.id)} disabled={bid.status === 'awarded'}>Reject</Button><Button size="sm" onClick={() => handleAward(bid.id)} disabled={tender.status === 'awarded'}><Award className="mr-1 h-3 w-3" />Award</Button></TableCell></TableRow>)}</TableBody></Table></div>{(tender.aiComparisonReport) && <div className="prose prose-sm max-w-none rounded-3xl border border-border bg-secondary/20 p-6"><ReactMarkdown>{tender.aiComparisonReport}</ReactMarkdown></div>}</CardContent></Card>;
}

export default BidEvaluation;
