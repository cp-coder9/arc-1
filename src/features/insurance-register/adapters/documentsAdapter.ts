/**
 * Documents Adapter — Insurance Register
 *
 * Registers policy documents using PlatformIntegrationService.writeToDocuments().
 * Maps policy upload to DocumentsWritePayload with type "insurance certificate".
 *
 * Requirements: 4.6, 4.8
 */

import type { PlatformIntegrationService, DocumentsWritePayload } from '../../p1-shared/services/platformIntegration';
import type { IntegrationWriteResult } from '../../p1-shared/types';
import type { InsurancePolicyType } from '../types';

// ─── Adapter Payload Type ─────────────────────────────────────────────────────

export interface DocumentsAdapterPayload {
  projectId: string;
  policyId: string;
  policyType: InsurancePolicyType;
  policyNumber: string;
  insurerName: string;
  expiryDate: string;
  uploadDate: string;
  responsibleParty: string;
}

// ─── Adapter Interface ────────────────────────────────────────────────────────

export interface InsuranceDocumentsAdapter {
  write(payload: DocumentsAdapterPayload): Promise<IntegrationWriteResult>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates an Insurance Register → Documents adapter.
 *
 * Maps policy document uploads to DocumentsWritePayload with document type
 * "insurance certificate". On failure, the platform integration service
 * handles retry queue enqueuing automatically.
 */
export function createDocumentsAdapter(
  platformIntegration: PlatformIntegrationService,
): InsuranceDocumentsAdapter {
  return {
    async write(payload: DocumentsAdapterPayload): Promise<IntegrationWriteResult> {
      const documentsPayload: DocumentsWritePayload = {
        projectId: payload.projectId,
        documentType: 'insurance certificate',
        sourceModule: 'insurance-register',
        linkedRecordRef: payload.policyId,
        uploadDate: payload.uploadDate,
        responsibleParty: payload.responsibleParty,
        metadata: {
          policyType: payload.policyType,
          policyNumber: payload.policyNumber,
          insurerName: payload.insurerName,
          expiryDate: payload.expiryDate,
        },
      };

      return platformIntegration.writeToDocuments(documentsPayload);
    },
  };
}
