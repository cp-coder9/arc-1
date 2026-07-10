/**
 * Documents Adapter — Environmental & Heritage
 *
 * Registers environmental documents in the Documents module with metadata:
 * - Screening reports
 * - Basic Assessment Reports (BAR)
 * - Scoping Reports
 * - Environmental Impact Reports (EIR)
 * - Heritage notifications and HIA reports
 * - Environmental Authorisation and Heritage Permits
 * - EMPr documents
 * - ECO audit reports
 *
 * Requirements: 20.4
 */

import type { PlatformIntegrationService, DocumentsWritePayload } from '../../p1-shared/services/platformIntegration';
import type { IntegrationWriteResult } from '../../p1-shared/types';

// ─── Document Type Constants ──────────────────────────────────────────────────

export type EnvironmentalDocumentType =
  | 'environmental_screening'
  | 'basic_assessment_report'
  | 'scoping_report'
  | 'eir'
  | 'heritage_notification'
  | 'hia_report'
  | 'environmental_authorisation'
  | 'heritage_permit'
  | 'empr'
  | 'eco_audit_report';

// ─── Typed Payloads ───────────────────────────────────────────────────────────

export interface EnvironmentalDocumentPayload {
  projectId: string;
  documentType: EnvironmentalDocumentType;
  applicationReference: string;
  uploadDate: string;
  uploadedBy: string;
  uploadedByName: string;
  linkedRecordId?: string;
  competentAuthority?: string;
  description?: string;
}

// ─── Adapter Interface ────────────────────────────────────────────────────────

export interface EnvironmentalDocumentsAdapter {
  /** Register an environmental/heritage document in the Documents module. */
  registerDocument(payload: EnvironmentalDocumentPayload): Promise<IntegrationWriteResult>;
}

// ─── Document Type Labels ─────────────────────────────────────────────────────

const DOCUMENT_TYPE_LABELS: Record<EnvironmentalDocumentType, string> = {
  environmental_screening: 'Environmental Screening Report',
  basic_assessment_report: 'Basic Assessment Report (BAR)',
  scoping_report: 'Scoping Report',
  eir: 'Environmental Impact Report (EIR)',
  heritage_notification: 'Heritage Notification (Section 38)',
  hia_report: 'Heritage Impact Assessment Report',
  environmental_authorisation: 'Environmental Authorisation',
  heritage_permit: 'Heritage Permit',
  empr: 'Environmental Management Programme (EMPr)',
  eco_audit_report: 'ECO Audit Report',
};

// ─── Factory ──────────────────────────────────────────────────────────────────

const SOURCE_MODULE = 'environmental-heritage';

/**
 * Creates an Environmental & Heritage → Documents adapter.
 *
 * Maps environmental/heritage document uploads to DocumentsWritePayload
 * with metadata including document type, application reference, competent
 * authority, and uploader identity. On failure, the platform integration
 * service handles retry queue enqueuing automatically.
 */
export function createEnvironmentalDocumentsAdapter(
  platform: PlatformIntegrationService,
): EnvironmentalDocumentsAdapter {
  return {
    async registerDocument(payload: EnvironmentalDocumentPayload): Promise<IntegrationWriteResult> {
      const documentsPayload: DocumentsWritePayload = {
        projectId: payload.projectId,
        documentType: DOCUMENT_TYPE_LABELS[payload.documentType],
        sourceModule: SOURCE_MODULE,
        linkedRecordRef: payload.linkedRecordId ?? payload.applicationReference,
        uploadDate: payload.uploadDate,
        responsibleParty: payload.uploadedBy,
        metadata: {
          environmentalDocumentType: payload.documentType,
          applicationReference: payload.applicationReference,
          uploadedBy: payload.uploadedBy,
          uploadedByName: payload.uploadedByName,
          ...(payload.competentAuthority ? { competentAuthority: payload.competentAuthority } : {}),
          ...(payload.description ? { description: payload.description } : {}),
        },
      };

      return platform.writeToDocuments(documentsPayload);
    },
  };
}
