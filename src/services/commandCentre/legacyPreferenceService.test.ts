/**
 * Unit tests for legacyPreferenceService
 */
import {
  applyLegacyPreference,
  applyLegacyPreferences,
  getDefaultPreference,
  CC_DEFAULTS,
  type PreferenceResult,
} from './legacyPreferenceService';

describe('legacyPreferenceService', () => {
  describe('applyLegacyPreference', () => {
    it('maps known legacy key with valid value', () => {
      const result = applyLegacyPreference('projects.defaultSection', 'dashboard');
      expect(result.mapped).toBe(true);
      expect(result.settingKey).toBe('defaultView');
      expect(result.value).toBe('dashboard');
    });

    it('maps legacy section names to CC view IDs', () => {
      expect(applyLegacyPreference('projects.defaultSection', 'snags').value).toBe('quality');
      expect(applyLegacyPreference('projects.defaultSection', 'instructions').value).toBe('rfis');
      expect(applyLegacyPreference('projects.defaultSection', 'payments').value).toBe('valuations');
      expect(applyLegacyPreference('projects.defaultSection', 'audit_trail').value).toBe('audit-trail');
    });

    it('maps complexity mode variants', () => {
      expect(applyLegacyPreference('projects.displayMode', 'simple').value).toBe('simple');
      expect(applyLegacyPreference('projects.displayMode', 'full').value).toBe('full');
      expect(applyLegacyPreference('projects.displayMode', 'basic').value).toBe('simple');
      expect(applyLegacyPreference('projects.displayMode', 'advanced').value).toBe('full');
    });

    it('maps sidebar state variants', () => {
      expect(applyLegacyPreference('projects.sidebarState', true).value).toBe(true);
      expect(applyLegacyPreference('projects.sidebarState', 'collapsed').value).toBe(true);
      expect(applyLegacyPreference('projects.sidebarState', 'expanded').value).toBe(false);
    });

    it('maps numeric values for itemsPerPage', () => {
      expect(applyLegacyPreference('projects.pageSize', 25).value).toBe(25);
      expect(applyLegacyPreference('projects.pageSize', '100').value).toBe(100);
    });

    it('returns CC default for unmapped key without throwing', () => {
      const result = applyLegacyPreference('unknown.key', 'some-value');
      expect(result.mapped).toBe(false);
      expect(result.reason).toContain('No Command Centre mapping');
      // Should NOT throw
    });

    it('returns CC default for malformed value without throwing', () => {
      const result = applyLegacyPreference('projects.pageSize', 'not-a-number');
      expect(result.mapped).toBe(false);
      expect(result.value).toBe(CC_DEFAULTS.itemsPerPage);
      expect(result.reason).toContain('Unexpected data format');
    });

    it('returns CC default for out-of-range numeric values', () => {
      const result = applyLegacyPreference('projects.pageSize', 500);
      expect(result.mapped).toBe(false);
      expect(result.value).toBe(CC_DEFAULTS.itemsPerPage);
    });

    it('handles null and undefined values gracefully', () => {
      expect(() => applyLegacyPreference('projects.defaultSection', null)).not.toThrow();
      expect(() => applyLegacyPreference('projects.defaultSection', undefined)).not.toThrow();
    });

    it('handles object and array values gracefully', () => {
      expect(() => applyLegacyPreference('projects.defaultSection', { foo: 'bar' })).not.toThrow();
      expect(() => applyLegacyPreference('projects.pageSize', [1, 2, 3])).not.toThrow();
    });

    it('maps sort order variants', () => {
      expect(applyLegacyPreference('projects.sortDirection', 'ascending').value).toBe('asc');
      expect(applyLegacyPreference('projects.sortDirection', 'descending').value).toBe('desc');
    });

    it('maps notification preference variants', () => {
      expect(applyLegacyPreference('projects.notifications', 'on').value).toBe(true);
      expect(applyLegacyPreference('projects.notifications', 'disabled').value).toBe(false);
    });
  });

  describe('applyLegacyPreferences (batch)', () => {
    it('processes multiple preferences without throwing', () => {
      const prefs = {
        'projects.defaultSection': 'dashboard',
        'projects.displayMode': 'advanced',
        'unknown.key': 'value',
        'projects.pageSize': 'invalid',
      };

      const results = applyLegacyPreferences(prefs);
      expect(results).toHaveLength(4);
      expect(results[0].mapped).toBe(true);
      expect(results[1].mapped).toBe(true);
      expect(results[2].mapped).toBe(false);
      expect(results[3].mapped).toBe(false);
    });
  });

  describe('getDefaultPreference', () => {
    it('returns the CC default for any known setting key', () => {
      expect(getDefaultPreference('defaultView')).toBe('dashboard');
      expect(getDefaultPreference('complexityMode')).toBe('full');
      expect(getDefaultPreference('itemsPerPage')).toBe(50);
    });
  });
});
