import { createHash } from 'crypto';
import type { AuditSnapshot, ToolRun } from './types';
import { iso } from './ids';

/**
 * Produces a stable JSON string with keys sorted alphabetically.
 * Used to ensure deterministic hashing of input/output objects.
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      return Object.keys(val as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((sorted, k) => {
          sorted[k] = (val as Record<string, unknown>)[k];
          return sorted;
        }, {});
    }
    return val;
  });
}

export class AuditSnapshotService {
  /**
   * Creates an audit snapshot for the given ToolRun.
   * Computes SHA-256 of: runId|toolId|toolVersion|sortedInput|sortedOutput|issuedAt
   * Fields joined by pipe `|` delimiter.
   * Input/output: JSON.stringify with keys sorted alphabetically (stable sort replacer).
   * issuedAt in ISO 8601 UTC format.
   *
   * Requirement 10.1: SHA-256 hash computation
   * Requirement 10.2: Store hash and set locked=true in same atomic operation
   */
  create(run: ToolRun, reason: string): AuditSnapshot {
    const issuedAt = run.issuedAt ?? iso();
    const hash = this.computeHash(run, issuedAt);
    return {
      hash,
      algorithm: 'sha256',
      reason,
      createdAt: iso(),
      locked: true,
    };
  }

  /**
   * Verifies that a ToolRun's audit snapshot hash matches a fresh computation.
   * Returns true if the stored hash matches the recomputed hash.
   */
  verify(run: ToolRun): boolean {
    if (!run.auditSnapshot || !run.issuedAt) return false;
    const recomputed = this.computeHash(run, run.issuedAt);
    return recomputed === run.auditSnapshot.hash;
  }

  /**
   * Computes SHA-256 hash of the canonical representation:
   * SHA-256(UTF-8(runId | toolId | toolVersion | sortedInput | sortedOutput | issuedAt))
   */
  private computeHash(run: ToolRun, issuedAt: string): string {
    const sortedInput = stableStringify(run.input);
    const sortedOutput = stableStringify(run.output);
    const payload = [
      run.id,
      run.toolId,
      run.toolVersion,
      sortedInput,
      sortedOutput,
      issuedAt,
    ].join('|');

    return createHash('sha256').update(payload, 'utf8').digest('hex');
  }
}
