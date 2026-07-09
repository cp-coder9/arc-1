/**
 * Registration Service — Unit Tests
 *
 * Tests for Host Agent first-launch authentication, machine registration,
 * system info collection, and Windows version checking.
 *
 * Requirements: 1.1, 1.5, 1.7
 */

// @vitest-environment node

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  authenticate,
  registerHost,
  getSystemInfo,
  checkWindowsVersion,
  extractBuildNumber,
  hasExceededAuthAttempts,
  setPlatformApiClient,
  _resetAuthAttempts,
  _getAuthAttempts,
  type AuthCredentials,
  type MachineInfo,
  type PlatformApiClient,
} from '../registrationService';

// ─── Mock Platform API Client ───────────────────────────────────────────────────

function createMockApiClient(overrides?: Partial<PlatformApiClient>): PlatformApiClient {
  return {
    signIn: vi.fn().mockResolvedValue({ uid: 'owner-uid-123' }),
    registerHost: vi.fn().mockResolvedValue({ hostId: 'host-generated-id' }),
    ...overrides,
  };
}

function createValidMachineInfo(): MachineInfo {
  return {
    machineName: 'WORKSTATION-01',
    osVersion: 'Windows 11 Build 22631',
    cpuModel: 'Intel Core i7-13700K',
    ramMb: 32768,
    gpuModel: 'NVIDIA GeForce RTX 4070',
    storageGb: 1024,
  };
}

// ─── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  _resetAuthAttempts();
  setPlatformApiClient(createMockApiClient());
});

// ─── Authentication ─────────────────────────────────────────────────────────────

describe('authenticate', () => {
  it('should succeed with valid credentials', async () => {
    const credentials: AuthCredentials = {
      email: 'owner@example.com',
      password: 'secure-password-123',
    };

    const result = await authenticate(credentials);

    expect(result.success).toBe(true);
    expect(result.ownerUid).toBe('owner-uid-123');
    expect(result.error).toBeUndefined();
  });

  it('should reset attempt counter on successful auth', async () => {
    const failingClient = createMockApiClient({
      signIn: vi.fn().mockRejectedValueOnce(new Error('Bad credentials')),
    });
    setPlatformApiClient(failingClient);

    // First attempt fails
    await authenticate({ email: 'test@test.com', password: 'wrong' });
    expect(_getAuthAttempts()).toBe(1);

    // Replace with working client
    setPlatformApiClient(createMockApiClient());

    // Successful auth resets counter
    const result = await authenticate({ email: 'test@test.com', password: 'correct' });
    expect(result.success).toBe(true);
    expect(_getAuthAttempts()).toBe(0);
  });

  it('should fail with empty email', async () => {
    const result = await authenticate({ email: '', password: 'password' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Email is required');
    expect(_getAuthAttempts()).toBe(1);
  });

  it('should fail with empty password', async () => {
    const result = await authenticate({ email: 'test@test.com', password: '' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Password is required');
    expect(_getAuthAttempts()).toBe(1);
  });

  it('should fail with whitespace-only email', async () => {
    const result = await authenticate({ email: '   ', password: 'password' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Email is required');
  });

  it('should fail when platform API rejects credentials', async () => {
    const client = createMockApiClient({
      signIn: vi.fn().mockRejectedValue(new Error('Invalid email or password')),
    });
    setPlatformApiClient(client);

    const result = await authenticate({ email: 'test@test.com', password: 'wrong' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid email or password');
    expect(result.error).toContain('2 attempts remaining');
  });

  it('should show decreasing attempts remaining', async () => {
    const client = createMockApiClient({
      signIn: vi.fn().mockRejectedValue(new Error('Auth failed')),
    });
    setPlatformApiClient(client);

    const result1 = await authenticate({ email: 'a@b.com', password: 'x' });
    expect(result1.error).toContain('2 attempts remaining');

    const result2 = await authenticate({ email: 'a@b.com', password: 'x' });
    expect(result2.error).toContain('1 attempt remaining');

    const result3 = await authenticate({ email: 'a@b.com', password: 'x' });
    expect(result3.error).toContain('exceeded');
  });

  it('should terminate after 3 consecutive failures (Requirement 1.7)', async () => {
    const client = createMockApiClient({
      signIn: vi.fn().mockRejectedValue(new Error('Bad credentials')),
    });
    setPlatformApiClient(client);

    // Exhaust 3 attempts
    await authenticate({ email: 'a@b.com', password: 'x' });
    await authenticate({ email: 'a@b.com', password: 'x' });
    await authenticate({ email: 'a@b.com', password: 'x' });

    expect(hasExceededAuthAttempts()).toBe(true);
    expect(_getAuthAttempts()).toBe(3);

    // Fourth attempt should immediately indicate termination
    const result = await authenticate({ email: 'a@b.com', password: 'x' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('exceeded');
    expect(result.error).toContain('terminate');
  });

  it('should not increment attempts beyond max', async () => {
    const client = createMockApiClient({
      signIn: vi.fn().mockRejectedValue(new Error('Bad')),
    });
    setPlatformApiClient(client);

    // Exhaust attempts
    await authenticate({ email: 'a@b.com', password: 'x' });
    await authenticate({ email: 'a@b.com', password: 'x' });
    await authenticate({ email: 'a@b.com', password: 'x' });

    // Further attempts return termination message but don't increment
    await authenticate({ email: 'a@b.com', password: 'x' });
    expect(_getAuthAttempts()).toBe(3);
  });

  it('should trim email before sending to API', async () => {
    const client = createMockApiClient();
    setPlatformApiClient(client);

    await authenticate({ email: '  owner@example.com  ', password: 'pass' });

    expect(client.signIn).toHaveBeenCalledWith('owner@example.com', 'pass');
  });
});

// ─── Host Registration ──────────────────────────────────────────────────────────

describe('registerHost', () => {
  it('should create a valid host registration record', async () => {
    const machineInfo = createValidMachineInfo();
    const result = await registerHost('owner-uid-123', machineInfo);

    expect(result.hostId).toBeDefined();
    expect(result.ownerUid).toBe('owner-uid-123');
    expect(result.machineName).toBe('WORKSTATION-01');
    expect(result.osVersion).toBe('Windows 11 Build 22631');
    expect(result.hardwareSpecs.cpuModel).toBe('Intel Core i7-13700K');
    expect(result.hardwareSpecs.ramMb).toBe(32768);
    expect(result.hardwareSpecs.gpuModel).toBe('NVIDIA GeForce RTX 4070');
    expect(result.hardwareSpecs.storageGb).toBe(1024);
    expect(result.status).toBe('online');
    expect(result.registrationTimestamp).toBeInstanceOf(Date);
  });

  it('should use hostId returned from platform API', async () => {
    const client = createMockApiClient({
      registerHost: vi.fn().mockResolvedValue({ hostId: 'platform-host-id' }),
    });
    setPlatformApiClient(client);

    const result = await registerHost('owner-uid', createValidMachineInfo());
    expect(result.hostId).toBe('platform-host-id');
  });

  it('should truncate machine name to 64 characters', async () => {
    const machineInfo = createValidMachineInfo();
    machineInfo.machineName = 'A'.repeat(100);

    const result = await registerHost('owner-uid', machineInfo);
    expect(result.machineName.length).toBe(64);
  });

  it('should truncate CPU model to 128 characters', async () => {
    const machineInfo = createValidMachineInfo();
    machineInfo.cpuModel = 'X'.repeat(200);

    const result = await registerHost('owner-uid', machineInfo);
    expect(result.hardwareSpecs.cpuModel.length).toBe(128);
  });

  it('should truncate GPU model to 128 characters', async () => {
    const machineInfo = createValidMachineInfo();
    machineInfo.gpuModel = 'G'.repeat(200);

    const result = await registerHost('owner-uid', machineInfo);
    expect(result.hardwareSpecs.gpuModel.length).toBe(128);
  });

  it('should round RAM to nearest integer', async () => {
    const machineInfo = createValidMachineInfo();
    machineInfo.ramMb = 16383.7;

    const result = await registerHost('owner-uid', machineInfo);
    expect(result.hardwareSpecs.ramMb).toBe(16384);
  });

  it('should round storage to nearest integer', async () => {
    const machineInfo = createValidMachineInfo();
    machineInfo.storageGb = 511.9;

    const result = await registerHost('owner-uid', machineInfo);
    expect(result.hardwareSpecs.storageGb).toBe(512);
  });

  it('should clamp negative RAM to 0', async () => {
    const machineInfo = createValidMachineInfo();
    machineInfo.ramMb = -100;

    const result = await registerHost('owner-uid', machineInfo);
    expect(result.hardwareSpecs.ramMb).toBe(0);
  });

  it('should set default configuration', async () => {
    const result = await registerHost('owner-uid', createValidMachineInfo());

    expect(result.configuration.gracePeriodSeconds).toBe(300);
    expect(result.configuration.clipboardPolicy).toBe('disabled');
    expect(result.configuration.sessionWorkspacePath).toBe('C:\\ArchitexSessions');
    expect(result.configuration.recordingEnabled).toBe(false);
  });

  it('should throw for empty ownerUid', async () => {
    await expect(registerHost('', createValidMachineInfo())).rejects.toThrow(
      'Owner UID is required',
    );
  });

  it('should throw for whitespace-only ownerUid', async () => {
    await expect(registerHost('   ', createValidMachineInfo())).rejects.toThrow(
      'Owner UID is required',
    );
  });

  it('should throw for unsupported OS version (Requirement 1.5)', async () => {
    const machineInfo = createValidMachineInfo();
    machineInfo.osVersion = 'Windows 10 Build 17134'; // Version 1803, below 1903

    await expect(registerHost('owner-uid', machineInfo)).rejects.toThrow(
      'Unsupported Windows version',
    );
  });

  it('should throw with unsupported_os code for old Windows', async () => {
    const machineInfo = createValidMachineInfo();
    machineInfo.osVersion = 'Windows 10 Build 10240'; // Windows 10 RTM

    try {
      await registerHost('owner-uid', machineInfo);
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.code).toBe('unsupported_os');
      expect(err.retryable).toBe(false);
    }
  });

  it('should throw with registration_failed code on API error', async () => {
    const client = createMockApiClient({
      registerHost: vi.fn().mockRejectedValue(new Error('Network error')),
    });
    setPlatformApiClient(client);

    try {
      await registerHost('owner-uid', createValidMachineInfo());
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.code).toBe('registration_failed');
      expect(err.retryable).toBe(true);
      expect(err.message).toContain('Network error');
    }
  });

  it('should trim ownerUid whitespace', async () => {
    const result = await registerHost('  owner-uid  ', createValidMachineInfo());
    expect(result.ownerUid).toBe('owner-uid');
  });
});

// ─── Windows Version Check ──────────────────────────────────────────────────────

describe('checkWindowsVersion', () => {
  it('should support Windows 11 (build 22000+)', () => {
    const result = checkWindowsVersion('Windows 11 Build 22631');
    expect(result.supported).toBe(true);
    expect(result.version).toBe('Windows 11 Build 22631');
  });

  it('should support Windows 11 23H2', () => {
    const result = checkWindowsVersion('Windows 11 Build 22631');
    expect(result.supported).toBe(true);
  });

  it('should support Windows 10 build 1903 (build 18362)', () => {
    const result = checkWindowsVersion('Windows 10 Build 18362');
    expect(result.supported).toBe(true);
  });

  it('should support Windows 10 build 19045 (22H2)', () => {
    const result = checkWindowsVersion('Windows 10 Build 19045');
    expect(result.supported).toBe(true);
  });

  it('should NOT support Windows 10 build 17763 (1809)', () => {
    const result = checkWindowsVersion('Windows 10 Build 17763');
    expect(result.supported).toBe(false);
  });

  it('should NOT support Windows 10 build 17134 (1803)', () => {
    const result = checkWindowsVersion('Windows 10 Build 17134');
    expect(result.supported).toBe(false);
  });

  it('should NOT support Windows 10 RTM (build 10240)', () => {
    const result = checkWindowsVersion('Windows 10 Build 10240');
    expect(result.supported).toBe(false);
  });

  it('should handle raw os.release format (10.0.22631)', () => {
    const result = checkWindowsVersion('10.0.22631');
    expect(result.supported).toBe(true);
  });

  it('should handle raw os.release format for old Windows (10.0.17134)', () => {
    const result = checkWindowsVersion('10.0.17134');
    expect(result.supported).toBe(false);
  });

  it('should return unsupported for non-parseable version strings', () => {
    const result = checkWindowsVersion('Linux 5.15.0');
    expect(result.supported).toBe(false);
  });

  it('should return unsupported for empty string', () => {
    const result = checkWindowsVersion('');
    expect(result.supported).toBe(false);
  });

  it('should preserve the version string in the result', () => {
    const result = checkWindowsVersion('Windows 10 Build 19045');
    expect(result.version).toBe('Windows 10 Build 19045');
  });
});

// ─── Build Number Extraction ────────────────────────────────────────────────────

describe('extractBuildNumber', () => {
  it('should extract from "Windows 11 Build 22631"', () => {
    expect(extractBuildNumber('Windows 11 Build 22631')).toBe(22631);
  });

  it('should extract from "Windows 10 Build 18362"', () => {
    expect(extractBuildNumber('Windows 10 Build 18362')).toBe(18362);
  });

  it('should extract from raw "10.0.22631" format', () => {
    expect(extractBuildNumber('10.0.22631')).toBe(22631);
  });

  it('should extract from "10.0.19045" format', () => {
    expect(extractBuildNumber('10.0.19045')).toBe(19045);
  });

  it('should return null for non-parseable strings', () => {
    expect(extractBuildNumber('Linux 5.15')).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(extractBuildNumber('')).toBeNull();
  });

  it('should be case-insensitive for "Build"', () => {
    expect(extractBuildNumber('Windows 11 build 22631')).toBe(22631);
    expect(extractBuildNumber('Windows 11 BUILD 22631')).toBe(22631);
  });
});

// ─── System Info ────────────────────────────────────────────────────────────────

describe('getSystemInfo', () => {
  it('should return a MachineInfo object with all required fields', () => {
    const info = getSystemInfo();

    expect(info.machineName).toBeDefined();
    expect(typeof info.machineName).toBe('string');
    expect(info.machineName.length).toBeLessThanOrEqual(64);

    expect(info.osVersion).toBeDefined();
    expect(typeof info.osVersion).toBe('string');

    expect(info.cpuModel).toBeDefined();
    expect(typeof info.cpuModel).toBe('string');
    expect(info.cpuModel.length).toBeLessThanOrEqual(128);

    expect(info.ramMb).toBeDefined();
    expect(typeof info.ramMb).toBe('number');
    expect(info.ramMb).toBeGreaterThan(0);

    expect(info.gpuModel).toBeDefined();
    expect(typeof info.gpuModel).toBe('string');

    expect(info.storageGb).toBeDefined();
    expect(typeof info.storageGb).toBe('number');
    expect(info.storageGb).toBeGreaterThanOrEqual(0);
  });

  it('should truncate machine name to max 64 characters', () => {
    const info = getSystemInfo();
    expect(info.machineName.length).toBeLessThanOrEqual(64);
  });

  it('should report positive RAM', () => {
    const info = getSystemInfo();
    expect(info.ramMb).toBeGreaterThan(0);
    expect(Number.isInteger(info.ramMb)).toBe(true);
  });
});

// ─── Auth Attempt State ─────────────────────────────────────────────────────────

describe('hasExceededAuthAttempts', () => {
  it('should return false initially', () => {
    expect(hasExceededAuthAttempts()).toBe(false);
  });

  it('should return true after 3 failures', async () => {
    const client = createMockApiClient({
      signIn: vi.fn().mockRejectedValue(new Error('Bad')),
    });
    setPlatformApiClient(client);

    await authenticate({ email: 'a@b.com', password: 'x' });
    await authenticate({ email: 'a@b.com', password: 'x' });
    await authenticate({ email: 'a@b.com', password: 'x' });

    expect(hasExceededAuthAttempts()).toBe(true);
  });

  it('should return false after reset', async () => {
    const client = createMockApiClient({
      signIn: vi.fn().mockRejectedValue(new Error('Bad')),
    });
    setPlatformApiClient(client);

    await authenticate({ email: 'a@b.com', password: 'x' });
    await authenticate({ email: 'a@b.com', password: 'x' });
    await authenticate({ email: 'a@b.com', password: 'x' });

    _resetAuthAttempts();
    expect(hasExceededAuthAttempts()).toBe(false);
  });
});
