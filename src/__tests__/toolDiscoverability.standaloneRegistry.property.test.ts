/**
 * Property 4: Standalone tool registry structural completeness
 * Property 5: Standalone tool tile role filtering
 *
 * Validates: Requirements 8.1, 8.3
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { STANDALONE_TOOL_REGISTRY, getToolsForRole } from '@/services/tools/standaloneToolRegistry';
import type { StandaloneToolCategory } from '@/types/standaloneToolTypes';
import type { UserRole } from '@/types';

// ── Constants ────────────────────────────────────────────────────────────────

const VALID_CATEGORIES: StandaloneToolCategory[] = [
  'fee_calculator',
  'compliance',
  'drawing',
  'document_control',
  'briefing',
  'proposal',
  'tendering',
  'estimating',
  'site_management',
  'workforce',
  'plant_equipment',
  'procurement',
  'supplier',
  'payment',
  'closeout',
  'admin_governance',
  'cpd',
  'communication',
  'freelancer',
  'resource_centre',
  'construction_admin',
  'general',
];

const ALL_USER_ROLES: UserRole[] = [
  'client',
  'architect',
  'admin',
  'freelancer',
  'bep',
  'contractor',
  'subcontractor',
  'supplier',
  'engineer',
  'quantity_surveyor',
  'town_planner',
  'energy_professional',
  'fire_engineer',
  'site_manager',
  'developer',
  'firm_admin',
  'platform_admin',
  'land_surveyor',
  'health_safety',
];

const ID_PATTERN = /^[a-z][a-z0-9_]*$/;

// ── Arbitraries ──────────────────────────────────────────────────────────────

const userRoleArb = fc.constantFrom(...ALL_USER_ROLES);
const toolIndexArb = fc.integer({ min: 0, max: STANDALONE_TOOL_REGISTRY.length - 1 });

// ── Property 4: Standalone tool registry structural completeness ─────────────

describe('Feature: tool-discoverability-routing, Property 4: Standalone tool registry structural completeness', () => {
  it('every entry has id ≤64 chars, lowercase with underscores, matching /^[a-z][a-z0-9_]*$/', () => {
    for (const entry of STANDALONE_TOOL_REGISTRY) {
      expect(entry.id.length).toBeLessThanOrEqual(64);
      expect(entry.id).toMatch(ID_PATTERN);
    }
  });

  it('every entry has a unique id across all entries', () => {
    const ids = STANDALONE_TOOL_REGISTRY.map(e => e.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('every entry has a non-empty label ≤80 chars', () => {
    for (const entry of STANDALONE_TOOL_REGISTRY) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.label.length).toBeLessThanOrEqual(80);
    }
  });

  it('every entry has a valid StandaloneToolCategory value', () => {
    for (const entry of STANDALONE_TOOL_REGISTRY) {
      expect(VALID_CATEGORIES).toContain(entry.category);
    }
  });

  it('every entry has a non-empty description ≤160 chars', () => {
    for (const entry of STANDALONE_TOOL_REGISTRY) {
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeLessThanOrEqual(160);
    }
  });

  it('every entry has a non-empty roles array of valid UserRole values', () => {
    for (const entry of STANDALONE_TOOL_REGISTRY) {
      expect(entry.roles.length).toBeGreaterThan(0);
      for (const role of entry.roles) {
        expect(ALL_USER_ROLES).toContain(role);
      }
    }
  });

  it('every entry has a non-empty icon string', () => {
    for (const entry of STANDALONE_TOOL_REGISTRY) {
      expect(entry.icon.length).toBeGreaterThan(0);
    }
  });

  it('every entry has a non-empty route string', () => {
    for (const entry of STANDALONE_TOOL_REGISTRY) {
      expect(entry.route.length).toBeGreaterThan(0);
    }
  });

  it('every entry has a tags array with 3–12 entries', () => {
    for (const entry of STANDALONE_TOOL_REGISTRY) {
      expect(entry.tags.length).toBeGreaterThanOrEqual(3);
      expect(entry.tags.length).toBeLessThanOrEqual(12);
    }
  });
});

// ── Property 5: Standalone tool tile role filtering ──────────────────────────

describe('Feature: tool-discoverability-routing, Property 5: Standalone tool tile role filtering', () => {
  it('for any tool and any role NOT in that tool\'s roles array, getToolsForRole(role) SHALL NOT include that tool', () => {
    fc.assert(
      fc.property(toolIndexArb, userRoleArb, (toolIdx, role) => {
        const tool = STANDALONE_TOOL_REGISTRY[toolIdx];
        if (!tool.roles.includes(role)) {
          const visibleTools = getToolsForRole(role);
          const found = visibleTools.find(t => t.id === tool.id);
          expect(found).toBeUndefined();
        }
      }),
      { numRuns: 100 },
    );
  });

  it('for any tool and any role IN that tool\'s roles array, getToolsForRole(role) SHALL include that tool', () => {
    fc.assert(
      fc.property(toolIndexArb, userRoleArb, (toolIdx, role) => {
        const tool = STANDALONE_TOOL_REGISTRY[toolIdx];
        if (tool.roles.includes(role)) {
          const visibleTools = getToolsForRole(role);
          const found = visibleTools.find(t => t.id === tool.id);
          expect(found).toBeDefined();
        }
      }),
      { numRuns: 100 },
    );
  });
});
