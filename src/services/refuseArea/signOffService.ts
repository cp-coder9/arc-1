/**
 * Professional Sign-Off Service — Municipal Refuse Area Calculator
 *
 * Creates immutable sign-off records that gate downstream actions (save to Passport,
 * export to SpecForge, export PDF). Emits audit trail entries for governance compliance.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { createAuditEntry } from '@/services/auditTrailService';
import type { Refuse_Area_Result, Professional_Sign_Off_Record } from './types';

/**
 * Generates a UUID v4.
 * Uses globalThis.crypto.randomUUID when available (browser/modern Node),
 * falls back to a simple v4 UUID generator for test environments.
 */
function generateId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  // Fallback for environments where crypto.randomUUID is not available
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Creates a Professional Sign-Off record and persists it to Firestore.
 * Emits an immutable audit trail entry for governance tracking.
 *
 * @param user - The user performing the sign-off (uid, displayName, role)
 * @param result - The computation result being signed off
 * @param acknowledgementStatement - The full acknowledgement text confirmed by the user
 * @param projectId - Optional project context for the sign-off
 * @returns The created Professional_Sign_Off_Record
 */
export async function createSignOff(
  user: { uid: string; displayName: string; role: string },
  result: Refuse_Area_Result,
  acknowledgementStatement: string,
  projectId?: string
): Promise<Professional_Sign_Off_Record> {
  const id = generateId();
  const timestamp = new Date().toISOString();

  const signOffRecord: Professional_Sign_Off_Record = {
    id,
    resultId: result.id,
    timestamp,
    uid: user.uid,
    displayName: user.displayName,
    platformRole: user.role,
    acknowledgementStatement,
    ...(projectId ? { projectId } : {}),
  };

  // Persist to Firestore refuse_sign_offs collection
  const docRef = doc(db, 'refuse_sign_offs', id);
  await setDoc(docRef, signOffRecord);

  // Emit immutable audit trail entry
  createAuditEntry({
    actorId: user.uid,
    action: 'refuse_area_sign_off',
    sourceObjectId: result.id,
    metadata: {
      municipalityName: result.municipalityName,
      buildingType: result.buildingType,
      areaSqm: result.area.totalAreaSqm,
      signOffTimestamp: timestamp,
    },
  });

  return signOffRecord;
}

/**
 * Determines whether professional sign-off is required for a given downstream action.
 * All downstream actions (save, export) require sign-off — always returns true.
 *
 * @param _action - The action being gated (save_passport, export_specforge, export_pdf)
 * @returns true — sign-off is always required
 */
export function isSignOffRequired(
  _action: 'save_passport' | 'export_specforge' | 'export_pdf'
): boolean {
  return true;
}

/**
 * Returns the mandatory acknowledgement statement text that users must confirm
 * before sign-off is accepted.
 *
 * @returns The full acknowledgement statement with three clauses
 */
export function getAcknowledgementText(): string {
  return '(a) This output is advisory only and does not constitute legal compliance certification. (b) I have reviewed the computed results in full. (c) Professional verification against current local bylaws remains my responsibility.';
}
