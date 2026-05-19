import React from 'react';
import { ArrowRight, Files, ShieldCheck } from 'lucide-react';
import type { UserProfile, UserRole } from '@/types';
import FileManager from './FileManager';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

type ToolboxAction = {
  label: string;
  description: string;
  pageId: string;
};

type RoleToolboxConfig = {
  title: string;
  subtitle: string;
  scope: string;
  tools: ToolboxAction[];
};

const TOOLBOX_CONFIG: Record<UserRole, RoleToolboxConfig> = {
  client: {
    title: 'Client Project Toolbox',
    subtitle: 'Brief, approval, payment, progress, and handover tools for the project owner.',
    scope: 'Client-facing decisions only. Professional sign-off, statutory submissions, and payment releases stay human-confirmed.',
    tools: [
      { label: 'Guided Brief Wizard', description: 'Create or refine the client brief and project requirements.', pageId: 'client-intake' },
      { label: 'BEP Proposals', description: 'Compare professional proposals before appointment.', pageId: 'client-proposals' },
      { label: 'Client Approval Centre', description: 'Review drawings, decisions, payment gates, and progress evidence.', pageId: 'tasks' },
      { label: 'Progress Reports', description: 'View project status, claims, risks, and next actions.', pageId: 'client-progress' },
    ],
  },
  bep: {
    title: 'BEP / Professional Toolbox',
    subtitle: 'Technical brief, design coordination, compliance, municipal, freelancer, and delivery tools.',
    scope: 'BEP tools prepare and coordinate professional work; statutory sign-off remains explicit and auditable.',
    tools: [
      { label: 'Technical Brief Editor', description: 'Convert the client brief into professional scope and deliverables.', pageId: 'technical-brief' },
      { label: 'Design & Compliance', description: 'Coordinate SANS, design reviews, and professional compliance checks.', pageId: 'design' },
      { label: 'Drawing Register', description: 'Track drawing issues, revisions, and coordination status.', pageId: 'drawing-register' },
      { label: 'Freelancer Jobs', description: 'Build and monitor outsourced professional work packages.', pageId: 'bep-freelancers' },
    ],
  },
  architect: {
    title: 'Architect / Design-Team Toolbox',
    subtitle: 'Architectural delivery tools aligned to the BEP professional workflow.',
    scope: 'Architect is treated as a BEP subtype for authorization while keeping familiar role labels in the UI.',
    tools: [
      { label: 'Technical Brief Editor', description: 'Refine architectural scope, assumptions, and exclusions.', pageId: 'technical-brief' },
      { label: 'AI Drawing Checker', description: 'Run drawing review support before human professional sign-off.', pageId: 'drawing-checker' },
      { label: 'SANS / Compliance Forms', description: 'Prepare compliance forms and checklist evidence.', pageId: 'sans-forms' },
      { label: 'Remote Desktop / Resources', description: 'Access resource-sharing and delivery support tools.', pageId: 'resource-sharing' },
    ],
  },
  contractor: {
    title: 'Main Contractor Toolbox',
    subtitle: 'Tender, procurement, programme, staff, claims, site instruction, and package controls.',
    scope: 'Contractor tools manage the whole construction delivery layer but do not bypass client/admin approvals.',
    tools: [
      { label: 'BoQ / BoM Procurement', description: 'Create procurement lists, compare quotes, and manage supplier commitments.', pageId: 'procurement' },
      { label: 'Subcontractor Packages', description: 'Create and monitor subcontractor/supplier package scopes.', pageId: 'packages' },
      { label: 'Staff, Wages & Plant', description: 'Track labour, plant, and resource allocation.', pageId: 'contractor-staff' },
      { label: 'Programme / Gantt', description: 'Manage baseline, look-ahead, and recovery programme layers.', pageId: 'programme' },
    ],
  },
  subcontractor: {
    title: 'Subcontractor Package Toolbox',
    subtitle: 'Assigned package scope, RFIs, shop drawings, samples, claims, snags, and close-out evidence.',
    scope: 'Subcontractor access is package-scoped. It cannot control whole-project procurement, supplier catalogues, or client approvals.',
    tools: [
      { label: 'Assigned Package Scope', description: 'Review subcontract order scope, deliverables, and readiness gates.', pageId: 'packages' },
      { label: 'Shop Drawings & Samples', description: 'Submit package drawings, samples, product data, and coordination evidence.', pageId: 'procurement' },
      { label: 'RFIs / Site Instructions', description: 'Raise package RFIs and respond to issued site instructions.', pageId: 'construction' },
      { label: 'Payment Claims & Close-Out Evidence', description: 'Prepare payment claim evidence, snags, warranties, and completion records.', pageId: 'snagging' },
    ],
  },
  supplier: {
    title: 'Supplier Delivery Toolbox',
    subtitle: 'Supplier quote path, catalogue, product data, lead times, delivery notes, warranties, and payment evidence.',
    scope: 'Supplier access is delivery/procurement scoped. It is separate from subcontractor execution tools and cannot issue subcontract orders.',
    tools: [
      { label: 'Supplier API Catalogue', description: 'Maintain catalogue, alternatives, availability, prices, and lead times.', pageId: 'procurement' },
      { label: 'Supplier Quote Path', description: 'Submit quotations, purchase-order responses, and delivery commitments.', pageId: 'packages' },
      { label: 'Delivery Notes & Warranties', description: 'Upload delivery notes, manuals, warranty certificates, and product evidence.', pageId: 'snagging' },
      { label: 'Payment Tracker', description: 'Track supplier payment claim evidence and governed payment status.', pageId: 'payments' },
    ],
  },
  freelancer: {
    title: 'Freelancer Work Toolbox',
    subtitle: 'Assigned tasks, submissions, feedback, drawing checks, resources, and invoice preparation.',
    scope: 'Freelancer tools are task-scoped and do not grant project-owner, contractor, or statutory authority.',
    tools: [
      { label: 'Assigned Work', description: 'View assigned work packages, brief files, and deliverable requirements.', pageId: 'freelancer-work' },
      { label: 'Submissions & Feedback', description: 'Submit work, receive feedback, and track review status.', pageId: 'freelancer-submissions' },
      { label: 'AI Drawing Checker', description: 'Check drawing deliverables before BEP review.', pageId: 'drawing-checker' },
      { label: 'Resource Centre', description: 'Use checklists, templates, and remote resource support.', pageId: 'resource-centre' },
    ],
  },
  admin: {
    title: 'Admin Governance Toolbox',
    subtitle: 'Whole-system governance, audits, role tools, AI review, payment settings, disputes, and platform configuration.',
    scope: 'Admin tools govern the platform but still require auditable reasons for overrides and sensitive decisions.',
    tools: [
      { label: 'Admin Console', description: 'Review users, projects, verification, disputes, tools, rates, and governance queues.', pageId: 'admin-console' },
      { label: 'AI Review Queue', description: 'Review AI-generated outputs before release or downstream action.', pageId: 'ai' },
      { label: 'Audit Trail Viewer', description: 'Inspect governed workflow records and sensitive action history.', pageId: 'disputes' },
      { label: 'Payment Rate Settings', description: 'Review payment rails, fee settings, claims, and escrow governance.', pageId: 'payments' },
    ],
  },
};

export default function ProjectToolboxPage({ user, onNavigate }: { user: UserProfile; onNavigate?: (pageId: string) => void }) {
  const config = TOOLBOX_CONFIG[user.role] ?? TOOLBOX_CONFIG.client;

  return (
    <div className="space-y-6" data-testid="project-toolbox-page">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4" data-testid={`toolbox-actions-${user.role}`}>
            {config.tools.map((tool) => (
              <div key={tool.label} className="rounded-2xl border border-border bg-background/80 p-4 shadow-sm">
                <h3 className="font-bold text-foreground">{tool.label}</h3>
                <p className="mt-2 text-sm text-muted-foreground min-h-[3.5rem]">{tool.description}</p>
                <Button type="button" variant="outline" size="sm" className="mt-4 rounded-full" onClick={() => onNavigate?.(tool.pageId)}>
                  Open workflow <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <p>Unsafe approvals, signatures, payment releases, and statutory submissions are not performed from the toolbox. This page provides traceable files and evidence for the dedicated human-confirmed workflows.</p>
          </div>
        </CardContent>
      </Card>
      <FileManager user={user} />
    </div>
  );
}
