/**
 * OpenProject Specification Bridge — Maps SpecForge workspace data to
 * OpenProject API v3 work-package payloads for planning mirror sync.
 *
 * Source of truth: Architex SpecForge.
 * Mirror target: OpenProject (read-only planning mirror).
 * Key: `architexSpecSectionId` for upsert operations.
 *
 * OpenProject must NEVER overwrite issued specification snapshots.
 */

import type { SpecForgeWorkspace, SpecSection, SpecItem } from '@/types/specforgeTypes';

// ── OpenProject Types ───────────────────────────────────────────────────────

export interface OpenProjectWorkPackage {
  subject: string;
  description: {
    format: 'markdown';
    raw: string;
  };
  _links: {
    project: { href: string };
    type: { href: string; title: string };
    status: { href: string };
    priority: { href: string };
  };
  customFields: {
    architexSpecSectionId: string;
    architexPackage: string;
    architexOwnerRole: string;
    architexReviewerRole: string | undefined;
    longLeadDays: number;
    openClientDecision: boolean;
    staleSourceBlocker: boolean;
  };
}

export interface OpenProjectSyncPlan {
  sourceOfTruth: 'Architex SpecForge';
  mirrorTarget: 'OpenProject API v3 work packages';
  syncMode: 'one-way-create-or-update-by-architexSpecSectionId';
  warning: string;
  payloads: OpenProjectWorkPackage[];
}

// ── Mapping Functions ───────────────────────────────────────────────────────

/**
 * Map a SpecForge workspace's sections to OpenProject work-package payloads.
 */
export function mapSpecWorkspaceToOpenProject(
  workspace: SpecForgeWorkspace,
  openProjectProjectHref = '/api/v3/projects/1',
): OpenProjectWorkPackage[] {
  return workspace.sections.map((section) => {
    const items = workspace.items.filter((i) => i.sectionId === section.id);
    return mapSectionToWorkPackage(section, items, openProjectProjectHref);
  });
}

function mapSectionToWorkPackage(
  section: SpecSection,
  items: SpecItem[],
  projectHref: string,
): OpenProjectWorkPackage {
  const maxLead = Math.max(0, ...items.map((i) => i.leadTimeDays || 0));
  const hasDecision = items.some((i) => i.clientDecision && i.status === 'needs_decision');
  const hasStale = items.some((i) => !!i.supersededBy);

  const descriptionLines = [
    `Architex SpecForge package for **${section.title}**.`,
    `Items: ${items.length}`,
    `Owner role: ${section.ownerRole}`,
    `Reviewer role: ${section.reviewerRole ?? 'none'}`,
    hasDecision ? 'Open client decisions present.' : 'No open client decisions.',
    hasStale ? 'BLOCKER: stale/superseded specification source present.' : 'No stale source blockers detected.',
    `Maximum lead time: ${maxLead} days.`,
  ];

  return {
    subject: `Spec package ${section.code}: ${section.title}`,
    description: {
      format: 'markdown',
      raw: descriptionLines.join('\n'),
    },
    _links: {
      project: { href: projectHref },
      type: { href: '/api/v3/types/1', title: 'Task' },
      status: { href: hasStale ? '/api/v3/statuses/13' : '/api/v3/statuses/1' },
      priority: { href: maxLead >= 56 || hasStale ? '/api/v3/priorities/8' : '/api/v3/priorities/7' },
    },
    customFields: {
      architexSpecSectionId: section.id,
      architexPackage: section.title,
      architexOwnerRole: section.ownerRole,
      architexReviewerRole: section.reviewerRole,
      longLeadDays: maxLead,
      openClientDecision: hasDecision,
      staleSourceBlocker: hasStale,
    },
  };
}

/**
 * Generate a full sync plan for the workspace.
 */
export function openProjectSyncPlan(workspace: SpecForgeWorkspace): OpenProjectSyncPlan {
  return {
    sourceOfTruth: 'Architex SpecForge',
    mirrorTarget: 'OpenProject API v3 work packages',
    syncMode: 'one-way-create-or-update-by-architexSpecSectionId',
    warning: 'Do not let OpenProject overwrite issued specification snapshots. It is a planning mirror only.',
    payloads: mapSpecWorkspaceToOpenProject(workspace),
  };
}
