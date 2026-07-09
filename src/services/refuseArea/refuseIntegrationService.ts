/**
 * Refuse Integration Service — Orchestrates integrations between the Municipal
 * Refuse Area Calculator and the Architex platform spine (Project Passport,
 * SpecForge, Action Centre).
 *
 * Handles:
 * - Writing Refuse_Area_Result to Project Passport as a ProjectRecord
 * - Pushing Refuse_Area_Result to SpecForge as a specification item
 * - Creating Action Centre alerts on sync failures
 *
 * Retry strategy: 3 attempts with exponential backoff (1s, 2s, 4s).
 * On final failure: creates an Action Centre alert for manual retry.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

import type { Refuse_Area_Result, Professional_Sign_Off_Record } from './types';

// ── Stub Service Interfaces ─────────────────────────────────────────────────
// These stubs will be wired to real services when platform integration is complete.

export const projectPassportService = {
  writeRecord: async (_projectId: string, _record: unknown): Promise<void> => {
    /* Firestore write */
  },
};

export const specForgeService = {
  addSpecItem: async (_projectId: string, _item: unknown): Promise<void> => {
    /* Firestore write */
  },
};

export const actionCentreService = {
  createAlert: (_alert: unknown): void => {
    /* Action Centre alert creation */
  },
};

// ── Types ───────────────────────────────────────────────────────────────────

export interface ProjectRecord {
  recordType: string;
  phase: string;
  data: Refuse_Area_Result;
  metadata: {
    source: string;
    signOffId: string;
    timestamp: string;
  };
}

export interface SpecItem {
  elementType: string;
  specCategory: string;
  title: string;
  summary: string;
  data: Refuse_Area_Result;
  status: string;
  signOffId: string;
}

export interface FailedSyncAlert {
  type: 'failed_sync';
  targetModule: 'project_passport' | 'specforge';
  toolSource: string;
  message: string;
  resultId: string;
}

// ── Retry Utility ───────────────────────────────────────────────────────────

const RETRY_DELAYS_MS = [1000, 2000, 4000];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries the given async operation up to 3 times with exponential backoff
 * (1s, 2s, 4s). Returns true on success, false after all retries exhausted.
 */
async function withRetry(operation: () => Promise<void>): Promise<boolean> {
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    try {
      await operation();
      return true;
    } catch {
      if (attempt < RETRY_DELAYS_MS.length - 1) {
        await delay(RETRY_DELAYS_MS[attempt]);
      }
    }
  }
  return false;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Writes the Refuse_Area_Result to the active Project Passport record.
 *
 * Creates a ProjectRecord envelope with:
 * - recordType: 'refuse_area_calculation'
 * - phase: 'comply'
 * - data: the full result
 * - metadata: source tool, sign-off reference, and timestamp
 *
 * Retry strategy: 3 attempts with exponential backoff (1s, 2s, 4s).
 * On final failure: creates an Action Centre alert for manual retry.
 */
export async function saveToProjectPassport(
  result: Refuse_Area_Result,
  signOff: Professional_Sign_Off_Record,
  projectId: string,
): Promise<void> {
  const record: ProjectRecord = {
    recordType: 'refuse_area_calculation',
    phase: 'comply',
    data: result,
    metadata: {
      source: 'municipal-refuse-area-calculator',
      signOffId: signOff.id,
      timestamp: signOff.timestamp,
    },
  };

  const success = await withRetry(() =>
    projectPassportService.writeRecord(projectId, record),
  );

  if (!success) {
    createFailedSyncAlert('project_passport', result.id);
  }
}

/**
 * Pushes the Refuse_Area_Result to SpecForge as a specification item for the
 * refuse room element.
 *
 * Creates a spec item with:
 * - elementType: 'refuse_room'
 * - specCategory: 'compliance'
 * - title: descriptive title including municipality name
 * - summary: area, bin count, and municipality
 * - data: the full result
 * - status: 'issued'
 * - signOffId: reference to the sign-off record
 *
 * Retry strategy: 3 attempts with exponential backoff (1s, 2s, 4s).
 * On final failure: creates an Action Centre alert for manual retry.
 */
export async function pushToSpecForge(
  result: Refuse_Area_Result,
  signOff: Professional_Sign_Off_Record,
  projectId: string,
): Promise<void> {
  const specItem: SpecItem = {
    elementType: 'refuse_room',
    specCategory: 'compliance',
    title: `Refuse Storage Area — ${result.municipalityName}`,
    summary: `${result.area.totalAreaSqm}m² | ${result.bins.generalWaste.binCount} bins | ${result.municipalityName}`,
    data: result,
    status: 'issued',
    signOffId: signOff.id,
  };

  const success = await withRetry(() =>
    specForgeService.addSpecItem(projectId, specItem),
  );

  if (!success) {
    createFailedSyncAlert('specforge', result.id);
  }
}

/**
 * Creates an Action Centre alert indicating a failed sync operation.
 *
 * Used when writes to Project Passport or SpecForge fail after all retry
 * attempts are exhausted. The alert instructs the user to manually retry.
 */
export function createFailedSyncAlert(
  targetModule: 'project_passport' | 'specforge',
  resultId: string,
): void {
  const alert: FailedSyncAlert = {
    type: 'failed_sync',
    targetModule,
    toolSource: 'municipal-refuse-area-calculator',
    message: `Refuse area result could not be saved to ${targetModule}. Manual retry required.`,
    resultId,
  };

  actionCentreService.createAlert(alert);
}
