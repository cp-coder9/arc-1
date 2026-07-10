/**
 * Documents Adapter — Survey & Geomatics
 *
 * Registers survey documents in the Documents module with metadata:
 * - Survey instruction PDFs
 * - Field notes
 * - SG diagram PDFs
 * - As-built reports
 *
 * Requirements: 20.8, 23.7
 */

import type { PlatformIntegrationService, DocumentsWritePayload } from '../../p1-shared/services/platformIntegration';
import type { IntegrationWriteResult } from '../../p1-shared/types';

// ─── Document Type Constants ──────────────────────────────────────────────────

export type SurveyDocumentType =
  | 'survey_instruction_pdf'
  | 'field_notes'
  | 'sg_diagram_pdf'
  | 'as_built_report';

// ─── Typed Payloads ───────────────────────────────────────────────────────────

export interface SurveyDocumentPayload {
  projectId: string;
  documentType: SurveyDocumentType;
  surveyInstructionRef: string;
  erfNumber: string;
  township: string;
  surveyorId: string;
  surveyorName: string;
  uploadDate: string;
}

// ─── Adapter Interface ────────────────────────────────────────────────────────

export interface SurveyDocumentsAdapter {
  /** Register a survey document in the Documents module with appropriate metadata. */
  registerDocument(payload: SurveyDocumentPayload): Promise<IntegrationWriteResult>;
}

// ─── Document Type Labels ─────────────────────────────────────────────────────

const DOCUMENT_TYPE_LABELS: Record<SurveyDocumentType, string> = {
  survey_instruction_pdf: 'survey instruction',
  field_notes: 'field notes',
  sg_diagram_pdf: 'SG diagram',
  as_built_report: 'as-built survey comparison',
};

// ─── Factory ──────────────────────────────────────────────────────────────────

const SOURCE_MODULE = 'survey-geomatics';

/**
 * Creates a Survey & Geomatics → Documents adapter.
 *
 * Maps survey document uploads to DocumentsWritePayload with metadata
 * including document type, survey instruction reference, property
 * description, and surveyor identity. On failure, the platform integration
 * service handles retry queue enqueuing automatically.
 */
export function createSurveyDocumentsAdapter(
  platform: PlatformIntegrationService,
): SurveyDocumentsAdapter {
  return {
    async registerDocument(payload: SurveyDocumentPayload): Promise<IntegrationWriteResult> {
      const documentsPayload: DocumentsWritePayload = {
        projectId: payload.projectId,
        documentType: DOCUMENT_TYPE_LABELS[payload.documentType],
        sourceModule: SOURCE_MODULE,
        linkedRecordRef: payload.surveyInstructionRef,
        uploadDate: payload.uploadDate,
        responsibleParty: payload.surveyorId,
        metadata: {
          surveyDocumentType: payload.documentType,
          surveyInstructionRef: payload.surveyInstructionRef,
          erfNumber: payload.erfNumber,
          township: payload.township,
          surveyorId: payload.surveyorId,
          surveyorName: payload.surveyorName,
        },
      };

      return platform.writeToDocuments(documentsPayload);
    },
  };
}
