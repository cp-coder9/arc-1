import type { Application, Job, Project } from '@/types';

type IdValue = string | null | undefined;

export interface ProfessionalJobLike extends Partial<Pick<Job, 'selectedArchitectId'>> {
  selectedProfessionalId?: IdValue;
  selectedBepId?: IdValue;
}

export interface ProfessionalApplicationLike extends Partial<Pick<Application, 'architectId'>> {
  professionalId?: IdValue;
  bepId?: IdValue;
}

export interface ProfessionalProjectLike extends Partial<Pick<Project, 'leadArchitectId'>> {
  leadProfessionalId?: IdValue;
  leadBepId?: IdValue;
}

function firstNonEmptyId(...ids: IdValue[]): string {
  return ids.find((id): id is string => typeof id === 'string' && id.trim().length > 0) ?? '';
}

export function getSelectedProfessionalId(job?: ProfessionalJobLike | null): string {
  if (!job) return '';
  return firstNonEmptyId(job.selectedProfessionalId, job.selectedBepId, job.selectedArchitectId);
}

export function getApplicationProfessionalId(application?: ProfessionalApplicationLike | null): string {
  if (!application) return '';
  return firstNonEmptyId(application.professionalId, application.bepId, application.architectId);
}

export function getLeadProfessionalId(project?: ProfessionalProjectLike | null): string {
  if (!project) return '';
  return firstNonEmptyId(project.leadProfessionalId, project.leadBepId, project.leadArchitectId);
}

export function isSelectedProfessional(job: ProfessionalJobLike | null | undefined, userId?: IdValue): boolean {
  return Boolean(userId && getSelectedProfessionalId(job) === userId);
}

export function isLeadProfessional(project: ProfessionalProjectLike | null | undefined, userId?: IdValue): boolean {
  return Boolean(userId && getLeadProfessionalId(project) === userId);
}

export function withProfessionalJobAliases<T extends object>(job: T & ProfessionalJobLike, professionalId = getSelectedProfessionalId(job)): T & {
  selectedProfessionalId?: string;
  selectedBepId?: string;
  selectedArchitectId?: string;
} {
  if (!professionalId) return job;
  return {
    ...job,
    selectedProfessionalId: job.selectedProfessionalId || professionalId,
    selectedBepId: job.selectedBepId || professionalId,
    selectedArchitectId: job.selectedArchitectId || professionalId,
  };
}

export function withProfessionalApplicationAliases<T extends object>(application: T & ProfessionalApplicationLike, professionalId = getApplicationProfessionalId(application)): T & {
  professionalId?: string;
  bepId?: string;
  architectId?: string;
} {
  if (!professionalId) return application;
  return {
    ...application,
    professionalId: application.professionalId || professionalId,
    bepId: application.bepId || professionalId,
    architectId: application.architectId || professionalId,
  };
}

export function withProfessionalProjectAliases<T extends object>(project: T & ProfessionalProjectLike, professionalId = getLeadProfessionalId(project)): T & {
  leadProfessionalId?: string;
  leadBepId?: string;
  leadArchitectId?: string;
} {
  if (!professionalId) return project;
  return {
    ...project,
    leadProfessionalId: project.leadProfessionalId || professionalId,
    leadBepId: project.leadBepId || professionalId,
    leadArchitectId: project.leadArchitectId || professionalId,
  };
}
