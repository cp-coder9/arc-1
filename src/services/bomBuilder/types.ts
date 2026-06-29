export type BomSourceFormat = 'pdf_vector' | 'pdf_raster' | 'dwg' | 'dxf' | 'ifc' | 'revit' | 'csv' | 'xlsx' | 'manual';
export type BomTradePackage = 'earthworks' | 'concrete' | 'masonry' | 'roofing' | 'doors-windows' | 'finishes' | 'electrical' | 'plumbing' | 'fire' | 'preliminaries' | 'general';
export type BomUnit = 'm' | 'm2' | 'm3' | 'nr' | 'kg' | 'ton' | 'l' | 'sum';
export type BomItemStatus = 'extracted' | 'flagged' | 'approved' | 'edited' | 'rejected' | 'info_required';
export type BomFlagSeverity = 'info' | 'warning' | 'blocker';
export type QsReviewDecision = 'approve' | 'edit' | 'reject' | 'request_info' | 'batch_approve';
export type TenderPackageStatus = 'draft' | 'ready' | 'issued' | 'returned' | 'awarded' | 'blocked';
export type ExportFormat = 'pdf' | 'xlsx' | 'csv' | 'ms_project';
export type ExportTemplate = 'full_bom' | 'priced_boq' | 'trade_package' | 'procurement_schedule' | 'qs_cost_report' | 'cashflow_forecast';
export type ProcurementStatus = 'not_started' | 'rfq_sent' | 'quoted' | 'ordered' | 'in_transit' | 'delivered' | 'installed';

export interface BomExtractionSource {
  id: string;
  fileName: string;
  format: BomSourceFormat;
  drawingRef: string;
  revision: string;
  uploadedBy: string;
  uploadedAt: string;
  itemsExtracted: number;
  confidence: number;
  status: 'processing' | 'complete' | 'needs_review' | 'failed';
}

export interface BomLineItem {
  id: string;
  sourceIds: string[];
  itemCode: string;
  description: string;
  material: string;
  tradePackage: BomTradePackage;
  costCode: string;
  unit: BomUnit;
  quantity: number;
  rate: number;
  total: number;
  confidence: number;
  status: BomItemStatus;
  flags: BomFlag[];
  specForgeItemId?: string;
  programmeActivityId?: string;
  supplierAllocation?: string;
  procurementStatus: ProcurementStatus;
  leadTimeDays?: number;
  sansRef?: string;
}

export interface BomFlag {
  id: string;
  lineItemId: string;
  severity: BomFlagSeverity;
  reason: string;
  suggestedAction: string;
  sansReference?: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface QsReviewEntry {
  lineItemId: string;
  aiRate: number;
  marketRateMin: number;
  marketRateMax: number;
  variance: 'in_range' | 'above' | 'below';
  decision?: QsReviewDecision;
  reviewer?: string;
  reviewedAt?: string;
  note?: string;
}

export interface QsSignOff {
  id: string;
  projectId: string;
  signedBy: string;
  signedAt: string;
  itemCount: number;
  totalValue: number;
  unresolved: number;
  certificateRef: string;
}

export interface TenderPackage {
  id: string;
  code: string;
  name: string;
  tradePackage: BomTradePackage;
  lineItemIds: string[];
  itemCount: number;
  value: number;
  qsCertified: boolean;
  status: TenderPackageStatus;
  bidders: TenderBidder[];
  returnDate?: string;
}

export interface TenderBidder {
  id: string;
  companyName: string;
  bbbeeLevel: number;
  invited: boolean;
  responded: boolean;
  bidAmount?: number;
}

export interface BomExportRecord {
  id: string;
  template: ExportTemplate;
  format: ExportFormat;
  generatedAt: string;
  generatedBy: string;
  fileName: string;
  certified: boolean;
  documentRegisterId?: string;
}

export interface BomProject {
  id: string;
  projectId?: string;
  name: string;
  stage: string;
  revision: string;
  sources: BomExtractionSource[];
  lineItems: BomLineItem[];
  qsReviews: QsReviewEntry[];
  qsSignOff?: QsSignOff;
  tenderPackages: TenderPackage[];
  exports: BomExportRecord[];
  createdAt: string;
  updatedAt: string;
}
