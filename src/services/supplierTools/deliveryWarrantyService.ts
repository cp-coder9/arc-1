import type { DeliveryNote, FileRef, PackageScope, WarrantyCertificate } from './types';
import { daysFromNow, id } from './utils';

export class DeliveryWarrantyService {
  submitDelivery(scope: PackageScope, data: { poRef: string; deliveredBy: string; items: { boqLineRef: string; deliveredQty: number; orderedQty: number; damagedQty: number }[]; podRefs: FileRef[] }): DeliveryNote {
    const anyShort = data.items.some((i) => i.deliveredQty < i.orderedQty);
    const anyDamage = data.items.some((i) => i.damagedQty > 0);
    return {
      id: id('delivery'), packageId: scope.id, poRef: data.poRef, deliveredBy: data.deliveredBy,
      status: anyShort || anyDamage ? 'acceptance_required' : 'accepted',
      deliveredItems: data.items, podRefs: data.podRefs,
    };
  }
  accept(note: DeliveryNote, receivedBy: string): DeliveryNote { return { ...note, status: 'accepted', receivedBy }; }
  reject(note: DeliveryNote, receivedBy: string, reason: string): DeliveryNote { return { ...note, status: 'rejected', receivedBy, rejectionReason: reason }; }
  uploadWarranty(scope: PackageScope, data: { productOrAsset: string; location: string; uploadedBy: string; fileRefs: FileRef[]; expiryDays: number }): WarrantyCertificate {
    return { id: id('warranty'), packageId: scope.id, productOrAsset: data.productOrAsset, location: data.location, uploadedBy: data.uploadedBy, fileRefs: data.fileRefs, expiryDate: daysFromNow(data.expiryDays), verified: false };
  }
  verifyWarranty(w: WarrantyCertificate): WarrantyCertificate { return { ...w, verified: true }; }
}
