/**
 * Unit tests for configVersioningService
 *
 * Tests: ConfigVersion interface, createConfigVersion validation, validateTariffEffectiveDate,
 * preventDeletion, and getVersionHistory.
 *
 * @requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  validateTariffEffectiveDate,
  preventDeletion,
  createConfigVersion,
  getVersionHistory,
} from '../configVersioningService';
import type { ConfigVersion, ConfigType } from '../configVersioningService';

// Mock Firebase Admin SDK
vi.mock('@/lib/firebase-admin', () => {
  const createMock = vi.fn().mockResolvedValue(undefined);
  const docMock = vi.fn().mockReturnValue({ create: createMock });
  const getMock = vi.fn().mockResolvedValue({ docs: [] });
  const limitMock = vi.fn().mockReturnValue({ get: getMock });
  const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
  const whereMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
  const collectionMock = vi.fn().mockReturnValue({ doc: docMock, where: whereMock });

  return {
    adminDb: {
      collection: collectionMock,
    },
    __mocks: { collectionMock, docMock, createMock, whereMock, orderByMock, limitMock, getMock },
  };
});

describe('configVersioningService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── validateTariffEffectiveDate ────────────────────────────────────────────

  describe('validateTariffEffectiveDate', () => {
    it('returns true for today\'s date', () => {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      expect(validateTariffEffectiveDate(todayStr)).toBe(true);
    });

    it('returns true for a future date', () => {
      const future = new Date();
      future.setFullYear(future.getFullYear() + 1);
      const futureStr = future.toISOString().split('T')[0];
      expect(validateTariffEffectiveDate(futureStr)).toBe(true);
    });

    it('returns false for a past date', () => {
      const past = new Date();
      past.setDate(past.getDate() - 1);
      const pastStr = past.toISOString().split('T')[0];
      expect(validateTariffEffectiveDate(pastStr)).toBe(false);
    });

    it('returns false for an invalid date string', () => {
      expect(validateTariffEffectiveDate('not-a-date')).toBe(false);
    });

    it('returns true for a full ISO timestamp in the future', () => {
      const future = new Date();
      future.setDate(future.getDate() + 30);
      expect(validateTariffEffectiveDate(future.toISOString())).toBe(true);
    });
  });

  // ─── preventDeletion ────────────────────────────────────────────────────────

  describe('preventDeletion', () => {
    it('throws an error for any version ID', () => {
      expect(() => preventDeletion('version-123')).toThrow(
        /Deletion denied.*version-123.*cannot be deleted/
      );
    });

    it('includes audit retention messaging in the error', () => {
      expect(() => preventDeletion('abc')).toThrow(/append-only/);
    });
  });

  // ─── createConfigVersion ────────────────────────────────────────────────────

  describe('createConfigVersion', () => {
    it('creates a feature_flag version without requiring reason or effectiveDate', async () => {
      const result = await createConfigVersion(
        'enable_dark_mode',
        'feature_flag',
        false,
        true,
        'admin-uid-1',
      );

      expect(result.configKey).toBe('enable_dark_mode');
      expect(result.configType).toBe('feature_flag');
      expect(result.previousValue).toBe(false);
      expect(result.newValue).toBe(true);
      expect(result.modifierUid).toBe('admin-uid-1');
      expect(result.versionId).toBeDefined();
      expect(result.timestampIso).toBeDefined();
    });

    it('creates a tariff_rule version with valid future effectiveDate', async () => {
      const future = new Date();
      future.setDate(future.getDate() + 7);
      const futureStr = future.toISOString().split('T')[0];

      const result = await createConfigVersion(
        'standard_fee_rate',
        'tariff_rule',
        { percent: 5 },
        { percent: 7 },
        'admin-uid-2',
        undefined,
        futureStr,
      );

      expect(result.configType).toBe('tariff_rule');
      expect(result.effectiveDate).toBe(futureStr);
    });

    it('rejects tariff_rule with past effective date', async () => {
      const past = new Date();
      past.setDate(past.getDate() - 5);
      const pastStr = past.toISOString().split('T')[0];

      await expect(
        createConfigVersion('rule_x', 'tariff_rule', 1, 2, 'admin', undefined, pastStr),
      ).rejects.toThrow(/past/i);
    });

    it('rejects tariff_rule without effective date', async () => {
      await expect(
        createConfigVersion('rule_x', 'tariff_rule', 1, 2, 'admin'),
      ).rejects.toThrow(/requires an effective date/i);
    });

    it('rejects payment_rate without reason', async () => {
      await expect(
        createConfigVersion('rate_a', 'payment_rate', 100, 120, 'admin'),
      ).rejects.toThrow(/requires a documented reason/i);
    });

    it('rejects payment_rate with reason shorter than 10 characters', async () => {
      await expect(
        createConfigVersion('rate_a', 'payment_rate', 100, 120, 'admin', 'short'),
      ).rejects.toThrow(/at least 10 characters/i);
    });

    it('accepts payment_rate with valid reason (≥10 chars)', async () => {
      const result = await createConfigVersion(
        'rate_a',
        'payment_rate',
        100,
        120,
        'admin-uid-3',
        'Adjusting for inflation Q3 2026',
      );

      expect(result.configType).toBe('payment_rate');
      expect(result.reason).toBe('Adjusting for inflation Q3 2026');
    });

    it('rejects ai_prompt without reason', async () => {
      await expect(
        createConfigVersion('compliance_prompt', 'ai_prompt', 'old', 'new', 'admin'),
      ).rejects.toThrow(/requires a documented reason/i);
    });

    it('accepts ai_prompt with valid reason (≥10 chars)', async () => {
      const result = await createConfigVersion(
        'compliance_prompt',
        'ai_prompt',
        'old prompt text',
        'new prompt text',
        'admin-uid-4',
        'Improving compliance accuracy for SANS 10400-K',
      );

      expect(result.configType).toBe('ai_prompt');
      expect(result.reason).toBe('Improving compliance accuracy for SANS 10400-K');
    });

    it('writes the version record to Firestore via Admin SDK', async () => {
      const { adminDb } = await import('@/lib/firebase-admin');

      await createConfigVersion(
        'flag_x',
        'feature_flag',
        false,
        true,
        'admin-uid-5',
      );

      expect(adminDb.collection).toHaveBeenCalledWith('config_versions');
      const docMock = (adminDb.collection as any)().doc;
      expect(docMock).toHaveBeenCalled();
      const createMock = docMock().create;
      expect(createMock).toHaveBeenCalled();

      const savedRecord = createMock.mock.calls[0][0];
      expect(savedRecord.configKey).toBe('flag_x');
      expect(savedRecord.configType).toBe('feature_flag');
      expect(savedRecord.immutable).toBeUndefined(); // immutable is on audit records, not config versions
    });
  });

  // ─── getVersionHistory ──────────────────────────────────────────────────────

  describe('getVersionHistory', () => {
    it('queries Firestore for the config key in reverse-chronological order', async () => {
      const { adminDb } = await import('@/lib/firebase-admin');

      await getVersionHistory('my_config_key', 25);

      expect(adminDb.collection).toHaveBeenCalledWith('config_versions');
      const whereMock = (adminDb.collection as any)().where;
      expect(whereMock).toHaveBeenCalledWith('configKey', '==', 'my_config_key');

      const orderByMock = whereMock().orderBy;
      expect(orderByMock).toHaveBeenCalledWith('timestampIso', 'desc');

      const limitMock = orderByMock().limit;
      expect(limitMock).toHaveBeenCalledWith(25);
    });

    it('defaults limit to 50 when not specified', async () => {
      const { adminDb } = await import('@/lib/firebase-admin');

      await getVersionHistory('some_key');

      const whereMock = (adminDb.collection as any)().where;
      const orderByMock = whereMock().orderBy;
      const limitMock = orderByMock().limit;
      expect(limitMock).toHaveBeenCalledWith(50);
    });

    it('returns version records from Firestore docs', async () => {
      const { adminDb } = await import('@/lib/firebase-admin');
      const mockDocs = [
        { data: () => ({ versionId: 'v2', configKey: 'key', timestampIso: '2026-06-02T00:00:00Z' }) },
        { data: () => ({ versionId: 'v1', configKey: 'key', timestampIso: '2026-06-01T00:00:00Z' }) },
      ];
      const whereMock = (adminDb.collection as any)().where;
      const orderByMock = whereMock().orderBy;
      const limitMock = orderByMock().limit;
      limitMock().get.mockResolvedValueOnce({ docs: mockDocs });

      const results = await getVersionHistory('key');
      expect(results).toHaveLength(2);
      expect(results[0].versionId).toBe('v2');
      expect(results[1].versionId).toBe('v1');
    });
  });

  // ─── ConfigVersion interface type checks ────────────────────────────────────

  describe('ConfigVersion interface', () => {
    it('supports all four config types', () => {
      const types: ConfigType[] = ['feature_flag', 'tariff_rule', 'payment_rate', 'ai_prompt'];
      expect(types).toHaveLength(4);
    });

    it('allows generic typing for values', () => {
      const boolVersion: ConfigVersion<boolean> = {
        versionId: 'v1',
        configKey: 'flag',
        configType: 'feature_flag',
        previousValue: false,
        newValue: true,
        modifierUid: 'uid',
        timestampIso: '2026-01-01T00:00:00Z',
      };
      expect(boolVersion.previousValue).toBe(false);
      expect(boolVersion.newValue).toBe(true);
    });
  });
});
