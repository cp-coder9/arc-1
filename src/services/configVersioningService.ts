/**
 * Configuration Versioning Service
 *
 * Provides versioning and governance for platform configuration changes.
 * Every configuration modification (feature flags, tariff rules, payment rates,
 * AI prompts) creates an immutable version record preserving the change history.
 *
 * Key behaviors:
 * - Version records are append-only (cannot be modified or deleted)
 * - Tariff rules require an effective date that is current or future
 * - Payment rate and AI prompt changes require a documented reason (≥10 chars)
 * - Version history is retrievable in reverse-chronological order
 *
 * @module configVersioningService
 * @requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The four governed configuration types that require versioning.
 */
export type ConfigType = 'feature_flag' | 'tariff_rule' | 'payment_rate' | 'ai_prompt';

/**
 * A versioned configuration record.
 *
 * - `reason` is required for `payment_rate` and `ai_prompt` config types.
 * - `effectiveDate` is required for `tariff_rule` config type.
 */
export interface ConfigVersion<T = unknown> {
  versionId: string;
  configKey: string;
  configType: ConfigType;
  previousValue: T;
  newValue: T;
  modifierUid: string;
  timestampIso: string;
  reason?: string;
  effectiveDate?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Firestore collection path for config version records */
const CONFIG_VERSIONS_COLLECTION = 'config_versions';

// ─── ID Generation ────────────────────────────────────────────────────────────

/**
 * Generates a unique version ID.
 */
function generateVersionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates that a tariff effective date is current (today) or in the future.
 *
 * Per Requirement 10.3: past-effective tariff rules cannot be created or modified.
 *
 * @param effectiveDate - ISO 8601 date string (YYYY-MM-DD or full ISO datetime)
 * @returns true if the effective date is today or in the future, false otherwise
 */
export function validateTariffEffectiveDate(effectiveDate: string): boolean {
  const effective = new Date(effectiveDate);
  if (isNaN(effective.getTime())) {
    return false;
  }

  // Compare date portions only (ignore time) — effective date must be >= today
  const today = new Date();
  const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const effectiveDateOnly = new Date(effective.getFullYear(), effective.getMonth(), effective.getDate());

  return effectiveDateOnly.getTime() >= todayDateOnly.getTime();
}

// ─── Deletion Prevention ──────────────────────────────────────────────────────

/**
 * Prevents deletion of a version history record.
 *
 * Per Requirement 10.6: version history records for all governed configurations
 * are append-only and cannot be deleted.
 *
 * @param versionId - The ID of the version record that is being targeted for deletion
 * @throws Error always — deletion is never permitted
 */
export function preventDeletion(versionId: string): never {
  throw new Error(
    `Deletion denied: version record '${versionId}' cannot be deleted. ` +
    `Configuration version history is append-only and must be retained for audit purposes.`
  );
}

// ─── Version Creation ─────────────────────────────────────────────────────────

/**
 * Creates a new configuration version record.
 *
 * Validates required fields based on config type:
 * - `tariff_rule`: requires `effectiveDate` that is current or future
 * - `payment_rate`: requires `reason` of at least 10 characters
 * - `ai_prompt`: requires `reason` of at least 10 characters
 * - `feature_flag`: no additional requirements
 *
 * Persists the version record to Firestore via Admin SDK.
 *
 * @returns The created ConfigVersion record
 * @throws If validation fails or Firestore write fails
 */
export async function createConfigVersion<T>(
  configKey: string,
  type: ConfigType,
  prev: T,
  next: T,
  modifierUid: string,
  reason?: string,
  effectiveDate?: string,
): Promise<ConfigVersion<T>> {
  // Validate tariff_rule effective date
  if (type === 'tariff_rule') {
    if (!effectiveDate) {
      throw new Error(
        `Tariff rule '${configKey}' requires an effective date.`
      );
    }
    if (!validateTariffEffectiveDate(effectiveDate)) {
      throw new Error(
        `Tariff rule '${configKey}' has an effective date in the past. ` +
        `Past-effective rules cannot be created or modified.`
      );
    }
  }

  // Validate reason requirement for payment_rate and ai_prompt
  if (type === 'payment_rate' || type === 'ai_prompt') {
    if (!reason || reason.length < 10) {
      throw new Error(
        `Configuration type '${type}' requires a documented reason of at least 10 characters. ` +
        `Received: ${reason ? `'${reason}' (${reason.length} chars)` : 'none'}.`
      );
    }
  }

  const versionId = generateVersionId();
  const timestampIso = new Date().toISOString();

  const versionRecord: ConfigVersion<T> = {
    versionId,
    configKey,
    configType: type,
    previousValue: prev,
    newValue: next,
    modifierUid,
    timestampIso,
    ...(reason !== undefined && { reason }),
    ...(effectiveDate !== undefined && { effectiveDate }),
  };

  // Write to Firestore via Admin SDK
  const { adminDb } = await import('@/lib/firebase-admin');
  await adminDb
    .collection(CONFIG_VERSIONS_COLLECTION)
    .doc(versionId)
    .create(versionRecord);

  return versionRecord;
}

// ─── Version History Retrieval ────────────────────────────────────────────────

/**
 * Retrieves the version history for a given configuration key.
 *
 * Per Requirement 10.7: returns records in reverse-chronological order.
 * Per Requirement 9.3: retains at least the previous 50 versions per item.
 *
 * @param configKey - The configuration key to retrieve history for
 * @param limit - Maximum number of records to return (default: 50)
 * @returns Array of ConfigVersion records sorted by timestamp descending
 */
export async function getVersionHistory(
  configKey: string,
  limit: number = 50,
): Promise<ConfigVersion[]> {
  const { adminDb } = await import('@/lib/firebase-admin');

  const snapshot = await adminDb
    .collection(CONFIG_VERSIONS_COLLECTION)
    .where('configKey', '==', configKey)
    .orderBy('timestampIso', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.data() as ConfigVersion);
}
