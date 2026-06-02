import type { UserVerification } from '../types';
import { isActiveVerifiedVerification } from './userVerificationService';

export type AppointmentStatus = 'draft' | 'pending_acceptance' | 'accepted' | 'cancelled' | 'superseded';

export interface AppointmentPreconditionsInput {
  brief: { id?: string; clientId: string; status: string; appointmentId?: string | null };
  proposal: { id?: string; briefId: string; clientId: string; professionalId: string; status: string };
  verification: Pick<UserVerification, 'status' | 'expiresAt' | 'subjectType' | 'statutoryBody'>;
}

export interface AppointmentRecordInput {
  briefId: string;
  proposalId: string;
  projectId?: string;
  clientId: string;
  professionalId: string;
  verificationId: string;
  createdBy: string;
  contractDraftId?: string;
  milestonePlanId?: string;
}

export interface AppointmentRecord extends AppointmentRecordInput {
  status: AppointmentStatus;
  idempotencyKey: string;
  legalAcceptanceRequired: true;
  humanAcceptanceRequired: true;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectStageHistoryEntry {
  projectId: string;
  stage: string;
  previousStage?: string;
  actorId: string;
  appointmentId?: string;
  note?: string;
  createdAt: string;
  immutable: true;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw Object.assign(new Error(`${field} is required`), { status: 400 });
  return value.trim();
}

export function buildAppointmentIdempotencyKey(input: Pick<AppointmentRecordInput, 'briefId' | 'clientId' | 'professionalId'>): string {
  return ['appointment', requireString(input.briefId, 'briefId'), requireString(input.clientId, 'clientId'), requireString(input.professionalId, 'professionalId')].join(':');
}

export function assertAppointmentPreconditions(input: AppointmentPreconditionsInput): void {
  if (input.brief.appointmentId || input.brief.status === 'appointed') {
    throw Object.assign(new Error('A professional has already been appointed for this brief'), { status: 409 });
  }
  if (!['published', 'submitted', 'ready_for_appointment'].includes(input.brief.status)) {
    throw Object.assign(new Error('Brief is not ready for appointment'), { status: 400 });
  }
  if (input.proposal.briefId !== input.brief.id && input.brief.id) {
    throw Object.assign(new Error('Proposal does not belong to this brief'), { status: 400 });
  }
  if (input.proposal.clientId !== input.brief.clientId) {
    throw Object.assign(new Error('Proposal client does not match brief owner'), { status: 400 });
  }
  if (!['submitted', 'shortlisted', 'accepted'].includes(input.proposal.status)) {
    throw Object.assign(new Error('Proposal is not eligible for appointment'), { status: 400 });
  }
  if (!isActiveVerifiedVerification(input.verification, { subjectType: 'bep', statutoryBody: 'SACAP' })) {
    throw Object.assign(new Error('Active BEP verification is required at appointment time'), { status: 403 });
  }
}

export function buildAppointmentRecord(input: AppointmentRecordInput): AppointmentRecord {
  if (input.clientId !== input.createdBy) throw Object.assign(new Error('Only the client owner can create an appointment'), { status: 403 });
  const now = new Date().toISOString();
  return {
    ...input,
    briefId: requireString(input.briefId, 'briefId'),
    proposalId: requireString(input.proposalId, 'proposalId'),
    clientId: requireString(input.clientId, 'clientId'),
    professionalId: requireString(input.professionalId, 'professionalId'),
    verificationId: requireString(input.verificationId, 'verificationId'),
    createdBy: requireString(input.createdBy, 'createdBy'),
    status: 'pending_acceptance',
    idempotencyKey: buildAppointmentIdempotencyKey(input),
    legalAcceptanceRequired: true,
    humanAcceptanceRequired: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildProjectStageHistoryEntry(input: {
  projectId: string;
  stage: string;
  previousStage?: string;
  actorId: string;
  appointmentId?: string;
  note?: string;
}): ProjectStageHistoryEntry {
  return {
    projectId: requireString(input.projectId, 'projectId'),
    stage: requireString(input.stage, 'stage'),
    previousStage: input.previousStage,
    actorId: requireString(input.actorId, 'actorId'),
    appointmentId: input.appointmentId,
    note: input.note,
    createdAt: new Date().toISOString(),
    immutable: true,
  };
}
