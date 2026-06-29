import { describe, it, expect } from 'vitest';
import { architexNavigation, getNavigationForRole, resolveStageCapture, resolveFieldToolsAccess } from './architexNavigationConfig';
import type { LifecycleStage } from './navTypes';
import type { UserRole } from '../types';
import { EDITOR_ROLES } from '@/services/fieldAccessService';

/**
 * Task 16.1 — IssueDashboard wired to Projects → snags section.
 * Validates: Requirements 8.1
 */
describe('architexNavigationConfig — Projects snags wiring', () => {
  function getSnagsSection(nav = architexNavigation) {
    const projects = nav.find((m) => m.key === 'projects');
    return projects?.sections.find((s) => s.key === 'snags');
  }

  it('mounts IssueDashboard in the existing snags navigation key', () => {
    const snags = getSnagsSection();
    expect(snags).toBeDefined();
    expect(snags?.component).toBe('IssueDashboard');
  });

  it('preserves existing SnagManager functionality alongside IssueDashboard', () => {
    const snags = getSnagsSection();
    expect(snags?.preservesComponents).toContain('SnagManager');
  });

  it('keeps the snags section reachable for site-execution roles via Projects', () => {
    for (const role of ['site_manager', 'contractor', 'architect'] as const) {
      const nav = getNavigationForRole(role);
      const snags = getSnagsSection(nav);
      expect(snags?.component).toBe('IssueDashboard');
    }
  });

  it('leaves the snags section metadata intact (label/projectScoped/phaseAware)', () => {
    const snags = getSnagsSection();
    expect(snags?.label).toBe('Snags');
    expect(snags?.projectScoped).toBe(true);
    expect(snags?.phaseAware).toBe(true);
  });
});

/**
 * Task 16.2 — Stage-specific capture entry points gated on Toolboxes sections.
 * Validates: Requirements 8.2, 8.3, 8.4
 */
describe('architexNavigationConfig — stage-gated field capture', () => {
  function getToolboxSection(key: string) {
    const toolboxes = architexNavigation.find((m) => m.key === 'toolboxes');
    return toolboxes?.sections.find((s) => s.key === key);
  }

  const allStages: LifecycleStage[] = [
    'brief', 'appoint', 'design', 'comply', 'procure', 'build', 'pay', 'closeout',
  ];

  it('declares Build capture capabilities on the construction_admin section', () => {
    const section = getToolboxSection('construction_admin');
    expect(section?.captureStage).toBe('build');
    expect(section?.captureCapabilities).toEqual(['field_capture', 'checklists', 'field_reporting']);
  });

  it('declares Close-out capture capabilities on the closeout section', () => {
    const section = getToolboxSection('closeout');
    expect(section?.captureStage).toBe('closeout');
    expect(section?.captureCapabilities).toEqual(['snag_rectification', 'handover_reporting']);
  });

  it('enables Build capture through construction_admin (Req 8.2)', () => {
    const resolution = resolveStageCapture('build');
    expect(resolution.mode).toBe('capture');
    expect(resolution.sectionKey).toBe('construction_admin');
    expect(resolution.enabledCapabilities).toEqual(['field_capture', 'checklists', 'field_reporting']);
  });

  it('enables Close-out snag rectification + handover reporting through closeout (Req 8.3)', () => {
    const resolution = resolveStageCapture('closeout');
    expect(resolution.mode).toBe('capture');
    expect(resolution.sectionKey).toBe('closeout');
    expect(resolution.enabledCapabilities).toEqual(['snag_rectification', 'handover_reporting']);
  });

  it('exposes read-and-report mode only for non-Build/Close-out stages (Req 8.4)', () => {
    const otherStages = allStages.filter((s) => s !== 'build' && s !== 'closeout');
    for (const stage of otherStages) {
      const resolution = resolveStageCapture(stage);
      expect(resolution.mode).toBe('read_reporting');
      expect(resolution.sectionKey).toBeUndefined();
      expect(resolution.enabledCapabilities).toEqual([]);
    }
  });

  it('enables capture if and only if the stage is Build or Close-out (Property 26)', () => {
    for (const stage of allStages) {
      const captureEnabled = resolveStageCapture(stage).mode === 'capture';
      expect(captureEnabled).toBe(stage === 'build' || stage === 'closeout');
    }
  });
});

/**
 * Task 16.3 — Role-aware visibility for field tools across navigation.
 * Validates: Requirements 6.1, 6.2
 */
describe('architexNavigationConfig — role-aware field tools access', () => {
  it('grants editor roles full access (capture + reporting) (Req 6.1)', () => {
    for (const role of EDITOR_ROLES) {
      const resolution = resolveFieldToolsAccess(role);
      expect(resolution.access).toBe('full');
      expect(resolution.canCapture).toBe(true);
      expect(resolution.canReport).toBe(true);
      expect(resolution.error).toBeUndefined();
    }
  });

  it('grants the client read/reporting only and denies capture (Req 6.2)', () => {
    const resolution = resolveFieldToolsAccess('client');
    expect(resolution.access).toBe('read_reporting');
    expect(resolution.canCapture).toBe(false);
    expect(resolution.canReport).toBe(true);
    expect(resolution.error).toBeUndefined();
  });

  it('denies non-editor, non-client roles with an authorization error (Req 6.2)', () => {
    const deniedRoles: UserRole[] = ['supplier', 'quantity_surveyor', 'developer', 'platform_admin'];
    for (const role of deniedRoles) {
      const resolution = resolveFieldToolsAccess(role);
      expect(resolution.access).toBe('denied');
      expect(resolution.canCapture).toBe(false);
      expect(resolution.canReport).toBe(false);
      expect(resolution.error?.code).toBe('unauthorized');
      expect(resolution.error?.role).toBe(role);
      expect(resolution.error?.action).toBe('create');
    }
  });

  it('resolves full access iff the role is an editor role (matrix parity)', () => {
    const sampleRoles: UserRole[] = [
      'site_manager', 'contractor', 'subcontractor', 'architect', 'engineer', 'bep',
      'client', 'supplier', 'quantity_surveyor', 'town_planner', 'developer',
      'firm_admin', 'platform_admin', 'freelancer', 'admin',
    ];
    for (const role of sampleRoles) {
      const isFull = resolveFieldToolsAccess(role).access === 'full';
      expect(isFull).toBe(EDITOR_ROLES.includes(role));
    }
  });
});
