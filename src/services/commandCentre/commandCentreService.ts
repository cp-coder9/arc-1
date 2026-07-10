/**
 * Project Command Centre — Core Service
 *
 * Manages Command Centre configuration, initialization, and audit trail.
 * Config persisted at `projects/{projectId}/command_centre_config/settings`.
 * Audit trail appended at `projects/{projectId}/audit_trail/`.
 *
 * @module commandCentre/commandCentreService
 */

import {
  getDoc,
  setDoc,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import { getDemoDoc, getDemoCol } from '@/demo-seed/demoFirestore';
import type { CommandCentreConfig, AuditEntry, ComplexityMode } from '@/services/commandCentre/types';

// ── ID Generation ────────────────────────────────────────────────────────────

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

// ── Collection Constants ─────────────────────────────────────────────────────

const PROJECTS_COL = 'projects';
const CONFIG_SUBCOL = 'command_centre_config';
const CONFIG_DOC = 'settings';
const AUDIT_TRAIL_COL = 'audit_trail';

// ── Firestore Path Helpers ───────────────────────────────────────────────────

function configDocument(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoDoc(PROJECTS_COL, projectId, CONFIG_SUBCOL, CONFIG_DOC);
}

function auditTrailCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol(PROJECTS_COL, projectId, AUDIT_TRAIL_COL);
}

// ── Filter Interface ─────────────────────────────────────────────────────────

export interface AuditTrailFilters {
  entityType?: string;
  actionType?: string;
  actorId?: string;
  startDate?: string;
  endDate?: string;
}

// ── Config Management ────────────────────────────────────────────────────────

/**
 * Retrieves the Command Centre configuration for a project.
 * Returns null if no config has been initialized.
 */
export async function getConfig(projectId: string): Promise<CommandCentreConfig | null> {
  try {
    const snap = await getDoc(configDocument(projectId));
    if (!snap.exists()) return null;
    return snap.data() as CommandCentreConfig;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${CONFIG_SUBCOL}/${CONFIG_DOC}`);
  }
}

/**
 * Updates the Command Centre configuration for a project.
 * Merges provided fields into existing config document.
 */
export async function updateConfig(
  projectId: string,
  config: Partial<CommandCentreConfig>,
): Promise<void> {
  try {
    await setDoc(configDocument(projectId), config, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${CONFIG_SUBCOL}/${CONFIG_DOC}`);
  }
}

/**
 * Initializes the Command Centre for a project with initial settings.
 * Determines the default complexity mode based on contract value threshold (R 5,000,000).
 */
export async function initializeCommandCentre(
  projectId: string,
  settings: {
    contractValue: number;
    projectType: string;
    complexityMode?: ComplexityMode;
  },
): Promise<CommandCentreConfig> {
  const CONTRACT_VALUE_THRESHOLD = 5_000_000;

  const defaultMode: ComplexityMode =
    settings.complexityMode ??
    (settings.contractValue >= CONTRACT_VALUE_THRESHOLD ? 'full' : 'simple');

  const config: CommandCentreConfig = {
    projectId,
    complexityMode: defaultMode,
    contractValue: settings.contractValue,
    projectType: settings.projectType,
    integrations: [
      { module: 'specforge', connected: false },
      { module: 'project_passport', connected: false },
      { module: 'document_intelligence', connected: false },
      { module: 'payment_gateway', connected: false },
    ],
  };

  try {
    await setDoc(configDocument(projectId), config);
    return config;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${projectId}/${CONFIG_SUBCOL}/${CONFIG_DOC}`);
  }
}

// ── Audit Trail ──────────────────────────────────────────────────────────────

/**
 * Records an audit trail entry. Audit entries are append-only — no update or delete.
 * Generates a unique ID if not already set on the entry.
 *
 * This function is designed as fire-and-forget: it logs errors but does NOT
 * throw, so it never blocks the primary operation.
 */
export async function recordAudit(entry: Omit<AuditEntry, 'id'> & { id?: string }): Promise<void> {
  try {
    const auditEntry: AuditEntry = {
      ...entry,
      id: entry.id ?? generateId(),
      timestamp: entry.timestamp || new Date().toISOString(),
    };
    await addDoc(auditTrailCollection(entry.projectId), auditEntry);
  } catch (error) {
    // Audit trail writes MUST NOT block the primary operation.
    // Log the error and continue — fire-and-forget with error logging.
    console.error(
      '[CommandCentre] Audit trail write failed:',
      error instanceof Error ? error.message : String(error),
      { projectId: entry.projectId, entityType: entry.entityType, actionType: entry.actionType },
    );
  }
}

/**
 * Retrieves the audit trail for a project with optional filters.
 * Supports filtering by entityType, actionType, actorId, and date range.
 */
export async function getAuditTrail(
  projectId: string,
  filters?: AuditTrailFilters,
): Promise<AuditEntry[]> {
  try {
    const constraints: Parameters<typeof query>[1][] = [orderBy('timestamp', 'desc')];

    if (filters?.entityType) {
      constraints.push(where('entityType', '==', filters.entityType));
    }
    if (filters?.actionType) {
      constraints.push(where('actionType', '==', filters.actionType));
    }
    if (filters?.actorId) {
      constraints.push(where('actorId', '==', filters.actorId));
    }
    if (filters?.startDate) {
      constraints.push(where('timestamp', '>=', filters.startDate));
    }
    if (filters?.endDate) {
      constraints.push(where('timestamp', '<=', filters.endDate));
    }

    const q = query(auditTrailCollection(projectId), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditEntry));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${AUDIT_TRAIL_COL}`);
  }
}

// ── Service Export ───────────────────────────────────────────────────────────

export const commandCentreService = {
  getConfig,
  updateConfig,
  initializeCommandCentre,
  recordAudit,
  getAuditTrail,
};

export default commandCentreService;
