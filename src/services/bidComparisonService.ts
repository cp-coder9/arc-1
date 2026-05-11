import { doc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Agent, Bid, TenderPackage } from '@/types';
import { callGeminiProxy, callOpenAICompatible, getLLMConfig, withRetry } from '@/services/geminiService';

const TENDERS_COL = 'tender_packages';

export interface BidScore {
  bidId: string;
  score: number;
  notes: string;
}

export interface BidComparisonResult {
  report: string;
  scores: BidScore[];
}

function clampScore(score: unknown): number {
  const value = Number(score);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function stripJson(text: string): string {
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match ? match[0] : trimmed;
}

function anonymousBidLabel(index: number): string {
  return `Bidder ${String.fromCharCode(65 + index)}`;
}

function buildBidLabelMap(bids: Bid[]): Map<string, string> {
  return new Map(bids.map((bid, index) => [bid.id, anonymousBidLabel(index)]));
}

export function parseBidComparisonResponse(response: string, bids: Bid[], bidLabels = buildBidLabelMap(bids)): BidComparisonResult {
  const idByLabel = new Map(Array.from(bidLabels.entries()).map(([bidId, label]) => [label, bidId]));
  try {
    const parsed = JSON.parse(stripJson(response)) as { report?: unknown; scores?: unknown };
    const rawScores = Array.isArray(parsed.scores) ? parsed.scores : [];
    return {
      report: typeof parsed.report === 'string' ? parsed.report : response,
      scores: bids.map((bid) => {
        const label = bidLabels.get(bid.id) ?? bid.id;
        const found = rawScores.find((item): item is { bidId?: string; bidderLabel?: string; score?: unknown; notes?: unknown } => {
          if (typeof item !== 'object' || item === null) return false;
          const returnedBidId = 'bidId' in item && typeof item.bidId === 'string' ? item.bidId : undefined;
          const returnedLabel = 'bidderLabel' in item && typeof item.bidderLabel === 'string' ? item.bidderLabel : undefined;
          return returnedLabel === label || returnedBidId === label || (returnedBidId != null && idByLabel.get(returnedBidId) === bid.id) || returnedBidId === bid.id;
        });
        return {
          bidId: bid.id,
          score: clampScore(found?.score),
          notes: typeof found?.notes === 'string' ? found.notes : 'No AI note returned for this bid.',
        };
      }),
    };
  } catch {
    return {
      report: response,
      scores: bids.map((bid) => ({ bidId: bid.id, score: 0, notes: 'AI response was not structured; review report manually.' })),
    };
  }
}

function buildPrompt(tender: TenderPackage, bids: Bid[]): string {
  const bidLabels = buildBidLabelMap(bids);
  const sanitizedTender = {
    title: tender.title,
    description: tender.description,
    scope: tender.scope,
    deadline: tender.deadline,
    estimatedBudget: tender.estimatedBudget,
    requiredDisciplines: tender.requiredDisciplines,
    requiredCertifications: tender.requiredCertifications ?? [],
    status: tender.status,
  };
  const sanitizedBids = bids.map((bid) => ({
    bidderLabel: bidLabels.get(bid.id),
    totalAmount: bid.totalAmount,
    lineItems: bid.lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
    })),
    proposedTimeline: bid.proposedTimeline,
    proposedStartDate: bid.proposedStartDate,
    methodology: bid.methodology,
    qualifications: bid.qualifications,
    status: bid.status,
  }));

  return `Compare these anonymized contractor bids for a South African architectural tender. Assess total cost vs budget, line-item completeness, timeline feasibility, qualifications, methodology, risk, and value for money. Do not infer contractor identity. Return JSON only with shape {"report":"markdown report","scores":[{"bidderLabel":"Bidder A","score":0-100,"notes":"short notes"}]}.

Tender:\n${JSON.stringify(sanitizedTender, null, 2)}

Bids:\n${JSON.stringify(sanitizedBids, null, 2)}`;
}

export async function compareBids(tender: TenderPackage, bids: Bid[]): Promise<BidComparisonResult> {
  if (bids.length === 0) throw new Error('At least one bid is required for comparison');

  const config = await getLLMConfig();
  const systemInstruction = 'You are a procurement analyst for South African built-environment projects. Provide advisory tender comparisons only; do not make binding award decisions. Return valid JSON only.';
  const bidLabels = buildBidLabelMap(bids);
  const prompt = buildPrompt(tender, bids);
  const agent: Agent = {
    id: 'tender_comparison',
    name: 'Tender Bid Comparison Agent',
    role: 'tender_comparison',
    description: 'Compares contractor bids for cost, time, risk, and value.',
    systemPrompt: systemInstruction,
    temperature: 0.2,
    status: 'online',
    lastActive: new Date().toISOString(),
  };

  const raw = await withRetry(() => config.provider === 'gemini'
    ? callGeminiProxy(systemInstruction, prompt, undefined, config, agent)
    : callOpenAICompatible(config, systemInstruction, prompt, undefined, agent));
  const result = parseBidComparisonResponse(raw, bids, bidLabels);
  const timestamp = new Date().toISOString();

  const batch = writeBatch(db);
  result.scores.forEach((score) => {
    batch.update(doc(db, TENDERS_COL, tender.id, 'bids', score.bidId), {
      aiScore: score.score,
      aiNotes: score.notes,
      updatedAt: timestamp,
    });
  });
  batch.update(doc(db, TENDERS_COL, tender.id), {
    status: tender.status === 'published' || tender.status === 'closed' ? 'evaluating' : tender.status,
    aiComparisonReport: result.report,
    updatedAt: timestamp,
  });
  await batch.commit();

  return result;
}

export const bidComparisonService = { compareBids, parseBidComparisonResponse };
export default bidComparisonService;
