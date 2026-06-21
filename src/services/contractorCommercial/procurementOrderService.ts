import type { BoqBomLine, ProcurementLine } from './types';
import { id } from './utils';

export class ProcurementOrderService {
  createOrderList(lines: BoqBomLine[]): ProcurementLine[] {
    return lines.filter((l) => ['masonry', 'concrete', 'doors-windows', 'finishes', 'electrical', 'plumbing'].includes(l.tradePackage)).map((l) => ({
      id: id('po'), boqLineId: l.id, material: l.material, quantity: l.quantity, unit: l.unit,
      preferredSupplier: l.tradePackage === 'concrete' ? 'Readymix supplier RFQ' : undefined,
      rfqRequired: true,
      leadTimeRisk: l.tradePackage === 'doors-windows' ? 'high' : l.tradePackage === 'concrete' ? 'medium' : 'low',
    }));
  }
}
