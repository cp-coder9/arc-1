/**
 * SpecForge Service — Business logic for the SpecForge Specification Engine.
 *
 * Pure functions for role-based access, budget analysis, readiness validation,
 * issue snapshots, library search, BoM generation, and procurement pipeline.
 */

import type {
  SpecForgeRole,
  SpecForgeWorkspace,
  SpecItem,
  SpecBudgetSummary,
  SpecReadinessFinding,
  SpecIssueSnapshot,
  SpecIssuer,
  SpecIssueRecipient,
  SpecLibraryItem,
  SpecLibraryScope,
  SpecBoMLineItem,
  SpecCapability,
  SpecProcurementEntry,
} from '@/types/specforgeTypes';

// ── Role Capabilities ───────────────────────────────────────────────────────

export const SPEC_ROLE_CAPABILITIES: Record<SpecForgeRole, SpecCapability[]> = {
  client: ['view_client_items', 'comment', 'approve_client_decision'],
  developer: ['view_client_items', 'comment', 'approve_client_decision', 'view_budget_summary'],
  architect: ['view_all', 'edit_spec', 'issue_spec', 'approve_substitution', 'confirm_responsibility', 'assign_roles'],
  bep: ['view_all', 'edit_spec', 'issue_spec', 'approve_substitution', 'confirm_responsibility', 'assign_roles'],
  freelancer: ['view_assigned', 'edit_assigned_draft', 'submit_for_review'],
  engineer: ['view_assigned', 'edit_assigned_draft', 'confirm_responsibility', 'approve_technical_section'],
  quantity_surveyor: ['view_all', 'review_budget', 'flag_cost_delta', 'export_cost_schedule'],
  energy_professional: ['view_assigned', 'edit_assigned_draft', 'confirm_responsibility', 'approve_technical_section'],
  fire_engineer: ['view_assigned', 'edit_assigned_draft', 'confirm_responsibility', 'approve_technical_section'],
  contractor: ['view_issued', 'request_clarification', 'request_substitution', 'price_package', 'update_procurement_status'],
  subcontractor: ['view_package', 'submit_shop_drawing', 'request_substitution', 'update_installed_status'],
  supplier: ['view_package', 'quote_item', 'confirm_lead_time', 'upload_warranty', 'suggest_alternative'],
  site_manager: ['view_issued', 'update_installed_status', 'upload_site_evidence', 'flag_site_conflict'],
  admin: ['view_all', 'edit_templates', 'govern_library', 'override_with_audit'],
  platform_admin: ['view_all', 'edit_templates', 'govern_library', 'override_with_audit', 'manage_permissions'],
};

/**
 * Check whether a SpecForge role has a specific capability.
 */
export function specRoleCan(role: SpecForgeRole, capability: SpecCapability): boolean {
  return SPEC_ROLE_CAPABILITIES[role]?.includes(capability) ?? false;
}

// ── Visibility ──────────────────────────────────────────────────────────────

/**
 * Return the spec items visible to a given role.
 */
export function getVisibleSpecItems(workspace: SpecForgeWorkspace, role: SpecForgeRole, viewerUserId?: string): SpecItem[] {
  if (specRoleCan(role, 'view_all')) return workspace.items;
  if (specRoleCan(role, 'view_client_items')) {
    return workspace.items.filter(
      (item) => item.clientDecision || ['approved', 'issued'].includes(item.status),
    );
  }
  if (specRoleCan(role, 'view_issued')) {
    return workspace.items.filter((item) =>
      ['issued', 'rfq', 'ordered', 'delivered', 'installed', 'as_built'].includes(item.status),
    );
  }
  if (specRoleCan(role, 'view_assigned')) {
    return workspace.items.filter((item) =>
      [item.ownerRole, item.reviewerRole, item.approverRole].includes(role),
    );
  }
  if (specRoleCan(role, 'view_package')) {
    const statusVisible = ['issued', 'rfq', 'ordered', 'delivered', 'installed'];
    const visibleByStatus = workspace.items.filter((item) => statusVisible.includes(item.status));
    const viewerTeamMember = viewerUserId
      ? workspace.team.find((member) => member.userId === viewerUserId)
      : undefined;

    if (viewerUserId && !viewerTeamMember) {
      return visibleByStatus;
    }

    // Package-scoped: only items in the issued pipeline AND scoped to
    // sections/items where the viewer's role is assigned as reviewer or approver.
    return visibleByStatus.filter((item) =>
      item.reviewerRole === role ||
      item.approverRole === role ||
      workspace.sections.find(s => s.id === item.sectionId)?.reviewerRole === role
    );
  }
  return [];
}

// ── Budget ──────────────────────────────────────────────────────────────────

/**
 * Summarize the budget for a set of spec items.
 */
export function summarizeSpecBudget(items: SpecItem[]): SpecBudgetSummary {
  const allowance = items.reduce((sum, item) => sum + item.budgetAllowance, 0);
  const estimate = items.reduce((sum, item) => sum + item.estimatedCost, 0);
  const delta = estimate - allowance;
  const deltaPct = allowance ? Math.round((delta / allowance) * 1000) / 10 : 0;

  return {
    allowance,
    estimate,
    delta,
    deltaPct,
    overBudgetItems: items.filter((item) => item.estimatedCost > item.budgetAllowance).map((item) => item.id),
    longLeadItems: items.filter((item) => item.leadTimeDays >= 56).map((item) => item.id),
    staleItems: items.filter((item) => item.supersededBy).map((item) => item.id),
  };
}

// ── Issue Readiness ─────────────────────────────────────────────────────────

/**
 * Validate workspace readiness for issue — returns findings sorted by severity.
 */
export function validateIssueReadiness(workspace: SpecForgeWorkspace): SpecReadinessFinding[] {
  const findings: SpecReadinessFinding[] = [];

  for (const item of workspace.items) {
    if (item.supersededBy) {
      findings.push({
        severity: 'blocker',
        itemId: item.id,
        message: `${item.code} is superseded by ${item.supersededBy}`,
      });
    }
    if (item.clientDecision && !['approved', 'issued', 'ordered', 'delivered', 'installed', 'as_built'].includes(item.status)) {
      findings.push({
        severity: 'high',
        itemId: item.id,
        message: `${item.code} needs client decision before issue`,
      });
    }
    if (item.estimatedCost > item.budgetAllowance * 1.1) {
      findings.push({
        severity: 'medium',
        itemId: item.id,
        message: `${item.code} exceeds allowance by more than 10%`,
      });
    }
    if (item.leadTimeDays >= 56) {
      findings.push({
        severity: 'medium',
        itemId: item.id,
        message: `${item.code} is a long-lead item (${item.leadTimeDays} days)`,
      });
    }
  }

  return findings;
}

// ── Issue Snapshot ──────────────────────────────────────────────────────────

/**
 * Recursively deep-freeze an object and all nested objects.
 */
function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const value of Object.values(obj as Record<string, unknown>)) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}

/**
 * FNV-1a-inspired hash for audit purposes.
 */
export function simpleHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Create an immutable issue snapshot from the current workspace state.
 */
export function createIssueSnapshot(workspace: SpecForgeWorkspace, issuer: SpecIssuer): SpecIssueSnapshot {
  const now = new Date().toISOString();
  const snapshot: Omit<SpecIssueSnapshot, 'auditHash'> & { auditHash?: string } = {
    snapshotId: `spec-issue-${workspace.id}-${workspace.revision}-${Date.now()}`,
    projectId: workspace.projectId,
    workspaceId: workspace.id,
    revision: workspace.revision,
    issuedAt: now,
    issuer,
    professionalResponsibility:
      issuer.role === 'architect' || issuer.role === 'bep'
        ? 'confirmed_by_issuer'
        : 'requires_professional_confirmation',
    projectName: workspace.projectName,
    issueStatus: 'issued_snapshot',
    sections: structuredClone(workspace.sections),
    items: structuredClone(workspace.items),
    readinessFindings: validateIssueReadiness(workspace),
    budgetSummary: summarizeSpecBudget(workspace.items),
  };

  snapshot.auditHash = simpleHash(JSON.stringify(snapshot));

  return deepFreeze(snapshot) as SpecIssueSnapshot;
}

/**
 * Issue a specification — creates a snapshot and returns it along with
 * a list of recipients. In production this would also trigger workflow events.
 */
export function issueSpecification(
  workspace: SpecForgeWorkspace,
  issuer: SpecIssuer,
  recipients: SpecIssueRecipient[],
): { snapshot: SpecIssueSnapshot; recipients: SpecIssueRecipient[]; issuedAt: string } {
  // Enforce issue governance
  if (!specRoleCan(issuer.role, 'issue_spec')) {
    throw new Error(`Role "${issuer.role}" does not have issue_spec capability`);
  }

  const findings = validateIssueReadiness(workspace);
  const blockers = findings.filter(f => f.severity === 'blocker');

  if (blockers.length > 0) {
    throw new Error(`Cannot issue: ${blockers.length} blocker(s) — ${blockers[0].message}`);
  }

  // High-severity findings (pending client decisions, over-budget) also block issue
  const pendingClientDecisions = workspace.items.filter(
    i => i.clientDecision && !['approved', 'issued', 'ordered', 'delivered', 'installed', 'as_built'].includes(i.status)
  );
  if (pendingClientDecisions.length > 0) {
    throw new Error(`Cannot issue: ${pendingClientDecisions.length} client decision(s) pending approval`);
  }

  // Over-budget items exceeding 10% also block issue until QS review
  const materialOverBudget = workspace.items.filter(
    i => i.estimatedCost > i.budgetAllowance * 1.1
  );
  if (materialOverBudget.length > 0) {
    throw new Error(
      `Cannot issue: ${materialOverBudget.length} item(s) exceed budget allowance by >10% — QS review required`
    );
  }

  const snapshot = createIssueSnapshot(workspace, issuer);
  return { snapshot, recipients, issuedAt: snapshot.issuedAt };
}

// ── Library Search ──────────────────────────────────────────────────────────

/**
 * Mock library data for demo/dev mode. In production, this would be a Firestore query.
 */
const MOCK_LIBRARY: SpecLibraryItem[] = [
  {
    id: 'lib-porcelain-600x1200',
    title: 'Large Format Porcelain Wall Tile 600x1200',
    category: 'Finishes',
    scope: 'platform',
    typicalSupplier: 'Various tile suppliers',
    typicalCostRange: { min: 850, max: 1450 },
    leadTimeRange: { min: 14, max: 28 },
    commonFinishes: ['Matte limestone', 'Polished marble', 'Textured concrete'],
    sustainabilityNotes: 'Low VOC adhesive recommended',
    clauseRefs: ['SANS/NBR finish subject to professional verification'],
    tags: ['tile', 'porcelain', 'wall', 'lobby', 'commercial'],
    usageCount: 47,
    lastUsedAt: '2026-05-20',
  },
  {
    id: 'lib-contract-lounge-chair',
    title: 'Contract Lounge Chair — Fabric/Timber',
    category: 'FF&E',
    scope: 'practice',
    typicalSupplier: 'Furniture vendors',
    typicalCostRange: { min: 12000, max: 55000 },
    leadTimeRange: { min: 42, max: 70 },
    commonFinishes: ['Fabric upholstery', 'Leather', 'Oak legs', 'Walnut legs'],
    sustainabilityNotes: 'FSC timber preference',
    tags: ['chair', 'lounge', 'reception', 'FF&E'],
    usageCount: 23,
    lastUsedAt: '2026-04-15',
  },
  {
    id: 'lib-linear-pendant',
    title: 'Bespoke Linear Pendant — Brushed Brass',
    category: 'Electrical / Lighting',
    scope: 'personal',
    typicalSupplier: 'Lighting specialists',
    typicalCostRange: { min: 45000, max: 120000 },
    leadTimeRange: { min: 56, max: 98 },
    commonFinishes: ['Brushed brass', 'Black powder-coat', 'Aged bronze'],
    sustainabilityNotes: 'LED driver replaceable; warm dim preferred',
    tags: ['pendant', 'lighting', 'feature', 'bespoke', 'reception'],
    usageCount: 8,
    lastUsedAt: '2026-03-10',
  },
  {
    id: 'lib-solid-surface-counter',
    title: 'Custom Reception Counter — Oak Veneer / Solid Surface',
    category: 'Joinery',
    scope: 'practice',
    typicalSupplier: 'Joinery subcontractors',
    typicalCostRange: { min: 120000, max: 250000 },
    leadTimeRange: { min: 35, max: 56 },
    commonFinishes: ['Oak veneer', 'Walnut veneer', 'Corian top', 'Granite top'],
    sustainabilityNotes: 'Low-formaldehyde board',
    clauseRefs: ['Shop drawings required before manufacture'],
    tags: ['counter', 'reception', 'joinery', 'custom', 'desk'],
    usageCount: 15,
    lastUsedAt: '2026-05-01',
  },
  {
    id: 'lib-vinyl-plank',
    title: 'Luxury Vinyl Plank — Commercial Grade',
    category: 'Finishes',
    scope: 'platform',
    typicalSupplier: 'Flooring distributors',
    typicalCostRange: { min: 350, max: 900 },
    leadTimeRange: { min: 7, max: 21 },
    commonFinishes: ['Light oak', 'Grey wash', 'Walnut', 'Concrete look'],
    sustainabilityNotes: 'Phthalate-free options preferred',
    tags: ['vinyl', 'flooring', 'LVT', 'commercial'],
    usageCount: 62,
    lastUsedAt: '2026-06-01',
  },
];

/**
 * Search the spec library by text query and optional scope filter.
 * In production this would query Firestore with full-text search.
 */
export function searchSpecLibrary(query: string, scope?: SpecLibraryScope): SpecLibraryItem[] {
  const lowerQuery = query.toLowerCase();
  return MOCK_LIBRARY.filter((item) => {
    if (scope && item.scope !== scope) return false;
    const searchable = [item.title, item.category, ...(item.tags ?? []), item.typicalSupplier ?? '']
      .join(' ')
      .toLowerCase();
    return searchable.includes(lowerQuery);
  });
}

// ── BoM Generation ──────────────────────────────────────────────────────────

/**
 * Generate Bill of Materials line items from spec items.
 * Quantities default to 1 unless parsed from dimensions/notes.
 */
export function generateBoMFromSpec(items: SpecItem[]): SpecBoMLineItem[] {
  return items.map((item) => ({
    id: `bom-${item.id}`,
    itemId: item.id,
    itemCode: item.code,
    title: item.title,
    section: item.sectionId,
    room: item.room,
    supplier: item.supplier,
    unit: 'ea',
    quantity: 1,
    rate: item.estimatedCost,
    total: item.estimatedCost,
    leadTimeDays: item.leadTimeDays,
    status: item.status,
  }));
}

// ── Procurement Pipeline Helpers ────────────────────────────────────────────

const PROCUREMENT_STATUS_ORDER: SpecProcurementEntry['status'][] = [
  'not_started', 'rfq_sent', 'quoted', 'ordered', 'dispatched', 'delivered', 'installed', 'closed',
];

/**
 * Advance a procurement entry to the next status.
 */
export function advanceProcurementStatus(entry: SpecProcurementEntry): SpecProcurementEntry {
  const currentIdx = PROCUREMENT_STATUS_ORDER.indexOf(entry.status);
  if (currentIdx < 0 || currentIdx >= PROCUREMENT_STATUS_ORDER.length - 1) return entry;
  return { ...entry, status: PROCUREMENT_STATUS_ORDER[currentIdx + 1] };
}

/**
 * Create initial procurement entries from issued spec items.
 */
export function createProcurementEntries(items: SpecItem[]): SpecProcurementEntry[] {
  return items
    .filter((item) => ['issued', 'rfq', 'ordered', 'delivered', 'installed'].includes(item.status))
    .map((item) => ({
      id: `proc-${item.id}`,
      itemId: item.id,
      itemCode: item.code,
      itemTitle: item.title,
      supplier: item.supplier,
      status: statusToProc(item.status),
    }));
}

function statusToProc(itemStatus: SpecItem['status']): SpecProcurementEntry['status'] {
  switch (itemStatus) {
    case 'issued': return 'not_started';
    case 'rfq': return 'rfq_sent';
    case 'ordered': return 'ordered';
    case 'delivered': return 'delivered';
    case 'installed': return 'installed';
    default: return 'not_started';
  }
}
