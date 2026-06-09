/**
 * Tests for Payment Provider Webhook Adapter
 */
import { describe, it, expect } from 'vitest';
import {
  recordProviderStatusEvent,
  parseProviderWebhook,
  confirmPaymentReceived,
  handlePaymentFailure,
} from '../paymentProviderWebhookAdapter';
import type { ReleaseRequest, FinancialProvider } from '../types';

const liveProvider: FinancialProvider = {
  providerId: 'live-escrow',
  name: 'Live Escrow Provider',
  providerType: 'escrow_provider',
  registered: true,
  capabilities: ['collect', 'escrow_hold', 'release', 'webhook_status'],
  liveConfigured: true,
};

function makeRelease(status: ReleaseRequest['status']): ReleaseRequest {
  return {
    releaseRequestId: 'rel-cert-001',
    certificateId: 'cert-001',
    providerId: 'live-escrow',
    amount: { currency: 'ZAR', amount: 456_000 },
    requiredApprovals: ['client', 'lead_professional'],
    approvals: ['client', 'lead_professional'],
    status,
    providerReference:
      status === 'submitted_to_provider' ? 'prov-cert-001-123' : undefined,
    createdAtIso: '2026-08-15T09:00:00.000Z',
  };
}

describe('paymentProviderWebhookAdapter', () => {
  describe('recordProviderStatusEvent', () => {
    it('maps submitted_to_provider → processing', () => {
      const release = makeRelease('submitted_to_provider');
      const event = recordProviderStatusEvent(release);
      expect(event.status).toBe('processing');
    });

    it('maps provider_confirmed_paid → paid', () => {
      const release = makeRelease('provider_confirmed_paid');
      const event = recordProviderStatusEvent(release);
      expect(event.status).toBe('paid');
    });

    it('maps disputed_locked → failed', () => {
      const release = makeRelease('disputed_locked');
      const event = recordProviderStatusEvent(release);
      expect(event.status).toBe('failed');
    });

    it('maps approval_required → received', () => {
      const release = makeRelease('approval_required');
      const event = recordProviderStatusEvent(release);
      expect(event.status).toBe('received');
    });

    it('uses "not-submitted" when no provider reference', () => {
      const release = {
        ...makeRelease('approval_required'),
        providerReference: undefined,
      };
      const event = recordProviderStatusEvent(release);
      expect(event.providerReference).toBe('not-submitted');
    });
  });

  describe('parseProviderWebhook', () => {
    it('validates a correct payload', () => {
      const result = parseProviderWebhook({
        providerReference: 'prov-cert-001',
        status: 'paid',
        rawSummary: 'Payment confirmed',
      });
      expect(result.valid).toBe(true);
      expect(result.event?.status).toBe('paid');
    });

    it('rejects non-object payload', () => {
      const result = parseProviderWebhook('not-an-object');
      expect(result.valid).toBe(false);
    });

    it('rejects missing provider reference', () => {
      const result = parseProviderWebhook({ status: 'paid' });
      expect(result.valid).toBe(false);
    });

    it('rejects invalid status', () => {
      const result = parseProviderWebhook({
        providerReference: 'ref-001',
        status: 'unknown_status',
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('confirmPaymentReceived', () => {
    it('confirms payment for submitted release', () => {
      const release = makeRelease('submitted_to_provider');
      const confirmed = confirmPaymentReceived(
        release,
        'prov-confirmed-001',
      );
      expect(confirmed.status).toBe('provider_confirmed_paid');
      expect(confirmed.providerReference).toBe('prov-confirmed-001');
    });

    it('throws for non-submitted status', () => {
      const release = makeRelease('approval_required');
      expect(() =>
        confirmPaymentReceived(release, 'ref'),
      ).toThrow(/Cannot confirm payment/);
    });
  });

  describe('handlePaymentFailure', () => {
    it('returns request to approval_required on failure', () => {
      const release = makeRelease('submitted_to_provider');
      const { request, event } = handlePaymentFailure(
        release,
        'Insufficient funds',
      );
      expect(request.status).toBe('approval_required');
      expect(request.providerReference).toBeUndefined();
      expect(event.status).toBe('failed');
      expect(event.rawSummary).toBe('Insufficient funds');
    });
  });
});
