import type { BomProject, QsReviewEntry, QsSignOff, BomTradePackage } from './types';
import { getProject } from './bomBuilderService';

// ── Helpers ─────────────────────────────────────────────────────────────────

let seq = 0;
function uid(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}`;
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function now(): string {
  return new Date().toISOString();
}

// ── Market rate benchmarking ────────────────────────────────────────────────

const marketRateBands: Record<BomTradePackage, { min: number; max: number }> = {
  earthworks: { min: 250, max: 450 },
  concrete: { min: 2100, max: 2900 },
  masonry: { min: 550, max: 850 },
  roofing: { min: 900, max: 1400 },
  'doors-windows': { min: 1500, max: 2400 },
  finishes: { min: 100, max: 220 },
  electrical: { min: 700, max: 1200 },
  plumbing: { min: 650, max: 1100 },
  fire: { min: 950, max: 1500 },
  preliminaries: { min: 1, max: 1 },
  general: { min: 1, max: 1 },
};

// ── Public API ──────────────────────────────────────────────────────────────

export function getMarketRate(material: string, tradePackage: BomTradePackage): { min: number; max: number } {
  // Returns market rate band for the trade package
  // In production, this would query a live pricing database
  return marketRateBands[tradePackage] ?? { min: 1, max: 1 };
}

export function submitForReview(projectId: string): QsReviewEntry[] {
  const project = getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const reviews: QsReviewEntry[] = project.lineItems.map((item) => {
    const band = getMarketRate(item.material, item.tradePackage);
    let variance: QsReviewEntry['variance'] = 'in_range';
    if (item.rate > band.max) variance = 'above';
    else if (item.rate < band.min) variance = 'below';

    return {
      lineItemId: item.id,
      aiRate: item.rate,
      marketRateMin: band.min,
      marketRateMax: band.max,
      variance,
    };
  });

  project.qsReviews = reviews;
  return reviews;
}

export function reviewItem(
  projectId: string,
  lineItemId: string,
  decision: QsReviewEntry['decision'],
  reviewer: string,
  note: string = '',
): QsReviewEntry {
  const project = getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const review = project.qsReviews.find((r) => r.lineItemId === lineItemId);
  if (!review) throw new Error(`Review entry for ${lineItemId} not found. Submit for review first.`);

  review.decision = decision;
  review.reviewer = reviewer;
  review.reviewedAt = now();
  review.note = note;

  // Update the corresponding line item status
  const item = project.lineItems.find((i) => i.id === lineItemId);
  if (item) {
    if (decision === 'approve' || decision === 'batch_approve') {
      item.status = 'approved';
    } else if (decision === 'reject') {
      item.status = 'rejected';
    } else if (decision === 'edit') {
      item.status = 'edited';
    } else if (decision === 'request_info') {
      item.status = 'info_required';
    }
  }

  return review;
}

export function batchApprove(projectId: string, lineItemIds: string[], reviewer: string): QsReviewEntry[] {
  const project = getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const approved: QsReviewEntry[] = [];
  for (const lineItemId of lineItemIds) {
    const review = project.qsReviews.find((r) => r.lineItemId === lineItemId);
    if (!review) continue;

    review.decision = 'batch_approve';
    review.reviewer = reviewer;
    review.reviewedAt = now();

    const item = project.lineItems.find((i) => i.id === lineItemId);
    if (item) item.status = 'approved';

    approved.push(review);
  }

  return approved;
}

export interface SignOffReadiness {
  ready: boolean;
  totalItems: number;
  reviewed: number;
  unreviewed: number;
  unresolvedFlags: number;
  blockers: string[];
}

export function validateSignOffReadiness(projectId: string): SignOffReadiness {
  const project = getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const totalItems = project.lineItems.length;
  const reviewed = project.qsReviews.filter((r) => r.decision).length;
  const unreviewed = totalItems - reviewed;
  const unresolvedFlags = project.lineItems.reduce(
    (count, item) => count + item.flags.filter((f) => !f.resolvedBy).length,
    0,
  );

  const blockers: string[] = [];
  if (totalItems === 0) blockers.push('No line items in project');
  if (unreviewed > 0) blockers.push(`${unreviewed} item(s) not yet reviewed`);
  if (unresolvedFlags > 0) blockers.push(`${unresolvedFlags} unresolved flag(s)`);

  const rejectedItems = project.lineItems.filter((i) => i.status === 'rejected');
  if (rejectedItems.length > 0) blockers.push(`${rejectedItems.length} rejected item(s) need resolution`);

  const infoRequiredItems = project.lineItems.filter((i) => i.status === 'info_required');
  if (infoRequiredItems.length > 0) blockers.push(`${infoRequiredItems.length} item(s) awaiting information`);

  return {
    ready: blockers.length === 0,
    totalItems,
    reviewed,
    unreviewed,
    unresolvedFlags,
    blockers,
  };
}

export function signOff(projectId: string, reviewer: string): QsSignOff {
  const project = getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const readiness = validateSignOffReadiness(projectId);
  if (!readiness.ready) {
    throw new Error(`Cannot sign off: ${readiness.blockers.join('; ')}`);
  }

  const totalValue = money(project.lineItems.reduce((sum, i) => sum + i.total, 0));

  const signOffRecord: QsSignOff = {
    id: uid('qscert'),
    projectId,
    signedBy: reviewer,
    signedAt: now(),
    itemCount: project.lineItems.length,
    totalValue,
    unresolved: 0,
    certificateRef: `QS-CERT-${projectId.slice(-6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
  };

  project.qsSignOff = signOffRecord;
  return signOffRecord;
}

// ── Testing utility ─────────────────────────────────────────────────────────

export function _resetSeq(): void {
  seq = 0;
}
