import React, { useState } from 'react';
import { ArrowRight, Files, Grid3X3, ShieldCheck, Workflow } from 'lucide-react';
import type { UserProfile, UserRole } from '@/types';
import FileManager from './FileManager';
import StandaloneToolTilesPage from './tools/StandaloneToolTilesPage';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';

type ToolboxAction = {
  label: string;
  description: string;
  pageId: string;
};

type ToolboxGroup = {
  id: string;
  label: string;
  description: string;
  tools: ToolboxAction[];
};

type RoleToolboxConfig = {
  title: string;
  subtitle: string;
  scope: string;
  primaryResponsibilities: string[];
  handoffBoundaries: string[];
  toolGroups: ToolboxGroup[];
};

const TOOLBOX_CONFIG: Record<UserRole, RoleToolboxConfig> = {
  client: {
    title: 'Client Project Toolbox',
    subtitle: 'Brief, approval, payment, progress, and handover tools for the project owner.',
    scope: 'Client-facing decisions only. Professional sign-off, statutory submissions, and payment releases stay human-confirmed.',
    primaryResponsibilities: ['Create and clarify project brief', 'Review proposals and appointments', 'Approve milestones and payment evidence'],
    handoffBoundaries: ['Cannot certify professional compliance', 'Cannot submit statutory forms without accountable professional review'],
    toolGroups: [
      { id: 'brief-appointment', label: 'Brief and appointment', description: 'Tools for turning the client need into an appointment-ready project record.', tools: [
        { label: 'Guided Brief Wizard', description: 'Create or refine the client brief and project requirements.', pageId: 'client-intake' },
        { label: 'BEP Proposals', description: 'Compare professional proposals before appointment.', pageId: 'client-proposals' },
      ] },
      { id: 'approval-progress', label: 'Approvals and progress', description: 'Tools for controlled decisions, visible progress, and payment-governance evidence.', tools: [
        { label: 'Client Approval Centre', description: 'Review drawings, decisions, payment gates, and progress evidence.', pageId: 'tasks' },
        { label: 'Progress Reports', description: 'View project status, claims, risks, and next actions.', pageId: 'client-progress' },
      ] },
    ],
  },
  bep: {
    title: 'BEP / Professional Toolbox',
    subtitle: 'Technical brief, design coordination, compliance, municipal, freelancer, and delivery tools.',
    scope: 'BEP tools prepare and coordinate professional work; statutory sign-off remains explicit and auditable.',
    primaryResponsibilities: ['Convert client brief into technical scope', 'Coordinate design-team deliverables', 'Prepare compliance and municipal evidence'],
    handoffBoundaries: ['AI checks are advisory only', 'Municipal and compliance submissions require verified human sign-off'],
    toolGroups: [
      { id: 'brief-compliance', label: 'Technical brief and compliance', description: 'Professional scope, SANS checks, compliance evidence, and design-governance tools.', tools: [
        { label: 'Technical Brief Editor', description: 'Convert the client brief into professional scope and deliverables.', pageId: 'technical-brief' },
        { label: 'Design & Compliance', description: 'Coordinate SANS, design reviews, and professional compliance checks.', pageId: 'design' },
      ] },
      { id: 'document-delivery', label: 'Drawing delivery and resourcing', description: 'Document-control and outsourced package tools for design-team delivery.', tools: [
        { label: 'Drawing Register', description: 'Track drawing issues, revisions, and coordination status.', pageId: 'drawing-register' },
        { label: 'Freelancer Jobs', description: 'Build and monitor outsourced professional work packages.', pageId: 'bep-freelancers' },
      ] },
    ],
  },
  architect: {
    title: 'Architect / Design-Team Toolbox',
    subtitle: 'Architectural delivery tools aligned to the BEP professional workflow.',
    scope: 'Architect is treated as a BEP subtype for authorization while keeping familiar role labels in the UI.',
    primaryResponsibilities: ['Refine architectural scope and drawings', 'Coordinate design review evidence', 'Prepare statutory package inputs'],
    handoffBoundaries: ['No AI-generated compliance certification', 'No statutory release without accountable sign-off'],
    toolGroups: [
      { id: 'architectural-compliance', label: 'Architectural compliance', description: 'Scope, drawing review, and statutory-form preparation for architect-led delivery.', tools: [
        { label: 'Technical Brief Editor', description: 'Refine architectural scope, assumptions, and exclusions.', pageId: 'technical-brief' },
        { label: 'AI Drawing Checker', description: 'Run drawing review support before human professional sign-off.', pageId: 'drawing-checker' },
        { label: 'SANS / Compliance Forms', description: 'Prepare compliance forms and checklist evidence.', pageId: 'sans-forms' },
      ] },
      { id: 'delivery-resources', label: 'Delivery resources', description: 'Resource access for drawing production and coordinated design support.', tools: [
        { label: 'Remote Desktop / Resources', description: 'Access resource-sharing and delivery support tools.', pageId: 'resource-sharing' },
      ] },
    ],
  },
  contractor: {
    title: 'Main Contractor Toolbox',
    subtitle: 'Tender, procurement, programme, staff, claims, site instruction, and package controls.',
    scope: 'Contractor tools manage the whole construction delivery layer but do not bypass client/admin approvals.',
    primaryResponsibilities: ['Manage procurement and package scopes', 'Maintain programme, labour, plant, and site records', 'Prepare claims with evidence'],
    handoffBoundaries: ['Cannot release client funds directly', 'Cannot override professional design or statutory approval gates'],
    toolGroups: [
      { id: 'commercial-procurement', label: 'Commercial and procurement', description: 'Procurement, package scopes, supplier commitments, and governed commercial evidence.', tools: [
        { label: 'BoQ / BoM Procurement', description: 'Create procurement lists, compare quotes, and manage supplier commitments.', pageId: 'procurement' },
        { label: 'Subcontractor Packages', description: 'Create and monitor subcontractor/supplier package scopes.', pageId: 'packages' },
      ] },
      { id: 'site-delivery', label: 'Site delivery controls', description: 'Labour, plant, programme, and recovery controls for main-contractor delivery.', tools: [
        { label: 'Staff, Wages & Plant', description: 'Track labour, plant, and resource allocation.', pageId: 'contractor-staff' },
        { label: 'Programme / Gantt', description: 'Manage baseline, look-ahead, and recovery programme layers.', pageId: 'programme' },
      ] },
    ],
  },
  subcontractor: {
    title: 'Subcontractor Package Toolbox',
    subtitle: 'Assigned package scope, RFIs, shop drawings, samples, claims, snags, and close-out evidence.',
    scope: 'Subcontractor access is package-scoped. It cannot control whole-project procurement, supplier catalogues, or client approvals.',
    primaryResponsibilities: ['Deliver assigned package scope', 'Submit shop drawings, samples, RFIs, and claims', 'Upload close-out and warranty evidence'],
    handoffBoundaries: ['Cannot issue project-wide procurement commitments', 'Cannot approve own payment claim or completion status'],
    toolGroups: [
      { id: 'package-scope', label: 'Package scope and submissions', description: 'Subcontract-order scope, shop drawings, samples, and package coordination tools.', tools: [
        { label: 'Assigned Package Scope', description: 'Review subcontract order scope, deliverables, and readiness gates.', pageId: 'packages' },
        { label: 'Shop Drawings & Samples', description: 'Submit package drawings, samples, product data, and coordination evidence.', pageId: 'procurement' },
      ] },
      { id: 'site-claims-closeout', label: 'RFIs, claims, and close-out', description: 'Execution communications, payment-claim evidence, snagging, and close-out records.', tools: [
        { label: 'RFIs / Site Instructions', description: 'Raise package RFIs and respond to issued site instructions.', pageId: 'construction' },
        { label: 'Payment Claims & Close-Out Evidence', description: 'Prepare payment claim evidence, snags, warranties, and completion records.', pageId: 'snagging' },
      ] },
    ],
  },
  supplier: {
    title: 'Supplier Delivery Toolbox',
    subtitle: 'Supplier quote path, catalogue, product data, lead times, delivery notes, warranties, and payment evidence.',
    scope: 'Supplier access is delivery/procurement scoped. It is separate from subcontractor execution tools and cannot issue subcontract orders.',
    primaryResponsibilities: ['Maintain catalogue and lead-time evidence', 'Respond to quotes and purchase orders', 'Upload delivery notes, product data, and warranties'],
    handoffBoundaries: ['Cannot issue subcontractor execution records', 'Cannot mark deliveries accepted without contractor/client evidence'],
    toolGroups: [
      { id: 'catalogue-quotes', label: 'Catalogue and quotes', description: 'Supplier catalogue, alternatives, lead times, quotation, and purchase-order response tools.', tools: [
        { label: 'Supplier API Catalogue', description: 'Maintain catalogue, alternatives, availability, prices, and lead times.', pageId: 'procurement' },
        { label: 'Supplier Quote Path', description: 'Submit quotations, purchase-order responses, and delivery commitments.', pageId: 'packages' },
      ] },
      { id: 'delivery-payment', label: 'Delivery and payment evidence', description: 'Delivery notes, warranty evidence, product documents, and supplier payment status.', tools: [
        { label: 'Delivery Notes & Warranties', description: 'Upload delivery notes, manuals, warranty certificates, and product evidence.', pageId: 'snagging' },
        { label: 'Payment Tracker', description: 'Track supplier payment claim evidence and governed payment status.', pageId: 'payments' },
      ] },
    ],
  },
  freelancer: {
    title: 'Freelancer Work Toolbox',
    subtitle: 'Assigned tasks, submissions, feedback, drawing checks, resources, and invoice preparation.',
    scope: 'Freelancer tools are task-scoped and do not grant project-owner, contractor, or statutory authority.',
    primaryResponsibilities: ['Complete assigned deliverables', 'Submit revisions and feedback evidence', 'Use resource/checklist support for quality control'],
    handoffBoundaries: ['Cannot appoint project team members', 'Cannot certify statutory compliance or release invoices'],
    toolGroups: [
      { id: 'assigned-deliverables', label: 'Assigned deliverables', description: 'Task-scoped work, submissions, revision cycles, and feedback records.', tools: [
        { label: 'Assigned Work', description: 'View assigned work packages, brief files, and deliverable requirements.', pageId: 'freelancer-work' },
        { label: 'Submissions & Feedback', description: 'Submit work, receive feedback, and track review status.', pageId: 'freelancer-submissions' },
      ] },
      { id: 'quality-resources', label: 'Quality and resources', description: 'Drawing checks, checklist access, templates, and remote resource support.', tools: [
        { label: 'AI Drawing Checker', description: 'Check drawing deliverables before BEP review.', pageId: 'drawing-checker' },
        { label: 'Resource Centre', description: 'Use checklists, templates, and remote resource support.', pageId: 'resource-centre' },
      ] },
    ],
  },
  admin: {
    title: 'Admin Governance Toolbox',
    subtitle: 'Whole-system governance, audits, role tools, AI review, payment settings, disputes, and platform configuration.',
    scope: 'Admin tools govern the platform but still require auditable reasons for overrides and sensitive decisions.',
    primaryResponsibilities: ['Monitor verification, disputes, and audit queues', 'Review AI and sensitive workflow exceptions', 'Configure platform governance settings'],
    handoffBoundaries: ['Cannot silently override user-facing decisions', 'Cannot execute payments or statutory actions without recorded authorization'],
    toolGroups: [
      { id: 'platform-governance', label: 'Platform governance', description: 'System-wide user, project, verification, dispute, and governance-queue oversight.', tools: [
        { label: 'Admin Console', description: 'Review users, projects, verification, disputes, tools, rates, and governance queues.', pageId: 'admin-console' },
        { label: 'Audit Trail Viewer', description: 'Inspect governed workflow records and sensitive action history.', pageId: 'disputes' },
      ] },
      { id: 'ai-payment-controls', label: 'AI and payment controls', description: 'Review queues and financial settings that remain explicitly human-governed.', tools: [
        { label: 'AI Review Queue', description: 'Review AI-generated outputs before release or downstream action.', pageId: 'ai' },
        { label: 'Payment Rate Settings', description: 'Review payment rails, fee settings, claims, and escrow governance.', pageId: 'payments' },
      ] },
    ],
  },
  engineer: {
    title: 'Engineer Toolbox',
    subtitle: 'Structural, civil, and engineering design tools with compliance and document management.',
    scope: 'Engineering design and compliance tools. Sign-off remains with the registered professional.',
    primaryResponsibilities: ['Design structural/civil elements', 'Prepare compliance evidence', 'Coordinate with design team'],
    handoffBoundaries: ['Cannot issue architectural compliance', 'AI checks are advisory only'],
    toolGroups: [
      { id: 'engineering-design', label: 'Engineering design and compliance', description: 'Structural/civil calculations, compliance checks, and statutory form preparation.', tools: [
        { label: 'Fee Calculator', description: 'Calculate professional fees per ECSA guidelines.', pageId: 'design' },
        { label: 'AI Drawing Checker', description: 'Run drawing review support before professional sign-off.', pageId: 'drawing-checker' },
        { label: 'SANS / Compliance Forms', description: 'Prepare compliance forms and checklist evidence.', pageId: 'sans-forms' },
      ] },
      { id: 'engineering-documents', label: 'Document control and coordination', description: 'Drawing register, technical briefs, and design-team resource access.', tools: [
        { label: 'Drawing Register', description: 'Track drawing issues, revisions, and coordination status.', pageId: 'drawing-register' },
        { label: 'Technical Brief Editor', description: 'Refine engineering scope, assumptions, and deliverables.', pageId: 'technical-brief' },
        { label: 'Remote Desktop / Resources', description: 'Access resource-sharing and delivery support tools.', pageId: 'resource-sharing' },
      ] },
    ],
  },
  quantity_surveyor: {
    title: 'QS Toolbox',
    subtitle: 'Cost planning, bills of quantities, valuations, and commercial governance tools.',
    scope: 'Commercial management tools for cost control from feasibility through final account.',
    primaryResponsibilities: ['Prepare cost plans and bills of quantities', 'Conduct valuations and payment certifications', 'Manage variations and final accounts'],
    handoffBoundaries: ['Cannot certify professional design compliance', 'Valuations require contractor/client evidence'],
    toolGroups: [
      { id: 'qs-cost-planning', label: 'Cost planning and BoQ', description: 'Quantity takeoff, fee estimates, and procurement package tools.', tools: [
        { label: 'BoQ / BoM Takeoff Tool', description: 'Create bills of quantities and materials takeoffs.', pageId: 'procurement' },
        { label: 'Professional Fee Calculator', description: 'Calculate QS fees per SACQSP guidelines.', pageId: 'design' },
        { label: 'Subcontractor Packages', description: 'Create and monitor package scopes and cost control.', pageId: 'packages' },
      ] },
      { id: 'qs-valuations', label: 'Valuations and payments', description: 'Payment valuations, certifications, and professional development.', tools: [
        { label: 'Payment Status Dashboard', description: 'Track payment claims, certificates, and escrow releases.', pageId: 'payments' },
        { label: 'CPD Assessment', description: 'Complete professional development assessments for SACQSP.', pageId: 'cpd-assessment' },
      ] },
    ],
  },
  town_planner: {
    title: 'Planner Toolbox',
    subtitle: 'Zoning, land use, and statutory planning tools for municipal submissions.',
    scope: 'Town planning approval tools. Statutory submissions require registered professional sign-off.',
    primaryResponsibilities: ['Prepare zoning and land-use applications', 'Coordinate municipal submissions', 'Manage public participation processes'],
    handoffBoundaries: ['Cannot certify building compliance', 'Land-use decisions require council approval'],
    toolGroups: [
      { id: 'planning-applications', label: 'Planning applications', description: 'Zoning, compliance forms, and municipal submission tools.', tools: [
        { label: 'SANS / Compliance Forms', description: 'Prepare compliance forms and planning checklist evidence.', pageId: 'sans-forms' },
        { label: 'Design & Compliance', description: 'Coordinate planning applications and professional compliance.', pageId: 'design' },
        { label: 'Technical Brief Editor', description: 'Refine planning scope, assumptions, and deliverables.', pageId: 'technical-brief' },
      ] },
      { id: 'planning-resources', label: 'Professional resources', description: 'Resource sharing and CPD for planning professionals.', tools: [
        { label: 'Remote Desktop / Resources', description: 'Access resource-sharing and delivery support tools.', pageId: 'resource-sharing' },
        { label: 'CPD Assessment', description: 'Complete professional development assessments for SACPLAN.', pageId: 'cpd-assessment' },
      ] },
    ],
  },
  energy_professional: {
    title: 'Energy Toolbox',
    subtitle: 'SANS 10400-XA energy compliance, modelling, and sustainability assessment tools.',
    scope: 'Energy compliance and sustainability design tools. Professional sign-off required for statutory submissions.',
    primaryResponsibilities: ['Energy modelling and SANS 10400-XA compliance', 'Prepare energy compliance certificates', 'Coordinate sustainability strategy'],
    handoffBoundaries: ['Cannot issue structural or fire sign-off', 'AI compliance checks are advisory only'],
    toolGroups: [
      { id: 'energy-compliance', label: 'Energy compliance', description: 'XA compliance checks, energy modelling, and statutory forms.', tools: [
        { label: 'SANS / Compliance Forms', description: 'Prepare XA compliance forms and energy checklist evidence.', pageId: 'sans-forms' },
        { label: 'Design & Compliance', description: 'Coordinate energy compliance and sustainability reviews.', pageId: 'design' },
        { label: 'AI Drawing Checker', description: 'Run drawing review for energy compliance requirements.', pageId: 'drawing-checker' },
      ] },
      { id: 'energy-professional-dev', label: 'Professional development', description: 'Technical briefs and CPD for energy professionals.', tools: [
        { label: 'Technical Brief Editor', description: 'Refine energy scope, assumptions, and compliance strategy.', pageId: 'technical-brief' },
        { label: 'CPD Assessment', description: 'Complete professional development assessments.', pageId: 'cpd-assessment' },
      ] },
    ],
  },
  fire_engineer: {
    title: 'Fire Engineer Toolbox',
    subtitle: 'Fire safety design, SANS 10400-T compliance, and rational fire engineering tools.',
    scope: 'Fire safety engineering tools. Rational designs require registered fire engineer sign-off.',
    primaryResponsibilities: ['Design fire safety systems', 'Prepare rational fire designs', 'Coordinate SANS 10400-T compliance'],
    handoffBoundaries: ['Cannot certify structural stability', 'Fire compliance requires professional sign-off'],
    toolGroups: [
      { id: 'fire-compliance', label: 'Fire compliance', description: 'Fire safety design review, compliance checks, and drawing review.', tools: [
        { label: 'Design & Compliance', description: 'Coordinate fire safety design and professional compliance.', pageId: 'design' },
        { label: 'AI Drawing Checker', description: 'Run drawing review for fire compliance requirements.', pageId: 'drawing-checker' },
        { label: 'SANS / Compliance Forms', description: 'Prepare SANS 10400-T compliance forms and evidence.', pageId: 'sans-forms' },
      ] },
      { id: 'fire-coordination', label: 'Design coordination', description: 'Technical briefs, resource access, and CPD for fire engineers.', tools: [
        { label: 'Technical Brief Editor', description: 'Refine fire engineering scope, assumptions, and deliverables.', pageId: 'technical-brief' },
        { label: 'Remote Desktop / Resources', description: 'Access resource-sharing and coordination tools.', pageId: 'resource-sharing' },
        { label: 'CPD Assessment', description: 'Complete professional development assessments.', pageId: 'cpd-assessment' },
      ] },
    ],
  },
  site_manager: {
    title: 'Site Manager Toolbox',
    subtitle: 'Site operations, H&S, programme delivery, and daily site management tools.',
    scope: 'Construction site management tools for daily operations, resource tracking, and quality control.',
    primaryResponsibilities: ['Manage site programme and daily operations', 'Track labour, plant, and material resources', 'Monitor H&S and quality compliance'],
    handoffBoundaries: ['Cannot issue design changes', 'Cannot approve payment releases without contractor sign-off'],
    toolGroups: [
      { id: 'site-operations', label: 'Site operations and resources', description: 'Staff, plant, programme, and daily site execution tools.', tools: [
        { label: 'Staff, Wages & Plant', description: 'Track labour, plant, and resource allocation.', pageId: 'contractor-staff' },
        { label: 'Programme / Gantt', description: 'Manage baseline, look-ahead, and recovery programme.', pageId: 'programme' },
        { label: 'Site Delivery', description: 'Daily site logs, inspections, and activity tracking.', pageId: 'construction' },
      ] },
      { id: 'site-quality', label: 'Quality and delivery control', description: 'Snagging, procurement oversight, and package coordination.', tools: [
        { label: 'Snag List / Defects', description: 'Track snag items, inspections, and close-out evidence.', pageId: 'snagging' },
        { label: 'BoQ / BoM Procurement', description: 'Create procurement lists and manage material orders.', pageId: 'procurement' },
        { label: 'Subcontractor Packages', description: 'Monitor subcontractor package scope and delivery.', pageId: 'packages' },
      ] },
    ],
  },
  developer: {
    title: 'Developer Toolbox',
    subtitle: 'Portfolio oversight, project governance, and investment decision tools.',
    scope: 'Development governance and portfolio oversight. Project-level decisions remain with appointed professionals.',
    primaryResponsibilities: ['Monitor portfolio health and programme strategy', 'Review project feasibility and budgets', 'Approve stage gates and milestones'],
    handoffBoundaries: ['Cannot certify compliance or issue professional sign-offs', 'Payment releases require verified evidence'],
    toolGroups: [
      { id: 'developer-portfolio', label: 'Portfolio and project oversight', description: 'Brief creation, proposal review, and progress monitoring tools.', tools: [
        { label: 'Guided Brief Wizard', description: 'Create or refine project briefs and requirements.', pageId: 'client-intake' },
        { label: 'BEP Proposals', description: 'Compare professional proposals before appointment.', pageId: 'client-proposals' },
        { label: 'Progress Reports', description: 'View project status, risks, and next actions.', pageId: 'client-progress' },
      ] },
      { id: 'developer-financial', label: 'Financial controls', description: 'Payment monitoring, procurement oversight, and reference resources.', tools: [
        { label: 'Payment Status Dashboard', description: 'Track payment claims, certificates, and escrow status.', pageId: 'payments' },
        { label: 'BoQ / BoM Procurement', description: 'Review procurement packages and cost commitments.', pageId: 'procurement' },
        { label: 'Resource Centre', description: 'Access checklists, templates, and reference resources.', pageId: 'resource-centre' },
      ] },
    ],
  },
  firm_admin: {
    title: 'Firm Admin Toolbox',
    subtitle: 'Practice operations, staff management, CPD tracking, and firm governance tools.',
    scope: 'Firm administration tools for practice management, staff coordination, and compliance tracking.',
    primaryResponsibilities: ['Manage firm staff and resource allocation', 'Track CPD compliance and professional registrations', 'Oversee practice governance'],
    handoffBoundaries: ['Cannot sign professional outputs', 'Cannot override project-level roles'],
    toolGroups: [
      { id: 'firm-practice', label: 'Practice management', description: 'Staff coordination, resource allocation, and firm governance.', tools: [
        { label: 'Admin Console', description: 'Review staff, projects, registrations, and firm settings.', pageId: 'admin-console' },
        { label: 'Remote Desktop / Resources', description: 'Access shared resources and delivery support tools.', pageId: 'resource-sharing' },
        { label: 'Staff, Wages & Plant', description: 'Track staff allocation and resource utilisation.', pageId: 'contractor-staff' },
      ] },
      { id: 'firm-compliance', label: 'Compliance and development', description: 'CPD tracking, document control, and reference resources.', tools: [
        { label: 'CPD Assessment', description: 'Track firm-wide CPD compliance and professional development.', pageId: 'cpd-assessment' },
        { label: 'Resource Centre', description: 'Access checklists, templates, and practice resources.', pageId: 'resource-centre' },
        { label: 'Drawing Register', description: 'Track document issues, revisions, and firm-wide drawing control.', pageId: 'drawing-register' },
      ] },
    ],
  },
  platform_admin: {
    title: 'Platform Admin Toolbox',
    subtitle: 'System configuration, governance, audit oversight, and platform-wide settings.',
    scope: 'Platform governance and configuration tools across the entire Architex ecosystem.',
    primaryResponsibilities: ['Configure platform-wide settings', 'Monitor audit trails and system health', 'Review AI and governance queues'],
    handoffBoundaries: ['Cannot override professional sign-off', 'Configuration changes require audit trail'],
    toolGroups: [
      { id: 'platform-governance', label: 'Platform governance', description: 'System-wide oversight, audit trails, and AI review queues.', tools: [
        { label: 'Admin Console', description: 'Review users, projects, verification, disputes, and platform settings.', pageId: 'admin-console' },
        { label: 'Audit Trail Viewer', description: 'Inspect governed workflow records and sensitive action history.', pageId: 'disputes' },
        { label: 'AI Review Queue', description: 'Review AI-generated outputs before release or downstream action.', pageId: 'ai' },
      ] },
      { id: 'platform-config', label: 'System configuration', description: 'Payment settings, resource centre, and platform-wide config.', tools: [
        { label: 'Payment Rate Settings', description: 'Review payment rails, fee settings, and escrow governance.', pageId: 'payments' },
        { label: 'Resource Centre', description: 'Access platform-wide checklists, templates, and reference resources.', pageId: 'resource-centre' },
        { label: 'CPD Assessment', description: 'Monitor platform-wide professional development compliance.', pageId: 'cpd-assessment' },
      ] },
    ],
  },
  land_surveyor: {
    title: 'Land Surveyor Toolbox',
    subtitle: 'Boundary surveys, SG diagrams, servitudes, and site verification tools.',
    scope: 'Land surveyor tools for geomatics, boundary verification, and statutory cadastral records.',
    primaryResponsibilities: ['Verify site boundaries and SG diagrams', 'Produce survey plans and servitude documentation', 'Support subdivision and consolidation workflows'],
    handoffBoundaries: ['Survey sign-off requires PLATO registration', 'Cadastral submissions require professional verification'],
    toolGroups: [
      { id: 'survey-tools', label: 'Survey and cadastral', description: 'Site boundary verification, SG diagram management, and cadastral evidence.', tools: [
        { label: 'Drawing Register', description: 'Track survey drawings, revisions, and coordination status.', pageId: 'drawing-register' },
        { label: 'Design & Compliance', description: 'Review survey-related compliance and municipal readiness.', pageId: 'design' },
      ] },
    ],
  },
  cpm: {
    title: 'Construction Project Manager Toolbox',
    subtitle: 'Programme delivery, risk management, and construction oversight tools.',
    scope: 'CPM tools for coordinating programme, cost, and delivery across the project lifecycle.',
    primaryResponsibilities: ['Coordinate programme delivery and milestones', 'Manage project risk and resource allocation', 'Oversee construction governance and reporting'],
    handoffBoundaries: ['Cannot certify professional compliance', 'Payment releases require client confirmation'],
    toolGroups: [
      { id: 'programme-delivery', label: 'Programme and delivery', description: 'Schedule management, milestone tracking, and construction coordination.', tools: [
        { label: 'Programme / Gantt', description: 'Manage project schedule and milestone dependencies.', pageId: 'programme' },
        { label: 'Tasks & Approvals', description: 'Track tasks, approvals, and coordination actions.', pageId: 'tasks' },
        { label: 'Contract Administration', description: 'Manage notices, variations, claims, and payment schedules.', pageId: 'contract-admin' },
      ] },
    ],
  },
  health_safety: {
    title: 'H&S Officer Toolbox',
    subtitle: 'Health and safety file management, incident reporting, permits, and compliance tools.',
    scope: 'H&S tools for safety compliance, incident tracking, and permit management on construction projects.',
    primaryResponsibilities: ['Manage health and safety files', 'Track incidents and near-misses', 'Issue and monitor safety permits'],
    handoffBoundaries: ['Cannot certify professional design compliance', 'Cannot override project-level financial controls'],
    toolGroups: [
      { id: 'safety-compliance', label: 'Safety compliance', description: 'Health and safety file management, incident reporting, and permit controls.', tools: [
        { label: 'H&S File Manager', description: 'Manage health and safety files and compliance evidence.', pageId: 'construction' },
        { label: 'Incident Reports', description: 'Record and track safety incidents and near-misses.', pageId: 'construction' },
      ] },
    ],
  },
};

export default function ProjectToolboxPage({ user, onNavigate }: { user: UserProfile; onNavigate?: (pageId: string) => void }) {
  const config = TOOLBOX_CONFIG[user.role] ?? TOOLBOX_CONFIG.client;
  const [mode, setMode] = useState<'workflow' | 'tiles'>('workflow');

  return (
    <div className="space-y-6" data-testid="project-toolbox-page">
      {/* Mode toggle */}
      <div className="flex items-center justify-end">
        <Tabs value={mode} onValueChange={(v) => setMode(v as 'workflow' | 'tiles')}>
          <TabsList className="rounded-full">
            <TabsTrigger value="workflow" className="rounded-full gap-1.5">
              <Workflow className="h-4 w-4" /> AI-guided
            </TabsTrigger>
            <TabsTrigger value="tiles" className="rounded-full gap-1.5">
              <Grid3X3 className="h-4 w-4" /> All tools
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {mode === 'tiles' ? (
        <StandaloneToolTilesPage
          user={user}
          onNavigate={onNavigate ?? (() => {})}
          mode={mode}
          onModeChange={setMode}
        />
      ) : (
        <>
      <Card className="rounded-[2rem] overflow-hidden glass-panel">
        <CardHeader className="glass-header">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">{config.title}</Badge>
              <CardTitle className="font-heading text-3xl mt-3 flex items-center gap-3"><Files className="h-7 w-7 text-primary" /> {config.subtitle}</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">
                {config.scope}
              </CardDescription>
            </div>
            <Badge className="capitalize w-fit">{user.role}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-5">
          <div className="space-y-5" data-testid={`toolbox-actions-${user.role}`}>
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid={`toolbox-responsibilities-${user.role}`}>
              <div className="rounded-2xl p-4 glass-card">
                <h3 className="font-heading text-lg font-black tracking-[-0.03em] text-foreground">Role responsibilities</h3>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {config.primaryResponsibilities.map((responsibility) => <li key={responsibility}>• {responsibility}</li>)}
                </ul>
              </div>
              <div className="rounded-2xl p-4 glass-card border-amber-200 bg-amber-50/70">
                <h3 className="font-heading text-lg font-black tracking-[-0.03em] text-foreground">Handoff boundaries</h3>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {config.handoffBoundaries.map((boundary) => <li key={boundary}>• {boundary}</li>)}
                </ul>
              </div>
            </section>
            {config.toolGroups.map((group) => (
              <section key={group.id} className="rounded-2xl p-4 glass-section" data-testid={`toolbox-group-${user.role}-${group.id}`}>
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-heading text-lg font-black tracking-[-0.03em] text-foreground">{group.label}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>
                  </div>
                  <Badge variant="outline" className="w-fit rounded-full">{group.tools.length} tools</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {group.tools.map((tool) => (
                    <div key={tool.label} className="rounded-2xl p-4 glass-tile">
                      <h4 className="font-bold text-foreground">{tool.label}</h4>
                      <p className="mt-2 text-sm text-muted-foreground min-h-[3.5rem]">{tool.description}</p>
                      <Button type="button" variant="outline" size="sm" className="mt-4 rounded-full" onClick={() => onNavigate?.(tool.pageId)}>
                        Open workflow <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <div className="rounded-2xl p-4 glass-record border-primary/20 text-sm text-muted-foreground flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <p>Unsafe approvals, signatures, payment releases, and statutory submissions are not performed from the toolbox. This page provides traceable files and evidence for the dedicated human-confirmed workflows.</p>
          </div>

        </CardContent>
      </Card>
      <FileManager user={user} />
        </>
      )}
    </div>
  );
}
