import { describe, it, expect } from 'vitest';
import { buildBreadcrumb, getViewLabel, VIEW_LABELS } from './breadcrumbUtils';
import type { CommandCentreView } from '@/services/commandCentre/types';

/**
 * Unit tests for breadcrumb generation utilities.
 *
 * Validates: Requirements 6.4
 */
describe('breadcrumbUtils', () => {
  describe('buildBreadcrumb', () => {
    it('produces correct breadcrumb string for dashboard view', () => {
      const result = buildBreadcrumb('Sea Side Villa', 'dashboard');
      expect(result).toBe('Architex › Command Centre › Sea Side Villa › Dashboard');
    });

    it('produces correct breadcrumb string for tasks view', () => {
      const result = buildBreadcrumb('Office Park Phase 2', 'tasks');
      expect(result).toBe('Architex › Command Centre › Office Park Phase 2 › Task Board');
    });

    it('produces correct breadcrumb string for quality view', () => {
      const result = buildBreadcrumb('Residential Complex', 'quality');
      expect(result).toBe('Architex › Command Centre › Residential Complex › Quality Tracker');
    });

    it('produces correct breadcrumb string for budget view', () => {
      const result = buildBreadcrumb('Heritage Restoration', 'budget');
      expect(result).toBe('Architex › Command Centre › Heritage Restoration › Budget Controller');
    });

    it('produces correct breadcrumb string for ai-advisor view', () => {
      const result = buildBreadcrumb('School Extension', 'ai-advisor');
      expect(result).toBe('Architex › Command Centre › School Extension › AI Advisor');
    });

    it('handles project names with special characters', () => {
      const result = buildBreadcrumb('Project (Phase 1) – Unit A', 'documents');
      expect(result).toBe('Architex › Command Centre › Project (Phase 1) – Unit A › Documents');
    });

    it('handles single-character project name', () => {
      const result = buildBreadcrumb('X', 'settings');
      expect(result).toBe('Architex › Command Centre › X › Settings');
    });

    it('always starts with "Architex › Command Centre"', () => {
      const views: CommandCentreView[] = ['dashboard', 'tasks', 'budget', 'rfis', 'quality'];
      for (const view of views) {
        const result = buildBreadcrumb('Any Project', view);
        expect(result.startsWith('Architex › Command Centre › ')).toBe(true);
      }
    });

    it('always ends with the view label', () => {
      const result = buildBreadcrumb('My Project', 'procurement');
      expect(result.endsWith(' › Procurement')).toBe(true);
    });

    it('contains exactly 3 separator marks (4 segments)', () => {
      const result = buildBreadcrumb('Test Project', 'milestones');
      const separatorCount = (result.match(/›/g) || []).length;
      expect(separatorCount).toBe(3);
    });
  });

  describe('getViewLabel', () => {
    it('returns correct label for all known views', () => {
      const expectedLabels: Partial<Record<CommandCentreView, string>> = {
        dashboard: 'Dashboard',
        programme: 'Programme',
        tasks: 'Task Board',
        milestones: 'Milestones',
        calendar: 'Calendar',
        team: 'Team',
        'site-diary': 'Site Diary',
        rfis: 'RFIs & Instructions',
        quality: 'Quality Tracker',
        budget: 'Budget Controller',
        valuations: 'Valuations',
        procurement: 'Procurement',
        contracts: 'Contracts',
        analytics: 'Analytics & KPIs',
        'ai-advisor': 'AI Advisor',
        documents: 'Documents',
        settings: 'Settings',
        actions: 'Action Centre',
        notifications: 'Notifications',
        passport: 'Passport',
        'form-system': 'Forms',
        'audit-trail': 'Audit Trail',
      };

      for (const [viewId, label] of Object.entries(expectedLabels)) {
        expect(getViewLabel(viewId as CommandCentreView)).toBe(label);
      }
    });
  });

  describe('VIEW_LABELS', () => {
    it('covers every CommandCentreView type', () => {
      const allViews: CommandCentreView[] = [
        'dashboard', 'programme', 'tasks', 'milestones', 'calendar', 'team',
        'site-diary', 'rfis', 'issues', 'quality', 'budget', 'valuations',
        'procurement', 'contracts', 'analytics', 'ai-advisor', 'documents',
        'settings', 'actions', 'notifications', 'passport', 'form-system', 'audit-trail',
      ];

      for (const view of allViews) {
        expect(VIEW_LABELS[view]).toBeDefined();
        expect(VIEW_LABELS[view].length).toBeGreaterThan(0);
      }
    });
  });
});
