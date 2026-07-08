/**
 * TURN Credential Provisioning Service — Unit Tests
 *
 * Tests TURN credential generation across all provider modes (static, coturn, twilio),
 * P2P timeout logic, credential validity checking, and session_started event writing.
 *
 * Requirements: 4.3, 4.4, 4.6
 *

 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateTurnCredentials,
  loadTurnConfig,
  getP2PTimeoutMs,
  areCredentialsValid,
  writeSessionStartedEvent,
  type TurnCredentials,
  type TurnProvisioningConfig,
} from '../turnProvisioningService';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        set: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({ exists: false }),
      })),
    })),
  },
}));

// ─── Test Helpers ───────────────────────────────────────────────────────────────

const FIVE_MINUTES_MS = 5 * 60 * 1000;

function createStaticConfig(overrides: Partial<TurnProvisioningConfig> = {}): TurnProvisioningConfig {
  return {
    provider: 'static',
    staticServerUrl: 'turn:turn.example.com:3478',
    staticUsername: 'testuser',
    staticCredential: 'testpass',
    credentialTtlSeconds: 600,
    ...overrides,
  };
}

function createCoturnConfig(overrides: Partial<TurnProvisioningConfig> = {}): TurnProvisioningConfig {
  return {
    provider: 'coturn',
    coturnSecret: 'my-shared-secret',
    coturnServerUrls: ['turn:coturn.example.com:3478', 'turns:coturn.example.com:5349'],
    credentialTtlSeconds: 600,
    ...overrides,
  };
}

function createTwilioConfig(overrides: Partial<TurnProvisioningConfig> = {}): TurnProvisioningConfig {
  return {
    provider: 'twilio',
    twilioAccountSid: 'ACtest00000000000000000000000000',
    twilioAuthToken: 'auth-token-xyz',
    credentialTtlSeconds: 600,
    ...overrides,
  };
}

// ─── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2025-01-15T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── loadTurnConfig ─────────────────────────────────────────────────────────────

describe('loadTurnConfig', () => {
  it('should default to static provider when TURN_PROVIDER is not set', () => {
    const originalEnv = process.env.TURN_PROVIDER;
    delete process.env.TURN_PROVIDER;

    const config = loadTurnConfig();
    expect(config.provider).toBe('static');

    process.env.TURN_PROVIDER = originalEnv;
  });

  it('should enforce minimum TTL of 300 seconds (5 minutes)', () => {
    const originalTtl = process.env.TURN_CREDENTIAL_TTL_SECONDS;
    process.env.TURN_CREDENTIAL_TTL_SECONDS = '60'; // Too low

    const config = loadTurnConfig();
    expect(config.credentialTtlSeconds).toBe(300);

    process.env.TURN_CREDENTIAL_TTL_SECONDS = originalTtl;
  });

  it('should parse COTURN_SERVER_URLS as comma-separated list', () => {
    const originalUrls = process.env.COTURN_SERVER_URLS;
    process.env.COTURN_SERVER_URLS = 'turn:a.com:3478, turns:b.com:5349';

    const config = loadTurnConfig();
    expect(config.coturnServerUrls).toEqual(['turn:a.com:3478', 'turns:b.com:5349']);

    process.env.COTURN_SERVER_URLS = originalUrls;
  });
});

// ─── Static Credentials ─────────────────────────────────────────────────────────

describe('generateTurnCredentials — static provider', () => {
  it('should return credentials from config values', async () => {
    const config = createStaticConfig();
    const creds = await generateTurnCredentials('session-123', config);

    expect(creds.urls).toEqual(['turn:turn.example.com:3478']);
    expect(creds.username).toBe('testuser');
    expect(creds.credential).toBe('testpass');
    expect(creds.credentialType).toBe('password');
  });

  it('should set expiresAt with at least 5 minutes validity', async () => {
    const config = createStaticConfig({ credentialTtlSeconds: 300 });
    const creds = await generateTurnCredentials('session-123', config);

    const now = Date.now();
    expect(creds.expiresAt).toBeGreaterThanOrEqual(now + FIVE_MINUTES_MS);
  });

  it('should throw when static credentials are not configured', async () => {
    const config = createStaticConfig({ staticServerUrl: undefined });
    await expect(generateTurnCredentials('session-123', config)).rejects.toThrow(
      'Static TURN credentials not configured',
    );
  });

  it('should throw when username is missing', async () => {
    const config = createStaticConfig({ staticUsername: undefined });
    await expect(generateTurnCredentials('session-123', config)).rejects.toThrow(
      'Static TURN credentials not configured',
    );
  });

  it('should throw when credential is missing', async () => {
    const config = createStaticConfig({ staticCredential: undefined });
    await expect(generateTurnCredentials('session-123', config)).rejects.toThrow(
      'Static TURN credentials not configured',
    );
  });
});

// ─── Coturn HMAC Credentials ────────────────────────────────────────────────────

describe('generateTurnCredentials — coturn provider', () => {
  it('should generate HMAC-SHA1 credentials with correct format', async () => {
    const config = createCoturnConfig();
    const creds = await generateTurnCredentials('session-456', config);

    // Username format: "{expiry_unix_timestamp}:{sessionId}"
    expect(creds.username).toMatch(/^\d+:session-456$/);
    expect(creds.credential).toBeDefined();
    expect(creds.credential.length).toBeGreaterThan(0);
    expect(creds.credentialType).toBe('password');
    expect(creds.urls).toEqual(['turn:coturn.example.com:3478', 'turns:coturn.example.com:5349']);
  });

  it('should set expiry timestamp at least 5 minutes in the future', async () => {
    const config = createCoturnConfig({ credentialTtlSeconds: 300 });
    const creds = await generateTurnCredentials('session-456', config);

    const now = Date.now();
    expect(creds.expiresAt).toBeGreaterThanOrEqual(now + FIVE_MINUTES_MS);
  });

  it('should produce a valid HMAC-SHA1 credential', async () => {
    const { createHmac } = await import('node:crypto');
    const config = createCoturnConfig({ credentialTtlSeconds: 600 });
    const creds = await generateTurnCredentials('session-789', config);

    // Verify the HMAC independently
    const hmac = createHmac('sha1', config.coturnSecret!);
    hmac.update(creds.username);
    const expected = hmac.digest('base64');

    expect(creds.credential).toBe(expected);
  });

  it('should embed the session ID in the username', async () => {
    const config = createCoturnConfig();
    const creds = await generateTurnCredentials('my-unique-session', config);

    expect(creds.username).toContain(':my-unique-session');
  });

  it('should throw when coturn secret is not configured', async () => {
    const config = createCoturnConfig({ coturnSecret: undefined });
    await expect(generateTurnCredentials('session-123', config)).rejects.toThrow(
      'Coturn HMAC secret not configured',
    );
  });

  it('should throw when coturn server URLs are not configured', async () => {
    const config = createCoturnConfig({ coturnServerUrls: undefined });
    await expect(generateTurnCredentials('session-123', config)).rejects.toThrow(
      'Coturn server URLs not configured',
    );
  });

  it('should throw when coturn server URLs array is empty', async () => {
    const config = createCoturnConfig({ coturnServerUrls: [] });
    await expect(generateTurnCredentials('session-123', config)).rejects.toThrow(
      'Coturn server URLs not configured',
    );
  });
});

// ─── Twilio NTS Credentials ─────────────────────────────────────────────────────

describe('generateTurnCredentials — twilio provider', () => {
  it('should call Twilio NTS API and return parsed credentials', async () => {
    const mockResponse = {
      username: 'twilio-user-abc',
      password: 'twilio-pass-xyz',
      ttl: '600',
      ice_servers: [
        { urls: 'stun:global.stun.twilio.com:3478' },
        { urls: 'turn:global.turn.twilio.com:3478', credential: 'x', username: 'y' },
        { urls: 'turns:global.turn.twilio.com:443', credential: 'x', username: 'y' },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockResponse),
    }) as any;

    const config = createTwilioConfig();
    const creds = await generateTurnCredentials('session-twilio', config);

    expect(creds.username).toBe('twilio-user-abc');
    expect(creds.credential).toBe('twilio-pass-xyz');
    expect(creds.credentialType).toBe('password');
    // Should only contain TURN URLs (not STUN)
    expect(creds.urls).toEqual([
      'turn:global.turn.twilio.com:3478',
      'turns:global.turn.twilio.com:443',
    ]);
    expect(creds.expiresAt).toBeGreaterThan(Date.now());
  });

  it('should throw when Twilio API returns error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    }) as any;

    const config = createTwilioConfig();
    await expect(generateTurnCredentials('session-123', config)).rejects.toThrow(
      'Twilio NTS API request failed: 401 Unauthorized',
    );
  });

  it('should throw when Twilio returns no TURN servers', async () => {
    const mockResponse = {
      username: 'user',
      password: 'pass',
      ttl: '600',
      ice_servers: [
        { urls: 'stun:global.stun.twilio.com:3478' }, // STUN only, no TURN
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockResponse),
    }) as any;

    const config = createTwilioConfig();
    await expect(generateTurnCredentials('session-123', config)).rejects.toThrow(
      'Twilio NTS returned no TURN server URLs',
    );
  });

  it('should throw when Twilio credentials are not configured', async () => {
    const config = createTwilioConfig({ twilioAccountSid: undefined });
    await expect(generateTurnCredentials('session-123', config)).rejects.toThrow(
      'Twilio NTS credentials not configured',
    );
  });

  it('should include correct Authorization header in Twilio request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        username: 'u',
        password: 'p',
        ttl: '600',
        ice_servers: [{ urls: 'turn:t.com:3478' }],
      }),
    });
    global.fetch = mockFetch as any;

    const config = createTwilioConfig();
    await generateTurnCredentials('session-123', config);

    expect(mockFetch).toHaveBeenCalledWith(
      `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Tokens.json`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': expect.stringMatching(/^Basic /),
        }),
      }),
    );
  });
});

// ─── Unsupported Provider ───────────────────────────────────────────────────────

describe('generateTurnCredentials — unsupported provider', () => {
  it('should throw for unknown provider type', async () => {
    const config = { provider: 'unknown' as any };
    await expect(generateTurnCredentials('session-123', config)).rejects.toThrow(
      'Unsupported TURN provider: unknown',
    );
  });
});

// ─── P2P Timeout ────────────────────────────────────────────────────────────────

describe('getP2PTimeoutMs', () => {
  it('should return 10000ms (10 seconds)', () => {
    expect(getP2PTimeoutMs()).toBe(10_000);
  });
});

// ─── Credential Validity Check ──────────────────────────────────────────────────

describe('areCredentialsValid', () => {
  it('should return true when credentials have ≥5 minutes remaining', () => {
    const creds: TurnCredentials = {
      urls: ['turn:example.com:3478'],
      username: 'user',
      credential: 'pass',
      credentialType: 'password',
      expiresAt: Date.now() + 6 * 60 * 1000, // 6 minutes from now
    };
    expect(areCredentialsValid(creds)).toBe(true);
  });

  it('should return true when credentials have exactly 5 minutes remaining', () => {
    const creds: TurnCredentials = {
      urls: ['turn:example.com:3478'],
      username: 'user',
      credential: 'pass',
      credentialType: 'password',
      expiresAt: Date.now() + FIVE_MINUTES_MS,
    };
    expect(areCredentialsValid(creds)).toBe(true);
  });

  it('should return false when credentials have less than 5 minutes remaining', () => {
    const creds: TurnCredentials = {
      urls: ['turn:example.com:3478'],
      username: 'user',
      credential: 'pass',
      credentialType: 'password',
      expiresAt: Date.now() + 4 * 60 * 1000, // 4 minutes from now
    };
    expect(areCredentialsValid(creds)).toBe(false);
  });

  it('should return false when credentials are expired', () => {
    const creds: TurnCredentials = {
      urls: ['turn:example.com:3478'],
      username: 'user',
      credential: 'pass',
      credentialType: 'password',
      expiresAt: Date.now() - 1000, // Already expired
    };
    expect(areCredentialsValid(creds)).toBe(false);
  });
});

// ─── Session Started Event ──────────────────────────────────────────────────────

describe('writeSessionStartedEvent', () => {
  it('should write session_started event with peer-to-peer connection type', async () => {
    await expect(
      writeSessionStartedEvent({
        sessionId: 'session-p2p',
        bookingId: 'booking-100',
        consumerUid: 'consumer-abc',
        hostId: 'host-xyz',
        connectionType: 'peer-to-peer',
      }),
    ).resolves.not.toThrow();
  });

  it('should write session_started event with turn-relay connection type', async () => {
    await expect(
      writeSessionStartedEvent({
        sessionId: 'session-turn',
        bookingId: 'booking-200',
        consumerUid: 'consumer-def',
        hostId: 'host-uvw',
        connectionType: 'turn-relay',
      }),
    ).resolves.not.toThrow();
  });
});
