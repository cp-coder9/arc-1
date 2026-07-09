/**
 * Remote Desktop Core — Token Engine
 *
 * Implements Session Token generation, validation, and revocation for the
 * Architex Remote Desktop session layer.
 *
 * Token format: base64url(payload).base64url(hmac-sha256(payload, secret))
 * Total wire size: ~200 bytes
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9
 */

import { createHmac, randomUUID } from 'node:crypto';
import type { SessionTokenPayload, RemoteDesktopError, RemoteDesktopErrorCode } from './types';

// ─── Configuration ──────────────────────────────────────────────────────────────

/** HMAC secret — in production, sourced from environment/secret manager */
const TOKEN_SECRET = process.env.RD_TOKEN_SECRET || 'architex-rd-token-secret-dev';

/** Grace period bounds (seconds) */
const MIN_GRACE_PERIOD_SECONDS = 60;  // 1 minute
const MAX_GRACE_PERIOD_SECONDS = 1800; // 30 minutes

/** Early connection buffer: reject if before (window start - 15 minutes) */
const EARLY_CONNECTION_BUFFER_MS = 15 * 60 * 1000;

// ─── Revocation List ────────────────────────────────────────────────────────────

/** In-memory revocation set (can be backed by Firestore later) */
const revokedTokens: Set<string> = new Set();

// ─── Base64url Helpers ──────────────────────────────────────────────────────────

function base64urlEncode(data: string): string {
  return Buffer.from(data, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(encoded: string): string {
  let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (base64.length % 4)) % 4;
  base64 += '='.repeat(padding);
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function base64urlEncodeBuffer(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ─── HMAC-SHA256 Signing ────────────────────────────────────────────────────────

function signPayload(payloadBase64url: string): string {
  const hmac = createHmac('sha256', TOKEN_SECRET);
  hmac.update(payloadBase64url);
  return base64urlEncodeBuffer(hmac.digest());
}

function verifySignature(payloadBase64url: string, signatureBase64url: string): boolean {
  const expectedSignature = signPayload(payloadBase64url);
  // Constant-time comparison to prevent timing attacks
  if (expectedSignature.length !== signatureBase64url.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < expectedSignature.length; i++) {
    result |= expectedSignature.charCodeAt(i) ^ signatureBase64url.charCodeAt(i);
  }
  return result === 0;
}

// ─── Error Factory ──────────────────────────────────────────────────────────────

function createError(
  code: RemoteDesktopErrorCode,
  message: string,
  details?: Record<string, unknown>,
  retryable = false,
): RemoteDesktopError {
  return { code, message, details, retryable };
}

// ─── Token Generation ───────────────────────────────────────────────────────────

export interface GenerateTokenInput {
  bookingId: string;
  consumerUid: string;
  hostId: string;
  windowStart: number;   // Unix ms
  windowEnd: number;     // Unix ms
  gracePeriodSeconds: number;
}

export interface GenerateTokenResult {
  token: string;
  payload: SessionTokenPayload;
}

/**
 * Generate a Session Token for a confirmed booking.
 *
 * The token binds:
 * - Consumer UID to a single host
 * - Booking window start/end times
 * - Grace period (1–30 minutes)
 *
 * Token generation must complete within 5 seconds of booking confirmation.
 *
 * @throws RemoteDesktopError with code 'token_generation_failed' on system error
 */
export function generateToken(input: GenerateTokenInput): GenerateTokenResult {
  try {
    // Validate inputs
    if (!input.bookingId || !input.consumerUid || !input.hostId) {
      throw createError(
        'token_generation_failed',
        'Missing required fields for token generation',
        { bookingId: input.bookingId, consumerUid: input.consumerUid, hostId: input.hostId },
        true,
      );
    }

    if (input.windowEnd <= input.windowStart) {
      throw createError(
        'token_generation_failed',
        'Window end must be after window start',
        { windowStart: input.windowStart, windowEnd: input.windowEnd },
        true,
      );
    }

    // Validate grace period (1–30 minutes = 60–1800 seconds)
    if (input.gracePeriodSeconds < MIN_GRACE_PERIOD_SECONDS || input.gracePeriodSeconds > MAX_GRACE_PERIOD_SECONDS) {
      throw createError(
        'token_generation_failed',
        `Grace period must be between ${MIN_GRACE_PERIOD_SECONDS} and ${MAX_GRACE_PERIOD_SECONDS} seconds`,
        { gracePeriodSeconds: input.gracePeriodSeconds },
        true,
      );
    }

    const payload: SessionTokenPayload = {
      tid: randomUUID(),
      bid: input.bookingId,
      cid: input.consumerUid,
      hid: input.hostId,
      ws: input.windowStart,
      we: input.windowEnd,
      gp: input.gracePeriodSeconds,
      iat: Date.now(),
    };

    // Encode payload as base64url
    const payloadJson = JSON.stringify(payload);
    const payloadBase64url = base64urlEncode(payloadJson);

    // Sign the payload
    const signature = signPayload(payloadBase64url);

    // Wire format: base64url(payload).base64url(hmac-sha256(payload, secret))
    const token = `${payloadBase64url}.${signature}`;

    return { token, payload };
  } catch (error) {
    if ((error as RemoteDesktopError).code) {
      throw error;
    }
    throw createError(
      'token_generation_failed',
      'Unexpected error during token generation',
      { originalError: String(error) },
      true,
    );
  }
}

// ─── Token Validation ───────────────────────────────────────────────────────────

export interface ValidateTokenInput {
  token: string;
  consumerUid: string;
  hostId: string;
  currentTime?: number; // Unix ms — defaults to Date.now(), injectable for testing
}

export interface TokenValidationResult {
  valid: boolean;
  payload?: SessionTokenPayload;
  error?: RemoteDesktopError;
}

/**
 * Validate a Session Token string.
 *
 * Checks performed (in order):
 * 1. Token format: base64url(payload).base64url(signature)
 * 2. Signature verification (HMAC-SHA256)
 * 3. Revocation check
 * 4. Expiry check (token expires at window end + grace period)
 * 5. Time-window check (reject if before window start - 15 minutes)
 * 6. Scope check (consumer UID and host ID must match)
 */
export function validateToken(input: ValidateTokenInput): TokenValidationResult {
  const { token, consumerUid, hostId } = input;
  const now = input.currentTime ?? Date.now();

  // 1. Parse token format
  const parts = token.split('.');
  if (parts.length !== 2) {
    return {
      valid: false,
      error: createError('invalid_token', 'Malformed token: expected format payload.signature'),
    };
  }

  const [payloadBase64url, signatureBase64url] = parts;

  // 2. Verify signature
  if (!verifySignature(payloadBase64url, signatureBase64url)) {
    return {
      valid: false,
      error: createError('invalid_token', 'Token signature verification failed'),
    };
  }

  // 3. Decode payload
  let payload: SessionTokenPayload;
  try {
    const payloadJson = base64urlDecode(payloadBase64url);
    payload = JSON.parse(payloadJson) as SessionTokenPayload;
  } catch {
    return {
      valid: false,
      error: createError('invalid_token', 'Failed to decode token payload'),
    };
  }

  // 4. Check revocation
  if (revokedTokens.has(payload.tid)) {
    return {
      valid: false,
      error: createError('invalid_token', 'Token has been revoked', { tokenId: payload.tid }),
    };
  }

  // 5. Check expiry (window end + grace period in ms)
  const expiryMs = payload.we + (payload.gp * 1000);
  if (now > expiryMs) {
    return {
      valid: false,
      error: createError('invalid_token', 'Token has expired', {
        expiryTime: expiryMs,
        currentTime: now,
      }),
    };
  }

  // 6. Check time-window — reject if before (window start - 15 minutes)
  const earliestConnection = payload.ws - EARLY_CONNECTION_BUFFER_MS;
  if (now < earliestConnection) {
    return {
      valid: false,
      error: createError(
        'session_not_started',
        'Session has not started yet. Connection allowed 15 minutes before booking window.',
        { windowStart: payload.ws, earliestConnection, currentTime: now },
      ),
    };
  }

  // 7. Check scope — consumer UID must match
  if (payload.cid !== consumerUid) {
    return {
      valid: false,
      error: createError(
        'token_scope_violation',
        'Token is not scoped to this consumer',
        { expectedConsumer: payload.cid, providedConsumer: consumerUid },
      ),
    };
  }

  // 8. Check scope — host ID must match
  if (payload.hid !== hostId) {
    return {
      valid: false,
      error: createError(
        'token_scope_violation',
        'Token is not scoped to this host',
        { expectedHost: payload.hid, providedHost: hostId },
      ),
    };
  }

  return { valid: true, payload };
}

// ─── Token Revocation ───────────────────────────────────────────────────────────

/**
 * Revoke a session token by token ID.
 * Called when a booking is cancelled after token generation.
 * Must complete within 30 seconds of booking cancellation.
 */
export function revokeToken(tokenId: string): void {
  revokedTokens.add(tokenId);
}

/**
 * Check if a token has been revoked.
 */
export function isTokenRevoked(tokenId: string): boolean {
  return revokedTokens.has(tokenId);
}

/**
 * Get the count of revoked tokens (useful for monitoring).
 */
export function getRevokedTokenCount(): number {
  return revokedTokens.size;
}

/**
 * Clear the revocation list (for testing only).
 * @internal
 */
export function _clearRevocationList(): void {
  revokedTokens.clear();
}

/**
 * Set the token secret for testing purposes.
 * @internal
 */
let _testSecret: string | null = null;

export function _setTestSecret(secret: string | null): void {
  _testSecret = secret;
}

// Override the signing functions to use test secret when set
// (This is handled by the module-level TOKEN_SECRET const — for testing,
// we rely on process.env.RD_TOKEN_SECRET being set or use the default)
