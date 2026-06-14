import { definitionForPhase } from '@/services/lifecycleDefinitions';
import type {
  LifecycleEvaluation,
  MissingRecord,
  Priority,
  ProjectMetadata,
  ProjectRecord,
  ProjectRecordType,
} from '@/services/lifecycleTypes';

const ISSUED_LIKE = new Set(['approved', 'issued']);

/**
 * Check whether a usable (approved or issued) record of the given type exists.
 */
export function hasUsableRecord(
  records: ProjectRecord[],
  recordType: ProjectRecordType,
): boolean {
  return records.some(
    (record) => record.recordType === recordType && ISSUED_LIKE.has(record.status),
  );
}

/**
 * Evaluate the current phase readiness with detailed record checking.
 * Returns a comprehensive LifecycleEvaluation including missing records,
 * blockers, mayAdvance decision, and next best actions.
 */
export function evaluateLifecycle(
  metadata: ProjectMetadata,
  records: ProjectRecord[],
): LifecycleEvaluation {
  const definition = definitionForPhase(metadata.currentPhase);
  const presentRequiredRecordTypes = definition.requiredRecordTypes.filter((type) =>
    hasUsableRecord(records, type),
  );

  const missingRecords: MissingRecord[] = definition.requiredRecordTypes
    .filter((type) => !presentRequiredRecordTypes.includes(type))
    .map((type) => ({
      recordType: type,
      priority: priorityForMissingRecord(type),
      reason: `Required for ${definition.label}: ${type}`,
    }));

  const blockers = missingRecords.map((missing) => missing.reason);
  const nextBestActions = missingRecords.length
    ? missingRecords.map((missing) => actionForMissingRecord(missing.recordType))
    : [`Review ${definition.handoffRule}`];

  return {
    phase: metadata.currentPhase,
    requiredRecordTypes: definition.requiredRecordTypes,
    presentRequiredRecordTypes,
    missingRecords,
    mayAdvance: missingRecords.length === 0,
    blockers,
    nextBestActions,
  };
}

function priorityForMissingRecord(recordType: ProjectRecordType): Priority {
  if (recordType === 'municipal_approval_letter') return 'critical';
  if (recordType === 'professional_appointment') return 'high';
  if (recordType === 'construction_programme') return 'high';
  if (recordType === 'snag_register') return 'high';
  return 'medium';
}

function actionForMissingRecord(recordType: ProjectRecordType): string {
  switch (recordType) {
    case 'municipal_approval_letter':
      return 'Upload or confirm municipal approval letter before construction proceeds.';
    case 'professional_appointment':
      return 'Complete signed professional appointment record.';
    case 'scope_baseline':
      return 'Confirm scope baseline and responsibilities.';
    case 'construction_programme':
      return 'Attach approved construction programme.';
    case 'snag_register':
      return 'Create or upload baseline snag register.';
    case 'closeout_pack':
      return 'Assemble closeout and handover pack.';
    default:
      return `Create or approve missing record: ${recordType}.`;
  }
}
