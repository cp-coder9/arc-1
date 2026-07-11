/**
 * Unit tests for the enhanced auditTrailService (Sprint 6 — Immutable Audit Records)
 *
 * Tests: ImmutableAuditRecord types, calculateRetentionExpiry, writeImmutableAuditRecord,
 * rejectAuditMutation, and backward compatibility with legacy helpers.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  calculateRetentionExpiry,
  writeImmutableAuditRecord,
  rejectAuditMutation,
  createAuditTrail,
  createAuditEntry,
  auditProviderWebhook,
  auditDispute,
  auditVariationStateChange,
  auditRetention,
  writePaymentReleaseAudit,
  writeProviderWebhookAudit,
  writeEscrowTransitionAudit,
} from '../auditTrailService';
import type {
  AuditAction,
  ImmutableAuditRecord,
  ImmutableAuditRecordInput,
  EvidenceReference,
  HumanConfirmation,
  AuditMutationRejection,
  PaymentReleaseAuditInput,
  ProviderWebhookAuditInput,
  EscrowTransitionAuditInput,
} from '../auditTrailService';

// Mock Firebase Admin SDK
vi.mock('@/lib/firebase-admin', () => {
  const createMock = vi.fn().mockResolvedValue(undefined);
  const docMock = vi.fn().mockReturnValue({ create: createMock });
  const collectionMock = vi.fn().mockReturnValue({ doc: docMock });

  return {
    adminDb: {
      collection: collectionMock,
    },
    __mocks: { collectionMock, docMock, createMock },
  };
});

describe('auditTrailService — Immutable Audit Records (Sprint 6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AuditAction type coverage', () => {
    it('accepts all 16 defined audit action types', () => {
      const actions: AuditAction[] = [
        'claim_submitted',
        'claim_rejected',
        'claim_certified',
        'payment_released',
        'payment_failed',
        'refund_initiated',
        'escrow_funded',
        'escrow_released',
        'escrow_disputed',
        'escrow_timeout',
        'contract_generated',
        'contract_signed',
        'contract_locked',
        'contract_varied',
        'provider_webhook_received',
        'tamper_attempt',
      ];
      expect(actions).toHaveLength(16);
    });
  });

  describe('calculateRetentionExpiry', () => {
    it('calculates exactly 5 years from the provided ISO timestamp', () => {
      const created = '2024-03-15T10:30:00.000Z';
      const expiry = calculateRetentionExpiry(created);
      const expiryDate = new Date(expiry);

      expect(expiryDate.getUTCFullYear()).toBe(2029);
      expect(expiryDate.getUTCMonth()).toBe(2); // March (0-indexed)
      expect(expiryDate.getUTCDate()).toBe(15);
    });

    it('handles leap year date (Feb 29) gracefully', () => {
      const created = '2024-02-29T12:00:00.000Z';
      const expiry = calculateRetentionExpiry(created);
      const expiryDate = new Date(expiry);

      // 2029 is not a leap year, so Feb 29 rolls to Mar 1
      expect(expiryDate.getUTCFullYear()).toBe(2029);
      expect(expiryDate.getUTCMonth()).toBe(2); // March
      expect(expiryDate.getUTCDate()).toBe(1);
    });

    it('handles end-of-year timestamps', () => {
      const created = '2025-12-31T23:59:59.999Z';
      const expiry = calculateRetentionExpiry(created);
      const expiryDate = new Date(expiry);

      expect(expiryDate.getUTCFullYear()).toBe(2030);
      expect(expiryDate.getUTCMonth()).toBe(11); // December
      expect(expiryDate.getUTCDate()).toBe(31);
    });

    it('returns a valid ISO 8601 string', () => {
      const created = '2026-06-15T08:00:00.000Z';
      const expiry = calculateRetentionExpiry(created);
      expect(new Date(expiry).toISOString()).toBe(expiry);
    });
  });

  describe('writeImmutableAuditRecord', () => {
    it('writes to audit_logs collection via Admin SDK', async () => {
      const { adminDb } = await import('@/lib/firebase-admin');

      const input: ImmutableAuditRecordInput = {
        actorUid: 'user-123',
        actorRole: 'quantity_surveyor',
        action: 'claim_submitted',
        timestampIso: '2026-06-15T10:00:00.000Z',
        targetResourceId: 'claim-456',
        evidenceReferences: [
          { type: 'document_version', referenceId: 'doc-789' },
        ],
      };

      const auditId = await writeImmutableAuditRecord(input);

      expect(auditId).toBeTruthy();
      expect(typeof auditId).toBe('string');
      expect(adminDb.collection).toHaveBeenCalledWith('audit_logs');
    });

    it('generates a unique auditId', async () => {
      const input: ImmutableAuditRecordInput = {
        actorUid: 'user-1',
        actorRole: 'contractor',
        action: 'payment_released',
        timestampIso: '2026-01-01T00:00:00.000Z',
        targetResourceId: 'release-1',
        evidenceReferences: [
          { type: 'provider_transaction', referenceId: 'tx-abc' },
        ],
      };

      const id1 = await writeImmutableAuditRecord(input);
      const id2 = await writeImmutableAuditRecord(input);

      expect(id1).not.toBe(id2);
    });

    it('sets immutable: true on the persisted record', async () => {
      const { adminDb } = await import('@/lib/firebase-admin');
      const docMock = (adminDb.collection as any)().doc;
      const createMock = docMock().create;

      const input: ImmutableAuditRecordInput = {
        actorUid: 'user-1',
        actorRole: 'lead_professional',
        action: 'escrow_funded',
        timestampIso: '2026-06-15T10:00:00.000Z',
        targetResourceId: 'wallet-1',
        evidenceReferences: [
          { type: 'webhook_event', referenceId: 'evt-1' },
        ],
        previousState: 'Unfunded',
        newState: 'FundedHeld',
      };

      await writeImmutableAuditRecord(input);

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          immutable: true,
        }),
      );
    });

    it('calculates retentionExpiresAtIso as 5 years from timestamp', async () => {
      const { adminDb } = await import('@/lib/firebase-admin');
      const docMock = (adminDb.collection as any)().doc;
      const createMock = docMock().create;

      const input: ImmutableAuditRecordInput = {
        actorUid: 'user-1',
        actorRole: 'platform_finance_admin',
        action: 'refund_initiated',
        timestampIso: '2026-06-15T10:00:00.000Z',
        targetResourceId: 'cert-1',
        evidenceReferences: [
          { type: 'certificate', referenceId: 'cert-1' },
        ],
      };

      await writeImmutableAuditRecord(input);

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          retentionExpiresAtIso: '2031-06-15T10:00:00.000Z',
        }),
      );
    });

    it('preserves optional monetaryAmount field', async () => {
      const { adminDb } = await import('@/lib/firebase-admin');
      const docMock = (adminDb.collection as any)().doc;
      const createMock = docMock().create;

      const input: ImmutableAuditRecordInput = {
        actorUid: 'user-1',
        actorRole: 'contractor',
        action: 'claim_submitted',
        timestampIso: '2026-01-01T00:00:00.000Z',
        monetaryAmount: { currency: 'ZAR', amount: 150000 },
        targetResourceId: 'claim-1',
        evidenceReferences: [
          { type: 'approval_chain', referenceId: 'chain-1' },
        ],
      };

      await writeImmutableAuditRecord(input);

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          monetaryAmount: { currency: 'ZAR', amount: 150000 },
        }),
      );
    });

    it('preserves humanConfirmation field for payment releases', async () => {
      const { adminDb } = await import('@/lib/firebase-admin');
      const docMock = (adminDb.collection as any)().doc;
      const createMock = docMock().create;

      const confirmation: HumanConfirmation = {
        certifierUid: 'qs-1',
        certifierRole: 'quantity_surveyor',
        approverUid: 'admin-1',
        approverRole: 'platform_finance_admin',
      };

      const input: ImmutableAuditRecordInput = {
        actorUid: 'admin-1',
        actorRole: 'platform_finance_admin',
        action: 'payment_released',
        timestampIso: '2026-06-15T10:00:00.000Z',
        monetaryAmount: { currency: 'ZAR', amount: 75000 },
        targetResourceId: 'release-1',
        evidenceReferences: [
          { type: 'provider_transaction', referenceId: 'tx-1' },
          { type: 'certificate', referenceId: 'cert-1' },
        ],
        humanConfirmation: confirmation,
      };

      await writeImmutableAuditRecord(input);

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          humanConfirmation: confirmation,
        }),
      );
    });
  });

  describe('rejectAuditMutation', () => {
    it('returns a 403 status', async () => {
      const result = await rejectAuditMutation('user-bad', 'audit-123', 'update');

      expect(result.status).toBe(403);
    });

    it('returns an error message referencing the operation and target', async () => {
      const result = await rejectAuditMutation('user-bad', 'audit-123', 'delete');

      expect(result.error).toContain('delete');
      expect(result.error).toContain('audit-123');
      expect(result.error).toContain('denied');
    });

    it('writes a tamper_attempt audit record', async () => {
      const { adminDb } = await import('@/lib/firebase-admin');
      const docMock = (adminDb.collection as any)().doc;
      const createMock = docMock().create;

      await rejectAuditMutation('attacker-uid', 'audit-target-456', 'update');

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUid: 'attacker-uid',
          action: 'tamper_attempt',
          targetResourceId: 'audit-target-456',
          immutable: true,
        }),
      );
    });

    it('returns the tamperAuditId of the created record', async () => {
      const result = await rejectAuditMutation('user-x', 'record-y', 'delete');

      expect(result.tamperAuditId).toBeTruthy();
      expect(typeof result.tamperAuditId).toBe('string');
    });

    it('records the attempted operation in newState', async () => {
      const { adminDb } = await import('@/lib/firebase-admin');
      const docMock = (adminDb.collection as any)().doc;
      const createMock = docMock().create;

      await rejectAuditMutation('user-x', 'record-y', 'delete');

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          previousState: 'immutable',
          newState: 'attempted_delete',
        }),
      );
    });
  });

  describe('Legacy helpers (backward compatibility)', () => {
    it('createAuditEntry produces a FinanceAuditRecord', () => {
      const entry = createAuditEntry('id-1', 'test_action', 'some notes', 'client');
      expect(entry.auditId).toBe('id-1');
      expect(entry.action).toBe('test_action');
      expect(entry.notes).toBe('some notes');
      expect(entry.actorRole).toBe('client');
      expect(entry.timestampIso).toBeTruthy();
    });

    it('auditProviderWebhook creates a webhook audit record', () => {
      const entry = auditProviderWebhook('provider-1', 'ref-123', 'paid', 'Success');
      expect(entry.action).toContain('provider_webhook_paid');
      expect(entry.notes).toContain('provider-1');
      expect(entry.notes).toContain('ref-123');
    });

    it('auditDispute creates a dispute audit record', () => {
      const entry = auditDispute('claim-1', 50000, 'Work not complete', 'client');
      expect(entry.action).toBe('claim_disputed');
      expect(entry.notes).toContain('50000');
      expect(entry.notes).toContain('Work not complete');
    });

    it('auditRetention creates a retention audit record', () => {
      const entry = auditRetention('ret-1', 'held', 25000, 'quantity_surveyor');
      expect(entry.action).toBe('retention_held');
      expect(entry.notes).toContain('25000');
    });
  });
});
