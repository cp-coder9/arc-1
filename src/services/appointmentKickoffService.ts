// Pack 5: Appointment Kickoff Service
// Merges the pack's appointmentService + kickoffService into one cohesive module.
// Handles: appointment creation from accepted proposals, professional confirmation,
// revision management, project workspace creation, and kickoff checklist generation.

import type {
  AcceptedProposalSnapshot,
  KickoffAppointmentRecord,
  ProjectFacts,
  ProjectWorkspace,
  KickoffChecklistItem,
  InitialTask,
  KickoffPackage,
} from '../types/appointmentKickoff';
import { createProjectPassportBaseline } from './projectPassportAdapter';

// ── Validation helpers ──────────────────────────────────────────────────────────

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw Object.assign(new Error(`${field} is required`), { status: 400 });
  return value.trim();
}

function requireTruthy<T>(value: T | null | undefined | '', field: string): T {
  if (!value) throw Object.assign(new Error(`${field} is required`), { status: 400 });
  return value;
}

// ── Required fact definitions ───────────────────────────────────────────────────

const REQUIRED_FACT_CHECKS: Array<{ key: keyof ProjectFacts; label: string }> = [
  { key: 'municipality', label: 'Municipality is required for project and later submission readiness.' },
  { key: 'province', label: 'Province is required for South African jurisdiction context.' },
  {
    key: 'propertyDescription',
    label: 'Property description is required unless erf number is sufficient.',
  },
  {
    key: 'professionalBody',
    label: 'Professional body should be recorded for appointment responsibility context.',
  },
  {
    key: 'professionalRegistrationNumber',
    label: 'Professional registration number should be captured where applicable.',
  },
];

// ── Missing facts detection ─────────────────────────────────────────────────────

export function findMissingFacts(facts: ProjectFacts): string[] {
  const missing = REQUIRED_FACT_CHECKS.filter(({ key }) => !facts[key]).map(
    ({ label }) => label,
  );

  // Special case: either propertyDescription OR erfNumber must exist
  if (!facts.propertyDescription && !facts.erfNumber) {
    missing.push('Either a property description or erf number is required.');
  }

  return Array.from(new Set(missing));
}

// ── Appointment creation ────────────────────────────────────────────────────────

export function createAppointmentFromAcceptedProposal(input: {
  proposal: AcceptedProposalSnapshot;
  projectFacts: ProjectFacts;
  nowIso: string;
}): KickoffAppointmentRecord {
  const { proposal, projectFacts, nowIso } = input;

  // Gate 1: proposal must be accepted (client acceptance exists)
  if (!proposal.clientAcceptanceId) {
    throw Object.assign(
      new Error('Cannot create appointment without client acceptance.'),
      { status: 400 },
    );
  }

  // Gate 7: scope, terms, and fee snapshots must exist
  if (!proposal.scopeSnapshotId || !proposal.termsSnapshotId || !proposal.feeSnapshotId) {
    throw Object.assign(
      new Error('Cannot create appointment without scope, terms and fee snapshots.'),
      { status: 400 },
    );
  }

  if (!proposal.proposalId || !proposal.proposalRevisionId) {
    throw Object.assign(
      new Error('Proposal ID and revision ID are required for immutability.'),
      { status: 400 },
    );
  }

  const missingFacts = findMissingFacts(projectFacts);

  return {
    appointmentId: `appt-${proposal.proposalId}`,
    proposalSnapshot: { ...proposal }, // Immutable copy
    projectFacts: { ...projectFacts },
    status: 'pending_professional_confirmation',
    revision: 1,
    createdAtIso: nowIso,
    requiresHumanApprovalBeforeFormalIssue: true,
    missingFacts,
  };
}

// ── Professional confirmation ───────────────────────────────────────────────────

export function confirmProfessionalAppointment(
  appointment: KickoffAppointmentRecord,
  nowIso: string,
): KickoffAppointmentRecord {
  if (appointment.status === 'confirmed') {
    throw Object.assign(
      new Error('Appointment is already confirmed.'),
      { status: 409 },
    );
  }

  if (appointment.status === 'revision_required') {
    throw Object.assign(
      new Error('Cannot confirm an appointment that requires revision.'),
      { status: 400 },
    );
  }

  return {
    ...appointment,
    status:
      appointment.missingFacts.length === 0
        ? 'confirmed'
        : 'pending_professional_confirmation',
    professionalConfirmedAtIso: nowIso,
    requiresHumanApprovalBeforeFormalIssue: appointment.missingFacts.length > 0,
  };
}

// ── Appointment revision ────────────────────────────────────────────────────────

export function reviseAppointment(
  appointment: KickoffAppointmentRecord,
  reason: string,
): KickoffAppointmentRecord {
  if (!reason.trim()) {
    throw Object.assign(
      new Error('Appointment revision requires a reason.'),
      { status: 400 },
    );
  }

  // The original proposal snapshot is preserved — only the wrapper is revised
  return {
    ...appointment,
    appointmentId: `${appointment.appointmentId.replace(/-rev-\d+$/, '')}-rev-${appointment.revision + 1}`,
    revision: appointment.revision + 1,
    status: 'revision_required',
    requiresHumanApprovalBeforeFormalIssue: true,
    // proposalSnapshot remains unchanged — immutable
  };
}

// ── Project workspace creation ──────────────────────────────────────────────────

export function createProjectWorkspace(
  appointment: KickoffAppointmentRecord,
): ProjectWorkspace {
  const projectId = `project-${appointment.appointmentId}`;

  return {
    projectId,
    appointmentId: appointment.appointmentId,
    projectName: appointment.proposalSnapshot.projectName,
    clientId: appointment.proposalSnapshot.clientId,
    professionalId: appointment.proposalSnapshot.professionalId,
    phase:
      appointment.status === 'confirmed'
        ? 'appointment_confirmed'
        : 'pre_appointment',
    roles: [
      { userId: appointment.proposalSnapshot.clientId, role: 'client' },
      {
        userId: appointment.proposalSnapshot.professionalId,
        role: 'lead_professional',
      },
    ],
  };
}

// ── 7 Kickoff Readiness Gates ───────────────────────────────────────────────────

export interface KickoffGatesResult {
  ready: boolean;
  blockers: string[];
  gates: Array<{ gate: number; label: string; passed: boolean }>;
}

export function validateKickoffReadiness(
  appointment: KickoffAppointmentRecord,
): KickoffGatesResult {
  const proposal = appointment.proposalSnapshot;
  const facts = appointment.projectFacts;
  const blockers: string[] = [];
  const gates: Array<{ gate: number; label: string; passed: boolean }> = [];

  // Gate 1: Proposal is accepted
  const g1 = Boolean(proposal.clientAcceptanceId);
  gates.push({ gate: 1, label: 'Proposal is accepted', passed: g1 });
  if (!g1) blockers.push('Proposal has not been accepted by the client.');

  // Gate 2: Client acceptance exists (digital signature/upload)
  const g2 = Boolean(proposal.clientAcceptanceId);
  gates.push({
    gate: 2,
    label: 'Client acceptance exists (digital signature/upload)',
    passed: g2,
  });
  if (!g2) blockers.push('Client acceptance record is missing.');

  // Gate 3: Professional confirmation exists (formal sign-off)
  const g3 = Boolean(appointment.professionalConfirmedAtIso);
  gates.push({
    gate: 3,
    label: 'Professional confirmation exists (formal sign-off)',
    passed: g3,
  });
  if (!g3)
    blockers.push(
      'Professional has not yet confirmed the appointment responsibility.',
    );

  // Gate 4: Project name exists and is valid
  const g4 = Boolean(proposal.projectName?.trim());
  gates.push({
    gate: 4,
    label: 'Project name exists and is valid',
    passed: g4,
  });
  if (!g4) blockers.push('Project name is not set on the accepted proposal.');

  // Gate 5: Municipality is identified and confirmed
  const g5 = Boolean(facts.municipality?.trim());
  gates.push({
    gate: 5,
    label: 'Municipality is identified and confirmed',
    passed: g5,
  });
  if (!g5) blockers.push('Municipality has not been identified.');

  // Gate 6: Property description or erf reference exists
  const g6 = Boolean(facts.propertyDescription?.trim() || facts.erfNumber?.trim());
  gates.push({
    gate: 6,
    label: 'Property description or erf reference exists',
    passed: g6,
  });
  if (!g6)
    blockers.push(
      'Neither a property description nor an erf reference has been provided.',
    );

  // Gate 7: Scope and terms snapshot IDs exist and are valid
  const g7 = Boolean(
    proposal.scopeSnapshotId?.trim() && proposal.termsSnapshotId?.trim(),
  );
  gates.push({
    gate: 7,
    label: 'Scope and terms snapshot IDs exist and are valid',
    passed: g7,
  });
  if (!g7)
    blockers.push('Scope and/or terms snapshot IDs are missing from the proposal.');

  return {
    ready: blockers.length === 0,
    blockers,
    gates,
  };
}

// ── Kickoff checklist ───────────────────────────────────────────────────────────

export function createKickoffChecklist(
  appointment: KickoffAppointmentRecord,
): KickoffChecklistItem[] {
  const gates = validateKickoffReadiness(appointment);

  const baseItems: KickoffChecklistItem[] = [
    {
      id: 'gate-1-proposal-accepted',
      label: 'Proposal is accepted by client',
      ownerRole: 'client',
      required: true,
      completed: gates.gates[0]?.passed ?? false,
    },
    {
      id: 'gate-2-client-acceptance',
      label: 'Client acceptance record exists (signature/upload)',
      ownerRole: 'client',
      required: true,
      completed: gates.gates[1]?.passed ?? false,
    },
    {
      id: 'gate-3-professional-confirmation',
      label: 'Professional confirms appointment responsibility',
      ownerRole: 'lead_professional',
      required: true,
      completed: gates.gates[2]?.passed ?? false,
    },
    {
      id: 'gate-4-project-name',
      label: 'Project name is valid',
      ownerRole: 'lead_professional',
      required: true,
      completed: gates.gates[3]?.passed ?? false,
    },
    {
      id: 'gate-5-municipality',
      label: 'Municipality is identified and confirmed',
      ownerRole: 'client',
      required: true,
      completed: gates.gates[4]?.passed ?? false,
    },
    {
      id: 'gate-6-property',
      label: 'Property description or erf reference recorded',
      ownerRole: 'client',
      required: true,
      completed: gates.gates[5]?.passed ?? false,
    },
    {
      id: 'gate-7-scope-terms',
      label: 'Scope and terms snapshots are recorded',
      ownerRole: 'lead_professional',
      required: true,
      completed: gates.gates[6]?.passed ?? false,
    },
  ];

  // Additional operational items
  const operationalItems: KickoffChecklistItem[] = [
    {
      id: 'review-locked-scope',
      label: 'Review locked accepted scope and exclusions',
      ownerRole: 'lead_professional',
      required: true,
      completed: true, // always available from snapshot
    },
    {
      id: 'prepare-project-brief',
      label: 'Generate first project brief from accepted proposal',
      ownerRole: 'platform_agent',
      required: false,
      completed: false,
    },
    {
      id: 'setup-document-placeholders',
      label: 'Create project document register placeholders',
      ownerRole: 'platform_agent',
      required: false,
      completed: true, // auto-created on appointment
    },
  ];

  // Missing fact items from the project facts
  const missingFactItems: KickoffChecklistItem[] = appointment.missingFacts.map(
    (fact, index) => ({
      id: `missing-fact-${index + 1}`,
      label: fact,
      ownerRole: 'client' as const,
      required: true,
      completed: false,
    }),
  );

  return [...baseItems, ...operationalItems, ...missingFactItems];
}

// ── Initial tasks ───────────────────────────────────────────────────────────────

export function createInitialTasks(): InitialTask[] {
  return [
    {
      id: 'task-inception-brief',
      title: 'Confirm client brief and success criteria',
      phase: 'inception',
      ownerRole: 'lead_professional',
    },
    {
      id: 'task-existing-info',
      title:
        'Request existing drawings, title deed and municipal information',
      phase: 'inception',
      ownerRole: 'client',
    },
    {
      id: 'task-submission-path',
      title: 'Assess likely municipal submission readiness path',
      phase: 'municipal_submission_readiness',
      ownerRole: 'lead_professional',
    },
  ];
}

// ── Kickoff package assembly ────────────────────────────────────────────────────

export function createKickoffPackage(
  appointment: KickoffAppointmentRecord,
): KickoffPackage {
  const workspace = createProjectWorkspace(appointment);
  const passport = createProjectPassportBaseline(workspace, appointment);
  const checklist = createKickoffChecklist(appointment);
  const gates = validateKickoffReadiness(appointment);
  const requiredOpen = checklist.some(
    (item) => item.required && !item.completed,
  );

  return {
    workspace,
    passport,
    checklist,
    initialTasks: createInitialTasks(),
    readiness: requiredOpen || !gates.ready ? 'blocked' : 'ready',
  };
}
