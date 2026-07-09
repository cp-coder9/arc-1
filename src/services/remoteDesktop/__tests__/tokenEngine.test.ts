/**
 * Token Engine — Unit Tests
 *
 * Comprehensive test coverage for session token generation,
 * validation, and revocation.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9
 *

 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateToken,
  validateToken,
  revokeToken,
  isTokenRevoked,
  _clearRevocationList,
  type GenerateTokenInput,
} from '../tokenEngine';

// ─── Test Helpers ───────────────────────────────────────────────────────────────

function createValidInput(): GenerateTokenInput {
  const now = Date.now();
  return {
    bookingId: 'booking-123',
    consumerUid: 'consumer-abc',
    hostId: 'host-xyz',
    windowStart: now + 60_000,      // starts in 1 minute
    windowEnd: now + 3_600_000,     // ends in 1 hour
    gracePeriodSeconds: 300,         // 5 minutes grace
  };
}

// ─── Token Generation ───────────────────────────────────────────────────────────

describe('Token Engine', () => {
  beforeEach(() => {
    _clearRevocationList();
  });

describe('Token Generation', () => {
  it('should produce a valid token with all required fields', () => {
    const input = createValidInput();
    const result = generateToken(input);

    expect(result.token).toBeDefined();
    expect(result.token).toContain('.');
    expect(result.payload).toBeDefined();

    // Verify all payload fields exist
    expect(result.payload.tid).toBeDefined();
    expect(result.payload.tid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    ); // UUIDv4 format
    expect(result.payload.bid).toBe(input.bookingId);
    expect(result.payload.cid).toBe(input.consumerUid);
    expect(result.payload.hid).toBe(input.hostId);
    expect(result.payload.ws).toBe(input.windowStart);
    expect(result.payload.we).toBe(input.windowEnd);
    expect(result.payload.gp).toBe(input.gracePeriodSeconds);
    expect(result.payload.iat).toBeGreaterThan(0);
    expect(result.payload.iat).toBeLessThanOrEqual(Date.now());
  });

  it('should produce wire format: base64url(payload).base64url(signature)', () => {
    const input = createValidInput();
    const result = generateToken(input);

    const parts = result.token.split('.');
    expect(parts).toHaveLength(2);

    // Both parts should be valid base64url (no +, /, or = characters)
    for (const part of parts) {
      expect(part).not.toMatch(/[+/=]/);
      expect(part.length).toBeGreaterThan(0);
    }
  });

  it('should produce tokens of approximately 200 bytes', () => {
    const input = createValidInput();
    const result = generateToken(input);

    // Token should be roughly 200 bytes (payload ~130 + separator + signature ~43)
    expect(result.token.length).toBeLessThan(400);
    expect(result.token.length).toBeGreaterThan(50);
  });

  it('should generate unique token IDs for each call', () => {
    const input = createValidInput();
    const result1 = generateToken(input);
    const result2 = generateToken(input);

    expect(result1.payload.tid).not.toBe(result2.payload.tid);
    expect(result1.token).not.toBe(result2.token);
  });

  it('should reject missing bookingId', () => {
    const input = createValidInput();
    input.bookingId = '';

    expect(() => generateToken(input)).toThrow();
    try {
      generateToken(input);
    } catch (error: any) {
      expect(error.code).toBe('token_generation_failed');
      expect(error.retryable).toBe(true);
    }
  });

  it('should reject missing consumerUid', () => {
    const input = createValidInput();
    input.consumerUid = '';

    expect(() => generateToken(input)).toThrow();
    try {
      generateToken(input);
    } catch (error: any) {
      expect(error.code).toBe('token_generation_failed');
    }
  });

  it('should reject missing hostId', () => {
    const input = createValidInput();
    input.hostId = '';

    expect(() => generateToken(input)).toThrow();
    try {
      generateToken(input);
    } catch (error: any) {
      expect(error.code).toBe('token_generation_failed');
    }
  });

  it('should reject when windowEnd <= windowStart', () => {
    const input = createValidInput();
    input.windowEnd = input.windowStart - 1000;

    expect(() => generateToken(input)).toThrow();
    try {
      generateToken(input);
    } catch (error: any) {
      expect(error.code).toBe('token_generation_failed');
      expect(error.message).toContain('Window end must be after window start');
    }
  });

  it('should reject grace period below 60 seconds (1 minute)', () => {
    const input = createValidInput();
    input.gracePeriodSeconds = 59;

    expect(() => generateToken(input)).toThrow();
    try {
      generateToken(input);
    } catch (error: any) {
      expect(error.code).toBe('token_generation_failed');
      expect(error.message).toContain('Grace period must be between');
    }
  });

  it('should reject grace period above 1800 seconds (30 minutes)', () => {
    const input = createValidInput();
    input.gracePeriodSeconds = 1801;

    expect(() => generateToken(input)).toThrow();
    try {
      generateToken(input);
    } catch (error: any) {
      expect(error.code).toBe('token_generation_failed');
    }
  });

  it('should accept grace period at exactly 60 seconds (min boundary)', () => {
    const input = createValidInput();
    input.gracePeriodSeconds = 60;

    const result = generateToken(input);
    expect(result.payload.gp).toBe(60);
  });

  it('should accept grace period at exactly 1800 seconds (max boundary)', () => {
    const input = createValidInput();
    input.gracePeriodSeconds = 1800;

    const result = generateToken(input);
    expect(result.payload.gp).toBe(1800);
  });
});

// ─── Token Validation ───────────────────────────────────────────────────────────

describe('Token Validation', () => {
  it('should succeed for a valid, non-expired token within the connection window', () => {
    const input = createValidInput();
    const now = Date.now();
    // Window starts in 10 minutes (within the 15-minute early buffer)
    input.windowStart = now + 10 * 60_000;
    input.windowEnd = now + 70 * 60_000;

    const { token, payload } = generateToken(input);

    const result = validateToken({
      token,
      consumerUid: input.consumerUid,
      hostId: input.hostId,
      currentTime: now,
    });

    expect(result.valid).toBe(true);
    expect(result.payload).toBeDefined();
    expect(result.payload!.tid).toBe(payload.tid);
    expect(result.payload!.bid).toBe(input.bookingId);
    expect(result.error).toBeUndefined();
  });

  it('should succeed when current time is exactly at window start', () => {
    const input = createValidInput();
    const { token } = generateToken(input);

    const result = validateToken({
      token,
      consumerUid: input.consumerUid,
      hostId: input.hostId,
      currentTime: input.windowStart,
    });

    expect(result.valid).toBe(true);
  });

  it('should succeed during the grace period after window end', () => {
    const input = createValidInput();
    const { token } = generateToken(input);

    // Current time is 2 minutes after window end (within 5-min grace)
    const result = validateToken({
      token,
      consumerUid: input.consumerUid,
      hostId: input.hostId,
      currentTime: input.windowEnd + 2 * 60_000,
    });

    expect(result.valid).toBe(true);
  });

  it('should reject a tampered payload (invalid signature)', () => {
    const input = createValidInput();
    const { token } = generateToken(input);

    // Tamper with the payload part
    const parts = token.split('.');
    const tamperedPayload = parts[0] + 'TAMPERED';
    const tamperedToken = `${tamperedPayload}.${parts[1]}`;

    const result = validateToken({
      token: tamperedToken,
      consumerUid: input.consumerUid,
      hostId: input.hostId,
      currentTime: input.windowStart,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe('invalid_token');
    expect(result.error!.message).toContain('signature');
  });

  it('should reject a token with tampered signature', () => {
    const input = createValidInput();
    const { token } = generateToken(input);

    // Replace signature with garbage
    const parts = token.split('.');
    const tamperedToken = `${parts[0]}.invalidSignatureHere`;

    const result = validateToken({
      token: tamperedToken,
      consumerUid: input.consumerUid,
      hostId: input.hostId,
      currentTime: input.windowStart,
    });

    expect(result.valid).toBe(false);
    expect(result.error!.code).toBe('invalid_token');
  });

  it('should reject a malformed token (no dot separator)', () => {
    const result = validateToken({
      token: 'no-dot-separator-here',
      consumerUid: 'consumer-abc',
      hostId: 'host-xyz',
      currentTime: Date.now(),
    });

    expect(result.valid).toBe(false);
    expect(result.error!.code).toBe('invalid_token');
    expect(result.error!.message).toContain('Malformed token');
  });

  it('should reject a token with multiple dots', () => {
    const result = validateToken({
      token: 'part1.part2.part3',
      consumerUid: 'consumer-abc',
      hostId: 'host-xyz',
      currentTime: Date.now(),
    });

    expect(result.valid).toBe(false);
    expect(result.error!.code).toBe('invalid_token');
  });

  it('should reject an expired token (past window end + grace period)', () => {
    const input = createValidInput();
    const { token } = generateToken(input);

    // Current time is after window end + grace period
    const expiredTime = input.windowEnd + (input.gracePeriodSeconds * 1000) + 1;

    const result = validateToken({
      token,
      consumerUid: input.consumerUid,
      hostId: input.hostId,
      currentTime: expiredTime,
    });

    expect(result.valid).toBe(false);
    expect(result.error!.code).toBe('invalid_token');
    expect(result.error!.message).toContain('expired');
  });

  it('should reject connection before window start minus 15 minutes', () => {
    const now = Date.now();
    const input = createValidInput();
    input.windowStart = now + 30 * 60_000; // Window starts in 30 minutes
    input.windowEnd = now + 90 * 60_000;

    const { token } = generateToken(input);

    // Try connecting now (30 min before start, exceeds 15-min buffer)
    const result = validateToken({
      token,
      consumerUid: input.consumerUid,
      hostId: input.hostId,
      currentTime: now,
    });

    expect(result.valid).toBe(false);
    expect(result.error!.code).toBe('session_not_started');
    expect(result.error!.message).toContain('not started');
  });

  it('should allow connection exactly 15 minutes before window start', () => {
    const now = Date.now();
    const input = createValidInput();
    input.windowStart = now + 15 * 60_000; // Window starts in exactly 15 min
    input.windowEnd = now + 75 * 60_000;

    const { token } = generateToken(input);

    // Connect exactly at the earliest allowed time
    const result = validateToken({
      token,
      consumerUid: input.consumerUid,
      hostId: input.hostId,
      currentTime: now,
    });

    expect(result.valid).toBe(true);
  });

  it('should reject wrong consumer UID with token_scope_violation', () => {
    const input = createValidInput();
    const { token } = generateToken(input);

    const result = validateToken({
      token,
      consumerUid: 'wrong-consumer',
      hostId: input.hostId,
      currentTime: input.windowStart,
    });

    expect(result.valid).toBe(false);
    expect(result.error!.code).toBe('token_scope_violation');
    expect(result.error!.message).toContain('consumer');
  });

  it('should reject wrong host ID with token_scope_violation', () => {
    const input = createValidInput();
    const { token } = generateToken(input);

    const result = validateToken({
      token,
      consumerUid: input.consumerUid,
      hostId: 'wrong-host',
      currentTime: input.windowStart,
    });

    expect(result.valid).toBe(false);
    expect(result.error!.code).toBe('token_scope_violation');
    expect(result.error!.message).toContain('host');
  });

  it('should reject a revoked token', () => {
    const input = createValidInput();
    const { token, payload } = generateToken(input);

    // Revoke the token
    revokeToken(payload.tid);

    const result = validateToken({
      token,
      consumerUid: input.consumerUid,
      hostId: input.hostId,
      currentTime: input.windowStart,
    });

    expect(result.valid).toBe(false);
    expect(result.error!.code).toBe('invalid_token');
    expect(result.error!.message).toContain('revoked');
  });

  it('should use current time when currentTime is not provided', () => {
    const now = Date.now();
    const input = createValidInput();
    // Set window to encompass current time
    input.windowStart = now - 5 * 60_000; // Started 5 min ago
    input.windowEnd = now + 55 * 60_000;  // Ends in 55 min

    const { token } = generateToken(input);

    const result = validateToken({
      token,
      consumerUid: input.consumerUid,
      hostId: input.hostId,
    });

    expect(result.valid).toBe(true);
  });
});

// ─── Token Revocation ───────────────────────────────────────────────────────────

describe('Token Revocation', () => {
  it('should revoke a token by ID', () => {
    const input = createValidInput();
    const { payload } = generateToken(input);

    expect(isTokenRevoked(payload.tid)).toBe(false);

    revokeToken(payload.tid);

    expect(isTokenRevoked(payload.tid)).toBe(true);
  });

  it('should handle revoking the same token twice gracefully', () => {
    const tokenId = 'test-token-id';

    revokeToken(tokenId);
    revokeToken(tokenId);

    expect(isTokenRevoked(tokenId)).toBe(true);
  });

  it('should not affect other tokens when one is revoked', () => {
    const input1 = createValidInput();
    const input2 = createValidInput();
    input2.bookingId = 'booking-456';

    const { payload: payload1 } = generateToken(input1);
    const { token: token2, payload: payload2 } = generateToken(input2);

    revokeToken(payload1.tid);

    expect(isTokenRevoked(payload1.tid)).toBe(true);
    expect(isTokenRevoked(payload2.tid)).toBe(false);

    // Token 2 should still validate
    const result = validateToken({
      token: token2,
      consumerUid: input2.consumerUid,
      hostId: input2.hostId,
      currentTime: input2.windowStart,
    });
    expect(result.valid).toBe(true);
  });

  it('should report non-revoked tokens correctly', () => {
    expect(isTokenRevoked('non-existent-token')).toBe(false);
  });
});

// ─── Token Expiry at Boundary ───────────────────────────────────────────────────

describe('Token Expiry Boundary', () => {
  it('should be valid at exactly window end + grace period', () => {
    const input = createValidInput();
    const { token } = generateToken(input);

    // Exactly at expiry boundary (window end + grace period in ms)
    const expiryMs = input.windowEnd + (input.gracePeriodSeconds * 1000);

    const result = validateToken({
      token,
      consumerUid: input.consumerUid,
      hostId: input.hostId,
      currentTime: expiryMs,
    });

    expect(result.valid).toBe(true);
  });

  it('should be invalid 1ms after window end + grace period', () => {
    const input = createValidInput();
    const { token } = generateToken(input);

    const expiryMs = input.windowEnd + (input.gracePeriodSeconds * 1000);

    const result = validateToken({
      token,
      consumerUid: input.consumerUid,
      hostId: input.hostId,
      currentTime: expiryMs + 1,
    });

    expect(result.valid).toBe(false);
    expect(result.error!.code).toBe('invalid_token');
  });
});

// ─── Validation Order of Checks ─────────────────────────────────────────────────

describe('Validation Priority', () => {
  it('should check signature before scope (invalid signature takes priority)', () => {
    const input = createValidInput();
    const { token } = generateToken(input);

    // Tamper with payload AND use wrong consumer
    const parts = token.split('.');
    const tamperedToken = `${parts[0]}X.${parts[1]}`;

    const result = validateToken({
      token: tamperedToken,
      consumerUid: 'wrong-consumer',
      hostId: 'wrong-host',
      currentTime: input.windowStart,
    });

    expect(result.valid).toBe(false);
    // Should report invalid_token (signature failure), not scope violation
    expect(result.error!.code).toBe('invalid_token');
  });

  it('should check revocation before scope', () => {
    const input = createValidInput();
    const { token, payload } = generateToken(input);

    // Revoke the token
    revokeToken(payload.tid);

    // Validate with wrong consumer — revocation should be caught first
    const result = validateToken({
      token,
      consumerUid: 'wrong-consumer',
      hostId: input.hostId,
      currentTime: input.windowStart,
    });

    expect(result.valid).toBe(false);
    expect(result.error!.code).toBe('invalid_token');
    expect(result.error!.message).toContain('revoked');
  });
});
