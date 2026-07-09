/**
 * Privilege Detection Service
 *
 * Detects whether the Host Agent is running with administrator privileges.
 * When running without admin, app isolation features are disabled but core
 * functions (registration, heartbeat, session brokering) remain active.
 *
 * Implements Requirement 1.6:
 * IF the Host_Agent detects that it is running without administrator privileges,
 * THEN THE Host_Agent SHALL display a warning indicating that app isolation features
 * require elevated permissions and continue operating with app isolation and sandboxing
 * features disabled while all other functions (registration, heartbeat reporting,
 * session brokering) remain active.
 */

/** Features that require administrator privileges */
const ADMIN_REQUIRED_FEATURES = [
  'app_isolation',
  'process_monitoring',
  'input_filtering',
  'file_dialog_restriction',
] as const;

/** Features that work without administrator privileges */
const STANDARD_USER_FEATURES = [
  'registration',
  'heartbeat',
  'session_brokering',
  'app_capture',
  'workspace_monitoring',
] as const;

export type PrivilegeLevel = 'admin' | 'standard';

export type AdminRequiredFeature = (typeof ADMIN_REQUIRED_FEATURES)[number];
export type StandardUserFeature = (typeof STANDARD_USER_FEATURES)[number];

export interface PrivilegeStatus {
  level: PrivilegeLevel;
  disabledFeatures: string[];
  enabledFeatures: string[];
  warningMessage: string | null;
}

/**
 * Check if the current process is running with administrator/elevated privileges.
 *
 * On Windows: attempts to execute a command requiring admin access (net session).
 * On POSIX (for testing): checks process.getuid() === 0.
 */
export function isRunningAsAdmin(): boolean {
  if (process.platform === 'win32') {
    return checkWindowsAdmin();
  }
  // POSIX fallback for testing on non-Windows
  return checkPosixAdmin();
}

/**
 * Returns the current privilege level: 'admin' or 'standard'.
 */
export function getPrivilegeLevel(): PrivilegeLevel {
  return isRunningAsAdmin() ? 'admin' : 'standard';
}

/**
 * Returns the list of features disabled when running without admin privileges.
 * When running as admin, returns an empty array.
 */
export function getDisabledFeatures(): string[] {
  if (isRunningAsAdmin()) {
    return [];
  }
  return [...ADMIN_REQUIRED_FEATURES];
}

/**
 * Returns the list of features that work regardless of privilege level.
 * These are always enabled.
 */
export function getEnabledFeatures(): string[] {
  if (isRunningAsAdmin()) {
    return [...STANDARD_USER_FEATURES, ...ADMIN_REQUIRED_FEATURES];
  }
  return [...STANDARD_USER_FEATURES];
}

/**
 * Get the full privilege status including warning message for degraded mode.
 */
export function getPrivilegeStatus(): PrivilegeStatus {
  const level = getPrivilegeLevel();
  const disabledFeatures = getDisabledFeatures();
  const enabledFeatures = getEnabledFeatures();

  const warningMessage =
    level === 'standard'
      ? 'Host Agent is running without administrator privileges. App isolation features ' +
        '(process monitoring, input filtering, file dialog restriction) are disabled. ' +
        'Registration, heartbeat reporting, and session brokering remain active. ' +
        'Restart with administrator privileges to enable full security features.'
      : null;

  return {
    level,
    disabledFeatures,
    enabledFeatures,
    warningMessage,
  };
}

/**
 * Check if a specific feature is available at the current privilege level.
 */
export function isFeatureAvailable(feature: string): boolean {
  return getEnabledFeatures().includes(feature);
}

// ── Platform-Specific Detection ─────────────────────────────────────────────────

/**
 * Windows admin detection: attempts to run `net session` which requires admin.
 * Uses synchronous child_process to avoid async complexity in detection.
 */
function checkWindowsAdmin(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execSync } = require('child_process');
    execSync('net session', { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * POSIX admin detection: checks if running as root (uid 0).
 * Used as a cross-platform fallback for testing on non-Windows.
 */
function checkPosixAdmin(): boolean {
  try {
    return process.getuid?.() === 0;
  } catch {
    return false;
  }
}
