export function mapSpecWorkspaceToOpenProject(workspace, openProjectProjectHref = '/api/v3/projects/1') {
  return workspace.sections.map(section => {
    const items = workspace.items.filter(i => i.sectionId === section.id);
    const maxLead = Math.max(0, ...items.map(i => i.leadTimeDays || 0));
    const hasDecision = items.some(i => i.clientDecision && i.status === 'needs_decision');
    const hasStale = items.some(i => i.supersededBy);
    return {
      subject: `Spec package ${section.code}: ${section.title}`,
      description: {
        format: 'markdown',
        raw: [
          `Architex SpecForge package for **${section.title}**.`,
          `Items: ${items.length}`,
          `Owner role: ${section.ownerRole}`,
          `Reviewer role: ${section.reviewerRole}`,
          hasDecision ? 'Open client decisions present.' : 'No open client decisions.',
          hasStale ? 'BLOCKER: stale/superseded specification source present.' : 'No stale source blockers detected.',
          `Maximum lead time: ${maxLead} days.`
        ].join('\n')
      },
      _links: {
        project: { href: openProjectProjectHref },
        type: { href: '/api/v3/types/1', title: 'Task' },
        status: { href: hasStale ? '/api/v3/statuses/13' : '/api/v3/statuses/1' },
        priority: { href: maxLead >= 56 || hasStale ? '/api/v3/priorities/8' : '/api/v3/priorities/7' }
      },
      customFields: {
        architexSpecSectionId: section.id,
        architexPackage: section.title,
        architexOwnerRole: section.ownerRole,
        architexReviewerRole: section.reviewerRole,
        longLeadDays: maxLead,
        openClientDecision: hasDecision,
        staleSourceBlocker: hasStale
      }
    };
  });
}

export function openProjectSyncPlan(workspace) {
  return {
    sourceOfTruth: 'Architex SpecForge',
    mirrorTarget: 'OpenProject API v3 work packages',
    syncMode: 'one-way-create-or-update-by-architexSpecSectionId',
    warning: 'Do not let OpenProject overwrite issued specification snapshots. It is a planning mirror only.',
    payloads: mapSpecWorkspaceToOpenProject(workspace)
  };
}
