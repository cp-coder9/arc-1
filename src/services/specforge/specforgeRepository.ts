/**
 * SpecForge Repository — persistence interface + local implementation + factory.
 * 
 * This repository provides a clean seam between the SpecForge service/UI
 * and the persistence layer. The LocalSpecForgeRepository uses in-memory
 * state (seeded from SAMPLE_WORKSPACE for demo). In production mode,
 * the FirestoreSpecForgeRepository is used for live Firestore persistence.
 *
 * The factory (`initSpecForgeRepository`) checks VITE_DEMO_MODE to select
 * the appropriate implementation at runtime.
 */
import type { 
  SpecForgeWorkspace, SpecItem, SpecSection, SpecIssueSnapshot,
  SpecAuditEvent, SpecProcurementEntry, SpecApproval, SpecSubstitution,
  SpecForgeRole 
} from '@/types/specforgeTypes';
import { SAMPLE_WORKSPACE, SAMPLE_PROCUREMENT_ENTRIES } from './specforgeSampleData';

// ── Repository Interface ────────────────────────────────────────────────

export interface SpecForgeRepository {
  // Workspace
  getWorkspace(projectId: string): Promise<SpecForgeWorkspace | null>;
  saveWorkspace(workspace: SpecForgeWorkspace): Promise<void>;
  
  // Items
  addItem(projectId: string, item: SpecItem): Promise<void>;
  updateItem(projectId: string, itemId: string, updates: Partial<SpecItem>): Promise<void>;
  deleteItem(projectId: string, itemId: string): Promise<void>;
  
  // Sections
  addSection(projectId: string, section: SpecSection): Promise<void>;
  updateSection(projectId: string, sectionId: string, updates: Partial<SpecSection>): Promise<void>;
  
  // Snapshots (immutable)
  saveSnapshot(snapshot: SpecIssueSnapshot): Promise<void>;
  getSnapshots(projectId: string): Promise<SpecIssueSnapshot[]>;
  
  // Audit
  logAuditEvent(event: SpecAuditEvent): Promise<void>;
  getAuditEvents(projectId: string, limit?: number): Promise<SpecAuditEvent[]>;
  
  // Procurement
  getProcurementEntries(projectId: string): Promise<SpecProcurementEntry[]>;
  updateProcurementEntry(projectId: string, entryId: string, updates: Partial<SpecProcurementEntry>): Promise<void>;
  
  // Approvals
  saveApproval(projectId: string, approval: SpecApproval): Promise<void>;
  getApprovals(projectId: string): Promise<SpecApproval[]>;
  
  // Substitutions
  saveSubstitution(projectId: string, substitution: SpecSubstitution): Promise<void>;
  getSubstitutions(projectId: string): Promise<SpecSubstitution[]>;
}

// ── Local Implementation (demo/dev) ────────────────────────────────────

export class LocalSpecForgeRepository implements SpecForgeRepository {
  private workspaces = new Map<string, SpecForgeWorkspace>();
  private snapshots = new Map<string, SpecIssueSnapshot[]>();
  private auditEvents = new Map<string, SpecAuditEvent[]>();
  private procurement = new Map<string, SpecProcurementEntry[]>();
  private approvals = new Map<string, SpecApproval[]>();
  private substitutions = new Map<string, SpecSubstitution[]>();

  constructor() {
    // Seed with sample data for demo
    this.workspaces.set(SAMPLE_WORKSPACE.projectId, SAMPLE_WORKSPACE);
    this.procurement.set(SAMPLE_WORKSPACE.projectId, [...SAMPLE_PROCUREMENT_ENTRIES]);
  }

  async getWorkspace(projectId: string): Promise<SpecForgeWorkspace | null> {
    return this.workspaces.get(projectId) ?? null;
  }

  async saveWorkspace(workspace: SpecForgeWorkspace): Promise<void> {
    this.workspaces.set(workspace.projectId, workspace);
  }

  async addItem(projectId: string, item: SpecItem): Promise<void> {
    const ws = this.workspaces.get(projectId);
    if (ws) { ws.items = [...ws.items, item]; }
  }

  async updateItem(projectId: string, itemId: string, updates: Partial<SpecItem>): Promise<void> {
    const ws = this.workspaces.get(projectId);
    if (ws) { ws.items = ws.items.map(i => i.id === itemId ? { ...i, ...updates } : i); }
  }

  async deleteItem(projectId: string, itemId: string): Promise<void> {
    const ws = this.workspaces.get(projectId);
    if (ws) { ws.items = ws.items.filter(i => i.id !== itemId); }
  }

  async addSection(projectId: string, section: SpecSection): Promise<void> {
    const ws = this.workspaces.get(projectId);
    if (ws) { ws.sections = [...ws.sections, section]; }
  }

  async updateSection(projectId: string, sectionId: string, updates: Partial<SpecSection>): Promise<void> {
    const ws = this.workspaces.get(projectId);
    if (ws) { ws.sections = ws.sections.map(s => s.id === sectionId ? { ...s, ...updates } : s); }
  }

  async saveSnapshot(snapshot: SpecIssueSnapshot): Promise<void> {
    const existing = this.snapshots.get(snapshot.projectId) ?? [];
    this.snapshots.set(snapshot.projectId, [...existing, snapshot]);
  }

  async getSnapshots(projectId: string): Promise<SpecIssueSnapshot[]> {
    return this.snapshots.get(projectId) ?? [];
  }

  async logAuditEvent(event: SpecAuditEvent): Promise<void> {
    const existing = this.auditEvents.get(event.workspaceId) ?? [];
    this.auditEvents.set(event.workspaceId, [...existing, event]);
  }

  async getAuditEvents(projectId: string, limit = 50): Promise<SpecAuditEvent[]> {
    return (this.auditEvents.get(projectId) ?? []).slice(-limit);
  }

  async getProcurementEntries(projectId: string): Promise<SpecProcurementEntry[]> {
    return this.procurement.get(projectId) ?? [];
  }

  async updateProcurementEntry(projectId: string, entryId: string, updates: Partial<SpecProcurementEntry>): Promise<void> {
    const entries = this.procurement.get(projectId) ?? [];
    this.procurement.set(projectId, entries.map(e => e.id === entryId ? { ...e, ...updates } : e));
  }

  async saveApproval(projectId: string, approval: SpecApproval): Promise<void> {
    const existing = this.approvals.get(projectId) ?? [];
    this.approvals.set(projectId, [...existing, approval]);
  }

  async getApprovals(projectId: string): Promise<SpecApproval[]> {
    return this.approvals.get(projectId) ?? [];
  }

  async saveSubstitution(projectId: string, substitution: SpecSubstitution): Promise<void> {
    const existing = this.substitutions.get(projectId) ?? [];
    this.substitutions.set(projectId, [...existing, substitution]);
  }

  async getSubstitutions(projectId: string): Promise<SpecSubstitution[]> {
    return this.substitutions.get(projectId) ?? [];
  }
}

// ── Singleton factory ───────────────────────────────────────────────────

let _repository: SpecForgeRepository | null = null;

/**
 * Initialise the appropriate SpecForge repository based on environment.
 * Returns LocalSpecForgeRepository in demo mode, FirestoreSpecForgeRepository in production.
 * Uses dynamic import for FirestoreSpecForgeRepository to avoid pulling firebase-admin into client bundles.
 *
 * Requirements: 11.4
 */
export async function initSpecForgeRepository(): Promise<SpecForgeRepository> {
  const isDemoMode = typeof process !== 'undefined'
    ? process.env.VITE_DEMO_MODE === 'true'
    : false;

  if (isDemoMode) {
    return new LocalSpecForgeRepository();
  }
  const { FirestoreSpecForgeRepository } = await import('./firestoreSpecForgeRepository');
  return new FirestoreSpecForgeRepository();
}

/**
 * Get the active SpecForge repository instance.
 * Returns the LocalSpecForgeRepository as default (safe for client bundles).
 * Server-side code should call `initSpecForgeRepository()` explicitly for production mode.
 */
export function getSpecForgeRepository(): SpecForgeRepository {
  if (!_repository) {
    // Default to local repo — safe for client bundles (no firebase-admin).
    // Server routes use initSpecForgeRepository() which dynamically loads FirestoreSpecForgeRepository.
    _repository = new LocalSpecForgeRepository();
  }
  return _repository;
}

/**
 * Replace the repository implementation (for testing or manual override).
 */
export function setSpecForgeRepository(repo: SpecForgeRepository): void {
  _repository = repo;
}
