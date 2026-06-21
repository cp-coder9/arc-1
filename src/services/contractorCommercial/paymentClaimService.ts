import type { BoqBomLine, PaymentClaimDraft, PaymentClaimLine } from './types';
import { id, money } from './utils';

export class PaymentClaimService {
  createDraft(projectRef: string, claimNumber: string, lines: BoqBomLine[], progress: Record<string, number>, previous: Record<string, number> = {}): PaymentClaimDraft {
    const claimLines: PaymentClaimLine[] = lines.map((l) => {
      const progressPercent = Math.max(0, Math.min(100, progress[l.id] ?? 0));
      const claimToDate = money(l.total * progressPercent / 100);
      const previousClaimed = previous[l.id] ?? 0;
      return { boqLineId: l.id, description: l.description, contractValue: l.total, previousClaimed, progressPercent, currentClaim: money(Math.max(0, claimToDate - previousClaimed)), evidenceRefs: [] };
    });
    const grossCurrentClaim = money(claimLines.reduce((s, l) => s + l.currentClaim, 0));
    const retention = money(grossCurrentClaim * 0.05);
    const vat = money((grossCurrentClaim - retention) * 0.15);
    const netClaim = money(grossCurrentClaim - retention + vat);
    return { id: id('claim'), projectRef, claimNumber, lines: claimLines, grossCurrentClaim, retention, vat, netClaim, status: 'draft', certificationRequired: true };
  }
}
