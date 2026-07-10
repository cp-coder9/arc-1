/**
 * Passport Adapter — Dispute Resolution
 *
 * Writes dispute health card updates to the Project Passport:
 * - Active disputes count
 * - Total disputed amount (ZAR)
 * - Days since oldest unresolved dispute
 *
 * Requirements: 10.6
 */

import type { PlatformIntegrationService } from '@/features/p1-shared/services/platformIntegration';
import type { IntegrationWriteResult } from '@/features/p1-shared/types';
import type { FormalClaim } from '../types';

// ─── Typed Payloads ───────────────────────────────────────────────────────────

export interface DisputeHealthCardData {
  projectId: string;
  activeDisputesCount: number;
  totalDisputedAmountZAR: number;
  daysSinceOldestUnresolved: number;
}

// ─── Adapter Interface ────────────────────────────────────────────────────────

export interface DisputePassportAdapter {
  /** Write dispute health card data to Project Passport */
  writeHealthCard(data: DisputeHealthCardData): Promise<IntegrationWriteResult>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TERMINAL_STAGES: FormalClaim['currentStage'][] = ['settled', 'adjudication_decision_issued'];

/**
 * Compute dispute health card metrics from a list of formal claims.
 */
export function computeDisputeHealthCard(
  projectId: string,
  claims: FormalClaim[],
  now: Date = new Date(),
): DisputeHealthCardData {
  const activeClaims = claims.filter(
    (c) => !TERMINAL_STAGES.includes(c.currentStage),
  );

  const activeDisputesCount = activeClaims.length;

  const totalDisputedAmountZAR = activeClaims.reduce(
    (sum, c) => sum + (c.amountClaimed ?? 0),
    0,
  );

  let daysSinceOldestUnresolved = 0;
  if (activeClaims.length > 0) {
    const oldest = activeClaims.reduce((earliest, c) => {
      const createdAt = new Date(c.createdAt);
      return createdAt < earliest ? createdAt : earliest;
    }, new Date(activeClaims[0].createdAt));

    daysSinceOldestUnresolved = Math.floor(
      (now.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  return {
    projectId,
    activeDisputesCount,
    totalDisputedAmountZAR,
    daysSinceOldestUnresolved,
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates the Dispute Resolution Passport adapter.
 *
 * Accepts a PlatformIntegrationService and returns an object with
 * a typed writeHealthCard method that pushes health card data to
 * the Project Passport spine.
 */
export function createDisputePassportAdapter(
  platform: PlatformIntegrationService,
): DisputePassportAdapter {
  return {
    async writeHealthCard(data: DisputeHealthCardData): Promise<IntegrationWriteResult> {
      return platform.writeToPassport({
        projectId: data.projectId,
        moduleId: 'dispute-resolution',
        statusLabel: data.activeDisputesCount === 0
          ? 'No active disputes'
          : `${data.activeDisputesCount} active dispute${data.activeDisputesCount > 1 ? 's' : ''} — R${data.totalDisputedAmountZAR.toLocaleString('en-ZA')}`,
        activeRecords: data.activeDisputesCount,
        overdueItems: data.daysSinceOldestUnresolved,
        lastUpdated: new Date().toISOString(),
      });
    },
  };
}
