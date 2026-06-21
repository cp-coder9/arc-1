import type { ExtractedQuantityCandidate, QuantityFlag, ReviewDecision } from './types';
import { id } from './utils';

export class QuantityReviewService {
  flagCandidates(candidates: ExtractedQuantityCandidate[]): QuantityFlag[] {
    const flags: QuantityFlag[] = [];
    for (const c of candidates) {
      if (c.confidence < 0.75) flags.push({ id: id('flag'), candidateId: c.id, severity: 'blocker', reason: `Low extraction confidence (${Math.round(c.confidence * 100)}%)`, suggestedAction: 'QS/contractor to verify measurement and source scale before issue' });
      if (c.assumptions.some((a) => /assumed|not found|confirmation|recommended/i.test(a))) flags.push({ id: id('flag'), candidateId: c.id, severity: 'warning', reason: 'Quantity includes assumption or missing specification', suggestedAction: 'Review specification, drawing note or schedule before tender issue' });
      if (c.unit === 'sum' || c.quantity <= 0) flags.push({ id: id('flag'), candidateId: c.id, severity: 'blocker', reason: 'Unusable unit or zero quantity', suggestedAction: 'Edit quantity/unit manually' });
    }
    return flags;
  }

  applyReview(candidates: ExtractedQuantityCandidate[], decisions: ReviewDecision[]): ExtractedQuantityCandidate[] {
    return candidates.map((c) => {
      const decision = decisions.find((d) => d.candidateId === c.id);
      if (!decision) return { ...c, status: c.confidence < 0.75 ? 'flagged' : c.status };
      if (decision.action === 'approve') return { ...c, status: 'approved' };
      if (decision.action === 'reject') return { ...c, status: 'rejected' };
      if (decision.action === 'request_info') return { ...c, status: 'info_required' };
      return { ...c, status: 'edited', quantity: decision.revisedQuantity ?? c.quantity, unit: decision.revisedUnit ?? c.unit, description: decision.revisedDescription ?? c.description };
    });
  }
}
