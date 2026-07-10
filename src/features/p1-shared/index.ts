/**
 * P1 Shared Module — Public Exports
 *
 * Cross-cutting infrastructure shared by all P1 feature modules:
 * retry queue, working day calculator, disclaimer components, platform integration adapters.
 */

// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  RetryConfig,
  IntegrationWriteResult,
  DisclaimerConfig,
  WorkingDayConfig,
  SAPublicHoliday,
} from './types';

// ─── Access Control ───────────────────────────────────────────────────────────
export { createP1AccessControlService } from './services/accessControl';
export {
  INSURANCE_REGISTER_PERMISSIONS,
  DISPUTE_RESOLUTION_PERMISSIONS,
  NHBRC_PERMISSIONS,
  SURVEY_GEOMATICS_PERMISSIONS,
  MODULE_PERMISSIONS,
} from './services/accessControl';
export type {
  P1Module,
  P1Action,
  P1AccessContext,
  AccessCheckResult,
  P1AccessControlService,
} from './services/accessControl';

// ─── Retry Queue ──────────────────────────────────────────────────────────────
export type {
  QueuedOperation,
  RetryQueueService,
  RetryQueueConfig,
  PersistenceHook,
  FailedSyncAlert,
  OnFailedSyncAlert,
  CreateRetryQueueOptions,
} from './services/retryQueue';

export { createRetryQueueService, calculateBackoffDelay } from './services/retryQueue';

// ─── Components ───────────────────────────────────────────────────────────────
export { DisclaimerBanner } from './components/DisclaimerBanner';
export type { DisclaimerBannerProps } from './components/DisclaimerBanner';
export { StatusBadge } from './components/StatusBadge';
export type { StatusBadgeProps, StatusBadgeVariant } from './components/StatusBadge';

// ─── Platform Integration ─────────────────────────────────────────────────────
export { createPlatformIntegrationService } from './services/platformIntegration';
export type {
  PassportWritePayload,
  AuditTrailWritePayload,
  ActionCentreWritePayload,
  RiskEngineWritePayload,
  DocumentsWritePayload,
  WriterFn,
  PlatformWriters,
  PlatformIntegrationService,
  CreatePlatformIntegrationOptions,
} from './services/platformIntegration';

// ─── SpecForge Integration ────────────────────────────────────────────────────
export { createSpecForgeIntegrationService } from './services/specForgeIntegration';
export type {
  SpecificationChangeRecord,
  SpecForgeIntegrationService,
} from './services/specForgeIntegration';

// ─── Closeout Integration ─────────────────────────────────────────────────────
export { createCloseoutIntegrationService, generateP1CloseoutItems } from './services/closeoutIntegration';
export type { CloseoutChecklistItem, CloseoutIntegrationService } from './services/closeoutIntegration';

// ─── Services ─────────────────────────────────────────────────────────────────
export { createWorkingDayCalculator } from './services/workingDayCalculator';
export type { WorkingDayCalculator } from './services/workingDayCalculator';
