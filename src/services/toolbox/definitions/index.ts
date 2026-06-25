// Toolbox calculator definitions — public surface
//
// Re-exports the definition registry. Concrete tool definitions (authored in later tasks)
// register themselves into the registry; importing this module is the single entry point
// callers use to resolve a definition by id.

export {
  registerCalculatorDefinition,
  getCalculatorDefinition,
  hasCalculatorDefinition,
  listCalculatorDefinitions,
  unregisterCalculatorDefinition,
  resetCalculatorDefinitions,
} from './definitionRegistry'

// Concrete tool definitions — importing this module registers them into the registry.
export {
  xaFenestrationV1,
  xaFenestrationInputSchema,
  xaOpeningRowSchema,
  xaFenestrationClauseSet,
  ORIENTATIONS,
  SHADING_TYPES,
  type XaFenestrationInput,
  type XaOpeningRow,
  type Orientation,
  type ShadingType,
} from './xaFenestration'

// Energy & thermal group (Task 7).
export {
  rvalueCalcV1,
  rvalueInputSchema,
  rvalueLayerSchema,
  rvalueClauseSet,
  computeAssemblyRValue,
  resolveRValueMinimum,
  totalRValue,
  ELEMENT_TYPES,
  type RValueInput,
  type RValueLayer,
  type ElementType,
  type MaterialRow,
  type RValueMinimumRow,
  type AssemblyRValue,
  type LayerRValueResult,
} from './rvalue'

export {
  fenestrationNV1,
  fenestrationNInputSchema,
  fenestrationNRoomSchema,
  fenestrationNClauseSet,
  OCCUPANCY_TYPES,
  type FenestrationNInput,
  type FenestrationNRoom,
  type OccupancyType,
} from './fenestrationN'

export {
  xaEnergyComplianceV1,
  xaEnergyInputSchema,
  xaEnergyClauseSet,
  type XaEnergyInput,
} from './xaEnergyCompliance'

export {
  energyCertificateV1,
  energyCertificateInputSchema,
  energyCertificateClauseSet,
  resolveRatingBand,
  BUILDING_TYPES,
  type EnergyCertificateInput,
  type BuildingType,
} from './energyCertificate'

// Fee calculator group (Task 8.1).
export {
  feeCalculatorV1,
  feeCalculatorInputSchema,
  feeCalculatorClauseSet,
  computeBracketBaseFee,
  computeStageShare,
  selectBracketRow,
  COUNCILS,
  COUNCIL_TABLE_IDS,
  COUNCIL_NAMES,
  FEE_STAGES_TABLE_ID,
  type FeeCalculatorInput,
  type FeeTableBracketRow,
  type FeeStageRow,
  type Council,
} from './feeCalculator'

// Soft cost estimator (Task 8.2).
export {
  softCostEstimatorV1,
  softCostInputSchema,
  softCostClauseSet,
  computeMunicipalFee,
  DISCIPLINES,
  DISCIPLINE_TABLE_IDS,
  DISCIPLINE_LABELS,
  MUNICIPAL_TABLE_ID,
  type SoftCostInput,
  type Discipline,
  type MunicipalFeeRow,
} from './softCostEstimator'

// Feasibility estimator (Task 8.2).
export {
  feasibilityEstimatorV1,
  feasibilityInputSchema,
  feasibilityClauseSet,
  type FeasibilityInput,
} from './feasibilityEstimator'

// Construction & commercial group (Task 10.1).
export {
  boqTakeoffV1,
  boqInputSchema,
  boqRowSchema,
  boqRateBuildUpSchema,
  boqClauseSet,
  type BoQInput,
  type BoQRow,
  type BoQUnit,
  type RateBuildUp,
} from './boqTakeoff'

export {
  materialProcurementV1,
  materialProcurementInputSchema,
  materialRowSchema,
  materialProcurementClauseSet,
  type MaterialProcurementInput,
  type MaterialRow,
  type MaterialPriority,
} from './materialProcurement'

// Construction & commercial group (Task 10.2).
export {
  valuationCertV1,
  valuationCertInputSchema,
  valuationCertRowSchema,
  valuationCertClauseSet,
  type ValuationCertInput,
  type ValuationCertRow,
} from './valuationCert'

export {
  paymentClaimBuilderV1,
  paymentClaimInputSchema,
  paymentClaimRowSchema,
  paymentClaimClauseSet,
  type PaymentClaimInput,
  type PaymentClaimRow,
} from './paymentClaimBuilder'

// Construction & commercial group (Task 10.3).
export {
  workforceTimesheetV1,
  timesheetInputSchema,
  timesheetRowSchema,
  timesheetClauseSet,
  type TimesheetInput,
  type TimesheetRow,
  type WorkerGrade,
} from './workforceTimesheet'

export {
  plantRegisterV1,
  plantInputSchema,
  plantRowSchema,
  plantClauseSet,
  type PlantInput,
  type PlantRow,
  type HireType,
} from './plantRegister'

export {
  siteDiaryEntryV1,
  diaryInputSchema,
  diaryRowSchema,
  diaryClauseSet,
  type DiaryInput,
  type DiaryRow,
  type Weather,
} from './siteDiaryEntry'

export {
  hsComplianceV1,
  hsComplianceInputSchema,
  hsCheckRowSchema,
  hsComplianceClauseSet,
  type HsComplianceInput,
  type HsCheckRow,
} from './hsCompliance'

// Document-control & governance group (Task 11).
export {
  drawingRegisterV1,
  drawingRegisterInputSchema,
  drawingRegisterRowSchema,
  drawingRegisterClauseSet,
  type DrawingRegisterInput,
  type DrawingRegisterRow,
  type DrawingStatus,
} from './drawingRegister'

export {
  docControlIssueV1,
  docControlIssueInputSchema,
  docControlIssueRowSchema,
  docControlIssueClauseSet,
  type DocControlIssueInput,
  type DocControlIssueRow,
} from './docControlIssue'

export {
  shopDrawingSubmissionV1,
  shopDrawingSubmissionInputSchema,
  shopDrawingSubmissionRowSchema,
  shopDrawingSubmissionClauseSet,
  type ShopDrawingSubmissionInput,
  type ShopDrawingSubmissionRow,
  type ShopDrawingStatus,
} from './shopDrawingSubmission'

export {
  firmDocumentRegisterV1,
  firmDocumentRegisterInputSchema,
  firmDocumentRegisterRowSchema,
  firmDocumentRegisterClauseSet,
  type FirmDocumentRegisterInput,
  type FirmDocumentRegisterRow,
  type DocumentCategory,
  type DocumentStatus,
} from './firmDocumentRegister'

export {
  proposalComparisonV1,
  proposalComparisonInputSchema,
  proposalComparisonRowSchema,
  proposalComparisonClauseSet,
  type ProposalComparisonInput,
  type ProposalComparisonRow,
} from './proposalComparison'

export {
  stageGateReviewV1,
  stageGateReviewInputSchema,
  stageGateReviewRowSchema,
  stageGateReviewClauseSet,
  type StageGateReviewInput,
  type StageGateReviewRow,
  type GateCriterionStatus,
  type GateRecommendation,
} from './stageGateReview'

export {
  cpdStandaloneV1,
  cpdStandaloneInputSchema,
  cpdStandaloneRowSchema,
  cpdStandaloneClauseSet,
  type CpdStandaloneInput,
  type CpdStandaloneRow,
  type CpdCategory,
  type CpdBodyRuleRow,
} from './cpdStandalone'

export {
  staffCpdTrackerV1,
  staffCpdTrackerInputSchema,
  staffCpdTrackerRowSchema,
  staffCpdTrackerClauseSet,
  type StaffCpdTrackerInput,
  type StaffCpdTrackerRow,
} from './staffCpdTracker'

// Admin / platform tools (Task 12).
export {
  feeTariffEditorV1,
  feeTariffEditorInputSchema,
  feeTariffEditorRowSchema,
  feeTariffEditorClauseSet,
  type FeeTariffEditorInput,
  type FeeTariffEditorRow,
  type TariffAction,
} from './feeTariffEditor'

export {
  paymentRateConfigV1,
  paymentRateConfigInputSchema,
  paymentRateConfigRowSchema,
  paymentRateConfigClauseSet,
  type PaymentRateConfigInput,
  type PaymentRateConfigRow,
  type RateUnit,
} from './paymentRateConfig'

export {
  adminGovernanceV1,
  adminGovernanceInputSchema,
  adminGovernanceRowSchema,
  adminGovernanceClauseSet,
  type AdminGovernanceInput,
  type AdminGovernanceRow,
  type PolicyStatus,
} from './adminGovernance'

export {
  auditTrailViewerV1,
  auditTrailViewerInputSchema,
  auditTrailViewerRowSchema,
  auditTrailViewerClauseSet,
  type AuditTrailViewerInput,
  type AuditTrailViewerRow,
} from './auditTrailViewer'

export {
  userVerificationConsoleV1,
  userVerificationConsoleInputSchema,
  userVerificationConsoleRowSchema,
  userVerificationConsoleClauseSet,
  type UserVerificationConsoleInput,
  type UserVerificationConsoleRow,
  type VerificationStatus,
} from './userVerificationConsole'

export {
  platformSettingsV1,
  platformSettingsInputSchema,
  platformSettingsRowSchema,
  platformSettingsClauseSet,
  type PlatformSettingsInput,
  type PlatformSettingsRow,
} from './platformSettings'

export {
  systemHealthMonitorV1,
  systemHealthMonitorInputSchema,
  systemHealthMonitorRowSchema,
  systemHealthMonitorClauseSet,
  type SystemHealthMonitorInput,
  type SystemHealthMonitorRow,
  type ServiceStatus,
} from './systemHealthMonitor'

export {
  aiReviewQueueV1,
  aiReviewQueueInputSchema,
  aiReviewQueueRowSchema,
  aiReviewQueueClauseSet,
  type AiReviewQueueInput,
  type AiReviewQueueRow,
  type ReviewItemStatus,
} from './aiReviewQueue'

// Preview stub definitions (Task 13 — coverage sweep).
// Importing this module registers all preview stubs into the registry so every tool
// is either `status: 'full'` or `status: 'preview'` — no silent placeholders.
// When a group conversion task promotes a tool, remove its stub export from previewStubs.ts.
export * from './previewStubs'

// Compliance checkers group (Task 9).
export {
  fireComplianceCheckV1,
  fireComplianceInputSchema,
  fireComplianceClauseSet,
  type FireComplianceInput,
  type FireThresholdRow,
} from './fireComplianceCheck'

export {
  fireRationalDesignV1,
  fireRationalInputSchema,
  fireRationalClauseSet,
  type FireRationalInput,
  type FireRationalRow,
} from './fireRationalDesign'

export {
  zoningCheckV1,
  zoningInputSchema,
  zoningClauseSet,
  type ZoningInput,
  type ZoningSchemeRow,
} from './zoningCheck'

export {
  sansFormsV1,
  sansFormsInputSchema,
  sansFormsClauseSet,
  type SansFormsInput,
  type SansFormRow,
} from './sansForms'

export {
  aiDrawingCheckerV1,
  aiDrawingInputSchema,
  aiDrawingClauseSet,
  type AiDrawingInput,
  type DrawingCheckRow,
} from './aiDrawingChecker'

export {
  cadUploadCheckV1,
  cadUploadInputSchema,
  cadUploadClauseSet,
  type CadUploadInput,
  type CadUploadRow,
} from './cadUploadCheck'
