/**
 * Tests for Agent Memory Boundary Service — Pack 14
 */
import { describe, expect, it } from 'vitest';
import {
  createDefaultMemoryPolicy,
  createMemoryRecord,
  accessMemoryRecord,
  enforceTenantIsolation,
  validateTenantScope,
  isExpired,
  purgeExpiredRecords,
  isSensitiveData,
  redactSensitiveValue,
  enforceMemoryLimit,
  verifyMemoryConsent,
} from '../agentMemoryBoundaryService';
import type { MemoryStore } from '../agentMemoryBoundaryService';

describe('agentMemoryBoundaryService', () => {
  describe('createDefaultMemoryPolicy', () => {
    it('creates policy with POPIA-compliant defaults', () => {
      const policy = createDefaultMemoryPolicy('t1');
      expect(policy.tenantId).toBe('t1');
      expect(policy.maxRecordsPerAgent).toBe(1000);
      expect(policy.defaultRetention).toBe('90d');
      expect(policy.allowCrossTenantAccess).toBe(false);
      expect(policy.requireExplicitConsent).toBe(true);
    });

    it('allows overrides for max records', () => {
      const policy = createDefaultMemoryPolicy('t1', { maxRecordsPerAgent: 500 });
      expect(policy.maxRecordsPerAgent).toBe(500);
    });
  });

  describe('createMemoryRecord', () => {
    it('creates record with expiry', () => {
      const record = createMemoryRecord({
        tenantId: 't1', agentId: 'a1', scope: 'user',
        scopeId: 'u1', key: 'preference', value: { theme: 'dark' },
        retention: '30d',
      });

      expect(record.tenantId).toBe('t1');
      expect(record.key).toBe('preference');
      expect(record.expiresAt).toBeTruthy();
      expect(record.accessCount).toBe(0);
    });

    it('creates permanent record with no expiry', () => {
      const record = createMemoryRecord({
        tenantId: 't1', agentId: 'a1', scope: 'platform',
        scopeId: 'platform', key: 'config', value: {},
        retention: 'permanent',
      });

      expect(record.expiresAt).toBeUndefined();
    });
  });

  describe('accessMemoryRecord', () => {
    it('increments access count and sets last accessed', () => {
      const record = createMemoryRecord({
        tenantId: 't1', agentId: 'a1', scope: 'user',
        scopeId: 'u1', key: 'data', value: 'test',
      });

      const accessed = accessMemoryRecord(record);
      expect(accessed.accessCount).toBe(1);
      expect(accessed.lastAccessedAt).toBeTruthy();
    });
  });

  describe('enforceTenantIsolation', () => {
    it('throws on cross-tenant access when not allowed', () => {
      const record = createMemoryRecord({
        tenantId: 't1', agentId: 'a1', scope: 'user',
        scopeId: 'u1', key: 'data', value: 'secret',
      });
      const policy = createDefaultMemoryPolicy('t1');

      expect(() => enforceTenantIsolation(record, 't2', policy)).toThrow(
        'Memory boundary violation',
      );
    });

    it('allows cross-tenant with warning when policy permits', () => {
      const record = createMemoryRecord({
        tenantId: 't1', agentId: 'a1', scope: 'user',
        scopeId: 'u1', key: 'data', value: 'shared',
      });
      const policy = createDefaultMemoryPolicy('t1', { allowCrossTenantAccess: true });

      // Should not throw
      expect(() => enforceTenantIsolation(record, 't2', policy)).not.toThrow();
    });

    it('passes for matching tenant', () => {
      const record = createMemoryRecord({
        tenantId: 't1', agentId: 'a1', scope: 'user',
        scopeId: 'u1', key: 'data', value: 'ok',
      });
      const policy = createDefaultMemoryPolicy('t1');

      expect(() => enforceTenantIsolation(record, 't1', policy)).not.toThrow();
    });
  });

  describe('validateTenantScope', () => {
    it('filters cross-tenant records', () => {
      const records = [
        createMemoryRecord({ tenantId: 't1', agentId: 'a1', scope: 'user', scopeId: 'u1', key: 'k1', value: 'v1' }),
        createMemoryRecord({ tenantId: 't2', agentId: 'a2', scope: 'user', scopeId: 'u2', key: 'k2', value: 'v2' }),
        createMemoryRecord({ tenantId: 't1', agentId: 'a3', scope: 'project', scopeId: 'p1', key: 'k3', value: 'v3' }),
      ];
      const policy = createDefaultMemoryPolicy('t1');

      const filtered = validateTenantScope(records, 't1', policy);
      expect(filtered).toHaveLength(2);
      expect(filtered.every((r) => r.tenantId === 't1')).toBe(true);
    });
  });

  describe('isExpired', () => {
    it('returns true for expired records', () => {
      const record = createMemoryRecord({
        tenantId: 't1', agentId: 'a1', scope: 'user', scopeId: 'u1',
        key: 'old', value: 'data', retention: '7d',
      });
      // Manually set expiry to past
      const expired = { ...record, expiresAt: '2020-01-01T00:00:00.000Z' };
      expect(isExpired(expired)).toBe(true);
    });

    it('returns false for non-expired records', () => {
      const record = createMemoryRecord({
        tenantId: 't1', agentId: 'a1', scope: 'user', scopeId: 'u1',
        key: 'current', value: 'data',
      });
      expect(isExpired(record)).toBe(false);
    });
  });

  describe('purgeExpiredRecords', () => {
    it('removes expired records from store', () => {
      const store: MemoryStore = { records: new Map() };
      store.records.set('a1', [
        createMemoryRecord({ tenantId: 't1', agentId: 'a1', scope: 'user', scopeId: 'u1', key: 'active', value: 1 }),
        { ...createMemoryRecord({ tenantId: 't1', agentId: 'a1', scope: 'user', scopeId: 'u1', key: 'expired', value: 2 }), expiresAt: '2020-01-01T00:00:00.000Z' },
      ]);

      const purged = purgeExpiredRecords(store);
      expect(purged).toBe(1);
      expect(store.records.get('a1')).toHaveLength(1);
    });
  });

  describe('isSensitiveData', () => {
    it('detects sensitive keys', () => {
      const policy = createDefaultMemoryPolicy('t1');
      expect(isSensitiveData('password', policy)).toBe(true);
      expect(isSensitiveData('user_token', policy)).toBe(true);
      expect(isSensitiveData('bank_account', policy)).toBe(true);
      expect(isSensitiveData('user_preference', policy)).toBe(false);
    });
  });

  describe('redactSensitiveValue', () => {
    it('redacts sensitive string values', () => {
      const policy = createDefaultMemoryPolicy('t1');
      const result = redactSensitiveValue('password', 'mysecret123', policy);
      expect(result).toBe('mys***REDACTED***');
    });

    it('redacts sensitive non-string values', () => {
      const policy = createDefaultMemoryPolicy('t1');
      const result = redactSensitiveValue('id_number', 123456789, policy);
      expect(result).toBe('***REDACTED***');
    });

    it('returns value unchanged for non-sensitive keys', () => {
      const policy = createDefaultMemoryPolicy('t1');
      expect(redactSensitiveValue('theme', 'dark', policy)).toBe('dark');
    });
  });

  describe('enforceMemoryLimit', () => {
    it('removes oldest records when limit exceeded', () => {
      const store: MemoryStore = { records: new Map() };
      const policy = createDefaultMemoryPolicy('t1', { maxRecordsPerAgent: 3 });

      const records = Array.from({ length: 5 }, (_, i) =>
        createMemoryRecord({
          tenantId: 't1', agentId: 'a1', scope: 'user', scopeId: 'u1',
          key: `k${i}`, value: i,
        }),
      );

      store.records.set('a1', records);
      enforceMemoryLimit(store, 'a1', policy);

      const remaining = store.records.get('a1')!;
      expect(remaining.length).toBeLessThanOrEqual(3);
    });
  });

  describe('verifyMemoryConsent', () => {
    it('requires consent when policy mandates it', () => {
      const policy = createDefaultMemoryPolicy('t1');
      const result = verifyMemoryConsent(policy, false);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('POPIA');
    });

    it('allows when user has consented', () => {
      const policy = createDefaultMemoryPolicy('t1');
      const result = verifyMemoryConsent(policy, true);
      expect(result.allowed).toBe(true);
    });

    it('allows when policy does not require consent', () => {
      const policy = createDefaultMemoryPolicy('t1', { requireExplicitConsent: false });
      const result = verifyMemoryConsent(policy, false);
      expect(result.allowed).toBe(true);
    });
  });
});
