import { TakeoffIngestionService } from './takeoffIngestionService';
import { QuantityReviewService } from './quantityReviewService';
import { BoqBomBuilder } from './boqBomBuilder';
import { TenderBidWorkbench } from './tenderBidWorkbench';
import { ProcurementOrderService } from './procurementOrderService';
import { PaymentClaimService } from './paymentClaimService';
import { agentRecommendation, toInboxTask, toProjectRecord } from './integrationAdapters';
import type { ReviewDecision } from './types';

export function runDemo() {
  const ingestion = new TakeoffIngestionService();
  const review = new QuantityReviewService();
  const builder = new BoqBomBuilder();
  const bidWorkbench = new TenderBidWorkbench();
  const procurement = new ProcurementOrderService();
  const claims = new PaymentClaimService();

  const sources = ingestion.ingestDemoSources();
  const candidates = sources.flatMap((source) => ingestion.extract(source));
  const flags = review.flagCandidates(candidates);

  const decisions: ReviewDecision[] = [
    { candidateId: 'q-revit-001', action: 'approve', reviewer: 'QS Reviewer', reviewedAt: new Date().toISOString(), note: 'BIM wall quantity accepted for draft tender.' },
    { candidateId: 'q-revit-002', action: 'approve', reviewer: 'QS Reviewer', reviewedAt: new Date().toISOString(), note: 'Concrete volume accepted subject to engineer final schedule.' },
    { candidateId: 'q-pdf-001', action: 'edit', reviewer: 'Contractor QS', reviewedAt: new Date().toISOString(), note: 'Adjusted wall paint area after manual height review.', revisedQuantity: 244.8 },
    { candidateId: 'q-pdf-002', action: 'request_info', reviewer: 'Contractor QS', reviewedAt: new Date().toISOString(), note: 'Tile spec not shown; need architect/spec schedule.' },
  ];

  const reviewed = review.applyReview(candidates, decisions);
  const boqLines = builder.buildLines(reviewed, flags);
  const approvedForTender = builder.approvedOnly(boqLines);
  const tenderBid = bidWorkbench.createBid('ATX-DEMO-05', boqLines);
  const orderList = procurement.createOrderList(approvedForTender);
  const progress = Object.fromEntries(approvedForTender.map((l, idx) => [l.id, idx === 0 ? 35 : 20]));
  const claim = claims.createDraft('ATX-DEMO-05', 'CLAIM-001', approvedForTender, progress);

  const blockerFlags = flags.filter((f) => f.severity === 'blocker');
  const inbox = [
    ...blockerFlags.map((f) => toInboxTask('QUANTITY_REVIEW_REQUIRED', f.reason, f.candidateId, 'high')),
    toInboxTask('PAYMENT_CLAIM_REVIEW_REQUIRED', 'Payment claim draft requires certifier/QS review before certificate or release', claim.id, 'high'),
  ];

  const records = [
    toProjectRecord('TAKEOFF_SOURCE_INGESTED', sources),
    toProjectRecord('AI_QUANTITY_TAKEOFF_GENERATED', candidates),
    toProjectRecord('BOQ_BOM_DRAFT_GENERATED', boqLines),
    toProjectRecord('TENDER_BID_DRAFT_GENERATED', tenderBid),
    toProjectRecord('PROCUREMENT_ORDER_LIST_GENERATED', orderList),
    toProjectRecord('PAYMENT_CLAIM_DRAFT_GENERATED', claim),
  ];

  const recommendations = [
    agentRecommendation('Ask QS to resolve flagged quantity assumptions before tender issue.', `${flags.length} flags found across AI takeoff candidates.`),
    agentRecommendation('Generate supplier RFQs from approved BoM lines.', `${orderList.length} procurement lines ready for RFQ draft.`),
    agentRecommendation('Create professional fee/proposal handoff for QS tender support.', tenderBid.professionalFeeHandoffs.join(' | ')),
  ];

  return {
    sourcesIngested: sources.map((s) => ({ type: s.sourceType, file: s.fileName, documentRevisionId: s.documentRevisionId })),
    extractedCandidateCount: candidates.length,
    flagCount: flags.length,
    blockerFlagCount: blockerFlags.length,
    reviewedStatuses: reviewed.reduce<Record<string, number>>((acc, c) => { acc[c.status] = (acc[c.status] ?? 0) + 1; return acc; }, {}),
    boqLineCount: boqLines.length,
    approvedForTenderCount: approvedForTender.length,
    tenderBid: { subtotal: tenderBid.subtotal, vat: tenderBid.vat, total: tenderBid.total, readinessScore: tenderBid.readinessScore, unresolvedFlagCount: tenderBid.unresolvedFlagCount, professionalFeeHandoffs: tenderBid.professionalFeeHandoffs },
    procurementLineCount: orderList.length,
    paymentClaim: { claimNumber: claim.claimNumber, grossCurrentClaim: claim.grossCurrentClaim, retention: claim.retention, vat: claim.vat, netClaim: claim.netClaim, certificationRequired: claim.certificationRequired },
    projectRecordCount: records.length,
    inboxTaskCount: inbox.length,
    agentRecommendations: recommendations.map((r) => r.message),
  };
}
