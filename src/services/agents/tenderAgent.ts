import { Bid, TenderPackage } from '@/types';
import { BidComparisonResult, compareBids } from '../bidComparisonService';

export interface TenderRiskFlag { bidId: string; severity: 'low' | 'medium' | 'high'; message: string; }
export interface TenderAgentAnalysis extends BidComparisonResult { riskFlags: TenderRiskFlag[]; contractClauseSuggestions: string[]; boqVerification: { missingScopeItems: string[]; matchedScopeItems: string[]; }; }

export async function analyzeTenderBids(tender: TenderPackage, bids: Bid[]): Promise<TenderAgentAnalysis> {
  const comparison = await compareBids(tender, bids);
  const average = bids.reduce((sum, bid) => sum + bid.totalAmount, 0) / Math.max(1, bids.length);
  const riskFlags: TenderRiskFlag[] = [];
  bids.forEach((bid) => {
    if (average && bid.totalAmount < average * 0.75) riskFlags.push({ bidId: bid.id, severity: 'high', message: 'Bid is more than 25% below tender average; verify scope inclusions and pricing assumptions.' });
    if (!bid.qualifications?.trim()) riskFlags.push({ bidId: bid.id, severity: 'medium', message: 'Qualifications are missing or unclear.' });
    if (!bid.methodology?.trim()) riskFlags.push({ bidId: bid.id, severity: 'medium', message: 'Construction methodology is missing or unclear.' });
    if (!bid.lineItems?.length) riskFlags.push({ bidId: bid.id, severity: 'high', message: 'No BOQ line items submitted.' });
  });
  const allDescriptions = bids.flatMap((bid) => bid.lineItems.map((item) => item.description.toLowerCase()));
  const missingScopeItems = tender.scope.filter((scopeItem) => !allDescriptions.some((description) => description.includes(scopeItem.toLowerCase())));
  const matchedScopeItems = tender.scope.filter((scopeItem) => !missingScopeItems.includes(scopeItem));
  return {
    ...comparison,
    riskFlags,
    contractClauseSuggestions: ['Define scope exclusions and variation approval process.', 'Link payment milestones to verified deliverables and inspections.', 'Require insurance, health-and-safety, warranty, and defect-liability documentation before award.'],
    boqVerification: { missingScopeItems, matchedScopeItems },
  };
}
