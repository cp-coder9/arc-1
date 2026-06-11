/**
 * Architex Project Communication Engine — Phase Configuration
 *
 * Full phase-aware communication configuration covering every ProjectStage,
 * including scoping. Provides human-readable capture-item labels, AI-suggested
 * prompts, next-action labels, and file/record focus for each project stage.
 *
 * This is the canonical phase config for the Project Communication Engine.
 * The existing src/services/phaseCommunicationConfig.ts provides machine-oriented
 * capture types and conversion routes; this module provides the UI-facing labels
 * and prompts that the Project Chat Applet and Message Centre render.
 */

import type { ProjectStage } from '@/types';
import type { PhaseCommunicationUIConfig } from './types';

export const PHASE_COMMUNICATION_UI_CONFIG: Record<ProjectStage, PhaseCommunicationUIConfig> = {
  intake: {
    stage: 'intake',
    label: 'Intake / Enquiry',
    description: 'Initial client enquiry and basic project information.',
    captureItems: [
      'New enquiry',
      'Property address',
      'Client requirement',
      'Budget range',
      'Timeline target',
      'Existing document',
      'Site photo',
      'Contact detail',
    ],
    suggestedPrompts: [
      'Summarise the client’s brief from this chat.',
      'What project information is still missing?',
      'Create a clean intake checklist from these messages.',
    ],
    nextActions: [
      'Confirm client contact details',
      'Request erf/address/title deed info',
      'Identify initial budget/timeline risk',
    ],
    fileFocus: ['Photos', 'Existing plans', 'Title deed', 'Client docs'],
  },

  scoping: {
    stage: 'scoping',
    label: 'Scoping / Briefing',
    description: 'Brief, feasibility, constraints and early project direction.',
    captureItems: [
      'Brief requirement',
      'Client preference',
      'Feasibility constraint',
      'Zoning/planning flag',
      'Existing condition',
      'Concept option',
      'Budget risk',
      'Approval needed',
    ],
    suggestedPrompts: [
      'List feasibility risks before we proceed.',
      'What brief decisions are unresolved?',
      'Draft a client brief summary for approval.',
    ],
    nextActions: [
      'Lock brief assumptions',
      'Check zoning constraints',
      'Prepare feasibility note',
    ],
    fileFocus: ['Brief', 'Precedents', 'Zoning notes', 'Site info'],
  },

  appointment: {
    stage: 'appointment',
    label: 'Appointment',
    description: 'Professional appointment, fee scope and team access.',
    captureItems: [
      'Fee item',
      'Appointment document',
      'Scope clarification',
      'Professional team invite',
      'Access/permission item',
      'Contract query',
    ],
    suggestedPrompts: [
      'What appointment items are incomplete?',
      'Summarise scope clarifications.',
      'Draft a team invitation note.',
    ],
    nextActions: [
      'Confirm appointment document',
      'Invite team members',
      'Clarify scope exclusions',
    ],
    fileFocus: ['Appointment docs', 'Fee proposal', 'Scope notes'],
  },

  coordination: {
    stage: 'coordination',
    label: 'Design Coordination',
    description: 'Design decisions, consultant queries and drawing coordination.',
    captureItems: [
      'Design decision',
      'Consultant query',
      'Drawing markup',
      'Coordination clash',
      'Client comment',
      'Option approval',
      'Information required',
    ],
    suggestedPrompts: [
      'What design decisions are still unresolved?',
      'Extract consultant questions needing replies.',
      'Summarise client comments by design area.',
    ],
    nextActions: [
      'Reply to engineer query',
      'Record client design approval',
      'Update drawing coordination list',
    ],
    fileFocus: ['Drawings', 'Markups', 'Consultant docs', 'Design approvals'],
  },

  compliance: {
    stage: 'compliance',
    label: 'Compliance / Municipal',
    description: 'SANS/NBR checks, municipal submission and council comments.',
    captureItems: [
      'SANS/NBR risk',
      'Municipal checklist item',
      'Council comment',
      'Missing signature',
      'Fire/access/energy item',
      'Resubmission item',
      'Approval status',
    ],
    suggestedPrompts: [
      'What municipal submission items are missing?',
      'List compliance risks mentioned in chat.',
      'Draft response to council comments.',
    ],
    nextActions: [
      'Request missing signatures',
      'Prepare resubmission items',
      'Review SANS/NBR risks',
    ],
    fileFocus: ['Council forms', 'Submission drawings', 'Energy docs', 'Fire notes'],
  },

  tender: {
    stage: 'tender',
    label: 'Tender / Procurement',
    description: 'Tender package, contractor questions, addenda and bid comparison.',
    captureItems: [
      'Tender clarification',
      'Contractor query',
      'Addendum',
      'Pricing exclusion',
      'Alternative product',
      'Contractor comparison',
      'Appointment decision',
    ],
    suggestedPrompts: [
      'Extract all contractor clarifications.',
      'Compare tender exclusions mentioned here.',
      'What addenda must be issued?',
    ],
    nextActions: [
      'Answer contractor query',
      'Issue tender addendum',
      'Flag pricing exclusion',
    ],
    fileFocus: ['Tender docs', 'BOQ', 'Quotes', 'Addenda'],
  },

  delivery: {
    stage: 'delivery',
    label: 'Construction / Site',
    description: 'Rich site-heavy capture and communication for the construction phase.',
    captureItems: [
      'Site photo',
      'Progress photo',
      'RFI',
      'Site instruction',
      'Variation',
      'Snag / defect',
      'Safety item',
      'Delivery / material',
      'Inspection note',
      'Site visit summary',
      'Time/cost impact',
    ],
    suggestedPrompts: [
      'What site issues could affect time or cost?',
      'Show open RFIs and site instructions.',
      'Summarise today’s site visit.',
      'Draft an instruction to the contractor.',
    ],
    nextActions: [
      'Close overdue RFI',
      'Review time/cost impact',
      'Issue site instruction',
      'Add progress photos to site log',
    ],
    fileFocus: ['Site photos', 'RFIs', 'Instructions', 'Inspections', 'Snag lists'],
  },

  payments: {
    stage: 'payments',
    label: 'Payments / Escrow',
    description: 'Invoices, escrow milestones, approvals and cost impacts.',
    captureItems: [
      'Invoice query',
      'Payment approval',
      'Escrow milestone',
      'Variation cost',
      'Retention item',
      'Final account query',
    ],
    suggestedPrompts: [
      'Which costs need approval?',
      'Summarise payment blockers.',
      'List variations with cost impact.',
    ],
    nextActions: [
      'Approve milestone release',
      'Check invoice against scope',
      'Confirm variation costing',
    ],
    fileFocus: ['Invoices', 'Payment certs', 'Variation costs', 'Final account'],
  },

  closeout: {
    stage: 'closeout',
    label: 'Closeout / Handover',
    description: 'Snag closeout, certificates, warranties and final handover records.',
    captureItems: [
      'Snag closeout',
      'Practical completion',
      'Certificate',
      'Warranty',
      'As-built drawing',
      'Occupation document',
      'Maintenance note',
      'Final handover item',
    ],
    suggestedPrompts: [
      'List documents still required for handover.',
      'What snags remain open?',
      'Draft closeout summary for the client.',
    ],
    nextActions: [
      'Collect warranties',
      'Close remaining snags',
      'Request as-built documents',
    ],
    fileFocus: ['Certificates', 'Warranties', 'As-builts', 'Handover docs'],
  },
};

/**
 * Lookup the UI config for a given project stage.
 * Falls back to the intake config for stages not yet fully mapped.
 */
export function getPhaseCommunicationUIConfig(stage: ProjectStage): PhaseCommunicationUIConfig {
  return PHASE_COMMUNICATION_UI_CONFIG[stage] ?? PHASE_COMMUNICATION_UI_CONFIG.intake;
}

export type { PhaseCommunicationUIConfig };
