/**
 * Document Adapter — Town Planning Integration
 *
 * Registers controlled documents in the platform Documents module.
 * Links town planning documents (applications, decisions, conditions evidence)
 * to the central document register with appropriate metadata.
 */

import { withRetry, type RetryOptions } from './retryUtils';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DocumentRegistrationParams {
  projectId: string;
  applicationId: string;
  documentName: string;
  documentType: string;
  category: 'town_planning';
  uploadedBy: string;
  uploadedAt: string;
  fileReference?: string;
  metadata?: Record<string, unknown>;
}

export interface DocumentAdapterDeps {
  /** Function that registers a controlled document in the Documents module */
  registerFn: (params: DocumentRegistrationParams) => Promise<void>;
  /** Optional retry configuration */
  retryOptions?: RetryOptions;
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Registers a controlled document in the Documents module.
 * Links town planning evidence, decisions, and correspondence
 * to the project's central document register.
 */
export async function registerControlledDocument(
  params: DocumentRegistrationParams,
  deps: DocumentAdapterDeps
): Promise<void> {
  await withRetry(
    () => deps.registerFn(params),
    deps.retryOptions
  );
}
