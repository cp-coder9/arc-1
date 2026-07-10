import { describe, it, expect } from 'vitest';
import {
  getViewsForRole,
  isViewAccessible,
  getDefaultComplexityMode,
  SIMPLE_MODE_VIEWS,
  ALL_VIEWS,
} from './roleViewMatrix';
import type { CommandCentreView } from './types';
import type { UserRole } from '@/types';

describe('roleViewMatrix', () => {
  describe('getViewsForRole', () => {
    it('returns all views for architect in full mode', () => {
      const views = getViewsForRole('architect', 'full');
      expect(views).toEqual(ALL_VIEWS);
    });

    it('returns all views for bep in full mode', () => {
      const views = getViewsForRole('bep', 'full');
      expect(views).toEqual(ALL_VIEWS);
    });

    it('returns limited views for client in full mode', () => {
      const views = getViewsForRole('client', 'full');
      expect(views).toEqual(['dashboard', 'milestones', 'budget', 'documents', 'notifications']);
    });

    it('returns site_manager views in full mode', () => {
      const views = getViewsForRole('site_manager', 'full');
      expect(views).toEqual(['dashboard', 'programme', 'tasks', 'site-diary', 'rfis', 'quality', 'team']);
    });

    it('returns quantity_surveyor views in full mode', () => {
      const views = getViewsForRole('quantity_surveyor', 'full');
      expect(views).toEqual(['dashboard', 'budget', 'valuations', 'procurement', 'contracts', 'milestones', 'analytics']);
    });

    it('returns contractor views in full mode', () => {
      const views = getViewsForRole('contractor', 'full');
      expect(views).toEqual(['dashboard', 'tasks', 'programme', 'site-diary', 'rfis', 'quality', 'procurement']);
    });

    it('returns subcontractor views matching contractor in full mode', () => {
      const views = getViewsForRole('subcontractor', 'full');
      expect(views).toEqual(['dashboard', 'tasks', 'programme', 'site-diary', 'rfis', 'quality', 'procurement']);
    });

    it('returns supplier views in full mode', () => {
      const views = getViewsForRole('supplier', 'full');
      expect(views).toEqual(['procurement', 'documents']);
    });

    it('returns engineer views in full mode', () => {
      const views = getViewsForRole('engineer', 'full');
      expect(views).toEqual(['dashboard', 'programme', 'tasks', 'rfis', 'quality', 'documents']);
    });

    it('filters to simple mode subset for architect', () => {
      const views = getViewsForRole('architect', 'simple');
      // Architect has all views; simple mode filters to only the simple subset.
      // Order follows the role's view list (ALL_VIEWS order).
      expect(new Set(views)).toEqual(new Set(SIMPLE_MODE_VIEWS));
      expect(views).toHaveLength(SIMPLE_MODE_VIEWS.length);
    });

    it('filters to simple mode subset intersected with role views for client', () => {
      const views = getViewsForRole('client', 'simple');
      // client has: dashboard, milestones, budget, documents, notifications
      // simple has: tasks, milestones, budget, site-diary, quality, documents
      // intersection: milestones, budget, documents
      expect(views).toEqual(['milestones', 'budget', 'documents']);
    });

    it('filters to simple mode subset for site_manager', () => {
      const views = getViewsForRole('site_manager', 'simple');
      // site_manager has: dashboard, programme, tasks, site-diary, rfis, quality, team
      // simple has: tasks, milestones, budget, site-diary, quality, documents
      // intersection: tasks, site-diary, quality
      expect(views).toEqual(['tasks', 'site-diary', 'quality']);
    });

    it('returns empty array for supplier in simple mode (no overlap)', () => {
      const views = getViewsForRole('supplier', 'simple');
      // supplier has: procurement, documents
      // simple has: tasks, milestones, budget, site-diary, quality, documents
      // intersection: documents
      expect(views).toEqual(['documents']);
    });
  });

  describe('isViewAccessible', () => {
    it('returns true for accessible view', () => {
      expect(isViewAccessible('architect', 'dashboard', 'full')).toBe(true);
    });

    it('returns false for inaccessible view', () => {
      expect(isViewAccessible('client', 'programme', 'full')).toBe(false);
    });

    it('returns false when view is role-accessible but not in simple mode', () => {
      // architect has dashboard in full, but dashboard is not in SIMPLE_MODE_VIEWS
      expect(isViewAccessible('architect', 'dashboard', 'simple')).toBe(false);
    });

    it('returns true when view is both role-accessible and in simple mode', () => {
      expect(isViewAccessible('architect', 'tasks', 'simple')).toBe(true);
    });

    it('returns false for supplier trying to access tasks', () => {
      expect(isViewAccessible('supplier', 'tasks', 'full')).toBe(false);
    });
  });

  describe('getDefaultComplexityMode', () => {
    it('returns simple for contract value below R 5M', () => {
      expect(getDefaultComplexityMode(4_999_999)).toBe('simple');
    });

    it('returns full for contract value at exactly R 5M', () => {
      expect(getDefaultComplexityMode(5_000_000)).toBe('full');
    });

    it('returns full for contract value above R 5M', () => {
      expect(getDefaultComplexityMode(10_000_000)).toBe('full');
    });

    it('returns simple for zero contract value', () => {
      expect(getDefaultComplexityMode(0)).toBe('simple');
    });

    it('returns simple for small residential project', () => {
      expect(getDefaultComplexityMode(3_200_000)).toBe('simple');
    });

    it('returns full for large commercial project', () => {
      expect(getDefaultComplexityMode(220_000_000)).toBe('full');
    });
  });

  describe('constants', () => {
    it('SIMPLE_MODE_VIEWS contains exactly the defined subset', () => {
      expect(SIMPLE_MODE_VIEWS).toEqual([
        'tasks',
        'milestones',
        'budget',
        'site-diary',
        'quality',
        'documents',
      ]);
    });

    it('ALL_VIEWS contains 20 views', () => {
      expect(ALL_VIEWS).toHaveLength(20);
    });

    it('SIMPLE_MODE_VIEWS is a subset of ALL_VIEWS', () => {
      for (const view of SIMPLE_MODE_VIEWS) {
        expect(ALL_VIEWS).toContain(view);
      }
    });
  });
});
