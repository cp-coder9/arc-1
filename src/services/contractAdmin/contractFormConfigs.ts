/**
 * Contract Administration — Per-Form Configuration Data
 *
 * Encodes form-specific notice types, deadline rules, deemed outcomes,
 * payment intervals, and EoT notification deadlines for each supported
 * South African standard contract form.
 *
 * Clause references are by number and descriptive title only —
 * no copyrighted clause text is reproduced (Requirement 1.9 / 11.3).
 */

import type { ContractForm } from './contractTypes';

// ══════════════════════════════════════════════════════════════════════════════
// Configuration Types
// ══════════════════════════════════════════════════════════════════════════════

/** Day type used for deadline calculation */
export type DayType = 'working' | 'calendar';

/** Deemed outcome when a response period expires without reply */
export type DeemedOutcome = 'acceptance' | 'rejection' | null;

/** A single clause response period mapping */
export interface ClauseResponsePeriod {
  /** Clause number (e.g. "23.1") */
  clauseNumber: string;
  /** Descriptive title of the clause */
  clauseTitle: string;
  /** Number of days for the response period */
  responsePeriodDays: number;
  /** Whether to count working days or calendar days */
  dayType: DayType;
  /** What happens when the period expires without response */
  deemedOutcome: DeemedOutcome;
}

/** Notice type available under a specific contract form */
export interface ContractNoticeType {
  /** Unique identifier for this notice type within the form */
  id: string;
  /** Human-readable label */
  label: string;
  /** The clause this notice type relates to */
  clauseNumber: string;
  /** Descriptive title of the relevant clause */
  clauseTitle: string;
}

/** EoT notification deadline rule per contract form */
export interface EoTNotificationRule {
  /** Days within which the contractor must notify of a delay event */
  notificationPeriodDays: number;
  /** Day type for the notification period */
  dayType: DayType;
  /** Clause governing notification requirements */
  clauseNumber: string;
  /** Descriptive title of the clause */
  clauseTitle: string;
}

/** Payment interval configuration */
export interface PaymentIntervalConfig {
  /** Default payment interval in calendar days */
  defaultIntervalDays: number;
  /** Clause governing payment intervals */
  clauseNumber: string;
  /** Descriptive title of the clause */
  clauseTitle: string;
  /** Number of days from valuation date to certificate issue */
  certificateIssueDays: number;
  /** Day type for certificate issue period */
  certificateIssueDayType: DayType;
  /** Number of days from certificate issue to payment due */
  paymentDueDays: number;
  /** Day type for payment due period */
  paymentDueDayType: DayType;
}

/** Complete configuration for a contract form */
export interface ContractFormConfig {
  /** The contract form identifier */
  form: ContractForm;
  /** Display name of the contract form */
  displayName: string;
  /** Available notice types under this form */
  noticeTypes: ContractNoticeType[];
  /** Clause-to-response-period mappings */
  clauseResponsePeriods: ClauseResponsePeriod[];
  /** Payment interval configuration */
  paymentInterval: PaymentIntervalConfig;
  /** EoT notification deadline rule */
  eotNotificationRule: EoTNotificationRule;
}

// ══════════════════════════════════════════════════════════════════════════════
// JBCC PBA Configuration
// ══════════════════════════════════════════════════════════════════════════════

const JBCC_NOTICE_TYPES: ContractNoticeType[] = [
  {
    id: 'jbcc_practical_completion',
    label: 'Practical Completion Notice',
    clauseNumber: '21.0',
    clauseTitle: 'Practical completion',
  },
  {
    id: 'jbcc_penalty_notice',
    label: 'Penalty Notice',
    clauseNumber: '22.0',
    clauseTitle: 'Penalty for late completion',
  },
  {
    id: 'jbcc_variation_instruction',
    label: 'Variation Instruction',
    clauseNumber: '17.0',
    clauseTitle: 'Variations',
  },
  {
    id: 'jbcc_revision_of_date',
    label: 'Revision of Date Notice',
    clauseNumber: '23.0',
    clauseTitle: 'Revision of the date for practical completion',
  },
  {
    id: 'jbcc_interim_payment',
    label: 'Interim Payment Certificate',
    clauseNumber: '24.1',
    clauseTitle: 'Interim payment',
  },
  {
    id: 'jbcc_final_account',
    label: 'Final Account Notice',
    clauseNumber: '25.0',
    clauseTitle: 'Final account and final payment',
  },
  {
    id: 'jbcc_contract_instruction',
    label: 'Contract Instruction',
    clauseNumber: '10.0',
    clauseTitle: 'Contract instructions',
  },
  {
    id: 'jbcc_defects_liability',
    label: 'Defects Liability Notice',
    clauseNumber: '20.0',
    clauseTitle: 'Defects liability',
  },
  {
    id: 'jbcc_termination',
    label: 'Termination Notice',
    clauseNumber: '26.0',
    clauseTitle: 'Termination of contract',
  },
  {
    id: 'jbcc_dispute',
    label: 'Dispute Notice',
    clauseNumber: '29.0',
    clauseTitle: 'Dispute resolution',
  },
];

const JBCC_CLAUSE_RESPONSE_PERIODS: ClauseResponsePeriod[] = [
  {
    clauseNumber: '23.1',
    clauseTitle: 'Revision of date — contractor application',
    responsePeriodDays: 15,
    dayType: 'working',
    deemedOutcome: null,
  },
  {
    clauseNumber: '17.2',
    clauseTitle: 'Variation — valuation agreement',
    responsePeriodDays: 10,
    dayType: 'working',
    deemedOutcome: null,
  },
  {
    clauseNumber: '24.2',
    clauseTitle: 'Interim payment — contractor objection',
    responsePeriodDays: 5,
    dayType: 'working',
    deemedOutcome: 'acceptance',
  },
  {
    clauseNumber: '25.3',
    clauseTitle: 'Final account — contractor objection',
    responsePeriodDays: 10,
    dayType: 'working',
    deemedOutcome: 'acceptance',
  },
  {
    clauseNumber: '26.2',
    clauseTitle: 'Termination — rectification period',
    responsePeriodDays: 10,
    dayType: 'working',
    deemedOutcome: null,
  },
  {
    clauseNumber: '29.1',
    clauseTitle: 'Dispute — adjudication notice',
    responsePeriodDays: 10,
    dayType: 'working',
    deemedOutcome: null,
  },
  {
    clauseNumber: '10.1',
    clauseTitle: 'Contract instruction — compliance period',
    responsePeriodDays: 5,
    dayType: 'working',
    deemedOutcome: null,
  },
];

const JBCC_PAYMENT_INTERVAL: PaymentIntervalConfig = {
  defaultIntervalDays: 30,
  clauseNumber: '24.0',
  clauseTitle: 'Payment',
  certificateIssueDays: 5,
  certificateIssueDayType: 'working',
  paymentDueDays: 7,
  paymentDueDayType: 'calendar',
};

const JBCC_EOT_NOTIFICATION: EoTNotificationRule = {
  notificationPeriodDays: 20,
  dayType: 'working',
  clauseNumber: '23.1',
  clauseTitle: 'Revision of the date — notification requirement',
};

// ══════════════════════════════════════════════════════════════════════════════
// NEC ECC Configuration
// ══════════════════════════════════════════════════════════════════════════════

const NEC_NOTICE_TYPES: ContractNoticeType[] = [
  {
    id: 'nec_early_warning',
    label: 'Early Warning Notice',
    clauseNumber: '16.1',
    clauseTitle: 'Early warning',
  },
  {
    id: 'nec_compensation_event',
    label: 'Compensation Event Notice',
    clauseNumber: '61.3',
    clauseTitle: 'Notifying compensation events',
  },
  {
    id: 'nec_programme_submission',
    label: 'Programme Submission',
    clauseNumber: '32.1',
    clauseTitle: 'Programme',
  },
  {
    id: 'nec_instruction',
    label: 'Project Manager Instruction',
    clauseNumber: '27.3',
    clauseTitle: 'Instructions',
  },
  {
    id: 'nec_quotation_request',
    label: 'Quotation Request',
    clauseNumber: '62.3',
    clauseTitle: 'Quotation for compensation event',
  },
  {
    id: 'nec_acceptance',
    label: 'Acceptance Notice',
    clauseNumber: '13.4',
    clauseTitle: 'Acceptance and notification',
  },
  {
    id: 'nec_defects',
    label: 'Defects Notification',
    clauseNumber: '44.2',
    clauseTitle: 'Notifying defects',
  },
  {
    id: 'nec_termination',
    label: 'Termination Notice',
    clauseNumber: '90.1',
    clauseTitle: 'Termination',
  },
  {
    id: 'nec_dispute',
    label: 'Dispute Notice',
    clauseNumber: 'W1.1',
    clauseTitle: 'Dispute resolution — option W1',
  },
];

const NEC_CLAUSE_RESPONSE_PERIODS: ClauseResponsePeriod[] = [
  {
    clauseNumber: '62.3',
    clauseTitle: 'Quotation — submission period',
    responsePeriodDays: 21,
    dayType: 'calendar',
    deemedOutcome: null,
  },
  {
    clauseNumber: '62.6',
    clauseTitle: 'Quotation — project manager assessment',
    responsePeriodDays: 14,
    dayType: 'calendar',
    deemedOutcome: 'acceptance',
  },
  {
    clauseNumber: '61.3',
    clauseTitle: 'Compensation event — contractor notification',
    responsePeriodDays: 56,
    dayType: 'calendar',
    deemedOutcome: null,
  },
  {
    clauseNumber: '32.2',
    clauseTitle: 'Programme — acceptance response',
    responsePeriodDays: 14,
    dayType: 'calendar',
    deemedOutcome: 'acceptance',
  },
  {
    clauseNumber: '13.4',
    clauseTitle: 'Communications — reply period',
    responsePeriodDays: 14,
    dayType: 'calendar',
    deemedOutcome: 'acceptance',
  },
  {
    clauseNumber: 'W1.3',
    clauseTitle: 'Dispute — adjudicator referral',
    responsePeriodDays: 28,
    dayType: 'calendar',
    deemedOutcome: null,
  },
];

const NEC_PAYMENT_INTERVAL: PaymentIntervalConfig = {
  defaultIntervalDays: 28,
  clauseNumber: '51.2',
  clauseTitle: 'Payment — assessment interval',
  certificateIssueDays: 7,
  certificateIssueDayType: 'calendar',
  paymentDueDays: 21,
  paymentDueDayType: 'calendar',
};

const NEC_EOT_NOTIFICATION: EoTNotificationRule = {
  notificationPeriodDays: 56,
  dayType: 'calendar',
  clauseNumber: '61.3',
  clauseTitle: 'Compensation event — notification deadline',
};

// ══════════════════════════════════════════════════════════════════════════════
// GCC 2025 Configuration
// ══════════════════════════════════════════════════════════════════════════════

const GCC_NOTICE_TYPES: ContractNoticeType[] = [
  {
    id: 'gcc_advance_warning',
    label: 'Advance Warning',
    clauseNumber: '5.8',
    clauseTitle: 'Advance warning of matters affecting the works',
  },
  {
    id: 'gcc_claim_first_stage',
    label: 'Claim First Stage Notice',
    clauseNumber: '10.1',
    clauseTitle: 'Claims — first stage notification',
  },
  {
    id: 'gcc_claim_second_stage',
    label: 'Claim Second Stage Submission',
    clauseNumber: '10.2',
    clauseTitle: 'Claims — second stage substantiation',
  },
  {
    id: 'gcc_variation_order',
    label: 'Variation Order',
    clauseNumber: '6.1',
    clauseTitle: 'Variations to the works',
  },
  {
    id: 'gcc_extension_of_time',
    label: 'Extension of Time Application',
    clauseNumber: '5.12',
    clauseTitle: 'Extension of time for completion',
  },
  {
    id: 'gcc_payment_certificate',
    label: 'Payment Certificate',
    clauseNumber: '6.10',
    clauseTitle: 'Payment',
  },
  {
    id: 'gcc_practical_completion',
    label: 'Practical Completion Certificate',
    clauseNumber: '5.14',
    clauseTitle: 'Practical completion',
  },
  {
    id: 'gcc_termination',
    label: 'Termination Notice',
    clauseNumber: '8.1',
    clauseTitle: 'Termination by employer',
  },
  {
    id: 'gcc_dispute',
    label: 'Dispute Referral',
    clauseNumber: '10.5',
    clauseTitle: 'Dispute adjudication',
  },
  {
    id: 'gcc_defects',
    label: 'Defects Liability Notice',
    clauseNumber: '5.16',
    clauseTitle: 'Defects liability period',
  },
];

const GCC_CLAUSE_RESPONSE_PERIODS: ClauseResponsePeriod[] = [
  {
    clauseNumber: '10.1',
    clauseTitle: 'Claims — first stage notification',
    responsePeriodDays: 28,
    dayType: 'working',
    deemedOutcome: null,
  },
  {
    clauseNumber: '10.2',
    clauseTitle: 'Claims — second stage substantiation',
    responsePeriodDays: 28,
    dayType: 'working',
    deemedOutcome: null,
  },
  {
    clauseNumber: '10.3',
    clauseTitle: 'Claims — employer agent response',
    responsePeriodDays: 28,
    dayType: 'working',
    deemedOutcome: 'rejection',
  },
  {
    clauseNumber: '6.3',
    clauseTitle: 'Variation — valuation agreement',
    responsePeriodDays: 14,
    dayType: 'working',
    deemedOutcome: null,
  },
  {
    clauseNumber: '5.12',
    clauseTitle: 'Extension of time — employer agent response',
    responsePeriodDays: 21,
    dayType: 'working',
    deemedOutcome: 'rejection',
  },
  {
    clauseNumber: '10.5',
    clauseTitle: 'Dispute — adjudicator referral period',
    responsePeriodDays: 28,
    dayType: 'calendar',
    deemedOutcome: null,
  },
  {
    clauseNumber: '5.8',
    clauseTitle: 'Advance warning — acknowledgement',
    responsePeriodDays: 5,
    dayType: 'working',
    deemedOutcome: null,
  },
];

const GCC_PAYMENT_INTERVAL: PaymentIntervalConfig = {
  defaultIntervalDays: 30,
  clauseNumber: '6.10',
  clauseTitle: 'Payment — interim certificates',
  certificateIssueDays: 14,
  certificateIssueDayType: 'working',
  paymentDueDays: 14,
  paymentDueDayType: 'calendar',
};

const GCC_EOT_NOTIFICATION: EoTNotificationRule = {
  notificationPeriodDays: 28,
  dayType: 'working',
  clauseNumber: '5.12',
  clauseTitle: 'Extension of time — notification requirement',
};

// ══════════════════════════════════════════════════════════════════════════════
// FIDIC Configuration
// ══════════════════════════════════════════════════════════════════════════════

const FIDIC_NOTICE_TYPES: ContractNoticeType[] = [
  {
    id: 'fidic_claim_notice',
    label: 'Claim Notice',
    clauseNumber: '20.2.1',
    clauseTitle: 'Notice of claim',
  },
  {
    id: 'fidic_claim_substantiation',
    label: 'Claim Substantiation',
    clauseNumber: '20.2.4',
    clauseTitle: 'Fully detailed claim',
  },
  {
    id: 'fidic_variation_instruction',
    label: 'Variation Instruction',
    clauseNumber: '13.3.1',
    clauseTitle: 'Variation by instruction',
  },
  {
    id: 'fidic_variation_proposal',
    label: 'Variation Proposal',
    clauseNumber: '13.2',
    clauseTitle: 'Value engineering',
  },
  {
    id: 'fidic_extension_of_time',
    label: 'Extension of Time Notice',
    clauseNumber: '8.5',
    clauseTitle: 'Extension of time for completion',
  },
  {
    id: 'fidic_ipc',
    label: 'Interim Payment Certificate',
    clauseNumber: '14.6',
    clauseTitle: 'Interim payment certificate',
  },
  {
    id: 'fidic_taking_over',
    label: 'Taking Over Certificate',
    clauseNumber: '10.1',
    clauseTitle: 'Taking over of the works',
  },
  {
    id: 'fidic_defects',
    label: 'Defects Notification',
    clauseNumber: '11.1',
    clauseTitle: 'Completion of outstanding work and remedying defects',
  },
  {
    id: 'fidic_termination',
    label: 'Termination Notice',
    clauseNumber: '15.2',
    clauseTitle: 'Termination by employer',
  },
  {
    id: 'fidic_dispute',
    label: 'Dispute Referral',
    clauseNumber: '21.4',
    clauseTitle: 'Referral to dispute adjudication board',
  },
  {
    id: 'fidic_engineer_determination',
    label: 'Engineer Determination',
    clauseNumber: '3.7',
    clauseTitle: 'Agreement or determination',
  },
];

const FIDIC_CLAUSE_RESPONSE_PERIODS: ClauseResponsePeriod[] = [
  {
    clauseNumber: '20.2.1',
    clauseTitle: 'Claim notice — submission deadline',
    responsePeriodDays: 28,
    dayType: 'calendar',
    deemedOutcome: null,
  },
  {
    clauseNumber: '3.7',
    clauseTitle: 'Engineer determination — agreement period',
    responsePeriodDays: 42,
    dayType: 'calendar',
    deemedOutcome: null,
  },
  {
    clauseNumber: '3.7.3',
    clauseTitle: 'Engineer determination — response to dissatisfaction',
    responsePeriodDays: 28,
    dayType: 'calendar',
    deemedOutcome: 'rejection',
  },
  {
    clauseNumber: '13.3.1',
    clauseTitle: 'Variation — contractor proposal response',
    responsePeriodDays: 28,
    dayType: 'calendar',
    deemedOutcome: null,
  },
  {
    clauseNumber: '14.6',
    clauseTitle: 'Interim payment — engineer certification period',
    responsePeriodDays: 28,
    dayType: 'calendar',
    deemedOutcome: null,
  },
  {
    clauseNumber: '21.4',
    clauseTitle: 'Dispute — DAB referral period',
    responsePeriodDays: 28,
    dayType: 'calendar',
    deemedOutcome: null,
  },
  {
    clauseNumber: '21.4.1',
    clauseTitle: 'Dispute — DAB decision period',
    responsePeriodDays: 84,
    dayType: 'calendar',
    deemedOutcome: null,
  },
  {
    clauseNumber: '20.2.5',
    clauseTitle: 'Claim — engineer response period',
    responsePeriodDays: 42,
    dayType: 'calendar',
    deemedOutcome: 'acceptance',
  },
];

const FIDIC_PAYMENT_INTERVAL: PaymentIntervalConfig = {
  defaultIntervalDays: 28,
  clauseNumber: '14.3',
  clauseTitle: 'Application for interim payment',
  certificateIssueDays: 28,
  certificateIssueDayType: 'calendar',
  paymentDueDays: 56,
  paymentDueDayType: 'calendar',
};

const FIDIC_EOT_NOTIFICATION: EoTNotificationRule = {
  notificationPeriodDays: 28,
  dayType: 'calendar',
  clauseNumber: '20.2.1',
  clauseTitle: 'Claims — notice of claim deadline',
};

// ══════════════════════════════════════════════════════════════════════════════
// Exported Configurations
// ══════════════════════════════════════════════════════════════════════════════

/** JBCC PBA contract form configuration */
export const JBCC_PBA_CONFIG: ContractFormConfig = {
  form: 'jbcc_pba',
  displayName: 'JBCC Principal Building Agreement',
  noticeTypes: JBCC_NOTICE_TYPES,
  clauseResponsePeriods: JBCC_CLAUSE_RESPONSE_PERIODS,
  paymentInterval: JBCC_PAYMENT_INTERVAL,
  eotNotificationRule: JBCC_EOT_NOTIFICATION,
};

/** NEC ECC contract form configuration */
export const NEC_ECC_CONFIG: ContractFormConfig = {
  form: 'nec_ecc',
  displayName: 'NEC Engineering and Construction Contract',
  noticeTypes: NEC_NOTICE_TYPES,
  clauseResponsePeriods: NEC_CLAUSE_RESPONSE_PERIODS,
  paymentInterval: NEC_PAYMENT_INTERVAL,
  eotNotificationRule: NEC_EOT_NOTIFICATION,
};

/** GCC 2025 contract form configuration */
export const GCC_2025_CONFIG: ContractFormConfig = {
  form: 'gcc_2025',
  displayName: 'General Conditions of Contract 2025',
  noticeTypes: GCC_NOTICE_TYPES,
  clauseResponsePeriods: GCC_CLAUSE_RESPONSE_PERIODS,
  paymentInterval: GCC_PAYMENT_INTERVAL,
  eotNotificationRule: GCC_EOT_NOTIFICATION,
};

/** FIDIC contract form configuration */
export const FIDIC_CONFIG: ContractFormConfig = {
  form: 'fidic',
  displayName: 'FIDIC Conditions of Contract',
  noticeTypes: FIDIC_NOTICE_TYPES,
  clauseResponsePeriods: FIDIC_CLAUSE_RESPONSE_PERIODS,
  paymentInterval: FIDIC_PAYMENT_INTERVAL,
  eotNotificationRule: FIDIC_EOT_NOTIFICATION,
};

/** Map of all contract form configurations keyed by ContractForm identifier */
export const CONTRACT_FORM_CONFIGS: Record<ContractForm, ContractFormConfig> = {
  jbcc_pba: JBCC_PBA_CONFIG,
  nec_ecc: NEC_ECC_CONFIG,
  gcc_2025: GCC_2025_CONFIG,
  fidic: FIDIC_CONFIG,
};

// ══════════════════════════════════════════════════════════════════════════════
// Lookup Utilities
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Look up the response period configuration for a specific clause
 * under a given contract form.
 *
 * @returns The clause response period config, or undefined if no
 * response period is configured for that clause.
 */
export function getClauseResponsePeriod(
  form: ContractForm,
  clauseNumber: string,
): ClauseResponsePeriod | undefined {
  const config = CONTRACT_FORM_CONFIGS[form];
  return config.clauseResponsePeriods.find((c) => c.clauseNumber === clauseNumber);
}

/**
 * Get all available notice types for a given contract form.
 */
export function getNoticeTypesForForm(form: ContractForm): ContractNoticeType[] {
  return CONTRACT_FORM_CONFIGS[form].noticeTypes;
}

/**
 * Get the payment interval configuration for a given contract form.
 */
export function getPaymentIntervalConfig(form: ContractForm): PaymentIntervalConfig {
  return CONTRACT_FORM_CONFIGS[form].paymentInterval;
}

/**
 * Get the EoT notification rule for a given contract form.
 */
export function getEoTNotificationRule(form: ContractForm): EoTNotificationRule {
  return CONTRACT_FORM_CONFIGS[form].eotNotificationRule;
}

/**
 * Get the full form configuration for a given contract form.
 */
export function getFormConfig(form: ContractForm): ContractFormConfig {
  return CONTRACT_FORM_CONFIGS[form];
}
