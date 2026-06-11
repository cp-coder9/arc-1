export type ArchitexUserRole =
  | 'client'
  | 'developer'
  | 'architect'
  | 'bep'
  | 'engineer'
  | 'quantity_surveyor'
  | 'town_planner'
  | 'contractor'
  | 'subcontractor'
  | 'supplier'
  | 'freelancer_candidate_professional'
  | 'site_manager'
  | 'firm_admin'
  | 'platform_admin';

/** Alias expected by services written against the original naming convention. */
export type ArchitexComprehensiveRole = ArchitexUserRole;

export type ArchitexWorkflowPhase =
  | 'lead'
  | 'brief_feasibility'
  | 'proposal_appointment'
  | 'design_coordination'
  | 'municipal_submission'
  | 'tender_procurement'
  | 'construction_execution'
  | 'payments_commercial_control'
  | 'closeout'
  | 'operations_post_occupancy';

export type ToolCategory =
  | 'briefing'
  | 'proposal'
  | 'compliance'
  | 'drawing_ai_review'
  | 'document_control'
  | 'project_management'
  | 'tendering'
  | 'estimating_quantities'
  | 'procurement'
  | 'commercial_control'
  | 'site_management'
  | 'workforce'
  | 'plant_equipment'
  | 'supplier_portal'
  | 'resource_marketplace'
  | 'resource_planning'
  | 'finance_payments'
  | 'closeout'
  | 'governance';

export type ToolExportTarget =
  | 'task'
  | 'tender_line'
  | 'bid_line'
  | 'bom_item'
  | 'boq_item'
  | 'editable_quote'
  | 'programme_activity'
  | 'cashflow_item'
  | 'drawdown_schedule'
  | 'rfq'
  | 'purchase_order'
  | 'goods_received_note'
  | 'site_log'
  | 'rfi'
  | 'variation'
  | 'payment_valuation'
  | 'invoice'
  | 'escrow_release'
  | 'compliance_report'
  | 'snag_item'
  | 'resource_listing'
  | 'resource_booking'
  | 'closeout_pack';

export interface ToolContext {
  projectId?: string;
  jobId?: string;
  tenderPackageId?: string;
  bidId?: string;
  userId: string;
  role: ArchitexUserRole;
  phase: ArchitexWorkflowPhase;
  municipality?: string;
  discipline?: string;
  trade?: string;
  packageId?: string;
  costCode?: string;
  locationZone?: string;
  sourceReferences?: string[];
}

export interface ToolDefinition {
  id: string;
  label: string;
  category: ToolCategory;
  description: string;
  roles: ArchitexUserRole[];
  phases: ArchitexWorkflowPhase[];
  exportTargets: ToolExportTarget[];
  benchmarkInspiration?: string[];
  existingArchitexHooks?: string[];
  requiresHumanApproval?: boolean;
  southAfricanContext?: string[];
}

export interface ToolRecommendation {
  id: string;
  toolId: string;
  score: number;
  agentId: string;
  reason: string;
  nextAction: string;
  exportTargets: ToolExportTarget[];
  requiresHumanApproval: boolean;
}

export interface ToolRunEnvelope<TPayload extends object = Record<string, unknown>> {
  id: string;
  toolId: string;
  context: ToolContext;
  payload: TPayload;
  sourceSnapshot: {
    drawingRevisions?: string[];
    drawingFormats?: Array<'pdf' | 'scan_image' | 'dwg' | 'dxf' | 'ifc' | 'revit_export' | 'schedule' | 'spreadsheet'>;
    extractionConfidence?: number;
    documentIds?: string[];
    assumptions?: string[];
    benchmarkPattern?: string;
  };
  approvalState: 'draft' | 'needs_review' | 'approved' | 'rejected' | 'exported';
  exportTargets: ToolExportTarget[];
  createdAt: string;
}

export interface StaffActivityLogPayload {
  workerId: string;
  workerName: string;
  date: string;
  startTime: string;
  endTime: string;
  activity: string;
  costCode: string;
  locationZone?: string;
  quantityCompleted?: number;
  unit?: string;
  gpsConfirmed?: boolean;
  photoRefs?: string[];
}

export interface PlantAllocationPayload {
  assetId: string;
  assetLabel: string;
  date: string;
  projectId: string;
  costCode: string;
  hoursUsed: number;
  internalHireRatePerHour?: number;
  fuelLitres?: number;
  operatorId?: string;
  maintenanceFlag?: boolean;
}

export interface ProcurementPackagePayload {
  packageId: string;
  title: string;
  costCode: string;
  items: Array<{ description: string; quantity: number; unit: string; targetRate?: number }>;
  invitedSuppliersOrSubcontractors: string[];
  requiredByDate?: string;
  complianceDocumentsRequired?: string[];
}


export interface DrawingComplianceCheckPayload {
  sourceDocumentIds: string[];
  sourceFormats: Array<'pdf' | 'scan_image' | 'dwg' | 'dxf' | 'ifc' | 'revit_export' | 'schedule' | 'spreadsheet'>;
  drawingRevision?: string;
  extractedFacts: Array<{ key: string; value: string | number | boolean; confidence: number; sourceRef?: string }>;
  checks: Array<{ ruleSet: 'SANS_10400' | 'land_use_scheme' | 'municipal_specific' | 'NHBRC' | 'other'; finding: string; severity: 'info' | 'warning' | 'fail'; requiresHumanReview: boolean }>;
}

export interface BomBoqQuotePayload {
  sourceExtractionId?: string;
  items: Array<{ description: string; quantity: number; unit: string; confidence?: number; editable: true; programmeActivityId?: string; drawdownMilestoneId?: string; reviewerNote?: string }>;
  reviewerRole: 'contractor' | 'subcontractor' | 'quantity_surveyor' | 'architect' | 'bep';
  reviewStatus: 'draft_ai_populated' | 'under_review' | 'qualified' | 'approved_for_pricing';
}

export interface SnagItemPayload {
  snagId: string;
  locationZone: string;
  description: string;
  responsiblePartyId?: string;
  photoRefs?: string[];
  status: 'open' | 'allocated' | 'ready_for_reinspection' | 'closed' | 'rejected';
  inspectedByRole: 'architect' | 'bep' | 'site_manager' | 'contractor';
  reinspectionDueDate?: string;
}

export interface ResourceMarketplaceListingPayload {
  listingId: string;
  providerId: string;
  listingType: 'freelancer_service' | 'candidate_professional_capacity' | 'staff_capacity' | 'equipment' | 'software_seat' | 'template_pack' | 'desktop_service';
  disciplineOrCategory: string;
  availabilityWindow?: string;
  rateBasis: 'hourly' | 'daily' | 'fixed_fee' | 'per_item' | 'monthly';
  requiresRegisteredProfessionalSignoff?: boolean;
}
