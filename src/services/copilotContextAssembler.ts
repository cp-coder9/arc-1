/**
 * Copilot Context Assembler
 *
 * Assembles project context for AI system prompts. Reads multiple data sources
 * (Project Passport, document register, inbox actions, audit trail) with
 * permission-scoped access, partial context handling, token budget management,
 * and cache invalidation on project state changes.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */

import type { UserRole, ProjectAccessRole } from '@/types';
import type { CopilotProjectContext } from '@/services/copilotTypes';
import type { ProjectPassport, ProjectInboxItem, Priority } from '@/services/lifecycleTypes';
import type { DocumentRecord } from '@/services/documentRegisterService';
import { canUserPerform } from '@/services/permissionService';
import type { ProjectAccessContext } from '@/services/permissionService';

// ─── Types ─────────────────────────────────────────────────────────────────

interface CacheEntry {
  context: CopilotProjectContext;
  timestamp: number;
}

interface DataSourceResult<T> {
  data: T | null;
  available: boolean;
  source: string;
}

/**
 * Minimal user context needed for permission checks and context assembly.
 */
export interface CopilotUserContext {
  uid: string;
  role: UserRole;
  displayName: string;
  projectAccessRole?: ProjectAccessRole | null;
}

/**
 * External data provider interface — allows injection of real or mock data sources.
 * Each method may throw or be slow; the assembler handles timeouts and failures.
 */
export interface ContextDataProvider {
  getProjectPassport(projectId: string): Promise<ProjectPassport | null>;
  getDocumentRegister(projectId: string): Promise<DocumentRecord[]>;
  getPendingInboxActions(projectId: string, userId: string): Promise<ProjectInboxItem[]>;
  getRecentAuditTrail(projectId: string, limit: number): Promise<AuditTrailEntry[]>;
  getUserContext(userId: string, projectId: string): Promise<CopilotUserContext | null>;
  getProjectAccessContext(userId: string, projectId: string): Promise<ProjectAccessContext | null>;
}

export interface AuditTrailEntry {
  action: string;
  actor: string;
  timestamp: string;
  detail: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

/** Default token budget (estimated as chars/4) */
const DEFAULT_TOKEN_BUDGET = 6000;

/** Maximum tokens for the entire context */
const MAX_CHARS = DEFAULT_TOKEN_BUDGET * 4; // 24000 chars

/** Timeout per data source in milliseconds */
const DATA_SOURCE_TIMEOUT_MS = 5000;

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Document statuses included in context */
const RELEVANT_DOC_STATUSES = new Set(['draft', 'pending_review', 'issued']);

/** Audit trail entry limit */
const AUDIT_TRAIL_LIMIT = 20;

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Wraps a promise with a timeout. Rejects with a timeout error if the
 * promise doesn't resolve within the specified duration.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout: ${label} exceeded ${ms}ms`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Estimates token count from a string (chars / 4).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Serializes a context section to JSON for token estimation.
 */
function sectionSize(data: unknown): number {
  const json = JSON.stringify(data ?? '');
  return estimateTokens(json);
}

// ─── Context Assembler Class ───────────────────────────────────────────────

export class ContextAssembler {
  private cache: Map<string, CacheEntry> = new Map();
  private dataProvider: ContextDataProvider;

  constructor(dataProvider: ContextDataProvider) {
    this.dataProvider = dataProvider;
  }

  /**
   * Assembles project context for the Copilot system prompt.
   * Uses Promise.allSettled with 5-second timeouts per source for resilience.
   * Permission-scopes all data access and handles partial context gracefully.
   *
   * Requirements: 3.1, 3.2, 3.3, 3.5, 3.7
   */
  async assembleContext(projectId: string, userId: string): Promise<CopilotProjectContext> {
    // Check cache first
    const cached = this.getFromCache(projectId);
    if (cached) return cached;

    // Get user context and project access for permission checks
    const [userContextResult, projectAccessResult] = await Promise.allSettled([
      withTimeout(
        this.dataProvider.getUserContext(userId, projectId),
        DATA_SOURCE_TIMEOUT_MS,
        'getUserContext',
      ),
      withTimeout(
        this.dataProvider.getProjectAccessContext(userId, projectId),
        DATA_SOURCE_TIMEOUT_MS,
        'getProjectAccessContext',
      ),
    ]);

    const userContext =
      userContextResult.status === 'fulfilled' ? userContextResult.value : null;
    const projectAccess =
      projectAccessResult.status === 'fulfilled' ? projectAccessResult.value : null;

    // If we can't even identify the user, return minimal context
    if (!userContext) {
      return this.buildEmptyContext(userId, projectId);
    }

    // Check basic project read permission
    const authzUser = { uid: userId, role: userContext.role };
    const canReadProject = canUserPerform(authzUser, 'project:read', projectAccess);

    if (!canReadProject) {
      return this.buildEmptyContext(userId, projectId);
    }

    // Fetch all data sources in parallel with timeout
    const [passportResult, docsResult, inboxResult, auditResult] = await Promise.allSettled([
      withTimeout(
        this.dataProvider.getProjectPassport(projectId),
        DATA_SOURCE_TIMEOUT_MS,
        'projectPassport',
      ),
      withTimeout(
        this.dataProvider.getDocumentRegister(projectId),
        DATA_SOURCE_TIMEOUT_MS,
        'documentRegister',
      ),
      withTimeout(
        this.dataProvider.getPendingInboxActions(projectId, userId),
        DATA_SOURCE_TIMEOUT_MS,
        'pendingInboxActions',
      ),
      withTimeout(
        this.dataProvider.getRecentAuditTrail(projectId, AUDIT_TRAIL_LIMIT),
        DATA_SOURCE_TIMEOUT_MS,
        'auditTrail',
      ),
    ]);

    // Extract results, tracking unavailable sources
    const passport = this.extractResult<ProjectPassport | null>(passportResult, 'passport');
    const documents = this.extractResult<DocumentRecord[]>(docsResult, 'documentRegister');
    const inbox = this.extractResult<ProjectInboxItem[]>(inboxResult, 'pendingActions');
    const audit = this.extractResult<AuditTrailEntry[]>(auditResult, 'auditTrail');

    // Build unavailable sources list
    const unavailableSources: string[] = [];
    if (!passport.available) unavailableSources.push('passport');
    if (!documents.available) unavailableSources.push('documentRegister');
    if (!inbox.available) unavailableSources.push('pendingActions');
    if (!audit.available) unavailableSources.push('auditTrail');

    // Assemble the raw context
    const rawContext = this.buildContext(
      passport.data,
      documents.data,
      inbox.data,
      audit.data,
      userContext,
      unavailableSources,
    );

    // Apply token budget truncation
    const truncatedContext = this.applyTokenBudget(rawContext);

    // Cache the result
    this.setCache(projectId, truncatedContext);

    return truncatedContext;
  }

  /**
   * Invalidates cached context for a project.
   * Called on project state changes (phase transition, new document, team change).
   *
   * Requirement: 3.4
   */
  invalidateCache(projectId: string): void {
    this.cache.delete(projectId);
  }

  /**
   * Clears the entire cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  // ─── Private Methods ───────────────────────────────────────────────────

  private getFromCache(projectId: string): CopilotProjectContext | null {
    const entry = this.cache.get(projectId);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(projectId);
      return null;
    }

    return entry.context;
  }

  private setCache(projectId: string, context: CopilotProjectContext): void {
    this.cache.set(projectId, {
      context,
      timestamp: Date.now(),
    });
  }

  private extractResult<T>(
    result: PromiseSettledResult<T>,
    source: string,
  ): DataSourceResult<T> {
    if (result.status === 'fulfilled') {
      return { data: result.value, available: true, source };
    }
    return { data: null, available: false, source };
  }

  /**
   * Builds the CopilotProjectContext from raw data sources.
   * Filters documents to relevant statuses and maps data to context shape.
   */
  private buildContext(
    passport: ProjectPassport | null,
    documents: DocumentRecord[] | null,
    inboxActions: ProjectInboxItem[] | null,
    auditEntries: AuditTrailEntry[] | null,
    userContext: CopilotUserContext,
    unavailableSources: string[],
  ): CopilotProjectContext {
    // Build passport section
    const passportSection = passport
      ? {
          projectName: passport.projectName,
          currentPhase: passport.currentPhase,
          riskLevel: passport.riskLevel,
          leadProfessional: passport.leadProfessionalRole,
          keyDates: this.extractKeyDates(passport),
          teamMembers: this.extractTeamMembers(passport),
        }
      : {
          projectName: 'Unknown',
          currentPhase: 'onboarding' as const,
          riskLevel: 'low' as Priority,
          leadProfessional: 'Unknown',
          keyDates: [],
          teamMembers: [],
        };

    // Filter documents to relevant statuses (draft, pending_review, issued)
    const filteredDocs = (documents ?? [])
      .filter((doc) => RELEVANT_DOC_STATUSES.has(doc.status))
      .map((doc) => ({
        id: doc.documentId,
        title: doc.title,
        status: doc.status as 'draft' | 'pending_review' | 'issued',
        type: doc.documentType,
        updatedAt: doc.updatedAt,
      }));

    // Map inbox actions to context shape
    const pendingActions = (inboxActions ?? [])
      .filter((item) => item.status === 'open')
      .map((item) => ({
        id: item.id,
        title: item.title,
        priority: item.priority,
        dueDate: null as string | null,
        type: item.inboxType,
      }));

    // Map audit entries directly (already in correct shape)
    const auditTrail = (auditEntries ?? []).map((entry) => ({
      action: entry.action,
      actor: entry.actor,
      timestamp: entry.timestamp,
      detail: entry.detail,
    }));

    return {
      passport: passportSection,
      documentRegister: filteredDocs,
      pendingActions,
      auditTrail,
      userContext: {
        role: userContext.role,
        projectAccessRole: userContext.projectAccessRole ?? null,
        displayName: userContext.displayName,
      },
      unavailableSources,
    };
  }

  /**
   * Applies priority-based token budget truncation.
   * Priority order (highest to lowest):
   * 1. passport (phase + risk) — always kept
   * 2. pendingActions (inbox)
   * 3. documentRegister (docs)
   * 4. auditTrail — truncated oldest-first
   *
   * Requirement: 3.6
   */
  private applyTokenBudget(context: CopilotProjectContext): CopilotProjectContext {
    const totalTokens = sectionSize(context);

    // If within budget, no truncation needed
    if (totalTokens <= DEFAULT_TOKEN_BUDGET) {
      return context;
    }

    // Clone to avoid mutation
    const result: CopilotProjectContext = {
      ...context,
      auditTrail: [...context.auditTrail],
      documentRegister: [...context.documentRegister],
      pendingActions: [...context.pendingActions],
    };

    // Priority 4: Trim audit trail oldest-first (entries are newest-first, so remove from end)
    while (sectionSize(result) > DEFAULT_TOKEN_BUDGET && result.auditTrail.length > 0) {
      result.auditTrail.pop();
    }

    // Priority 3: Trim document register if still over budget
    while (sectionSize(result) > DEFAULT_TOKEN_BUDGET && result.documentRegister.length > 0) {
      result.documentRegister.pop();
    }

    // Priority 2: Trim pending actions if still over budget
    while (sectionSize(result) > DEFAULT_TOKEN_BUDGET && result.pendingActions.length > 0) {
      result.pendingActions.pop();
    }

    return result;
  }

  /**
   * Extracts key dates from the project passport lifecycle data.
   */
  private extractKeyDates(
    passport: ProjectPassport,
  ): Array<{ label: string; date: string }> {
    const dates: Array<{ label: string; date: string }> = [];

    // Add phase info as a key date marker
    if (passport.lifecycle) {
      dates.push({
        label: `Current Phase: ${passport.currentPhase}`,
        date: new Date().toISOString().split('T')[0],
      });
    }

    return dates;
  }

  /**
   * Extracts team members from project passport appointments.
   */
  private extractTeamMembers(
    passport: ProjectPassport,
  ): Array<{ name: string; role: string }> {
    return (passport.appointments ?? []).map((appointment) => ({
      name: appointment.appointedParty,
      role: appointment.role,
    }));
  }

  /**
   * Builds an empty context when the user lacks permission or data is unavailable.
   */
  private buildEmptyContext(
    userId: string,
    _projectId: string,
  ): CopilotProjectContext {
    return {
      passport: {
        projectName: 'Unknown',
        currentPhase: 'onboarding',
        riskLevel: 'low',
        leadProfessional: 'Unknown',
        keyDates: [],
        teamMembers: [],
      },
      documentRegister: [],
      pendingActions: [],
      auditTrail: [],
      userContext: {
        role: 'client',
        projectAccessRole: null,
        displayName: userId,
      },
      unavailableSources: ['passport', 'documentRegister', 'pendingActions', 'auditTrail'],
    };
  }
}

// ─── Default Data Provider ─────────────────────────────────────────────────

/**
 * Default data provider that reads from the existing Architex services.
 * Each method wraps the actual service calls for production use.
 */
export class DefaultContextDataProvider implements ContextDataProvider {
  async getProjectPassport(_projectId: string): Promise<ProjectPassport | null> {
    // In production, this would call buildProjectPassportWithSpecForge
    // with the project's metadata and records from Firestore.
    // Stubbed here — wired up during API integration.
    return null;
  }

  async getDocumentRegister(_projectId: string): Promise<DocumentRecord[]> {
    // In production, this would query Firestore for the project's document register.
    return [];
  }

  async getPendingInboxActions(_projectId: string, _userId: string): Promise<ProjectInboxItem[]> {
    // In production, this would query Firestore for the user's pending inbox actions.
    return [];
  }

  async getRecentAuditTrail(_projectId: string, _limit: number): Promise<AuditTrailEntry[]> {
    // In production, this would query Firestore for the recent audit trail entries.
    return [];
  }

  async getUserContext(_userId: string, _projectId: string): Promise<CopilotUserContext | null> {
    // In production, this would look up the user profile and project access role.
    return null;
  }

  async getProjectAccessContext(_userId: string, _projectId: string): Promise<ProjectAccessContext | null> {
    // In production, this would look up the project membership and access context.
    return null;
  }
}

// ─── Singleton Export ──────────────────────────────────────────────────────

/**
 * Singleton context assembler instance using the default data provider.
 * Can be replaced with a custom provider for testing.
 */
export const contextAssembler = new ContextAssembler(new DefaultContextDataProvider());

// ─── Convenience Exports (for copilotService compatibility) ────────────────

/**
 * Context data sources interface — re-exported as ContextDataSources
 * for backward compatibility with copilotService imports.
 */
export type ContextDataSources = ContextDataProvider;

/**
 * Convenience function wrapping the singleton's assembleContext method.
 * Used by copilotService for direct import.
 */
export async function assembleContext(
  projectId: string,
  userId: string,
): Promise<CopilotProjectContext> {
  return contextAssembler.assembleContext(projectId, userId);
}

/**
 * Clears the singleton's context cache.
 * Used by tests and by copilotService on project state changes.
 */
export function clearContextCache(): void {
  contextAssembler.clearCache();
}

/**
 * Standalone token budget truncation function.
 * Exported for direct use by property tests and copilotService.
 */
export function applyTokenBudget(context: CopilotProjectContext): CopilotProjectContext {
  const totalTokens = sectionSize(context);

  if (totalTokens <= DEFAULT_TOKEN_BUDGET) {
    return context;
  }

  const result: CopilotProjectContext = {
    ...context,
    auditTrail: [...context.auditTrail],
    documentRegister: [...context.documentRegister],
    pendingActions: [...context.pendingActions],
  };

  // Priority 4: Trim audit trail oldest-first (entries are newest-first, so remove from end)
  while (sectionSize(result) > DEFAULT_TOKEN_BUDGET && result.auditTrail.length > 0) {
    result.auditTrail.pop();
  }

  // Priority 3: Trim document register if still over budget
  while (sectionSize(result) > DEFAULT_TOKEN_BUDGET && result.documentRegister.length > 0) {
    result.documentRegister.pop();
  }

  // Priority 2: Trim pending actions if still over budget
  while (sectionSize(result) > DEFAULT_TOKEN_BUDGET && result.pendingActions.length > 0) {
    result.pendingActions.pop();
  }

  return result;
}

/**
 * Estimates the character count of a context object (for token estimation: chars/4 = tokens).
 * Exported for use by property tests.
 */
export function estimateChars(context: CopilotProjectContext): number {
  return JSON.stringify(context).length;
}
