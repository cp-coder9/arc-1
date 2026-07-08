/**
 * Project Command Centre — Compliance Hub & Finance Module Integration
 *
 * Integration adapters for NHBRC inspections, municipal checklists,
 * payment workflows, and retention rules. These are interface adapters
 * designed for future wiring to external services.
 *
 * @module commandCentre/complianceFinanceIntegrationService
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface InspectionRegistration {
  projectId: string;
  milestoneId: string;
  nhbrcStage?: number;
  registeredAt: string;
  documentationReady: boolean;
  requiredDocuments: string[];
}

export interface MunicipalChecklist {
  projectId: string;
  milestoneId: string;
  municipality?: string;
  items: Array<{
    id: string;
    description: string;
    required: boolean;
    status: 'pending' | 'submitted' | 'approved' | 'rejected';
  }>;
}

export interface PaymentWorkflowResult {
  projectId: string;
  certificateId: string;
  workflowType: 'escrow_release' | 'direct_payment';
  status: 'pending_approval' | 'processing' | 'failed';
  triggeredAt: string;
}

export interface RetentionRules {
  projectId: string;
  retentionPercent: number;
  releaseConditions: string[];
  paymentTermsDays: number;
}

// ── NHBRC Inspection Registration ────────────────────────────────────────────

/**
 * Registers an NHBRC inspection with the Compliance Hub.
 * Tracks documentation readiness for the inspection milestone.
 *
 * Integration adapter: returns a registration record. Actual Compliance Hub
 * API integration will be wired in a future release.
 */
export async function registerNHBRCInspection(
  projectId: string,
  milestoneId: string,
  nhbrcStage?: number,
): Promise<InspectionRegistration> {
  // Stage-specific required documents
  const stageDocuments: Record<number, string[]> = {
    1: ['Foundation plan', 'Soil test report', 'Engineer certificate'],
    2: ['Wall construction report', 'DPC certificate'],
    3: ['Roof structure certificate', 'Truss manufacturer warranty'],
    4: ['Plumbing compliance certificate', 'Water pressure test report'],
    5: ['Electrical compliance certificate (CoC)', 'Earth leakage test'],
    6: ['Plastering inspection report', 'Waterproofing certificate'],
    7: ['Occupation certificate application', 'Final inspection checklist', 'As-built drawings'],
  };

  const requiredDocuments = nhbrcStage
    ? stageDocuments[nhbrcStage] ?? ['General inspection documentation']
    : ['General inspection documentation'];

  const registration: InspectionRegistration = {
    projectId,
    milestoneId,
    nhbrcStage,
    registeredAt: new Date().toISOString(),
    documentationReady: false,
    requiredDocuments,
  };

  return registration;
}

// ── Municipal Submission Checklist ───────────────────────────────────────────

/**
 * Retrieves the municipal submission checklist from the Compliance Hub.
 * Returns a structured checklist for the given milestone.
 *
 * Integration adapter: returns a standard checklist structure.
 */
export async function surfaceMunicipalChecklist(
  projectId: string,
  milestoneId: string,
  municipality?: string,
): Promise<MunicipalChecklist> {
  // Standard municipal submission items
  const standardItems = [
    { id: 'site_plan', description: 'Approved site development plan', required: true, status: 'pending' as const },
    { id: 'building_plans', description: 'Approved building plans (A1 format)', required: true, status: 'pending' as const },
    { id: 'title_deed', description: 'Title deed or consent from owner', required: true, status: 'pending' as const },
    { id: 'zoning_cert', description: 'Zoning certificate or land use rights', required: true, status: 'pending' as const },
    { id: 'engineers_cert', description: 'Structural engineer certificate', required: true, status: 'pending' as const },
    { id: 'energy_cert', description: 'SANS 10400-XA energy compliance', required: false, status: 'pending' as const },
    { id: 'fire_cert', description: 'Fire protection plan (if applicable)', required: false, status: 'pending' as const },
    { id: 'nhr_registration', description: 'NHBRC enrolment certificate', required: true, status: 'pending' as const },
  ];

  return {
    projectId,
    milestoneId,
    municipality,
    items: standardItems,
  };
}

// ── Payment Workflow Trigger ─────────────────────────────────────────────────

/**
 * Triggers the payment workflow in the Finance Module for a certified payment
 * certificate. Determines whether to release from escrow or process direct payment.
 *
 * FAIL-CLOSED: In production, this returns status 'pending_approval' (not 'triggered')
 * to indicate the workflow has been queued but not yet executed. The Finance Module
 * must explicitly confirm the release. If the Finance Module is unavailable, returns
 * status 'failed' rather than a false positive.
 *
 * Integration adapter: returns workflow trigger result.
 */
export async function triggerPaymentWorkflow(
  projectId: string,
  certificateId: string,
  workflowType: 'escrow_release' | 'direct_payment' = 'escrow_release',
): Promise<PaymentWorkflowResult> {
  // In production, attempt to call the Finance Module API
  if (process.env.NODE_ENV === 'production') {
    try {
      // Import finance router service for actual escrow release
      const { adminDb } = await import('@/lib/firebase-admin');
      
      // Queue the payment workflow request in Firestore for the Finance Module to process
      await adminDb.collection('payment_workflow_queue').add({
        projectId,
        certificateId,
        workflowType,
        status: 'pending_approval',
        queuedAt: new Date().toISOString(),
      });

      return {
        projectId,
        certificateId,
        workflowType,
        status: 'pending_approval',
        triggeredAt: new Date().toISOString(),
      };
    } catch {
      // Finance Module unavailable — fail closed
      return {
        projectId,
        certificateId,
        workflowType,
        status: 'failed',
        triggeredAt: new Date().toISOString(),
      };
    }
  }

  // Dev/demo mode: return pending_approval (not a false 'triggered')
  return {
    projectId,
    certificateId,
    workflowType,
    status: 'pending_approval',
    triggeredAt: new Date().toISOString(),
  };
}

// ── Retention Rules ──────────────────────────────────────────────────────────

/**
 * Reads retention percentage and payment terms from the Finance Module config.
 * Returns default South African construction contract retention rules.
 *
 * Integration adapter: returns default rules until Finance Module API is wired.
 */
export async function readRetentionRules(
  projectId: string,
): Promise<RetentionRules> {
  // Default SA construction retention rules (JBCC standard)
  return {
    projectId,
    retentionPercent: 5,
    releaseConditions: [
      'Practical completion certificate issued',
      'Final account agreed',
      'Defects liability period expired (typically 90 days)',
      'All snags rectified and signed off',
    ],
    paymentTermsDays: 30,
  };
}

// ── Service Export ───────────────────────────────────────────────────────────

export const complianceFinanceIntegrationService = {
  registerNHBRCInspection,
  surfaceMunicipalChecklist,
  triggerPaymentWorkflow,
  readRetentionRules,
};

export default complianceFinanceIntegrationService;
