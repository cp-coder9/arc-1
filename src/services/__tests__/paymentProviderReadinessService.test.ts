import { describe, expect, it } from 'vitest';
import { projectPaymentProviderReadiness } from '../paymentProviderReadinessService';

const completePayfastInput = {
  provider: 'payfast' as const,
  generatedAt: '2026-05-21T01:15:00.000Z',
  availableServerEnv: ['PAYFAST_MERCHANT_ID', 'PAYFAST_MERCHANT_KEY', 'PAYFAST_PASSPHRASE'],
  availablePublicEnv: [],
  serverRoutes: ['/api/payment/payfast/itn'],
  webhookEvents: ['payment_complete', 'payment_failed', 'payment_cancelled'],
  controls: {
    serverOwnedLedger: true,
    humanEscrowReleaseGate: true,
    disputeHoldQueue: true,
    vatInvoiceNumbering: true,
    taxAuditExport: true,
    providerCredentialsStoredServerSide: true,
  },
};

describe('paymentProviderReadinessService', () => {
  it('projects PayFast as ready only when server credentials, webhook coverage, ledger controls, and statutory controls are present', () => {
    const projection = projectPaymentProviderReadiness(completePayfastInput);

    expect(projection.generatedAt).toBe('2026-05-21T01:15:00.000Z');
    expect(projection.provider).toBe('payfast');
    expect(projection.overallStatus).toBe('ready');
    expect(projection.requiredServerEnv).toEqual(['PAYFAST_MERCHANT_ID', 'PAYFAST_MERCHANT_KEY', 'PAYFAST_PASSPHRASE']);
    expect(projection.prohibitedPublicEnv).toEqual(['VITE_PAYFAST_MERCHANT_ID', 'VITE_PAYFAST_MERCHANT_KEY', 'VITE_PAYFAST_PASSPHRASE']);
    expect(projection.requiredRoutes).toEqual(['/api/payment/payfast/itn']);
    expect(projection.requiredWebhookEvents).toEqual(['payment_complete', 'payment_failed', 'payment_cancelled']);
    expect(projection.nextActions).toEqual([]);
    expect(projection.audit).toEqual({
      providerNeutral: true,
      noSecretValuesAccepted: true,
      autoReleaseProhibited: true,
      humanApprovalRequiredForMoneyMovement: true,
    });
    expect(projection.gates.every((gate) => gate.status === 'ready')).toBe(true);
  });

  it('blocks provider go-live when credentials are missing or exposed through public Vite env vars', () => {
    const projection = projectPaymentProviderReadiness({
      ...completePayfastInput,
      availableServerEnv: ['PAYFAST_MERCHANT_ID'],
      availablePublicEnv: ['VITE_PAYFAST_MERCHANT_KEY', 'VITE_PAYFAST_PASSPHRASE'],
    });

    expect(projection.overallStatus).toBe('blocked');
    expect(projection.gates.find((gate) => gate.domain === 'credentials')?.blockers).toEqual(expect.arrayContaining([
      'Missing server-only provider credential PAYFAST_MERCHANT_KEY.',
      'Missing server-only provider credential PAYFAST_PASSPHRASE.',
      'Provider credential must not be exposed as public env VITE_PAYFAST_MERCHANT_KEY.',
      'Provider credential must not be exposed as public env VITE_PAYFAST_PASSPHRASE.',
    ]));
  });

  it('warns on unmapped webhook events and blocks missing server webhook routes', () => {
    const projection = projectPaymentProviderReadiness({
      ...completePayfastInput,
      serverRoutes: [],
      webhookEvents: ['payment_complete'],
    });

    expect(projection.overallStatus).toBe('blocked');
    expect(projection.gates.find((gate) => gate.domain === 'webhooks')?.blockers).toEqual(['Missing server webhook route /api/payment/payfast/itn.']);
    expect(projection.gates.find((gate) => gate.domain === 'webhooks')?.warnings).toEqual(expect.arrayContaining([
      'Webhook event payment_failed is not mapped into audit/ledger reconciliation.',
      'Webhook event payment_cancelled is not mapped into audit/ledger reconciliation.',
    ]));
  });

  it('blocks money movement readiness without server-owned ledgers, dispute holds, statutory exports, and human escrow release gates', () => {
    const projection = projectPaymentProviderReadiness({
      ...completePayfastInput,
      controls: {
        providerCredentialsStoredServerSide: true,
      },
    });

    expect(projection.overallStatus).toBe('blocked');
    expect(projection.nextActions).toEqual(expect.arrayContaining([
      'Ledger, invoice, escrow, and commission writes must be server-owned.',
      'Dispute/chargeback holds must be routed to a governed queue before release.',
      'VAT/tax invoice numbering must be deterministic and auditable before provider go-live.',
      'Finance team needs a tax audit export for payments, fees, refunds, and VAT before statutory readiness.',
      'Escrow and payout releases require a recorded human approval gate.',
    ]));
  });
});
