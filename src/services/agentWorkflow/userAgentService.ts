/**
 * User Agent Service — Pack 14: Agent Orchestration Core
 *
 * Per-user agent instance management, user preference learning,
 * and personalized recommendation context.
 */

import type { ArchitexRole } from '@/types/architexMasterTypes';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface UserAgentProfile {
  id: string;
  userId: string;
  tenantId: string;
  role: ArchitexRole;
  preferences: UserPreferences;
  activityHistory: UserActivity[];
  learnedPatterns: LearnedPattern[];
  context: UserContext;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  preferredView: 'dashboard' | 'inbox' | 'passport';
  notificationFrequency: 'realtime' | 'daily' | 'weekly';
  autoApplyRecommendations: boolean;
  showRiskBadges: boolean;
  language: string;
  theme?: 'light' | 'dark' | 'system';
  customFilters: Record<string, unknown>;
}

export interface UserActivity {
  timestamp: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

export interface LearnedPattern {
  pattern: string;
  confidence: number; // 0-1
  basedOnActivityCount: number;
  lastUpdated: string;
}

export interface UserContext {
  activeProjectId?: string;
  lastViewedPhase?: string;
  lastViewedModule?: string;
  recentSearches: string[];
  pinnedItems: string[];
}

// ─── Profile Factory ──────────────────────────────────────────────────────

export function createUserAgentProfile(params: {
  userId: string;
  tenantId: string;
  role: ArchitexRole;
}): UserAgentProfile {
  const now = new Date().toISOString();
  return {
    id: `user-agent-${params.userId}`,
    userId: params.userId,
    tenantId: params.tenantId,
    role: params.role,
    preferences: createDefaultPreferences(),
    activityHistory: [],
    learnedPatterns: [],
    context: createEmptyContext(),
    createdAt: now,
    updatedAt: now,
  };
}

function createDefaultPreferences(): UserPreferences {
  return {
    preferredView: 'dashboard',
    notificationFrequency: 'realtime',
    autoApplyRecommendations: false,
    showRiskBadges: true,
    language: 'en',
    customFilters: {},
  };
}

function createEmptyContext(): UserContext {
  return {
    recentSearches: [],
    pinnedItems: [],
  };
}

// ─── Preference Learning ──────────────────────────────────────────────────

export function updatePreferences(
  profile: UserAgentProfile,
  updates: Partial<UserPreferences>,
): UserAgentProfile {
  return {
    ...profile,
    preferences: { ...profile.preferences, ...updates },
    updatedAt: new Date().toISOString(),
  };
}

export function recordUserActivity(
  profile: UserAgentProfile,
  activity: Omit<UserActivity, 'timestamp'>,
): UserAgentProfile {
  const entry: UserActivity = {
    ...activity,
    timestamp: new Date().toISOString(),
  };

  // Keep last 500 activities
  const history = [entry, ...profile.activityHistory].slice(0, 500);

  return {
    ...profile,
    activityHistory: history,
    updatedAt: new Date().toISOString(),
  };
}

// ─── Pattern Learning ─────────────────────────────────────────────────────

export function learnPatterns(profile: UserAgentProfile): LearnedPattern[] {
  const patterns: LearnedPattern[] = [];

  // Module preference pattern
  const moduleViews = profile.activityHistory
    .filter((a) => a.action === 'view_module')
    .map((a) => a.targetType);
  const topModule = modeOfArray(moduleViews);
  if (topModule && moduleViews.length > 3) {
    patterns.push({
      pattern: `prefers_module:${topModule}`,
      confidence: Math.min(
        moduleViews.filter((m) => m === topModule).length / moduleViews.length,
        0.95,
      ),
      basedOnActivityCount: moduleViews.length,
      lastUpdated: new Date().toISOString(),
    });
  }

  // Action frequency pattern
  const actions = profile.activityHistory.map((a) => a.action);
  const topAction = modeOfArray(actions);
  if (topAction && actions.length > 5) {
    patterns.push({
      pattern: `frequent_action:${topAction}`,
      confidence: Math.min(
        actions.filter((a) => a === topAction).length / actions.length,
        0.9,
      ),
      basedOnActivityCount: actions.length,
      lastUpdated: new Date().toISOString(),
    });
  }

  return patterns;
}

// ─── Personalized Context ─────────────────────────────────────────────────

export function updateUserContext(
  profile: UserAgentProfile,
  updates: Partial<UserContext>,
): UserAgentProfile {
  return {
    ...profile,
    context: {
      ...profile.context,
      ...updates,
      recentSearches: [
        ...(updates.recentSearches ?? []),
        ...profile.context.recentSearches,
      ].slice(0, 20),
      pinnedItems: [
        ...new Set([
          ...(updates.pinnedItems ?? []),
          ...profile.context.pinnedItems,
        ]),
      ].slice(0, 50),
    },
    updatedAt: new Date().toISOString(),
  };
}

export function getPersonalizedContext(
  profile: UserAgentProfile,
): {
  activeProject: string | undefined;
  suggestedModules: string[];
  recentItems: string[];
} {
  const moduleSuggestions =
    profile.learnedPatterns
      .filter((p) => p.pattern.startsWith('prefers_module:'))
      .sort((a, b) => b.confidence - a.confidence)
      .map((p) => p.pattern.replace('prefers_module:', '')) ?? [];

  return {
    activeProject: profile.context.activeProjectId,
    suggestedModules: moduleSuggestions.slice(0, 3),
    recentItems: profile.context.pinnedItems.slice(0, 5),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function modeOfArray<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  const counts = new Map<T, number>();
  let maxCount = 0;
  let mode: T | undefined;
  for (const item of arr) {
    const count = (counts.get(item) ?? 0) + 1;
    counts.set(item, count);
    if (count > maxCount) {
      maxCount = count;
      mode = item;
    }
  }
  return mode;
}
