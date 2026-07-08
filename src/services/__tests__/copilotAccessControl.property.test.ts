// @vitest-environment node
/**
 * Property-based tests — Copilot context assembly access control and truncation.
 *
 * Feature: ai-copilot-workspace
 *
 * Property 3: Context Permission Scoping
 *   Validates: Requirements 3.3
 *   For any user and project combination, the assembled Project_Context must
 *   contain only data that the user has permission to read as evaluated by
 *   Permission_Service. No data from collections or documents beyond the user's
 *   access level may appear in the context.
 *
 * Property 4: Context Token Truncation Priority
 *   Validates: Requirements 3.6
 *   For any assembled Project_Context that exceeds the AI model's token limit,
 *   the retained data must follow this priority order: (1) current phase and
 *   risk flags, (2) pending inbox actions, (3) document register summary,
 *   (4) audit trail entries. Audit trail entries must be removed oldest-first
 *   until the context fits within the limit.
 *
 * Uses fast-check with minimum 100 iterations per property test.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  assembleContext,
  clearContextCache,
  applyTokenBudget,
  estimateChars,
  MAX_CONTEXT_CHARS,
} from '@/services/copilotContextAssembler';
import type {
  ContextDataSources,
  PassportData,
  DocumentEntry,
  PendingAction,
  AuditEntry,
  UserContextData,
} from '@/services/copilotContextAssembler';
import type { CopilotProjectContext } from '@/services/copilotTypes';
import type { ProjectPhase, Priority, RecordStatus } from '@/services/lifecycleTypes';
import type { UserRole, ProjectAccessRole } from '@/types';

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const ALL_PHASES: ProjectPhase[] = [
  'onboarding', 'feasibility', 'appointment', 'concept_design',
  'design_development', 'municipal_submission', 'tender_procurement',
  'construction_execution', 'closeout',
];

const ALL_PRIORITIES: Priority[] = ['low', 'medium', 'high', 'critical'];

const VALID_STATUSES: RecordStatus[] = ['draft', 'pending_review', 'issued'];

const ALL_ROLES: UserRole[] = [
  'client', 'architect', 'bep', 'contractor', 'freelancer',
  'subcontractor', 'supplier', 'engineer', 'quantity_surveyor',
  'town_planner', 'energy_professional', 'fire_engineer',
  'site_manager', 'developer', 'firm_admin', 'platform_admin',
  'land_surveyor', 'health_safety',
];

/** Generate ISO timestamps without using fc.date (which can produce invalid dates). */
const arbTimestamp: fc.Arbitrary<string> = fc.integer({ min: 1577836800000, max: 1924905600000 })
  .map((ms) => new Date(ms).toISOString());

/** Arbitrary for a project phase. */
const arbPhase: fc.Arbitrary<ProjectPhase> = fc.constantFrom(...ALL_PHASES);

/** Arbitrary for priority/risk level. */
const arbPriority: fc.Arbitrary<Priority> = fc.constantFrom(...ALL_PRIORITIES);

/** Arbitrary for a user role. */
const arbRole: fc.Arbitrary<UserRole> = fc.constantFrom(...ALL_ROLES);

/** Arbitrary for passport data (matches PassportData interface). */
const arbPassportData: fc.Arbitrary<PassportData> = fc.record({
  projectName: fc.string({ minLength: 1, maxLength: 80 }),
  currentPhase: arbPhase,
  riskLevel: arbPriority,
  leadProfessional: fc.string({ minLength: 1, maxLength: 50 }),
  keyDates: fc.array(
    fc.record({ label: fc.string({ minLength: 1, maxLength: 30 }), date: arbTimestamp }),
    { minLength: 0, maxLength: 5 },
  ),
  teamMembers: fc.array(
    fc.record({ name: fc.string({ minLength: 1, maxLength: 50 }), role: fc.string({ minLength: 1, maxLength: 30 }) }),
    { minLength: 0, maxLength: 8 },
  ),
});

/** Arbitrary for a document entry (matches DocumentEntry interface). */
const arbDocEntry: fc.Arbitrary<DocumentEntry> = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 80 }),
  status: fc.constantFrom<RecordStatus>(...VALID_STATUSES),
  type: fc.constantFrom('drawing', 'specification', 'report', 'certificate', 'letter'),
  updatedAt: arbTimestamp,
});

/** Arbitrary for a pending action (matches PendingAction interface). */
const arbPendingAction: fc.Arbitrary<PendingAction> = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 80 }),
  priority: arbPriority,
  dueDate: fc.option(arbTimestamp, { nil: null }),
  type: fc.constantFrom('approval', 'review', 'document_request', 'rfi_response', 'payment'),
});

/** Arbitrary for an audit trail entry (matches AuditEntry interface). */
const arbAuditEntry: fc.Arbitrary<AuditEntry> = fc.record({
  action: fc.constantFrom('document_uploaded', 'phase_changed', 'member_added', 'rfi_created', 'payment_released'),
  actor: fc.string({ minLength: 3, maxLength: 50 }),
  timestamp: arbTimestamp,
  detail: fc.string({ minLength: 5, maxLength: 150 }),
});

/** Arbitrary for user context data (matches UserContextData interface). */
const arbUserContext: fc.Arbitrary<UserContextData> = fc.record({
  role: arbRole,
  projectAccessRole: fc.option(
    fc.constantFrom<ProjectAccessRole>(
      'project_owner', 'lead_bep', 'lead_consultant',
      'project_administrator', 'design_team_member', 'contractor',
      'subcontractor_package_assignee', 'supplier_package_assignee',
      'freelancer_task_assignee',
    ),
    { nil: null },
  ),
  displayName: fc.string({ minLength: 1, maxLength: 50 }),
});

/** Arbitrary for CopilotProjectContext passport (same shape used in context). */
const arbContextPassport = fc.record({
  projectName: fc.string({ minLength: 1, maxLength: 80 }),
  currentPhase: arbPhase,
  riskLevel: arbPriority,
  leadProfessional: fc.string({ minLength: 1, maxLength: 50 }),
  keyDates: fc.array(
    fc.record({ label: fc.string({ minLength: 1, maxLength: 30 }), date: arbTimestamp }),
    { minLength: 0, maxLength: 5 },
  ),
  teamMembers: fc.array(
    fc.record({ name: fc.string({ minLength: 1, maxLength: 50 }), role: fc.string({ minLength: 1, maxLength: 30 }) }),
    { minLength: 0, maxLength: 8 },
  ),
});

/** Arbitrary for a context document register entry (CopilotProjectContext shape). */
const arbContextDocEntry = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 80 }),
  status: fc.constantFrom<RecordStatus>(...VALID_STATUSES),
  type: fc.constantFrom('drawing', 'specification', 'report', 'certificate', 'letter'),
  updatedAt: arbTimestamp,
});

/** Arbitrary for a context pending action (CopilotProjectContext shape). */
const arbContextPendingAction = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 80 }),
  priority: arbPriority,
  dueDate: fc.option(arbTimestamp, { nil: null }),
  type: fc.constantFrom('approval', 'review', 'document_request', 'rfi_response', 'payment'),
});

/** Arbitrary for a context audit entry (CopilotProjectContext shape). */
const arbContextAuditEntry = fc.record({
  action: fc.constantFrom('document_uploaded', 'phase_changed', 'member_added', 'rfi_created', 'payment_released'),
  actor: fc.string({ minLength: 3, maxLength: 50 }),
  timestamp: arbTimestamp,
  detail: fc.string({ minLength: 5, maxLength: 150 }),
});

/** Arbitrary for a full CopilotProjectContext (small, likely within budget). */
const arbContext: fc.Arbitrary<CopilotProjectContext> = fc.record({
  passport: arbContextPassport,
  documentRegister: fc.array(arbContextDocEntry, { minLength: 0, maxLength: 20 }),
  pendingActions: fc.array(arbContextPendingAction, { minLength: 0, maxLength: 15 }),
  auditTrail: fc.array(arbContextAuditEntry, { minLength: 0, maxLength: 20 }),
  userContext: fc.record({
    role: arbRole,
    projectAccessRole: fc.option(
      fc.constantFrom<ProjectAccessRole>(
        'project_owner', 'lead_bep', 'lead_consultant',
        'project_administrator', 'design_team_member', 'contractor',
        'subcontractor_package_assignee', 'supplier_package_assignee',
        'freelancer_task_assignee',
      ),
      { nil: null },
    ),
    displayName: fc.string({ minLength: 1, maxLength: 50 }),
  }),
  unavailableSources: fc.constant<string[]>([]),
});

/**
 * Generates a "large" context that will likely exceed the token budget
 * to properly test truncation behaviour.
 */
const arbLargeContext: fc.Arbitrary<CopilotProjectContext> = fc.record({
  passport: arbContextPassport,
  documentRegister: fc.array(arbContextDocEntry, { minLength: 50, maxLength: 100 }),
  pendingActions: fc.array(arbContextPendingAction, { minLength: 30, maxLength: 50 }),
  auditTrail: fc.array(arbContextAuditEntry, { minLength: 50, maxLength: 100 }),
  userContext: fc.record({
    role: arbRole,
    projectAccessRole: fc.option(
      fc.constantFrom<ProjectAccessRole>(
        'project_owner', 'lead_bep', 'lead_consultant',
        'project_administrator', 'design_team_member', 'contractor',
        'subcontractor_package_assignee', 'supplier_package_assignee',
        'freelancer_task_assignee',
      ),
      { nil: null },
    ),
    displayName: fc.string({ minLength: 1, maxLength: 50 }),
  }),
  unavailableSources: fc.constant<string[]>([]),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates mock ContextDataSources that grants permission and returns provided data.
 */
function createAllowedDataSources(opts: {
  passport?: PassportData;
  docs?: DocumentEntry[];
  actions?: PendingAction[];
  audit?: AuditEntry[];
  userContext?: UserContextData;
}): ContextDataSources {
  return {
    fetchPassport: async () => opts.passport ?? { projectName: 'Test Project', currentPhase: 'onboarding', riskLevel: 'low', leadProfessional: 'LP', keyDates: [], teamMembers: [] },
    fetchDocuments: async () => opts.docs ?? [],
    fetchPendingActions: async () => opts.actions ?? [],
    fetchAuditTrail: async () => opts.audit ?? [],
    fetchUserContext: async () => opts.userContext ?? { role: 'architect' as UserRole, projectAccessRole: 'design_team_member' as ProjectAccessRole, displayName: 'Test User' },
    checkReadPermission: async () => true,
  };
}

/**
 * Creates mock ContextDataSources that denies permission.
 * The data sources contain "secret" data that must not leak.
 */
function createDeniedDataSources(opts?: {
  docs?: DocumentEntry[];
  actions?: PendingAction[];
  audit?: AuditEntry[];
}): ContextDataSources {
  return {
    fetchPassport: async () => ({ projectName: 'SECRET_PROJECT', currentPhase: 'construction_execution' as ProjectPhase, riskLevel: 'critical' as Priority, leadProfessional: 'SECRET_LEAD', keyDates: [{ label: 'SECRET_DATE', date: '2025-06-15T00:00:00.000Z' }], teamMembers: [{ name: 'SECRET_MEMBER', role: 'SECRET_ROLE' }] }),
    fetchDocuments: async () => opts?.docs ?? [{ id: 'secret-doc', title: 'SECRET_DOC_TITLE', status: 'draft' as RecordStatus, type: 'report', updatedAt: '2025-01-01T00:00:00.000Z' }],
    fetchPendingActions: async () => opts?.actions ?? [{ id: 'secret-action', title: 'SECRET_ACTION', priority: 'high' as Priority, dueDate: null, type: 'approval' }],
    fetchAuditTrail: async () => opts?.audit ?? [{ action: 'secret_op', actor: 'hidden_user', timestamp: '2025-01-01T00:00:00.000Z', detail: 'SECRET_DETAIL' }],
    fetchUserContext: async () => ({ role: 'client' as UserRole, projectAccessRole: null, displayName: 'Denied User' }),
    checkReadPermission: async () => false,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Property 3: Context Permission Scoping
// Validates: Requirements 3.3
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: ai-copilot-workspace, Property 3: Context Permission Scoping', () => {
  /**
   * **Validates: Requirements 3.3**
   */

  beforeEach(() => {
    clearContextCache();
  });

  it('denies context assembly entirely when user lacks project read permission', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),  // projectId
        fc.uuid(),  // userId
        async (projectId, userId) => {
          clearContextCache();
          const dataSources = createDeniedDataSources();

          await expect(assembleContext(projectId, userId, dataSources))
            .rejects.toThrow('Permission denied');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns context only when permission is granted — throws on denial', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.boolean(), // whether permission is granted
        arbPassportData,
        arbUserContext,
        async (projectId, userId, allowed, passport, userCtx) => {
          clearContextCache();
          const dataSources: ContextDataSources = {
            fetchPassport: async () => passport,
            fetchDocuments: async () => [],
            fetchPendingActions: async () => [],
            fetchAuditTrail: async () => [],
            fetchUserContext: async () => userCtx,
            checkReadPermission: async () => allowed,
          };

          if (allowed) {
            const result = await assembleContext(projectId, userId, dataSources);
            expect(result.passport.projectName).toBe(passport.projectName);
          } else {
            await expect(assembleContext(projectId, userId, dataSources))
              .rejects.toThrow('Permission denied');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('assembled context includes only data from the injected sources (no external data)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        arbPassportData,
        fc.array(arbDocEntry, { minLength: 0, maxLength: 10 }),
        fc.array(arbPendingAction, { minLength: 0, maxLength: 10 }),
        fc.array(arbAuditEntry, { minLength: 0, maxLength: 10 }),
        arbUserContext,
        async (projectId, userId, passport, docs, actions, audit, userCtx) => {
          clearContextCache();
          const dataSources = createAllowedDataSources({
            passport,
            docs,
            actions,
            audit,
            userContext: userCtx,
          });

          const result = await assembleContext(projectId, userId, dataSources);

          // Passport data matches what the source returned
          expect(result.passport.projectName).toBe(passport.projectName);
          expect(result.passport.currentPhase).toBe(passport.currentPhase);
          expect(result.passport.riskLevel).toBe(passport.riskLevel);

          // User context matches
          expect(result.userContext.role).toBe(userCtx.role);
          expect(result.userContext.displayName).toBe(userCtx.displayName);

          // Document register is a subset of what was provided (may be truncated but never augmented)
          for (const doc of result.documentRegister) {
            expect(docs.some((d) => d.id === doc.id)).toBe(true);
          }

          // Pending actions is a subset of what was provided
          for (const action of result.pendingActions) {
            expect(actions.some((a) => a.id === action.id)).toBe(true);
          }

          // Audit trail is a subset of what was provided
          for (const entry of result.auditTrail) {
            expect(audit.some(
              (a) => a.action === entry.action && a.actor === entry.actor && a.timestamp === entry.timestamp,
            )).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('no project data leaks into the error when permission is denied', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), fc.uuid(), async (projectId, userId) => {
        clearContextCache();
        const dataSources = createDeniedDataSources();

        try {
          await assembleContext(projectId, userId, dataSources);
          // Should not reach here
          expect(true).toBe(false);
        } catch (err: unknown) {
          const errorMessage = (err as Error).message;
          // Error message must not reveal any project data
          expect(errorMessage).not.toContain('SECRET_PROJECT');
          expect(errorMessage).not.toContain('SECRET_LEAD');
          expect(errorMessage).not.toContain('SECRET_DOC_TITLE');
          expect(errorMessage).not.toContain('SECRET_MEMBER');
          expect(errorMessage).not.toContain('SECRET_ACTION');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('permission check is evaluated before data source reads execute', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), fc.uuid(), async (projectId, userId) => {
        clearContextCache();
        let passportRead = false;
        let docsRead = false;
        let inboxRead = false;
        let auditRead = false;

        const dataSources: ContextDataSources = {
          fetchPassport: async () => { passportRead = true; return { projectName: 'P', currentPhase: 'onboarding' as ProjectPhase, riskLevel: 'low' as Priority, leadProfessional: 'LP', keyDates: [], teamMembers: [] }; },
          fetchDocuments: async () => { docsRead = true; return []; },
          fetchPendingActions: async () => { inboxRead = true; return []; },
          fetchAuditTrail: async () => { auditRead = true; return []; },
          fetchUserContext: async () => ({ role: 'client' as UserRole, projectAccessRole: null, displayName: 'User' }),
          checkReadPermission: async () => false,
        };

        try {
          await assembleContext(projectId, userId, dataSources);
        } catch {
          // Expected — permission denied
        }

        // Since permission is denied, data sources should NOT have been read
        expect(passportRead).toBe(false);
        expect(docsRead).toBe(false);
        expect(inboxRead).toBe(false);
        expect(auditRead).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Property 4: Context Token Truncation Priority
// Validates: Requirements 3.6
// ══════════════════════════════════════════════════════════════════════════════

describe('Feature: ai-copilot-workspace, Property 4: Context Token Truncation Priority', () => {
  /**
   * **Validates: Requirements 3.6**
   */

  it('passport data is never truncated regardless of context size', () => {
    fc.assert(
      fc.property(arbLargeContext, (context) => {
        const result = applyTokenBudget(context);

        // Passport must always be preserved fully
        expect(result.passport).toEqual(context.passport);
      }),
      { numRuns: 100 },
    );
  });

  it('truncated context fits within the token budget', () => {
    fc.assert(
      fc.property(arbLargeContext, (context) => {
        const result = applyTokenBudget(context);
        const totalChars = estimateChars(result);

        expect(totalChars).toBeLessThanOrEqual(MAX_CONTEXT_CHARS);
      }),
      { numRuns: 100 },
    );
  });

  it('contexts within budget are returned unchanged', () => {
    fc.assert(
      fc.property(arbContext, (context) => {
        const totalChars = estimateChars(context);
        if (totalChars <= MAX_CONTEXT_CHARS) {
          const result = applyTokenBudget(context);
          expect(result).toEqual(context);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('audit trail is truncated before document register', () => {
    fc.assert(
      fc.property(arbLargeContext, (context) => {
        const result = applyTokenBudget(context);

        // If document register was truncated, audit trail must be empty (fully removed first)
        if (result.documentRegister.length < context.documentRegister.length) {
          expect(result.auditTrail.length).toBe(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('document register is truncated before pending actions', () => {
    fc.assert(
      fc.property(arbLargeContext, (context) => {
        const result = applyTokenBudget(context);

        // If pending actions were truncated, document register must be empty (fully removed first)
        if (result.pendingActions.length < context.pendingActions.length) {
          expect(result.documentRegister.length).toBe(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('audit trail entries are removed oldest-first (from end of array since newest-first order)', () => {
    fc.assert(
      fc.property(arbLargeContext, (context) => {
        const result = applyTokenBudget(context);

        if (result.auditTrail.length > 0 && result.auditTrail.length < context.auditTrail.length) {
          // Remaining entries should be the first N entries of the original
          // (newest-first ordering means oldest are at the end, removed from end)
          for (let i = 0; i < result.auditTrail.length; i++) {
            expect(result.auditTrail[i]).toEqual(context.auditTrail[i]);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('truncation priority order is maintained: passport > actions > docs > audit', () => {
    fc.assert(
      fc.property(arbLargeContext, (context) => {
        const result = applyTokenBudget(context);

        // Determine what was truncated
        const auditTruncated = result.auditTrail.length < context.auditTrail.length;
        const docsTruncated = result.documentRegister.length < context.documentRegister.length;
        const actionsTruncated = result.pendingActions.length < context.pendingActions.length;
        const passportChanged = JSON.stringify(result.passport) !== JSON.stringify(context.passport);

        // Passport never truncated
        expect(passportChanged).toBe(false);

        // If actions were truncated, lower priority items must be fully removed
        if (actionsTruncated) {
          expect(result.documentRegister.length).toBe(0);
          expect(result.auditTrail.length).toBe(0);
        }

        // If docs were truncated, audit must be fully removed
        if (docsTruncated) {
          expect(result.auditTrail.length).toBe(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('userContext and unavailableSources metadata are always preserved', () => {
    fc.assert(
      fc.property(arbLargeContext, (context) => {
        const result = applyTokenBudget(context);

        expect(result.userContext).toEqual(context.userContext);
        expect(result.unavailableSources).toEqual(context.unavailableSources);
      }),
      { numRuns: 100 },
    );
  });

  it('retained document register entries maintain original order', () => {
    fc.assert(
      fc.property(arbLargeContext, (context) => {
        const result = applyTokenBudget(context);

        if (result.documentRegister.length > 0) {
          // Retained entries should be a prefix of the original (items removed from end)
          for (let i = 0; i < result.documentRegister.length; i++) {
            expect(result.documentRegister[i]).toEqual(context.documentRegister[i]);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('retained pending actions maintain original order', () => {
    fc.assert(
      fc.property(arbLargeContext, (context) => {
        const result = applyTokenBudget(context);

        if (result.pendingActions.length > 0) {
          // Retained entries should be a prefix of the original
          for (let i = 0; i < result.pendingActions.length; i++) {
            expect(result.pendingActions[i]).toEqual(context.pendingActions[i]);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
