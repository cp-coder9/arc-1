import type { Bid, GanttTask, TenderPackage, UserProfile } from '../types';

export type BoQBoMSourceType = 'bid_line_item' | 'tender_scope' | 'drawing_or_specification' | 'manual';
export type PurchaseOrderValidationStatus = 'blocked' | 'ready_for_issue';
export type SupplierPrequalificationStatus = 'blocked' | 'review_required' | 'prequalified';

export interface BoQBoMItem {
  id: string;
  description: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  total?: number;
  tradePackageId?: string;
  costCode?: string;
  requiredBy?: string;
  sourceType: BoQBoMSourceType;
  sourceReference: string;
  confidence: number;
  humanReviewRequired: boolean;
}

export interface SupplierCatalogueProfile {
  uid: string;
  displayName?: string;
  email?: string;
  professionalLabel?: string;
  professionalLabels?: string[];
  region?: string;
  averageRating?: number;
  totalReviews?: number;
  cidbGrading?: string;
  tradeLicense?: string;
  catalogueKeywords?: string[];
  availabilityNotes?: string;
  leadTimeDays?: number;
}

export interface SupplierCatalogueMatch {
  supplier: SupplierCatalogueProfile;
  labels: string;
  matchTerms: string[];
  leadTimeDays?: number;
  score: number;
}

export interface SupplierPrequalificationDocument {
  type: 'bbbee_certificate' | 'tax_clearance' | 'cidb_registration' | 'trade_license' | 'insurance' | 'bank_confirmation';
  status: 'missing' | 'submitted' | 'verified' | 'expired' | 'rejected';
  expiresAt?: string;
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface SupplierPrequalificationInput {
  supplier: SupplierCatalogueProfile;
  requiredDocumentTypes?: SupplierPrequalificationDocument['type'][];
  documents?: SupplierPrequalificationDocument[];
  minimumRating?: number;
  asOf?: string;
}

export interface SupplierPrequalificationResult {
  supplierId: string;
  status: SupplierPrequalificationStatus;
  blockers: string[];
  warnings: string[];
  missingDocumentTypes: SupplierPrequalificationDocument['type'][];
  verifiedDocumentTypes: SupplierPrequalificationDocument['type'][];
  humanReviewRequired: boolean;
  aiMayAward: false;
  governanceNote: string;
}

export interface RFQShortlistEntry extends SupplierCatalogueMatch {
  prequalification: SupplierPrequalificationResult;
  rank: number;
}


export type RFQAwardReadinessStatus = 'blocked' | 'review_required' | 'ready_for_award_review';

export interface SupplierQuoteResponse {
  id: string;
  supplierId: string;
  status: 'draft' | 'submitted' | 'withdrawn' | 'expired' | 'accepted' | 'rejected';
  amount?: number;
  currency?: string;
  leadTimeDays?: number;
  validUntil?: string;
  exclusions?: string[];
  assumptions?: string[];
  submittedAt?: string;
}

export interface RankedSupplierQuoteResponse extends SupplierQuoteResponse {
  rank: number;
  supplierName?: string;
  prequalificationStatus?: SupplierPrequalificationStatus;
  normalizedScore: number;
}

export interface RFQAwardReadinessResult {
  status: RFQAwardReadinessStatus;
  rankedResponses: RankedSupplierQuoteResponse[];
  blockers: string[];
  warnings: string[];
  humanReviewRequired: true;
  aiMayAward: false;
  governanceNote: string;
}

export interface PurchaseOrderDraftInput {
  packageId: string;
  projectId?: string;
  jobId?: string;
  title: string;
  amount?: number;
  dueDate?: string;
  requestedBy: Pick<UserProfile, 'uid' | 'role' | 'displayName' | 'email'>;
  supplierId?: string;
  sourceItems?: BoQBoMItem[];
  note?: string;
  createdAt?: string;
}

export interface PurchaseOrderDraft {
  packageId: string;
  projectId?: string;
  jobId?: string;
  type: 'purchase_order';
  title: string;
  status: 'pending_approval';
  amount?: number;
  dueDate?: string;
  requestedBy: string;
  requestedByRole: UserProfile['role'];
  requestedByName: string;
  supplierId?: string;
  sourceItemIds: string[];
  humanReviewRequired: true;
  aiMayIssue: false;
  governanceNote: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderIssueCandidate {
  type: 'purchase_order';
  status: string;
  title: string;
  humanApprovedBy?: string;
  humanApprovedAt?: string;
}

export function extractBoQBoMItems(input: { tender: TenderPackage; awardedBid?: Bid; programmeTasks?: GanttTask[] }): BoQBoMItem[] {
  const { tender, awardedBid, programmeTasks = [] } = input;
  const taskDates = programmeTasks
    .filter((task: GanttTask & { packageId?: string }) => task.packageId === tender.id || task.projectId === tender.projectId)
    .map((task) => task.startDate || task.baselineStartDate || task.endDate)
    .filter(Boolean)
    .sort();
  const requiredBy = taskDates[0];

  const bidItems: BoQBoMItem[] = (awardedBid?.lineItems ?? []).map((item, index) => ({
    id: `bid-${awardedBid?.id ?? tender.id}-${index}`,
    description: item.description,
    quantity: item.quantity,
    unit: 'item',
    unitPrice: item.unitPrice,
    total: item.total,
    tradePackageId: tender.id,
    requiredBy,
    sourceType: 'bid_line_item',
    sourceReference: `Bid ${awardedBid?.id ?? 'draft'} line ${index + 1}`,
    confidence: 0.9,
    humanReviewRequired: true,
  }));

  const scopeItems: BoQBoMItem[] = (tender.scope ?? []).map((scope, index) => ({
    id: `scope-${tender.id}-${index}`,
    description: scope,
    quantity: 1,
    unit: 'allowance',
    tradePackageId: tender.id,
    requiredBy,
    sourceType: 'tender_scope',
    sourceReference: `Tender scope item ${index + 1}`,
    confidence: 0.7,
    humanReviewRequired: true,
  }));

  const documentItems: BoQBoMItem[] = (tender.documents ?? [])
    .filter((document) => /drawing|plan|dwg|detail|schedule|spec|boq|bom|material/i.test(document.name))
    .map((document, index) => ({
      id: `document-${tender.id}-${index}`,
      description: document.name,
      tradePackageId: tender.id,
      requiredBy,
      sourceType: 'drawing_or_specification',
      sourceReference: document.url || document.name,
      confidence: /boq|bom|schedule|spec/i.test(document.name) ? 0.65 : 0.45,
      humanReviewRequired: true,
    }));

  return [...bidItems, ...scopeItems, ...documentItems].slice(0, 50);
}

export function matchSupplierCatalogue(packageText: string, suppliers: SupplierCatalogueProfile[]): SupplierCatalogueMatch[] {
  const searchablePackageText = packageText.toLowerCase();
  return suppliers
    .map((supplier) => {
      const labels = [supplier.professionalLabel, ...(supplier.professionalLabels ?? []), supplier.cidbGrading, supplier.tradeLicense, ...(supplier.catalogueKeywords ?? [])]
        .filter(Boolean)
        .join(' ');
      const matchTerms = labels.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 3 && searchablePackageText.includes(term));
      const uniqueTerms = Array.from(new Set(matchTerms)).slice(0, 8);
      const ratingBoost = Math.min((supplier.averageRating ?? 0) / 5, 1);
      const leadTimeBoost = supplier.leadTimeDays ? Math.max(0, 1 - supplier.leadTimeDays / 90) : 0;
      return {
        supplier,
        labels,
        matchTerms: uniqueTerms,
        leadTimeDays: supplier.leadTimeDays,
        score: uniqueTerms.length * 10 + ratingBoost * 2 + leadTimeBoost,
      };
    })
    .sort((a, b) => b.score - a.score || (b.supplier.averageRating ?? 0) - (a.supplier.averageRating ?? 0));
}

export function evaluateSupplierPrequalification(input: SupplierPrequalificationInput): SupplierPrequalificationResult {
  const asOf = Date.parse(input.asOf ?? new Date().toISOString());
  if (Number.isNaN(asOf)) throw new Error('asOf must be a valid ISO date string.');

  const requiredDocumentTypes = input.requiredDocumentTypes ?? ['tax_clearance', 'bbbee_certificate'];
  const documents = input.documents ?? [];
  const blockers: string[] = [];
  const warnings: string[] = [];
  const verifiedDocumentTypes: SupplierPrequalificationDocument['type'][] = [];

  requiredDocumentTypes.forEach((type) => {
    const document = documents.find((candidate) => candidate.type === type);
    if (!document || document.status === 'missing') {
      blockers.push(`${type} is required for supplier prequalification.`);
      return;
    }
    if (document.status === 'verified') {
      if (document.expiresAt && Date.parse(document.expiresAt) < asOf) {
        blockers.push(`${type} has expired and must be re-verified.`);
      } else {
        verifiedDocumentTypes.push(type);
      }
      return;
    }
    if (document.status === 'expired' || document.status === 'rejected') {
      blockers.push(`${type} is ${document.status} and must be resolved before award.`);
    } else {
      warnings.push(`${type} is submitted but not yet verified by a human reviewer.`);
    }
  });

  const minimumRating = input.minimumRating ?? 0;
  if ((input.supplier.averageRating ?? 0) < minimumRating) {
    warnings.push(`${input.supplier.displayName ?? input.supplier.uid} is below the preferred supplier rating threshold.`);
  }

  const status: SupplierPrequalificationStatus = blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'review_required' : 'prequalified';
  return {
    supplierId: input.supplier.uid,
    status,
    blockers,
    warnings,
    missingDocumentTypes: requiredDocumentTypes.filter((type) => !verifiedDocumentTypes.includes(type)),
    verifiedDocumentTypes,
    humanReviewRequired: status !== 'prequalified',
    aiMayAward: false,
    governanceNote: 'Supplier prequalification and RFQ shortlisting are advisory workflow outputs only; awards, purchase orders, and payment effects require recorded human approval.',
  };
}

export function buildRFQShortlist(input: {
  packageText: string;
  suppliers: SupplierCatalogueProfile[];
  supplierDocuments?: Record<string, SupplierPrequalificationDocument[]>;
  requiredDocumentTypes?: SupplierPrequalificationDocument['type'][];
  minimumRating?: number;
  limit?: number;
  asOf?: string;
}): RFQShortlistEntry[] {
  return matchSupplierCatalogue(input.packageText, input.suppliers)
    .map((match) => ({
      ...match,
      prequalification: evaluateSupplierPrequalification({
        supplier: match.supplier,
        documents: input.supplierDocuments?.[match.supplier.uid] ?? [],
        requiredDocumentTypes: input.requiredDocumentTypes,
        minimumRating: input.minimumRating,
        asOf: input.asOf,
      }),
    }))
    .sort((a, b) => {
      const statusRank: Record<SupplierPrequalificationStatus, number> = { prequalified: 0, review_required: 1, blocked: 2 };
      return statusRank[a.prequalification.status] - statusRank[b.prequalification.status] || b.score - a.score;
    })
    .slice(0, input.limit ?? 5)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function draftPurchaseOrderForHumanApproval(input: PurchaseOrderDraftInput): PurchaseOrderDraft {
  const now = input.createdAt ?? new Date().toISOString();
  return {
    packageId: input.packageId,
    projectId: input.projectId,
    jobId: input.jobId,
    type: 'purchase_order',
    title: input.title.trim(),
    status: 'pending_approval',
    amount: input.amount,
    dueDate: input.dueDate,
    requestedBy: input.requestedBy.uid,
    requestedByRole: input.requestedBy.role,
    requestedByName: input.requestedBy.displayName || input.requestedBy.email,
    supplierId: input.supplierId,
    sourceItemIds: (input.sourceItems ?? []).map((item) => item.id),
    humanReviewRequired: true,
    aiMayIssue: false,
    governanceNote: 'Purchase orders may be drafted from BoQ/BoM and supplier catalogue data, but cannot be issued or treated as approved until a recorded human approval exists.',
    note: input.note,
    createdAt: now,
    updatedAt: now,
  };
}

export function validatePurchaseOrderIssue(candidate: PurchaseOrderIssueCandidate): { status: PurchaseOrderValidationStatus; reasons: string[] } {
  const reasons: string[] = [];
  if (candidate.type !== 'purchase_order') reasons.push('Only purchase order records can be issued through this guard.');
  if (!candidate.humanApprovedBy || !candidate.humanApprovedAt) reasons.push(`${candidate.title} requires recorded human approval before issue.`);
  if (!['approved', 'issued'].includes(candidate.status)) reasons.push(`${candidate.title} is ${candidate.status}; it must be human-approved before issue.`);
  return { status: reasons.length === 0 ? 'ready_for_issue' : 'blocked', reasons };
}

export function buildMaterialSchedule(items: BoQBoMItem[]): BoQBoMItem[] {
  return [...items].sort((a, b) => String(a.requiredBy ?? '9999-12-31').localeCompare(String(b.requiredBy ?? '9999-12-31')) || a.description.localeCompare(b.description));
}


export function evaluateRFQAwardReadiness(input: {
  responses: SupplierQuoteResponse[];
  shortlist: RFQShortlistEntry[];
  budget?: number;
  asOf?: string;
}): RFQAwardReadinessResult {
  const asOf = Date.parse(input.asOf ?? new Date().toISOString());
  if (Number.isNaN(asOf)) throw new Error('asOf must be a valid ISO date string.');

  const blockers: string[] = [];
  const warnings: string[] = [];
  const shortlistBySupplier = new Map(input.shortlist.map((entry) => [entry.supplier.uid, entry]));
  const activeResponses = input.responses.filter((response) => response.status === 'submitted' || response.status === 'accepted');

  if (activeResponses.length === 0) blockers.push('No submitted supplier quote responses are available for award review.');

  const rankedResponses = activeResponses
    .map((response) => {
      const shortlistEntry = shortlistBySupplier.get(response.supplierId);
      const supplierName = shortlistEntry?.supplier.displayName ?? response.supplierId;
      if (!shortlistEntry) {
        blockers.push(supplierName + ' is not on the governed RFQ shortlist.');
      } else if (shortlistEntry.prequalification.status === 'blocked') {
        blockers.push(supplierName + ' is blocked by supplier prequalification and cannot proceed to award review.');
      } else if (shortlistEntry.prequalification.status === 'review_required') {
        warnings.push(supplierName + ' requires human prequalification review before award.');
      }

      if (!response.amount || response.amount <= 0) blockers.push(supplierName + ' quote requires a positive amount before award review.');
      if (response.validUntil && Date.parse(response.validUntil) < asOf) blockers.push(supplierName + ' quote expired on ' + response.validUntil + '.');
      if (input.budget && response.amount && response.amount > input.budget) warnings.push(supplierName + ' quote exceeds the package budget.');
      if ((response.exclusions ?? []).length > 0) warnings.push(supplierName + ' quote includes exclusions that require human commercial review.');

      const amountScore = response.amount && response.amount > 0 ? 1 / response.amount : 0;
      const leadTimeScore = response.leadTimeDays ? Math.max(0, 1 - response.leadTimeDays / 120) : 0;
      const prequalificationScore = shortlistEntry?.prequalification.status === 'prequalified' ? 1 : shortlistEntry?.prequalification.status === 'review_required' ? 0.5 : 0;
      return {
        ...response,
        supplierName,
        prequalificationStatus: shortlistEntry?.prequalification.status,
        normalizedScore: amountScore * 100000 + leadTimeScore * 10 + prequalificationScore * 25,
      };
    })
    .sort((a, b) => b.normalizedScore - a.normalizedScore || (a.amount ?? Number.MAX_SAFE_INTEGER) - (b.amount ?? Number.MAX_SAFE_INTEGER))
    .map((response, index) => ({ ...response, rank: index + 1 }));

  const status: RFQAwardReadinessStatus = blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'review_required' : 'ready_for_award_review';
  return {
    status,
    rankedResponses,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    humanReviewRequired: true,
    aiMayAward: false,
    governanceNote: 'RFQ response ranking is advisory only; supplier awards, purchase orders, escrow movements, and payment effects require recorded human approval and audit evidence.',
  };
}
