import type { DocumentRecord, DocumentRevision, DrawingRecord } from '@/services/documentRegisterService';

export const tenantId = 'tenant-architex-demo';
export const projectId = 'project-sandton-upgrade';

export const documents: DocumentRecord[] = [
  { documentId: 'doc-a100', tenantId, projectId, title: 'Architectural Site Plan', documentType: 'drawing', discipline: 'architectural', phase: 'municipal_submission', status: 'issued', issuePurpose: 'for_municipal_submission', authorRole: 'architect', reviewerRole: 'architect', currentRevisionId: 'rev-a100-b', createdAt: '2026-06-01T08:00:00Z', updatedAt: '2026-06-02T08:00:00Z' },
  { documentId: 'doc-a101', tenantId, projectId, title: 'Ground Floor Plan', documentType: 'drawing', discipline: 'architectural', phase: 'construction_execution', status: 'issued', issuePurpose: 'for_construction', authorRole: 'architect', reviewerRole: 'architect', currentRevisionId: 'rev-a101-c', createdAt: '2026-06-01T08:00:00Z', updatedAt: '2026-06-03T08:00:00Z' },
  { documentId: 'doc-a102', tenantId, projectId, title: 'First Floor Plan', documentType: 'drawing', discipline: 'architectural', phase: 'construction_execution', status: 'superseded', issuePurpose: 'for_construction', authorRole: 'architect', reviewerRole: 'architect', currentRevisionId: 'rev-a102-b', createdAt: '2026-06-01T08:00:00Z', updatedAt: '2026-06-04T08:00:00Z' },
  { documentId: 'doc-a102-new', tenantId, projectId, title: 'First Floor Plan', documentType: 'drawing', discipline: 'architectural', phase: 'construction_execution', status: 'issued', issuePurpose: 'for_construction', authorRole: 'architect', reviewerRole: 'architect', currentRevisionId: 'rev-a102-c', createdAt: '2026-06-04T08:00:00Z', updatedAt: '2026-06-04T08:00:00Z' },
  { documentId: 'doc-spec-001', tenantId, projectId, title: 'Outline Specification', documentType: 'specification', discipline: 'general', phase: 'tender_procurement', status: 'pending_review', issuePurpose: 'for_tender', authorRole: 'architect', reviewerRole: 'quantity_surveyor', currentRevisionId: 'rev-spec-001-a', createdAt: '2026-06-02T08:00:00Z', updatedAt: '2026-06-04T08:00:00Z' },
  { documentId: 'doc-mun-form-001', tenantId, projectId, title: 'Municipal Application Form Placeholder', documentType: 'municipal_form', discipline: 'general', phase: 'municipal_submission', status: 'draft', issuePurpose: 'for_municipal_submission', authorRole: 'architect', reviewerRole: 'client_developer', currentRevisionId: 'rev-mun-form-001-a', createdAt: '2026-06-02T08:00:00Z', updatedAt: '2026-06-04T08:00:00Z' },
  { documentId: 'doc-closeout-001', tenantId, projectId, title: 'Closeout Pack Placeholder', documentType: 'closeout_pack', discipline: 'general', phase: 'closeout', status: 'draft', issuePurpose: 'closeout', authorRole: 'contractor', reviewerRole: 'architect', currentRevisionId: 'rev-closeout-001-a', createdAt: '2026-06-03T08:00:00Z', updatedAt: '2026-06-04T08:00:00Z' }
];

export const drawings: DrawingRecord[] = [
  { drawingId: 'drw-a100', documentId: 'doc-a100', drawingNumber: 'A-100', title: 'Site Plan', discipline: 'architectural', sheetType: 'site_plan', scale: '1:200', currentRevision: 'B', status: 'issued', issuePurpose: 'for_municipal_submission' },
  { drawingId: 'drw-a101', documentId: 'doc-a101', drawingNumber: 'A-101', title: 'Ground Floor Plan', discipline: 'architectural', sheetType: 'floor_plan', scale: '1:100', currentRevision: 'C', status: 'issued', issuePurpose: 'for_construction' },
  { drawingId: 'drw-a102-old', documentId: 'doc-a102', drawingNumber: 'A-102', title: 'First Floor Plan', discipline: 'architectural', sheetType: 'floor_plan', scale: '1:100', currentRevision: 'B', status: 'superseded', issuePurpose: 'for_construction', supersededByDrawingId: 'drw-a102-new' },
  { drawingId: 'drw-a102-new', documentId: 'doc-a102-new', drawingNumber: 'A-102', title: 'First Floor Plan', discipline: 'architectural', sheetType: 'floor_plan', scale: '1:100', currentRevision: 'C', status: 'issued', issuePurpose: 'for_construction' }
];

export const revisions: DocumentRevision[] = [
  { revisionId: 'rev-a100-b', documentId: 'doc-a100', revisionCode: 'B', status: 'issued', issuePurpose: 'for_municipal_submission', issuedAt: '2026-06-02T08:00:00Z', authorUserId: 'u-architect-001', reviewerUserId: 'u-architect-002', notes: 'Issued for municipal submission.' },
  { revisionId: 'rev-a101-c', documentId: 'doc-a101', revisionCode: 'C', status: 'issued', issuePurpose: 'for_construction', issuedAt: '2026-06-03T08:00:00Z', authorUserId: 'u-architect-001', reviewerUserId: 'u-architect-002', notes: 'Issued for construction.' },
  { revisionId: 'rev-a102-b', documentId: 'doc-a102', revisionCode: 'B', status: 'superseded', issuePurpose: 'for_construction', issuedAt: '2026-06-02T08:00:00Z', supersededByRevisionId: 'rev-a102-c', authorUserId: 'u-architect-001', reviewerUserId: 'u-architect-002', notes: 'Superseded by revision C.' },
  { revisionId: 'rev-a102-c', documentId: 'doc-a102-new', revisionCode: 'C', status: 'issued', issuePurpose: 'for_construction', issuedAt: '2026-06-04T08:00:00Z', supersedesRevisionId: 'rev-a102-b', authorUserId: 'u-architect-001', reviewerUserId: 'u-architect-002', notes: 'Updated stair coordination.' }
];

// ── Pack 5: Appointment/Project Kickoff Sample Data ────────────────────────

import type { AcceptedProposalSnapshot, ProjectFacts } from "@/services/appointmentService";

export const acceptedProposal: AcceptedProposalSnapshot = {
  proposalId: "prop-architect-002",
  proposalRevisionId: "rev-002",
  acceptedAtIso: "2026-06-04T09:15:00.000Z",
  clientAcceptanceId: "accept-001",
  clientId: "client-urban-family-trust",
  clientName: "Urban Family Trust",
  professionalId: "pro-demo-architect",
  professionalName: "Demo Architect PrArch",
  companyName: "Demo Architects Inc.",
  projectName: "Parkview Alterations and Additions",
  scopeSnapshotId: "scope-snap-002",
  termsSnapshotId: "terms-snap-002",
  feeSnapshotId: "fee-snap-002",
  acceptedTotal: { currency: "ZAR", amount: 393335 },
  sourceCalculatorVersion: "architect-fee-calculator-v0.1.0",
  immutabilityHash: "sha256-demo-accepted-proposal-snapshot"
};

export const projectFacts: ProjectFacts = {
  propertyDescription: "Existing dwelling alteration/addition project",
  erfNumber: "Erf 1234 Parkview",
  municipality: "City of Johannesburg",
  province: "Gauteng",
  landUseOrZoningKnown: false,
  professionalBody: "SACAP",
  professionalRegistrationNumber: "PrArch DEMO-12345"
};
