/**
 * Remote Desktop Core — Barrel Index
 *
 * Re-exports all public interfaces from the remote desktop service module.
 */

export * from './types';
export * from './schemas';
export * from './tokenEngine';
export * from './sessionBrokerService';
export * from './allowlistService';
export * from './sessionAuditService';
export * from './signallingService';
export * from './turnProvisioningService';
export * from './bandwidthAdaptationService';
export * from './sessionTimerService';
export * from './fileHandoffService';
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
export * from './governanceService';
export * from './remoteDesktopPassportAdapter';
export * from './remoteDesktopInboxAdapter';
export * from './remoteDesktopAnalyticsAdapter';
export * from './fileApprovalService';
export * from './ownerSessionService';
export * from './sessionLifecycleOrchestrator';
