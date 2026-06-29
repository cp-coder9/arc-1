// ── Types ────────────────────────────────────────────────────────────────────
export type {
  BomSourceFormat,
  BomTradePackage,
  BomUnit,
  BomItemStatus,
  BomFlagSeverity,
  QsReviewDecision,
  TenderPackageStatus,
  ExportFormat,
  ExportTemplate,
  ProcurementStatus,
  BomExtractionSource,
  BomLineItem,
  BomFlag,
  QsReviewEntry,
  QsSignOff,
  TenderPackage,
  TenderBidder,
  BomExportRecord,
  BomProject,
} from './types';

// ── Core BoM Builder Service ────────────────────────────────────────────────
export {
  createProject,
  getProject,
  ingestSource,
  extractQuantities,
  addLineItem,
  updateLineItem,
  removeLineItem,
  flagItem,
  resolveFlag,
  getTradeBreakdown,
  calculateTotals,
  linkToSpecForge,
  linkToProgramme,
} from './bomBuilderService';
export type { BomTotals } from './bomBuilderService';

// ── QS Review Service ───────────────────────────────────────────────────────
export {
  getMarketRate,
  submitForReview,
  reviewItem,
  batchApprove,
  validateSignOffReadiness,
  signOff,
} from './qsReviewService';
export type { SignOffReadiness } from './qsReviewService';

// ── Tender Service ──────────────────────────────────────────────────────────
export {
  generatePackages,
  addBidder,
  removeBidder,
  issueToTenderers,
  recordBidReturn,
  evaluateBids,
} from './tenderService';
export type { BidEvaluation } from './tenderService';

// ── Export Service ──────────────────────────────────────────────────────────
export {
  generateExport,
  getExportHistory,
  certifyExport,
} from './exportService';
