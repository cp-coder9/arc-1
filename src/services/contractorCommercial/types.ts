export type TakeoffSourceType = 'revit_bim_export' | 'ifc_model' | 'pdf_vector' | 'pdf_raster_scan' | 'csv_schedule' | 'manual';
export type Unit = 'm' | 'm2' | 'm3' | 'nr' | 'kg' | 'ton' | 'l' | 'sum';
export type TradePackage = 'earthworks' | 'concrete' | 'masonry' | 'roofing' | 'doors-windows' | 'finishes' | 'electrical' | 'plumbing' | 'fire' | 'preliminaries' | 'general';
export type QuantityStatus = 'extracted' | 'flagged' | 'approved' | 'edited' | 'rejected' | 'info_required';
export type FlagSeverity = 'info' | 'warning' | 'blocker';
export type ReviewAction = 'approve' | 'edit' | 'reject' | 'request_info';

export interface TakeoffSource {
  id: string;
  sourceType: TakeoffSourceType;
  fileName: string;
  documentRevisionId: string;
  projectRef: string;
  uploadedBy: string;
  receivedAt: string;
  extractionProvider: string;
  notes: string;
}

export interface SourceLocator {
  sourceId: string;
  page?: number;
  level?: string;
  zone?: string;
  elementId?: string;
  drawingRef?: string;
}

export interface ExtractedQuantityCandidate {
  id: string;
  source: SourceLocator;
  description: string;
  material: string;
  tradePackage: TradePackage;
  unit: Unit;
  quantity: number;
  confidence: number;
  status: QuantityStatus;
  assumptions: string[];
}

export interface QuantityFlag {
  id: string;
  candidateId: string;
  severity: FlagSeverity;
  reason: string;
  suggestedAction: string;
}

export interface ReviewDecision {
  candidateId: string;
  action: ReviewAction;
  reviewer: string;
  reviewedAt: string;
  note: string;
  revisedQuantity?: number;
  revisedUnit?: Unit;
  revisedDescription?: string;
}

export interface BoqBomLine {
  id: string;
  sourceCandidateIds: string[];
  itemCode: string;
  description: string;
  material: string;
  tradePackage: TradePackage;
  costCode: string;
  unit: Unit;
  quantity: number;
  rate: number;
  total: number;
  sourceConfidence: number;
  flags: QuantityFlag[];
  reviewStatus: QuantityStatus;
}

export interface TenderBid {
  id: string;
  projectRef: string;
  lineCount: number;
  subtotal: number;
  preliminaries: number;
  overheadAndProfit: number;
  riskAllowance: number;
  vat: number;
  total: number;
  unresolvedFlagCount: number;
  readinessScore: number;
  exclusions: string[];
  professionalFeeHandoffs: string[];
}

export interface ProcurementLine {
  id: string;
  boqLineId: string;
  material: string;
  quantity: number;
  unit: Unit;
  preferredSupplier?: string;
  rfqRequired: boolean;
  leadTimeRisk: 'low' | 'medium' | 'high';
}

export interface PaymentClaimLine {
  boqLineId: string;
  description: string;
  contractValue: number;
  previousClaimed: number;
  progressPercent: number;
  currentClaim: number;
  evidenceRefs: string[];
}

export interface PaymentClaimDraft {
  id: string;
  projectRef: string;
  claimNumber: string;
  lines: PaymentClaimLine[];
  grossCurrentClaim: number;
  retention: number;
  vat: number;
  netClaim: number;
  status: 'draft' | 'submitted_for_review' | 'certified' | 'disputed' | 'superseded';
  certificationRequired: boolean;
}
