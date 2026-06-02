export type ExternalApiIntegrationMode = 'live_gateway' | 'provider_gated' | 'local_mock';
export type ExternalApiIntegrationStatus = 'production_adapter_active' | 'ready_for_ui' | 'credentials_required' | 'provider_terms_required';

export type MockExternalApiIntegration = {
  id: 'payfast-sandbox' | 'cpd-statutory-sync' | 'supplier-catalogue' | 'municipal-portal';
  label: string;
  ownerRole: 'admin' | 'bep' | 'architect' | 'contractor' | 'supplier';
  mode: ExternalApiIntegrationMode;
  status: ExternalApiIntegrationStatus;
  endpointLabel: string;
  sampleRecords: Array<Record<string, string | number | boolean>>;
  governanceNote: string;
};

export const MOCK_EXTERNAL_API_NOTICE = 'Provider status is explicit: live_gateway means a deployed gateway exists; provider_gated means credentials/API terms are still required; local_mock means display fixture only.';

export const MOCK_EXTERNAL_API_INTEGRATIONS: MockExternalApiIntegration[] = [
  {
    id: 'payfast-sandbox',
    label: 'PayFast ITN gateway and escrow audit',
    ownerRole: 'admin',
    mode: 'live_gateway',
    status: 'production_adapter_active',
    endpointLabel: 'POST /api/payment/notify',
    sampleRecords: [
      { paymentId: 'pf-live-gateway-001', reference: 'ARC-PAY-1001', amountZar: 12500, status: 'signature_validated_audit_only', humanReleaseRequired: true },
      { paymentId: 'pf-live-gateway-002', reference: 'ARC-PAY-1002', amountZar: 4200, status: 'invalid_signature_rejected', humanReleaseRequired: true },
    ],
    governanceNote: 'Live PHP gateway validates PayFast signatures and writes immutable audit records. Escrow release/refund mutations remain disabled until provider reconciliation and human approval signoff are complete.',
  },
  {
    id: 'cpd-statutory-sync',
    label: 'CPD statutory sync queue',
    ownerRole: 'bep',
    mode: 'provider_gated',
    status: 'credentials_required',
    endpointLabel: 'provider-gated://cpd/statutory-sync',
    sampleRecords: [
      { certificateId: 'cpd-gated-001', statutoryBody: 'SACAP', points: 1.5, syncStatus: 'ready_for_human_review', statutorySubmission: false },
      { certificateId: 'cpd-gated-002', statutoryBody: 'ECSA', points: 2, syncStatus: 'provider_not_configured', statutorySubmission: false },
    ],
    governanceNote: 'Accredited-provider credentials, terms, and certificate-rule mapping are required before real statutory CPD sync can be enabled.',
  },
  {
    id: 'supplier-catalogue',
    label: 'Supplier catalogue and lead-time feed',
    ownerRole: 'supplier',
    mode: 'local_mock',
    status: 'provider_terms_required',
    endpointLabel: 'mock://supplier/catalogue',
    sampleRecords: [
      { sku: 'BRICK-STD-001', description: 'Clay stock brick pallet', availability: 'in_stock', leadTimeDays: 3, priceZar: 3890 },
      { sku: 'CEM-42-50KG', description: '42.5N cement 50kg', availability: 'limited', leadTimeDays: 2, priceZar: 118 },
    ],
    governanceNote: 'Supplier dashboard and procurement workflows are live, but catalogue pricing/stock remains local fixture data until supplier API terms and production adapters exist.',
  },
  {
    id: 'municipal-portal',
    label: 'Municipal submission tracker',
    ownerRole: 'architect',
    mode: 'provider_gated',
    status: 'credentials_required',
    endpointLabel: 'provider-gated://municipal/status',
    sampleRecords: [
      { submissionId: 'mun-gated-001', municipality: 'City of Johannesburg', stage: 'plans_received', daysInStage: 4, statutoryApproval: false },
      { submissionId: 'mun-gated-002', municipality: 'Ekurhuleni', stage: 'awaiting_comments', daysInStage: 11, statutoryApproval: false },
    ],
    governanceNote: 'Municipal tracker UI and PHP JSON fallbacks are deployed. Real plan submission/status automation requires municipality-specific portal credentials and terms approval.',
  },
];
