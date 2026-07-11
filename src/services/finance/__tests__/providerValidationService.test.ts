/**
 * Unit tests for Provider Validation Service
 *
 * Tests provider registration validation, reference validation,
 * dual confirmation logic, and timeout handling.
 *
 * @see Requirements 11.1, 11.2, 11.4, 11.5, 11.6
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateProviderRegistration,
  validateProviderReference,
  isDualConfirmationComplete,
  handleProviderTimeout,
  enrichRecordWithProviderDetails,
  validateProviderForWrite,
  PROVIDER_TIMEOUT_MS,
} from '../providerValidationService';
import type {
  ProviderReferencedRecord,
  DualConfirmationRecord,
  TimeoutHandlingInput,
} from '../providerValidationService';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock firebase-admin
const mockGet = vi.fn();
const mockCreate = vi.fn();
const mockDoc = vi.fn(() => ({ get: mockGet, create: mockCreate }));
const mockCollection = vi.fn(() => ({ doc: mockDoc }));

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: (...args: unknown[]) => mockCollection(...args),
  },
}));

// Mock the audit trail service
vi.mock('../auditTrailService', () => ({
  writeImmutableAuditRecord: vi.fn().mockResolvedValue('audit-123'),
}));

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const validProvider = {
  providerId: 'provider-001',
  name: 'PayFast Trust',
  providerType: 'payment_gateway',
  registered: true,
  liveConfigured: true,
  capabilities: ['collect', 'release', 'payout', 'webhook_status'],
};

const unregisteredProvider = {
  providerId: 'provider-002',
  name: 'TestPay',
  providerType: 'payment_gateway',
  registered: false,
  liveConfigured: false,
  capabilities: ['collect'],
};

const notLiveProvider = {
  providerId: 'provider-003',
  name: 'StagingPay',
  providerType: 'escrow_provider',
  registered: true,
  liveConfigured: false,
  capabilities: ['escrow_hold', 'release'],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('providerValidationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // validateProviderRegistration
  // -------------------------------------------------------------------------

  describe('validateProviderRegistration', () => {
    it('returns valid for a registered, liveConfigured provider', async () => {
      mockGet.mockResolvedValue({ exists: true, data: () => validProvider });

      const result = await validateProviderRegistration('provider-001');

      expect(result.valid).toBe(true);
      expect(result.providerId).toBe('provider-001');
      expect(result.providerName).toBe('PayFast Trust');
      expect(result.error).toBeUndefined();
    });

    it('returns invalid when provider is not found', async () => {
      mockGet.mockResolvedValue({ exists: false });

      const result = await validateProviderRegistration('nonexistent');

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('PROVIDER_NOT_FOUND');
      expect(result.error).toContain('not found');
    });

    it('returns invalid when provider is not registered', async () => {
      mockGet.mockResolvedValue({ exists: true, data: () => unregisteredProvider });

      const result = await validateProviderRegistration('provider-002');

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('PROVIDER_NOT_REGISTERED');
      expect(result.error).toContain('not registered');
    });

    it('returns invalid when provider is not liveConfigured', async () => {
      mockGet.mockResolvedValue({ exists: true, data: () => notLiveProvider });

      const result = await validateProviderRegistration('provider-003');

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('PROVIDER_NOT_LIVE_CONFIGURED');
      expect(result.error).toContain('not live-configured');
    });

    it('returns invalid with PROVIDER_NOT_FOUND when providerId is empty', async () => {
      const result = await validateProviderRegistration('');

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('PROVIDER_NOT_FOUND');
    });
  });

  // -------------------------------------------------------------------------
  // validateProviderReference
  // -------------------------------------------------------------------------

  describe('validateProviderReference', () => {
    it('returns valid when both providerId and providerTransactionRef are present', async () => {
      const record: ProviderReferencedRecord = {
        providerId: 'provider-001',
        providerTransactionRef: 'TXN-001-REF',
      };

      const result = await validateProviderReference(record);

      expect(result.valid).toBe(true);
      expect(result.missingFields).toHaveLength(0);
    });

    it('returns invalid when providerId is missing', async () => {
      const record: ProviderReferencedRecord = {
        providerTransactionRef: 'TXN-001-REF',
      };

      const result = await validateProviderReference(record);

      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain('providerId');
    });

    it('returns invalid when providerTransactionRef is missing', async () => {
      const record: ProviderReferencedRecord = {
        providerId: 'provider-001',
      };

      const result = await validateProviderReference(record);

      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain('providerTransactionRef');
    });

    it('returns invalid with both fields missing', async () => {
      const record: ProviderReferencedRecord = {};

      const result = await validateProviderReference(record);

      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain('providerId');
      expect(result.missingFields).toContain('providerTransactionRef');
      expect(result.error).toContain('missing required provider fields');
    });

    it('writes a failed-validation audit record when recordId and actorUid provided', async () => {
      const { writeImmutableAuditRecord } = await import('../auditTrailService');
      const record: ProviderReferencedRecord = {};

      await validateProviderReference(record, 'record-001', 'user-abc');

      expect(writeImmutableAuditRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUid: 'user-abc',
          action: 'claim_rejected',
          targetResourceId: 'record-001',
          newState: 'rejected_missing_provider',
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // isDualConfirmationComplete
  // -------------------------------------------------------------------------

  describe('isDualConfirmationComplete', () => {
    it('returns complete when both provider and human confirmations are present', () => {
      const record: DualConfirmationRecord = {
        providerConfirmationRef: 'PROV-CONF-001',
        providerConfirmedAtIso: '2026-01-15T10:00:00.000Z',
        humanAuthorizationRef: 'CERT-001',
        humanAuthorizerUid: 'approver-uid',
        humanAuthorizerRole: 'quantity_surveyor',
        humanAuthorizedAtIso: '2026-01-15T09:30:00.000Z',
      };

      const result = isDualConfirmationComplete(record);

      expect(result.complete).toBe(true);
      expect(result.providerConfirmed).toBe(true);
      expect(result.humanAuthorized).toBe(true);
      expect(result.missingConfirmations).toHaveLength(0);
    });

    it('returns incomplete when provider confirmation is missing', () => {
      const record: DualConfirmationRecord = {
        humanAuthorizationRef: 'CERT-001',
        humanAuthorizerUid: 'approver-uid',
        humanAuthorizerRole: 'quantity_surveyor',
        humanAuthorizedAtIso: '2026-01-15T09:30:00.000Z',
      };

      const result = isDualConfirmationComplete(record);

      expect(result.complete).toBe(false);
      expect(result.providerConfirmed).toBe(false);
      expect(result.humanAuthorized).toBe(true);
      expect(result.missingConfirmations).toContain('provider_confirmation');
    });

    it('returns incomplete when human authorization is missing', () => {
      const record: DualConfirmationRecord = {
        providerConfirmationRef: 'PROV-CONF-001',
        providerConfirmedAtIso: '2026-01-15T10:00:00.000Z',
      };

      const result = isDualConfirmationComplete(record);

      expect(result.complete).toBe(false);
      expect(result.providerConfirmed).toBe(true);
      expect(result.humanAuthorized).toBe(false);
      expect(result.missingConfirmations).toContain('human_authorization');
    });

    it('returns incomplete when both confirmations are missing', () => {
      const record: DualConfirmationRecord = {};

      const result = isDualConfirmationComplete(record);

      expect(result.complete).toBe(false);
      expect(result.providerConfirmed).toBe(false);
      expect(result.humanAuthorized).toBe(false);
      expect(result.missingConfirmations).toHaveLength(2);
    });

    it('requires providerConfirmedAtIso alongside providerConfirmationRef', () => {
      const record: DualConfirmationRecord = {
        providerConfirmationRef: 'PROV-CONF-001',
        // Missing providerConfirmedAtIso
        humanAuthorizationRef: 'CERT-001',
        humanAuthorizerUid: 'approver-uid',
        humanAuthorizedAtIso: '2026-01-15T09:30:00.000Z',
      };

      const result = isDualConfirmationComplete(record);

      expect(result.providerConfirmed).toBe(false);
    });

    it('requires humanAuthorizerUid alongside humanAuthorizationRef', () => {
      const record: DualConfirmationRecord = {
        providerConfirmationRef: 'PROV-CONF-001',
        providerConfirmedAtIso: '2026-01-15T10:00:00.000Z',
        humanAuthorizationRef: 'CERT-001',
        // Missing humanAuthorizerUid
        humanAuthorizedAtIso: '2026-01-15T09:30:00.000Z',
      };

      const result = isDualConfirmationComplete(record);

      expect(result.humanAuthorized).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // handleProviderTimeout
  // -------------------------------------------------------------------------

  describe('handleProviderTimeout', () => {
    it('returns not timed out when elapsed time is under threshold', async () => {
      const input: TimeoutHandlingInput = {
        recordId: 'release-001',
        providerId: 'provider-001',
        providerReference: 'REF-001',
        submittedAtIso: new Date().toISOString(), // just submitted
        releaseApproverUid: 'approver-001',
      };

      const result = await handleProviderTimeout(input);

      expect(result.timedOut).toBe(false);
      expect(result.status).toBe('awaiting_provider');
      expect(result.notificationSent).toBe(false);
    });

    it('returns timed out when elapsed time exceeds threshold', async () => {
      // Submitted 130 seconds ago (beyond 120s default)
      const submittedAt = new Date(Date.now() - 130_000).toISOString();
      mockCreate.mockResolvedValue({});

      const input: TimeoutHandlingInput = {
        recordId: 'release-002',
        providerId: 'provider-001',
        providerReference: 'REF-002',
        submittedAtIso: submittedAt,
        releaseApproverUid: 'approver-001',
        monetaryAmount: { currency: 'ZAR', amount: 50000 },
      };

      const result = await handleProviderTimeout(input);

      expect(result.timedOut).toBe(true);
      expect(result.status).toBe('provider_configuration_required');
      expect(result.auditId).toBe('audit-123');
      expect(result.notificationSent).toBe(true);
    });

    it('supports custom timeout threshold', async () => {
      // Submitted 5 seconds ago, custom timeout of 3 seconds
      const submittedAt = new Date(Date.now() - 5000).toISOString();
      mockCreate.mockResolvedValue({});

      const input: TimeoutHandlingInput = {
        recordId: 'release-003',
        providerId: 'provider-001',
        submittedAtIso: submittedAt,
        releaseApproverUid: 'approver-001',
      };

      const result = await handleProviderTimeout(input, 3000);

      expect(result.timedOut).toBe(true);
      expect(result.status).toBe('provider_configuration_required');
    });

    it('does not send notification when releaseApproverUid is not provided', async () => {
      const submittedAt = new Date(Date.now() - 130_000).toISOString();

      const input: TimeoutHandlingInput = {
        recordId: 'release-004',
        providerId: 'provider-001',
        submittedAtIso: submittedAt,
        // No releaseApproverUid
      };

      const result = await handleProviderTimeout(input);

      expect(result.timedOut).toBe(true);
      expect(result.notificationSent).toBe(false);
    });

    it('uses default 120s timeout when no custom value provided', () => {
      expect(PROVIDER_TIMEOUT_MS).toBe(120_000);
    });
  });

  // -------------------------------------------------------------------------
  // enrichRecordWithProviderDetails
  // -------------------------------------------------------------------------

  describe('enrichRecordWithProviderDetails', () => {
    it('adds providerId, providerName, and providerTransactionRef to record', () => {
      const record: ProviderReferencedRecord = { someField: 'value' };
      const provider = { providerId: 'provider-001', name: 'PayFast Trust' };

      const enriched = enrichRecordWithProviderDetails(record, provider, 'TXN-REF-001');

      expect(enriched.providerId).toBe('provider-001');
      expect(enriched.providerName).toBe('PayFast Trust');
      expect(enriched.providerTransactionRef).toBe('TXN-REF-001');
      expect(enriched.someField).toBe('value');
    });

    it('does not mutate the original record', () => {
      const record: ProviderReferencedRecord = { someField: 'value' };
      const provider = { providerId: 'provider-001', name: 'PayFast Trust' };

      enrichRecordWithProviderDetails(record, provider, 'TXN-REF-001');

      expect(record.providerId).toBeUndefined();
      expect(record.providerName).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // validateProviderForWrite (composite validation)
  // -------------------------------------------------------------------------

  describe('validateProviderForWrite', () => {
    it('returns valid when provider exists and is live-configured', async () => {
      mockGet.mockResolvedValue({ exists: true, data: () => validProvider });

      const record: ProviderReferencedRecord = {
        providerId: 'provider-001',
        providerTransactionRef: 'TXN-001',
      };

      const result = await validateProviderForWrite(record, 'rec-001', 'user-001');

      expect(result.valid).toBe(true);
      expect(result.providerName).toBe('PayFast Trust');
    });

    it('returns invalid with failedConditions when providerId is missing', async () => {
      const record: ProviderReferencedRecord = {
        providerTransactionRef: 'TXN-001',
      };

      const result = await validateProviderForWrite(record, 'rec-001', 'user-001');

      expect(result.valid).toBe(false);
      expect(result.failedConditions).toContainEqual(
        expect.objectContaining({ condition: 'missing_providerId' }),
      );
    });

    it('returns invalid when provider is not liveConfigured', async () => {
      mockGet.mockResolvedValue({ exists: true, data: () => notLiveProvider });

      const record: ProviderReferencedRecord = {
        providerId: 'provider-003',
        providerTransactionRef: 'TXN-001',
      };

      const result = await validateProviderForWrite(record, 'rec-001', 'user-001');

      expect(result.valid).toBe(false);
      expect(result.failedConditions).toContainEqual(
        expect.objectContaining({ condition: 'PROVIDER_NOT_LIVE_CONFIGURED' }),
      );
    });
  });
});
