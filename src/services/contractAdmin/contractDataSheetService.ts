/**
 * Contract Administration — Contract Data Sheet Service
 *
 * Pure data projection service that transforms a ContractConfig into structured
 * data sheet views. Assembles all contract parameters, key dates, named persons,
 * and commercial rates with configured/pending indicators for each field.
 *
 * This service operates on ContractConfig inputs (no direct Firestore access).
 * The contract engine service handles persistence and provides the config.
 *
 * RBAC: viewable by all project members (data_sheet_view),
 *       editable only by architect/bep/quantity_surveyor/platform_admin (data_sheet_edit).
 *
 * @module contractDataSheetService
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 2.8
 */

import type {
  ContractConfig,
  ContractParty,
  ContractProjectAssignment,
  ContractForm,
  JbccParams,
  NecParams,
  GccParams,
  FidicParams,
  FormSpecificParams,
} from './contractTypes';
import { canAccess } from './contractRbacService';
import type { UserRole } from '@/types';

// ══════════════════════════════════════════════════════════════════════════════
// Data Sheet Types
// ══════════════════════════════════════════════════════════════════════════════

/**
 * A single field in the data sheet with a configured/pending indicator.
 * When configured is false, the value represents the pending state
 * (not omitted from display per Requirement 2.6).
 */
export interface DataSheetField<T = unknown> {
  /** The field label/name */
  label: string;
  /** The field value (null when not yet configured) */
  value: T | null;
  /** Whether this field has been configured */
  configured: boolean;
}

/** Key dates section of the contract data sheet (Requirement 2.2) */
export interface KeyDatesSheet {
  commencementDate: DataSheetField<string>;
  practicalCompletionDate: DataSheetField<string>;
  revisedCompletionDate: DataSheetField<string>;
  defectsLiabilityEndDate: DataSheetField<string>;
  finalAccountDate: DataSheetField<string>;
}

/** A named person entry in the data sheet (Requirement 2.3) */
export interface NamedPersonEntry {
  id: string;
  name: string;
  role: string;
  contactEmail: DataSheetField<string>;
  userId: DataSheetField<string>;
}

/** Named persons section of the contract data sheet */
export interface NamedPersonsSheet {
  parties: NamedPersonEntry[];
  totalParties: number;
}

/** Commercial rates section of the contract data sheet (Requirement 2.4) */
export interface CommercialRatesSheet {
  penaltyRatePerDay: DataSheetField<number>;
  retentionPercentage: DataSheetField<number>;
  performanceGuaranteePercentage: DataSheetField<number>;
  insuranceRequirements: DataSheetField<{
    policyType: string;
    minimumCoverAmount: number;
  }>;
}

/** The complete contract data sheet (Requirements 2.1–2.8) */
export interface ContractDataSheet {
  /** Contract form identifier */
  contractForm: DataSheetField<ContractForm>;
  /** Contract sum in ZAR */
  contractSum: DataSheetField<number>;
  /** Contract status */
  status: DataSheetField<string>;
  /** Key dates section */
  keyDates: KeyDatesSheet;
  /** Named persons section */
  namedPersons: NamedPersonsSheet;
  /** Commercial rates section */
  commercialRates: CommercialRatesSheet;
  /** Elected optional clauses count */
  electedClausesCount: DataSheetField<number>;
  /** Whether the user can edit the data sheet */
  canEdit: boolean;
}

// ══════════════════════════════════════════════════════════════════════════════
// Helper: Create DataSheetField
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a DataSheetField, marking it as configured if the value is
 * non-null and non-undefined.
 */
function field<T>(label: string, value: T | null | undefined): DataSheetField<T> {
  const isConfigured = value !== null && value !== undefined;
  return {
    label,
    value: isConfigured ? value : null,
    configured: isConfigured,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Key Dates
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Extracts and structures key dates from the contract configuration.
 *
 * Returns commencement, practical completion, revised completion,
 * defects liability end, and final account date — each with a
 * configured/pending indicator.
 *
 * The defects liability end date is derived from the practical completion
 * date (or revised completion date) plus the form-specific defects period.
 * Final account date is typically a fixed period after practical completion
 * (varies by form).
 */
export function getKeyDates(config: ContractConfig): KeyDatesSheet {
  const completionDate = config.revisedCompletionDate || config.practicalCompletionDate;

  // Calculate defects liability end date based on contract form
  const defectsEndDate = calculateDefectsLiabilityEndDate(config);

  // Calculate final account date (form-specific period after practical completion)
  const finalAccountDate = calculateFinalAccountDate(config);

  return {
    commencementDate: field('Commencement Date', config.commencementDate || null),
    practicalCompletionDate: field('Practical Completion Date', config.practicalCompletionDate || null),
    revisedCompletionDate: field('Revised Completion Date', config.revisedCompletionDate || null),
    defectsLiabilityEndDate: field('Defects Liability End Date', defectsEndDate),
    finalAccountDate: field('Final Account Date', finalAccountDate),
  };
}

/**
 * Calculates the defects liability end date based on the contract form
 * and form-specific parameters.
 */
function calculateDefectsLiabilityEndDate(config: ContractConfig): string | null {
  const completionDate = config.revisedCompletionDate || config.practicalCompletionDate;
  if (!completionDate) return null;

  const params = config.formSpecificParams;

  switch (config.contractForm) {
    case 'jbcc_pba': {
      const jbcc = params as JbccParams;
      if (jbcc.defectsLiabilityMonths == null) return null;
      return addMonths(completionDate, jbcc.defectsLiabilityMonths);
    }
    case 'fidic': {
      const fidic = params as FidicParams;
      if (fidic.defectsNotificationDays == null) return null;
      return addCalendarDays(completionDate, fidic.defectsNotificationDays);
    }
    case 'gcc_2025': {
      // GCC 2025 typically uses 12 months defects liability (standard)
      return addMonths(completionDate, 12);
    }
    case 'nec_ecc': {
      // NEC uses defects date defined at contract data; default 12 months
      return addMonths(completionDate, 12);
    }
    default:
      return null;
  }
}

/**
 * Calculates the final account date based on the contract form.
 * Typically a fixed period after practical completion.
 */
function calculateFinalAccountDate(config: ContractConfig): string | null {
  const completionDate = config.revisedCompletionDate || config.practicalCompletionDate;
  if (!completionDate) return null;

  switch (config.contractForm) {
    case 'jbcc_pba':
      // JBCC: final account within 6 months of practical completion
      return addMonths(completionDate, 6);
    case 'nec_ecc':
      // NEC: final assessment within 13 weeks of defects certificate
      return addCalendarDays(completionDate, 91);
    case 'gcc_2025':
      // GCC: final account within 6 months
      return addMonths(completionDate, 6);
    case 'fidic':
      // FIDIC: final payment within 56 days of final statement
      return addCalendarDays(completionDate, 56);
    default:
      return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Named Persons
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Extracts and structures named persons from the contract configuration.
 *
 * Returns all parties with their contractual roles — never omitting any
 * party from the output (Requirement 2.3, Property 3).
 */
export function getNamedPersons(config: ContractConfig): NamedPersonsSheet {
  const parties: NamedPersonEntry[] = (config.parties || []).map((party) => ({
    id: party.id,
    name: party.name,
    role: party.role,
    contactEmail: field('Contact Email', party.contactEmail || null),
    userId: field('Linked User', party.userId || null),
  }));

  return {
    parties,
    totalParties: parties.length,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Commercial Rates
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Extracts and structures commercial rates from the contract configuration.
 *
 * Returns penalty rate, retention %, performance guarantee %, and
 * insurance requirements — each with a configured/pending indicator
 * (Requirement 2.4).
 */
export function getCommercialRates(config: ContractConfig): CommercialRatesSheet {
  const params = config.formSpecificParams;
  const penaltyRate = extractPenaltyRate(config.contractForm, params);
  const retentionPct = extractRetentionPercentage(config.contractForm, params);

  // Performance guarantee and insurance are not in the form-specific params
  // but may be in clause elections or additional config. Show as pending if not found.
  const performanceGuarantee = extractPerformanceGuarantee(config);
  const insurance = extractInsuranceRequirements(config);

  return {
    penaltyRatePerDay: field('Penalty Rate per Day (ZAR)', penaltyRate),
    retentionPercentage: field('Retention Percentage (%)', retentionPct),
    performanceGuaranteePercentage: field('Performance Guarantee (%)', performanceGuarantee),
    insuranceRequirements: field('Insurance Requirements', insurance),
  };
}

/**
 * Extracts penalty rate from form-specific parameters.
 */
function extractPenaltyRate(form: ContractForm, params: FormSpecificParams): number | null {
  switch (form) {
    case 'jbcc_pba':
      return (params as JbccParams).penaltyRatePerDay ?? null;
    case 'gcc_2025':
      return (params as GccParams).penaltyRatePerDay ?? null;
    case 'nec_ecc':
    case 'fidic':
      // NEC and FIDIC use delay damages, not a "penalty" per se
      // Show as pending until specifically configured
      return null;
    default:
      return null;
  }
}

/**
 * Extracts retention percentage from form-specific parameters.
 */
function extractRetentionPercentage(form: ContractForm, params: FormSpecificParams): number | null {
  switch (form) {
    case 'jbcc_pba':
      return (params as JbccParams).retentionPercentage ?? null;
    case 'nec_ecc':
    case 'gcc_2025':
    case 'fidic':
      // These forms configure retention separately — show pending if not in params
      return null;
    default:
      return null;
  }
}

/**
 * Extracts performance guarantee percentage from clause elections.
 * Looks for a clause election with "performance guarantee" or "performance bond".
 */
function extractPerformanceGuarantee(config: ContractConfig): number | null {
  const guaranteeClause = config.clauseElections?.find(
    (c) =>
      c.elected &&
      (c.clauseTitle.toLowerCase().includes('performance guarantee') ||
        c.clauseTitle.toLowerCase().includes('performance bond'))
  );

  if (guaranteeClause?.parameters?.['percentage'] != null) {
    return guaranteeClause.parameters['percentage'] as number;
  }

  return null;
}

/**
 * Extracts insurance requirements from clause elections.
 * Looks for a clause election related to insurance.
 */
function extractInsuranceRequirements(
  config: ContractConfig
): { policyType: string; minimumCoverAmount: number } | null {
  const insuranceClause = config.clauseElections?.find(
    (c) =>
      c.elected &&
      (c.clauseTitle.toLowerCase().includes('insurance') ||
        c.clauseTitle.toLowerCase().includes('indemnity'))
  );

  if (
    insuranceClause?.parameters?.['policyType'] != null &&
    insuranceClause?.parameters?.['minimumCoverAmount'] != null
  ) {
    return {
      policyType: insuranceClause.parameters['policyType'] as string,
      minimumCoverAmount: insuranceClause.parameters['minimumCoverAmount'] as number,
    };
  }

  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// Full Data Sheet Assembly
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Assembles the complete contract data sheet from a ContractConfig.
 *
 * This is the main entry point for the data sheet service. It projects
 * all contract parameters, key dates, named persons, and commercial rates
 * into the structured data sheet view. Unconfigured fields are shown with
 * `configured: false` rather than being omitted (Requirement 2.6).
 *
 * RBAC is enforced: the `canEdit` flag is set based on the user's role
 * and project assignment (Requirement 2.7, 2.8).
 *
 * @param config - The contract configuration to project
 * @param userRole - The requesting user's role
 * @param projectAssignment - The user's project assignment for RBAC
 * @returns The complete contract data sheet
 */
export function getDataSheet(
  config: ContractConfig,
  userRole: UserRole,
  projectAssignment: ContractProjectAssignment
): ContractDataSheet {
  // RBAC: check edit permission (Requirement 2.7)
  const canEdit = canAccess(userRole, 'data_sheet_edit', 'write', projectAssignment);

  const electedCount = config.clauseElections?.filter((c) => c.elected).length ?? 0;

  return {
    contractForm: field('Contract Form', config.contractForm || null),
    contractSum: field('Contract Sum (ZAR)', config.contractSum ?? null),
    status: field('Contract Status', config.status || null),
    keyDates: getKeyDates(config),
    namedPersons: getNamedPersons(config),
    commercialRates: getCommercialRates(config),
    electedClausesCount: field('Elected Optional Clauses', electedCount > 0 ? electedCount : null),
    canEdit,
  };
}

/**
 * Checks whether a user can view the contract data sheet.
 *
 * All project members can view (Requirement 2.7).
 */
export function canViewDataSheet(
  userRole: UserRole,
  projectAssignment: ContractProjectAssignment
): boolean {
  return canAccess(userRole, 'data_sheet_view', 'read', projectAssignment);
}

/**
 * Checks whether a user can edit the contract data sheet.
 *
 * Editable only by architect, bep, quantity_surveyor, or platform_admin
 * (Requirement 2.7).
 */
export function canEditDataSheet(
  userRole: UserRole,
  projectAssignment: ContractProjectAssignment
): boolean {
  return canAccess(userRole, 'data_sheet_edit', 'write', projectAssignment);
}

// ══════════════════════════════════════════════════════════════════════════════
// Date Arithmetic Helpers (pure, no external dependencies)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Adds a number of months to an ISO date string.
 * Handles month overflow (e.g., Jan 31 + 1 month = Feb 28/29).
 */
function addMonths(isoDate: string, months: number): string {
  const date = new Date(isoDate);
  const targetMonth = date.getMonth() + months;
  date.setMonth(targetMonth);

  // Handle overflow (e.g., adding 1 month to Jan 31 gives Mar 3 → clamp to Feb 28)
  const expectedMonth = ((date.getMonth() - months % 12) + 12) % 12;
  if (date.getMonth() !== targetMonth % 12) {
    // Went past end of month, clamp to last day of target month
    date.setDate(0);
  }

  return date.toISOString().split('T')[0];
}

/**
 * Adds a number of calendar days to an ISO date string.
 */
function addCalendarDays(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}
