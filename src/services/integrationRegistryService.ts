export type IntegrationStatus = 'live' | 'mocked' | 'provider_gated' | 'future';
export interface IntegrationRegistryItem { key: string; name: string; owner?: string; status: IntegrationStatus; credentialsRef?: string; termsRef?: string; testStatus?: 'untested' | 'passing' | 'failing' }
export function evaluateIntegrationRegistry(items: IntegrationRegistryItem[]) {
  const blockers: string[] = [];
  for (const item of items) {
    if (!item.owner) blockers.push(`${item.key} is missing an owner.`);
    if ((item.status === 'live' || item.status === 'provider_gated') && !item.credentialsRef) blockers.push(`${item.key} requires credential reference for ${item.status} integration.`);
    if (!item.termsRef) blockers.push(`${item.key} is missing provider terms/legal reference.`);
    if (item.status === 'live' && item.testStatus !== 'passing') blockers.push(`${item.key} live integration must have passing test status.`);
  }
  const byStatus = items.reduce<Record<IntegrationStatus, number>>((acc, item) => ({ ...acc, [item.status]: acc[item.status] + 1 }), { live: 0, mocked: 0, provider_gated: 0, future: 0 });
  return Object.freeze({ status: blockers.length ? 'blocked' : 'ready_for_release_review', count: items.length, byStatus, blockers, nextAction: { label: blockers.length ? 'Resolve integration registry blockers' : 'Approve strategic integration registry', target: 'release-governance', requiresHumanConfirmation: true, automationLevel: 'advisory' as const }, audit: { prdSection: 'Section 60: Strategic Integration Blueprint' as const, humanReviewRequired: true } });
}
