import { describe, expect, it } from 'vitest';
import { MOCK_EXTERNAL_API_NOTICE } from '@/data/mockExternalApiIntegrations';
import { projectProviderIntegrationReadiness } from '../providerIntegrationReadinessService';

describe('providerIntegrationReadinessService', () => {
  it('projects live/provider-gated/local-mock integrations with explicit blockers', () => {
    const projection = projectProviderIntegrationReadiness({}, '2026-05-21T01:50:00.000Z');

    expect(projection.generatedAt).toBe('2026-05-21T01:50:00.000Z');
    expect(projection.overallStatus).toBe('mock_only');
    expect(projection.productionReadyCount).toBe(0);
    expect(projection.blockedCount).toBe(4);
    expect(projection.audit).toEqual({
      source: 'backend.html',
      localMockNotice: MOCK_EXTERNAL_API_NOTICE,
      providerNeutral: true,
      liveGatewayInventory: true,
      humanApprovalPreserved: true,
    });
    expect(projection.items.find((item) => item.id === 'payfast-sandbox')?.endpointLabel).toBe('POST /api/payment/notify');
    expect(Object.isFrozen(projection)).toBe(true);
  });

  it('keeps PayFast blocked until credentials, human approval, adapter, and reconciliation evidence all exist', () => {
    const projection = projectProviderIntegrationReadiness({
      'payfast-sandbox': {
        credentialVaultRefs: ['vault://payments/payfast'],
        humanApprovalRefs: ['approval:finance-admin'],
        productionAdapterRefs: ['contract:payfast-itn-v1'],
      },
    });

    const payfast = projection.items.find((item) => item.id === 'payfast-sandbox');
    expect(payfast?.status).toBe('ui_mock_ready');
    expect(payfast?.productionEnabled).toBe(false);
    expect(payfast?.blockers).toEqual(expect.arrayContaining([
      'Missing provider reconciliation/audit reference for PayFast ITN gateway and escrow audit.',
    ]));
  });

  it('requires human governance and a production adapter before supplier catalogue can leave mock display mode', () => {
    const projection = projectProviderIntegrationReadiness({
      'supplier-catalogue': { humanApprovalRefs: ['approval:procurement-admin'] },
    });

    const supplier = projection.items.find((item) => item.id === 'supplier-catalogue');
    expect(supplier?.providerClass).toBe('supplier');
    expect(supplier?.status).toBe('ui_mock_ready');
    expect(supplier?.missingEvidence).toEqual(['production adapter contract reference']);
    expect(supplier?.productionEnabled).toBe(false);
    expect(supplier?.blockers).toEqual(expect.arrayContaining([
      'Supplier catalogue and lead-time feed is local_mock only and must not be treated as a live provider integration.',
      'Supplier catalogue and lead-time feed requires provider terms/commercial approval before production use.',
    ]));
  });

  it('marks statutory and municipal integrations credential-blocked when server-side credentials are absent', () => {
    const projection = projectProviderIntegrationReadiness({
      'cpd-statutory-sync': { humanApprovalRefs: ['approval:statutory-admin'], productionAdapterRefs: ['contract:cpd-sync'] },
      'municipal-portal': { humanApprovalRefs: ['approval:municipal-admin'], productionAdapterRefs: ['contract:municipal-status'] },
    });

    expect(projection.items.find((item) => item.id === 'cpd-statutory-sync')?.status).toBe('credentials_blocked');
    expect(projection.items.find((item) => item.id === 'municipal-portal')?.status).toBe('credentials_blocked');
    expect(projection.items.find((item) => item.id === 'municipal-portal')?.blockers).toEqual(expect.arrayContaining([
      'Municipal submission tracker is provider_gated until credentials/API terms and production adapter checks pass.',
    ]));
  });
});
