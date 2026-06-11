/**
 * Tests for User Agent Service — Pack 14
 */
import { describe, expect, it } from 'vitest';
import {
  createUserAgentProfile,
  updatePreferences,
  recordUserActivity,
  learnPatterns,
  updateUserContext,
  getPersonalizedContext,
} from '../userAgentService';

describe('userAgentService', () => {
  describe('createUserAgentProfile', () => {
    it('creates a profile with defaults', () => {
      const profile = createUserAgentProfile({
        userId: 'user-1',
        tenantId: 'tenant-1',
        role: 'architect',
      });

      expect(profile.id).toBe('user-agent-user-1');
      expect(profile.userId).toBe('user-1');
      expect(profile.tenantId).toBe('tenant-1');
      expect(profile.role).toBe('architect');
      expect(profile.preferences.preferredView).toBe('dashboard');
      expect(profile.preferences.notificationFrequency).toBe('realtime');
      expect(profile.preferences.autoApplyRecommendations).toBe(false);
      expect(profile.activityHistory).toEqual([]);
      expect(profile.learnedPatterns).toEqual([]);
      expect(profile.createdAt).toBeTruthy();
    });

    it('creates profiles with unique timestamps', () => {
      const p1 = createUserAgentProfile({ userId: 'u1', tenantId: 't1', role: 'client' });
      const p2 = createUserAgentProfile({ userId: 'u2', tenantId: 't1', role: 'engineer' });

      expect(p1.id).not.toBe(p2.id);
      expect(p2.role).toBe('engineer');
    });
  });

  describe('updatePreferences', () => {
    it('merges preference updates', () => {
      const profile = createUserAgentProfile({
        userId: 'u1', tenantId: 't1', role: 'architect',
      });

      const updated = updatePreferences(profile, {
        preferredView: 'inbox',
        language: 'af',
      });

      expect(updated.preferences.preferredView).toBe('inbox');
      expect(updated.preferences.language).toBe('af');
      // Unchanged defaults preserved
      expect(updated.preferences.notificationFrequency).toBe('realtime');
      expect(updated.updatedAt).toBeTruthy();
      expect(Date.parse(updated.updatedAt)).not.toBeNaN();
    });

    it('updates all preferences at once', () => {
      const profile = createUserAgentProfile({ userId: 'u1', tenantId: 't1', role: 'architect' });
      const updated = updatePreferences(profile, {
        preferredView: 'passport',
        notificationFrequency: 'weekly',
        autoApplyRecommendations: true,
        showRiskBadges: false,
        language: 'zu',
        customFilters: { phase: 'construction_execution' },
      });

      expect(updated.preferences.preferredView).toBe('passport');
      expect(updated.preferences.notificationFrequency).toBe('weekly');
      expect(updated.preferences.autoApplyRecommendations).toBe(true);
      expect(updated.preferences.showRiskBadges).toBe(false);
      expect(updated.preferences.language).toBe('zu');
    });
  });

  describe('recordUserActivity', () => {
    it('records and timestamps activities', () => {
      const profile = createUserAgentProfile({ userId: 'u1', tenantId: 't1', role: 'architect' });

      const updated = recordUserActivity(profile, {
        action: 'view_module',
        targetType: 'finance',
        targetId: 'fin-1',
      });

      expect(updated.activityHistory).toHaveLength(1);
      expect(updated.activityHistory[0].action).toBe('view_module');
      expect(updated.activityHistory[0].timestamp).toBeTruthy();
    });

    it('caps history at 500 entries', () => {
      let profile = createUserAgentProfile({ userId: 'u1', tenantId: 't1', role: 'architect' });

      for (let i = 0; i < 600; i++) {
        profile = recordUserActivity(profile, {
          action: `action_${i}`,
          targetType: 'module',
          targetId: `mod-${i}`,
        });
      }

      expect(profile.activityHistory).toHaveLength(500);
      // Most recent should be first
      expect(profile.activityHistory[0].action).toBe('action_599');
    });
  });

  describe('learnPatterns', () => {
    it('detects module preference pattern after sufficient views', () => {
      let profile = createUserAgentProfile({ userId: 'u1', tenantId: 't1', role: 'architect' });

      // Record 10 views of the same module
      for (let i = 0; i < 10; i++) {
        profile = recordUserActivity(profile, {
          action: 'view_module',
          targetType: 'finance',
          targetId: `fin-${i}`,
        });
      }

      const patterns = learnPatterns(profile);
      const modulePattern = patterns.find((p) => p.pattern.startsWith('prefers_module:'));
      expect(modulePattern).toBeDefined();
      expect(modulePattern!.pattern).toBe('prefers_module:finance');
      expect(modulePattern!.confidence).toBeGreaterThan(0.5);
    });

    it('detects frequent action pattern', () => {
      let profile = createUserAgentProfile({ userId: 'u1', tenantId: 't1', role: 'architect' });

      // Record 20 of the same action
      for (let i = 0; i < 20; i++) {
        profile = recordUserActivity(profile, {
          action: 'approve_document',
          targetType: 'document',
          targetId: `doc-${i}`,
        });
      }

      const patterns = learnPatterns(profile);
      const actionPattern = patterns.find((p) => p.pattern.startsWith('frequent_action:'));
      expect(actionPattern).toBeDefined();
      expect(actionPattern!.pattern).toBe('frequent_action:approve_document');
    });

    it('returns empty array for new profiles', () => {
      const profile = createUserAgentProfile({ userId: 'u1', tenantId: 't1', role: 'architect' });
      const patterns = learnPatterns(profile);
      expect(patterns).toEqual([]);
    });
  });

  describe('updateUserContext', () => {
    it('updates active project', () => {
      const profile = createUserAgentProfile({ userId: 'u1', tenantId: 't1', role: 'architect' });
      const updated = updateUserContext(profile, { activeProjectId: 'proj-1' });

      expect(updated.context.activeProjectId).toBe('proj-1');
    });

    it('deduplicates and caps pinned items', () => {
      const profile = createUserAgentProfile({ userId: 'u1', tenantId: 't1', role: 'architect' });
      const updated = updateUserContext(profile, {
        pinnedItems: Array.from({ length: 60 }, (_, i) => `item-${i % 10}`),
      });

      expect(updated.context.pinnedItems.length).toBeLessThanOrEqual(50);
      // Should deduplicate
      const uniqueItems = new Set(updated.context.pinnedItems);
      expect(uniqueItems.size).toBe(updated.context.pinnedItems.length);
    });

    it('caps recent searches at 20', () => {
      const profile = createUserAgentProfile({ userId: 'u1', tenantId: 't1', role: 'architect' });
      const updated = updateUserContext(profile, {
        recentSearches: Array.from({ length: 30 }, (_, i) => `search-${i}`),
      });

      expect(updated.context.recentSearches.length).toBeLessThanOrEqual(20);
    });
  });

  describe('getPersonalizedContext', () => {
    it('returns active project and suggested modules', () => {
      let profile = createUserAgentProfile({ userId: 'u1', tenantId: 't1', role: 'architect' });
      profile = updateUserContext(profile, {
        activeProjectId: 'proj-1',
        pinnedItems: ['doc-1', 'doc-2', 'doc-3', 'doc-4', 'doc-5'],
      });

      // Build some module view history
      for (let i = 0; i < 5; i++) {
        profile = recordUserActivity(profile, {
          action: 'view_module',
          targetType: 'finance',
          targetId: `fin-${i}`,
        });
      }

      profile = { ...profile, learnedPatterns: learnPatterns(profile) };

      const ctx = getPersonalizedContext(profile);
      expect(ctx.activeProject).toBe('proj-1');
      expect(ctx.recentItems).toHaveLength(5);
    });

    it('returns empty suggestions for new users', () => {
      const profile = createUserAgentProfile({ userId: 'u1', tenantId: 't1', role: 'architect' });
      const ctx = getPersonalizedContext(profile);
      expect(ctx.activeProject).toBeUndefined();
      expect(ctx.suggestedModules).toEqual([]);
      expect(ctx.recentItems).toEqual([]);
    });
  });
});
