/**
 * Unit tests for Command Centre URL encoding utilities.
 *
 * Tests cover: buildCommandCentreUrl, parseCommandCentreUrl,
 * pushCommandCentreState, replaceCommandCentreState, and the
 * REGISTERED_VIEWS constant.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildCommandCentreUrl,
  parseCommandCentreUrl,
  pushCommandCentreState,
  replaceCommandCentreState,
  REGISTERED_VIEWS,
} from './commandCentreUrlUtils';

describe('commandCentreUrlUtils', () => {
  describe('REGISTERED_VIEWS', () => {
    it('contains all 23 registered view IDs', () => {
      expect(REGISTERED_VIEWS).toHaveLength(23);
    });

    it('includes key views', () => {
      expect(REGISTERED_VIEWS).toContain('dashboard');
      expect(REGISTERED_VIEWS).toContain('tasks');
      expect(REGISTERED_VIEWS).toContain('budget');
      expect(REGISTERED_VIEWS).toContain('quality');
      expect(REGISTERED_VIEWS).toContain('ai-advisor');
      expect(REGISTERED_VIEWS).toContain('site-diary');
    });
  });

  describe('buildCommandCentreUrl', () => {
    it('builds correct URL for standard project and view', () => {
      expect(buildCommandCentreUrl('abc123', 'tasks')).toBe('/command-centre/abc123/tasks');
    });

    it('builds correct URL for budget view', () => {
      expect(buildCommandCentreUrl('proj-456', 'budget')).toBe('/command-centre/proj-456/budget');
    });

    it('builds correct URL for quality view', () => {
      expect(buildCommandCentreUrl('abc123', 'quality')).toBe('/command-centre/abc123/quality');
    });

    it('encodes special characters in projectId', () => {
      expect(buildCommandCentreUrl('project/with/slashes', 'tasks')).toBe(
        '/command-centre/project%2Fwith%2Fslashes/tasks',
      );
    });

    it('encodes spaces in projectId', () => {
      expect(buildCommandCentreUrl('my project', 'dashboard')).toBe(
        '/command-centre/my%20project/dashboard',
      );
    });

    it('handles hyphenated view IDs', () => {
      expect(buildCommandCentreUrl('abc', 'ai-advisor')).toBe('/command-centre/abc/ai-advisor');
      expect(buildCommandCentreUrl('abc', 'site-diary')).toBe('/command-centre/abc/site-diary');
    });
  });

  describe('parseCommandCentreUrl', () => {
    it('parses a valid Command Centre URL', () => {
      const result = parseCommandCentreUrl('/command-centre/abc123/tasks');
      expect(result).toEqual({ projectId: 'abc123', viewId: 'tasks' });
    });

    it('parses URL with hyphenated view ID', () => {
      const result = parseCommandCentreUrl('/command-centre/proj1/ai-advisor');
      expect(result).toEqual({ projectId: 'proj1', viewId: 'ai-advisor' });
    });

    it('parses URL with encoded projectId', () => {
      const result = parseCommandCentreUrl('/command-centre/project%2Fwith%2Fslashes/tasks');
      expect(result).toEqual({ projectId: 'project/with/slashes', viewId: 'tasks' });
    });

    it('returns null for invalid view ID', () => {
      expect(parseCommandCentreUrl('/command-centre/abc123/nonexistent')).toBeNull();
    });

    it('returns null for non-command-centre path', () => {
      expect(parseCommandCentreUrl('/projects/abc123/tasks')).toBeNull();
    });

    it('returns null for path with too few segments', () => {
      expect(parseCommandCentreUrl('/command-centre/abc123')).toBeNull();
    });

    it('returns null for path with too many segments', () => {
      expect(parseCommandCentreUrl('/command-centre/abc123/tasks/extra')).toBeNull();
    });

    it('returns null for empty projectId', () => {
      expect(parseCommandCentreUrl('/command-centre//tasks')).toBeNull();
    });

    it('returns null for completely empty path', () => {
      expect(parseCommandCentreUrl('')).toBeNull();
    });

    it('returns null for just a slash', () => {
      expect(parseCommandCentreUrl('/')).toBeNull();
    });

    it('handles trailing slash gracefully', () => {
      const result = parseCommandCentreUrl('/command-centre/abc123/tasks/');
      expect(result).toEqual({ projectId: 'abc123', viewId: 'tasks' });
    });
  });

  describe('URL round-trip', () => {
    it('round-trips for all registered views', () => {
      for (const viewId of REGISTERED_VIEWS) {
        const url = buildCommandCentreUrl('test-project', viewId);
        const parsed = parseCommandCentreUrl(url);
        expect(parsed).toEqual({ projectId: 'test-project', viewId });
      }
    });

    it('round-trips with special characters in projectId', () => {
      const projectId = 'project with spaces & special/chars';
      const url = buildCommandCentreUrl(projectId, 'budget');
      const parsed = parseCommandCentreUrl(url);
      expect(parsed).toEqual({ projectId, viewId: 'budget' });
    });
  });

  describe('pushCommandCentreState', () => {
    beforeEach(() => {
      vi.spyOn(window.history, 'pushState');
    });

    it('calls history.pushState with correct URL and state', () => {
      pushCommandCentreState('abc123', 'tasks');

      expect(window.history.pushState).toHaveBeenCalledWith(
        { projectId: 'abc123', viewId: 'tasks' },
        '',
        '/command-centre/abc123/tasks',
      );
    });

    it('calls history.pushState for hyphenated view IDs', () => {
      pushCommandCentreState('proj1', 'ai-advisor');

      expect(window.history.pushState).toHaveBeenCalledWith(
        { projectId: 'proj1', viewId: 'ai-advisor' },
        '',
        '/command-centre/proj1/ai-advisor',
      );
    });
  });

  describe('replaceCommandCentreState', () => {
    beforeEach(() => {
      vi.spyOn(window.history, 'replaceState');
    });

    it('calls history.replaceState with correct URL and state', () => {
      replaceCommandCentreState('abc123', 'dashboard');

      expect(window.history.replaceState).toHaveBeenCalledWith(
        { projectId: 'abc123', viewId: 'dashboard' },
        '',
        '/command-centre/abc123/dashboard',
      );
    });

    it('calls history.replaceState for encoded projectId', () => {
      replaceCommandCentreState('my/project', 'budget');

      expect(window.history.replaceState).toHaveBeenCalledWith(
        { projectId: 'my/project', viewId: 'budget' },
        '',
        '/command-centre/my%2Fproject/budget',
      );
    });
  });
});
