import type { BomTradePackage, TenderBidder, TenderPackage } from './types';
import { getProject } from './bomBuilderService';

// ── Policy Configuration ────────────────────────────────────────────────────

export interface TenderEvaluationPolicy {
  priceWeight: number;     // default 90
  bbbeeWeight: number;     // default 10
  sector: 'public' | 'private';
  customCriteria?: Array<{ name: string; weight: number }>;
}

export const DEFAULT_EVALUATION_POLICY: TenderEvaluationPolicy = {
  priceWeight: 90,
  bbbeeWeight: 10,
  sector: 'public',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

let seq = 0;
function uid(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}`;
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

// ── Public API ──────────────────────────────────────────────────────────────

export function generatePackages(projectId: string): TenderPackage[] {
  const project = getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  // Group approved items by trade package
  const approvedItems = project.lineItems.filter(
    (i) => i.status === 'approved' || i.status === 'edited',
  );

  const tradeGroups = new Map<BomTradePackage, string[]>();
  for (const item of approvedItems) {
    const existing = tradeGroups.get(item.tradePackage) ?? [];
    existing.push(item.id);
    tradeGroups.set(item.tradePackage, existing);
  }

  const packages: TenderPackage[] = [];
  let pkgIndex = 1;
  for (const [trade, itemIds] of tradeGroups) {
    const value = money(
      approvedItems
        .filter((i) => itemIds.includes(i.id))
        .reduce((sum, i) => sum + i.total, 0),
    );

    const pkg: TenderPackage = {
      id: uid('pkg'),
      code: `TP-${String(pkgIndex).padStart(2, '0')}`,
      name: `${trade.charAt(0).toUpperCase() + trade.slice(1).replace('-', ' & ')} Package`,
      tradePackage: trade,
      lineItemIds: itemIds,
      itemCount: itemIds.length,
      value,
      qsCertified: !!project.qsSignOff,
      status: 'draft',
      bidders: [],
    };
    packages.push(pkg);
    pkgIndex += 1;
  }

  project.tenderPackages = packages;
  return packages;
}

export function addBidder(
  projectId: string,
  packageId: string,
  companyName: string,
  bbbeeLevel: number = 4,
): TenderBidder {
  const project = getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const pkg = project.tenderPackages.find((p) => p.id === packageId);
  if (!pkg) throw new Error(`Package ${packageId} not found`);

  const bidder: TenderBidder = {
    id: uid('bidder'),
    companyName,
    bbbeeLevel,
    invited: false,
    responded: false,
  };
  pkg.bidders.push(bidder);
  return bidder;
}

export function removeBidder(projectId: string, packageId: string, bidderId: string): void {
  const project = getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const pkg = project.tenderPackages.find((p) => p.id === packageId);
  if (!pkg) throw new Error(`Package ${packageId} not found`);

  const idx = pkg.bidders.findIndex((b) => b.id === bidderId);
  if (idx === -1) throw new Error(`Bidder ${bidderId} not found`);

  pkg.bidders.splice(idx, 1);
}

export function issueToTenderers(projectId: string, packageId: string): TenderPackage {
  const project = getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const pkg = project.tenderPackages.find((p) => p.id === packageId);
  if (!pkg) throw new Error(`Package ${packageId} not found`);

  if (!project.qsSignOff) {
    throw new Error('Cannot issue tender: QS sign-off has not been completed');
  }

  if (pkg.bidders.length === 0) {
    throw new Error('Cannot issue: no bidders added to package');
  }

  pkg.status = 'issued';
  pkg.bidders.forEach((b) => {
    b.invited = true;
  });

  // Set return date to 14 days from now
  const returnDate = new Date();
  returnDate.setDate(returnDate.getDate() + 14);
  pkg.returnDate = returnDate.toISOString();

  return pkg;
}

export function recordBidReturn(
  projectId: string,
  packageId: string,
  bidderId: string,
  amount: number,
): TenderBidder {
  const project = getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const pkg = project.tenderPackages.find((p) => p.id === packageId);
  if (!pkg) throw new Error(`Package ${packageId} not found`);

  const bidder = pkg.bidders.find((b) => b.id === bidderId);
  if (!bidder) throw new Error(`Bidder ${bidderId} not found`);

  bidder.responded = true;
  bidder.bidAmount = amount;

  // Check if all have responded
  const allResponded = pkg.bidders.every((b) => b.responded);
  if (allResponded) {
    pkg.status = 'returned';
  }

  return bidder;
}

export interface BidEvaluation {
  packageId: string;
  evaluations: Array<{
    bidderId: string;
    companyName: string;
    bidAmount: number;
    bbbeeLevel: number;
    priceScore: number;
    bbbeeScore: number;
    totalScore: number;
    rank: number;
  }>;
  recommendedBidderId: string;
}

export function evaluateBids(projectId: string, packageId: string, policy: TenderEvaluationPolicy = DEFAULT_EVALUATION_POLICY): BidEvaluation {
  const project = getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const pkg = project.tenderPackages.find((p) => p.id === packageId);
  if (!pkg) throw new Error(`Package ${packageId} not found`);

  const respondedBidders = pkg.bidders.filter((b) => b.responded && b.bidAmount !== undefined);
  if (respondedBidders.length === 0) {
    throw new Error('No bid returns to evaluate');
  }

  // Price/B-BBEE scoring using configurable policy weights
  const lowestBid = Math.min(...respondedBidders.map((b) => b.bidAmount!));

  const evaluations = respondedBidders.map((bidder) => {
    const priceScore = money((lowestBid / bidder.bidAmount!) * policy.priceWeight);
    // B-BBEE: Level 1 = max points, descending
    const bbbeeScore = Math.max(0, money((9 - bidder.bbbeeLevel + 1) * (policy.bbbeeWeight / 9)));
    const totalScore = money(priceScore + bbbeeScore);

    return {
      bidderId: bidder.id,
      companyName: bidder.companyName,
      bidAmount: bidder.bidAmount!,
      bbbeeLevel: bidder.bbbeeLevel,
      priceScore,
      bbbeeScore,
      totalScore,
      rank: 0, // filled after sort
    };
  });

  // Sort by total score descending
  evaluations.sort((a, b) => b.totalScore - a.totalScore);
  evaluations.forEach((e, i) => {
    e.rank = i + 1;
  });

  return {
    packageId,
    evaluations,
    recommendedBidderId: evaluations[0].bidderId,
  };
}

// ── Testing utility ─────────────────────────────────────────────────────────

export function _resetSeq(): void {
  seq = 0;
}
