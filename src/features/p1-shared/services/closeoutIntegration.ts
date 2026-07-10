/**
 * Closeout Module Integration
 *
 * Generates closeout checklist items that P1 modules contribute during
 * project closeout and handover. Each module contributes specific verification
 * items for the defects liability period, completion certificates, and
 * handover documentation.
 *
 * Requirements: 4.4, 15.3, 19.7
 */

import type { PlatformIntegrationService } from './platformIntegration';
import type { IntegrationWriteResult } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CloseoutChecklistItem {
  sourceModule: string;
  itemDescription: string;
  verificationCriteria: string;
  status: 'pending' | 'verified' | 'not_applicable';
  projectId: string;
  linkedRecordRef?: string;
  createdAt: string;
}

// ─── Standard Checklist Item Definitions ──────────────────────────────────────

const P1_CLOSEOUT_DEFINITIONS: ReadonlyArray<{
  sourceModule: string;
  itemDescription: string;
  verificationCriteria: string;
}> = [
  {
    sourceModule: 'insurance-register',
    itemDescription:
      'Verify all required insurance types remain active through defects liability period',
    verificationCriteria:
      'All policies listed in the insurance register have expiry dates beyond the defects liability period end date, or renewal confirmations are on file.',
  },
  {
    sourceModule: 'nhbrc',
    itemDescription:
      'Verify all stage inspections passed and completion certificates obtained',
    verificationCriteria:
      'All NHBRC inspection stages (foundation, wall plate, roof, completion) show "passed" status with signed-off certificates uploaded to the Documents module.',
  },
  {
    sourceModule: 'nhbrc',
    itemDescription:
      'Verify warranty documentation handed to housing consumers',
    verificationCriteria:
      'NHBRC warranty documentation has been generated and evidence of handover to housing consumers is recorded in the handover pack.',
  },
  {
    sourceModule: 'survey-geomatics',
    itemDescription:
      'Verify as-built comparison results included in handover pack',
    verificationCriteria:
      'As-built comparison report is marked as completed with compliance percentage calculated, and the report is registered in the Documents module as part of the handover pack.',
  },
];

// ─── Closeout Integration Service ─────────────────────────────────────────────

export interface CloseoutIntegrationService {
  addChecklistItem(item: CloseoutChecklistItem): Promise<IntegrationWriteResult>;
}

/**
 * Creates a Closeout Integration Service that writes checklist contributions
 * to the platform audit trail.
 */
export function createCloseoutIntegrationService(
  platform: PlatformIntegrationService,
): CloseoutIntegrationService {
  return {
    async addChecklistItem(item: CloseoutChecklistItem): Promise<IntegrationWriteResult> {
      return platform.writeToAuditTrail({
        projectId: item.projectId,
        moduleId: item.sourceModule,
        action: 'closeout_checklist_contribution',
        recordRef: item.linkedRecordRef ?? `closeout-item-${item.sourceModule}-${item.createdAt}`,
        actorId: 'system',
        timestamp: item.createdAt,
        newValues: {
          itemDescription: item.itemDescription,
          verificationCriteria: item.verificationCriteria,
          status: item.status,
        },
      });
    },
  };
}

// ─── Helper: Generate Standard P1 Closeout Items ──────────────────────────────

/**
 * Generates the standard closeout checklist items contributed by all P1 modules
 * for the given project.
 *
 * Items returned:
 * - Insurance Register → defects liability period verification
 * - NHBRC → stage inspections and completion certificates
 * - NHBRC → warranty documentation handover
 * - Survey & Geomatics → as-built comparison in handover pack
 */
export function generateP1CloseoutItems(projectId: string): CloseoutChecklistItem[] {
  const now = new Date().toISOString();

  return P1_CLOSEOUT_DEFINITIONS.map((def) => ({
    sourceModule: def.sourceModule,
    itemDescription: def.itemDescription,
    verificationCriteria: def.verificationCriteria,
    status: 'pending' as const,
    projectId,
    createdAt: now,
  }));
}
