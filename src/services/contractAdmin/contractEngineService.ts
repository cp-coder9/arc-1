/**
 * Contract Engine Service — Contract Setup & Configuration
 *
 * Implements contract setup validation, persistence, retrieval,
 * and parameter updates with RBAC enforcement and audit trail.
 *
 * Requirements: 1.1, 1.2, 1.7, 1.8, 1.9, 1.10, 2.5
 *
 * @module contractEngineService
 */

import type {
  ContractSetupInput,
  ContractSetupResult,
  ContractConfig,
  ValidationResult,
  ValidationFieldError,
  ContractAuditRecord,
  ContractError,
  ContractProjectAssignment,
  PassportContractUpdate,
  ContractWorkflowEvent,
  ContractForm,
  JbccParams,
  NecParams,
  GccParams,
  FidicParams,
} from './contractTypes';
import { CONTRACT_FORM_CONFIGS } from './contractFormConfigs';
import { assertAccess } from './contractRbacService';
import {
  writeToProjectPassport,
  writeToAuditTrail,
  surfaceToActionCentre,
} from './contractIntegrationService';
import { adminDb } from '@/lib/firebase-admin';

// ══════════════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════════════

const VALID_CONTRACT_FORMS: ContractForm[] = ['jbcc_pba', 'nec_ecc', 'gcc_2025', 'fidic'];

const CONTRACT_SUM_MIN = 1.0;
const CONTRACT_SUM_MAX = 999_999_999_999.99;

/** ISO date regex: YYYY-MM-DD */
const ISO_DATE_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

// ══════════════════════════════════════════════════════════════════════════════
// Validation
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Validates a contract setup input, returning all invalid fields in a single response.
 *
 * Key validation rules:
 * - parties: min 2, must include employer and contractor roles
 * - commencementDate: valid ISO date
 * - practicalCompletionDate: valid ISO date, must be after commencementDate
 * - contractSum: 1.00–999,999,999,999.99
 * - contractForm: must be one of 'jbcc_pba', 'nec_ecc', 'gcc_2025', 'fidic'
 * - Form-specific params validated per form
 *
 * Requirement 1.10: reject incomplete/invalid submissions with all invalid fields indicated
 */
export function validateContractSetup(input: ContractSetupInput): ValidationResult {
  const errors: ValidationFieldError[] = [];

  // ── projectId ─────────────────────────────────────────────────────────
  if (!input.projectId || typeof input.projectId !== 'string' || input.projectId.trim() === '') {
    errors.push({ field: 'projectId', message: 'Project ID is required.' });
  }

  // ── contractForm ──────────────────────────────────────────────────────
  if (!input.contractForm || !VALID_CONTRACT_FORMS.includes(input.contractForm)) {
    errors.push({
      field: 'contractForm',
      message: `Contract form must be one of: ${VALID_CONTRACT_FORMS.join(', ')}.`,
    });
  }

  // ── parties ───────────────────────────────────────────────────────────
  if (!input.parties || !Array.isArray(input.parties)) {
    errors.push({ field: 'parties', message: 'Parties must be an array.' });
  } else {
    if (input.parties.length < 2) {
      errors.push({ field: 'parties', message: 'Minimum 2 parties required.' });
    }
    const roles = input.parties.map((p) => p.role);
    if (!roles.includes('employer')) {
      errors.push({ field: 'parties', message: 'Must include a party with the employer role.' });
    }
    if (!roles.includes('contractor')) {
      errors.push({ field: 'parties', message: 'Must include a party with the contractor role.' });
    }
  }

  // ── commencementDate ──────────────────────────────────────────────────
  if (!input.commencementDate || !ISO_DATE_REGEX.test(input.commencementDate)) {
    errors.push({ field: 'commencementDate', message: 'Valid ISO date (YYYY-MM-DD) is required.' });
  } else if (!isValidDate(input.commencementDate)) {
    errors.push({ field: 'commencementDate', message: 'Date is not a valid calendar date.' });
  }

  // ── practicalCompletionDate ───────────────────────────────────────────
  if (!input.practicalCompletionDate || !ISO_DATE_REGEX.test(input.practicalCompletionDate)) {
    errors.push({
      field: 'practicalCompletionDate',
      message: 'Valid ISO date (YYYY-MM-DD) is required.',
    });
  } else if (!isValidDate(input.practicalCompletionDate)) {
    errors.push({
      field: 'practicalCompletionDate',
      message: 'Date is not a valid calendar date.',
    });
  } else if (
    input.commencementDate &&
    ISO_DATE_REGEX.test(input.commencementDate) &&
    isValidDate(input.commencementDate) &&
    input.practicalCompletionDate <= input.commencementDate
  ) {
    errors.push({
      field: 'practicalCompletionDate',
      message: 'Practical completion date must be after the commencement date.',
    });
  }

  // ── contractSum ───────────────────────────────────────────────────────
  if (input.contractSum == null || typeof input.contractSum !== 'number') {
    errors.push({ field: 'contractSum', message: 'Contract sum is required and must be a number.' });
  } else if (input.contractSum < CONTRACT_SUM_MIN || input.contractSum > CONTRACT_SUM_MAX) {
    errors.push({
      field: 'contractSum',
      message: `Contract sum must be between ${CONTRACT_SUM_MIN} and ${CONTRACT_SUM_MAX}.`,
    });
  }

  // ── setupBy ───────────────────────────────────────────────────────────
  if (!input.setupBy || typeof input.setupBy !== 'string' || input.setupBy.trim() === '') {
    errors.push({ field: 'setupBy', message: 'Setup user ID is required.' });
  }

  // ── formSpecificParams ────────────────────────────────────────────────
  if (!input.formSpecificParams) {
    errors.push({
      field: 'formSpecificParams',
      message: 'Form-specific parameters are required.',
    });
  } else if (VALID_CONTRACT_FORMS.includes(input.contractForm)) {
    const formErrors = validateFormSpecificParams(input.contractForm, input.formSpecificParams);
    errors.push(...formErrors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate form-specific parameters based on the selected contract form.
 */
function validateFormSpecificParams(
  form: ContractForm,
  params: unknown
): ValidationFieldError[] {
  const errors: ValidationFieldError[] = [];

  switch (form) {
    case 'jbcc_pba':
      errors.push(...validateJbccParams(params as JbccParams));
      break;
    case 'nec_ecc':
      errors.push(...validateNecParams(params as NecParams));
      break;
    case 'gcc_2025':
      errors.push(...validateGccParams(params as GccParams));
      break;
    case 'fidic':
      errors.push(...validateFidicParams(params as FidicParams));
      break;
  }

  return errors;
}

/**
 * JBCC: interimPaymentPeriodDays (>0), penaltyRatePerDay (>=0.01),
 * retentionPercentage (0-10), defectsLiabilityMonths (3-24)
 */
function validateJbccParams(params: JbccParams): ValidationFieldError[] {
  const errors: ValidationFieldError[] = [];

  if (params.interimPaymentPeriodDays == null || params.interimPaymentPeriodDays <= 0) {
    errors.push({
      field: 'formSpecificParams.interimPaymentPeriodDays',
      message: 'Interim payment period must be greater than 0 days.',
    });
  }

  if (params.penaltyRatePerDay == null || params.penaltyRatePerDay < 0.01) {
    errors.push({
      field: 'formSpecificParams.penaltyRatePerDay',
      message: 'Penalty rate per day must be at least 0.01 ZAR.',
    });
  }

  if (params.retentionPercentage == null || params.retentionPercentage < 0 || params.retentionPercentage > 10) {
    errors.push({
      field: 'formSpecificParams.retentionPercentage',
      message: 'Retention percentage must be between 0 and 10.',
    });
  }

  if (
    params.defectsLiabilityMonths == null ||
    params.defectsLiabilityMonths < 3 ||
    params.defectsLiabilityMonths > 24
  ) {
    errors.push({
      field: 'formSpecificParams.defectsLiabilityMonths',
      message: 'Defects liability period must be between 3 and 24 months.',
    });
  }

  return errors;
}

/**
 * NEC: earlyWarningWeeks (1-12), compensationEventNotificationWeeks (1-12),
 * programmeSubmissionIntervalWeeks (1-8)
 */
function validateNecParams(params: NecParams): ValidationFieldError[] {
  const errors: ValidationFieldError[] = [];

  if (params.earlyWarningWeeks == null || params.earlyWarningWeeks < 1 || params.earlyWarningWeeks > 12) {
    errors.push({
      field: 'formSpecificParams.earlyWarningWeeks',
      message: 'Early warning weeks must be between 1 and 12.',
    });
  }

  if (
    params.compensationEventNotificationWeeks == null ||
    params.compensationEventNotificationWeeks < 1 ||
    params.compensationEventNotificationWeeks > 12
  ) {
    errors.push({
      field: 'formSpecificParams.compensationEventNotificationWeeks',
      message: 'Compensation event notification weeks must be between 1 and 12.',
    });
  }

  if (
    params.programmeSubmissionIntervalWeeks == null ||
    params.programmeSubmissionIntervalWeeks < 1 ||
    params.programmeSubmissionIntervalWeeks > 8
  ) {
    errors.push({
      field: 'formSpecificParams.programmeSubmissionIntervalWeeks',
      message: 'Programme submission interval must be between 1 and 8 weeks.',
    });
  }

  return errors;
}

/**
 * GCC: advanceWarningWorkingDays (1-60), penaltyRatePerDay (>=0.01),
 * firstStageClaimWorkingDays (5-60), secondStageClaimWorkingDays (5-60),
 * deemedRejectionWorkingDays (5-60)
 */
function validateGccParams(params: GccParams): ValidationFieldError[] {
  const errors: ValidationFieldError[] = [];

  if (
    params.advanceWarningWorkingDays == null ||
    params.advanceWarningWorkingDays < 1 ||
    params.advanceWarningWorkingDays > 60
  ) {
    errors.push({
      field: 'formSpecificParams.advanceWarningWorkingDays',
      message: 'Advance warning period must be between 1 and 60 working days.',
    });
  }

  if (params.penaltyRatePerDay == null || params.penaltyRatePerDay < 0.01) {
    errors.push({
      field: 'formSpecificParams.penaltyRatePerDay',
      message: 'Penalty rate per day must be at least 0.01 ZAR.',
    });
  }

  if (
    params.firstStageClaimWorkingDays == null ||
    params.firstStageClaimWorkingDays < 5 ||
    params.firstStageClaimWorkingDays > 60
  ) {
    errors.push({
      field: 'formSpecificParams.firstStageClaimWorkingDays',
      message: 'First stage claim period must be between 5 and 60 working days.',
    });
  }

  if (
    params.secondStageClaimWorkingDays == null ||
    params.secondStageClaimWorkingDays < 5 ||
    params.secondStageClaimWorkingDays > 60
  ) {
    errors.push({
      field: 'formSpecificParams.secondStageClaimWorkingDays',
      message: 'Second stage claim period must be between 5 and 60 working days.',
    });
  }

  if (
    params.deemedRejectionWorkingDays == null ||
    params.deemedRejectionWorkingDays < 5 ||
    params.deemedRejectionWorkingDays > 60
  ) {
    errors.push({
      field: 'formSpecificParams.deemedRejectionWorkingDays',
      message: 'Deemed rejection period must be between 5 and 60 working days.',
    });
  }

  return errors;
}

/**
 * FIDIC: timeForCompletionDays (1-3650), defectsNotificationDays (365-1095),
 * dabComposition (1 or 3)
 */
function validateFidicParams(params: FidicParams): ValidationFieldError[] {
  const errors: ValidationFieldError[] = [];

  if (
    params.timeForCompletionDays == null ||
    params.timeForCompletionDays < 1 ||
    params.timeForCompletionDays > 3650
  ) {
    errors.push({
      field: 'formSpecificParams.timeForCompletionDays',
      message: 'Time for completion must be between 1 and 3650 calendar days.',
    });
  }

  if (
    params.defectsNotificationDays == null ||
    params.defectsNotificationDays < 365 ||
    params.defectsNotificationDays > 1095
  ) {
    errors.push({
      field: 'formSpecificParams.defectsNotificationDays',
      message: 'Defects notification period must be between 365 and 1095 calendar days.',
    });
  }

  if (params.dabComposition == null || (params.dabComposition !== 1 && params.dabComposition !== 3)) {
    errors.push({
      field: 'formSpecificParams.dabComposition',
      message: 'DAB composition must be 1 or 3 members.',
    });
  }

  return errors;
}

/**
 * Validates that a string represents an actual calendar date.
 */
function isValidDate(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

// ══════════════════════════════════════════════════════════════════════════════
// Firestore Persistence
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Get a reference to the contract config document for a project.
 */
function getContractConfigRef(projectId: string) {
  return adminDb.collection('projects').doc(projectId).collection('contractConfig').doc('config');
}

// ══════════════════════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Set up a contract for a project. Validates all input, persists the ContractConfig,
 * creates an audit record, and returns outputs for Project Passport and Action Centre.
 *
 * Enforces RBAC: requires 'write' permission on 'contract_setup'.
 *
 * Requirements: 1.1, 1.2, 1.7, 1.8, 1.9, 1.10
 *
 * @throws ContractError with code UNAUTHORIZED if access is denied
 * @throws ContractError with code VALIDATION_ERROR if input is invalid
 */
export async function setupContract(
  input: ContractSetupInput,
  projectAssignment: ContractProjectAssignment
): Promise<ContractSetupResult & {
  auditRecord: ContractAuditRecord;
  passportUpdate: PassportContractUpdate;
  actionCentreEvent: ContractWorkflowEvent;
}> {
  // ── RBAC check ──────────────────────────────────────────────────────────
  assertAccess(projectAssignment.roles, 'contract_setup', 'write', projectAssignment);

  // ── Validation ──────────────────────────────────────────────────────────
  const validation = validateContractSetup(input);
  if (!validation.valid) {
    const error: ContractError = {
      code: 'VALIDATION_ERROR',
      message: 'Contract setup validation failed.',
      details: {
        invalidFields: validation.errors.map((e) => e.field),
      },
    };
    throw error;
  }

  // ── Build contract config ───────────────────────────────────────────────
  const now = new Date().toISOString();
  const contractId = `contract_${input.projectId}_${Date.now()}`;

  const contractConfig: ContractConfig = {
    id: contractId,
    projectId: input.projectId,
    contractForm: input.contractForm,
    parties: input.parties,
    commencementDate: input.commencementDate,
    practicalCompletionDate: input.practicalCompletionDate,
    contractSum: input.contractSum,
    clauseElections: input.clauseElections || [],
    formSpecificParams: input.formSpecificParams,
    status: 'active',
    setupBy: input.setupBy,
    setupAt: now,
  };

  // ── Persist to Firestore ────────────────────────────────────────────────
  const configRef = getContractConfigRef(input.projectId);
  await configRef.set(contractConfig);

  // ── Create audit record (Requirement 1.8) ──────────────────────────────
  const auditRecord: ContractAuditRecord = {
    id: `audit_${contractId}_setup`,
    projectId: input.projectId,
    entityType: 'contract',
    entityId: contractId,
    action: 'contract_setup',
    newValue: contractConfig,
    actorId: input.setupBy,
    timestamp: now,
  };

  // Write via integration service with retry (Requirement 10.6)
  await writeToAuditTrail(input.projectId, auditRecord);

  // ── Build Project Passport update (Requirement 1.7) ────────────────────
  const passportUpdate: PassportContractUpdate = {
    contractStatus: 'active',
    keyDates: {
      commencementDate: input.commencementDate,
      practicalCompletionDate: input.practicalCompletionDate,
    },
    outstandingNoticesCount: 0,
    nearestDeadlineDays: undefined,
  };

  // Write via integration service with retry (Requirement 10.1)
  await writeToProjectPassport(input.projectId, passportUpdate);

  // ── Build Action Centre event ──────────────────────────────────────────
  const formConfig = CONTRACT_FORM_CONFIGS[input.contractForm];
  const actionCentreEvent: ContractWorkflowEvent = {
    projectId: input.projectId,
    targetUserId: input.setupBy,
    priority: 'normal',
    subject: `Contract setup completed: ${formConfig.displayName}`,
    entityType: 'contract',
    entityId: contractId,
  };

  // Surface via integration service with retry (Requirement 10.5)
  await surfaceToActionCentre(actionCentreEvent);

  return {
    contractId,
    status: 'active',
    auditRecordId: auditRecord.id,
    auditRecord,
    passportUpdate,
    actionCentreEvent,
  };
}

/**
 * Read the contract configuration for a project.
 *
 * @returns The ContractConfig document, or null if no contract is set up.
 */
export async function getContractConfig(projectId: string): Promise<ContractConfig | null> {
  const configRef = getContractConfigRef(projectId);
  const snapshot = await configRef.get();

  if (!snapshot.exists) {
    return null;
  }

  return snapshot.data() as ContractConfig;
}

/**
 * Update a single contract parameter with audit trail.
 *
 * Enforces RBAC: requires 'write' permission on 'contract_setup'.
 *
 * Requirement 2.5: records change in audit trail with field name, previous value,
 * new value, changed-by user, and timestamp.
 *
 * @throws ContractError with code UNAUTHORIZED if access is denied
 * @throws ContractError with code VALIDATION_ERROR if contract not found
 */
export async function updateContractParameter(
  projectId: string,
  field: string,
  value: unknown,
  updatedBy: string,
  projectAssignment: ContractProjectAssignment
): Promise<{
  auditRecord: ContractAuditRecord;
}> {
  // ── RBAC check ──────────────────────────────────────────────────────────
  assertAccess(projectAssignment.roles, 'contract_setup', 'write', projectAssignment);

  // ── Read current config ─────────────────────────────────────────────────
  const configRef = getContractConfigRef(projectId);
  const snapshot = await configRef.get();

  if (!snapshot.exists) {
    const error: ContractError = {
      code: 'VALIDATION_ERROR',
      message: `No contract configuration found for project ${projectId}.`,
      details: {
        invalidFields: ['projectId'],
      },
    };
    throw error;
  }

  const currentConfig = snapshot.data() as ContractConfig;
  const previousValue = getNestedValue(currentConfig as unknown as Record<string, unknown>, field);

  // ── Update the field ────────────────────────────────────────────────────
  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = {
    [field]: value,
    updatedAt: now,
  };

  await configRef.update(updateData);

  // ── Create audit record (Requirement 2.5) ──────────────────────────────
  const auditRecord: ContractAuditRecord = {
    id: `audit_${currentConfig.id}_update_${Date.now()}`,
    projectId,
    entityType: 'contract',
    entityId: currentConfig.id,
    action: 'parameter_update',
    previousValue,
    newValue: value,
    actorId: updatedBy,
    timestamp: now,
  };

  // Write via integration service with retry (Requirement 10.6)
  await writeToAuditTrail(projectId, auditRecord);

  return { auditRecord };
}

// ══════════════════════════════════════════════════════════════════════════════
// Internal Helpers
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Safely retrieve a nested value from an object using a dot-separated path.
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}
