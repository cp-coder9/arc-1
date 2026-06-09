/**
 * Architex Master Product Expansion — Barrel Exports
 *
 * Domain/service layer for the master product expansion pack.
 * @see ARCHITEX_MASTER_PRODUCT_EXPANSION_BRIEF.md
 */

// Types
export type {
  ArchitexRole,
  ProjectPhase,
  ProductModuleKey,
  ProjectRecordType,
  AuditMetadata,
  ApprovalMetadata,
  ProjectRecord,
  ProjectLifecycleState,
  ProjectPassportSummary,
  ProductModuleDefinition,
  // Pack 2 enhanced types
  Priority,
  RecordStatus,
  MissingRecord,
  LifecycleEvaluation,
  TeamAppointmentSummary,
  RiskFinding,
  WorkflowEvent,
  AgentRecommendation,
  ProjectMetadata,
  PhaseDefinition,
} from '@/types/architexMasterTypes';

// Module Registry
export {
  productModuleRegistry,
  modulesForPhase,
} from './moduleRegistry';

// Navigation
export type {
  SidebarZoneKey,
  NavigationZone,
  WorkspaceRoute,
} from './navigationConfig';
export {
  sidebarZones,
  workspaceRoutes,
  navigationZonesForRole,
  workspaceRoutesForPhase,
  workspaceRoutesForContext,
} from './navigationConfig';

// Services
export {
  buildLifecycleState,
  recommendLifecycleActions,
  evaluateLifecycle,
  evaluatePhaseReadiness,
  identifyBlockers,
  canAdvance,
  produceNextBestActions,
  hasUsableRecord,
  definitionForPhase,
  PHASE_DEFINITIONS,
} from './projectLifecycleEngine';
export {
  buildProjectPassport,
  buildProjectPassportSummary,
  extractTeamAppointments,
  calculateApprovalStatus,
  calculateDocumentStatus,
  calculateFinancialStatus,
  calculateReadinessScore,
} from './projectPassportService';
export { createDrawingRevisionRecord } from './documentIntelligenceService';
export type { DrawingIntelligencePayload } from './documentIntelligenceService';
export { createKnowledgeSourceRecord } from './knowledgeHubService';
export type { KnowledgeSourcePayload } from './knowledgeHubService';
export { createCandidateProfessionalListing } from './marketplaceService';
export type { MarketplaceListingPayload } from './marketplaceService';
export { createEscrowMilestone } from './financeControlService';
export type { EscrowMilestonePayload } from './financeControlService';
export { createQuoteComparisonRecord } from './procurementService';
export type { QuoteComparisonPayload } from './procurementService';
export { createSiteDiaryRecord } from './siteExecutionService';
export type { SiteDiaryPayload } from './siteExecutionService';
export { detectProjectRisks } from './riskEngineService';
export { workflowEventsFromProjectState, generateMissingApprovalEvent } from './inboxEventService';
export { recommendationsFromPassport, createRecommendation } from './agentRecommendationService';
