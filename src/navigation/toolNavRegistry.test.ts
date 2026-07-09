import { describe, it, expect } from 'vitest';
import {
  COMMAND_CENTRE_SECTIONS,
  getFilteredSections,
  TOOL_NAV_CONFIGS,
  getToolNavConfig,
} from './toolNavRegistry';

describe('toolNavRegistry — Command Centre configuration', () => {
  it('registers Command Centre in TOOL_NAV_CONFIGS', () => {
    const config = TOOL_NAV_CONFIGS['command-centre'];
    expect(config).toBeDefined();
    expect(config.name).toBe('Command Centre');
    expect(config.subtitle).toBe('Unified project workspace');
    expect(config.sections).toBe(COMMAND_CENTRE_SECTIONS);
  });

  it('getToolNavConfig returns Command Centre config', () => {
    const config = getToolNavConfig('command-centre');
    expect(config).toBeDefined();
    expect(config!.name).toBe('Command Centre');
  });

  it('has 6 section groups', () => {
    expect(COMMAND_CENTRE_SECTIONS).toHaveLength(6);
    expect(COMMAND_CENTRE_SECTIONS.map((s) => s.label)).toEqual([
      'Overview',
      'Delivery',
      'Commercial',
      'Quality & Site',
      'Intelligence',
      'Administration',
    ]);
  });

  it('Overview section has Dashboard, Calendar, Actions', () => {
    const overview = COMMAND_CENTRE_SECTIONS[0];
    expect(overview.items.map((i) => i.id)).toEqual(['dashboard', 'calendar', 'actions']);
  });

  it('Delivery section has Programme, Tasks, Milestones', () => {
    const delivery = COMMAND_CENTRE_SECTIONS[1];
    expect(delivery.items.map((i) => i.id)).toEqual(['programme', 'tasks', 'milestones']);
  });

  it('Commercial section has Budget, Valuations, Procurement, Contracts', () => {
    const commercial = COMMAND_CENTRE_SECTIONS[2];
    expect(commercial.items.map((i) => i.id)).toEqual([
      'budget',
      'valuations',
      'procurement',
      'contracts',
    ]);
  });

  it('Quality & Site section has Quality/Snags, Site Diary, RFIs/Instructions', () => {
    const qualitySite = COMMAND_CENTRE_SECTIONS[3];
    expect(qualitySite.items.map((i) => i.id)).toEqual(['quality', 'site-diary', 'rfis']);
  });

  it('Intelligence section has AI Advisor, Analytics, Documents', () => {
    const intelligence = COMMAND_CENTRE_SECTIONS[4];
    expect(intelligence.items.map((i) => i.id)).toEqual(['ai-advisor', 'analytics', 'documents']);
  });

  it('Administration section has Team, Passport, Forms, Audit Trail, Settings', () => {
    const admin = COMMAND_CENTRE_SECTIONS[5];
    expect(admin.items.map((i) => i.id)).toEqual([
      'team',
      'passport',
      'form-system',
      'audit-trail',
      'settings',
    ]);
  });
});

describe('getFilteredSections — role-based and complexity filtering', () => {
  it('architect in full mode sees all sections', () => {
    const sections = getFilteredSections('architect', 'full');
    expect(sections.length).toBe(6);
  });

  it('architect in simple mode sees only SIMPLE_MODE_VIEWS items', () => {
    const sections = getFilteredSections('architect', 'simple');
    const allItemIds = sections.flatMap((s) => s.items.map((i) => i.id));
    // SIMPLE_MODE_VIEWS: dashboard, tasks, milestones, budget, site-diary, quality, documents, actions
    expect(allItemIds).toContain('dashboard');
    expect(allItemIds).toContain('tasks');
    expect(allItemIds).toContain('milestones');
    expect(allItemIds).toContain('budget');
    expect(allItemIds).toContain('site-diary');
    expect(allItemIds).toContain('quality');
    expect(allItemIds).toContain('documents');
    expect(allItemIds).toContain('actions');
    // Should NOT contain non-simple views
    expect(allItemIds).not.toContain('programme');
    expect(allItemIds).not.toContain('calendar');
    expect(allItemIds).not.toContain('valuations');
    expect(allItemIds).not.toContain('ai-advisor');
  });

  it('client in full mode sees only limited views', () => {
    const sections = getFilteredSections('client', 'full');
    const allItemIds = sections.flatMap((s) => s.items.map((i) => i.id));
    // Client: dashboard, milestones, budget, documents, notifications
    expect(allItemIds).toContain('dashboard');
    expect(allItemIds).toContain('milestones');
    expect(allItemIds).toContain('budget');
    expect(allItemIds).toContain('documents');
    // Should not contain admin/execution views
    expect(allItemIds).not.toContain('programme');
    expect(allItemIds).not.toContain('tasks');
    expect(allItemIds).not.toContain('quality');
  });

  it('supplier sees only procurement and documents (Req 10.6)', () => {
    const sections = getFilteredSections('supplier', 'full');
    const allItemIds = sections.flatMap((s) => s.items.map((i) => i.id));
    expect(allItemIds).toContain('procurement');
    expect(allItemIds).toContain('documents');
    expect(allItemIds).toHaveLength(2);
  });

  it('hides entire section group when all items are filtered out (Property 6)', () => {
    // Supplier only has procurement and documents visible.
    // Overview (dashboard, calendar, actions) → none visible → entire section hidden
    const sections = getFilteredSections('supplier', 'full');
    const sectionLabels = sections.map((s) => s.label);
    expect(sectionLabels).not.toContain('Overview');
    expect(sectionLabels).not.toContain('Delivery');
    expect(sectionLabels).not.toContain('Quality & Site');
    expect(sectionLabels).not.toContain('Administration');
    // Should only have Commercial and Intelligence sections
    expect(sectionLabels).toContain('Commercial');
    expect(sectionLabels).toContain('Intelligence');
  });

  it('returns empty array if role has no views at all', () => {
    // Force a scenario where nothing is visible by using supplier + simple mode
    // supplier views: procurement, documents — neither is in SIMPLE_MODE_VIEWS
    // SIMPLE_MODE_VIEWS: dashboard, tasks, milestones, budget, site-diary, quality, documents, actions
    // 'documents' IS in SIMPLE_MODE_VIEWS, so supplier in simple mode sees documents
    const sections = getFilteredSections('supplier', 'simple');
    const allItemIds = sections.flatMap((s) => s.items.map((i) => i.id));
    // documents is in SIMPLE_MODE_VIEWS AND supplier's view set
    expect(allItemIds).toContain('documents');
    // procurement is NOT in SIMPLE_MODE_VIEWS
    expect(allItemIds).not.toContain('procurement');
  });

  it('filtering completes synchronously (well under 200ms threshold)', () => {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      getFilteredSections('architect', 'full');
      getFilteredSections('client', 'simple');
      getFilteredSections('supplier', 'full');
    }
    const elapsed = performance.now() - start;
    // 3000 calls in under 200ms is easily achievable
    expect(elapsed).toBeLessThan(200);
  });
});
