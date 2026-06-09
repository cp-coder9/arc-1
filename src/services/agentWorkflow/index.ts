/**
 * Agent Orchestration Core — Barrel Exports (Pack 14)
 *
 * Exports all agent orchestration services, adapters, and utilities.
 * The module key is `agent_orchestration_core`.
 */

// ─── Agent Identity ───────────────────────────────────────────────────────

export {
  createAgentIdentity,
  getCapabilitiesForRole,
  getDefaultCapabilities,
  canAgentActForRole,
  agentHasCapability,
  agentsWithCapability,
  validateTenantScope,
  filterAgentsByTenant,
} from './agentIdentityService';
export type {
  AgentIdentity,
  AgentCapability,
  AgentType,
  AgentCapabilityRegistry,
} from './agentIdentityService';

// ─── User Agent ───────────────────────────────────────────────────────────

export {
  createUserAgentProfile,
  updatePreferences,
  recordUserActivity,
  learnPatterns,
  updateUserContext,
  getPersonalizedContext,
} from './userAgentService';
export type {
  UserAgentProfile,
  UserPreferences,
  UserActivity,
  LearnedPattern,
  UserContext,
} from './userAgentService';

// ─── Project Agent ────────────────────────────────────────────────────────

export {
  createProjectAgent,
  accumulateProjectRecord,
  transitionProjectPhase,
  generateCrossPhaseInsights,
  generateProjectRecommendations,
} from './projectAgentService';
export type {
  ProjectAgentProfile,
  PhaseContext,
  CrossPhaseInsight,
  ProjectRecommendation,
} from './projectAgentService';

// ─── System Governance Agent ──────────────────────────────────────────────

export {
  createGovernanceRule,
  checkRateLimit,
  detectAbuse,
  runComplianceCheck,
  DEFAULT_GOVERNANCE_RULES,
} from './systemGovernanceAgentService';
export type {
  GovernanceRule,
  ComplianceCheck,
  RateLimitRecord,
  AbuseDetectionResult,
  AbuseEvidence,
} from './systemGovernanceAgentService';

// ─── Event Routing ────────────────────────────────────────────────────────

export {
  routeEvent,
  routeEvents,
  createEventQueue,
  enqueueEvent,
  dequeueNext,
  peekNext,
  moveToDeadLetter,
  requeueFromDeadLetter,
} from './eventRoutingService';
export type {
  EventRoute,
  EventRouteTarget,
  EventQueue,
  DeadLetterEntry,
} from './eventRoutingService';

// ─── Recommendation Policy ────────────────────────────────────────────────

export {
  createDefaultPolicy,
  shouldShowRecommendation,
  needsHumanApproval,
  canAutoApply,
  canRoleApprove,
  canRoleDismiss,
  overridePolicy,
  resetPolicyToDefaults,
  createABTest,
  assignABTestGroup,
  applyABTestPolicy,
} from './recommendationPolicyService';
export type {
  RecommendationPolicy,
  RecommendationScope,
  ABTestConfig,
  ABTestGroup,
} from './recommendationPolicyService';

// ─── Contextual Message Draft ─────────────────────────────────────────────

export {
  getTemplateForEvent,
  draftMessage,
  extractMessageContext,
  draftMessagesForEvents,
} from './contextualMessageDraftService';
export type {
  MessageDraft,
  MessageTemplate,
} from './contextualMessageDraftService';

// ─── Agent Memory Boundary ────────────────────────────────────────────────

export {
  createDefaultMemoryPolicy,
  createMemoryRecord,
  accessMemoryRecord,
  enforceTenantIsolation,
  validateTenantScope as validateMemoryTenantScope,
  isExpired,
  purgeExpiredRecords,
  isSensitiveData,
  redactSensitiveValue,
  enforceMemoryLimit,
  verifyMemoryConsent,
} from './agentMemoryBoundaryService';
export type {
  MemoryRecord,
  MemoryBoundaryPolicy,
  MemoryStore,
  RetentionPeriod,
} from './agentMemoryBoundaryService';

// ─── Agent Monitoring ─────────────────────────────────────────────────────

export {
  createAgentMetrics,
  recordAction,
  recordRecommendation,
  detectDrift,
  generateUsageReport,
  agentHealthCheck,
} from './agentMonitoringService';
export type {
  AgentMetrics,
  DriftAlert,
  UsageReport,
} from './agentMonitoringService';

// ─── Approval Gate (Agent Workflow) ───────────────────────────────────────

export {
  createDefaultApprovalConfig,
  createApprovalGate,
  recordApproverDecision,
  isGateExpired,
  escalateGate,
  validateGatePermissions,
  createApprovalGatesForRecommendations,
} from './approvalGateService';
export type {
  ApprovalGate,
  ApprovalGateApprover,
  ApprovalGateConfig,
  ApprovalGateDecision,
} from './approvalGateService';

// ─── Project Record Adapter ───────────────────────────────────────────────

export {
  toProjectRecord,
  toProjectRecords,
} from './projectRecordAdapter';
export type {
  AgentWorkflowRecord,
  AdapterContext,
} from './projectRecordAdapter';

// ─── Inbox Event Adapter ──────────────────────────────────────────────────

export {
  createInboxEvent,
  workflowEventToInboxEvents,
  workflowEventsToInboxBatch,
} from './inboxEventAdapter';
export type {
  AgentInboxEvent,
  InboxEventBatch,
  InboxEventSeverity,
} from './inboxEventAdapter';

// ─── Audit Trail ──────────────────────────────────────────────────────────

export {
  createAuditRecord,
  createAuditBatch,
  queryAuditRecords,
  summarizeAuditRecords,
} from './auditTrailService';
export type {
  AgentAuditRecord,
  AuditActionType,
  AuditQuery,
  AuditSummary,
} from './auditTrailService';

// ─── Existing Services ────────────────────────────────────────────────────

export { AgentService } from './agentService';
export { AgentRecommendationService } from './agentRecommendationService';
export { AgentEventNormalizer } from './agentEventNormalizer';
