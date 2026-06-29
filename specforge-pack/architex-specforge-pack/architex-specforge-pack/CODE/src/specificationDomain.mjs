export const ROLES = [
  'client','developer','architect','bep','freelancer','engineer','quantity_surveyor','energy_professional','fire_engineer','contractor','subcontractor','supplier','site_manager','admin','platform_admin'
];

export const SPEC_STATUSES = ['draft','needs_decision','approved','issued','rfq','ordered','delivered','installed','as_built','superseded'];

export const ROLE_CAPABILITIES = {
  client: ['view_client_items','comment','approve_client_decision'],
  developer: ['view_client_items','comment','approve_client_decision','view_budget_summary'],
  architect: ['view_all','edit_spec','issue_spec','approve_substitution','confirm_responsibility','assign_roles'],
  bep: ['view_all','edit_spec','issue_spec','approve_substitution','confirm_responsibility','assign_roles'],
  freelancer: ['view_assigned','edit_assigned_draft','submit_for_review'],
  engineer: ['view_assigned','edit_assigned_draft','confirm_responsibility','approve_technical_section'],
  energy_professional: ['view_assigned','edit_assigned_draft','confirm_responsibility','approve_technical_section'],
  fire_engineer: ['view_assigned','edit_assigned_draft','confirm_responsibility','approve_technical_section'],
  quantity_surveyor: ['view_all','review_budget','flag_cost_delta','export_cost_schedule'],
  contractor: ['view_issued','request_clarification','request_substitution','price_package','update_procurement_status'],
  subcontractor: ['view_package','submit_shop_drawing','request_substitution','update_installed_status'],
  supplier: ['view_package','quote_item','confirm_lead_time','upload_warranty','suggest_alternative'],
  site_manager: ['view_issued','update_installed_status','upload_site_evidence','flag_site_conflict'],
  admin: ['view_all','edit_templates','govern_library','override_with_audit'],
  platform_admin: ['view_all','edit_templates','govern_library','override_with_audit','manage_permissions']
};

export const SAMPLE_WORKSPACE = {
  id: 'spec-ws-demo-001',
  projectId: 'architex-demo-project-rosebank-fitout',
  projectName: 'Rosebank Mixed-Use Lobby + Office Fit-out',
  municipality: 'City of Johannesburg',
  stage: 'Design Development / Tender Prep',
  profile: 'Commercial architectural + interior FF&E',
  revision: 'P01',
  issueStatus: 'draft',
  team: [
    { userId: 'u-arch-1', name: 'Project Architect', role: 'architect', responsibility: 'Lead specification author and issuer' },
    { userId: 'u-int-1', name: 'Interior Lead', role: 'bep', responsibility: 'FF&E and finishes selections' },
    { userId: 'u-qs-1', name: 'QS Reviewer', role: 'quantity_surveyor', responsibility: 'Budget checks and cost deltas' },
    { userId: 'u-client-1', name: 'Client Rep', role: 'client', responsibility: 'Client decision approvals' },
    { userId: 'u-contractor-1', name: 'Main Contractor', role: 'contractor', responsibility: 'Pricing and constructability feedback' }
  ],
  sections: [
    { id: 'sec-finishes', code: '09', title: 'Internal Finishes', discipline: 'architecture', ownerRole: 'architect', reviewerRole: 'quantity_surveyor', status: 'draft' },
    { id: 'sec-ffe', code: '12', title: 'FF&E and Loose Furniture', discipline: 'interiors', ownerRole: 'bep', reviewerRole: 'client', status: 'needs_decision' },
    { id: 'sec-lighting', code: '26', title: 'Feature Lighting', discipline: 'electrical/interiors', ownerRole: 'bep', reviewerRole: 'engineer', status: 'draft' },
    { id: 'sec-joinery', code: '06', title: 'Custom Joinery', discipline: 'architecture/interiors', ownerRole: 'architect', reviewerRole: 'contractor', status: 'draft' }
  ],
  items: [
    {
      id: 'item-wall-tile-001', sectionId: 'sec-finishes', code: 'FIN-WT-001', title: 'Large format porcelain wall tile', room: 'Main Lobby', package: 'Finishes', discipline: 'architecture',
      image: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" fill="%23d8d2c4"/><path d="M0 80h640M0 160h640M0 240h640M0 320h640M160 0v420M320 0v420M480 0v420" stroke="%23958c7c" stroke-width="6"/><text x="44" y="220" font-size="34" fill="%233d3529">Porcelain wall tile</text></svg>',
      supplier: 'Local tile supplier', model: '600x1200 matte porcelain', finish: 'Warm limestone', dimensions: '600 x 1200mm', drawingRefs: ['A-420 lobby elevations'], clauseRefs: ['SANS/NBR finish subject to professional verification'],
      budgetAllowance: 115000, estimatedCost: 128500, leadTimeDays: 21, clientDecision: true, ownerRole: 'architect', reviewerRole: 'quantity_surveyor', approverRole: 'client', status: 'needs_decision', sourceRevision: 'P01', supersededBy: null,
      sustainability: 'Low VOC adhesive required', warranty: 'Manufacturer standard tile warranty', notes: 'Confirm slip resistance for public lobby.'
    },
    {
      id: 'item-chair-001', sectionId: 'sec-ffe', code: 'FFE-CH-001', title: 'Reception lounge chair', room: 'Reception Lounge', package: 'FF&E', discipline: 'interiors',
      image: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" fill="%23f3efe8"/><rect x="160" y="180" width="320" height="110" rx="35" fill="%2395a3a7"/><rect x="185" y="110" width="270" height="130" rx="42" fill="%237d8d92"/><rect x="195" y="285" width="30" height="80" fill="%234a4038"/><rect x="415" y="285" width="30" height="80" fill="%234a4038"/><text x="142" y="70" font-size="34" fill="%232f3538">Reception chair</text></svg>',
      supplier: 'Furniture vendor', model: 'Contract lounge chair', finish: 'Sage fabric / oak legs', dimensions: '760W x 720D x 780H', drawingRefs: ['ID-301 furniture plan'], clauseRefs: ['Fire rating to be confirmed for occupancy'],
      budgetAllowance: 48000, estimatedCost: 46500, leadTimeDays: 56, clientDecision: true, ownerRole: 'bep', reviewerRole: 'quantity_surveyor', approverRole: 'client', status: 'approved', sourceRevision: 'P01', supersededBy: null,
      sustainability: 'FSC timber preference', warranty: '5-year frame warranty requested', notes: 'Mock-up sample required before bulk order.'
    },
    {
      id: 'item-pendant-001', sectionId: 'sec-lighting', code: 'LGT-PD-001', title: 'Custom reception pendant', room: 'Reception Desk', package: 'Electrical / Lighting', discipline: 'electrical/interiors',
      image: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" fill="%230b1020"/><line x1="320" y1="0" x2="320" y2="130" stroke="%23cbd5e1" stroke-width="8"/><ellipse cx="320" cy="170" rx="150" ry="58" fill="%23fbbf24" opacity=".85"/><ellipse cx="320" cy="205" rx="220" ry="95" fill="%23f59e0b" opacity=".23"/><text x="150" y="360" font-size="34" fill="%23fff7ed">Feature pendant</text></svg>',
      supplier: 'Lighting specialist', model: 'Bespoke linear pendant', finish: 'Brushed brass / opal diffuser', dimensions: '2400L x 180W', drawingRefs: ['E-210 reflected ceiling plan','ID-405 reception detail'], clauseRefs: ['Electrical engineer approval required'],
      budgetAllowance: 72000, estimatedCost: 91000, leadTimeDays: 84, clientDecision: false, ownerRole: 'bep', reviewerRole: 'engineer', approverRole: 'architect', status: 'draft', sourceRevision: 'P01', supersededBy: null,
      sustainability: 'LED driver replaceable; warm dim preferred', warranty: '3-year driver warranty', notes: 'Long-lead warning. Coordinate ceiling support and electrical load.'
    },
    {
      id: 'item-counter-001', sectionId: 'sec-joinery', code: 'JNY-RC-001', title: 'Reception counter joinery', room: 'Reception Desk', package: 'Joinery', discipline: 'architecture/interiors',
      image: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" fill="%23e5e7eb"/><path d="M100 260 Q320 170 540 260 L500 340 Q320 280 140 340Z" fill="%236b4f3f"/><path d="M135 235 Q320 155 505 235" fill="none" stroke="%23f8fafc" stroke-width="26"/><text x="138" y="95" font-size="32" fill="%2322211f">Reception counter</text></svg>',
      supplier: 'Joinery subcontractor', model: 'Custom curved counter', finish: 'Oak veneer / solid surface top', dimensions: '4200L x 850D x 1050H', drawingRefs: ['A-550 reception counter details'], clauseRefs: ['Shop drawings required before manufacture'],
      budgetAllowance: 185000, estimatedCost: 179000, leadTimeDays: 42, clientDecision: false, ownerRole: 'architect', reviewerRole: 'contractor', approverRole: 'architect', status: 'draft', sourceRevision: 'P01', supersededBy: 'item-counter-002',
      sustainability: 'Low-formaldehyde board', warranty: '12-month defects liability minimum', notes: 'Current detail superseded by revised accessibility clearance sketch.'
    }
  ]
};

export function capabilitiesForRole(role) { return ROLE_CAPABILITIES[role] || []; }
export function can(role, capability) { return capabilitiesForRole(role).includes(capability); }

export function visibleItemsForRole(workspace, role, userId = null) {
  if (can(role, 'view_all')) return workspace.items;
  if (can(role, 'view_issued')) return workspace.items.filter(i => ['issued','rfq','ordered','delivered','installed','as_built'].includes(i.status));
  if (can(role, 'view_client_items')) return workspace.items.filter(i => i.clientDecision || ['approved','issued'].includes(i.status));
  if (can(role, 'view_assigned')) return workspace.items.filter(i => [i.ownerRole, i.reviewerRole, i.approverRole].includes(role));
  if (can(role, 'view_package')) return workspace.items.filter(i => ['rfq','issued','ordered','delivered','installed'].includes(i.status));
  return [];
}

export function budgetSummary(items) {
  const totals = items.reduce((acc, item) => {
    acc.allowance += item.budgetAllowance || 0;
    acc.estimate += item.estimatedCost || 0;
    if ((item.estimatedCost || 0) > (item.budgetAllowance || 0)) acc.overBudgetItems.push(item.id);
    if ((item.leadTimeDays || 0) >= 56) acc.longLeadItems.push(item.id);
    if (item.supersededBy) acc.staleItems.push(item.id);
    return acc;
  }, { allowance: 0, estimate: 0, overBudgetItems: [], longLeadItems: [], staleItems: [] });
  totals.delta = totals.estimate - totals.allowance;
  totals.deltaPct = totals.allowance ? Math.round((totals.delta / totals.allowance) * 1000) / 10 : 0;
  return totals;
}

export function validateIssueReadiness(workspace) {
  const findings = [];
  for (const item of workspace.items) {
    if (item.supersededBy) findings.push({ severity: 'blocker', itemId: item.id, message: `${item.code} is superseded by ${item.supersededBy}` });
    if (item.clientDecision && !['approved','issued','ordered','delivered','installed','as_built'].includes(item.status)) findings.push({ severity: 'high', itemId: item.id, message: `${item.code} needs client decision before issue` });
    if (item.estimatedCost > item.budgetAllowance * 1.1) findings.push({ severity: 'medium', itemId: item.id, message: `${item.code} exceeds allowance by more than 10%` });
    if (item.leadTimeDays >= 56) findings.push({ severity: 'medium', itemId: item.id, message: `${item.code} is a long-lead item (${item.leadTimeDays} days)` });
  }
  return findings;
}

export function createIssueSnapshot(workspace, issuer) {
  const now = new Date().toISOString();
  const snapshot = {
    snapshotId: `spec-issue-${workspace.id}-${workspace.revision}-${Date.now()}`,
    projectId: workspace.projectId,
    workspaceId: workspace.id,
    revision: workspace.revision,
    issuedAt: now,
    issuer,
    professionalResponsibility: issuer.role === 'architect' || issuer.role === 'bep' ? 'confirmed_by_issuer' : 'requires_professional_confirmation',
    projectName: workspace.projectName,
    issueStatus: 'issued_snapshot',
    sections: workspace.sections.map(s => ({...s})),
    items: workspace.items.map(i => ({...i})),
    readinessFindings: validateIssueReadiness(workspace),
    budgetSummary: budgetSummary(workspace.items)
  };
  snapshot.auditHash = simpleHash(JSON.stringify(snapshot));
  return Object.freeze(snapshot);
}

export function simpleHash(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8,'0');
}
