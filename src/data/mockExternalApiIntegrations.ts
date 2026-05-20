export type MockExternalApiIntegration = {
  id: 'payfast-sandbox' | 'cpd-statutory-sync' | 'supplier-catalogue' | 'municipal-portal';
  label: string;
  ownerRole: 'admin' | 'bep' | 'architect' | 'contractor' | 'supplier';
  mode: 'local_mock';
  status: 'ready_for_ui' | 'credentials_required';
  endpointLabel: string;
  sampleRecords: Array<Record<string, string | number | boolean>>;
  governanceNote: string;
};

export const MOCK_EXTERNAL_API_NOTICE = 'No live payment, statutory, municipal, or supplier-provider action is performed by this fixture.';

export const MOCK_EXTERNAL_API_INTEGRATIONS: MockExternalApiIntegration[] = [
  {
    id: 'payfast-sandbox',
    label: 'PayFast sandbox payment status',
    ownerRole: 'admin',
    mode: 'local_mock',
    status: 'credentials_required',
    endpointLabel: 'mock://payfast/itn/status',
    sampleRecords: [
      { paymentId: 'pf-mock-001', reference: 'ARC-PAY-1001', amountZar: 12500, status: 'sandbox_paid', humanReleaseRequired: true },
      { paymentId: 'pf-mock-002', reference: 'ARC-PAY-1002', amountZar: 4200, status: 'sandbox_pending', humanReleaseRequired: true },
    ],
    governanceNote: 'Mocks payment lifecycle display only. It cannot redirect, debit, refund, release escrow, or verify a PayFast ITN.',
  },
  {
    id: 'cpd-statutory-sync',
    label: 'CPD statutory sync queue',
    ownerRole: 'bep',
    mode: 'local_mock',
    status: 'credentials_required',
    endpointLabel: 'mock://cpd/statutory-sync',
    sampleRecords: [
      { certificateId: 'cpd-mock-001', statutoryBody: 'SACAP', points: 1.5, syncStatus: 'ready_for_human_review', statutorySubmission: false },
      { certificateId: 'cpd-mock-002', statutoryBody: 'ECSA', points: 2, syncStatus: 'provider_not_configured', statutorySubmission: false },
    ],
    governanceNote: 'Mocks provider payload review only. Accredited-provider credentials and certificate rules are still required before real sync.',
  },
  {
    id: 'supplier-catalogue',
    label: 'Supplier catalogue and lead-time feed',
    ownerRole: 'supplier',
    mode: 'local_mock',
    status: 'ready_for_ui',
    endpointLabel: 'mock://supplier/catalogue',
    sampleRecords: [
      { sku: 'BRICK-STD-001', description: 'Clay stock brick pallet', availability: 'in_stock', leadTimeDays: 3, priceZar: 3890 },
      { sku: 'CEM-42-50KG', description: '42.5N cement 50kg', availability: 'limited', leadTimeDays: 2, priceZar: 118 },
    ],
    governanceNote: 'Mocks catalogue visibility only. It cannot place supplier orders, reserve stock, or confirm live prices.',
  },
  {
    id: 'municipal-portal',
    label: 'Municipal submission tracker',
    ownerRole: 'architect',
    mode: 'local_mock',
    status: 'credentials_required',
    endpointLabel: 'mock://municipal/status',
    sampleRecords: [
      { submissionId: 'mun-mock-001', municipality: 'City of Johannesburg', stage: 'plans_received', daysInStage: 4, statutoryApproval: false },
      { submissionId: 'mun-mock-002', municipality: 'Ekurhuleni', stage: 'awaiting_comments', daysInStage: 11, statutoryApproval: false },
    ],
    governanceNote: 'Mocks tracker status only. It cannot submit plans, certify approval, or operate a municipal portal.',
  },
];
