/**
 * @vitest-environment node
 *
 * POPIA Consent Service — Unit Tests & Property-Based Tests
 *
 * Tests the POPIA consent management service:
 * - IP hashing produces valid SHA-256 hex (64 chars), never stores raw IP
 * - Consent record creation writes audit event with correct metadata
 * - Stream validation fails without consent, passes with consent
 * - Policy immutability: canApplyPolicyChange returns false during active session
 * - 60-second timeout produces consent_declined event
 * - Separate screenshot consent independent from recording consent
 * - Consent prompt content includes all required POPIA fields
 * - Property-based test: media stream iff consent granted (Property 9)
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7**
 */

import * as fc from 'fast-check';
import {
  hashIpAddress,
  createConsentRecord,
  validateConsentForStream,
  isRecordingEnabled,
  canApplyPolicyChange,
  registerActiveSession,
  deregisterSession,
  handleConsentTimeout,
  declineConsent,
  grantScreenshotConsent,
  hasScreenshotConsent,
  getConsentPromptContent,
  getSessionPolicySnapshot,
  CONSENT_TIMEOUT_MS,
  RETENTION_PERIOD_DAYS,
  RECORDING_ACCESS_LIST,
  _clearAllState,
  _getSessionConsentRecords,
  type CreateConsentInput,
  type ConsentPromptContent,
} from '../popiaConsentService';
import { _clearAllState as clearAuditState, _getSessionEvents } from '../auditEventService';
import { SESSION_EVENT_TYPES } from '../types';
import type { HostConfig } from '../types';

// ─── Test Helpers ───────────────────────────────────────────────────────────────

function createValidHostConfig(overrides?: Partial<HostConfig>): HostConfig {
  return {
    gracePeriodSeconds: 300,
    clipboardPolicy: 'enabled',
    recordingEnabled: true,
    sessionWorkspacePath: 'C:\\Workspaces\\Sessions',
    consentTextVersion: 'v1.2.0',
    ...overrides,
  };
}

function createValidConsentInput(overrides?: Partial<CreateConsentInput>): CreateConsentInput {
  return {
    sessionId: 'session-001',
    bookingId: 'booking-001',
    consumerUid: 'consumer-abc',
    hostId: 'host-xyz',
    consentType: 'recording',
    consentTextVersion: 'v1.2.0',
    ipAddress: '192.168.1.100',
    ...overrides,
  };
}

// ─── Unit Tests ─────────────────────────────────────────────────────────────────

describe('POPIA Consent Service', () => {
  beforeEach(() => {
    _clearAllState();
    clearAuditState();
  });

  describe('hashIpAddress', () => {
    it('should produce a valid SHA-256 hex string (64 characters)', () => {
      const hash = hashIpAddress('192.168.1.100');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should never return the raw IP address', () => {
      const ip = '10.0.0.1';
      const hash = hashIpAddress(ip);
      expect(hash).not.toContain(ip);
      expect(hash).not.toBe(ip);
    });

    it('should produce deterministic hashes for the same IP', () => {
      const hash1 = hashIpAddress('172.16.0.5');
      const hash2 = hashIpAddress('172.16.0.5');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different IPs', () => {
      const hash1 = hashIpAddress('192.168.1.1');
      const hash2 = hashIpAddress('192.168.1.2');
      expect(hash1).not.toBe(hash2);
    });

    it('should handle IPv6 addresses', () => {
      const hash = hashIpAddress('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('createConsentRecord', () => {
    it('should create a valid consent record with hashed IP', () => {
      const input = createValidConsentInput();
      const record = createConsentRecord(input);

      expect(record.consentType).toBe('recording');
      expect(record.consentTextVersion).toBe('v1.2.0');
      expect(record.consumerUid).toBe('consumer-abc');
      expect(record.timestamp).toBeDefined();
      expect(record.ipAddressHash).toHaveLength(64);
      expect(record.ipAddressHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should never store the raw IP address in the record', () => {
      const input = createValidConsentInput({ ipAddress: '203.0.113.50' });
      const record = createConsentRecord(input);

      expect(record.ipAddressHash).not.toContain('203.0.113.50');
      expect(JSON.stringify(record)).not.toContain('203.0.113.50');
    });

    it('should write a popia_consent_granted audit event', () => {
      const input = createValidConsentInput();
      createConsentRecord(input);

      const events = _getSessionEvents(input.sessionId);
      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe(SESSION_EVENT_TYPES.POPIA_CONSENT_GRANTED);
      expect(events[0].actorUid).toBe('consumer-abc');
      expect(events[0].actorRole).toBe('consumer');
    });

    it('should include consent metadata in the audit event', () => {
      const input = createValidConsentInput();
      createConsentRecord(input);

      const events = _getSessionEvents(input.sessionId);
      const metadata = events[0].metadata;
      expect(metadata.consentType).toBe('recording');
      expect(metadata.consentTextVersion).toBe('v1.2.0');
      expect(metadata.ipAddressHash).toHaveLength(64);
    });

    it('should store the consent record for the session', () => {
      const input = createValidConsentInput();
      createConsentRecord(input);

      const records = _getSessionConsentRecords('session-001');
      expect(records.length).toBe(1);
      expect(records[0].consentType).toBe('recording');
    });

    it('should support multiple consent records per session', () => {
      createConsentRecord(createValidConsentInput({ consentType: 'recording' }));
      createConsentRecord(createValidConsentInput({ consentType: 'screenshot' }));

      const records = _getSessionConsentRecords('session-001');
      expect(records.length).toBe(2);
    });
  });

  describe('validateConsentForStream', () => {
    it('should return hasConsent: false when no consent exists', () => {
      const result = validateConsentForStream('session-no-consent');
      expect(result.hasConsent).toBe(false);
      expect(result.consentType).toBeUndefined();
      expect(result.grantedAt).toBeUndefined();
    });

    it('should return hasConsent: true when recording consent exists', () => {
      createConsentRecord(createValidConsentInput());
      const result = validateConsentForStream('session-001');

      expect(result.hasConsent).toBe(true);
      expect(result.consentType).toBe('recording');
      expect(result.grantedAt).toBeDefined();
    });

    it('should return hasConsent: false when only screenshot consent exists', () => {
      createConsentRecord(createValidConsentInput({ consentType: 'screenshot' }));
      const result = validateConsentForStream('session-001');

      expect(result.hasConsent).toBe(false);
    });

    it('should return hasConsent: true when both recording and screenshot consent exist', () => {
      createConsentRecord(createValidConsentInput({ consentType: 'recording' }));
      createConsentRecord(createValidConsentInput({ consentType: 'screenshot' }));
      const result = validateConsentForStream('session-001');

      expect(result.hasConsent).toBe(true);
      expect(result.consentType).toBe('recording');
    });
  });

  describe('isRecordingEnabled', () => {
    it('should return true when recording is enabled', () => {
      const config = createValidHostConfig({ recordingEnabled: true });
      expect(isRecordingEnabled(config)).toBe(true);
    });

    it('should return false when recording is disabled', () => {
      const config = createValidHostConfig({ recordingEnabled: false });
      expect(isRecordingEnabled(config)).toBe(false);
    });
  });

  describe('Policy Immutability', () => {
    it('should allow policy changes when no session is registered', () => {
      expect(canApplyPolicyChange('session-unknown')).toBe(true);
    });

    it('should block policy changes during active session', () => {
      const config = createValidHostConfig();
      registerActiveSession('session-active', config);

      expect(canApplyPolicyChange('session-active')).toBe(false);
    });

    it('should allow policy changes after session ends', () => {
      const config = createValidHostConfig();
      registerActiveSession('session-ended', config);
      deregisterSession('session-ended');

      expect(canApplyPolicyChange('session-ended')).toBe(true);
    });

    it('should preserve the policy snapshot from session start', () => {
      const originalConfig = createValidHostConfig({ recordingEnabled: true, consentTextVersion: 'v1.0' });
      registerActiveSession('session-snap', originalConfig);

      const snapshot = getSessionPolicySnapshot('session-snap');
      expect(snapshot).toBeDefined();
      expect(snapshot!.recordingEnabled).toBe(true);
      expect(snapshot!.consentTextVersion).toBe('v1.0');
    });

    it('should not be affected by modifications to the original config object', () => {
      const config = createValidHostConfig({ consentTextVersion: 'v1.0' });
      registerActiveSession('session-immutable', config);

      // Mutate the original (this should not affect the snapshot)
      config.consentTextVersion = 'v2.0';

      const snapshot = getSessionPolicySnapshot('session-immutable');
      expect(snapshot!.consentTextVersion).toBe('v1.0');
    });
  });

  describe('handleConsentTimeout', () => {
    it('should return a declined result with timeout reason', () => {
      const result = handleConsentTimeout('session-timeout', 'booking-001', 'consumer-abc', 'host-xyz');

      expect(result.declined).toBe(true);
      expect(result.sessionId).toBe('session-timeout');
      expect(result.reason).toBe('timeout');
    });

    it('should emit a consent_declined audit event', () => {
      handleConsentTimeout('session-timeout', 'booking-001', 'consumer-abc', 'host-xyz');

      const events = _getSessionEvents('session-timeout');
      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe(SESSION_EVENT_TYPES.CONSENT_DECLINED);
    });

    it('should include timeout metadata in the audit event', () => {
      handleConsentTimeout('session-timeout', 'booking-001', 'consumer-abc', 'host-xyz');

      const events = _getSessionEvents('session-timeout');
      expect(events[0].metadata.reason).toBe('timeout');
      expect(events[0].metadata.timeoutMs).toBe(CONSENT_TIMEOUT_MS);
    });

    it('should use system as the actor role for timeout', () => {
      handleConsentTimeout('session-timeout', 'booking-001', 'consumer-abc', 'host-xyz');

      const events = _getSessionEvents('session-timeout');
      expect(events[0].actorRole).toBe('system');
    });
  });

  describe('declineConsent', () => {
    it('should return a declined result with user_declined reason', () => {
      const result = declineConsent('session-decline', 'booking-001', 'consumer-abc', 'host-xyz');

      expect(result.declined).toBe(true);
      expect(result.sessionId).toBe('session-decline');
      expect(result.reason).toBe('user_declined');
    });

    it('should emit a consent_declined audit event', () => {
      declineConsent('session-decline', 'booking-001', 'consumer-abc', 'host-xyz');

      const events = _getSessionEvents('session-decline');
      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe(SESSION_EVENT_TYPES.CONSENT_DECLINED);
    });

    it('should use consumer as the actor role for explicit decline', () => {
      declineConsent('session-decline', 'booking-001', 'consumer-abc', 'host-xyz');

      const events = _getSessionEvents('session-decline');
      expect(events[0].actorRole).toBe('consumer');
    });

    it('should include user_declined reason in metadata', () => {
      declineConsent('session-decline', 'booking-001', 'consumer-abc', 'host-xyz');

      const events = _getSessionEvents('session-decline');
      expect(events[0].metadata.reason).toBe('user_declined');
    });
  });

  describe('Screenshot Consent', () => {
    it('should grant screenshot consent independently from recording consent', () => {
      grantScreenshotConsent('session-ss', 'booking-001', 'consumer-abc', 'host-xyz', 'v1.0', '10.0.0.1');

      expect(hasScreenshotConsent('session-ss')).toBe(true);
      // Recording consent should NOT be granted
      const streamValidation = validateConsentForStream('session-ss');
      expect(streamValidation.hasConsent).toBe(false);
    });

    it('should return false for hasScreenshotConsent when no screenshot consent exists', () => {
      expect(hasScreenshotConsent('session-no-ss')).toBe(false);
    });

    it('should return false for hasScreenshotConsent when only recording consent exists', () => {
      createConsentRecord(createValidConsentInput({ consentType: 'recording' }));
      expect(hasScreenshotConsent('session-001')).toBe(false);
    });

    it('should create a consent record with screenshot type', () => {
      const record = grantScreenshotConsent(
        'session-ss',
        'booking-001',
        'consumer-abc',
        'host-xyz',
        'v1.0',
        '192.168.0.1',
      );

      expect(record.consentType).toBe('screenshot');
      expect(record.ipAddressHash).toHaveLength(64);
    });

    it('should emit a popia_consent_granted event for screenshot consent', () => {
      grantScreenshotConsent('session-ss', 'booking-001', 'consumer-abc', 'host-xyz', 'v1.0', '10.0.0.1');

      const events = _getSessionEvents('session-ss');
      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe(SESSION_EVENT_TYPES.POPIA_CONSENT_GRANTED);
      expect(events[0].metadata.consentType).toBe('screenshot');
    });
  });

  describe('getConsentPromptContent', () => {
    it('should include the purpose of recording', () => {
      const config = createValidHostConfig();
      const content = getConsentPromptContent(config);

      expect(content.purpose).toBeDefined();
      expect(content.purpose.length).toBeGreaterThan(0);
    });

    it('should include the retention period', () => {
      const config = createValidHostConfig();
      const content = getConsentPromptContent(config);

      expect(content.retentionPeriod).toContain(`${RETENTION_PERIOD_DAYS}`);
    });

    it('should include the access list with all required parties', () => {
      const config = createValidHostConfig();
      const content = getConsentPromptContent(config);

      expect(content.accessList).toContain('Resource Owner');
      expect(content.accessList).toContain('Resource Consumer');
      expect(content.accessList).toContain('Platform Admin');
    });

    it('should include the right to decline', () => {
      const config = createValidHostConfig();
      const content = getConsentPromptContent(config);

      expect(content.rightToDecline).toBeDefined();
      expect(content.rightToDecline.length).toBeGreaterThan(0);
      expect(content.rightToDecline.toLowerCase()).toContain('decline');
    });

    it('should mention the 60-second timeout in the right to decline', () => {
      const config = createValidHostConfig();
      const content = getConsentPromptContent(config);

      expect(content.rightToDecline).toContain('60 seconds');
    });
  });

  describe('Constants', () => {
    it('should export CONSENT_TIMEOUT_MS as 60000 (60 seconds)', () => {
      expect(CONSENT_TIMEOUT_MS).toBe(60_000);
    });

    it('should export RETENTION_PERIOD_DAYS as 90', () => {
      expect(RETENTION_PERIOD_DAYS).toBe(90);
    });

    it('should export RECORDING_ACCESS_LIST with 3 entries', () => {
      expect(RECORDING_ACCESS_LIST).toHaveLength(3);
    });
  });
});

// ─── Property-Based Tests ───────────────────────────────────────────────────────

describe('POPIA Consent Service — Property-Based Tests', () => {
  beforeEach(() => {
    _clearAllState();
    clearAuditState();
  });

  /**
   * Property 9 — POPIA Consent Gate:
   * ∀ session on recording-enabled host,
   *   mediaStreamEstablished(session) ⟺ ∃ event where eventType === 'popia_consent_granted'
   *
   * **Validates: Requirements 2.1, 2.2**
   */
  describe('Property 9: Media stream iff consent granted', () => {
    it('should establish media stream if and only if popia_consent_granted exists', () => {
      fc.assert(
        fc.property(
          fc.record({
            sessionId: fc.stringMatching(/^session-[a-z0-9]{4,12}$/),
            bookingId: fc.stringMatching(/^booking-[a-z0-9]{4,12}$/),
            consumerUid: fc.stringMatching(/^consumer-[a-z0-9]{4,12}$/),
            hostId: fc.stringMatching(/^host-[a-z0-9]{4,12}$/),
            consentTextVersion: fc.stringMatching(/^v\d+\.\d+\.\d+$/),
            ipAddress: fc.ipV4(),
            grantConsent: fc.boolean(),
          }),
          (input) => {
            // Fresh state for each property check
            _clearAllState();
            clearAuditState();

            if (input.grantConsent) {
              // Grant recording consent
              createConsentRecord({
                sessionId: input.sessionId,
                bookingId: input.bookingId,
                consumerUid: input.consumerUid,
                hostId: input.hostId,
                consentType: 'recording',
                consentTextVersion: input.consentTextVersion,
                ipAddress: input.ipAddress,
              });
            }

            // Validate: media stream allowed ⟺ consent granted
            const validation = validateConsentForStream(input.sessionId);
            const events = _getSessionEvents(input.sessionId);
            const hasConsentEvent = events.some(
              (e) => e.eventType === SESSION_EVENT_TYPES.POPIA_CONSENT_GRANTED,
            );

            // Biconditional: hasConsent ↔ grantConsent ↔ hasConsentEvent
            expect(validation.hasConsent).toBe(input.grantConsent);
            expect(hasConsentEvent).toBe(input.grantConsent);

            // If consent granted, media stream is allowed (hasConsent === true)
            // If consent not granted, media stream is blocked (hasConsent === false)
            expect(validation.hasConsent).toBe(hasConsentEvent);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('IP Hashing Properties', () => {
    /**
     * **Validates: Requirements 2.6**
     */
    it('should always produce a 64-character hex string for any IP input', () => {
      fc.assert(
        fc.property(fc.ipV4(), (ip) => {
          const hash = hashIpAddress(ip);
          expect(hash).toHaveLength(64);
          expect(hash).toMatch(/^[a-f0-9]{64}$/);
        }),
        { numRuns: 100 },
      );
    });

    it('should never contain the raw IP in the hash output', () => {
      fc.assert(
        fc.property(fc.ipV4(), (ip) => {
          const hash = hashIpAddress(ip);
          expect(hash).not.toContain(ip);
        }),
        { numRuns: 100 },
      );
    });

    it('should be deterministic — same IP always produces same hash', () => {
      fc.assert(
        fc.property(fc.ipV4(), (ip) => {
          const hash1 = hashIpAddress(ip);
          const hash2 = hashIpAddress(ip);
          expect(hash1).toBe(hash2);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Policy Immutability Properties', () => {
    /**
     * **Validates: Requirements 2.5**
     */
    it('should always block policy changes during active sessions', () => {
      fc.assert(
        fc.property(
          fc.record({
            sessionId: fc.stringMatching(/^session-[a-z0-9]{4,12}$/),
            recordingEnabled: fc.boolean(),
            gracePeriodSeconds: fc.integer({ min: 0, max: 900 }),
          }),
          (input) => {
            _clearAllState();

            const config = createValidHostConfig({
              recordingEnabled: input.recordingEnabled,
              gracePeriodSeconds: input.gracePeriodSeconds,
            });

            // Before session: policy change allowed
            expect(canApplyPolicyChange(input.sessionId)).toBe(true);

            // During session: policy change blocked
            registerActiveSession(input.sessionId, config);
            expect(canApplyPolicyChange(input.sessionId)).toBe(false);

            // After session: policy change allowed again
            deregisterSession(input.sessionId);
            expect(canApplyPolicyChange(input.sessionId)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
