import type { PlanningStage, PlanningApplicationType } from './types';

// ─── Planning Lifecycle Stages ───────────────────────────────────────────────
/**
 * Ordered array of the 10 lifecycle stages for a South African town planning
 * application governed by SPLUMA. The sequence is enforced — applications must
 * progress through these stages without skipping.
 */
export const PLANNING_STAGES = [
  { id: 'pre_consultation' as PlanningStage, label: 'Pre-consultation', order: 0 },
  { id: 'preparation' as PlanningStage, label: 'Preparation', order: 1 },
  { id: 'submission' as PlanningStage, label: 'Submission', order: 2 },
  { id: 'circulation_advertising' as PlanningStage, label: 'Circulation/Advertising', order: 3 },
  { id: 'objection_response' as PlanningStage, label: 'Objection Response', order: 4 },
  { id: 'tribunal_decision' as PlanningStage, label: 'Tribunal/Decision', order: 5 },
  { id: 'record_of_decision' as PlanningStage, label: 'Record of Decision', order: 6 },
  { id: 'appeal_period' as PlanningStage, label: 'Appeal Period', order: 7 },
  { id: 'condition_fulfilment' as PlanningStage, label: 'Condition Fulfilment', order: 8 },
  { id: 'completion' as PlanningStage, label: 'Completion', order: 9 },
] as const;

// ─── Application Types ───────────────────────────────────────────────────────
/**
 * The 7 SPLUMA-governed application types supported by the tracker.
 */
export const APPLICATION_TYPES = [
  { id: 'rezoning' as PlanningApplicationType, label: 'Rezoning' },
  { id: 'consent_use' as PlanningApplicationType, label: 'Consent Use' },
  { id: 'subdivision' as PlanningApplicationType, label: 'Subdivision' },
  { id: 'consolidation' as PlanningApplicationType, label: 'Consolidation' },
  { id: 'site_development_plan' as PlanningApplicationType, label: 'Site Development Plan' },
  { id: 'removal_of_restrictive_conditions' as PlanningApplicationType, label: 'Removal of Restrictive Conditions' },
  { id: 'township_establishment' as PlanningApplicationType, label: 'Township Establishment' },
] as const;

// ─── SPLUMA Default Statutory Timeframes ─────────────────────────────────────
/**
 * Default statutory timeframes defined by SPLUMA (Spatial Planning and Land Use
 * Management Act 16 of 2013). These apply when no municipality-specific
 * timeframes are configured.
 *
 * - objectionPeriodDays: SPLUMA Section 53 — 28 calendar days for interested
 *   and affected parties to lodge objections after publication of notice.
 * - appealPeriodDays: SPLUMA Section 51 — 21 calendar days from date of
 *   notification of the decision within which an aggrieved party may appeal.
 * - decisionPeriodDays: SPLUMA Section 56 — 60 calendar days within which a
 *   municipality must decide on an application after close of public comment.
 *   Failure to decide within this period results in a deemed refusal.
 * - hearingPreparationAlertDays: Alert generated 14 days before a scheduled
 *   Municipal Planning Tribunal hearing to allow document preparation.
 * - hearingReminderAlertDays: Reminder alert generated 7 days before hearing.
 * - deadlineApproachingDays: Threshold for approaching-deadline alerts.
 * - deadlineUrgentDays: Threshold for urgent-priority deadline escalation.
 */
export const SPLUMA_DEFAULT_TIMEFRAMES = {
  objectionPeriodDays: 28,
  appealPeriodDays: 21,
  decisionPeriodDays: 60,
  hearingPreparationAlertDays: 14,
  hearingReminderAlertDays: 7,
  deadlineApproachingDays: 7,
  deadlineUrgentDays: 2,
} as const;

// ─── Default Document Types ──────────────────────────────────────────────────
/**
 * Mapping of required document types per application type and lifecycle stage.
 * This provides the baseline checklist — municipality profiles may add
 * additional documents or waive certain requirements.
 */
export const DEFAULT_DOCUMENT_TYPES: Record<
  PlanningApplicationType,
  Partial<Record<PlanningStage, string[]>>
> = {
  rezoning: {
    pre_consultation: ['title_deed', 'zoning_certificate'],
    preparation: ['motivation_report', 'site_plan', 'power_of_attorney', 'municipal_application_form'],
    submission: ['municipal_application_form', 'motivation_report', 'site_plan', 'title_deed', 'power_of_attorney'],
    circulation_advertising: ['public_notice', 'proof_of_advertising'],
    objection_response: ['response_to_objections'],
    tribunal_decision: ['motivation_report', 'response_to_objections'],
    record_of_decision: ['record_of_decision'],
    appeal_period: ['appeal_document'],
    condition_fulfilment: ['condition_evidence'],
  },
  consent_use: {
    pre_consultation: ['title_deed', 'zoning_certificate'],
    preparation: ['motivation_report', 'site_plan', 'power_of_attorney', 'municipal_application_form'],
    submission: ['municipal_application_form', 'motivation_report', 'site_plan', 'title_deed', 'power_of_attorney'],
    circulation_advertising: ['public_notice', 'proof_of_advertising'],
    objection_response: ['response_to_objections'],
    tribunal_decision: ['motivation_report', 'response_to_objections'],
    record_of_decision: ['record_of_decision'],
    appeal_period: ['appeal_document'],
    condition_fulfilment: ['condition_evidence'],
  },
  subdivision: {
    pre_consultation: ['title_deed', 'zoning_certificate'],
    preparation: ['motivation_report', 'site_plan', 'sdp_drawing', 'power_of_attorney', 'municipal_application_form'],
    submission: ['municipal_application_form', 'motivation_report', 'site_plan', 'sdp_drawing', 'title_deed', 'power_of_attorney'],
    circulation_advertising: ['public_notice', 'proof_of_advertising'],
    objection_response: ['response_to_objections'],
    tribunal_decision: ['motivation_report', 'response_to_objections'],
    record_of_decision: ['record_of_decision'],
    appeal_period: ['appeal_document'],
    condition_fulfilment: ['condition_evidence'],
  },
  consolidation: {
    pre_consultation: ['title_deed', 'zoning_certificate'],
    preparation: ['motivation_report', 'site_plan', 'power_of_attorney', 'municipal_application_form'],
    submission: ['municipal_application_form', 'motivation_report', 'site_plan', 'title_deed', 'power_of_attorney'],
    circulation_advertising: ['public_notice', 'proof_of_advertising'],
    objection_response: ['response_to_objections'],
    tribunal_decision: ['motivation_report', 'response_to_objections'],
    record_of_decision: ['record_of_decision'],
    appeal_period: ['appeal_document'],
    condition_fulfilment: ['condition_evidence'],
  },
  site_development_plan: {
    pre_consultation: ['title_deed', 'zoning_certificate'],
    preparation: ['motivation_report', 'sdp_drawing', 'site_plan', 'power_of_attorney', 'municipal_application_form'],
    submission: ['municipal_application_form', 'motivation_report', 'sdp_drawing', 'site_plan', 'title_deed', 'power_of_attorney'],
    circulation_advertising: ['public_notice', 'proof_of_advertising'],
    objection_response: ['response_to_objections'],
    tribunal_decision: ['motivation_report', 'response_to_objections'],
    record_of_decision: ['record_of_decision'],
    condition_fulfilment: ['condition_evidence'],
  },
  removal_of_restrictive_conditions: {
    pre_consultation: ['title_deed', 'zoning_certificate'],
    preparation: ['motivation_report', 'site_plan', 'power_of_attorney', 'municipal_application_form'],
    submission: ['municipal_application_form', 'motivation_report', 'site_plan', 'title_deed', 'power_of_attorney'],
    circulation_advertising: ['public_notice', 'proof_of_advertising'],
    objection_response: ['response_to_objections'],
    tribunal_decision: ['motivation_report', 'response_to_objections'],
    record_of_decision: ['record_of_decision'],
    appeal_period: ['appeal_document'],
    condition_fulfilment: ['condition_evidence'],
  },
  township_establishment: {
    pre_consultation: ['title_deed', 'zoning_certificate', 'environmental_screening'],
    preparation: ['motivation_report', 'site_plan', 'sdp_drawing', 'power_of_attorney', 'municipal_application_form', 'heritage_assessment', 'environmental_screening'],
    submission: ['municipal_application_form', 'motivation_report', 'site_plan', 'sdp_drawing', 'title_deed', 'power_of_attorney', 'heritage_assessment', 'environmental_screening'],
    circulation_advertising: ['public_notice', 'proof_of_advertising'],
    objection_response: ['response_to_objections'],
    tribunal_decision: ['motivation_report', 'response_to_objections'],
    record_of_decision: ['record_of_decision'],
    appeal_period: ['appeal_document'],
    condition_fulfilment: ['condition_evidence'],
  },
};

// ─── Priority Levels ─────────────────────────────────────────────────────────
/**
 * Priority constants used for deadline alerts and Action Centre notifications.
 */
export const PRIORITY_LEVELS = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  urgent: 'urgent',
} as const;

export type Priority = (typeof PRIORITY_LEVELS)[keyof typeof PRIORITY_LEVELS];

// ─── Planning Audit Actions ──────────────────────────────────────────────────
/**
 * All audit action types recorded by the planning module to the Audit Trail.
 * Each action represents a significant event in the application lifecycle.
 */
export const PLANNING_AUDIT_ACTIONS = [
  'planning_application_created',
  'planning_stage_advanced',
  'planning_objection_recorded',
  'planning_response_recorded',
  'planning_condition_captured',
  'planning_condition_fulfilled',
  'planning_appeal_lodged',
  'planning_appeal_outcome',
  'planning_hearing_scheduled',
  'planning_document_uploaded',
  'planning_deemed_refused',
  'planning_approval_effective',
  'planning_trigger_confirmed',
  'planning_survey_handoff',
] as const;

export type PlanningAuditAction = (typeof PLANNING_AUDIT_ACTIONS)[number];

// ─── Reference Number Prefix ─────────────────────────────────────────────────
/**
 * Prefix for generating planning application reference numbers.
 * Format: TP-{MUNICIPALITY_CODE}-{YEAR}-{SEQ}
 * Example: TP-CPT-2026-001
 */
export const REFERENCE_NUMBER_PREFIX = 'TP' as const;
