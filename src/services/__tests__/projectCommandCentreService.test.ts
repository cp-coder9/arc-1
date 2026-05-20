import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getProjectCommandCentreGuidance } from '../projectCommandCentreService';
import type { DelegatedTask, Job, Project, TenderPackage, UserRole } from '../../types';

const baseProject = (currentStage: Project['currentStage']): Project => ({
  id: 'project-1',
  jobId: 'job-1',
  clientId: 'client-1',
  currentStage,
  stageHistory: [],
  teamMembers: [],
  createdAt: '2026-05-01T00:00:00.000Z',
});

const baseJob: Job = {
  id: 'job-1',
  clientId: 'client-1',
  title: 'House Alteration',
  description: 'Alteration and additions',
  requirements: ['Signed concept approval', 'Drainage comments'],
  deadline: '2026-06-01',
  budget: 2450000,
  category: 'Residential',
  status: 'in-progress',
  createdAt: '2026-05-01T00:00:00.000Z',
};

const baseTender: TenderPackage = {
  id: 'pkg-1',
  projectId: 'project-1',
  jobId: 'job-1',
  title: 'Window Package',
  description: 'Fenestration supply and install',
  scope: ['Window order approval'],
  documents: [],
  deadline: '2026-05-28',
  estimatedBudget: 185000,
  requiredDisciplines: ['architecture'],
  status: 'awarded',
  createdBy: 'bep-1',
  awardedContractorId: 'contractor-1',
  createdAt: '2026-05-01T00:00:00.000Z',
};

const baseTask: DelegatedTask = {
  id: 'task-1',
  jobId: 'job-1',
  architectId: 'bep-1',
  assigneeId: 'freelancer-1',
  assigneeName: 'Freelancer One',
  assigneeRole: 'BIM modeller',
  deadline: '2026-05-24',
  notes: 'Revise the 3D model',
  status: 'in-progress',
  submissionStatus: 'changes_requested',
  paymentStatus: 'review_pending',
  createdAt: '2026-05-01T00:00:00.000Z',
};

function expectHumanConfirmed(action: ReturnType<typeof getProjectCommandCentreGuidance>['nextAction']) {
  expect(action.requiresHumanConfirmation).toBe(true);
  expect(action.automationLevel).toBe('advisory');
  expect(action.detail.toLowerCase()).toMatch(/human|review|approval|confirm/);
}

describe('projectCommandCentreService', () => {
  it.each([
    ['client', 'coordination', 'Review project progress and approvals', 'client-progress'],
    ['bep', 'coordination', 'Review design coordination blockers', 'tasks'],
    ['contractor', 'delivery', 'Review package procurement approval', 'packages'],
    ['freelancer', 'coordination', 'Upload revised freelancer deliverable', 'freelancer-submissions'],
    ['admin', 'payments', 'Review payment and dispute governance queue', 'disputes'],
  ] as const)('returns PRD example next action for %s at %s', (role, stage, label, target) => {
    const guidance = getProjectCommandCentreGuidance({
      activeRole: role,
      activeProject: baseProject(stage),
      activeJob: baseJob,
      activePackage: role === 'contractor' ? baseTender : undefined,
      activeTask: role === 'freelancer' ? baseTask : undefined,
      profileCompletion: { isComplete: true, completionRatio: 1, missingFields: [], blockers: [] },
    });

    expect(guidance.activeStage).toBe(stage);
    expect(guidance.nextAction).toMatchObject({ label, target });
    expect(guidance.aiSummary).toContain('advisory');
    expectHumanConfirmed(guidance.nextAction);
  });



  it('keeps stage-only guidance conditional and avoids asserting unsupported record facts', () => {
    const guidance = getProjectCommandCentreGuidance({
      activeRole: 'bep',
      activeProject: baseProject('coordination'),
      profileCompletion: { isComplete: true, completionRatio: 1, missingFields: [], blockers: [] },
    });

    expect(guidance.nextAction.label).toBe('Review design coordination blockers');
    expect(guidance.nextAction.detail).toContain('Review drawing, consultant, transmittal, and client-decision records');
    expect(guidance.nextAction.detail).not.toMatch(/ready to issue|has requested|needs your approval/i);
  });

  it('keeps command-centre service targets aligned to registered dashboard route ids', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/services/projectCommandCentreService.ts'), 'utf8');
    const targets = [...source.matchAll(/target: '([^']+)'/g)].map((match) => match[1]);
    const registeredTargets = new Set([
      'profile',
      'client-intake',
      'client-proposals',
      'client-progress',
      'municipal-tracker',
      'payments',
      'journey',
      'technical-brief',
      'contracts',
      'tasks',
      'design',
      'procurement',
      'bep-team',
      'snagging',
      'packages',
      'freelancer-submissions',
      'freelancer-work',
      'admin-console',
      'disputes',
    ]);

    expect(targets).not.toHaveLength(0);
    expect(targets.filter((target) => !registeredTargets.has(target))).toEqual([]);
  });

  it('keeps client open jobs on proposal comparison instead of sending them back to intake', () => {
    const guidance = getProjectCommandCentreGuidance({
      activeRole: 'client',
      activeJob: { ...baseJob, status: 'open' },
      profileCompletion: { isComplete: true, completionRatio: 1, missingFields: [], blockers: [] },
    });

    expect(guidance.activeStage).toBe('appointment');
    expect(guidance.nextAction).toMatchObject({ label: 'Compare BEP proposals', target: 'client-proposals' });
  });

  it('uses committed route ids for admin command-centre actions', () => {
    const intakeGuidance = getProjectCommandCentreGuidance({
      activeRole: 'admin',
      activeProject: baseProject('intake'),
      profileCompletion: { isComplete: true, completionRatio: 1, missingFields: [], blockers: [] },
    });
    const closeoutGuidance = getProjectCommandCentreGuidance({
      activeRole: 'admin',
      activeProject: baseProject('closeout'),
      profileCompletion: { isComplete: true, completionRatio: 1, missingFields: [], blockers: [] },
    });

    expect(intakeGuidance.nextAction.target).toBe('admin-console');
    expect(closeoutGuidance.nextAction.target).toBe('admin-console');
  });

  it('normalizes legacy scoping records to canonical intake guidance', () => {
    const guidance = getProjectCommandCentreGuidance({
      activeRole: 'client',
      activeProject: baseProject('scoping'),
      activeJob: { ...baseJob, status: 'open' },
      profileCompletion: { isComplete: true, completionRatio: 1, missingFields: [], blockers: [] },
    });

    expect(guidance.activeStage).toBe('intake');
    expect(guidance.stageLabel).toBe('Brief & Diagnostic');
    expect(guidance.nextAction.target).toBe('client-intake');
  });

  it('prioritises profile readiness before project workflow actions', () => {
    const guidance = getProjectCommandCentreGuidance({
      activeRole: 'bep',
      activeProject: baseProject('coordination'),
      activeJob: baseJob,
      profileCompletion: {
        isComplete: false,
        completionRatio: 0.5,
        missingFields: ['professionalIndemnity'],
        blockers: ['Profile incomplete: professionalIndemnity'],
      },
    });

    expect(guidance.nextAction).toMatchObject({
      label: 'Complete profile readiness',
      target: 'profile',
      priority: 'high',
    });
    expectHumanConfirmed(guidance.nextAction);
  });

  it('is deterministic for the same input and does not mutate source records', () => {
    const input = {
      activeRole: 'contractor' as UserRole,
      activeProject: baseProject('delivery'),
      activeJob: baseJob,
      activePackage: baseTender,
      profileCompletion: { isComplete: true, completionRatio: 1, missingFields: [], blockers: [] },
    };
    const before = JSON.stringify(input);

    expect(getProjectCommandCentreGuidance(input)).toEqual(getProjectCommandCentreGuidance(input));
    expect(JSON.stringify(input)).toBe(before);
  });
});
