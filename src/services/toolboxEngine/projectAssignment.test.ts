import { describe, it, expect } from 'vitest';
import { ProjectAssignmentService } from './projectAssignment';
import type { ProjectAccessChecker } from './projectAssignment';
import type { ToolContext } from './types';

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    tenantId: 'tenant-1',
    userId: 'user-1',
    userRole: 'architect',
    ...overrides,
  };
}

/** A mock access checker that allows configuring which projects exist and who has access. */
function createMockChecker(opts: {
  existingProjects?: string[];
  accessibleProjects?: string[];
} = {}): ProjectAccessChecker {
  const existing = new Set(opts.existingProjects ?? []);
  const accessible = new Set(opts.accessibleProjects ?? []);
  return {
    exists: async (projectId: string) => existing.has(projectId),
    hasReadAccess: async (projectId: string) => accessible.has(projectId),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProjectAssignmentService', () => {
  describe('factory methods', () => {
    it('none() returns mode none', () => {
      const svc = new ProjectAssignmentService();
      expect(svc.none()).toEqual({ mode: 'none' });
    });

    it('internal() returns mode internal-project with projectId and projectName', () => {
      const svc = new ProjectAssignmentService();
      expect(svc.internal('proj-1', 'My Project')).toEqual({
        mode: 'internal-project',
        projectId: 'proj-1',
        projectName: 'My Project',
      });
    });

    it('internal() throws on empty projectId', () => {
      const svc = new ProjectAssignmentService();
      expect(() => svc.internal('', 'Name')).toThrow('Internal project assignment needs a projectId');
      expect(() => svc.internal('   ', 'Name')).toThrow();
    });

    it('external() returns mode external-reference with reference and notes', () => {
      const svc = new ProjectAssignmentService();
      expect(svc.external('EXT-001', 'Some notes')).toEqual({
        mode: 'external-reference',
        externalReference: 'EXT-001',
        notes: 'Some notes',
      });
    });

    it('external() works with no notes', () => {
      const svc = new ProjectAssignmentService();
      expect(svc.external('EXT-002')).toEqual({
        mode: 'external-reference',
        externalReference: 'EXT-002',
        notes: undefined,
      });
    });

    it('external() throws on empty externalReference', () => {
      const svc = new ProjectAssignmentService();
      expect(() => svc.external('')).toThrow('External assignment needs an externalReference');
      expect(() => svc.external('   ')).toThrow();
    });
  });

  describe('validate() — mode none', () => {
    it('always returns valid for mode none', async () => {
      const svc = new ProjectAssignmentService();
      const result = await svc.validate({ mode: 'none' }, makeCtx());
      expect(result).toEqual({ valid: true });
    });
  });

  describe('validate() — mode internal-project (Req 5.2, 5.3)', () => {
    it('returns valid when project exists and user has access', async () => {
      const checker = createMockChecker({
        existingProjects: ['proj-1'],
        accessibleProjects: ['proj-1'],
      });
      const svc = new ProjectAssignmentService(checker);

      const result = await svc.validate(
        { mode: 'internal-project', projectId: 'proj-1', projectName: 'Test' },
        makeCtx(),
      );
      expect(result.valid).toBe(true);
    });

    it('rejects when project does not exist', async () => {
      const checker = createMockChecker({
        existingProjects: [],
        accessibleProjects: [],
      });
      const svc = new ProjectAssignmentService(checker);

      const result = await svc.validate(
        { mode: 'internal-project', projectId: 'no-exist', projectName: 'Ghost' },
        makeCtx(),
      );
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('PROJECT_NOT_FOUND');
    });

    it('rejects when user lacks read access', async () => {
      const checker = createMockChecker({
        existingProjects: ['proj-2'],
        accessibleProjects: [], // exists but no access
      });
      const svc = new ProjectAssignmentService(checker);

      const result = await svc.validate(
        { mode: 'internal-project', projectId: 'proj-2', projectName: 'Restricted' },
        makeCtx(),
      );
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('ACCESS_DENIED');
    });

    it('rejects when projectId is empty', async () => {
      const checker = createMockChecker({ existingProjects: [], accessibleProjects: [] });
      const svc = new ProjectAssignmentService(checker);

      const result = await svc.validate(
        { mode: 'internal-project', projectId: '', projectName: '' },
        makeCtx(),
      );
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_PROJECT');
    });

    it('returns valid when no access checker is injected (graceful fallback)', async () => {
      const svc = new ProjectAssignmentService(); // no checker
      const result = await svc.validate(
        { mode: 'internal-project', projectId: 'any-id', projectName: 'Any' },
        makeCtx(),
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('validate() — mode external-reference (Req 5.4)', () => {
    it('returns valid for reference within 1–200 chars', async () => {
      const svc = new ProjectAssignmentService();
      const result = await svc.validate(
        { mode: 'external-reference', externalReference: 'EXT-REF-001' },
        makeCtx(),
      );
      expect(result.valid).toBe(true);
    });

    it('returns valid for reference at exactly 200 chars', async () => {
      const svc = new ProjectAssignmentService();
      const ref = 'A'.repeat(200);
      const result = await svc.validate(
        { mode: 'external-reference', externalReference: ref },
        makeCtx(),
      );
      expect(result.valid).toBe(true);
    });

    it('rejects reference longer than 200 chars', async () => {
      const svc = new ProjectAssignmentService();
      const ref = 'B'.repeat(201);
      const result = await svc.validate(
        { mode: 'external-reference', externalReference: ref },
        makeCtx(),
      );
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_EXTERNAL_REFERENCE');
    });

    it('rejects empty externalReference', async () => {
      const svc = new ProjectAssignmentService();
      const result = await svc.validate(
        { mode: 'external-reference', externalReference: '' },
        makeCtx(),
      );
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_EXTERNAL_REFERENCE');
    });

    it('returns valid for notes within 0–500 chars', async () => {
      const svc = new ProjectAssignmentService();
      const result = await svc.validate(
        { mode: 'external-reference', externalReference: 'REF', notes: 'Short note' },
        makeCtx(),
      );
      expect(result.valid).toBe(true);
    });

    it('returns valid for notes at exactly 500 chars', async () => {
      const svc = new ProjectAssignmentService();
      const notes = 'N'.repeat(500);
      const result = await svc.validate(
        { mode: 'external-reference', externalReference: 'REF', notes },
        makeCtx(),
      );
      expect(result.valid).toBe(true);
    });

    it('rejects notes longer than 500 chars', async () => {
      const svc = new ProjectAssignmentService();
      const notes = 'X'.repeat(501);
      const result = await svc.validate(
        { mode: 'external-reference', externalReference: 'REF', notes },
        makeCtx(),
      );
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_NOTES');
    });
  });

  describe('canReassign() (Req 5.6, 5.7)', () => {
    const svc = new ProjectAssignmentService();

    it('allows reassignment from mode none', () => {
      expect(svc.canReassign('none')).toBe(true);
    });

    it('rejects reassignment from mode internal-project', () => {
      expect(svc.canReassign('internal-project')).toBe(false);
    });

    it('rejects reassignment from mode external-reference', () => {
      expect(svc.canReassign('external-reference')).toBe(false);
    });
  });
});
