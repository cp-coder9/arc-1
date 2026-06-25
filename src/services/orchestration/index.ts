/**
 * Orchestration Layer — Main public API
 *
 * Exports all orchestration services, types, and hooks for use in dashboards and components.
 * Validates: Requirements 1.1, 1.3, 2.6, 5.4
 */

// Services
export { createProjectStateService } from './projectStateService';
export { buildActionCentre, hasOutstandingActions, NO_OUTSTANDING_ACTIONS_MESSAGE } from './actionCentreService';
export { generateGuidance } from './aiGuidanceService';
export { initiateHandoff, resolveHandoff, checkOverdue } from './handoffService';
export { upsertTask, recomputeSchedule, getUnifiedProgramme, visibleTasks, overdueEvents } from './programmeService';
export { evaluateAdvancement, advancePhase } from './phaseProgressionService';
export { reconcileToolRun, linkSharedRecord } from './toolReconciliationService';
export { authorize } from './accessControlService';

// Types
export * from './orchestrationTypes';

// Hooks and Context
export { useOrchestrationServices } from './hooks/useOrchestrationServices';
export { OrchestrationProvider, useOrchestration } from './context/OrchestrationProvider';

export type { OrchestrationProviderProps } from './context/OrchestrationProvider';
