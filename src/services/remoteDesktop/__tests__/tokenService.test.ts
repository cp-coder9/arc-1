/**
 * Token Service — Unit & Property-Based Tests
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 *
 * Property 2 — Token Validity Bound:
 *   ∀ token: SessionToken, (expiresAt - issuedAt) <= 24h
 *
 * Property 3 — Token Signature Round-Trip:
 *   ∀ payload, secret: verifyToken(signToken(payload, secret), secret) === true
 *   ∀ payload, tampered ≠ payload: verifyToken({...signToken(payload, secret), payload: tampered}, secret) === false
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fc from 'fast-check';
import {
  generateSessionToken,
  verifySessionToken,
  consumeToken,
  revokeToken,
  isTokenExpired,
  deriveReconnectionToken,
  getTokenStore,
  clearTokenStore,
  stopCleanupInterval,
  rotateSecret,
  type GenerateTokenInput,
} from '../tokenService';

// ─── Test Helpers ───────────────────────────────────────────────────────────────

function createValidInput(overrides?: Partial<GenerateTokenInput>): GenerateTokenInput {
  const now = Date.now();
  return {
    bookingId: 'booking-test-001',
    consumerUid: 'consumer-test-abc',
    hostId: 'host-test-xyz',
    windowStart: now + 60_000,       // starts in 1 minute
    windowEnd: now + 3_600_000,      // ends in 1 hour
    gracePeriodSeconds: 300,          // 5 minutes
    recordingRequired: false,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('Token Service', () => {

  beforeEach(() => {
    clearTokenStore();
  });

  afterAll(() => {
    stopCleanupInterval();
  });

  // ─── Token Generation ─────────────────────────────────────────────────────────

  describe('generateSessionToken', () => {
    it('should produce a valid session token with all fields', () => {
      const input = createValidInput();
      const token = generateSessionToken(input);

      expect(token.tokenId).toBeDefined();
      expect(token.tokenId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(token.bookingId).toBe(input.bookingId);
      expect(token.consumerUid).toBe(input.consumerUid);
      expect(token.hostId).toBe(input.hostId);
      expect(token.gracePeriodSeconds).toBe(input.gracePeriodSeconds);
      expect(token.recordingRequired).toBe(false);
      expect(token.signature).toBeDefined();
      expect(token.signature.length).toBe(64); // HMAC-SHA256 hex = 64 chars
      expect(token.expiresAt).toBeDefined();
      expect(token.consumed).toBe(false);
    });

    it('should include recordingRequired flag when true', () => {
      const input = createValidInput({ recordingRequired: true });
      const token = generateSessionToken(input);
      expect(token.recordingRequired).toBe(true);
    });

    it('should store the token in the in-memory store', () => {
      const input = createValidInput();
      const token = generateSessionToken(input);

      const store = getTokenStore();
      expect(store.has(token.tokenId)).toBe(true);

      const entry = store.get(token.tokenId)!;
      expect(entry.consumed).toBe(false);
      expect(entry.activeConnectionCount).toBe(0);
    });

    it('should reject missing bookingId', () => {
      const input = createValidInput({ bookingId: '' });
      expect(() => generateSessionToken(input)).toThrow('Missing required fields');
    });

    it('should reject missing consumerUid', () => {
      const input = createValidInput({ consumerUid: '' });
      expect(() => generateSessionToken(input)).toThrow('Missing required fields');
    });

    it('should reject missing hostId', () => {
      const input = createValidInput({ hostId: '' });
      expect(() => generateSessionToken(input)).toThrow('Missing required fields');
    });

    it('should reject when windowEnd <= windowStart', () => {
      const now = Date.now();
      const input = createValidInput({ windowStart: now + 1000, windowEnd: now });
      expect(() => generateSessionToken(input)).toThrow('Window end must be after window start');
    });

    it('should reject negative grace period', () => {
      const input = createValidInput({ gracePeriodSeconds: -1 });
      expect(() => generateSessionToken(input)).toThrow('Grace period must be non-negative');
    });

    it('should cap token validity at 24 hours (Req 7.1)', () => {
      const now = Date.now();
      // 48-hour booking window — should be capped at 24h
      const input = createValidInput({
        windowStart: now,
        windowEnd: now + 48 * 60 * 60 * 1000,
        gracePeriodSeconds: 900,
      });

      const token = generateSessionToken(input);
      const expiresAtMs = new Date(token.expiresAt).getTime();
      const store = getTokenStore();
      const entry = store.get(token.tokenId)!;
      const validity = expiresAtMs - entry.createdAt;

      expect(validity).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    });

    it('should produce HMAC-SHA256 signature (64 hex chars)', () => {
      const input = createValidInput();
      const token = generateSessionToken(input);

      // SHA-256 produces 32 bytes = 64 hex characters
      expect(token.signature).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  // ─── Token Verification ───────────────────────────────────────────────────────

  describe('verifySessionToken', () => {
    it('should succeed for a valid untampered token', () => {
      const input = createValidInput();
      const token = generateSessionToken(input);

      const result = verifySessionToken(token.tokenId, token.signature);

      expect(result.valid).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.token!.tokenId).toBe(token.tokenId);
    });

    it('should reject a non-existent token', () => {
      const result = verifySessionToken('non-existent-id', 'fake-signature');
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('invalid_token');
    });

    it('should reject a tampered signature', () => {
      const input = createValidInput();
      const token = generateSessionToken(input);

      const result = verifySessionToken(token.tokenId, 'tampered-signature-value');
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('invalid_token');
    });

    it('should reject an expired token (Req 7.3)', () => {
      const now = Date.now();
      // Create a token that expires immediately (1ms window, 0 grace)
      const input = createValidInput({
        windowStart: now - 2000,
        windowEnd: now - 1000,
        gracePeriodSeconds: 0,
      });
      const token = generateSessionToken(input);

      // Token should already be expired
      const result = verifySessionToken(token.tokenId, token.signature);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('expired_token');
    });
  });

  // ─── Single-Use (Consumed Flag) ───────────────────────────────────────────────

  describe('consumeToken', () => {
    it('should consume a fresh token successfully (Req 7.4)', () => {
      const input = createValidInput();
      const token = generateSessionToken(input);

      const consumed = consumeToken(token.tokenId);
      expect(consumed).toBe(true);

      // Verify it's marked consumed in the store
      const store = getTokenStore();
      const entry = store.get(token.tokenId)!;
      expect(entry.consumed).toBe(true);
      expect(entry.activeConnectionCount).toBe(1);
    });

    it('should reject reuse of a consumed token (Req 7.4)', () => {
      const input = createValidInput();
      const token = generateSessionToken(input);

      expect(consumeToken(token.tokenId)).toBe(true);
      expect(consumeToken(token.tokenId)).toBe(false);
    });

    it('should reject consumption of a non-existent token', () => {
      expect(consumeToken('non-existent-id')).toBe(false);
    });

    it('should reject consumption of an expired token', () => {
      const now = Date.now();
      const input = createValidInput({
        windowStart: now - 2000,
        windowEnd: now - 1000,
        gracePeriodSeconds: 0,
      });
      const token = generateSessionToken(input);

      expect(consumeToken(token.tokenId)).toBe(false);
    });
  });

  // ─── Duplicate Detection ──────────────────────────────────────────────────────

  describe('Duplicate Detection (Req 7.5)', () => {
    it('should reject second simultaneous use of the same token', () => {
      const input = createValidInput();
      const token = generateSessionToken(input);

      // Simulate first connection being active
      const store = getTokenStore() as Map<string, any>;
      const entry = store.get(token.tokenId)!;
      entry.activeConnectionCount = 1;

      // Second attempt should be rejected
      const result = consumeToken(token.tokenId);
      expect(result).toBe(false);
    });
  });

  // ─── Token Revocation ─────────────────────────────────────────────────────────

  describe('revokeToken', () => {
    it('should remove a token from the store', () => {
      const input = createValidInput();
      const token = generateSessionToken(input);

      expect(getTokenStore().has(token.tokenId)).toBe(true);
      const revoked = revokeToken(token.tokenId);
      expect(revoked).toBe(true);
      expect(getTokenStore().has(token.tokenId)).toBe(false);
    });

    it('should return false for non-existent token', () => {
      expect(revokeToken('non-existent-id')).toBe(false);
    });

    it('should cause subsequent verification to fail', () => {
      const input = createValidInput();
      const token = generateSessionToken(input);

      revokeToken(token.tokenId);

      const result = verifySessionToken(token.tokenId, token.signature);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('invalid_token');
    });
  });

  // ─── Token Expiry Check ───────────────────────────────────────────────────────

  describe('isTokenExpired', () => {
    it('should return false for a fresh token', () => {
      const input = createValidInput();
      const token = generateSessionToken(input);
      expect(isTokenExpired(token.tokenId)).toBe(false);
    });

    it('should return true for a non-existent token', () => {
      expect(isTokenExpired('non-existent-id')).toBe(true);
    });

    it('should return true for an expired token', () => {
      const now = Date.now();
      const input = createValidInput({
        windowStart: now - 2000,
        windowEnd: now - 1000,
        gracePeriodSeconds: 0,
      });
      const token = generateSessionToken(input);
      expect(isTokenExpired(token.tokenId)).toBe(true);
    });
  });

  // ─── Reconnection Token Derivation ────────────────────────────────────────────

  describe('deriveReconnectionToken', () => {
    it('should derive a reconnection token from a consumed original', () => {
      const input = createValidInput();
      const token = generateSessionToken(input);
      consumeToken(token.tokenId);

      const reconnection = deriveReconnectionToken(token.tokenId, 'session-001');
      expect(reconnection).not.toBeNull();
      expect(reconnection!.originalTokenId).toBe(token.tokenId);
      expect(reconnection!.sessionId).toBe('session-001');
      expect(reconnection!.tokenId).toBeDefined();
      expect(reconnection!.tokenId).not.toBe(token.tokenId); // Different from original
      expect(reconnection!.signature).toBeDefined();
      expect(reconnection!.expiresAt).toBe(token.expiresAt);
    });

    it('should produce deterministic results for same inputs', () => {
      const input = createValidInput();
      const token = generateSessionToken(input);
      consumeToken(token.tokenId);

      const r1 = deriveReconnectionToken(token.tokenId, 'session-001');
      const r2 = deriveReconnectionToken(token.tokenId, 'session-001');

      expect(r1!.tokenId).toBe(r2!.tokenId);
      expect(r1!.signature).toBe(r2!.signature);
    });

    it('should produce different results for different session IDs', () => {
      const input = createValidInput();
      const token = generateSessionToken(input);
      consumeToken(token.tokenId);

      const r1 = deriveReconnectionToken(token.tokenId, 'session-001');
      const r2 = deriveReconnectionToken(token.tokenId, 'session-002');

      expect(r1!.tokenId).not.toBe(r2!.tokenId);
      expect(r1!.signature).not.toBe(r2!.signature);
    });

    it('should return null for unconsumed token', () => {
      const input = createValidInput();
      const token = generateSessionToken(input);

      const reconnection = deriveReconnectionToken(token.tokenId, 'session-001');
      expect(reconnection).toBeNull();
    });

    it('should return null for non-existent token', () => {
      const reconnection = deriveReconnectionToken('non-existent', 'session-001');
      expect(reconnection).toBeNull();
    });

    it('should return null for expired token', () => {
      const now = Date.now();
      const input = createValidInput({
        windowStart: now - 2000,
        windowEnd: now - 1000,
        gracePeriodSeconds: 0,
      });
      const token = generateSessionToken(input);

      // Force consumed even though it would normally fail due to expiry
      const store = getTokenStore() as Map<string, any>;
      const entry = store.get(token.tokenId);
      if (entry) {
        entry.consumed = true;
      }

      const reconnection = deriveReconnectionToken(token.tokenId, 'session-001');
      expect(reconnection).toBeNull();
    });
  });

  // ─── Secret Rotation ──────────────────────────────────────────────────────────

  describe('rotateSecret', () => {
    it('should accept tokens signed with the old secret during rotation window', () => {
      const input = createValidInput();
      const token = generateSessionToken(input);
      const originalSignature = token.signature;

      // Rotate secret
      rotateSecret('new-secret-at-least-16-chars-long');

      // Token signed with old secret should still verify
      const result = verifySessionToken(token.tokenId, originalSignature);
      expect(result.valid).toBe(true);
    });

    it('should reject secrets shorter than 16 characters', () => {
      expect(() => rotateSecret('short')).toThrow('at least 16 characters');
    });

    it('should reject empty secret', () => {
      expect(() => rotateSecret('')).toThrow('at least 16 characters');
    });

    it('new tokens should use the new secret after rotation', () => {
      // Generate token with old secret
      const input1 = createValidInput({ bookingId: 'booking-1' });
      const token1 = generateSessionToken(input1);

      // Rotate
      rotateSecret('rotated-secret-for-new-tokens');

      // Generate token with new secret
      const input2 = createValidInput({ bookingId: 'booking-2' });
      const token2 = generateSessionToken(input2);

      // Both should verify
      expect(verifySessionToken(token1.tokenId, token1.signature).valid).toBe(true);
      expect(verifySessionToken(token2.tokenId, token2.signature).valid).toBe(true);

      // Signatures should be different (different secrets + different payloads)
      expect(token1.signature).not.toBe(token2.signature);
    });
  });

  // ─── TTL Store Cleanup ────────────────────────────────────────────────────────

  describe('TTL Store Cleanup (Req 7.2)', () => {
    it('should store tokens with expiry time', () => {
      const input = createValidInput();
      const token = generateSessionToken(input);

      const store = getTokenStore();
      const entry = store.get(token.tokenId)!;

      expect(entry.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should not persist tokens — store is in-memory only (Req 7.7)', () => {
      const input = createValidInput();
      generateSessionToken(input);

      // After clearing, token is gone
      clearTokenStore();
      expect(getTokenStore().size).toBe(0);
    });
  });

  // ─── Property-Based Tests ─────────────────────────────────────────────────────

  describe('Property-Based Tests', () => {

    /**
     * **Validates: Requirements 7.1**
     *
     * Property 2 — Token Validity Bound:
     * For all generated session tokens, the token validity duration never exceeds
     * 24 hours regardless of booking window length or grace period configuration.
     */
    it('Property 2: token validity never exceeds 24 hours', () => {
      const bookingHoursArb = fc.integer({ min: 1, max: 365 * 24 });
      const graceSecondsArb = fc.integer({ min: 0, max: 900 });

      fc.assert(
        fc.property(bookingHoursArb, graceSecondsArb, (bookingHours, gracePeriodSeconds) => {
          clearTokenStore();

          const now = Date.now();
          const windowStart = now;
          const windowEnd = now + bookingHours * 60 * 60 * 1000;

          const input: GenerateTokenInput = {
            bookingId: `booking-${bookingHours}`,
            consumerUid: 'consumer-prop',
            hostId: 'host-prop',
            windowStart,
            windowEnd,
            gracePeriodSeconds,
            recordingRequired: false,
          };

          const token = generateSessionToken(input);
          const store = getTokenStore();
          const entry = store.get(token.tokenId)!;

          const validityMs = entry.expiresAt - entry.createdAt;
          const twentyFourHoursMs = 24 * 60 * 60 * 1000;

          return validityMs <= twentyFourHoursMs && validityMs > 0;
        }),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements 7.6**
     *
     * Property 3 — Token Signature Round-Trip:
     * For all valid token payloads, signing and then verifying produces true.
     */
    it('Property 3a: signature round-trip succeeds for untampered tokens', () => {
      const inputArb = fc.record({
        bookingId: fc.uuid(),
        consumerUid: fc.uuid(),
        hostId: fc.uuid(),
        durationHours: fc.integer({ min: 1, max: 24 }),
        gracePeriodSeconds: fc.integer({ min: 0, max: 900 }),
        recordingRequired: fc.boolean(),
      });

      fc.assert(
        fc.property(inputArb, (params) => {
          clearTokenStore();

          const now = Date.now();
          const input: GenerateTokenInput = {
            bookingId: params.bookingId,
            consumerUid: params.consumerUid,
            hostId: params.hostId,
            windowStart: now,
            windowEnd: now + params.durationHours * 60 * 60 * 1000,
            gracePeriodSeconds: params.gracePeriodSeconds,
            recordingRequired: params.recordingRequired,
          };

          const token = generateSessionToken(input);
          const result = verifySessionToken(token.tokenId, token.signature);

          return result.valid === true;
        }),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements 7.6**
     *
     * Property 3 — Token Signature Round-Trip (tampered case):
     * For any tampered signature, verification produces false.
     */
    it('Property 3b: verification fails for tampered signature', () => {
      const tamperedSigArb = fc.hexaString({ minLength: 64, maxLength: 64 });
      const durationArb = fc.integer({ min: 1, max: 12 });

      fc.assert(
        fc.property(durationArb, tamperedSigArb, (durationHours, tamperedSig) => {
          clearTokenStore();

          const now = Date.now();
          const input: GenerateTokenInput = {
            bookingId: 'booking-tamper',
            consumerUid: 'consumer-tamper',
            hostId: 'host-tamper',
            windowStart: now,
            windowEnd: now + durationHours * 60 * 60 * 1000,
            gracePeriodSeconds: 300,
            recordingRequired: false,
          };

          const token = generateSessionToken(input);

          // Only test when tampered sig is actually different
          if (tamperedSig === token.signature) return true;

          const result = verifySessionToken(token.tokenId, tamperedSig);
          return result.valid === false;
        }),
        { numRuns: 200 },
      );
    });
  });

}); // end Token Service describe
