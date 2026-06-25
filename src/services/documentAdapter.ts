// ─── Pack 5: Document Adapter ──────────────────────────────────────────────

import type { AppointmentRecord } from "@/services/appointmentService";
import type { ProjectWorkspace } from "@/services/kickoffService";
import type { StandaloneToolRun, AssignToProjectRequest } from "@/types/standaloneToolTypes";

// ─── Inline Type ───────────────────────────────────────────────────────────

export interface DocumentOutput {
  documentId: string;
  projectId: string;
  title: string;
  kind: "proposal_pdf" | "client_acceptance" | "terms_snapshot" | "appointment_letter_draft" | "project_brief" | "kickoff_checklist" | "tool_run_report";
  status: "placeholder" | "requires_human_approval" | "ready_to_generate";
  sourceRevisionId: string;
}

// ─── Service Function ──────────────────────────────────────────────────────

export function createAppointmentDocumentOutputs(
  workspace: ProjectWorkspace,
  appointment: AppointmentRecord
): DocumentOutput[] {
  const revision = `appointment-rev-${appointment.revision}`;
  return [
    {
      documentId: `doc-${workspace.projectId}-proposal`,
      projectId: workspace.projectId,
      title: "Accepted Proposal PDF",
      kind: "proposal_pdf",
      status: "placeholder",
      sourceRevisionId: appointment.proposalSnapshot.proposalRevisionId
    },
    {
      documentId: `doc-${workspace.projectId}-acceptance`,
      projectId: workspace.projectId,
      title: "Client Acceptance Record",
      kind: "client_acceptance",
      status: "ready_to_generate",
      sourceRevisionId: appointment.proposalSnapshot.clientAcceptanceId
    },
    {
      documentId: `doc-${workspace.projectId}-terms`,
      projectId: workspace.projectId,
      title: "Accepted Terms Snapshot",
      kind: "terms_snapshot",
      status: "ready_to_generate",
      sourceRevisionId: appointment.proposalSnapshot.termsSnapshotId
    },
    {
      documentId: `doc-${workspace.projectId}-appointment-letter`,
      projectId: workspace.projectId,
      title: "Appointment Letter Draft",
      kind: "appointment_letter_draft",
      status: "requires_human_approval",
      sourceRevisionId: revision
    },
    {
      documentId: `doc-${workspace.projectId}-brief`,
      projectId: workspace.projectId,
      title: "Project Brief Draft",
      kind: "project_brief",
      status: "placeholder",
      sourceRevisionId: revision
    },
    {
      documentId: `doc-${workspace.projectId}-kickoff`,
      projectId: workspace.projectId,
      title: "Kickoff Checklist",
      kind: "kickoff_checklist",
      status: "ready_to_generate",
      sourceRevisionId: revision
    }
  ];
}

// ─── Toolbox Capability Framework: tool-run document hand-off ──────────────
//
// Produces a document-adapter entry from a saved standalone tool run when it is
// assigned to a project (Requirement 9.3). The run's report (PDF/CSV) becomes a
// project document; its readiness reflects whether the run has been exported yet.
// The entry is advisory document-prep, never statutory certification.

export function createToolRunDocumentOutput(
  run: StandaloneToolRun,
  request: AssignToProjectRequest
): DocumentOutput {
  return {
    documentId: `doc-toolrun-${run.runId}`,
    // `projectName` is a user-defined project name/ID (may be external) — used as the
    // project key for the document register, mirroring AssignToProjectRequest semantics.
    projectId: request.projectName,
    title: `${run.toolLabel} — Tool Run Report`,
    kind: "tool_run_report",
    // Exported runs already have a generated artefact; otherwise the document is queued
    // to be generated from the run's report template.
    status: run.exportedAt ? "ready_to_generate" : "placeholder",
    sourceRevisionId: `run-${run.runId}-v${run.version}`,
  };
}
