import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Bid, TenderPackage } from '../types';

export interface BidComparisonResult {
  report: string;
  scores: Record<string, number>;
  notes: Record<string, string>;
}

export async function compareBids(tender: TenderPackage, bids: Bid[]): Promise<BidComparisonResult> {
  const sortedBids = [...bids].sort((first, second) => first.totalAmount - second.totalAmount);
  const scores = Object.fromEntries(
    sortedBids.map((bid, index) => [bid.id, Math.max(50, 95 - index * 10)])
  );
  const notes = Object.fromEntries(
    sortedBids.map((bid) => [bid.id, `${bid.contractorName} submitted ${formatCurrency(bid.totalAmount)} over ${bid.proposedTimeline}.`])
  );
  const report = buildReport(tender, sortedBids, scores);

  await Promise.all(
    sortedBids.map((bid) => updateDoc(doc(db, 'tender_packages', tender.id, 'bids', bid.id), {
      aiScore: scores[bid.id],
      aiNotes: notes[bid.id],
      updatedAt: new Date().toISOString(),
    }))
  );
  await updateDoc(doc(db, 'tender_packages', tender.id), {
    status: 'evaluating',
    aiComparisonReport: report,
    updatedAt: new Date().toISOString(),
  });

  return { report, scores, notes };
}

function buildReport(tender: TenderPackage, bids: Bid[], scores: Record<string, number>): string {
  const budgetLine = tender.estimatedBudget ? ` against an estimated budget of ${formatCurrency(tender.estimatedBudget)}` : '';
  const rows = bids.map((bid) => `| ${bid.contractorName} | ${formatCurrency(bid.totalAmount)} | ${bid.proposedTimeline} | ${scores[bid.id]} |`).join('\n');

  return [
    `## Bid Comparison: ${tender.title}`,
    '',
    `Reviewed ${bids.length} bid${bids.length === 1 ? '' : 's'}${budgetLine}.`,
    '',
    '| Contractor | Amount | Timeline | Score |',
    '|---|---:|---|---:|',
    rows,
    '',
    'Scores are decision-support indicators and should be confirmed by professional review before award.',
  ].join('\n');
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value);
}
