import { PackageScopeService } from './packageScopeService';
import { QuoteResponseService } from './quoteResponseService';
import { DeliveryWarrantyService } from './deliveryWarrantyService';
import { ShopDrawingService } from './shopDrawingService';
import { FreelancerService } from './freelancerService';
import { BlockerService } from './blockerService';
import { agentRecommendation, toInboxTask, toProjectRecord } from './integrationAdapters';

export function runDemo() {
  const scopes = new PackageScopeService();
  const quotes = new QuoteResponseService();
  const deliveryWarranty = new DeliveryWarrantyService();
  const shopDrawings = new ShopDrawingService();
  const freelancers = new FreelancerService();
  const blockers = new BlockerService();

  const supplierScope = scopes.create({ projectRef: 'ATX-PACK7-001', title: 'Aluminium windows supply', assignedRole: 'supplier', assignedUserId: 'supplier-1', scopeSummary: 'Supply windows per A101 schedule and approved BoM lines', visibleDocumentRefs: ['doc-A101-rev2', 'window-schedule-rev1'], boqLineRefs: ['boq-window-A', 'boq-window-B'], returnables: ['datasheet', 'B-BBEE certificate', 'warranty'] });
  const subcontractorScope = scopes.create({ projectRef: 'ATX-PACK7-001', title: 'Shopfront installation package', assignedRole: 'subcontractor', assignedUserId: 'subbie-1', scopeSummary: 'Install shopfront and submit shop drawings/sample for review', visibleDocumentRefs: ['doc-A201-rev1'], boqLineRefs: ['boq-shopfront-01'], returnables: ['shop drawing', 'sample approval'] });
  const freelancerScope = scopes.create({ projectRef: 'ATX-PACK7-001', title: 'Freelance BIM shop drawing support', assignedRole: 'freelancer', assignedUserId: 'free-1', scopeSummary: 'Prepare shop drawing markups under registered architect supervision', visibleDocumentRefs: ['doc-A201-rev1'], boqLineRefs: ['boq-shopfront-01'], returnables: ['deliverable', 'timesheet'] });

  const quote = quotes.submit(supplierScope, 'supplier-1', [
    { rfqLineId: 'boq-window-A', description: 'Window Type A aluminium glazed unit', quantity: 18, unit: 'nr', unitRate: 1850, leadTimeDays: 28, substitutionOffered: true, substitutionDescription: 'Equivalent local profile offered', exclusions: ['Excludes installation'] },
    { rfqLineId: 'boq-window-B', description: 'Window Type B aluminium glazed unit', quantity: 6, unit: 'nr', unitRate: 2600, leadTimeDays: 18, substitutionOffered: false, exclusions: [] },
  ], [{ id: 'file-datasheet-1', type: 'datasheet', ref: 'datasheet-window-system.pdf' }]);

  const delivery = deliveryWarranty.submitDelivery(supplierScope, { poRef: 'PO-001', deliveredBy: 'supplier-1', items: [{ boqLineRef: 'boq-window-A', deliveredQty: 16, orderedQty: 18, damagedQty: 1 }], podRefs: [{ id: 'pod-1', type: 'image', ref: 'filemanager://pod/window-delivery.jpg' }] });
  const rejectedDelivery = deliveryWarranty.reject(delivery, 'site-manager-1', 'Short delivery: 2 missing, 1 damaged');
  const warranty = deliveryWarranty.uploadWarranty(supplierScope, { productOrAsset: 'Aluminium window system', location: 'Units 1-6', uploadedBy: 'supplier-1', fileRefs: [{ id: 'warranty-file-1', type: 'certificate', ref: 'window-warranty.pdf' }], expiryDays: 3650 });

  const shop = shopDrawings.submit(subcontractorScope, { submittedBy: 'subbie-1', revision: 'A', title: 'Shopfront shop drawing rev A', reviewerRole: 'architect', fileRefs: [{ id: 'shop-1', type: 'pdf', ref: 'shopfront-shopdrawing-revA.pdf' }] });
  const reviewedShop = shopDrawings.review(shop, 'resubmit_required', 'Door threshold detail conflicts with accessibility note; resubmit.');

  const engagement = freelancers.createEngagement(freelancerScope, { freelancerId: 'free-1', discipline: 'draughtsperson_bim_modeller', supervisorId: 'arch-supervisor-1', supervisorRole: 'architect' });
  const deliverable = freelancers.submitDeliverable(engagement, 'Shop drawing markup package', [{ id: 'bim-1', type: 'pdf', ref: 'bim-markups-revA.pdf' }]);
  const signedDeliverable = freelancers.supervisorSignoff(deliverable, 'arch-supervisor-1');
  const timesheet = freelancers.submitTimesheet(engagement, { date: new Date().toISOString().slice(0, 10), hours: 6.5, activity: 'BIM shop drawing markups and coordination notes', deliverableRefs: [signedDeliverable.id], hourlyRate: 350 });
  const approvedTimesheet = freelancers.approveTimesheet(timesheet);

  const paymentBlockers = [...blockers.quote(quote), blockers.delivery(rejectedDelivery), blockers.warranty(warranty), blockers.shopDrawing(reviewedShop), blockers.deliverable(deliverable, freelancerScope.id), blockers.timesheet(timesheet, freelancerScope.id)].filter((b): b is NonNullable<typeof b> => Boolean(b));

  return {
    quote: { status: quote.status, lineCount: quote.lines.length, vat: quote.vat, flagCount: quote.flags.length },
    delivery: { status: rejectedDelivery.status, rejectionReason: rejectedDelivery.rejectionReason },
    warranty: { verified: warranty.verified, expiryDate: warranty.expiryDate },
    shopDrawing: { initialStatus: shop.status, reviewedStatus: reviewedShop.status },
    freelancer: { deliverableAfterSignoffBlocked: signedDeliverable.externalIssueBlocked, timesheetApproved: approvedTimesheet.supervisorApproved, claimAmount: approvedTimesheet.claimAmount },
    paymentBlockerCount: paymentBlockers.length,
  };
}
