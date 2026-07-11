import type { UserProfile } from '../types';

export type MunicipalSubmissionStatus =
  | 'preparing'
  | 'submitted'
  | 'in_review'
  | 'queries_raised'
  | 'resubmitted'
  | 'approved'
  | 'rejected'
  | 'withdrawn';

export type MunicipalTrackerRole = UserProfile['role'];
export type MunicipalLinkType = 'receipt' | 'comment' | 'evidence' | 'approval_record';
export type MunicipalVisibilityLevel = 'public_project' | 'project_team' | 'bep_admin' | 'admin_only';

export interface MunicipalAuditMetadata {
  actorId: string;
  actorRole: MunicipalTrackerRole;
  actorName?: string;
  createdAt: string;
  source: 'manual' | 'municipal_portal' | 'api' | 'system';
  immutable: true;
}

export interface MunicipalTrackerLink {
  id: string;
  type: MunicipalLinkType;
  title: string;
  url: string;
  note?: string;
  visibility: MunicipalVisibilityLevel;
  audit: MunicipalAuditMetadata;
}

export interface MunicipalStatusHistoryEntry {
  id: string;
  fromStatus?: MunicipalSubmissionStatus;
  toStatus: MunicipalSubmissionStatus;
  note?: string;
  municipalReference?: string;
  receiptId?: string;
  evidenceLinkIds: string[];
  audit: MunicipalAuditMetadata;
}

export interface MunicipalSubmissionRecord {
  id: string;
  jobId: string;
  projectId?: string;
  municipalityName: string;
  municipalReference?: string;
  status: MunicipalSubmissionStatus;
  submittedBy: string;
  clientId: string;
  bepId?: string;
  contractorId?: string;
  packageDocumentIds: string[];
  links: MunicipalTrackerLink[];
  statusHistory: MunicipalStatusHistoryEntry[];
  visibility: MunicipalVisibilityLevel;
  audit: MunicipalAuditMetadata;
  updatedAt: string;
}

export interface MunicipalSubmissionInput {
  id: string;
  jobId: string;
  projectId?: string;
  municipalityName: string;
  municipalReference?: string;
  submittedBy: Pick<UserProfile, 'uid' | 'role' | 'displayName' | 'email'>;
  clientId: string;
  bepId?: string;
  contractorId?: string;
  packageDocumentIds?: string[];
  createdAt?: string;
}

export interface MunicipalStatusUpdateInput {
  actor: Pick<UserProfile, 'uid' | 'role' | 'displayName' | 'email'>;
  status: MunicipalSubmissionStatus;
  note?: string;
  municipalReference?: string;
  receiptId?: string;
  evidenceLinkIds?: string[];
  source?: MunicipalAuditMetadata['source'];
  createdAt?: string;
}

export interface MunicipalLinkInput {
  actor: Pick<UserProfile, 'uid' | 'role' | 'displayName' | 'email'>;
  type: MunicipalLinkType;
  title: string;
  url: string;
  note?: string;
  visibility?: MunicipalVisibilityLevel;
  source?: MunicipalAuditMetadata['source'];
  createdAt?: string;
}

const ROLE_VISIBILITY: Record<MunicipalTrackerRole, MunicipalVisibilityLevel[]> = {
  admin: ['public_project', 'project_team', 'bep_admin', 'admin_only'],
  bep: ['public_project', 'project_team', 'bep_admin'],
  architect: ['public_project', 'project_team', 'bep_admin'],
  client: ['public_project'],
  contractor: ['public_project', 'project_team'],
  subcontractor: ['public_project'],
  freelancer: ['public_project', 'project_team'],
  supplier: ['public_project'],
  engineer: ['public_project', 'project_team', 'bep_admin'],
  quantity_surveyor: ['public_project', 'project_team'],
  town_planner: ['public_project', 'project_team'],
  energy_professional: ['public_project', 'project_team', 'bep_admin'],
  fire_engineer: ['public_project', 'project_team', 'bep_admin'],
  site_manager: ['public_project', 'project_team'],
  developer: ['public_project'],
  firm_admin: ['public_project', 'project_team', 'bep_admin', 'admin_only'],
  platform_admin: ['public_project', 'project_team', 'bep_admin', 'admin_only'],
  land_surveyor: ['public_project', 'project_team'],
  health_safety: ['public_project', 'project_team'],
};

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw Object.assign(new Error(`${field} is required`), { status: 400 });
  return value.trim();
}

function slug(value: string): string {
  return requireString(value, 'id seed').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function buildAuditMetadata(input: {
  actor: Pick<UserProfile, 'uid' | 'role' | 'displayName' | 'email'>;
  source?: MunicipalAuditMetadata['source'];
  createdAt?: string;
}): MunicipalAuditMetadata {
  return {
    actorId: requireString(input.actor.uid, 'actor.uid'),
    actorRole: input.actor.role,
    actorName: input.actor.displayName || input.actor.email,
    createdAt: input.createdAt ?? new Date().toISOString(),
    source: input.source ?? 'manual',
    immutable: true,
  };
}

export function canViewMunicipalVisibility(role: MunicipalTrackerRole, visibility: MunicipalVisibilityLevel): boolean {
  return ROLE_VISIBILITY[role]?.includes(visibility) ?? false;
}

export function visibleMunicipalLinksForRole(record: MunicipalSubmissionRecord, role: MunicipalTrackerRole): MunicipalTrackerLink[] {
  return record.links.filter((link) => canViewMunicipalVisibility(role, link.visibility));
}

export function createMunicipalSubmissionRecord(input: MunicipalSubmissionInput): MunicipalSubmissionRecord {
  const now = input.createdAt ?? new Date().toISOString();
  const audit = buildAuditMetadata({ actor: input.submittedBy, createdAt: now, source: 'manual' });
  const initialHistory: MunicipalStatusHistoryEntry = {
    id: `history-${slug(input.id)}-created`,
    toStatus: 'preparing',
    note: 'Municipal submission record created from package documents.',
    municipalReference: input.municipalReference,
    evidenceLinkIds: [],
    audit,
  };

  return {
    id: requireString(input.id, 'id'),
    jobId: requireString(input.jobId, 'jobId'),
    projectId: input.projectId,
    municipalityName: requireString(input.municipalityName, 'municipalityName'),
    municipalReference: input.municipalReference,
    status: 'preparing',
    submittedBy: requireString(input.submittedBy.uid, 'submittedBy.uid'),
    clientId: requireString(input.clientId, 'clientId'),
    bepId: input.bepId,
    contractorId: input.contractorId,
    packageDocumentIds: [...(input.packageDocumentIds ?? [])],
    links: [],
    statusHistory: [initialHistory],
    visibility: 'public_project',
    audit,
    updatedAt: now,
  };
}

export function addMunicipalTrackerLink(record: MunicipalSubmissionRecord, input: MunicipalLinkInput): MunicipalSubmissionRecord {
  const audit = buildAuditMetadata({ actor: input.actor, source: input.source ?? 'manual', createdAt: input.createdAt });
  const link: MunicipalTrackerLink = {
    id: `${input.type}-${slug(record.id)}-${record.links.length + 1}`,
    type: input.type,
    title: requireString(input.title, 'title'),
    url: requireString(input.url, 'url'),
    note: input.note,
    visibility: input.visibility ?? (input.type === 'receipt' || input.type === 'approval_record' ? 'public_project' : 'project_team'),
    audit,
  };

  return {
    ...record,
    links: [...record.links, link],
    updatedAt: audit.createdAt,
  };
}

export function appendMunicipalStatusHistory(record: MunicipalSubmissionRecord, input: MunicipalStatusUpdateInput): MunicipalSubmissionRecord {
  const audit = buildAuditMetadata({ actor: input.actor, source: input.source ?? 'manual', createdAt: input.createdAt });
  const historyEntry: MunicipalStatusHistoryEntry = {
    id: `history-${slug(record.id)}-${record.statusHistory.length + 1}`,
    fromStatus: record.status,
    toStatus: input.status,
    note: input.note,
    municipalReference: input.municipalReference ?? record.municipalReference,
    receiptId: input.receiptId,
    evidenceLinkIds: [...(input.evidenceLinkIds ?? [])],
    audit,
  };

  return {
    ...record,
    status: input.status,
    municipalReference: input.municipalReference ?? record.municipalReference,
    statusHistory: [...record.statusHistory, historyEntry],
    updatedAt: audit.createdAt,
  };
}

export function buildMunicipalStatusSummary(record: MunicipalSubmissionRecord, role: MunicipalTrackerRole): {
  id: string;
  municipalityName: string;
  municipalReference?: string;
  status: MunicipalSubmissionStatus;
  latestNote?: string;
  visibleLinks: MunicipalTrackerLink[];
  statusHistory: MunicipalStatusHistoryEntry[];
  updatedAt: string;
} {
  const latest = record.statusHistory[record.statusHistory.length - 1];
  return {
    id: record.id,
    municipalityName: record.municipalityName,
    municipalReference: record.municipalReference,
    status: record.status,
    latestNote: latest?.note,
    visibleLinks: visibleMunicipalLinksForRole(record, role),
    statusHistory: canViewMunicipalVisibility(role, 'project_team') ? record.statusHistory : record.statusHistory.filter((entry) => entry.toStatus !== 'queries_raised'),
    updatedAt: record.updatedAt,
  };
}
