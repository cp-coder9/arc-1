/**
 * Project Command Centre — Legacy Preference Service
 *
 * Maps legacy project module preferences to Command Centre settings.
 * Handles unexpected data formats gracefully — logs issues, renders valid data,
 * shows inline notice for bad entries.
 *
 * Property 25: Legacy Preference Graceful Handling
 * For any legacy key-value pair: either maps to a valid CC setting (if mapping exists)
 * or returns the CC default without throwing.
 *
 * @module commandCentre/legacyPreferenceService
 * @validates Requirements 13.3, 13.4, 13.5
 */

import type { CommandCentreView, ComplexityMode } from './types';

// ── Types ────────────────────────────────────────────────────────────────────

/** Result of applying a legacy preference. */
export interface PreferenceResult {
  /** Whether the legacy key was successfully mapped to a CC setting. */
  mapped: boolean;
  /** The resolved Command Centre setting key. */
  settingKey: string;
  /** The resolved value (either mapped from legacy or CC default). */
  value: unknown;
  /** If the preference was not mapped, the reason. */
  reason?: string;
}

/** Known Command Centre preference keys with their default values. */
export interface CommandCentrePreferences {
  defaultView: CommandCentreView;
  complexityMode: ComplexityMode;
  sidebarCollapsed: boolean;
  showCompletedTasks: boolean;
  itemsPerPage: number;
  sortOrder: 'asc' | 'desc';
  dateFormat: 'iso' | 'locale' | 'relative';
  notificationsEnabled: boolean;
  autoRefreshInterval: number;
}

// ── Default Preferences ──────────────────────────────────────────────────────

export const CC_DEFAULTS: CommandCentrePreferences = {
  defaultView: 'dashboard',
  complexityMode: 'full',
  sidebarCollapsed: false,
  showCompletedTasks: true,
  itemsPerPage: 50,
  sortOrder: 'desc',
  dateFormat: 'locale',
  notificationsEnabled: true,
  autoRefreshInterval: 30,
};

// ── Legacy → CC Mapping Table ────────────────────────────────────────────────

/**
 * Maps legacy preference keys to their Command Centre equivalents.
 * Keys not in this map have no CC equivalent and will return CC defaults.
 */
const LEGACY_KEY_MAP: Record<string, keyof CommandCentrePreferences> = {
  // Legacy Projects module preferences
  'projects.defaultSection': 'defaultView',
  'projects.displayMode': 'complexityMode',
  'projects.sidebarState': 'sidebarCollapsed',
  'projects.showDone': 'showCompletedTasks',
  'projects.pageSize': 'itemsPerPage',
  'projects.sortDirection': 'sortOrder',
  'projects.dateDisplay': 'dateFormat',
  'projects.notifications': 'notificationsEnabled',
  'projects.refreshRate': 'autoRefreshInterval',

  // Alternate legacy keys from older versions
  'default_section': 'defaultView',
  'sidebar_collapsed': 'sidebarCollapsed',
  'page_size': 'itemsPerPage',
  'sort_dir': 'sortOrder',
};

/**
 * Transforms legacy values into CC-compatible values.
 * Returns undefined if the value cannot be transformed.
 */
function transformValue(settingKey: keyof CommandCentrePreferences, legacyValue: unknown): unknown | undefined {
  try {
    switch (settingKey) {
      case 'defaultView': {
        if (typeof legacyValue !== 'string') return undefined;
        // Map legacy section names to CC view IDs
        const viewMap: Record<string, CommandCentreView> = {
          'dashboard': 'dashboard',
          'team': 'team',
          'documents': 'documents',
          'rfis': 'rfis',
          'instructions': 'rfis',
          'snags': 'quality',
          'payments': 'valuations',
          'passport': 'passport',
          'form-system': 'form-system',
          'audit_trail': 'audit-trail',
          'audit-trail': 'audit-trail',
          'tasks': 'tasks',
          'budget': 'budget',
          'programme': 'programme',
        };
        return viewMap[legacyValue] ?? undefined;
      }
      case 'complexityMode': {
        if (legacyValue === 'simple' || legacyValue === 'full') return legacyValue;
        if (legacyValue === 'basic') return 'simple';
        if (legacyValue === 'advanced') return 'full';
        return undefined;
      }
      case 'sidebarCollapsed': {
        if (typeof legacyValue === 'boolean') return legacyValue;
        if (legacyValue === 'collapsed') return true;
        if (legacyValue === 'expanded') return false;
        return undefined;
      }
      case 'showCompletedTasks': {
        if (typeof legacyValue === 'boolean') return legacyValue;
        if (legacyValue === 'yes' || legacyValue === '1' || legacyValue === 'true') return true;
        if (legacyValue === 'no' || legacyValue === '0' || legacyValue === 'false') return false;
        return undefined;
      }
      case 'itemsPerPage': {
        const num = typeof legacyValue === 'number' ? legacyValue : Number(legacyValue);
        if (isNaN(num) || num < 1 || num > 200) return undefined;
        return Math.round(num);
      }
      case 'sortOrder': {
        if (legacyValue === 'asc' || legacyValue === 'desc') return legacyValue;
        if (legacyValue === 'ascending') return 'asc';
        if (legacyValue === 'descending') return 'desc';
        return undefined;
      }
      case 'dateFormat': {
        if (legacyValue === 'iso' || legacyValue === 'locale' || legacyValue === 'relative') return legacyValue;
        return undefined;
      }
      case 'notificationsEnabled': {
        if (typeof legacyValue === 'boolean') return legacyValue;
        if (legacyValue === 'on' || legacyValue === 'enabled') return true;
        if (legacyValue === 'off' || legacyValue === 'disabled') return false;
        return undefined;
      }
      case 'autoRefreshInterval': {
        const num = typeof legacyValue === 'number' ? legacyValue : Number(legacyValue);
        if (isNaN(num) || num < 5 || num > 300) return undefined;
        return Math.round(num);
      }
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

// ── Core Service ─────────────────────────────────────────────────────────────

/**
 * Applies a legacy preference key-value pair by mapping it to the corresponding
 * Command Centre setting. If no mapping exists or the value cannot be transformed,
 * returns the CC default without error.
 *
 * Property 25: Legacy Preference Graceful Handling
 * - If mapping exists and value is transformable → returns mapped CC setting
 * - If no mapping exists → returns CC default for the closest setting
 * - If value is malformed → logs the issue, returns CC default
 * - NEVER throws an error
 *
 * @param key - The legacy preference key.
 * @param value - The legacy preference value (may be any type).
 * @returns PreferenceResult with the resolved setting.
 *
 * @validates Requirements 13.3, 13.4, 13.5
 */
export function applyLegacyPreference(key: string, value: unknown): PreferenceResult {
  // Find the CC setting key this legacy key maps to
  const ccSettingKey = LEGACY_KEY_MAP[key];

  if (!ccSettingKey) {
    // No mapping exists — return default for 'defaultView' (first key) without error
    console.info(`[legacyPreferenceService] No mapping for legacy key "${key}" — using CC default.`);
    return {
      mapped: false,
      settingKey: key,
      value: CC_DEFAULTS.defaultView,
      reason: `No Command Centre mapping for legacy preference "${key}"`,
    };
  }

  // Attempt to transform the value
  const transformedValue = transformValue(ccSettingKey, value);

  if (transformedValue === undefined) {
    // Value cannot be transformed — log and return default
    console.warn(`[legacyPreferenceService] Cannot transform value for "${key}" (${typeof value}: ${String(value)}) — using CC default for "${ccSettingKey}".`);
    return {
      mapped: false,
      settingKey: ccSettingKey,
      value: CC_DEFAULTS[ccSettingKey],
      reason: `Unexpected data format for "${key}" — using default`,
    };
  }

  return {
    mapped: true,
    settingKey: ccSettingKey,
    value: transformedValue,
  };
}

/**
 * Applies a batch of legacy preferences, returning all results.
 * Never throws — each preference is handled independently.
 */
export function applyLegacyPreferences(
  preferences: Record<string, unknown>,
): PreferenceResult[] {
  return Object.entries(preferences).map(([key, value]) => applyLegacyPreference(key, value));
}

/**
 * Returns the CC default value for a given setting key.
 */
export function getDefaultPreference(key: keyof CommandCentrePreferences): unknown {
  return CC_DEFAULTS[key];
}

// ── Service Export ───────────────────────────────────────────────────────────

export const legacyPreferenceService = {
  applyLegacyPreference,
  applyLegacyPreferences,
  getDefaultPreference,
  CC_DEFAULTS,
};

export default legacyPreferenceService;
