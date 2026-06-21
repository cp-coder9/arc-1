import type { PaymentBlocker, PlantLog, RFI, SiteInstruction, Snag } from './types';
import { id } from './utils';

export class BlockerService {
  fromSnag(snag: Snag): PaymentBlocker | null {
    if (['high', 'critical'].includes(snag.severity) && snag.status !== 'verified_closed') return { id: id('blocker'), projectRef: snag.projectRef, sourceType: 'snag', sourceId: snag.id, severity: snag.severity, reason: `Unresolved ${snag.severity} snag: ${snag.title}`, blocksPaymentRecommendation: true };
    return null;
  }
  fromRfi(rfi: RFI): PaymentBlocker | null {
    if (rfi.costTimeImpactFlag && rfi.status !== 'closed') return { id: id('blocker'), projectRef: rfi.projectRef, sourceType: 'rfi', sourceId: rfi.id, severity: 'high', reason: 'Open RFI with cost/time impact', blocksPaymentRecommendation: true };
    return null;
  }
  fromSi(si: SiteInstruction): PaymentBlocker | null {
    if (si.costTimeImpactFlag && !['acknowledged', 'closed'].includes(si.status)) return { id: id('blocker'), projectRef: si.projectRef, sourceType: 'site_instruction', sourceId: si.id, severity: 'high', reason: 'Cost/time-impact site instruction not acknowledged', blocksPaymentRecommendation: true };
    return null;
  }
  fromPlant(log: PlantLog): PaymentBlocker | null {
    if (log.condition === 'unsafe') return { id: id('blocker'), projectRef: log.projectRef, sourceType: 'plant', sourceId: log.id, severity: 'critical', reason: `Unsafe plant/equipment logged: ${log.equipment}`, blocksPaymentRecommendation: true };
    return null;
  }
}
