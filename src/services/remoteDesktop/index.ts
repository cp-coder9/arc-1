/**
 * Remote Desktop Core — Barrel Index
 *
 * Re-exports all public interfaces from the remote desktop service module.
 *
 * When modules re-export names that conflict with types.ts, we use selective
 * re-exports to avoid TypeScript's TS2308 "already exported" ambiguity errors.
 */

// ─── Core Types (canonical source for shared interfaces) ──────────────────────
export {
  // Re-exported resource booking types
  type ResourceBookingStatus,
  type ResourceBookingWindow,
  type ResourceUsageLedgerEntry,

  // Firestore timestamp
  type FirestoreTimestamp,

  // Host
  HOST_STATUS,
  type HostStatus,
  type HostHardwareSpecs,
  type HostConfig,
  type HostRecord,

  // Session status (constant object form)
  SESSION_STATUS,

  // Connection
  CONNECTION_TYPE,

  // App
  APP_VALIDATION_STATUS,
  type AppValidationStatus,
  type RemoteDesktopApp,
  type AppRecord,

  // File transfer
  FILE_TRANSFER_STATUS,
  type FileTransferStatus,
  MANIFEST_APPROVAL_STATUS,
  type ManifestApprovalStatus,
  type FileManifestEntry,
  type RemoteDesktopFileManifest,
  type FileManifest,

  // Incident
  INCIDENT_CATEGORY,
  type IncidentCategory,
  INCIDENT_STATUS,
  type IncidentStatus,
  type IncidentReport,

  // Roles
  type ActorRole,
  type ReporterRole,

  // Clipboard
  CLIPBOARD_POLICY,
  type ClipboardPolicy,

  // Recording
  type RecordingStatus,
  type RemoteDesktopRecording,

  // Session event types (object map form)
  SESSION_EVENT_TYPES,
  type SessionEventType,

  // Error codes
  type RemoteDesktopErrorCode,
  type RemoteDesktopError,
  GATE_ERROR_CODES,
  type GateErrorCode,
  TOKEN_ERROR_CODES,
  type TokenErrorCode,
  SESSION_ERROR_CODES,
  type SessionErrorCode,

  // Deny list
  DEFAULT_DENY_LIST_EXTENSIONS,

  // Consent
  type ConsentType,
  type PopiaConsentRecord,

  // Defaults
  REMOTE_DESKTOP_DEFAULTS,

  // Token
  type SessionTokenPayload,
  type SessionToken,

  // Session (Firestore shape)
  type SessionStatus,
  type RemoteDesktopSession,

  // Session (design-doc ISO-string shape)
  type SessionRecord,
  type ConnectionType,

  // Event (Firestore shape)
  type RemoteDesktopSessionEvent,
  // Event (design-doc shape)
  type SessionEvent,

  // Gate
  type SessionGateInput,
  type SessionGateError,
  type SessionGateResult,

  // Summary
  type SessionSummary,

  // Workflow / Analytics
  type RemoteDesktopWorkflowEvent,
  type RemoteDesktopKPIs,
} from './types';

// ─── Session Gate ─────────────────────────────────────────────────────────────
export { evaluateSessionGate } from './sessionGateService';

// ─── Schemas ──────────────────────────────────────────────────────────────────
export * from './schemas';

// ─── Token Engine ─────────────────────────────────────────────────────────────
export * from './tokenEngine';

// ─── Token Service ────────────────────────────────────────────────────────────
export {
  generateSessionToken,
  verifySessionToken,
  consumeToken,
  revokeToken as revokeSessionToken,
  isTokenExpired,
  deriveReconnectionToken,
  getTokenStore,
  clearTokenStore,
  stopCleanupInterval,
  rotateSecret,
  type TokenStoreEntry,
  type GenerateTokenInput as TokenServiceGenerateInput,
  type VerifyResult,
  type ReconnectionToken,
} from './tokenService';

// ─── Session Broker ───────────────────────────────────────────────────────────
// Uses selective exports to avoid SessionRecord/SessionStatus conflicts
export {
  type DisconnectionReason,
  type CreateSessionInput,
  type ActivateSessionInput,
  type EndSessionInput,
  type ReconnectionInput,
  type ReconnectionResult,
  createSession,
  activateSession,
  endSession,
  failSession,
  handleReconnection,
  recordDisconnect,
  handleBookingCancellation,
  getSession,
  getSessionsByHost,
  getSessionsByConsumer,
  isTerminalState,
  getMaxReconnectionAttempts,
  getConnectionTimeoutMs,
  _clearAllSessions,
  _getSessionCount,
} from './sessionBrokerService';

// ─── Allowlist ────────────────────────────────────────────────────────────────
export * from './allowlistService';

// ─── Audit ────────────────────────────────────────────────────────────────────
// Uses selective exports to avoid SESSION_EVENT_TYPES/ActorRole conflicts
export {
  type WriteAuditEventInput,
  type AuditQueryOptions,
  type PaginatedAuditResult,
  writeAuditEvent,
  writeBatchAuditEvents,
  queryAuditEvents,
  querySessionEvents,
  updateAuditEvent,
  deleteAuditEvent,
} from './sessionAuditService';

// ─── Audit Event Service (Chain Hash + Buffer + Query) ────────────────────────
export {
  createAuditEvent,
  computeEventHash,
  writeAuditEvent as writeChainedAuditEvent,
  bufferEvent,
  flushBuffer,
  getLastEventHash,
  getBufferSize,
  getBufferedEvents,
  querySessionEvents as queryChainedSessionEvents,
  queryByHostId,
  queryByConsumerUid,
  queryByEventType,
  verifyChainIntegrity,
  setEventWriter,
  clearEventWriter,
  REQUIRED_EVENT_TYPES,
  type CreateAuditEventInput,
  type WriteResult,
  type FlushResult,
  type DateRange,
  type QueryOptions as AuditEventQueryOptions,
  type PaginatedResult,
  type EventWriter,
} from './auditEventService';

// ─── POPIA Consent ────────────────────────────────────────────────────────────
export {
  hashIpAddress,
  createConsentRecord,
  validateConsentForStream,
  isRecordingEnabled,
  canApplyPolicyChange,
  registerActiveSession,
  deregisterSession,
  getSessionPolicySnapshot,
  handleConsentTimeout,
  declineConsent,
  grantScreenshotConsent,
  hasScreenshotConsent,
  getConsentPromptContent,
  CONSENT_TIMEOUT_MS,
  RETENTION_PERIOD_DAYS,
  RECORDING_ACCESS_LIST,
  type CreateConsentInput,
  type ConsentValidation,
  type ConsentDeclinedResult,
  type ConsentPromptContent,
} from './popiaConsentService';

// ─── Signalling ───────────────────────────────────────────────────────────────
export * from './signallingService';

// ─── TURN Provisioning ────────────────────────────────────────────────────────
// Uses selective exports to avoid ConnectionType conflict
export {
  type TurnCredentials,
  type TurnProvider,
  type SessionStartedEventInput,
  type TurnProvisioningConfig,
  loadTurnConfig,
  generateTurnCredentials,
  getP2PTimeoutMs,
  areCredentialsValid,
  writeSessionStartedEvent,
} from './turnProvisioningService';

// ─── Bandwidth Adaptation ─────────────────────────────────────────────────────
export * from './bandwidthAdaptationService';

// ─── Session Timer ────────────────────────────────────────────────────────────
export * from './sessionTimerService';

// ─── File Handoff ─────────────────────────────────────────────────────────────
export {
  createSessionWorkspace,
  monitorWorkspace,
  stopMonitoring,
  getFileManifest,
  compileAndWriteFinalManifest,
  getWorkspaceInfo,
  getFinalManifest,
  getFinalManifestBySession,
  isMonitoring,
  createManifest,
  approveManifest,
  rejectFiles,
  checkExpiry,
  updateTransferStatus,
  associateProjectReference,
  getApprovalManifest,
  getProjectAssociation,
  _clearAllState as _clearAllFileHandoffState,
  _getWorkspaceCount,
  _getFinalManifestCount,
  _injectManifest,
  _injectWorkspaceInfo,
  _injectApprovalManifest,
  _getApprovalManifestCount,
  _getProjectAssociationCount,
  type SessionWorkspaceInfo,
  type WorkspaceMonitorOptions,
  type FinalManifestInput,
  type FinalManifestResult,
  type CreateManifestInput,
  type CreateManifestFileInput,
  type CreateManifestResult,
  type BlockedFileEntry,
  type OversizedFileEntry,
  type ApproveManifestResult,
  type RejectFilesResult,
  type ExpiryCheckResult,
  type ProjectReferenceAssociation,
} from './fileHandoffService';

// ─── Workspace Retention ──────────────────────────────────────────────────────
export {
  RETENTION_PERIOD_MS,
  RETENTION_PERIOD_HOURS,
  isWorkspaceExpired,
  getRetentionDeadline,
  handleExpiry,
  deleteWorkspaceContents,
  getRetentionInfo,
  registerSessionForRetention,
  isSessionExpired,
  _clearAllState as _clearAllRetentionState,
  _getAuditEvent,
  _getRegisteredCount,
  _getExpiredCount,
} from './workspaceRetentionService';
export type { WorkspaceExpiryResult, WorkspaceRetentionInfo, AuditEventWriter, WorkspaceResolver } from './workspaceRetentionService';

// ─── Governance ───────────────────────────────────────────────────────────────
export * from './governanceService';

// ─── Governance Bridge ────────────────────────────────────────────────────────
export * from './governanceBridgeService';

// ─── Platform Adapters ────────────────────────────────────────────────────────
export * from './remoteDesktopPassportAdapter';
export * from './remoteDesktopInboxAdapter';
export * from './remoteDesktopAnalyticsAdapter';

// ─── File Approval ────────────────────────────────────────────────────────────
export * from './fileApprovalService';

// ─── Owner Session ────────────────────────────────────────────────────────────
export * from './ownerSessionService';

// ─── Session Broker Orchestrator (Top-Level) ─────────────────────────────────
export {
  startSession as orchestrateSessionStart,
  orchestratedEndSession,
  handlePolicyViolation,
  enforceAutoDisconnect,
  handleSecurityPause,
  enforceSecurityTimeout,
  getAutoDisconnectTimer,
  getSecurityPauseRecord,
  getAuditLog as getOrchestratorAuditLog,
  getPolicyViolationDeadlineMs,
  getSecurityTimeoutMs as getOrchestratorSecurityTimeoutMs,
  _clearOrchestratorState,
  _getAutoDisconnectTimerCount,
  _getSecurityPauseCount,
  type StartSessionInput,
  type StartSessionResult,
  type EndSessionResult,
  type PolicyViolationType,
  type PolicyViolationResult,
  type AutoDisconnectResult,
  type SecurityPauseResult,
} from './sessionBrokerOrchestrator';

// ─── Session Lifecycle Orchestrator ───────────────────────────────────────────
export * from './sessionLifecycleOrchestrator';

// ─── Incident Service ─────────────────────────────────────────────────────────
export {
  createIncident,
  updateIncidentStatus,
  createAutoIncident,
  getIncident,
  getIncidentsBySession,
  isWithinReportingWindow,
  getSecurityTimeout,
  checkSecurityTimeouts,
  getSignals,
  getWorkflowEvents as getIncidentWorkflowEvents,
  _clearAllState as _clearAllIncidentState,
  _getIncidentCount,
  _getSecurityTimeoutCount,
  type CreateIncidentInput,
  type UpdateIncidentStatusInput,
  type CreateAutoIncidentInput,
  type InputPauseSignal,
  type SessionTerminationSignal,
  type IncidentSignal,
  type SecurityTimeout,
} from './incidentService';

// ─── Host Registry ────────────────────────────────────────────────────────────
export {
  registerHost,
  processHeartbeat,
  detectOfflineHosts,
  deactivateHost,
  addApp as addHostApp,
  removeApp as removeHostApp,
  getAppsByHost as getHostApps,
  getApp as getHostApp,
  getHost,
  getHostsByOwner,
  validateAgentVersion,
  validateExecutablePath as validateHostExecutablePath,
  parseSemver,
  compareSemver,
  _clearAllState as _clearAllHostState,
  _getHostCount,
  _getAppCount as _getHostAppCount,
  MIN_SUPPORTED_VERSION,
  CURRENT_AGENT_VERSION,
  MAX_APPS_PER_HOST,
  HEARTBEAT_TIMEOUT_MS as HOST_HEARTBEAT_TIMEOUT_MS,
  MAX_MAJOR_VERSION_LAG,
  type RegisterHostInput,
  type AddAppInput as HostAddAppInput,
  type AgentVersionResult,
  type DeactivationResult,
  type OfflineDetectionResult,
} from './hostRegistryService';
