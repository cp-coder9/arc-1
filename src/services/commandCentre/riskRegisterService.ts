/**
 * Project Command Centre — Risk Register Service
 *
 * Manages project risks with CRUD operations, escalation workflow,
 * severity statistics, and audit trail integration. On escalation,
 * creates an Action Centre event for the principal agent.
 * Persists to Firestore `projects/{projectId}/risks/`.
 *
 * @module commandCentre/riskRegisterService
 */

import {
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firebase';
import { getDemoDoc, getDemoCol } from '@/demo-seed/demoFirestore';
import { recordAudit } from '@/services/commandCentre/commandCentreService';
import { createRiskSchema } from '@/services/commandCentre/schemas';
import type {
  RiskItem,
  RiskCategory,
  RiskSeverity,
  RiskStatus,
  CommandCentreAction,
} from '@/services/commandCentre/types';

// ── ID Generation ────────────────────────────────────────────────────────────

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

// ── Collection Constants ─────────────────────────────────────────────────────

const PROJECTS_COL = 'projects';
const RISKS_COL = 'risks';

// ── Firestore Path Helpers ───────────────────────────────────────────────────

function risksCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol(PROJECTS_COL, projectId, RISKS_COL);
}

function riskDocument(projectId: string, riskId: string) {
  if (!projectId) throw new Error('projectId is required');
  if (!riskId) throw new Error('riskId is required');
  return getDemoDoc(PROJECTS_COL, projectId, RISKS_COL, riskId);
}

// ── Risk Stats Interface ─────────────────────────────────────────────────────

export interface RiskStats {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

// ── Create Risk Input ────────────────────────────────────────────────────────

export interface CreateRiskData {
  description: string;
  category: RiskCategory;
  severity: RiskSeverity;
  ownerId: string;
  ownerName: string;
  mitigationPlan?: string;
  createdBy: string;
  aiGenerated?: boolean;
}

// ── Update Risk Input ────────────────────────────────────────────────────────

export interface UpdateRiskData {
  description?: string;
  category?: RiskCategory;
  severity?: RiskSeverity;
  status?: RiskStatus;
  ownerId?: string;
  ownerName?: string;
  mitigationPlan?: string;
}

// ── Escalation Result ────────────────────────────────────────────────────────

export interface EscalationResult {
  risk: RiskItem;
  actionEvent: CommandCentreAction;
}

// ── CRUD Operations ──────────────────────────────────────────────────────────

/**
 * Creates a new risk entry. Validates required fields with Zod schema.
 * New risks start in 'open' status with auto-generated timestamps.
 */
export async function createRisk(
  projectId: string,
  data: CreateRiskData,
): Promise<RiskItem> {
  // Validate required fields via Zod
  const validation = createRiskSchema.safeParse({
    description: data.description,
    category: data.category,
    severity: data.severity,
    ownerId: data.ownerId,
  });

  if (!validation.success) {
    throw new Error(`Validation failed: ${validation.error.issues.map((i) => i.message).join(', ')}`);
  }

  const now = new Date().toISOString();
  const id = generateId();

  const risk: RiskItem = {
    id,
    projectId,
    description: data.description,
    category: data.category,
    severity: data.severity,
    status: 'open',
    ownerId: data.ownerId,
    ownerName: data.ownerName,
    mitigationPlan: data.mitigationPlan,
    createdBy: data.createdBy,
    createdAt: now,
    updatedAt: now,
    aiGenerated: data.aiGenerated,
  };

  try {
    await addDoc(risksCollection(projectId), risk);

    // Record audit entry for risk creation
    void recordAudit({
      projectId,
      actorId: data.createdBy,
      actorName: data.ownerName,
      actionType: 'create',
      entityType: 'risk',
      entityId: id,
      after: { description: risk.description, severity: risk.severity, category: risk.category, status: risk.status },
      timestamp: now,
    });

    return risk;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${projectId}/${RISKS_COL}`);
    throw error;
  }
}

/**
 * Updates a risk's fields. Records audit entry with before/after changes.
 */
export async function updateRisk(
  projectId: string,
  riskId: string,
  data: UpdateRiskData,
): Promise<RiskItem> {
  const docRef = riskDocument(projectId, riskId);

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      throw new Error(`Risk ${riskId} not found in project ${projectId}`);
    }

    const existing = snap.data() as RiskItem;
    const now = new Date().toISOString();

    const updates: Partial<RiskItem> & { updatedAt: string } = {
      ...data,
      updatedAt: now,
    };

    await updateDoc(docRef, updates);

    const updatedRisk: RiskItem = { ...existing, ...updates };

    // Record audit entry for risk update
    void recordAudit({
      projectId,
      actorId: existing.createdBy,
      actorName: existing.ownerName,
      actionType: 'update',
      entityType: 'risk',
      entityId: riskId,
      before: data as Record<string, unknown>,
      after: updates as Record<string, unknown>,
      timestamp: now,
    });

    return updatedRisk;
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${RISKS_COL}/${riskId}`);
    throw error;
  }
}

/**
 * Escalates a risk: changes status to 'escalated', records audit entry,
 * and creates an Action Centre event for the principal agent.
 * Returns both the updated risk and the action event data.
 */
export async function escalateRisk(
  projectId: string,
  riskId: string,
  actorId?: string,
  actorName?: string,
): Promise<EscalationResult> {
  const docRef = riskDocument(projectId, riskId);

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      throw new Error(`Risk ${riskId} not found in project ${projectId}`);
    }

    const existing = snap.data() as RiskItem;
    const now = new Date().toISOString();
    const previousStatus = existing.status;

    const updates = {
      status: 'escalated' as RiskStatus,
      updatedAt: now,
    };

    await updateDoc(docRef, updates);

    const updatedRisk: RiskItem = { ...existing, ...updates };

    // Record audit entry for escalation
    void recordAudit({
      projectId,
      actorId: actorId || existing.createdBy,
      actorName: actorName || existing.ownerName,
      actionType: 'escalation',
      entityType: 'risk',
      entityId: riskId,
      before: { status: previousStatus },
      after: { status: 'escalated' },
      timestamp: now,
    });

    // Create Action Centre event for the principal agent
    const actionEvent: CommandCentreAction = {
      id: generateId(),
      projectId,
      type: 'technical',
      title: `Risk Escalated: ${existing.description.slice(0, 60)}`,
      description: `Risk "${existing.description}" (${existing.severity} severity, ${existing.category}) has been escalated and requires principal agent attention.`,
      assigneeId: 'principal_agent',
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      priority: existing.severity === 'critical' ? 'critical' : 'high',
      sourceSubsystem: 'risk_register',
      sourceEntityId: riskId,
      status: 'pending',
      createdAt: now,
    };

    return { risk: updatedRisk, actionEvent };
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${RISKS_COL}/${riskId}`);
    throw error;
  }
}

// ── Query Operations ─────────────────────────────────────────────────────────

/**
 * Retrieves all risks for a project.
 */
export async function getRisks(projectId: string): Promise<RiskItem[]> {
  try {
    const q = query(risksCollection(projectId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...d.data(), id: d.id } as RiskItem));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${RISKS_COL}`);
    throw error;
  }
}

/**
 * Computes summary counts of risks by severity level.
 * Returns counts for critical, high, medium, low, and total.
 */
export async function getRiskStats(projectId: string): Promise<RiskStats> {
  const risks = await getRisks(projectId);

  const stats: RiskStats = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    total: risks.length,
  };

  for (const risk of risks) {
    if (risk.severity === 'critical') stats.critical++;
    else if (risk.severity === 'high') stats.high++;
    else if (risk.severity === 'medium') stats.medium++;
    else if (risk.severity === 'low') stats.low++;
  }

  return stats;
}

// ── Service Export ───────────────────────────────────────────────────────────

export const riskRegisterService = {
  createRisk,
  updateRisk,
  escalateRisk,
  getRisks,
  getRiskStats,
};

export default riskRegisterService;
