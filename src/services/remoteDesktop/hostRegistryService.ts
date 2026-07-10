/**
 * Remote Desktop Core — Host Registry Service
 *
 * Manages host lifecycle including registration, heartbeat processing,
 * offline detection, deactivation cascade, and app allowlist CRUD with
 * referential integrity. Links hosts to `resource_listings` via resourceListingId.
 *
 * Requirements: 5 (Data Model Integration), 11 (Host Agent Distribution/Update),
 *               1.5 (Agent Version Check), 13 (Data Model)
 *
 * Design Property 10 — Host Deactivation Cascade:
 * ∀ host where host.status === 'maintenance' ∨ host.deleted,
 *   ∀ app where app.hostId === host.hostId: app.validationStatus === 'unavailable'
 *   ∧ evaluateSessionGate({ hostId: host.hostId, ... }).canStart === false
 */

import { randomUUID } from 'node:crypto';
import type {
  HostRecord,
  HostStatus,
  HostHardwareSpecs,
  HostConfig,
  AppRecord,
  AppValidationStatus,
} from './types';
import { HOST_STATUS, REMOTE_DESKTOP_DEFAULTS } from './types';

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Minimum supported agent version (semver) — reject anything below */
export const MIN_SUPPORTED_VERSION = '1.0.0';

/** Current platform agent version */
export const CURRENT_AGENT_VERSION = '3.0.0';

/** Maximum apps per host allowlist */
export const MAX_APPS_PER_HOST = REMOTE_DESKTOP_DEFAULTS.MAX_APPS_PER_HOST;

/** Heartbeat timeout in ms (90 seconds) */
export const HEARTBEAT_TIMEOUT_MS = REMOTE_DESKTOP_DEFAULTS.HEARTBEAT_TIMEOUT_MS;

/** Maximum major version difference before flagging as outdated */
export const MAX_MAJOR_VERSION_LAG = 2;

// ─── In-Memory Stores ───────────────────────────────────────────────────────────

const hostStore: Map<string, HostRecord> = new Map();
const appStore: Map<string, AppRecord> = new Map();

// ─── Input Types ────────────────────────────────────────────────────────────────

export interface RegisterHostInput {
  ownerUid: string;
  resourceListingId: string;
  machineName: string;
  osVersion: string;
  hardwareSpecs: HostHardwareSpecs;
  agentVersion: string;
  config: HostConfig;
}

export interface AddAppInput {
  displayName: string;
  executablePath: string;
  softwareCategory: string;
}

// ─── Result Types ───────────────────────────────────────────────────────────────

export interface AgentVersionResult {
  supported: boolean;
  outdated: boolean;
  currentVersion: string;
  providedVersion: string;
  message: string;
}

export interface DeactivationResult {
  hostId: string;
  appsMarkedUnavailable: number;
  previousStatus: HostStatus;
}

export interface OfflineDetectionResult {
  hostsMarkedOffline: string[];
  count: number;
}

// ─── Semver Utilities ───────────────────────────────────────────────────────────

/**
 * Parse a semver string into major/minor/patch components.
 * Returns null if the string is not valid semver.
 */
export function parseSemver(version: string): { major: number; minor: number; patch: number } | null {
  if (!version || typeof version !== 'string') return null;
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Compare two semver versions. Returns:
 *  -1 if a < b
 *   0 if a === b
 *   1 if a > b
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const parsedA = parseSemver(a);
  const parsedB = parseSemver(b);
  if (!parsedA || !parsedB) return 0;

  if (parsedA.major !== parsedB.major) return parsedA.major < parsedB.major ? -1 : 1;
  if (parsedA.minor !== parsedB.minor) return parsedA.minor < parsedB.minor ? -1 : 1;
  if (parsedA.patch !== parsedB.patch) return parsedA.patch < parsedB.patch ? -1 : 1;
  return 0;
}

// ─── Agent Version Validation ───────────────────────────────────────────────────

/**
 * Validate the agent version against platform requirements.
 *
 * - Reject: version < 1.0.0 (unsupported — cannot do app-level capture)
 * - Flag outdated: current major - agent major > 2
 * - Accept: all others
 *
 * Requirement 1.5: agent version must support app-level window capture.
 * Requirement 11.3: more than 2 major versions behind → refuse session tokens.
 */
export function validateAgentVersion(version: string): AgentVersionResult {
  const parsed = parseSemver(version);
  const currentParsed = parseSemver(CURRENT_AGENT_VERSION);

  if (!parsed) {
    return {
      supported: false,
      outdated: false,
      currentVersion: CURRENT_AGENT_VERSION,
      providedVersion: version,
      message: 'Invalid agent version format. Expected semver (e.g., 1.2.3).',
    };
  }

  // Reject if below minimum supported version
  if (compareSemver(version, MIN_SUPPORTED_VERSION) < 0) {
    return {
      supported: false,
      outdated: false,
      currentVersion: CURRENT_AGENT_VERSION,
      providedVersion: version,
      message: `Agent version ${version} is unsupported. Minimum required: ${MIN_SUPPORTED_VERSION}.`,
    };
  }

  // Check if outdated (more than 2 major versions behind)
  const majorLag = currentParsed!.major - parsed.major;
  if (majorLag > MAX_MAJOR_VERSION_LAG) {
    return {
      supported: true,
      outdated: true,
      currentVersion: CURRENT_AGENT_VERSION,
      providedVersion: version,
      message: `Agent version ${version} is more than ${MAX_MAJOR_VERSION_LAG} major versions behind current (${CURRENT_AGENT_VERSION}). Update required for new sessions.`,
    };
  }

  return {
    supported: true,
    outdated: false,
    currentVersion: CURRENT_AGENT_VERSION,
    providedVersion: version,
    message: 'Agent version is supported and up to date.',
  };
}

// ─── Host Registration ──────────────────────────────────────────────────────────

/**
 * Register a new host with the platform.
 *
 * Validates the agent version before accepting registration.
 * Links the host to a resource_listings entry via resourceListingId.
 *
 * Requirement 5.1: remote_desktop_hosts contains resourceListingId referencing resource_listings.
 * Requirement 1.5: reject registration if agent version doesn't support app-level capture.
 * Requirement 13.1: host record schema enforcement.
 *
 * @throws Error if agent version is unsupported or input is invalid
 */
export function registerHost(input: RegisterHostInput): HostRecord {
  // Validate required fields
  if (!input.ownerUid || input.ownerUid.trim().length === 0) {
    throw new Error('Owner UID is required');
  }
  if (!input.resourceListingId || input.resourceListingId.trim().length === 0) {
    throw new Error('Resource listing ID is required');
  }
  if (!input.machineName || input.machineName.trim().length === 0) {
    throw new Error('Machine name is required');
  }
  if (input.machineName.length > 64) {
    throw new Error('Machine name must not exceed 64 characters');
  }
  if (!input.osVersion || input.osVersion.trim().length === 0) {
    throw new Error('OS version is required');
  }
  if (input.osVersion.length > 64) {
    throw new Error('OS version must not exceed 64 characters');
  }
  if (!input.agentVersion || input.agentVersion.trim().length === 0) {
    throw new Error('Agent version is required');
  }
  if (input.agentVersion.length > 20) {
    throw new Error('Agent version must not exceed 20 characters');
  }

  // Validate agent version
  const versionResult = validateAgentVersion(input.agentVersion);
  if (!versionResult.supported) {
    throw new Error(`agent_version_unsupported: ${versionResult.message}`);
  }

  // Validate hardware specs
  if (!input.hardwareSpecs) {
    throw new Error('Hardware specs are required');
  }
  if (!input.hardwareSpecs.cpu || input.hardwareSpecs.cpu.length > 128) {
    throw new Error('CPU model is required and must not exceed 128 characters');
  }
  if (typeof input.hardwareSpecs.ramMb !== 'number' || input.hardwareSpecs.ramMb <= 0) {
    throw new Error('RAM (MB) must be a positive number');
  }
  if (!input.hardwareSpecs.gpu || input.hardwareSpecs.gpu.length > 128) {
    throw new Error('GPU model is required and must not exceed 128 characters');
  }
  if (typeof input.hardwareSpecs.storageGb !== 'number' || input.hardwareSpecs.storageGb <= 0) {
    throw new Error('Storage (GB) must be a positive number');
  }

  // Validate config
  if (!input.config) {
    throw new Error('Configuration is required');
  }
  if (
    typeof input.config.gracePeriodSeconds !== 'number' ||
    input.config.gracePeriodSeconds < 0 ||
    input.config.gracePeriodSeconds > 900
  ) {
    throw new Error('Grace period must be between 0 and 900 seconds');
  }
  if (input.config.clipboardPolicy !== 'enabled' && input.config.clipboardPolicy !== 'disabled') {
    throw new Error('Clipboard policy must be "enabled" or "disabled"');
  }
  if (typeof input.config.recordingEnabled !== 'boolean') {
    throw new Error('Recording enabled must be a boolean');
  }
  if (!input.config.sessionWorkspacePath || input.config.sessionWorkspacePath.length > 512) {
    throw new Error('Session workspace path is required and must not exceed 512 characters');
  }
  if (!input.config.consentTextVersion || input.config.consentTextVersion.length > 32) {
    throw new Error('Consent text version is required and must not exceed 32 characters');
  }

  const now = new Date().toISOString();
  const hostId = randomUUID();

  const host: HostRecord = {
    hostId,
    ownerUid: input.ownerUid.trim(),
    resourceListingId: input.resourceListingId.trim(),
    machineName: input.machineName.trim(),
    osVersion: input.osVersion.trim(),
    hardwareSpecs: { ...input.hardwareSpecs },
    status: HOST_STATUS.ONLINE as HostStatus,
    lastHeartbeat: now,
    registeredAt: now,
    agentVersion: input.agentVersion.trim(),
    config: { ...input.config },
  };

  hostStore.set(hostId, host);
  return host;
}

// ─── Heartbeat Processing ───────────────────────────────────────────────────────

/**
 * Process a heartbeat from a host agent.
 *
 * Updates the lastHeartbeat timestamp and optionally the host status.
 * Valid heartbeat statuses: online, idle (mapped to 'online'), in_session.
 *
 * Requirement 4.1d: host heartbeat < 90s considered fresh.
 * Requirement 13.1: status field update.
 *
 * @throws Error if host not found
 */
export function processHeartbeat(
  hostId: string,
  status: 'online' | 'idle' | 'in_session',
  currentTime?: string,
): HostRecord {
  const host = hostStore.get(hostId);
  if (!host) {
    throw new Error(`Host not found: ${hostId}`);
  }

  // Hosts in maintenance cannot process heartbeats
  if (host.status === HOST_STATUS.MAINTENANCE) {
    throw new Error(`Host ${hostId} is in maintenance mode and cannot process heartbeats`);
  }

  const now = currentTime || new Date().toISOString();

  // Map 'idle' to 'online' for storage (the gate service treats both as valid)
  const mappedStatus: HostStatus = status === 'idle' ? 'online' : status;

  const updated: HostRecord = {
    ...host,
    lastHeartbeat: now,
    status: mappedStatus,
  };

  hostStore.set(hostId, updated);
  return updated;
}

// ─── Offline Detection ──────────────────────────────────────────────────────────

/**
 * Detect hosts that have gone offline (heartbeat older than 90 seconds).
 *
 * Scans all registered hosts and marks those with stale heartbeats as 'offline'.
 * Does not affect hosts already in 'maintenance' status.
 *
 * Requirement 4.1d: heartbeat timestamp less than 90 seconds old.
 *
 * @param currentTime - Optional current time for testing; defaults to now.
 * @returns List of host IDs that were marked offline.
 */
export function detectOfflineHosts(currentTime?: string): OfflineDetectionResult {
  const now = currentTime ? new Date(currentTime).getTime() : Date.now();
  const markedOffline: string[] = [];

  for (const [hostId, host] of hostStore.entries()) {
    // Skip hosts already offline or in maintenance
    if (host.status === HOST_STATUS.OFFLINE || host.status === HOST_STATUS.MAINTENANCE) {
      continue;
    }

    const lastHeartbeatMs = new Date(host.lastHeartbeat).getTime();
    const age = now - lastHeartbeatMs;

    if (age >= HEARTBEAT_TIMEOUT_MS) {
      const updated: HostRecord = {
        ...host,
        status: HOST_STATUS.OFFLINE as HostStatus,
      };
      hostStore.set(hostId, updated);
      markedOffline.push(hostId);
    }
  }

  return {
    hostsMarkedOffline: markedOffline,
    count: markedOffline.length,
  };
}

// ─── Host Deactivation Cascade ──────────────────────────────────────────────────

/**
 * Deactivate a host — marks it as 'maintenance' and cascades to all apps.
 *
 * Design Property 10:
 * ∀ host where host.status === 'maintenance' ∨ host.deleted,
 *   ∀ app where app.hostId === host.hostId: app.validationStatus === 'unavailable'
 *   ∧ evaluateSessionGate({ hostId: host.hostId, ... }).canStart === false
 *
 * Requirement 5.6: cascade status change to all associated remote_desktop_apps.
 *
 * @throws Error if host not found
 */
export function deactivateHost(hostId: string): DeactivationResult {
  const host = hostStore.get(hostId);
  if (!host) {
    throw new Error(`Host not found: ${hostId}`);
  }

  const previousStatus = host.status;

  // Mark host as maintenance
  const updatedHost: HostRecord = {
    ...host,
    status: HOST_STATUS.MAINTENANCE as HostStatus,
  };
  hostStore.set(hostId, updatedHost);

  // Cascade: mark all apps for this host as unavailable
  let appsMarkedUnavailable = 0;
  for (const [appId, app] of appStore.entries()) {
    if (app.hostId === hostId && app.validationStatus !== 'unavailable') {
      const updatedApp: AppRecord = {
        ...app,
        validationStatus: 'unavailable',
        lastValidated: new Date().toISOString(),
      };
      appStore.set(appId, updatedApp);
      appsMarkedUnavailable++;
    }
  }

  return {
    hostId,
    appsMarkedUnavailable,
    previousStatus,
  };
}

// ─── App Allowlist CRUD ─────────────────────────────────────────────────────────

/**
 * Validate an executable path format (Windows path ending in .exe).
 */
export function validateExecutablePath(path: string): boolean {
  if (!path || path.trim().length === 0) return false;
  if (path.length > 512) return false;

  // Must end with .exe (case-insensitive)
  if (!path.toLowerCase().endsWith('.exe')) return false;

  // Must look like a Windows path (drive letter or UNC)
  const driveLetterPattern = /^[A-Za-z]:\\/;
  const uncPattern = /^\\\\/;
  if (!driveLetterPattern.test(path) && !uncPattern.test(path)) return false;

  return true;
}

/**
 * Add an app to a host's allowlist.
 *
 * Validates:
 * - Host exists (referential integrity, Req 5.4)
 * - Max 20 entries not exceeded (Req 13.2, defaults)
 * - Executable path format (Windows .exe path)
 *
 * @throws Error if host doesn't exist, max entries exceeded, or validation fails
 */
export function addApp(hostId: string, app: AddAppInput): AppRecord {
  // Referential integrity: host must exist
  const host = hostStore.get(hostId);
  if (!host) {
    throw new Error(`Referential integrity violation: host ${hostId} does not exist`);
  }

  // Validate fields
  if (!app.displayName || app.displayName.trim().length === 0) {
    throw new Error('Display name is required');
  }
  if (app.displayName.length > 128) {
    throw new Error('Display name must not exceed 128 characters');
  }
  if (!app.executablePath || app.executablePath.trim().length === 0) {
    throw new Error('Executable path is required');
  }
  if (!validateExecutablePath(app.executablePath)) {
    throw new Error('Executable path must be a valid Windows path ending in .exe');
  }
  if (!app.softwareCategory || app.softwareCategory.trim().length === 0) {
    throw new Error('Software category is required');
  }
  if (app.softwareCategory.length > 64) {
    throw new Error('Software category must not exceed 64 characters');
  }

  // Check max entries
  const existingApps = getAppsByHost(hostId);
  if (existingApps.length >= MAX_APPS_PER_HOST) {
    throw new Error(`Maximum of ${MAX_APPS_PER_HOST} apps per host reached`);
  }

  const now = new Date().toISOString();
  const appId = randomUUID();

  const newApp: AppRecord = {
    appId,
    hostId,
    displayName: app.displayName.trim(),
    executablePath: app.executablePath.trim(),
    softwareCategory: app.softwareCategory.trim(),
    validationStatus: 'valid',
    lastValidated: now,
  };

  appStore.set(appId, newApp);
  return newApp;
}

/**
 * Remove an app from the allowlist.
 *
 * @throws Error if app not found
 */
export function removeApp(appId: string): void {
  if (!appStore.has(appId)) {
    throw new Error(`App not found: ${appId}`);
  }
  appStore.delete(appId);
}

/**
 * Get all apps for a given host.
 */
export function getAppsByHost(hostId: string): AppRecord[] {
  const apps: AppRecord[] = [];
  for (const app of appStore.values()) {
    if (app.hostId === hostId) {
      apps.push({ ...app });
    }
  }
  return apps;
}

/**
 * Get a single app by ID.
 */
export function getApp(appId: string): AppRecord | null {
  const app = appStore.get(appId);
  return app ? { ...app } : null;
}

// ─── Host Queries ───────────────────────────────────────────────────────────────

/**
 * Get a host by ID.
 */
export function getHost(hostId: string): HostRecord | null {
  const host = hostStore.get(hostId);
  return host ? { ...host } : null;
}

/**
 * Get all hosts for a given owner.
 */
export function getHostsByOwner(ownerUid: string): HostRecord[] {
  const hosts: HostRecord[] = [];
  for (const host of hostStore.values()) {
    if (host.ownerUid === ownerUid) {
      hosts.push({ ...host });
    }
  }
  return hosts;
}

// ─── Test Utilities ─────────────────────────────────────────────────────────────

/**
 * Clear all stored data (for testing only).
 * @internal
 */
export function _clearAllState(): void {
  hostStore.clear();
  appStore.clear();
}

/**
 * Get the number of registered hosts (for testing).
 * @internal
 */
export function _getHostCount(): number {
  return hostStore.size;
}

/**
 * Get the total number of apps (for testing).
 * @internal
 */
export function _getAppCount(): number {
  return appStore.size;
}
