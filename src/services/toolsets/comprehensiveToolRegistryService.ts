import type { ArchitexUserRole, ArchitexWorkflowPhase, ToolContext, ToolDefinition, ToolRecommendation } from '@/types/comprehensiveToolsets';

export const COMPREHENSIVE_TOOL_REGISTRY: ToolDefinition[] = [
  {
    id: 'brief_builder',
    label: 'Project Brief Builder',
    category: 'briefing',
    description: 'Captures client goals, site context, budget, constraints, documents and decision-makers.',
    roles: ['client', 'developer', 'architect'],
    phases: ['lead', 'brief_feasibility'],
    exportTargets: ['task', 'rfi'],
    benchmarkInspiration: ['ClickUp forms/docs', 'Architex current Client/Architect dashboards'],
    existingArchitexHooks: ['ClientDashboard', 'ArchitectDashboard', 'projectLifecycleService'],
    southAfricanContext: ['site/property data', 'municipal area', 'zoning/land-use assumptions'],
  },
  {
    id: 'document_control_register',
    label: 'Drawing & Document Control Register',
    category: 'document_control',
    description: 'Revision-controlled drawings, transmittals, approvals, distribution matrix and audit history.',
    roles: ['architect', 'bep', 'engineer', 'contractor', 'site_manager', 'firm_admin'],
    phases: ['design_coordination', 'municipal_submission', 'tender_procurement', 'construction_execution', 'closeout'],
    exportTargets: ['task', 'rfi', 'compliance_report', 'closeout_pack'],
    benchmarkInspiration: ['Procore/ACC/PlanGrid document control'],
    existingArchitexHooks: ['FileManager', 'uploadService', 'RFIManager'],
    requiresHumanApproval: true,
    southAfricanContext: ['council submission issue set', 'construction issue set', 'as-built closeout set'],
  },
  {
    id: 'tender_bid_workbench',
    label: 'Tender / Bid Workbench',
    category: 'tendering',
    description: 'Prepares BOQs, rate build-ups, supplier/subcontract RFQs, bid methodology and exclusions.',
    roles: ['architect', 'contractor', 'subcontractor', 'supplier', 'quantity_surveyor'],
    phases: ['tender_procurement'],
    exportTargets: ['tender_line', 'bid_line', 'boq_item', 'rfq'],
    benchmarkInspiration: ['RIB Candy', 'BuildSmart', 'GoBuild360', 'current Architex TenderWizard/BidSubmission'],
    existingArchitexHooks: ['TenderWizard', 'BidSubmission', 'BidEvaluation', 'tenderService', 'bidComparisonService'],
    southAfricanContext: ['CIDB eligibility', 'VAT', 'B-BBEE/tax/vendor compliance where applicable'],
  },
  {
    id: 'supplier_rfq_order_portal',
    label: 'Supplier RFQ / Order / Delivery Portal',
    category: 'supplier_portal',
    description: 'Converts calculator/takeoff outputs into supplier RFQs, orders, delivery schedules, PODs and invoice matching.',
    roles: ['contractor', 'subcontractor', 'supplier', 'quantity_surveyor'],
    phases: ['tender_procurement', 'construction_execution', 'payments_commercial_control'],
    exportTargets: ['rfq', 'purchase_order', 'goods_received_note', 'invoice', 'payment_valuation'],
    benchmarkInspiration: ['GoBuild360 material portal', 'BuildSmart procurement'],
    existingArchitexHooks: ['tenderService', 'constructionService', 'InvoiceManagement'],
    southAfricanContext: ['delivery notes', 'VAT invoices', 'materials on site', 'supplier lead times'],
  },
  {
    id: 'site_diary_resource_log',
    label: 'Site Diary + Labour/Plant/Delivery Log',
    category: 'site_management',
    description: 'Captures weather, labour, plant, deliveries, photos, work activities, delays and daily progress by zone/cost code.',
    roles: ['contractor', 'subcontractor', 'site_manager', 'architect'],
    phases: ['construction_execution', 'payments_commercial_control'],
    exportTargets: ['site_log', 'variation', 'payment_valuation', 'rfi'],
    benchmarkInspiration: ['Fieldwire/Procore daily logs', 'AllWage activity tracking', 'BuildSmart plant costing'],
    existingArchitexHooks: ['SiteLogManager', 'constructionService', 'GanttChart'],
    southAfricanContext: ['site diaries as claim evidence', 'weather delays', 'subcontractor attendance'],
  },
  {
    id: 'workforce_attendance_timesheet',
    label: 'Workforce Attendance / Timesheet / Payroll Export',
    category: 'workforce',
    description: 'Tracks worker attendance and activity against project, cost code, trade and zone, then exports to payroll.',
    roles: ['contractor', 'subcontractor', 'site_manager', 'firm_admin'],
    phases: ['construction_execution', 'payments_commercial_control'],
    exportTargets: ['site_log', 'payment_valuation'],
    benchmarkInspiration: ['AllWage', 'Clockify/Deputy/Tanda patterns'],
    existingArchitexHooks: ['constructionService', 'financialLedgerService'],
    southAfricanContext: ['PAYE/UIF/SDL export integration', 'public holidays', 'union/provident fund fields where needed'],
  },
  {
    id: 'plant_equipment_manager',
    label: 'Plant / Equipment / Tools Manager',
    category: 'plant_equipment',
    description: 'Manages asset register, allocation, internal hire rates, utilisation, fuel, service reminders and certificates.',
    roles: ['contractor', 'subcontractor', 'site_manager', 'firm_admin'],
    phases: ['tender_procurement', 'construction_execution', 'payments_commercial_control', 'closeout'],
    exportTargets: ['site_log', 'variation', 'payment_valuation'],
    benchmarkInspiration: ['Hilti ON!Track', 'BuildSmart plant', 'Tenna/ToolWatch-style asset systems'],
    existingArchitexHooks: ['constructionService', 'financialLedgerService'],
    southAfricanContext: ['plant hire rates', 'operator logs', 'service certificates', 'site allocation'],
  },
  {
    id: 'practice_resource_profitability',
    label: 'Practice Resource & Profitability Planner',
    category: 'resource_planning',
    description: 'Plans staff capacity, timesheets, expenses, stage budgets, WIP and project profitability for professional firms.',
    roles: ['architect', 'bep', 'engineer', 'quantity_surveyor', 'town_planner', 'firm_admin'],
    phases: ['proposal_appointment', 'design_coordination', 'municipal_submission', 'tender_procurement', 'closeout'],
    exportTargets: ['invoice', 'task'],
    benchmarkInspiration: ['Fresh Projects resource planning/profitability', 'ClickUp workload'],
    existingArchitexHooks: ['FirmDashboard', 'teamService', 'InvoiceManagement', 'feeEstimatorService'],
    southAfricanContext: ['SACAP/SAIA work stages', 'professional fee stages', 'VAT/accounting integrations'],
  },

  {
    id: 'ai_drawing_compliance_reader',
    label: 'AI Drawing Reader + Compliance Pre-check',
    category: 'drawing_ai_review',
    description: 'Reads PDFs, scans, DWG/DXF, IFC/BIM/Revit-derived exports and schedules to extract project facts, then pre-checks SANS/NBR, land-use and municipality-specific compliance.',
    roles: ['architect', 'bep', 'engineer', 'quantity_surveyor', 'town_planner', 'contractor', 'freelancer_candidate_professional'],
    phases: ['brief_feasibility', 'design_coordination', 'municipal_submission', 'tender_procurement'],
    exportTargets: ['compliance_report', 'rfi', 'task', 'boq_item'],
    benchmarkInspiration: ['Fencalc compliance reporting', 'ACC/PlanGrid drawing review', 'AI drawing extraction patterns'],
    existingArchitexHooks: ['FileManager', 'knowledgeService', 'councilSubmissionService', 'ComplianceReport'],
    requiresHumanApproval: true,
    southAfricanContext: ['SANS 10400', 'NBR', 'municipal submission rules', 'land-use scheme checks', 'professional sign-off'],
  },
  {
    id: 'bom_boq_programme_drawdown_builder',
    label: 'AI BoM/BoQ + Editable Quote + Programme Drawdown Builder',
    category: 'estimating_quantities',
    description: 'Converts drawing/model/schedule extraction into pre-populated BoM and BoQ items for contractor, subcontractor and QS review, then links editable quotes to programme activities, cashflow and drawdown/payment schedules.',
    roles: ['contractor', 'subcontractor', 'quantity_surveyor', 'architect', 'developer'],
    phases: ['tender_procurement', 'construction_execution', 'payments_commercial_control'],
    exportTargets: ['bom_item', 'boq_item', 'editable_quote', 'programme_activity', 'cashflow_item', 'drawdown_schedule', 'rfq', 'payment_valuation'],
    benchmarkInspiration: ['GoBuild360 BoM/material ordering', 'RIB Candy estimating', 'BuildSmart cost controls'],
    existingArchitexHooks: ['TenderWizard', 'BidSubmission', 'BidEvaluation', 'GanttChart', 'paymentService'],
    requiresHumanApproval: true,
    southAfricanContext: ['QS review', 'contractor qualifications/exclusions', 'VAT', 'retention', 'drawdown schedules', 'payment certificates'],
  },
  {
    id: 'lead_consultant_snag_walk',
    label: 'Architect / Lead Consultant Snag Walk',
    category: 'site_management',
    description: 'Captures snag/punch-list items with photos, locations, responsible party, due dates, re-inspection status and closeout evidence for architect/lead-consultant site inspections.',
    roles: ['architect', 'bep', 'site_manager', 'contractor', 'developer', 'client'],
    phases: ['construction_execution', 'closeout', 'operations_post_occupancy'],
    exportTargets: ['snag_item', 'task', 'site_log', 'closeout_pack', 'payment_valuation'],
    benchmarkInspiration: ['Procore/Fieldwire punch lists', 'ACC issues/snags'],
    existingArchitexHooks: ['SiteLogManager', 'constructionService', 'CloseoutWizard'],
    requiresHumanApproval: true,
    southAfricanContext: ['practical completion', 'defects liability', 'occupation/handover records'],
  },
  {
    id: 'resource_sharing_freelancer_centre',
    label: 'Resource Sharing Centre + Freelancer Workflow',
    category: 'resource_marketplace',
    description: 'Vetted marketplace for candidate professionals/freelancers and shared resources such as staff capacity, drafting/rendering services, specialist reviews, equipment, software seats, templates and desktop-service-style resources.',
    roles: ['architect', 'bep', 'engineer', 'quantity_surveyor', 'town_planner', 'freelancer_candidate_professional', 'firm_admin', 'platform_admin'],
    phases: ['lead', 'brief_feasibility', 'proposal_appointment', 'design_coordination', 'municipal_submission', 'tender_procurement', 'construction_execution', 'closeout'],
    exportTargets: ['resource_listing', 'resource_booking', 'task', 'invoice'],
    benchmarkInspiration: ['Fresh Projects capacity planning', 'marketplace/resource booking systems', 'Tenna-style asset utilisation patterns'],
    existingArchitexHooks: ['FirmDashboard', 'teamService', 'permissionService', 'InvoiceManagement'],
    requiresHumanApproval: true,
    southAfricanContext: ['candidate professional supervision', 'professional registration verification', 'PI/insurance where applicable', 'BEP role categories'],
  },
  {
    id: 'payment_valuation_escrow',
    label: 'Payment Valuation / Certificate / Escrow Release',
    category: 'finance_payments',
    description: 'Turns approved progress, invoices, retention, platform fee and release conditions into transparent payment records.',
    roles: ['client', 'developer', 'architect', 'quantity_surveyor', 'contractor', 'subcontractor', 'supplier', 'firm_admin'],
    phases: ['payments_commercial_control', 'construction_execution', 'closeout'],
    exportTargets: ['payment_valuation', 'invoice', 'escrow_release'],
    benchmarkInspiration: ['BuildSmart subcontractor/payment controls', 'Architex escrow/payment service'],
    existingArchitexHooks: ['paymentService', 'financialLedgerService', 'InvoiceManagement'],
    requiresHumanApproval: true,
    southAfricanContext: ['VAT', 'retention', 'payment certificates', '0.5% payer/payee Architex platform fee split'],
  },
  {
    id: 'closeout_handover_pack',
    label: 'Closeout / Handover Pack Builder',
    category: 'closeout',
    description: 'Builds snag, defects, as-built, O&M, warranties, certificates, final account and occupation/handover records.',
    roles: ['client', 'developer', 'architect', 'bep', 'contractor', 'subcontractor', 'supplier', 'site_manager'],
    phases: ['closeout', 'operations_post_occupancy'],
    exportTargets: ['closeout_pack', 'payment_valuation'],
    benchmarkInspiration: ['Procore/ACC closeout', 'Buildertrend client handover patterns'],
    existingArchitexHooks: ['CloseoutWizard', 'closeoutService', 'FileManager'],
    requiresHumanApproval: true,
    southAfricanContext: ['occupation certificates', 'NHBRC/COC where applicable', 'defects liability', 'warranties'],
  },
];

export function getToolsForContext(context: ToolContext): ToolDefinition[] {
  return COMPREHENSIVE_TOOL_REGISTRY.filter((tool) => tool.roles.includes(context.role) && tool.phases.includes(context.phase));
}

export function getToolById(toolId: string): ToolDefinition | undefined {
  return COMPREHENSIVE_TOOL_REGISTRY.find((tool) => tool.id === toolId);
}

export function recommendTools(context: ToolContext, naturalLanguageNeed: string): ToolRecommendation[] {
  const text = naturalLanguageNeed.toLowerCase();
  const available = getToolsForContext(context);
  return available.map((tool) => {
    let score = 10;
    const haystack = `${tool.label} ${tool.description} ${tool.category} ${tool.exportTargets.join(' ')}`.toLowerCase();
    for (const token of text.split(/\W+/).filter(Boolean)) {
      if (haystack.includes(token)) score += 6;
    }
    if (/drawing|plan|pdf|dwg|dxf|ifc|revit|compliance|sans|nbr|municipal|zoning|land use/.test(text) && tool.category === 'drawing_ai_review') score += 30;
    if (/tender|bid|boq|bom|quote|rate|takeoff|quantity|drawdown|programme|cashflow/.test(text) && (tool.category === 'tendering' || tool.category === 'estimating_quantities')) score += 25;
    if (/supplier|order|delivery|po|grn|material/.test(text) && tool.category === 'supplier_portal') score += 25;
    if (/site|diary|photo|daily|progress|delay/.test(text) && tool.category === 'site_management') score += 25;
    if (/labour|worker|attendance|timesheet|payroll/.test(text) && tool.category === 'workforce') score += 25;
    if (/plant|equipment|tool|fuel|asset/.test(text) && tool.category === 'plant_equipment') score += 25;
    if (/snag|defect|punch|inspection|reinspection|closeout/.test(text) && tool.id === 'lead_consultant_snag_walk') score += 30;
    if (/freelancer|candidate|resource|capacity|shared|equipment|desktop service|marketplace/.test(text) && tool.category === 'resource_marketplace') score += 30;
    if (/payment|claim|certificate|invoice|escrow|retention|drawdown/.test(text) && tool.category === 'finance_payments') score += 25;
    return {
      id: `${tool.id}_${score}`,
      toolId: tool.id,
      score,
      agentId: 'tool_router_agent',
      reason: `Matched ${tool.label} for role ${context.role} in phase ${context.phase}.`,
      nextAction: `Open ${tool.label} with project context prefilled and save a versioned tool run before export.`,
      exportTargets: tool.exportTargets,
      requiresHumanApproval: Boolean(tool.requiresHumanApproval),
    };
  }).filter((item) => item.score >= 16).sort((a, b) => b.score - a.score).slice(0, 5);
}

export function phaseToolSummary(role: ArchitexUserRole): Record<ArchitexWorkflowPhase, string[]> {
  const phases: ArchitexWorkflowPhase[] = ['lead','brief_feasibility','proposal_appointment','design_coordination','municipal_submission','tender_procurement','construction_execution','payments_commercial_control','closeout','operations_post_occupancy'];
  return Object.fromEntries(phases.map((phase) => [phase, getToolsForContext({ userId: 'summary', role, phase }).map((tool) => tool.id)])) as Record<ArchitexWorkflowPhase, string[]>;
}
