import type { Firestore } from 'firebase-admin/firestore';
import { ToolboxEngine } from './engine';
import { AuditSnapshotService } from './auditSnapshot';
import { ExportService } from './exportService';
import { IntegrationEventBus } from './integrationEvents';
import { ToolDefinitionRegistry } from './registry';
import { InMemoryToolRunRepository } from './repository';
import { FirestoreToolRunRepository } from './firestoreRepository';
import type { ToolRunRepository } from './repository';
import type { IntegrationEventBusConfig } from './integrationEvents';
import type { FirestoreRepositoryOptions } from './firestoreRepository';

// ─── Feature Flag ────────────────────────────────────────────────────────────
/**
 * When `USE_FIRESTORE_RUNS` is set to 'true' (env var), the engine persists
 * ToolRuns to Firestore. Otherwise, an in-memory repository is used.
 * This allows phased rollout of Firestore persistence in production.
 */
export function useFirestoreRuns(): boolean {
  try {
    return (
      typeof process !== 'undefined' &&
      process.env?.USE_FIRESTORE_RUNS === 'true'
    );
  } catch {
    return false;
  }
}

// ─── Factory Options ─────────────────────────────────────────────────────────
export interface CreateToolboxEngineOptions {
  /** The ToolDefinitionRegistry with all registered tool definitions. */
  registry: ToolDefinitionRegistry;
  /** Optional Firestore instance — required when USE_FIRESTORE_RUNS=true. */
  firestore?: Firestore;
  /** Options for the Firestore repository (demo mode, demo uid). */
  firestoreOptions?: FirestoreRepositoryOptions;
  /** Optional configuration for the IntegrationEventBus (writer, alerter, etc.). */
  eventBusConfig?: IntegrationEventBusConfig;
  /** Override the repository directly (useful for testing). */
  repository?: ToolRunRepository;
}

// ─── Composition Root ────────────────────────────────────────────────────────
/**
 * Creates a fully-wired ToolboxEngine instance.
 *
 * Pipeline: resolve definition → validate input → resolve tables → compute →
 *           preview check → persist → generate exports → emit events → issue/lock
 *
 * Repository selection:
 * - If `options.repository` is provided, it's used directly (for tests).
 * - If `USE_FIRESTORE_RUNS=true` and a Firestore instance is provided, uses FirestoreToolRunRepository.
 * - Otherwise, uses InMemoryToolRunRepository.
 *
 * Requirements: 2.1–2.6, 3.1, 4.1, 5.5, 6.1, 7.1, 8.1, 10.1
 */
export function createToolboxEngine(options: CreateToolboxEngineOptions): ToolboxEngine {
  const { registry, firestore, firestoreOptions, eventBusConfig, repository } = options;

  // Resolve repository based on feature flag
  let repo: ToolRunRepository;
  if (repository) {
    repo = repository;
  } else if (useFirestoreRuns() && firestore) {
    repo = new FirestoreToolRunRepository(firestore, firestoreOptions);
  } else {
    repo = new InMemoryToolRunRepository();
  }

  // Wire services
  const exports = new ExportService();
  const snapshots = new AuditSnapshotService();
  const events = new IntegrationEventBus(eventBusConfig);

  return new ToolboxEngine(registry, repo, exports, snapshots, events);
}

// ─── Re-exports ──────────────────────────────────────────────────────────────
export { ToolboxEngine } from './engine';
export { AuditSnapshotService } from './auditSnapshot';
export { ExportService, EXPORT_FILENAME_PATTERN } from './exportService';
export type { ExportContext } from './exportService';
export { IntegrationEventBus } from './integrationEvents';
export type { IntegrationEventResult, IntegrationEventStatus, IntegrationEventWriter, ActionCentreAlerter, IntegrationEventBusConfig } from './integrationEvents';
export { ProjectAssignmentService } from './projectAssignment';
export type { ProjectAccessChecker, ValidationResult } from './projectAssignment';
export { RunHistoryService } from './historyService';
export { InMemoryToolRunRepository } from './repository';
export type { ToolRunRepository } from './repository';
export { FirestoreToolRunRepository } from './firestoreRepository';
export type { FirestoreRepositoryOptions } from './firestoreRepository';
export { ToolDefinitionRegistry, ToolRouteRegistry } from './registry';
export { toFirestoreDocument, fromFirestoreDocument } from './firestoreMapper';
export type { FirestoreToolRunDocument } from './firestoreMapper';
export { formatZAR, formatClauseRef, formatTariffRef } from './zaFormatting';
export { ToolRunError } from './types';
export type {
  AuditSnapshot, ExportRecord, GovernanceProfile, IntegrationEvent,
  ProjectAssignment, ToolCategory, ToolContext, ToolDefinition, ToolRun,
  ToolRunErrorCode, ToolRunStatus,
} from './types';
