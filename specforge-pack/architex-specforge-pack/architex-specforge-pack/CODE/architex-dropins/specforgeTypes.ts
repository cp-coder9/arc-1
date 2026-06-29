export type SpecForgeRole = 'client' | 'developer' | 'architect' | 'bep' | 'freelancer' | 'engineer' | 'quantity_surveyor' | 'energy_professional' | 'fire_engineer' | 'contractor' | 'subcontractor' | 'supplier' | 'site_manager' | 'admin' | 'platform_admin';
export type SpecItemStatus = 'draft' | 'needs_decision' | 'approved' | 'issued' | 'rfq' | 'ordered' | 'delivered' | 'installed' | 'as_built' | 'superseded';

export interface SpecForgeWorkspace {
  id: string;
  projectId: string;
  projectName: string;
  municipality?: string;
  stage: string;
  profile: string;
  revision: string;
  issueStatus: 'draft' | 'issued' | 'superseded';
  sections: SpecSection[];
  items: SpecItem[];
}

export interface SpecSection {
  id: string;
  code: string;
  title: string;
  discipline: string;
  ownerRole: SpecForgeRole;
  reviewerRole?: SpecForgeRole;
  status: 'draft' | 'needs_review' | 'approved' | 'issued';
}

export interface SpecItem {
  id: string;
  sectionId: string;
  code: string;
  title: string;
  room: string;
  package: string;
  image?: string;
  supplier?: string;
  model?: string;
  finish?: string;
  dimensions?: string;
  drawingRefs: string[];
  clauseRefs: string[];
  budgetAllowance: number;
  estimatedCost: number;
  leadTimeDays: number;
  clientDecision: boolean;
  ownerRole: SpecForgeRole;
  reviewerRole?: SpecForgeRole;
  approverRole?: SpecForgeRole;
  status: SpecItemStatus;
  sourceRevision: string;
  supersededBy?: string | null;
}
