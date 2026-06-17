// ─── Pack 5: Project Kickoff Service ───────────────────────────────────────

import type { ProjectPhase } from "@/services/lifecycleTypes";
import type { AppointmentRecord, KickoffReadiness } from "@/services/appointmentService";

// ─── Inline Types ──────────────────────────────────────────────────────────

export interface ProjectWorkspace {
  projectId: string;
  appointmentId: string;
  projectName: string;
  clientId: string;
  professionalId: string;
  phase: ProjectPhase;
  roles: Array<{ userId: string; role: "client" | "lead_professional" | "team_member" }>;
}

export interface ProjectPassportBaseline {
  passportId: string;
  projectId: string;
  appointmentId: string;
  facts: AppointmentRecord["projectFacts"] & {
    projectName: string;
    clientName: string;
    professionalName: string;
    appointmentStatus: AppointmentRecord["status"];
  };
  complianceContext: string[];
}

export interface KickoffChecklistItem {
  id: string;
  label: string;
  ownerRole: "client" | "lead_professional" | "platform_agent";
  required: boolean;
  completed: boolean;
}

export interface KickoffPackage {
  workspace: ProjectWorkspace;
  passport: ProjectPassportBaseline;
  checklist: KickoffChecklistItem[];
  initialTasks: Array<{ id: string; title: string; phase: ProjectPhase; ownerRole: string }>;
  readiness: KickoffReadiness;
}

// ─── Service Functions ─────────────────────────────────────────────────────

export function createProjectWorkspace(appointment: AppointmentRecord): ProjectWorkspace {
  return {
    projectId: `project-${appointment.appointmentId}`,
    appointmentId: appointment.appointmentId,
    projectName: appointment.proposalSnapshot.projectName,
    clientId: appointment.proposalSnapshot.clientId,
    professionalId: appointment.proposalSnapshot.professionalId,
    phase: appointment.status === "confirmed" ? "appointment_confirmed" as ProjectPhase : "appointment" as ProjectPhase,
    roles: [
      { userId: appointment.proposalSnapshot.clientId, role: "client" },
      { userId: appointment.proposalSnapshot.professionalId, role: "lead_professional" }
    ]
  };
}

function createProjectPassportBaselineInline(
  workspace: ProjectWorkspace,
  appointment: AppointmentRecord
): ProjectPassportBaseline {
  const complianceContext = [
    "NBR/SANS 10400 awareness required for later technical compliance checks.",
    "Municipal submission readiness depends on verified property, zoning and appointment scope facts.",
    "Professional responsibility remains with the appointed professional; agent outputs are recommendations only."
  ];
  if (!appointment.projectFacts.landUseOrZoningKnown) {
    complianceContext.push("Land-use/zoning not yet confirmed; route to missing-information workflow.");
  }
  return {
    passportId: `passport-${workspace.projectId}`,
    projectId: workspace.projectId,
    appointmentId: appointment.appointmentId,
    facts: {
      ...appointment.projectFacts,
      projectName: appointment.proposalSnapshot.projectName,
      clientName: appointment.proposalSnapshot.clientName,
      professionalName: appointment.proposalSnapshot.professionalName,
      appointmentStatus: appointment.status
    },
    complianceContext
  };
}

export function createKickoffChecklist(appointment: AppointmentRecord): KickoffChecklistItem[] {
  const missingFactItems = appointment.missingFacts.map((fact, index) => ({
    id: `missing-fact-${index + 1}`,
    label: fact,
    ownerRole: "client" as const,
    required: true,
    completed: false
  }));
  return [
    { id: "confirm-appointment", label: "Professional confirms appointment responsibility", ownerRole: "lead_professional", required: true, completed: appointment.status === "confirmed" },
    { id: "review-scope", label: "Review locked accepted scope and exclusions", ownerRole: "lead_professional", required: true, completed: true },
    { id: "verify-property", label: "Verify property/erf and municipal context", ownerRole: "client", required: true, completed: appointment.missingFacts.length === 0 },
    { id: "prepare-brief", label: "Generate first project brief from accepted proposal", ownerRole: "platform_agent", required: false, completed: false },
    { id: "setup-documents", label: "Create project document register placeholders", ownerRole: "platform_agent", required: false, completed: true },
    ...missingFactItems
  ];
}

export function createInitialTasks() {
  return [
    { id: "task-inception-brief", title: "Confirm client brief and success criteria", phase: "feasibility" as ProjectPhase, ownerRole: "lead_professional" },
    { id: "task-existing-info", title: "Request existing drawings, title deed and municipal information", phase: "feasibility" as ProjectPhase, ownerRole: "client" },
    { id: "task-submission-path", title: "Assess likely municipal submission readiness path", phase: "municipal_submission" as ProjectPhase, ownerRole: "lead_professional" }
  ];
}

export function createKickoffPackage(appointment: AppointmentRecord): KickoffPackage {
  const workspace = createProjectWorkspace(appointment);
  const passport = createProjectPassportBaselineInline(workspace, appointment);
  const checklist = createKickoffChecklist(appointment);
  const requiredOpen = checklist.some((item) => item.required && !item.completed);
  return {
    workspace,
    passport,
    checklist,
    initialTasks: createInitialTasks(),
    readiness: requiredOpen ? "blocked" : "ready"
  };
}
