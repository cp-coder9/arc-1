/**
 * Host Agent — Registration Service
 *
 * Handles first-launch authentication via Architex platform credentials
 * and machine registration into the `remote_desktop_hosts` Firestore collection.
 *
 * Requirements: 1.1, 1.5, 1.7
 *
 * Functions:
 * - authenticate(credentials) — authenticates with Architex platform API
 * - registerHost(ownerUid, machineInfo) — writes host record to Firestore
 * - getSystemInfo() — collects machine hardware/OS details
 * - checkWindowsVersion() — verifies Win10 build 1903+ or Win11 support
 */

import os from 'os';
import { execSync } from 'child_process';
import crypto from 'crypto';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface AuthResult {
  success: boolean;
  ownerUid?: string;
  error?: string;
}

export interface MachineInfo {
  machineName: string;
  osVersion: string;
  cpuModel: string;
  ramMb: number;
  gpuModel: string;
  storageGb: number;
}

export interface HostRegistration {
  hostId: string;
  ownerUid: string;
  machineName: string;
  osVersion: string;
  hardwareSpecs: {
    cpuModel: string;
    ramMb: number;
    gpuModel: string;
    storageGb: number;
  };
  status: 'online' | 'offline' | 'in_session';
  registrationTimestamp: Date;
  configuration: {
    gracePeriodSeconds: number;
    clipboardPolicy: 'enabled' | 'disabled';
    sessionWorkspacePath: string;
    recordingEnabled: boolean;
  };
}

export interface RegistrationError {
  code: 'auth_failed' | 'registration_failed' | 'unsupported_os';
  message: string;
  retryable: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const MAX_AUTH_ATTEMPTS = 3;
const MAX_MACHINE_NAME_LENGTH = 64;
const MIN_WIN10_BUILD = 18362; // Windows 10 version 1903

// ─── State ──────────────────────────────────────────────────────────────────────

let authAttempts = 0;

/**
 * Reset the auth attempt counter. Exposed for testing.
 */
export function _resetAuthAttempts(): void {
  authAttempts = 0;
}

/**
 * Get current auth attempt count. Exposed for testing.
 */
export function _getAuthAttempts(): number {
  return authAttempts;
}

// ─── Platform API Client (injectable for testing) ───────────────────────────────

export interface PlatformApiClient {
  signIn(email: string, password: string): Promise<{ uid: string }>;
  registerHost(hostRecord: HostRegistration): Promise<{ hostId: string }>;
}

let platformApi: PlatformApiClient | null = null;

/**
 * Set the platform API client. Must be called before authenticate/registerHost.
 */
export function setPlatformApiClient(client: PlatformApiClient): void {
  platformApi = client;
}

/**
 * Get the current platform API client. Throws if not configured.
 */
function getApiClient(): PlatformApiClient {
  if (!platformApi) {
    throw createError(
      'registration_failed',
      'Platform API client not configured. Call setPlatformApiClient() first.',
      false,
    );
  }
  return platformApi;
}

// ─── Core Functions ─────────────────────────────────────────────────────────────

/**
 * Authenticate the Resource Owner with Architex platform credentials.
 *
 * Implements a 3-attempt auth failure limit. After 3 consecutive failures,
 * the function signals that the Host Agent should terminate without
 * writing a host record.
 *
 * Requirement 1.1 (first-launch auth), 1.7 (3-attempt limit with termination)
 */
export async function authenticate(credentials: AuthCredentials): Promise<AuthResult> {
  // Validate credentials format
  if (!credentials.email || !credentials.email.trim()) {
    authAttempts++;
    return buildAuthFailure('Email is required');
  }

  if (!credentials.password || !credentials.password.trim()) {
    authAttempts++;
    return buildAuthFailure('Password is required');
  }

  // Check if max attempts already reached
  if (authAttempts >= MAX_AUTH_ATTEMPTS) {
    return {
      success: false,
      error: `Maximum authentication attempts (${MAX_AUTH_ATTEMPTS}) exceeded. Host Agent will terminate.`,
    };
  }

  try {
    const client = getApiClient();
    const result = await client.signIn(credentials.email.trim(), credentials.password);

    // Success — reset attempt counter
    authAttempts = 0;

    return {
      success: true,
      ownerUid: result.uid,
    };
  } catch (err: unknown) {
    authAttempts++;

    const message = err instanceof Error ? err.message : 'Authentication failed';
    return buildAuthFailure(message);
  }
}

/**
 * Register the host machine with the Architex platform.
 *
 * Writes a record to the `remote_desktop_hosts` collection containing:
 * host ID, owner UID, machine name (max 64 chars), OS version,
 * hardware specs, and registration timestamp.
 *
 * Requirement 1.1
 */
export async function registerHost(
  ownerUid: string,
  machineInfo: MachineInfo,
): Promise<HostRegistration> {
  if (!ownerUid || !ownerUid.trim()) {
    throw createError('registration_failed', 'Owner UID is required', false);
  }

  // Validate OS support before registration
  const versionCheck = checkWindowsVersion(machineInfo.osVersion);
  if (!versionCheck.supported) {
    throw createError(
      'unsupported_os',
      `Unsupported Windows version: ${versionCheck.version}. Requires Windows 10 build 1903+ or Windows 11.`,
      false,
    );
  }

  // Truncate machine name to 64 characters
  const machineName = machineInfo.machineName.slice(0, MAX_MACHINE_NAME_LENGTH);

  const hostId = generateHostId();
  const registration: HostRegistration = {
    hostId,
    ownerUid: ownerUid.trim(),
    machineName,
    osVersion: machineInfo.osVersion,
    hardwareSpecs: {
      cpuModel: machineInfo.cpuModel.slice(0, 128),
      ramMb: Math.max(0, Math.round(machineInfo.ramMb)),
      gpuModel: machineInfo.gpuModel.slice(0, 128),
      storageGb: Math.max(0, Math.round(machineInfo.storageGb)),
    },
    status: 'online',
    registrationTimestamp: new Date(),
    configuration: {
      gracePeriodSeconds: 300, // Default 5 minutes
      clipboardPolicy: 'disabled',
      sessionWorkspacePath: `C:\\ArchitexSessions`,
      recordingEnabled: false,
    },
  };

  // Write to platform
  const client = getApiClient();
  try {
    const result = await client.registerHost(registration);
    registration.hostId = result.hostId || hostId;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    throw createError('registration_failed', message, true);
  }

  return registration;
}

/**
 * Collect system information from the local machine.
 *
 * Uses Node.js `os` module for hostname, RAM, and CPU.
 * Uses `child_process` for GPU and storage details on Windows.
 *
 * Requirement 1.1 (hardware specs collection)
 */
export function getSystemInfo(): MachineInfo {
  const machineName = os.hostname().slice(0, MAX_MACHINE_NAME_LENGTH);
  const osVersion = getWindowsVersion();
  const cpuModel = getCpuModel();
  const ramMb = Math.round(os.totalmem() / (1024 * 1024));
  const gpuModel = getGpuModel();
  const storageGb = getStorageGb();

  return {
    machineName,
    osVersion,
    cpuModel,
    ramMb,
    gpuModel,
    storageGb,
  };
}

/**
 * Check if the current Windows version is supported.
 *
 * Supports:
 * - Windows 10 build 1903+ (build number 18362+)
 * - Windows 11 (build number 22000+)
 *
 * Requirement 1.5
 */
export function checkWindowsVersion(osVersionOverride?: string): {
  supported: boolean;
  version: string;
} {
  const version = osVersionOverride !== undefined ? osVersionOverride : getWindowsVersion();

  // Parse build number from version string
  const buildNumber = extractBuildNumber(version);

  if (buildNumber === null) {
    return { supported: false, version };
  }

  // Windows 10 1903 = build 18362, Windows 11 starts at build 22000
  const supported = buildNumber >= MIN_WIN10_BUILD;

  return { supported, version };
}

// ─── Helper Functions ───────────────────────────────────────────────────────────

function buildAuthFailure(message: string): AuthResult {
  const remaining = MAX_AUTH_ATTEMPTS - authAttempts;
  const terminateMessage =
    remaining <= 0
      ? `Maximum authentication attempts (${MAX_AUTH_ATTEMPTS}) exceeded. Host Agent will terminate.`
      : `${message} (${remaining} attempt${remaining === 1 ? '' : 's'} remaining)`;

  return {
    success: false,
    error: terminateMessage,
  };
}

function createError(
  code: RegistrationError['code'],
  message: string,
  retryable: boolean,
): RegistrationError & Error {
  const err = new Error(message) as Error & RegistrationError;
  err.code = code;
  err.retryable = retryable;
  return err;
}

function generateHostId(): string {
  return `host-${crypto.randomUUID()}`;
}

/**
 * Get Windows version string from the OS release.
 * Format: "Windows XX Build NNNNN" or the raw os.release() value.
 */
function getWindowsVersion(): string {
  try {
    const release = os.release(); // e.g. "10.0.22631"
    const platform = os.platform();

    if (platform !== 'win32') {
      return `${platform} ${release}`;
    }

    const parts = release.split('.');
    const buildNumber = parseInt(parts[2] || '0', 10);

    if (buildNumber >= 22000) {
      return `Windows 11 Build ${buildNumber}`;
    } else {
      return `Windows 10 Build ${buildNumber}`;
    }
  } catch {
    return os.release();
  }
}

function getCpuModel(): string {
  const cpus = os.cpus();
  if (cpus.length > 0) {
    return cpus[0].model.trim().slice(0, 128);
  }
  return 'Unknown CPU';
}

function getGpuModel(): string {
  try {
    if (os.platform() !== 'win32') {
      return 'Unknown GPU (non-Windows)';
    }
    const output = execSync(
      'wmic path win32_VideoController get Name /format:value',
      { encoding: 'utf8', timeout: 5000 },
    );
    const match = output.match(/Name=(.+)/);
    if (match && match[1]) {
      return match[1].trim().slice(0, 128);
    }
    return 'Unknown GPU';
  } catch {
    return 'Unknown GPU';
  }
}

function getStorageGb(): number {
  try {
    if (os.platform() !== 'win32') {
      return 0;
    }
    const output = execSync(
      'wmic logicaldisk where "DeviceID=\'C:\'" get Size /format:value',
      { encoding: 'utf8', timeout: 5000 },
    );
    const match = output.match(/Size=(\d+)/);
    if (match && match[1]) {
      return Math.round(parseInt(match[1], 10) / (1024 * 1024 * 1024));
    }
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Extract the build number from a Windows version string.
 * Handles formats like:
 * - "Windows 11 Build 22631"
 * - "Windows 10 Build 19045"
 * - "10.0.22631" (raw os.release format)
 * - "Windows 11 23H2"
 */
export function extractBuildNumber(version: string): number | null {
  // Try "Build NNNNN" pattern
  const buildMatch = version.match(/Build\s+(\d+)/i);
  if (buildMatch) {
    return parseInt(buildMatch[1], 10);
  }

  // Try raw "X.Y.BUILD" pattern (e.g. "10.0.22631")
  const rawMatch = version.match(/\d+\.\d+\.(\d+)/);
  if (rawMatch) {
    return parseInt(rawMatch[1], 10);
  }

  return null;
}

/**
 * Check whether the maximum authentication attempts have been reached.
 * When true, the Host Agent should terminate.
 */
export function hasExceededAuthAttempts(): boolean {
  return authAttempts >= MAX_AUTH_ATTEMPTS;
}
