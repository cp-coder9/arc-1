import type { BoqBomLine, ExtractedQuantityCandidate, QuantityFlag } from './types';
import { id, money } from './utils';

const defaultRates: Record<string, number> = {
  masonry: 680,
  concrete: 2450,
  'doors-windows': 1850,
  finishes: 145,
  electrical: 900,
  plumbing: 850,
  general: 1,
};

const costCodes: Record<string, string> = {
  masonry: 'CC-2300', concrete: 'CC-2100', 'doors-windows': 'CC-3100', finishes: 'CC-5200', electrical: 'CC-6100', plumbing: 'CC-6200', general: 'CC-9000',
};

export class BoqBomBuilder {
  buildLines(candidates: ExtractedQuantityCandidate[], flags: QuantityFlag[]): BoqBomLine[] {
    return candidates.filter((c) => c.status !== 'rejected').map((c, index) => {
      const rate = defaultRates[c.tradePackage] ?? defaultRates.general;
      const lineFlags = flags.filter((f) => f.candidateId === c.id);
      const reviewStatus = lineFlags.some((f) => f.severity === 'blocker') && c.status !== 'approved' && c.status !== 'edited' ? 'flagged' : c.status;
      return {
        id: id('boq'),
        sourceCandidateIds: [c.id],
        itemCode: `${String(index + 1).padStart(3, '0')}-${c.tradePackage}`,
        description: c.description,
        material: c.material,
        tradePackage: c.tradePackage,
        costCode: costCodes[c.tradePackage] ?? 'CC-9000',
        unit: c.unit,
        quantity: c.quantity,
        rate,
        total: money(c.quantity * rate),
        sourceConfidence: c.confidence,
        flags: lineFlags,
        reviewStatus,
      };
    });
  }

  approvedOnly(lines: BoqBomLine[]): BoqBomLine[] { return lines.filter((l) => l.reviewStatus === 'approved' || l.reviewStatus === 'edited'); }
}
