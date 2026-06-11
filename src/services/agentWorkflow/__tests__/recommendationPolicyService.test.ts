/**
 * Tests for Recommendation Policy Service — Pack 14
 */
import { describe, expect, it } from 'vitest';
import {
  createDefaultPolicy,
  shouldShowRecommendation,
  needsHumanApproval,
  canAutoApply,
  canRoleApprove,
  canRoleDismiss,
  overridePolicy,
  resetPolicyToDefaults,
  createABTest,
  assignABTestGroup,
  applyABTestPolicy,
} from '../recommendationPolicyService';

describe('recommendationPolicyService', () => {
  describe('createDefaultPolicy', () => {
    it('creates user-scoped policy', () => {
      const policy = createDefaultPolicy('t1', 'user');
      expect(policy.scope).toBe('user');
      expect(policy.maxRecommendationsPerView).toBe(5);
      expect(policy.requireHumanApprovalFor).toContain('critical');
      expect(policy.requireHumanApprovalFor).toContain('high');
    });

    it('creates project-scoped policy with more recommendations', () => {
      const policy = createDefaultPolicy('t1', 'project');
      expect(policy.maxRecommendationsPerView).toBe(10);
    });
  });

  describe('shouldShowRecommendation', () => {
    it('shows recommendation at or above min priority', () => {
      const policy = createDefaultPolicy('t1', 'user');
      expect(shouldShowRecommendation(policy, 'high')).toBe(true);
      expect(shouldShowRecommendation(policy, 'critical')).toBe(true);
      expect(shouldShowRecommendation(policy, 'low')).toBe(true);
    });

    it('filters recommendations below min priority', () => {
      const policy = createDefaultPolicy('t1', 'user');
      const adjusted = { ...policy, minPriorityToShow: 'medium' as const };
      expect(shouldShowRecommendation(adjusted, 'low')).toBe(false);
      expect(shouldShowRecommendation(adjusted, 'medium')).toBe(true);
    });
  });

  describe('needsHumanApproval', () => {
    it('requires approval for critical and high', () => {
      const policy = createDefaultPolicy('t1', 'user');
      expect(needsHumanApproval(policy, 'critical')).toBe(true);
      expect(needsHumanApproval(policy, 'high')).toBe(true);
      expect(needsHumanApproval(policy, 'medium')).toBe(false);
      expect(needsHumanApproval(policy, 'low')).toBe(false);
    });
  });

  describe('canAutoApply', () => {
    it('auto-applies low priority only by default', () => {
      const policy = createDefaultPolicy('t1', 'user');
      expect(canAutoApply(policy, 'low')).toBe(true);
      expect(canAutoApply(policy, 'medium')).toBe(false);
      expect(canAutoApply(policy, 'high')).toBe(false);
      expect(canAutoApply(policy, 'critical')).toBe(false);
    });
  });

  describe('canRoleApprove', () => {
    it('allows architect, client, platform_admin to approve', () => {
      const policy = createDefaultPolicy('t1', 'user');
      expect(canRoleApprove(policy, 'architect')).toBe(true);
      expect(canRoleApprove(policy, 'client')).toBe(true);
      expect(canRoleApprove(policy, 'platform_admin')).toBe(true);
      expect(canRoleApprove(policy, 'contractor')).toBe(false);
    });
  });

  describe('canRoleDismiss', () => {
    it('allows architect and platform_admin to dismiss', () => {
      const policy = createDefaultPolicy('t1', 'user');
      expect(canRoleDismiss(policy, 'architect')).toBe(true);
      expect(canRoleDismiss(policy, 'platform_admin')).toBe(true);
      expect(canRoleDismiss(policy, 'client')).toBe(false);
    });
  });

  describe('overridePolicy', () => {
    it('applies admin overrides', () => {
      const policy = createDefaultPolicy('t1', 'user');
      const overridden = overridePolicy(policy, {
        maxRecommendationsPerView: 20,
        minPriorityToShow: 'high',
      }, 'admin-1');

      expect(overridden.maxRecommendationsPerView).toBe(20);
      expect(overridden.minPriorityToShow).toBe('high');
      expect(overridden.overridden).toBe(true);
      expect(overridden.overriddenBy).toBe('admin-1');
      expect(overridden.overriddenAt).toBeTruthy();
      // Original values preserved where not overridden
      expect(overridden.scope).toBe('user');
    });
  });

  describe('resetPolicyToDefaults', () => {
    it('resets overridden policy', () => {
      const policy = createDefaultPolicy('t1', 'user');
      const overridden = overridePolicy(policy, { maxRecommendationsPerView: 50 }, 'admin-1');
      const reset = resetPolicyToDefaults(overridden, 'admin-2');

      expect(reset.maxRecommendationsPerView).toBe(5); // Default for user
      expect(reset.overridden).toBe(false);
      expect(reset.overriddenBy).toBe('admin-2');
    });
  });

  describe('AB Testing', () => {
    it('creates valid AB test', () => {
      const test = createABTest({
        tenantId: 't1',
        name: 'Rec Layout Test',
        description: 'Test layout A vs B',
        groups: [
          { name: 'control', weight: 50, overrides: {} },
          { name: 'variant', weight: 50, overrides: { maxRecommendationsPerView: 15 } },
        ],
      });

      expect(test.groups).toHaveLength(2);
      expect(test.groups[0].weight + test.groups[1].weight).toBe(100);
    });

    it('rejects AB test with weights not summing to 100', () => {
      expect(() =>
        createABTest({
          tenantId: 't1',
          name: 'Bad Test',
          description: 'Broken',
          groups: [
            { name: 'a', weight: 60, overrides: {} },
            { name: 'b', weight: 60, overrides: {} },
          ],
        }),
      ).toThrow('must sum to 100');
    });

    it('assigns user deterministically to same group', () => {
      const test = createABTest({
        tenantId: 't1',
        name: 'Consistent',
        description: 'Should always assign same user to same group',
        groups: [
          { name: 'control', weight: 50, overrides: {} },
          { name: 'variant', weight: 50, overrides: {} },
        ],
      });

      const g1 = assignABTestGroup(test, 'user-42');
      const g2 = assignABTestGroup(test, 'user-42');
      expect(g1.name).toBe(g2.name);
    });

    it('applyABTestPolicy merges group overrides', () => {
      const policy = createDefaultPolicy('t1', 'user');
      const test = createABTest({
        tenantId: 't1',
        name: 'Layout',
        description: 'Test',
        groups: [
          { name: 'big-layout', weight: 100, overrides: { maxRecommendationsPerView: 20 } },
        ],
      });

      const applied = applyABTestPolicy(policy, test, 'user-1');
      expect(applied.maxRecommendationsPerView).toBe(20);
      expect(applied.abTestGroup).toBe('big-layout');
      expect(applied.abTestWeight).toBe(100);
    });
  });
});
