/**
 * Unit tests for UnifiedRouter route resolution logic.
 *
 * Tests the pure functions exported from UnifiedRouter: resolveViewId and
 * resolveCommandCentreRoute. The component rendering is tested separately
 * in integration tests.
 */
import { describe, it, expect } from 'vitest';
import { resolveViewId, resolveCommandCentreRoute } from './UnifiedRouter';
import { REGISTERED_VIEWS } from './commandCentreUrlUtils';

describe('UnifiedRouter', () => {
  describe('resolveViewId', () => {
    it('returns the viewId as valid for all registered views', () => {
      for (const view of REGISTERED_VIEWS) {
        const result = resolveViewId(view);
        expect(result.view).toBe(view);
        expect(result.isValid).toBe(true);
      }
    });

    it('falls back to dashboard for unrecognized viewId', () => {
      const result = resolveViewId('nonexistent-view');
      expect(result.view).toBe('dashboard');
      expect(result.isValid).toBe(false);
    });

    it('falls back to dashboard for empty string', () => {
      const result = resolveViewId('');
      expect(result.view).toBe('dashboard');
      expect(result.isValid).toBe(false);
    });

    it('falls back to dashboard for similar but wrong view IDs', () => {
      const invalid = ['task', 'budgets', 'document', 'setting', 'rfi'];
      for (const id of invalid) {
        const result = resolveViewId(id);
        expect(result.view).toBe('dashboard');
        expect(result.isValid).toBe(false);
      }
    });

    it('recognizes hyphenated view IDs correctly', () => {
      const hyphenated = ['site-diary', 'ai-advisor', 'form-system', 'audit-trail'];
      for (const id of hyphenated) {
        const result = resolveViewId(id);
        expect(result.view).toBe(id);
        expect(result.isValid).toBe(true);
      }
    });
  });

  describe('resolveCommandCentreRoute', () => {
    it('resolves a valid command-centre URL correctly', () => {
      const result = resolveCommandCentreRoute('/command-centre/proj-123/tasks');
      expect(result).toEqual({
        projectId: 'proj-123',
        viewId: 'tasks',
        viewWasRecognized: true,
      });
    });

    it('resolves all registered view IDs from URL', () => {
      for (const view of REGISTERED_VIEWS) {
        const result = resolveCommandCentreRoute(`/command-centre/abc/${view}`);
        expect(result).not.toBeNull();
        expect(result!.viewId).toBe(view);
        expect(result!.viewWasRecognized).toBe(true);
      }
    });

    it('falls back to dashboard for unrecognized viewId in URL', () => {
      const result = resolveCommandCentreRoute('/command-centre/proj-123/unknown-view');
      expect(result).toEqual({
        projectId: 'proj-123',
        viewId: 'dashboard',
        viewWasRecognized: false,
      });
    });

    it('returns null for non-command-centre paths', () => {
      expect(resolveCommandCentreRoute('/projects/123/documents')).toBeNull();
      expect(resolveCommandCentreRoute('/some/other/path')).toBeNull();
      expect(resolveCommandCentreRoute('/')).toBeNull();
      expect(resolveCommandCentreRoute('')).toBeNull();
    });

    it('returns null for paths with wrong segment count', () => {
      expect(resolveCommandCentreRoute('/command-centre')).toBeNull();
      expect(resolveCommandCentreRoute('/command-centre/proj-123')).toBeNull();
      expect(resolveCommandCentreRoute('/command-centre/proj-123/tasks/extra')).toBeNull();
    });

    it('decodes URL-encoded projectId', () => {
      const result = resolveCommandCentreRoute('/command-centre/proj%20123/budget');
      expect(result).not.toBeNull();
      expect(result!.projectId).toBe('proj 123');
      expect(result!.viewId).toBe('budget');
    });

    it('decodes URL-encoded viewId', () => {
      const result = resolveCommandCentreRoute('/command-centre/abc/site-diary');
      expect(result).not.toBeNull();
      expect(result!.viewId).toBe('site-diary');
    });

    it('handles trailing slash gracefully', () => {
      // Trailing slashes are stripped before splitting, so this resolves normally
      const result = resolveCommandCentreRoute('/command-centre/proj/tasks/');
      expect(result).toEqual({
        projectId: 'proj',
        viewId: 'tasks',
        viewWasRecognized: true,
      });
    });

    it('returns null when projectId is empty', () => {
      // Double slash creates empty segment
      const result = resolveCommandCentreRoute('/command-centre//tasks');
      expect(result).toBeNull();
    });

    it('resolves new views (passport, form-system, audit-trail)', () => {
      expect(resolveCommandCentreRoute('/command-centre/p1/passport')).toEqual({
        projectId: 'p1',
        viewId: 'passport',
        viewWasRecognized: true,
      });
      expect(resolveCommandCentreRoute('/command-centre/p1/form-system')).toEqual({
        projectId: 'p1',
        viewId: 'form-system',
        viewWasRecognized: true,
      });
      expect(resolveCommandCentreRoute('/command-centre/p1/audit-trail')).toEqual({
        projectId: 'p1',
        viewId: 'audit-trail',
        viewWasRecognized: true,
      });
    });
  });
});
