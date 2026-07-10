/**
 * Remote Desktop Core — Token Service
 *
 * Higher-level token lifecycle management built on top of tokenEngine.ts.
 * Implements:
 * - Server-side TTL store (in-memory Map with cleanup interval)
 * - Single-use enforcement (consumed flag)
 * - Duplicate detection (reject second simultaneous attempt)
 * - Reconnection token derivation
 * - 24-hour validity cap (Requirement 7.1)
 * - Secret rotation support (Requirement 7.6)
 * - recordingRequired flag inclusion (Requirement 2.7)
 *
 * The token store is NEVER persisted to Firestore or localStorage (Req 7.7).
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { SessionTokenPayload, SessionToken } from './types';
import { REMOTE_DESKTOP_DEFAULTS } from './types';

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Maximum token validity: 24 hours in milliseconds */
const MAX_TOKEN_VALIDITY_MS = REMOTE_DESKTOP_DEFAULTS.MAX_TOKEN_VALIDITY_MS; // 86_400_000

/** Cleanup interval: purge expired tokens every 60 seconds */
const CLEANUP_INTERVAL_MS = 60_000;

// ─── Secret Management ──────────────────────────────────────────────────────────

let currentSecret = process.env.RD_TOKEN_SECRET || 'architex-rd-token-secret-dev';
let previousSecret: string | null = null;

// ─── Token Store ────────────────────────────────────────────────────────────────

export interface TokenStoreEntry {
  token: SessionToken;
  payload: SessionTokenPayload;
  signature: string;
  consumed: boolean;
  activeConnectionCount: number;
  createdAt: number;
  expiresAt: number;
}

/** In-memory token store — never persisted (Req 7.7) */
const tokenStore = new Map<string, TokenStoreEntry>();

// ─── Cleanup Timer ──────────────────────────────────────────────────────────────

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function startCleanupInterval(): void {
  if (cleanupInterval !== null) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [tokenId, entry] of tokenStore) {
      if (now > entry.expiresAt) {
        tokenStore.delete(tokenId);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  // Unref so it doesn't prevent process exit
  if (cleanupInterval && typeof cleanupInterval === 'object' && 'unref' in cleanupInterval) {
    cleanupInterval.unref();
  }
}

// Start cleanup on module load
startCleanupInterval();

// ─── HMAC Helpers ───────────────────────────────────────────────────────────────

function computeHmac(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'utf-8'), Buffer.from(b, 'utf-8'));
  } catch {
    return false;
  }
}

// ─── Input / Output Types ───────────────────────────────────────────────────────

export interface GenerateTokenInput {
  bookingId: string;
  consumerUid: string;
  hostId: string;
  windowStart: number;       // Unix ms
  windowEnd: number;         // Unix ms
  gracePeriodSeconds: number;
  recordingRequired: boolean;
}

export interface VerifyResult {
  valid: boolean;
  error?: string;
  errorCode?: string;
  token?: SessionToken;
}

export interface ReconnectionToken {
  tokenId: string;
  originalTokenId: string;
  sessionId: string;
  signature: string;
  expiresAt: string;
}

// ─── Token Generation ───────────────────────────────────────────────────────────

/**
 * Generate a session token with HMAC-SHA256 signature.
 *
 * Token validity = min(booking window + grace period, 24 hours).
 * The token is stored in the in-memory TTL store.
 *
 * Validates: Requirements 7.1, 7.6, 7.7
 */
export function generateSessionToken(input: GenerateTokenInput): SessionToken {
  const {
    bookingId,
    consumerUid,
    hostId,
    windowStart,
    windowEnd,
    gracePeriodSeconds,
    recordingRequired,
  } = input;

  // Validate required fields
  if (!bookingId || !consumerUid || !hostId) {
    throw new Error('Missing required fields for token generation');
  }
  if (windowEnd <= windowStart) {
    throw new Error('Window end must be after window start');
  }
  if (gracePeriodSeconds < 0) {
    throw new Error('Grace period must be non-negative');
  }

  const tokenId = randomUUID();
  const issuedAt = Date.now();

  // Validity = booking window duration + grace period, capped at 24 hours (Req 7.1)
  const bookingDurationMs = windowEnd - windowStart;
  const gracePeriodMs = gracePeriodSeconds * 1000;
  const rawValidityMs = bookingDurationMs + gracePeriodMs;
  const validityMs = Math.min(rawValidityMs, MAX_TOKEN_VALIDITY_MS);

  const expiresAt = issuedAt + validityMs;

  // Build compact payload for signing
  const payload: SessionTokenPayload = {
    tid: tokenId,
    bid: bookingId,
    cid: consumerUid,
    hid: hostId,
    ws: windowStart,
    we: windowEnd,
    gp: gracePeriodSeconds,
    iat: issuedAt,
  };

  // Sign with HMAC-SHA256 (Req 7.6)
  const payloadString = JSON.stringify(payload);
  const signature = computeHmac(payloadString, currentSecret);

  const token: SessionToken = {
    tokenId,
    bookingId,
    consumerUid,
    hostId,
    windowStart: new Date(windowStart).toISOString(),
    windowEnd: new Date(windowEnd).toISOString(),
    gracePeriodSeconds,
    recordingRequired,
    signature,
    expiresAt: new Date(expiresAt).toISOString(),
    consumed: false,
  };

  // Store in memory (Req 7.2, 7.7)
  const entry: TokenStoreEntry = {
    token,
    payload,
    signature,
    consumed: false,
    activeConnectionCount: 0,
    createdAt: issuedAt,
    expiresAt,
  };
  tokenStore.set(tokenId, entry);

  return token;
}

// ─── Token Verification ─────────────────────────────────────────────────────────

/**
 * Verify a session token by ID and signature.
 *
 * Checks:
 * 1. Token exists in store
 * 2. Token not expired (Req 7.3)
 * 3. Signature matches (Req 7.6) — supports current and previous secret (rotation)
 *
 * Validates: Requirements 7.3, 7.6
 */
export function verifySessionToken(tokenId: string, signature: string): VerifyResult {
  const entry = tokenStore.get(tokenId);

  if (!entry) {
    return { valid: false, error: 'Token not found', errorCode: 'invalid_token' };
  }

  // Check expiry (Req 7.3)
  const now = Date.now();
  if (now > entry.expiresAt) {
    tokenStore.delete(tokenId);
    return { valid: false, error: 'Token has expired', errorCode: 'expired_token' };
  }

  // Verify signature with current secret
  const payloadString = JSON.stringify(entry.payload);
  const expectedSignature = computeHmac(payloadString, currentSecret);

  if (constantTimeEqual(signature, expectedSignature)) {
    return { valid: true, token: entry.token };
  }

  // If rotation in progress, try previous secret (Req 7.6)
  if (previousSecret) {
    const previousSignature = computeHmac(payloadString, previousSecret);
    if (constantTimeEqual(signature, previousSignature)) {
      return { valid: true, token: entry.token };
    }
  }

  return { valid: false, error: 'Invalid signature', errorCode: 'invalid_token' };
}

// ─── Token Consumption (Single-Use) ─────────────────────────────────────────────

/**
 * Consume a token for initial connection establishment.
 *
 * Enforces single-use: once consumed, cannot be used for a new connection.
 * Implements duplicate detection: rejects if a connection is already active.
 *
 * Validates: Requirements 7.4, 7.5
 *
 * @returns true if successfully consumed, false if already consumed or duplicate
 */
export function consumeToken(tokenId: string): boolean {
  const entry = tokenStore.get(tokenId);

  if (!entry) {
    return false;
  }

  // Check expiry
  if (Date.now() > entry.expiresAt) {
    tokenStore.delete(tokenId);
    return false;
  }

  // Reject if already consumed (Req 7.4 — single use)
  if (entry.consumed) {
    return false;
  }

  // Duplicate detection: reject if there's already an active connection (Req 7.5)
  if (entry.activeConnectionCount > 0) {
    return false;
  }

  // Mark as consumed and increment active connection count
  entry.consumed = true;
  entry.token = { ...entry.token, consumed: true };
  entry.activeConnectionCount = 1;

  return true;
}

// ─── Token Revocation ───────────────────────────────────────────────────────────

/**
 * Revoke a token, removing it from the store.
 *
 * @returns true if the token existed and was revoked, false otherwise
 */
export function revokeToken(tokenId: string): boolean {
  return tokenStore.delete(tokenId);
}

// ─── Token Expiry Check ─────────────────────────────────────────────────────────

/**
 * Check if a token has expired.
 *
 * Validates: Requirement 7.3
 *
 * @returns true if the token is expired or not found
 */
export function isTokenExpired(tokenId: string): boolean {
  const entry = tokenStore.get(tokenId);
  if (!entry) return true;
  return Date.now() > entry.expiresAt;
}

// ─── Reconnection Token Derivation ──────────────────────────────────────────────

/**
 * Derive a reconnection token from an original consumed token.
 *
 * The reconnection token is computed as:
 *   HMAC-SHA256(originalTokenId + sessionId, secret)
 *
 * This produces a deterministic but distinct token that can only be derived
 * by someone who knows both the original token ID and the session ID.
 *
 * Validates: Requirement 7.4 (separate reconnection token)
 */
export function deriveReconnectionToken(
  originalTokenId: string,
  sessionId: string,
): ReconnectionToken | null {
  const entry = tokenStore.get(originalTokenId);
  if (!entry) return null;

  // Can only derive reconnection token from a consumed (used) token
  if (!entry.consumed) return null;

  // Check expiry — reconnection token inherits the original's expiry
  if (Date.now() > entry.expiresAt) return null;

  const derivationInput = `${originalTokenId}:${sessionId}`;
  const reconnectionSignature = computeHmac(derivationInput, currentSecret);
  const reconnectionTokenId = computeHmac(`reconnect:${derivationInput}`, currentSecret);

  return {
    tokenId: reconnectionTokenId,
    originalTokenId,
    sessionId,
    signature: reconnectionSignature,
    expiresAt: entry.token.expiresAt,
  };
}

// ─── Secret Rotation ────────────────────────────────────────────────────────────

/**
 * Rotate the HMAC signing secret.
 *
 * During rotation, both the current and previous secrets are accepted
 * for verification, allowing tokens signed with the old secret to remain
 * valid until they naturally expire.
 *
 * Validates: Requirement 7.6 (rotated every 24 hours)
 */
export function rotateSecret(newSecret: string): void {
  if (!newSecret || newSecret.length < 16) {
    throw new Error('New secret must be at least 16 characters');
  }
  previousSecret = currentSecret;
  currentSecret = newSecret;
}

// ─── Store Access (Testing) ─────────────────────────────────────────────────────

/**
 * Get a read-only view of the token store (for testing/monitoring).
 */
export function getTokenStore(): ReadonlyMap<string, TokenStoreEntry> {
  return tokenStore;
}

/**
 * Clear the entire token store and reset secrets (for testing only).
 * @internal
 */
export function clearTokenStore(): void {
  tokenStore.clear();
  currentSecret = process.env.RD_TOKEN_SECRET || 'architex-rd-token-secret-dev';
  previousSecret = null;
}

/**
 * Stop the cleanup interval (for testing cleanup — prevents open handles).
 * @internal
 */
export function stopCleanupInterval(): void {
  if (cleanupInterval !== null) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

/**
 * Restart the cleanup interval (for testing).
 * @internal
 */
export function startCleanup(): void {
  startCleanupInterval();
}
