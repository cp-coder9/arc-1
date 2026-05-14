import React, { useEffect, useMemo, useState } from 'react';
import { Award, Bot, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { Bid, TenderPackage } from '../types';
import { awardBid, getBidsForTender, rejectBid, shortlistBid, subscribeToBids } from '../services/tenderService';
import { compareBids } from '../services/bidComparisonService';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

interface BidEvaluationProps {
  tender: TenderPackage;
}

export default function BidEvaluation({ tender }: BidEvaluationProps) {
  const [bids, setBids] = useState<Bid[]>([]);
  const [report, setReport] = useState(tender.aiComparisonReport ?? '');
  const [isLoading, setIsLoading] = useState(true);
  const [isComparing, setIsComparing] = useState(false);
  const [actionBidId, setActionBidId] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    getBidsForTender(tender.id)
      .then(setBids)
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Failed to load bids'))
      .finally(() => setIsLoading(false));

    return subscribeToBids(tender.id, setBids);
  }, [tender.id]);

  const sortedBids = useMemo(
    () => [...bids].sort((first, second) => (second.aiScore ?? 0) - (first.aiScore ?? 0)),
    [bids]
  );

  const runComparison = async () => {
    if (bids.length === 0) return;
    setIsComparing(true);
    try {
      const result = await compareBids(tender, bids);
      setReport(result.report);
      setBids((current) => current.map((bid) => ({
        ...bid,
        aiScore: result.scores[bid.id] ?? bid.aiScore,
        aiNotes: result.notes[bid.id] ?? bid.aiNotes,
      })));
      toast.success('Bid comparison completed');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to compare bids');
    } finally {
      setIsComparing(false);
    }
  };

  const runBidAction = async (bid: Bid, action: 'shortlist' | 'reject' | 'award') => {
    setActionBidId(bid.id);
    try {
      if (action === 'shortlist') await shortlistBid(tender.id, bid.id);
      if (action === 'reject') await rejectBid(tender.id, bid.id);
      if (action === 'award') await awardBid(tender.id, bid);
      toast.success(action === 'award' ? 'Contract awarded' : 'Bid updated');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to update bid');
    } finally {
      setActionBidId(null);
    }
  };

  return (
    <Card className="border-border bg-white shadow-sm rounded-3xl">
      <CardHeader className="p-6 border-b border-border">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-xl font-heading font-bold">Bid Evaluation</CardTitle>
            <CardDescription>Compare contractor bids for {tender.title}.</CardDescription>
          </div>
          <Button onClick={runComparison} disabled={isComparing || bids.length === 0} className="gap-2 rounded-full">
            {isComparing ? <Loader2 size={16} className="animate-spin" /> : <Bot size={16} />}
            Run AI Comparison
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> Loading bids
          </div>
        ) : sortedBids.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No bids have been submitted for this tender yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contractor</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Timeline</TableHead>
                <TableHead>AI Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedBids.map((bid: Bid) => (
                <TableRow key={bid.id}>
                  <TableCell>
                    <div className="font-medium">{bid.contractorName}</div>
                    <div className="text-xs text-muted-foreground">{bid.qualifications}</div>
                  </TableCell>
                  <TableCell>{formatCurrency(bid.totalAmount)}</TableCell>
                  <TableCell>{bid.proposedTimeline}</TableCell>
                  <TableCell>{bid.aiScore == null ? <Badge variant="outline">Pending</Badge> : <Badge>{bid.aiScore}/100</Badge>}</TableCell>
                  <TableCell><Badge variant="secondary">{bid.status}</Badge></TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" disabled={actionBidId === bid.id} onClick={() => runBidAction(bid, 'shortlist')}><CheckCircle2 size={14} /></Button>
                      <Button size="sm" variant="outline" disabled={actionBidId === bid.id} onClick={() => runBidAction(bid, 'reject')}><XCircle size={14} /></Button>
                      <Button size="sm" disabled={actionBidId === bid.id} onClick={() => runBidAction(bid, 'award')}><Award size={14} /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {report && (
          <section className="rounded-2xl border border-border bg-secondary/20 p-5">
            <h3 className="mb-3 font-heading font-bold">AI Comparison Report</h3>
            <div className="prose prose-sm max-w-none text-foreground">
              <ReactMarkdown>{report}</ReactMarkdown>
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value);
}
