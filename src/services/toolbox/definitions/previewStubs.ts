// Preview stub definitions — Task 13 coverage sweep
//
// Every tool that does NOT yet have a full `CalculatorDefinition` must not be a silent
// placeholder. This file registers a minimal `status: 'preview'` stub for each of those 50
// tools so the UI can display an explicit "Preview" badge and no tool is silently thin.
//
// Design reference: design.md "status: 'preview' is the explicit escape hatch".
// Requirements: 8.1 (each of the 54 tools mapped to a typed definition), 8.2 (preview
// label rather than silent placeholder), 8.3 (every listed tool runs to standard or shows
// preview label).
//
// When a group conversion task promotes a tool to full depth, delete its stub from here and
// register its real definition in the appropriate group file.

import { z } from 'zod'
import type { CalculationResult, CalculatorDefinition } from '@/services/toolbox/types'
import { registerCalculatorDefinition } from './definitionRegistry'

// ---------------------------------------------------------------------------
// Shared no-op compute + schema for every preview stub
// ---------------------------------------------------------------------------

const previewInputSchema = z.object({})

function previewCompute(): CalculationResult {
  return {
    lineResults: [],
    aggregates: {},
    clauseResults: [],
    sourceVersions: [],
    disclaimers: ['This tool is in preview — full calculation depth is coming soon.'],
    warnings: [],
  }
}

function stub(id: string, toolId: string, title: string): CalculatorDefinition {
  return registerCalculatorDefinition({
    id,
    toolId,
    title,
    method: 'hybrid',
    inputSchema: previewInputSchema,
    tableRefs: [],
    compute: previewCompute,
    reportTemplateId: 'default',
    source: { guideline: 'Pending', version: '0', status: 'indicative' },
    disclaimers: ['This tool is in preview — full calculation depth is coming soon.'],
    status: 'preview',
  })
}

// ---------------------------------------------------------------------------
// Fee calculators (Task 8 — partially in-progress)
// fee_calculator_v1 promoted to full definition in feeCalculator.ts
// soft_cost_estimator_v1 promoted to full definition in softCostEstimator.ts
// feasibility_estimator_v1 promoted to full definition in feasibilityEstimator.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Compliance & drawing tools (Task 9) — PROMOTED to full definitions:
//   fire_compliance_check_v1 → fireComplianceCheck.ts
//   fire_rational_design_v1 → fireRationalDesign.ts
//   zoning_check_v1 → zoningCheck.ts
//   sans_forms_v1 → sansForms.ts
//   ai_drawing_checker_v1 → aiDrawingChecker.ts
//   cad_upload_check_v1 → cadUploadCheck.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Construction & commercial tools (Task 10)
// boq_takeoff_v1 promoted to full definition in boqTakeoff.ts
// material_procurement_v1 promoted to full definition in materialProcurement.ts
// valuation_cert_v1 promoted to full definition in valuationCert.ts
// payment_claim_builder_v1 promoted to full definition in paymentClaimBuilder.ts
// workforce_timesheet_v1 promoted to full definition in workforceTimesheet.ts
// plant_register_v1 promoted to full definition in plantRegister.ts
// site_diary_entry_v1 promoted to full definition in siteDiaryEntry.ts
// hs_compliance_v1 promoted to full definition in hsCompliance.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Document-control & governance tools (Task 11) — PROMOTED to full definitions:
//   drawing_register_v1 → drawingRegister.ts
//   doc_control_issue_v1 → docControlIssue.ts
//   shop_drawing_submission_v1 → shopDrawingSubmission.ts
//   firm_document_register_v1 → firmDocumentRegister.ts
//   proposal_comparison_v1 → proposalComparison.ts
//   stage_gate_review_v1 → stageGateReview.ts
//   cpd_standalone_v1 → cpdStandalone.ts
//   staff_cpd_tracker_v1 → staffCpdTracker.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Admin / platform tools (Task 12) — PROMOTED to full definitions:
//   fee_tariff_editor_v1 → feeTariffEditor.ts
//   payment_rate_config_v1 → paymentRateConfig.ts
//   admin_governance_v1 → adminGovernance.ts
//   audit_trail_viewer_v1 → auditTrailViewer.ts
//   user_verification_console_v1 → userVerificationConsole.ts
//   platform_settings_v1 → platformSettings.ts
//   system_health_monitor_v1 → systemHealthMonitor.ts
//   ai_review_queue_v1 → aiReviewQueue.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// General / briefing / misc tools
// ---------------------------------------------------------------------------

export const technicalBriefPreview = stub('technical_brief_v1', 'technical_brief', 'Technical Brief Editor (Standalone)')
export const briefWizardPreview = stub('brief_wizard_v1', 'brief_wizard', 'Guided Brief Wizard (Standalone)')
export const progressViewerPreview = stub('progress_viewer_v1', 'progress_viewer', 'Progress Report Viewer')
export const paymentDashboardPreview = stub('payment_dashboard_v1', 'payment_dashboard', 'Payment Status Dashboard')
export const rfiGeneratorPreview = stub('rfi_generator_v1', 'rfi_generator', 'RFI / Site Instruction Generator')
export const snagCreatorPreview = stub('snag_creator_v1', 'snag_creator', 'Snag List Creator')
// tender_bid_bench_v1 promoted to full — see tenderBidBench.ts
export const snagEvidenceUploadPreview = stub('snag_evidence_upload_v1', 'snag_evidence_upload', 'Snag / Closeout Evidence Upload')
export const rfiResponsePreview = stub('rfi_response_v1', 'rfi_response', 'RFI / Site Instruction Response')
export const packageScopeViewerPreview = stub('package_scope_viewer_v1', 'package_scope_viewer', 'Package Scope Viewer')
export const catalogueManagerPreview = stub('catalogue_manager_v1', 'catalogue_manager', 'Catalogue / Product Data Manager')
export const quoteResponsePreview = stub('quote_response_v1', 'quote_response', 'Quote Response Form')
export const deliveryNotePreview = stub('delivery_note_v1', 'delivery_note', 'Delivery Note Builder')
export const warrantyUploadPreview = stub('warranty_upload_v1', 'warranty_upload', 'Warranty Certificate Uploader')
export const freelancerTimesheetPreview = stub('freelancer_timesheet_v1', 'freelancer_timesheet', 'Timesheet / Claim Builder')
export const deliverableSubmissionPreview = stub('deliverable_submission_v1', 'deliverable_submission', 'Deliverable Submission with Sign-off')
export const freelancerResourceCentrePreview = stub('freelancer_resource_centre_v1', 'freelancer_resource_centre', 'Resource Centre / Checklists')
