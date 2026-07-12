/**
 * Builder Verification Service
 *
 * Verifies builder NHBRC registration status, records verification
 * results, and provides prior verification history lookup.
 *
 * Simulated verification logic (to be replaced with real NHBRC API):
 *   - Registration number starting with 'EXP' → 'verified_expired'
 *   - Registration number starting with 'SUS' → 'verified_suspended'
 *   - Registration number starting with 'UNV' → 'unverifiable'
 *   - Otherwise → 'verified_active' with category, max value, and expiry
 *
 * Requirements: 14.1–14.9
 */

import type {
  BuilderVerification,
  BuilderVerificationStatus,
  BuilderVerificationService,
  VerifyBuilderInput,
} from '../types';
import { builderVerificationSchema } from '../schemas';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Result returned by the external verifier function (or the built-in stub).
 */
export interface ExternalVerificationResult {
  status: BuilderVerificationStatus;
  registrationCategory?: string;
  maxProjectValue?: number;
  registrationExpiry?: string;
}

/**
 * External verifier function signature. Accepts a registration number
 * and returns the verification result. Will be replaced by a real
 * NHBRC API integration in the future.
 */
export type ExternalVerifierFn = (registrationNumber: string) => Promise<ExternalVerificationResult>;

export interface BuilderVerificationServiceOptions {
  /** Injectable clock for deterministic testing. Returns ISO date-time string. */
  now?: () => string;
  /**
   * Optional external verifier function for future NHBRC API integration.
   * When not provided, the built-in simulated verifier is used.
   */
  externalVerifier?: ExternalVerifierFn;
}

// ─── Simulated Verification Logic ─────────────────────────────────────────────

/**
 * Default simulated NHBRC verification. Uses registration number prefixes
 * to determine status. To be replaced with real NHBRC API call later.
 */
function createDefaultVerifier(now: () => string): ExternalVerifierFn {
  return async (registrationNumber: string): Promise<ExternalVerificationResult> => {
    const upperReg = registrationNumber.toUpperCase();

    if (upperReg.startsWith('EXP')) {
      return { status: 'verified_expired' };
    }

    if (upperReg.startsWith('SUS')) {
      return { status: 'verified_suspended' };
    }

    if (upperReg.startsWith('UNV')) {
      return { status: 'unverifiable' };
    }

    // Default: verified_active with registration details
    const today = new Date(now());
    const expiryDate = new Date(today);
    expiryDate.setFullYear(expiryDate.getFullYear() + 2);

    return {
      status: 'verified_active',
      registrationCategory: 'Category 1',
      maxProjectValue: 5_000_000,
      registrationExpiry: expiryDate.toISOString().split('T')[0],
    };
  };
}

// ─── Implementation ───────────────────────────────────────────────────────────

class BuilderVerificationServiceImpl implements BuilderVerificationService {
  private verifications: Map<string, BuilderVerification> = new Map();
  private readonly now: () => string;
  private readonly verify: ExternalVerifierFn;

  constructor(options: BuilderVerificationServiceOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.verify = options.externalVerifier ?? createDefaultVerifier(this.now);
  }

  /**
   * Verify a builder's NHBRC registration status.
   *
   * 1. Validates input using builderVerificationSchema (builderName 2-200 chars,
   *    registrationNumber alphanumeric 4-20 chars, verificationDate not future).
   * 2. Performs simulated (or injected) external verification.
   * 3. Records the result.
   * 4. Returns the BuilderVerification record.
   *
   * Requirements: 14.1, 14.2, 14.3, 14.4
   */
  async verifyBuilder(
    projectId: string,
    input: VerifyBuilderInput,
    requestedBy: string,
  ): Promise<BuilderVerification> {
    // Step 1: Validate input with Zod schema
    const parsed = builderVerificationSchema.parse(input);

    // Step 2: Perform verification (simulated or external)
    const result = await this.verify(parsed.registrationNumber);

    // Step 3: Build and record the verification record
    const id = this.generateId();
    const timestamp = this.now();

    const verification: BuilderVerification = {
      id,
      projectId,
      builderName: parsed.builderName,
      registrationNumber: parsed.registrationNumber,
      verificationDate: parsed.verificationDate,
      result: result.status,
      registrationCategory: result.registrationCategory,
      maxProjectValue: result.maxProjectValue,
      registrationExpiry: result.registrationExpiry,
      requestedBy,
      createdAt: timestamp,
    };

    this.verifications.set(id, verification);

    // Step 4: Return the recorded verification
    return { ...verification };
  }

  /**
   * Get all prior verification records for the same registration number
   * within the project, sorted by createdAt descending (most recent first).
   *
   * Requirements: 14.9
   */
  async getPriorVerifications(
    projectId: string,
    registrationNumber: string,
  ): Promise<BuilderVerification[]> {
    const results: BuilderVerification[] = [];

    for (const verification of this.verifications.values()) {
      if (
        verification.projectId === projectId &&
        verification.registrationNumber === registrationNumber
      ) {
        results.push({ ...verification });
      }
    }

    // Sort by createdAt descending (most recent first)
    results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return results;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private generateId(): string {
    return `bv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a new BuilderVerificationService instance.
 *
 * Uses in-memory Map storage, injectable clock for deterministic tests,
 * and optional external verifier function for future NHBRC API integration.
 */
export function createBuilderVerificationService(
  options: BuilderVerificationServiceOptions = {},
): BuilderVerificationService {
  return new BuilderVerificationServiceImpl(options);
}
