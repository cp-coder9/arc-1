import type { PackageScope, QuoteLine, QuoteResponse } from './types';
import { daysFromNow, id, money } from './utils';

export class QuoteResponseService {
  submit(scope: PackageScope, supplierId: string, lines: Omit<QuoteLine, 'total'>[], returnableRefs: QuoteResponse['returnableRefs']): QuoteResponse {
    const priced = lines.map((l) => ({ ...l, total: money(l.quantity * l.unitRate) }));
    const flags: string[] = [];
    for (const l of priced) {
      if (l.substitutionOffered) flags.push(`Substitution approval required: ${l.description}`);
      if (l.exclusions.length) flags.push(`Exclusions visible: ${l.description}`);
      if (l.leadTimeDays > 21) flags.push(`Lead-time risk: ${l.description}`);
    }
    const missing = scope.returnables.filter((r) => !returnableRefs.some((f) => f.ref.toLowerCase().includes(r.toLowerCase().split(' ')[0])));
    missing.forEach((r) => flags.push(`Missing returnable: ${r}`));
    return {
      id: id('quote'), packageId: scope.id, supplierId, status: flags.length ? 'clarification_required' : 'comparable',
      validityDate: daysFromNow(30), vat: money(priced.reduce((s, l) => s + l.total, 0) * 0.15),
      lines: priced, returnableRefs, flags,
    };
  }
}
