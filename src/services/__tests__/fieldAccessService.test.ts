/**
 * Field Access Service — canPerform, assertFieldAction & assertFieldActionIO unit tests
 *
 * Tests the pure permission functions against the role permission matrix
 * and the I/O wrapper that writes audit records.
 * Validates: Requirements 6.1, 6.2, 6.4, 6.5, 6.21, 6.22
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  canPerform,
  assertFieldAction,
  assertFieldActionIO,
  EDITOR_ROLES,
  type AuthorizationError,
  type FieldActionDecision,
  type ActorContext,
} from '../fieldAccessService';
import { siteAuditTrailService } from '@/services/siteAuditTrailService';
import type { UserRole, FieldActionType } from '@/types';

vi.mock('@/services/siteAuditTrailService', () => ({
  siteAuditTrailService: {
    recordAudit: vi.fn().mockResolvedValue('audit-id-123'),
  },
}));

const ALL_FIELD_ACTIONS: FieldActionType[] = [
  'create',
  'edit',
  'delete',
  'status_transition',
  'payment_release',
];

describe('canPerform', () => {
  describe('editor roles are permitted all actions (Req 6.1)', () => {
    const expectedEditorRoles: UserRole[] = [
      'site_manager',
      'contractor',
      'subcontractor',
      'architect',
      'engineer',
      'bep',
    ];

    it('EDITOR_ROLES contains exactly the 6 expected roles', () => {
      expect(EDITOR_ROLES).toHaveLength(6);
      for (const role of expectedEditorRoles) {
        expect(EDITOR_ROLES).toContain(role);
      }
    });

    for (const role of expectedEditorRoles) {
      for (const action of ALL_FIELD_ACTIONS) {
        it(`permits ${role} to perform ${action}`, () => {
          expect(canPerform(role, action)).toBe(true);
        });
      }
    }
  });

  describe('client role is denied all mutating actions (Req 6.2)', () => {
    for (const action of ALL_FIELD_ACTIONS) {
      it(`denies client for ${action}`, () => {
        expect(canPerform('client', action)).toBe(false);
      });
    }
  });

  describe('non-editor/non-client roles are denied all actions (Req 6.5)', () => {
    const otherRoles: UserRole[] = [
      'admin',
      'freelancer',
      'supplier',
      'quantity_surveyor',
      'town_planner',
      'energy_professional',
      'fire_engineer',
      'developer',
      'firm_admin',
      'platform_admin',
    ];

    for (const role of otherRoles) {
      for (const action of ALL_FIELD_ACTIONS) {
        it(`denies ${role} for ${action}`, () => {
          expect(canPerform(role, action)).toBe(false);
        });
      }
    }
  });
});


describe('assertFieldAction', () => {
  const targetId = 'issue-abc-123';

  describe('returns permitted for editor roles (Req 6.1, 6.2)', () => {
    for (const role of EDITOR_ROLES) {
      for (const action of ALL_FIELD_ACTIONS) {
        it(`permits ${role} for ${action}`, () => {
          const decision = assertFieldAction(role, action, targetId);
          expect(decision.outcome).toBe('permitted');
          expect(decision.error).toBeUndefined();
        });
      }
    }
  });

  describe('returns denied with authorization error for client (Req 6.2, 6.5)', () => {
    for (const action of ALL_FIELD_ACTIONS) {
      it(`denies client for ${action} with correct error`, () => {
        const decision = assertFieldAction('client', action, targetId);
        expect(decision.outcome).toBe('denied');
        expect(decision.error).toBeDefined();
        expect(decision.error!.code).toBe('unauthorized');
        expect(decision.error!.role).toBe('client');
        expect(decision.error!.action).toBe(action);
        expect(decision.error!.message).toBe(
          `User with role 'client' is not permitted to perform '${action}' on '${targetId}'`
        );
      });
    }
  });

  describe('returns denied with authorization error for non-editor roles (Req 6.5)', () => {
    const nonEditorRoles: UserRole[] = [
      'admin',
      'freelancer',
      'supplier',
      'quantity_surveyor',
      'town_planner',
    ];

    for (const role of nonEditorRoles) {
      it(`denies ${role} for create with correct error shape`, () => {
        const decision = assertFieldAction(role, 'create', targetId);
        expect(decision.outcome).toBe('denied');
        expect(decision.error).toBeDefined();
        expect(decision.error!.code).toBe('unauthorized');
        expect(decision.error!.role).toBe(role);
        expect(decision.error!.action).toBe('create');
        expect(decision.error!.message).toContain(role);
        expect(decision.error!.message).toContain('create');
        expect(decision.error!.message).toContain(targetId);
      });
    }
  });

  describe('pure function — no side effects (Req 6.21)', () => {
    it('does not modify anything — returns a plain decision object', () => {
      const decision1 = assertFieldAction('client', 'edit', 'target-1');
      const decision2 = assertFieldAction('client', 'edit', 'target-1');

      // Same inputs produce equivalent outputs (referential transparency)
      expect(decision1).toEqual(decision2);
    });

    it('includes targetId in the error message without modifying it', () => {
      const id = 'some-target-id';
      const decision = assertFieldAction('freelancer', 'delete', id);
      expect(decision.error!.message).toContain(id);
    });

    it('permitted decision has no error property', () => {
      const decision = assertFieldAction('site_manager', 'create', targetId);
      expect(decision).toEqual({ outcome: 'permitted' });
      expect('error' in decision && decision.error !== undefined).toBe(false);
    });
  });
});


describe('assertFieldActionIO', () => {
  const mockRecordAudit = siteAuditTrailService.recordAudit as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRecordAudit.mockClear();
    mockRecordAudit.mockResolvedValue('audit-id-123');
  });

  describe('wraps pure decision and writes audit on every attempt (Req 6.4, 6.22)', () => {
    it('returns permitted decision for editor role and writes audit with outcome=permitted', async () => {
      const ctx: ActorContext = {
        actorId: 'user-001',
        actorRole: 'site_manager',
        projectId: 'project-abc',
      };
      const action: FieldActionType = 'create';
      const targetId = 'issue-xyz';

      const decision = await assertFieldActionIO(ctx, action, targetId);

      expect(decision.outcome).toBe('permitted');
      expect(decision.error).toBeUndefined();
      expect(mockRecordAudit).toHaveBeenCalledOnce();
      expect(mockRecordAudit).toHaveBeenCalledWith({
        projectId: 'project-abc',
        actorId: 'user-001',
        actorRole: 'site_manager',
        action: 'field_action_create',
        actionType: 'create',
        outcome: 'permitted',
        sourceObjectId: 'issue-xyz',
        sourceObjectType: 'field_issue',
      });
    });

    it('returns denied decision for client role and writes audit with outcome=denied', async () => {
      const ctx: ActorContext = {
        actorId: 'client-user-002',
        actorRole: 'client',
        projectId: 'project-def',
      };
      const action: FieldActionType = 'edit';
      const targetId = 'issue-456';

      const decision = await assertFieldActionIO(ctx, action, targetId);

      expect(decision.outcome).toBe('denied');
      expect(decision.error).toBeDefined();
      expect(decision.error!.code).toBe('unauthorized');
      expect(decision.error!.role).toBe('client');
      expect(decision.error!.action).toBe('edit');
      expect(mockRecordAudit).toHaveBeenCalledOnce();
      expect(mockRecordAudit).toHaveBeenCalledWith({
        projectId: 'project-def',
        actorId: 'client-user-002',
        actorRole: 'client',
        action: 'field_action_edit',
        actionType: 'edit',
        outcome: 'denied',
        sourceObjectId: 'issue-456',
        sourceObjectType: 'field_issue',
      });
    });

    it('denied action leaves target unchanged — only returns decision, does not throw', async () => {
      const ctx: ActorContext = {
        actorId: 'freelancer-003',
        actorRole: 'freelancer',
        projectId: 'project-ghi',
      };

      const decision = await assertFieldActionIO(ctx, 'delete', 'target-789');

      expect(decision.outcome).toBe('denied');
      // Function resolves (does not throw) — caller decides what to do
      expect(decision.error!.message).toContain('freelancer');
      expect(decision.error!.message).toContain('delete');
    });
  });

  describe('audit record written for every action type (Req 6.4)', () => {
    const ALL_ACTIONS: FieldActionType[] = [
      'create', 'edit', 'delete', 'status_transition', 'payment_release',
    ];

    for (const action of ALL_ACTIONS) {
      it(`writes audit for action '${action}' with correct action name`, async () => {
        const ctx: ActorContext = {
          actorId: 'actor-test',
          actorRole: 'architect',
          projectId: 'proj-test',
        };

        await assertFieldActionIO(ctx, action, 'target-test');

        expect(mockRecordAudit).toHaveBeenCalledOnce();
        expect(mockRecordAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            action: `field_action_${action}`,
            actionType: action,
            outcome: 'permitted',
            sourceObjectType: 'field_issue',
          }),
        );
      });
    }

    for (const action of ALL_ACTIONS) {
      it(`writes denied audit for client performing '${action}'`, async () => {
        const ctx: ActorContext = {
          actorId: 'client-id',
          actorRole: 'client',
          projectId: 'proj-denied',
        };

        await assertFieldActionIO(ctx, action, 'target-denied');

        expect(mockRecordAudit).toHaveBeenCalledOnce();
        expect(mockRecordAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            action: `field_action_${action}`,
            actionType: action,
            outcome: 'denied',
            sourceObjectType: 'field_issue',
          }),
        );
      });
    }
  });

  describe('audit includes correct actor context fields (Req 6.22)', () => {
    it('passes actorId, actorRole, and projectId from context', async () => {
      const ctx: ActorContext = {
        actorId: 'specific-actor-id',
        actorRole: 'contractor',
        projectId: 'specific-project-id',
      };

      await assertFieldActionIO(ctx, 'status_transition', 'specific-target');

      expect(mockRecordAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'specific-project-id',
          actorId: 'specific-actor-id',
          actorRole: 'contractor',
          sourceObjectId: 'specific-target',
        }),
      );
    });
  });
});
