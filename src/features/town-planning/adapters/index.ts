/**
 * Town Planning Integration Adapters
 *
 * Thin integration layers that connect town planning services
 * to platform modules (Project Passport, Risk Engine, Action Centre,
 * Audit Trail, Documents, Compliance Hub, Readiness, Team Router).
 *
 * Each adapter accepts its target function as a DI parameter for testability.
 */

export {
  updatePlanningStatus,
  markPlanningPhaseComplete,
  type PlanningPassportUpdate,
  type PassportAdapterDeps,
} from './passportAdapter';

export {
  createPlanningBlockerRisk,
  clearPlanningBlockerRisk,
  type PlanningRiskEvent,
  type RiskAdapterDeps,
} from './riskAdapter';

export {
  createDeadlineAction,
  createNotification,
  createCalendarEvent,
  type DeadlineActionParams,
  type NotificationParams,
  type CalendarEventParams,
  type ActionCentreAdapterDeps,
} from './actionCentreAdapter';

export {
  recordEvent,
  type TownPlanningAuditEvent,
  type AuditAdapterDeps,
} from './auditAdapter';

export {
  registerControlledDocument,
  type DocumentRegistrationParams,
  type DocumentAdapterDeps,
} from './documentAdapter';

export {
  updateZoningParameters,
  type ComplianceHubAdapterDeps,
} from './complianceHubAdapter';

export {
  updatePlanningReadiness,
  type PlanningReadinessStatus,
  type ReadinessAdapterDeps,
} from './readinessAdapter';

export {
  requestProfessionalAppointment,
  type ProfessionalAppointmentRequest,
  type TeamRouterAdapterDeps,
} from './teamRouterAdapter';

export {
  withRetry,
  type RetryOptions,
} from './retryUtils';
