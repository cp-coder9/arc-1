import type { BoqBomLine, TenderBid } from './types';
import { id, money } from './utils';

export class TenderBidWorkbench {
  createBid(projectRef: string, lines: BoqBomLine[]): TenderBid {
    const subtotal = money(lines.reduce((sum, l) => sum + l.total, 0));
    const unresolvedFlagCount = lines.flatMap((l) => l.flags).filter((f) => f.severity === 'blocker' || f.severity === 'warning').length;
    const preliminaries = money(subtotal * 0.08);
    const overheadAndProfit = money((subtotal + preliminaries) * 0.12);
    const riskAllowance = money(unresolvedFlagCount > 0 ? subtotal * 0.04 : subtotal * 0.015);
    const vat = money((subtotal + preliminaries + overheadAndProfit + riskAllowance) * 0.15);
    const total = money(subtotal + preliminaries + overheadAndProfit + riskAllowance + vat);
    const readinessScore = Math.max(0, Math.round(100 - unresolvedFlagCount * 12 - lines.filter((l) => l.rate <= 0).length * 20));
    const handoffs: string[] = [];
    if (subtotal > 250000 || unresolvedFlagCount > 0) handoffs.push('QS review/professional fee proposal recommended for quantity verification and tender assembly');
    if (lines.some((l) => l.tradePackage === 'concrete' || l.tradePackage === 'masonry')) handoffs.push('Architect/engineer coordination review recommended for scope/spec alignment');
    return {
      id: id('bid'), projectRef, lineCount: lines.length, subtotal, preliminaries, overheadAndProfit, riskAllowance, vat, total, unresolvedFlagCount, readinessScore,
      exclusions: unresolvedFlagCount ? ['Excluded: unresolved AI takeoff flags pending human confirmation'] : [],
      professionalFeeHandoffs: handoffs,
    };
  }
}
