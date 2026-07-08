/**
 * TURN Credential Provisioning Service
 *
 * Provides TURN server credentials for WebRTC relay fallback when direct
 * peer-to-peer connections cannot be established within 10 seconds.
 *
 * Supports two provisioning modes (configurable via TURN_PROVIDER env var):
 * - "static" (default/dev): Uses static credentials from env vars
 * - "coturn": Generates time-limited HMAC credentials for a coturn REST API
 * - "twilio": Calls Twilio NTS API for relay token generation
 *
 * Credentials are provided to both peers (host and viewer) and have a
 * minimum validity of 5 minutes.
 *
 * Also handles writing the "session_started" event on successful connection,
 * recording the connection type (peer-to-peer or TURN relay).
 *
 * Requirements: 4.3, 4.4, 4.6
 */

import { createHmac } from 'node:crypto';
import { writeAuditEvent } from './sessionAuditService';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface TurnCredentials {
  urls: string[];
  username: string;
  credential: string;
  credentialType: 'password';
  expiresAt: number; // Unix timestamp ms
}

export type TurnProvider = 'static' | 'coturn' | 'twilio';

export type ConnectionType = 'peer-to-peer' | 'turn-relay';

export interface SessionStartedEventInput {
  sessionId: string;
  bookingId: string;
  consumerUid: string;
  hostId: string;
  connectionType: ConnectionType;
}

export interface TurnProvisioningConfig {
  provider: TurnProvider;
  /** Static credentials (dev mode) */
  staticServerUrl?: string;
  staticUsername?: string;
  staticCredential?: string;
  /** Coturn HMAC config */
  coturnSecret?: string;
  coturnServerUrls?: string[];
  /** Twilio NTS config */
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  /** Credential validity duration in seconds (minimum 300 = 5 minutes) */
  credentialTtlSeconds?: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const MIN_CREDENTIAL_TTL_SECONDS = 300; // 5 minutes minimum validity
const DEFAULT_CREDENTIAL_TTL_SECONDS = 600; // 10 minutes default
const P2P_TIMEOUT_MS = 10_000; // 10 seconds before TURN fallback

// ─── Configuration ──────────────────────────────────────────────────────────────

/**
 * Load TURN provisioning configuration from environment variables.
 */
export function loadTurnConfig(): TurnProvisioningConfig {
  const provider = (process.env.TURN_PROVIDER || 'static') as TurnProvider;
  const ttl = parseInt(process.env.TURN_CREDENTIAL_TTL_SECONDS || '', 10);

  return {
    provider,
    staticServerUrl: process.env.TURN_SERVER_URL,
    staticUsername: process.env.TURN_USERNAME,
    staticCredential: process.env.TURN_CREDENTIAL,
    coturnSecret: process.env.COTURN_SECRET,
    coturnServerUrls: process.env.COTURN_SERVER_URLS
      ? process.env.COTURN_SERVER_URLS.split(',').map((u) => u.trim())
      : undefined,
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
    credentialTtlSeconds: isNaN(ttl) ? DEFAULT_CREDENTIAL_TTL_SECONDS : Math.max(ttl, MIN_CREDENTIAL_TTL_SECONDS),
  };
}

// ─── Credential Generation ──────────────────────────────────────────────────────

/**
 * Generate TURN credentials for a session.
 *
 * Returns TURN server URLs, username, credential, and expiry timestamp.
 * Credential validity is always ≥5 minutes (enforced by MIN_CREDENTIAL_TTL_SECONDS).
 *
 * @param sessionId - The session requesting TURN credentials
 * @param config - Optional config override (defaults to env-loaded config)
 * @returns TURN credentials with at least 5 minutes validity
 * @throws Error if credentials cannot be provisioned
 */
export async function generateTurnCredentials(
  sessionId: string,
  config?: TurnProvisioningConfig,
): Promise<TurnCredentials> {
  const cfg = config || loadTurnConfig();

  switch (cfg.provider) {
    case 'static':
      return generateStaticCredentials(sessionId, cfg);
    case 'coturn':
      return generateCoturnCredentials(sessionId, cfg);
    case 'twilio':
      return generateTwilioCredentials(sessionId, cfg);
    default:
      throw new Error(`Unsupported TURN provider: ${cfg.provider}`);
  }
}

/**
 * Static credentials for development/testing.
 * Uses env vars: TURN_SERVER_URL, TURN_USERNAME, TURN_CREDENTIAL.
 */
function generateStaticCredentials(
  _sessionId: string,
  config: TurnProvisioningConfig,
): TurnCredentials {
  const serverUrl = config.staticServerUrl;
  const username = config.staticUsername;
  const credential = config.staticCredential;

  if (!serverUrl || !username || !credential) {
    throw new Error(
      'Static TURN credentials not configured. Set TURN_SERVER_URL, TURN_USERNAME, and TURN_CREDENTIAL environment variables.',
    );
  }

  const ttlSeconds = config.credentialTtlSeconds ?? DEFAULT_CREDENTIAL_TTL_SECONDS;
  const expiresAt = Date.now() + ttlSeconds * 1000;

  return {
    urls: [serverUrl],
    username,
    credential,
    credentialType: 'password',
    expiresAt,
  };
}

/**
 * Generate time-limited HMAC credentials for coturn REST API.
 *
 * coturn time-limited credentials format:
 * - username: "{expiry_unix_timestamp}:{sessionId}"
 * - credential: HMAC-SHA1(username, shared_secret) base64-encoded
 *
 * This follows the coturn REST API spec (draft-uberti-behave-turn-rest-00).
 */
function generateCoturnCredentials(
  sessionId: string,
  config: TurnProvisioningConfig,
): TurnCredentials {
  const secret = config.coturnSecret;
  const serverUrls = config.coturnServerUrls;

  if (!secret) {
    throw new Error(
      'Coturn HMAC secret not configured. Set COTURN_SECRET environment variable.',
    );
  }

  if (!serverUrls || serverUrls.length === 0) {
    throw new Error(
      'Coturn server URLs not configured. Set COTURN_SERVER_URLS environment variable.',
    );
  }

  const ttlSeconds = config.credentialTtlSeconds ?? DEFAULT_CREDENTIAL_TTL_SECONDS;
  const expiryTimestamp = Math.floor(Date.now() / 1000) + ttlSeconds;

  // coturn time-limited credential format
  const username = `${expiryTimestamp}:${sessionId}`;
  const hmac = createHmac('sha1', secret);
  hmac.update(username);
  const credential = hmac.digest('base64');

  return {
    urls: serverUrls,
    username,
    credential,
    credentialType: 'password',
    expiresAt: expiryTimestamp * 1000, // Convert to ms
  };
}

/**
 * Generate TURN credentials via Twilio NTS (Network Traversal Service).
 *
 * Makes an API call to Twilio's NTS endpoint to obtain ephemeral
 * TURN credentials. Requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.
 */
async function generateTwilioCredentials(
  _sessionId: string,
  config: TurnProvisioningConfig,
): Promise<TurnCredentials> {
  const accountSid = config.twilioAccountSid;
  const authToken = config.twilioAuthToken;

  if (!accountSid || !authToken) {
    throw new Error(
      'Twilio NTS credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables.',
    );
  }

  const ttlSeconds = config.credentialTtlSeconds ?? DEFAULT_CREDENTIAL_TTL_SECONDS;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Tokens.json`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `Ttl=${ttlSeconds}`,
  });

  if (!response.ok) {
    throw new Error(
      `Twilio NTS API request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as {
    username: string;
    password: string;
    ttl: string;
    ice_servers: Array<{ url?: string; urls?: string; credential?: string; username?: string }>;
  };

  // Extract TURN servers (filter out STUN-only entries)
  const turnUrls = data.ice_servers
    .filter((server) => {
      const serverUrl = server.urls || server.url || '';
      return serverUrl.startsWith('turn:') || serverUrl.startsWith('turns:');
    })
    .map((server) => server.urls || server.url || '')
    .filter(Boolean);

  if (turnUrls.length === 0) {
    throw new Error('Twilio NTS returned no TURN server URLs');
  }

  const expiresAt = Date.now() + parseInt(data.ttl, 10) * 1000;

  return {
    urls: turnUrls,
    username: data.username,
    credential: data.password,
    credentialType: 'password',
    expiresAt,
  };
}

// ─── P2P Timeout and TURN Fallback ─────────────────────────────────────────────

/**
 * Get the P2P connection timeout duration in milliseconds.
 * After this timeout, TURN credentials should be provisioned.
 */
export function getP2PTimeoutMs(): number {
  return P2P_TIMEOUT_MS;
}

/**
 * Determine if credentials have valid remaining lifetime (≥5 minutes).
 */
export function areCredentialsValid(credentials: TurnCredentials): boolean {
  const remainingMs = credentials.expiresAt - Date.now();
  return remainingMs >= MIN_CREDENTIAL_TTL_SECONDS * 1000;
}

// ─── Session Started Event ──────────────────────────────────────────────────────

/**
 * Write a "session_started" event to the audit log on successful WebRTC connection.
 *
 * Records the connection type (peer-to-peer or TURN relay) per Requirement 4.6.
 *
 * @param input - Session connection details including connection type
 * @returns The written audit event
 */
export async function writeSessionStartedEvent(
  input: SessionStartedEventInput,
): Promise<void> {
  await writeAuditEvent({
    sessionId: input.sessionId,
    bookingId: input.bookingId,
    eventType: 'session_started',
    actorUid: input.consumerUid,
    actorRole: 'Consumer',
    hostId: input.hostId,
    timestamp: {
      seconds: Math.floor(Date.now() / 1000),
      nanoseconds: (Date.now() % 1000) * 1_000_000,
    },
    metadata: {
      connectionType: input.connectionType,
      startTimestamp: Date.now(),
    },
  });
}
