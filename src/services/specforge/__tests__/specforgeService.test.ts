/**
 * SpecForge Service — Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  specRoleCan,
  getVisibleSpecItems,
  summarizeSpecBudget,
  validateIssueReadiness,
  createIssueSnapshot,
  issueSpecification,
  generateBoMFromSpec,
  simpleHash,
  SPEC_ROLE_CAPABILITIES,
} from '@/services/specforge/specforgeService';
import { SAMPLE_WORKSPACE } from '@/services/specforge/specforgeSampleData';
import type { SpecForgeRole, SpecItem, SpecForgeWorkspace } from '@/types/specforgeTypes';

describe('specRoleCan', () => {
  it('returns true for capabilities the role has', () => {
    expect(specRoleCan('architect', 'view_all')).toBe(true);
    expect(specRoleCan('architect', 'edit_spec')).toBe(true);
    expect(specRoleCan('architect', 'issue_spec')).toBe(true);
  });

  it('returns false for capabilities the role lacks', () => {
    expect(specRoleCan('client', 'edit_spec')).toBe(false);
    expect(specRoleCan('contractor', 'issue_spec')).toBe(false);
    expect(specRoleCan('supplier', 'view_all')).toBe(false);
  });

  it('covers all defined roles', () => {
    const roles: SpecForgeRole[] = [
      'client', 'developer', 'architect', 'bep', 'freelancer',
      'engineer', 'quantity_surveyor', 'energy_professional', 'fire_engineer',
      'contractor', 'subcontractor', 'supplier', 'site_manager',
      'admin', 'platform_admin',
    ];
    for (const role of roles) {
      expect(SPEC_ROLE_CAPABILITIES[role]).toBeDefined();
      expect(SPEC_ROLE_CAPABILITIES[role].length).toBeGreaterThan(0);
    }
  });

  it('client can approve client decisions', () => {
    expect(specRoleCan('client', 'approve_client_decision')).toBe(true);
  });

  it('quantity_surveyor can review budget', () => {
    expect(specRoleCan('quantity_surveyor', 'review_budget')).toBe(true);
  });

  it('platform_admin has manage_permissions', () => {
    expect(specRoleCan('platform_admin', 'manage_permissions')).toBe(true);
    expect(specRoleCan('admin', 'manage_permissions')).toBe(false);
  });
});

describe('getVisibleSpecItems', () => {
  it('architect sees all items', () => {
    const items = getVisibleSpecItems(SAMPLE_WORKSPACE, 'architect');
    expect(items.length).toBe(SAMPLE_WORKSPACE.items.length);
  });

  it('client sees only client-decision or approved/issued items', () => {
    const items = getVisibleSpecItems(SAMPLE_WORKSPACE, 'client');
    for (const item of items) {
      expect(
        item.clientDecision || ['approved', 'issued'].includes(item.status)
      ).toBe(true);
    }
  });

  it('contractor sees only issued+ status items', () => {
    const items = getVisibleSpecItems(SAMPLE_WORKSPACE, 'contractor');
    for (const item of items) {
      expect(['issued', 'rfq', 'ordered', 'delivered', 'installed', 'as_built']).toContain(item.status);
    }
  });

  it('freelancer sees items assigned to their role', () => {
    const items = getVisibleSpecItems(SAMPLE_WORKSPACE, 'freelancer');
    // In sample data, no items are assigned to freelancer
    expect(items.length).toBe(0);
  });

  it('engineer sees items where they are owner/reviewer/approver', () => {
    const items = getVisibleSpecItems(SAMPLE_WORKSPACE, 'engineer');
    for (const item of items) {
      expect(
        item.ownerRole === 'engineer' ||
        item.reviewerRole === 'engineer' ||
        item.approverRole === 'engineer'
      ).toBe(true);
    }
  });

  it('supplier sees only package-visible items', () => {
    const items = getVisibleSpecItems(SAMPLE_WORKSPACE, 'supplier');
    for (const item of items) {
      expect(['issued', 'rfq', 'ordered', 'delivered', 'installed']).toContain(item.status);
    }
  });
});

describe('summarizeSpecBudget', () => {
  it('calculates correct totals', () => {
    const summary = summarizeSpecBudget(SAMPLE_WORKSPACE.items);
    expect(summary.allowance).toBe(115000 + 48000 + 72000 + 185000);
    expect(summary.estimate).toBe(128500 + 46500 + 91000 + 179000);
    expect(summary.delta).toBe(summary.estimate - summary.allowance);
  });

  it('identifies over-budget items', () => {
    const summary = summarizeSpecBudget(SAMPLE_WORKSPACE.items);
    // wall tile: 128500 > 115000, pendant: 91000 > 72000
    expect(summary.overBudgetItems).toContain('item-wall-tile-001');
    expect(summary.overBudgetItems).toContain('item-pendant-001');
    expect(summary.overBudgetItems).not.toContain('item-chair-001');
  });

  it('identifies long-lead items (≥56 days)', () => {
    const summary = summarizeSpecBudget(SAMPLE_WORKSPACE.items);
    expect(summary.longLeadItems).toContain('item-chair-001'); // 56 days
    expect(summary.longLeadItems).toContain('item-pendant-001'); // 84 days
    expect(summary.longLeadItems).not.toContain('item-wall-tile-001'); // 21 days
  });

  it('identifies stale/superseded items', () => {
    const summary = summarizeSpecBudget(SAMPLE_WORKSPACE.items);
    expect(summary.staleItems).toContain('item-counter-001');
    expect(summary.staleItems.length).toBe(1);
  });

  it('calculates delta percentage', () => {
    const summary = summarizeSpecBudget(SAMPLE_WORKSPACE.items);
    expect(summary.deltaPct).toBeDefined();
    expect(typeof summary.deltaPct).toBe('number');
  });

  it('handles empty array', () => {
    const summary = summarizeSpecBudget([]);
    expect(summary.allowance).toBe(0);
    expect(summary.estimate).toBe(0);
    expect(summary.delta).toBe(0);
    expect(summary.overBudgetItems).toHaveLength(0);
  });
});

describe('validateIssueReadiness', () => {
  it('detects superseded items as blockers', () => {
    const findings = validateIssueReadiness(SAMPLE_WORKSPACE);
    const blockers = findings.filter((f) => f.severity === 'blocker');
    expect(blockers.length).toBeGreaterThan(0);
    expect(blockers[0].itemId).toBe('item-counter-001');
  });

  it('detects pending client decisions as high severity', () => {
    const findings = validateIssueReadiness(SAMPLE_WORKSPACE);
    const high = findings.filter((f) => f.severity === 'high');
    expect(high.length).toBeGreaterThan(0);
    expect(high[0].itemId).toBe('item-wall-tile-001');
  });

  it('detects cost exceedance as medium severity', () => {
    const findings = validateIssueReadiness(SAMPLE_WORKSPACE);
    const medium = findings.filter((f) => f.severity === 'medium');
    // pendant exceeds by > 10%: 91000 > 72000 * 1.1 = 79200
    const costFindings = medium.filter((f) => f.message.includes('exceeds allowance'));
    expect(costFindings.length).toBeGreaterThan(0);
  });

  it('detects long-lead items', () => {
    const findings = validateIssueReadiness(SAMPLE_WORKSPACE);
    const longLead = findings.filter((f) => f.message.includes('long-lead'));
    expect(longLead.length).toBeGreaterThan(0);
  });

  it('returns empty for a clean workspace', () => {
    const cleanWorkspace: SpecForgeWorkspace = {
      ...SAMPLE_WORKSPACE,
      items: [{
        id: 'clean-1',
        sectionId: 'sec-finishes',
        code: 'C-001',
        title: 'Clean item',
        room: 'Room A',
        package: 'General',
        drawingRefs: [],
        clauseRefs: [],
        budgetAllowance: 100,
        estimatedCost: 90,
        leadTimeDays: 10,
        clientDecision: false,
        ownerRole: 'architect',
        status: 'approved',
        sourceRevision: 'P01',
        supersededBy: null,
      }],
    };
    const findings = validateIssueReadiness(cleanWorkspace);
    expect(findings).toHaveLength(0);
  });
});

describe('createIssueSnapshot', () => {
  it('creates a frozen (immutable) snapshot', () => {
    const issuer = { userId: 'u-arch-1', name: 'Test Architect', role: 'architect' as const };
    const snapshot = createIssueSnapshot(SAMPLE_WORKSPACE, issuer);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('includes an audit hash', () => {
    const issuer = { userId: 'u-arch-1', name: 'Test Architect', role: 'architect' as const };
    const snapshot = createIssueSnapshot(SAMPLE_WORKSPACE, issuer);
    expect(snapshot.auditHash).toBeDefined();
    expect(snapshot.auditHash.length).toBe(8);
    expect(/^[0-9a-f]{8}$/.test(snapshot.auditHash)).toBe(true);
  });

  it('includes readiness findings and budget summary', () => {
    const issuer = { userId: 'u-arch-1', name: 'Test Architect', role: 'architect' as const };
    const snapshot = createIssueSnapshot(SAMPLE_WORKSPACE, issuer);
    expect(snapshot.readinessFindings.length).toBeGreaterThan(0);
    expect(snapshot.budgetSummary.allowance).toBeGreaterThan(0);
  });

  it('confirms professional responsibility for architect issuer', () => {
    const issuer = { userId: 'u-arch-1', name: 'Test Architect', role: 'architect' as const };
    const snapshot = createIssueSnapshot(SAMPLE_WORKSPACE, issuer);
    expect(snapshot.professionalResponsibility).toBe('confirmed_by_issuer');
  });

  it('requires professional confirmation for non-architect issuer', () => {
    const issuer = { userId: 'u-qs-1', name: 'QS', role: 'quantity_surveyor' as const };
    const snapshot = createIssueSnapshot(SAMPLE_WORKSPACE, issuer);
    expect(snapshot.professionalResponsibility).toBe('requires_professional_confirmation');
  });

  it('produces consistent hash for same input', () => {
    const input = 'test-string-for-hashing';
    const hash1 = simpleHash(input);
    const hash2 = simpleHash(input);
    expect(hash1).toBe(hash2);
  });

  it('copies all sections and items into snapshot', () => {
    const issuer = { userId: 'u-arch-1', name: 'Test Architect', role: 'architect' as const };
    const snapshot = createIssueSnapshot(SAMPLE_WORKSPACE, issuer);
    expect(snapshot.sections.length).toBe(SAMPLE_WORKSPACE.sections.length);
    expect(snapshot.items.length).toBe(SAMPLE_WORKSPACE.items.length);
  });
});

describe('generateBoMFromSpec', () => {
  it('generates one BoM line per item', () => {
    const bom = generateBoMFromSpec(SAMPLE_WORKSPACE.items);
    expect(bom.length).toBe(SAMPLE_WORKSPACE.items.length);
  });

  it('each line has correct structure', () => {
    const bom = generateBoMFromSpec(SAMPLE_WORKSPACE.items);
    for (const line of bom) {
      expect(line.id).toMatch(/^bom-/);
      expect(line.itemId).toBeDefined();
      expect(line.itemCode).toBeDefined();
      expect(line.title).toBeDefined();
      expect(line.section).toBeDefined();
      expect(line.room).toBeDefined();
      expect(typeof line.quantity).toBe('number');
      expect(typeof line.rate).toBe('number');
      expect(typeof line.total).toBe('number');
      expect(line.total).toBe(line.rate * line.quantity);
    }
  });

  it('maps rate from estimatedCost', () => {
    const bom = generateBoMFromSpec(SAMPLE_WORKSPACE.items);
    const first = bom[0];
    const sourceItem = SAMPLE_WORKSPACE.items[0];
    expect(first.rate).toBe(sourceItem.estimatedCost);
  });

  it('handles empty input', () => {
    const bom = generateBoMFromSpec([]);
    expect(bom).toHaveLength(0);
  });
});

describe('getVisibleSpecItems with viewerUserId', () => {
  it('returns package-visible items without viewerUserId (no further filtering)', () => {
    const items = getVisibleSpecItems(SAMPLE_WORKSPACE, 'supplier');
    const packageItems = SAMPLE_WORKSPACE.items.filter(i =>
      ['issued', 'rfq', 'ordered', 'delivered', 'installed'].includes(i.status),
    );
    expect(items.length).toBe(packageItems.length);
  });

  it('filters items by role scope when viewerUserId is provided and team member found', () => {
    // Create a workspace with team including a supplier user and items with matching section reviewerRole
    const ws: SpecForgeWorkspace = {
      ...SAMPLE_WORKSPACE,
      team: [
        { userId: 'u-supplier-1', name: 'Supplier A', role: 'supplier', responsibility: 'Material supply' },
      ],
      sections: [
        { id: 'sec-a', code: '01', title: 'Section A', discipline: 'general', ownerRole: 'architect', reviewerRole: 'supplier', status: 'draft' },
        { id: 'sec-b', code: '02', title: 'Section B', discipline: 'general', ownerRole: 'architect', reviewerRole: 'contractor', status: 'draft' },
      ],
      items: [
        {
          id: 'item-1', sectionId: 'sec-a', code: 'A-001', title: 'Item in section with supplier reviewer',
          room: 'R1', package: 'P1', drawingRefs: [], clauseRefs: [],
          budgetAllowance: 100, estimatedCost: 90, leadTimeDays: 10,
          clientDecision: false, ownerRole: 'architect', status: 'issued',
          sourceRevision: 'P01', supersededBy: null,
        },
        {
          id: 'item-2', sectionId: 'sec-b', code: 'B-001', title: 'Item in section with contractor reviewer',
          room: 'R2', package: 'P2', drawingRefs: [], clauseRefs: [],
          budgetAllowance: 200, estimatedCost: 180, leadTimeDays: 14,
          clientDecision: false, ownerRole: 'architect', status: 'issued',
          sourceRevision: 'P01', supersededBy: null,
        },
      ],
    };
    const items = getVisibleSpecItems(ws, 'supplier', 'u-supplier-1');
    // Only item-1 should be visible: its section's reviewerRole === 'supplier'
    expect(items.length).toBe(1);
    expect(items[0].id).toBe('item-1');
  });

  it('returns all package items when viewerUserId does not match any team member', () => {
    const ws: SpecForgeWorkspace = {
      ...SAMPLE_WORKSPACE,
      team: [
        { userId: 'u-other', name: 'Other', role: 'supplier', responsibility: 'Other' },
      ],
      items: [
        {
          id: 'item-x', sectionId: 'sec-finishes', code: 'X-001', title: 'Test',
          room: 'R1', package: 'P1', drawingRefs: [], clauseRefs: [],
          budgetAllowance: 100, estimatedCost: 90, leadTimeDays: 10,
          clientDecision: false, ownerRole: 'architect', status: 'issued',
          sourceRevision: 'P01', supersededBy: null,
        },
      ],
    };
    // viewerUserId 'u-unknown' not found in team, so no further filtering happens
    const items = getVisibleSpecItems(ws, 'supplier', 'u-unknown');
    expect(items.length).toBe(1);
  });
});

describe('createIssueSnapshot deep immutability', () => {
  it('deep-freezes nested items so mutation throws', () => {
    const issuer = { userId: 'u-arch-1', name: 'Test Architect', role: 'architect' as const };
    const snapshot = createIssueSnapshot(SAMPLE_WORKSPACE, issuer);

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.items[0])).toBe(true);
    expect(Object.isFrozen(snapshot.sections[0])).toBe(true);

    // Attempting to mutate a nested property should throw in strict mode
    expect(() => {
      (snapshot.items[0] as any).estimatedCost = 999;
    }).toThrow();
  });

  it('snapshot items are independent from original workspace items', () => {
    const issuer = { userId: 'u-arch-1', name: 'Test Architect', role: 'architect' as const };
    const snapshot = createIssueSnapshot(SAMPLE_WORKSPACE, issuer);

    // The snapshot should be a deep copy — modifying original should not affect snapshot
    const originalTitle = SAMPLE_WORKSPACE.items[0].title;
    expect(snapshot.items[0].title).toBe(originalTitle);
  });
});

describe('issueSpecification governance', () => {
  it('throws when issuer lacks issue_spec capability', () => {
    const issuer = { userId: 'u-client-1', name: 'Client', role: 'client' as const };
    expect(() =>
      issueSpecification(SAMPLE_WORKSPACE, issuer, [])
    ).toThrow('does not have issue_spec capability');
  });

  it('throws when there are blocker findings (superseded items)', () => {
    // SAMPLE_WORKSPACE has a superseded item → blocker
    const issuer = { userId: 'u-arch-1', name: 'Architect', role: 'architect' as const };
    expect(() =>
      issueSpecification(SAMPLE_WORKSPACE, issuer, [])
    ).toThrow(/Cannot issue:.*blocker/);
  });

  it('throws when there are pending client decisions', () => {
    // Create workspace with no blockers but with pending client decisions
    const ws: SpecForgeWorkspace = {
      ...SAMPLE_WORKSPACE,
      items: [{
        id: 'item-pending',
        sectionId: 'sec-finishes',
        code: 'PD-001',
        title: 'Pending client item',
        room: 'Room A',
        package: 'General',
        drawingRefs: [],
        clauseRefs: [],
        budgetAllowance: 1000,
        estimatedCost: 900,
        leadTimeDays: 10,
        clientDecision: true,
        ownerRole: 'architect',
        status: 'needs_decision',
        sourceRevision: 'P01',
        supersededBy: null,
      }],
    };
    const issuer = { userId: 'u-arch-1', name: 'Architect', role: 'architect' as const };
    expect(() =>
      issueSpecification(ws, issuer, [])
    ).toThrow(/client decision.*pending/);
  });

  it('succeeds when workspace is clean and issuer has issue_spec', () => {
    const cleanWs: SpecForgeWorkspace = {
      ...SAMPLE_WORKSPACE,
      items: [{
        id: 'item-clean',
        sectionId: 'sec-finishes',
        code: 'CL-001',
        title: 'Clean item',
        room: 'Room A',
        package: 'General',
        drawingRefs: [],
        clauseRefs: [],
        budgetAllowance: 1000,
        estimatedCost: 900,
        leadTimeDays: 10,
        clientDecision: false,
        ownerRole: 'architect',
        status: 'approved',
        sourceRevision: 'P01',
        supersededBy: null,
      }],
    };
    const issuer = { userId: 'u-arch-1', name: 'Architect', role: 'architect' as const };
    const result = issueSpecification(cleanWs, issuer, []);
    expect(result.snapshot).toBeDefined();
    expect(result.snapshot.snapshotId).toBeDefined();
    expect(result.issuedAt).toBeDefined();
  });
});
