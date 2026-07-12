/**
 * Project Passport Adapter — Environmental & Heritage
 *
 * Updates the Project Passport health card with environmental/heritage status:
 * - EA status (pending, in_progress, cleared, blocked)
 * - Heritage status (pending, in_progress, cleared, blocked)
 * - Construction commencement blocking flags
 *
 * Requirements: 20.1, 20.2, 20.3
 */

import type { PlatformIntegrationService, PassportWritePayload } from '../../p1-shared/services/platformIntegration';
import type { IntegrationWriteResult } from '../../p1-shared/types';

// ─── Status Types ─────────────────────────────────────────────────────────────

export type EAPassportStatus = 'pending' | 'in_progress' | 'cleared' | 'blocked';
export type HeritagePassportStatus = 'pending' | 'in_progress' | 'cleared' | 'blocked';

// ─── Typed Payloads ───────────────────────────────────────────────────────────

export interface EnvironmentalPassportPayload {
  projectId: string;
  eaStatus: EAPassportStatus;
  heritageStatus: HeritagePassportStatus;
  eaRequired: boolean;
  heritageRequired: boolean;
  constructionBlocked: boolean;
  blockingReasons: string[];
  lastUpdated: string;
}

// ─── Adapter Interface ────────────────────────────────────────────────────────

export interface EnvironmentalPassportAdapter {
  /** Write environmental & heritage health card summary to Project Passport. */
  writeEnvironmentalStatus(payload: EnvironmentalPassportPayload): Promise<IntegrationWriteResult>;

  /** Evaluate whether construction commencement should be blocked. */
  evaluateConstructionBlocking(payload: {
    eaStatus: EAPassportStatus;
    heritageStatus: HeritagePassportStatus;
    eaRequired: boolean;
    heritageRequired: boolean;
  }): { blocked: boolean; reasons: string[] };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODULE_ID = 'environmental-heritage';

const BLOCKING_EA_STATUSES: EAPassportStatus[] = ['pending', 'in_progress'];
const BLOCKING_HERITAGE_STATUSES: HeritagePassportStatus[] = ['pending', 'in_progress'];

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates an Environmental & Heritage → Project Passport adapter.
 *
 * Maps environmental/heritage module state to PassportWritePayload and writes
 * via PlatformIntegrationService. On failure, the platform integration service
 * handles retry queue enqueuing automatically (exponential backoff, 3 retries).
 */
export function createEnvironmentalPassportAdapter(
  platform: PlatformIntegrationService,
): EnvironmentalPassportAdapter {
  return {
    async writeEnvironmentalStatus(payload: EnvironmentalPassportPayload): Promise<IntegrationWriteResult> {
      const parts: string[] = [];

      if (payload.eaRequired) {
        parts.push(`EA: ${payload.eaStatus}`);
      }
      if (payload.heritageRequired) {
        parts.push(`Heritage: ${payload.heritageStatus}`);
      }
      if (payload.constructionBlocked) {
        parts.push(`CONSTRUCTION BLOCKED: ${payload.blockingReasons.join('; ')}`);
      }

      const statusLabel = parts.length > 0 ? parts.join(' | ') : 'No environmental requirements triggered';

      const overdueItems = payload.constructionBlocked ? payload.blockingReasons.length : 0;
      const activeRecords = (payload.eaRequired ? 1 : 0) + (payload.heritageRequired ? 1 : 0);

      const passportPayload: PassportWritePayload = {
        projectId: payload.projectId,
        moduleId: MODULE_ID,
        statusLabel,
        activeRecords,
        overdueItems,
        lastUpdated: payload.lastUpdated,
      };

      return platform.writeToPassport(passportPayload);
    },

    evaluateConstructionBlocking(payload) {
      const reasons: string[] = [];

      if (payload.eaRequired && BLOCKING_EA_STATUSES.includes(payload.eaStatus)) {
        reasons.push('Environmental Authorisation not yet granted');
      }

      if (payload.heritageRequired && BLOCKING_HERITAGE_STATUSES.includes(payload.heritageStatus)) {
        reasons.push('Heritage clearance not yet obtained');
      }

      return { blocked: reasons.length > 0, reasons };
    },
  };
}
