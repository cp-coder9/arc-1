import { describe, expect, it } from 'vitest';
import {
  buildDashboard,
  getAvailableWidgets,
  getDashboardConfig,
  buildCustomLayout,
  needsRefresh,
} from '../dashboardService';
import type { DashboardRole, DashboardWidget } from '../../types/analyticsReporting';

describe('dashboardService', () => {
  describe('buildDashboard', () => {
    it('builds platform admin dashboard with all widgets', () => {
      const payload = buildDashboard('platform_admin');
      expect(payload.role).toBe('platform_admin');
      expect(payload.widgets.length).toBeGreaterThanOrEqual(8);
      expect(payload.widgets.some((w) => w.widgetId === 'kpi_schedule_variance')).toBe(true);
      expect(payload.widgets.some((w) => w.widgetId === 'obs_latency')).toBe(true);
    });

    it('builds client dashboard with fewer widgets', () => {
      const payload = buildDashboard('client');
      expect(payload.role).toBe('client');
      expect(payload.widgets.every((w) => !w.widgetId.startsWith('obs_'))).toBe(true);
      expect(payload.widgets.some((w) => w.widgetId === 'alert_list')).toBe(true);
    });

    it('builds contractor dashboard with site-related widgets', () => {
      const payload = buildDashboard('contractor');
      expect(payload.role).toBe('contractor');
      expect(payload.widgets.some((w) => w.widgetId === 'kpi_defect_liability')).toBe(true);
      expect(payload.widgets.some((w) => w.widgetId === 'kpi_retention_release')).toBe(true);
    });

    it('resolves KPI data into widgets', () => {
      const kpiData = {
        schedule_variance: {
          name: 'schedule_variance' as const,
          label: 'Schedule Variance',
          plannedMilestones: 5,
          completedOnTime: 3,
          delayed: 2,
          variancePercent: 20,
          unit: 'percent' as const,
        },
      };
      const payload = buildDashboard('principal_agent', { kpiData });
      expect(payload.data['kpi_schedule_variance']).toEqual(kpiData.schedule_variance);
    });

    it('resolves alert count into alert widgets', () => {
      const payload = buildDashboard('principal_agent', { alertCount: 7 });
      const alertData = payload.data['alert_list'] as { count: number } | null;
      expect(alertData).toBeTruthy();
      expect(alertData?.count).toBe(7);
    });

    it('appends custom widgets', () => {
      const customWidget: DashboardWidget = {
        widgetId: 'custom_1',
        type: 'table',
        title: 'Custom Table',
        dataSource: 'custom:source',
        refreshIntervalMs: 0,
        visibleToRoles: ['platform_admin'],
        layout: { row: 8, col: 0, width: 12, height: 4 },
      };
      const payload = buildDashboard('platform_admin', { customWidgets: [customWidget] });
      expect(payload.widgets.some((w) => w.widgetId === 'custom_1')).toBe(true);
    });
  });

  describe('getAvailableWidgets', () => {
    it('returns obs widgets only for admin', () => {
      const adminWidgets = getAvailableWidgets('platform_admin');
      const clientWidgets = getAvailableWidgets('client');
      expect(adminWidgets.length).toBeGreaterThan(clientWidgets.length);
      expect(adminWidgets.some((w) => w.widgetId.startsWith('obs_'))).toBe(true);
      expect(clientWidgets.every((w) => !w.widgetId.startsWith('obs_'))).toBe(true);
    });
  });

  describe('getDashboardConfig', () => {
    it('returns config for all known roles', () => {
      const roles: DashboardRole[] = ['platform_admin', 'principal_agent', 'client', 'contractor'];
      for (const role of roles) {
        const config = getDashboardConfig(role);
        expect(config).toBeDefined();
        expect(config.label).toBeTruthy();
        expect(config.widgets.length).toBeGreaterThan(0);
      }
    });
  });

  describe('buildCustomLayout', () => {
    it('overrides widget positions', () => {
      const widgets: DashboardWidget[] = [
        {
          widgetId: 'test_widget',
          type: 'kpi_card',
          title: 'Test',
          dataSource: 'test',
          refreshIntervalMs: 0,
          visibleToRoles: ['platform_admin'],
          layout: { row: 0, col: 0, width: 4, height: 2 },
        },
      ];
      const result = buildCustomLayout(widgets, {
        test_widget: { row: 3, col: 6 },
      });
      expect(result[0].layout.row).toBe(3);
      expect(result[0].layout.col).toBe(6);
      expect(result[0].layout.width).toBe(4); // unchanged
    });
  });

  describe('needsRefresh', () => {
    it('returns false for recently generated dashboard', () => {
      const now = new Date().toISOString();
      const widgets: DashboardWidget[] = [
        { widgetId: 'w1', type: 'kpi_card', title: 'Test', dataSource: 'test', refreshIntervalMs: 300_000, visibleToRoles: ['platform_admin'], layout: { row: 0, col: 0, width: 4, height: 2 } },
      ];
      expect(needsRefresh(now, widgets)).toBe(false);
    });

    it('returns true for stale dashboard', () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const widgets: DashboardWidget[] = [
        { widgetId: 'w1', type: 'kpi_card', title: 'Test', dataSource: 'test', refreshIntervalMs: 60_000, visibleToRoles: ['platform_admin'], layout: { row: 0, col: 0, width: 4, height: 2 } },
      ];
      expect(needsRefresh(tenMinutesAgo, widgets)).toBe(true);
    });

    it('ignores static widgets (refreshIntervalMs=0) for staleness', () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const widgets: DashboardWidget[] = [
        { widgetId: 'w1', type: 'table', title: 'Static', dataSource: 'static', refreshIntervalMs: 0, visibleToRoles: ['platform_admin'], layout: { row: 0, col: 0, width: 4, height: 2 } },
      ];
      expect(needsRefresh(tenMinutesAgo, widgets)).toBe(false);
    });
  });
});
