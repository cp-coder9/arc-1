import { ProductModuleDefinition } from '@/types/architexMasterTypes';

export const productModuleRegistry: ProductModuleDefinition[] = [
  {
    key: 'project_lifecycle',
    label: 'Project Lifecycle Engine',
    purpose: 'Central phase/status map for all project actions.',
    primaryRoles: ['client', 'developer', 'architect', 'contractor', 'platform_admin'],
    phases: ['lead_enquiry', 'brief_feasibility', 'proposal_appointment', 'design_coordination', 'municipal_submission', 'tender_procurement', 'construction_execution', 'payments_commercial_control', 'closeout', 'defects_liability', 'operations_post_occupancy'],
    produces: ['risk_alert'],
  },
  {
    key: 'documents',
    label: 'Documents and Drawing Intelligence',
    purpose: 'Document control, drawing revisions, transmittals and AI extraction.',
    primaryRoles: ['architect', 'engineer', 'town_planner', 'contractor', 'platform_admin'],
    phases: ['design_coordination', 'municipal_submission', 'tender_procurement', 'construction_execution', 'closeout'],
    produces: ['document', 'drawing_revision', 'municipal_submission_item'],
  },
  {
    key: 'knowledge',
    label: 'Knowledge Hub',
    purpose: 'Source-linked South African built-environment knowledge for users and agents.',
    primaryRoles: ['architect', 'engineer', 'quantity_surveyor', 'town_planner', 'platform_admin'],
    phases: ['brief_feasibility', 'design_coordination', 'municipal_submission', 'construction_execution'],
    produces: ['knowledge_source'],
  },
  {
    key: 'marketplace',
    label: 'Marketplace and Resource Sharing',
    purpose: 'Trusted listings, bookings, candidate-professional supervision and supplier access.',
    primaryRoles: ['developer', 'architect', 'contractor', 'supplier', 'candidate_professional', 'platform_admin'],
    phases: ['proposal_appointment', 'design_coordination', 'tender_procurement', 'construction_execution'],
    produces: ['marketplace_listing', 'resource_booking', 'verification_record'],
  },
  {
    key: 'finance',
    label: 'Finance, Escrow and Commercial Control',
    purpose: 'Milestone payments, payment certificates, retention, escrow and platform fee ledger.',
    primaryRoles: ['client', 'developer', 'quantity_surveyor', 'contractor', 'platform_admin'],
    phases: ['proposal_appointment', 'payments_commercial_control', 'construction_execution', 'closeout'],
    produces: ['escrow_milestone', 'payment_certificate'],
  },
  {
    key: 'procurement',
    label: 'Tender and Procurement Engine',
    purpose: 'Tender packages, RFQs, quote comparisons, purchase orders and invoice matching.',
    primaryRoles: ['quantity_surveyor', 'contractor', 'supplier', 'developer'],
    phases: ['tender_procurement', 'construction_execution'],
    produces: ['rfq', 'quote_comparison', 'purchase_order'],
  },
  {
    key: 'site_execution',
    label: 'Site Execution and Field Tools',
    purpose: 'Site diary, snags, delays, labour, plant, inspections and field evidence.',
    primaryRoles: ['contractor', 'site_manager', 'architect', 'engineer'],
    phases: ['construction_execution', 'payments_commercial_control', 'closeout'],
    produces: ['site_diary', 'snag', 'delay_event'],
  },
];

export function modulesForPhase(phase: string): ProductModuleDefinition[] {
  return productModuleRegistry.filter((module) => module.phases.includes(phase as never));
}
