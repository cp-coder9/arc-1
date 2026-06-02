import { MOCK_EXTERNAL_API_INTEGRATIONS, MOCK_EXTERNAL_API_NOTICE, type MockExternalApiIntegration } from '@/data/mockExternalApiIntegrations';

export type ProviderIntegrationReadinessStatus = 'ui_mock_ready' | 'credentials_blocked' | 'approval_blocked' | 'production_ready';
export type ProviderIntegrationProviderClass = 'payment' | 'statutory' | 'supplier' | 'municipal';

export interface ProviderIntegrationApprovalEvidence {
  credentialVaultRefs?: string[];
  humanApprovalRefs?: string[];
  productionAdapterRefs?: string[];
  reconciliationRefs?: string[];
}

export interface ProviderIntegrationReadinessItem {
  id: MockExternalApiIntegration['id'];
  label: string;
  providerClass: ProviderIntegrationProviderClass;
  ownerRole: MockExternalApiIntegration['ownerRole'];
  status: ProviderIntegrationReadinessStatus;
  productionEnabled: boolean;
  missingEvidence: string[];
  blockers: string[];
  governanceNote: string;
  endpointLabel: string;
}

export interface ProviderIntegrationReadinessProjection {
  generatedAt: string;
  overallStatus: Exclude<ProviderIntegrationReadinessStatus, 'ui_mock_ready'> | 'mock_only';
  productionReadyCount: number;
  blockedCount: number;
  items: ProviderIntegrationReadinessItem[];
  audit: {
    source: 'backend.html';
    localMockNotice: string;
    providerNeutral: true;
    liveGatewayInventory: true;
    humanApprovalPreserved: true;
  };
}

const PROVIDER_CLASS_BY_ID: Record<MockExternalApiIntegration['id'], ProviderIntegrationProviderClass> = {
  'payfast-sandbox': 'payment',
  'cpd-statutory-sync': 'statutory',
  'supplier-catalogue': 'supplier',
  'municipal-portal': 'municipal',
};

const REQUIRED_EVIDENCE_BY_CLASS: Record<ProviderIntegrationProviderClass, Array<keyof ProviderIntegrationApprovalEvidence>> = {
  payment: ['credentialVaultRefs', 'humanApprovalRefs', 'productionAdapterRefs', 'reconciliationRefs'],
  statutory: ['credentialVaultRefs', 'humanApprovalRefs', 'productionAdapterRefs'],
  supplier: ['humanApprovalRefs', 'productionAdapterRefs'],
  municipal: ['credentialVaultRefs', 'humanApprovalRefs', 'productionAdapterRefs'],
};

function hasEvidence(evidence: ProviderIntegrationApprovalEvidence, key: keyof ProviderIntegrationApprovalEvidence): boolean {
  return (evidence[key]?.length ?? 0) > 0;
}

function evidenceLabel(key: keyof ProviderIntegrationApprovalEvidence): string {
  switch (key) {
    case 'credentialVaultRefs':
      return 'server-side credential vault reference';
    case 'humanApprovalRefs':
      return 'human governance approval reference';
    case 'productionAdapterRefs':
      return 'production adapter contract reference';
    case 'reconciliationRefs':
      return 'provider reconciliation/audit reference';
  }
}

export function projectProviderIntegrationReadiness(
  evidenceByIntegration: Partial<Record<MockExternalApiIntegration['id'], ProviderIntegrationApprovalEvidence>> = {},
  generatedAt = new Date().toISOString(),
): ProviderIntegrationReadinessProjection {
  const items = MOCK_EXTERNAL_API_INTEGRATIONS.map((integration): ProviderIntegrationReadinessItem => {
    const providerClass = PROVIDER_CLASS_BY_ID[integration.id];
    const evidence = evidenceByIntegration[integration.id] ?? {};
    const missingEvidence = REQUIRED_EVIDENCE_BY_CLASS[providerClass]
      .filter((key) => !hasEvidence(evidence, key))
      .map(evidenceLabel);

    const blockers = [
      ...missingEvidence.map((missing) => `Missing ${missing} for ${integration.label}.`),
      ...(integration.mode === 'local_mock' ? [`${integration.label} is local_mock only and must not be treated as a live provider integration.`] : []),
      ...(integration.mode === 'provider_gated' ? [`${integration.label} is provider_gated until credentials/API terms and production adapter checks pass.`] : []),
      ...(integration.status === 'credentials_required' ? [`${integration.label} requires credentials before production use.`] : []),
      ...(integration.status === 'provider_terms_required' ? [`${integration.label} requires provider terms/commercial approval before production use.`] : []),
    ];

    const productionEnabled = blockers.length === 0;
    const status: ProviderIntegrationReadinessStatus = productionEnabled
      ? 'production_ready'
      : missingEvidence.some((missing) => missing.includes('credential'))
        ? 'credentials_blocked'
        : missingEvidence.some((missing) => missing.includes('human governance'))
          ? 'approval_blocked'
          : 'ui_mock_ready';

    return {
      id: integration.id,
      label: integration.label,
      providerClass,
      ownerRole: integration.ownerRole,
      status,
      productionEnabled,
      missingEvidence,
      blockers,
      governanceNote: integration.governanceNote,
      endpointLabel: integration.endpointLabel,
    };
  });

  const productionReadyCount = items.filter((item) => item.productionEnabled).length;
  const blockedCount = items.length - productionReadyCount;
  const overallStatus = productionReadyCount === items.length
    ? 'production_ready'
    : productionReadyCount > 0
      ? 'approval_blocked'
      : 'mock_only';

  return Object.freeze({
    generatedAt,
    overallStatus,
    productionReadyCount,
    blockedCount,
    items,
    audit: {
      source: 'backend.html',
      localMockNotice: MOCK_EXTERNAL_API_NOTICE,
      providerNeutral: true,
      liveGatewayInventory: true,
      humanApprovalPreserved: true,
    } satisfies ProviderIntegrationReadinessProjection['audit'],
  });
}
