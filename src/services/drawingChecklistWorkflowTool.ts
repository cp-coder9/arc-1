/**
 * SA Council Drawing Compliance Navigator — Architex Workflow Edition.
 *
 * Manual checklist builder + AI-guided drawing compliance review.
 * Prepopulates from project context, generates municipality-specific items,
 * and writes snapshots to ProjectRecord / ActionCards / Risk / MunicipalReadiness.
 */

import {
  SA_COUNCIL_DRAWING_COMPLIANCE_DATA,
  getMunicipalityProfile,
  getMunicipalitySpecificItems,
} from "./saCouncilDrawingComplianceData";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChecklistStatus =
  | "unchecked"
  | "pass"
  | "fail"
  | "needs_input"
  | "not_applicable";

export type SourceStatusType = "base" | "ai-guided" | "explicit" | "partial";

export interface ChecklistItem {
  id: string;
  group: string;
  text: string;
  source: string;
  sourceStatus: SourceStatusType;
  status: ChecklistStatus;
  evidence: string[];
  aiGuidance: string | null;
}

export interface ChecklistCounts {
  total: number;
  unchecked: number;
  pass: number;
  fail: number;
  needs_input: number;
  not_applicable: number;
  completionPercent: number;
}

export interface DrawingComplianceContext {
  projectId: string | null;
  projectName: string;
  erfNumber: string | null;
  streetAddress: string | null;
  owner: string | null;
  professional: string | null;
  municipality: string | null;
  municipalityProfile: ReturnType<typeof getMunicipalityProfile>;
  intent: "building-plan" | "sdp" | "full-set";
  zoning: string | null;
  proposedUse: string | null;
  occupancyClass: string | null;
  drawingRegister: Array<{ drawingNo: string; title: string }>;
}

export interface ProjectRecordEvent {
  type: "drawing_compliance_checklist_snapshot";
  projectId: string | null;
  drawingId: string | null;
  municipality: string | null;
  intent: string;
  counts: ChecklistCounts;
  blockers: Array<{
    id: string;
    group: string;
    text: string;
    status: ChecklistStatus;
  }>;
  auditNote: string;
}

export interface DrawingComplianceChecklist {
  tool: string;
  version: string;
  context: DrawingComplianceContext;
  drawingContext: Record<string, unknown>;
  items: ChecklistItem[];
  counts: ChecklistCounts;
  persistence: { recommendedKey: string };
  projectRecordEvent: ProjectRecordEvent;
}

// ---------------------------------------------------------------------------
// Project-intent drawing keys
// ---------------------------------------------------------------------------

const PROJECT_INTENT_DRAWING_KEYS: Record<string, string[]> = {
  "building-plan": [
    "general_notes_title_block",
    "site_plan",
    "floor_plans",
    "elevations",
    "sections",
    "roof_plan",
  ],
  sdp: [
    "general_notes_title_block",
    "sdp_site_layout",
    "site_plan",
    "parking_access_traffic_layout",
  ],
  "full-set": [
    "general_notes_title_block",
    "site_plan",
    "floor_plans",
    "roof_plan",
    "elevations",
    "sections",
    "sdp_site_layout",
    "foundation_structural_detail_sheets",
    "drainage_plumbing_service_plan",
    "parking_access_traffic_layout",
  ],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function inferProjectIntent(
  projectContext: Record<string, unknown> = {},
): "building-plan" | "sdp" | "full-set" {
  if (projectContext.sdpRequired || /sdp|site development/i.test(String(projectContext.submissionStream ?? "")))
    return "sdp";
  if (/full|complete|working drawing/i.test(String(projectContext.submissionStream ?? "")))
    return "full-set";
  return "building-plan";
}

export function prepopulateDrawingComplianceContext(
  projectContext: Record<string, unknown> = {},
): DrawingComplianceContext {
  const municipality: string | null =
    (projectContext.municipality as string) ??
    (projectContext.authority as string) ??
    (projectContext.localAuthority as string) ??
    null;
  const intent: "building-plan" | "sdp" | "full-set" =
    (projectContext.intent as "building-plan" | "sdp" | "full-set") ??
    inferProjectIntent(projectContext);
  const profile = getMunicipalityProfile(municipality);

  return {
    projectId: (projectContext.projectId as string) ?? (projectContext.id as string) ?? null,
    projectName: (projectContext.projectName as string) ?? (projectContext.name as string) ?? "Untitled project",
    erfNumber:
      (projectContext.erfNumber as string) ??
      (projectContext.standNumber as string) ??
      ((projectContext.property as Record<string, unknown>)?.erfNumber as string) ??
      null,
    streetAddress:
      (projectContext.streetAddress as string) ??
      (projectContext.address as string) ??
      ((projectContext.property as Record<string, unknown>)?.address as string) ??
      null,
    owner:
      (projectContext.owner as string) ??
      (projectContext.clientName as string) ??
      null,
    professional:
      (projectContext.professional as string) ??
      (projectContext.architect as string) ??
      null,
    municipality,
    municipalityProfile: profile,
    intent,
    zoning: (projectContext.zoning as string) ?? null,
    proposedUse: (projectContext.proposedUse as string) ?? (projectContext.use as string) ?? null,
    occupancyClass:
      (projectContext.occupancyClass as string) ??
      ((projectContext.occupancyClassification as Record<string, unknown>)?.classification as Record<string, unknown>)
        ?.class as string ??
      null,
    drawingRegister: (projectContext.drawingRegister as Array<{ drawingNo: string; title: string }>) ?? [],
  };
}

function makeItem(opts: {
  group: string;
  text: string;
  source: string;
  status?: ChecklistStatus;
  evidence?: string[];
  aiGuidance?: string | null;
  sourceStatus?: SourceStatusType;
}): ChecklistItem {
  const id = `${opts.group}::${opts.text}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return {
    id,
    group: opts.group,
    text: opts.text,
    source: opts.source,
    sourceStatus: opts.sourceStatus ?? "base",
    status: opts.status ?? "unchecked",
    evidence: opts.evidence ?? [],
    aiGuidance: opts.aiGuidance ?? null,
  };
}

export function buildManualDrawingChecklist(opts: {
  projectContext?: Record<string, unknown>;
  drawingContext?: Record<string, unknown>;
  savedState?: Record<string, Partial<ChecklistItem>>;
} = {}): DrawingComplianceChecklist {
  const context = prepopulateDrawingComplianceContext(opts.projectContext ?? {});
  const keys =
    PROJECT_INTENT_DRAWING_KEYS[context.intent] ??
    PROJECT_INTENT_DRAWING_KEYS["building-plan"];

  const selectedTypes = SA_COUNCIL_DRAWING_COMPLIANCE_DATA.drawingTypes.filter(
    (d) => keys.includes(d.toolboxKey),
  );

  const baseItems = selectedTypes.flatMap((type) =>
    type.baseChecklist.map((text) =>
      makeItem({
        group: type.drawingType,
        text,
        source: type.primarySource,
        sourceStatus: "base",
      }),
    ),
  );

  const municipalItems = getMunicipalitySpecificItems(context.municipality).map(
    (item) =>
      makeItem({
        group: item.drawingType,
        text: item.item,
        source: item.sourceNote,
        sourceStatus:
          item.status === "Explicit"
            ? "explicit"
            : item.status === "Partially explicit"
              ? "partial"
              : "base",
      }),
  );

  const aiItems = buildAiGuidedItems({
    context,
    drawingContext: opts.drawingContext ?? {},
  }).map((item) => makeItem({ ...item, sourceStatus: "ai-guided" }));

  const dedup = new Map<string, ChecklistItem>();
  const savedState = opts.savedState ?? {};

  for (const item of [...baseItems, ...municipalItems, ...aiItems]) {
    if (!dedup.has(item.id)) {
      dedup.set(item.id, { ...item, ...(savedState[item.id] ?? {}) });
    }
  }

  const items = [...dedup.values()];

  return {
    tool: "SA Council Drawing Compliance Navigator - Architex workflow edition",
    version: "1.6.0-RevF",
    context,
    drawingContext: opts.drawingContext ?? {},
    items,
    counts: countChecklistStatuses(items),
    persistence: {
      recommendedKey: `architex:drawingChecklist:${context.projectId ?? "local"}:${String((opts.drawingContext as Record<string, unknown>)?.drawingId ?? "set")}`,
    },
    projectRecordEvent: createChecklistProjectRecordEvent({
      context,
      drawingContext: opts.drawingContext ?? {},
      items,
    }),
  };
}

export function buildAiGuidedItems(opts: {
  context: DrawingComplianceContext;
  drawingContext?: Record<string, unknown>;
}): Array<{
  group: string;
  text: string;
  source: string;
  aiGuidance: string;
}> {
  const items: Array<{
    group: string;
    text: string;
    source: string;
    aiGuidance: string;
  }> = [];
  const { context, drawingContext } = opts;

  const add = (group: string, text: string, why: string) =>
    items.push({ group, text, source: "AI guided from project context", aiGuidance: why });

  if (context.erfNumber)
    add(
      "General notes / title block",
      `Confirm erf/stand number shown as ${context.erfNumber}`,
      "Project context has erf number; drawing title block should match.",
    );
  else
    add(
      "General notes / title block",
      "Capture erf/stand number before municipal submission",
      "Missing project identifier blocks submission confidence.",
    );

  if (context.streetAddress)
    add(
      "General notes / title block",
      `Confirm street address shown as ${context.streetAddress}`,
      "Project address should match application and title data.",
    );

  if (context.owner)
    add(
      "General notes / title block",
      `Confirm owner/applicant shown as ${context.owner}`,
      "Application owner/applicant should match project record.",
    );

  if (context.occupancyClass)
    add(
      "Floor plans",
      `Confirm occupancy/use labels align with occupancy class ${context.occupancyClass}`,
      "Occupancy drives fire, sanitary, accessibility and escape checks.",
    );

  if (
    /place of worship|assembly|institutional/i.test(context.proposedUse ?? "") ||
    context.occupancyClass === "A2"
  )
    add(
      "Floor plans",
      "Confirm seating/occupant load schedule and escape/accessibility notes are visible",
      "Assembly/place-of-worship projects need occupant-load and escape substantiation.",
    );

  if (context.zoning)
    add(
      "Site plan (building-plan sheet)",
      `Confirm zoning/control schedule reconciles with ${context.zoning}`,
      "Land-use controls must match official zoning/scheme evidence.",
    );
  else
    add(
      "Area / zoning / parking schedule",
      "Attach zoning evidence or mark zoning as pending verification",
      "AI must not infer lawful land use without official evidence.",
    );

  if (context.intent === "sdp")
    add(
      "SDP / site layout",
      "Confirm access, parking, services, stormwater/refuse and levels are shown on SDP",
      "SDP stream requires broader site-function information than normal building sheet.",
    );

  const drawingRefs = (drawingContext?.references as Array<Record<string, unknown>>) ?? [];
  if (drawingRefs.length)
    add(
      "Drawing cross-references",
      `Resolve ${drawingRefs.length} detected section/elevation/detail references against drawing register`,
      "Drawing must check against itself. Unresolved callouts become action cards.",
    );

  return items;
}

export function updateChecklistItem(
  checklist: DrawingComplianceChecklist,
  itemId: string,
  patch: Partial<ChecklistItem> = {},
): DrawingComplianceChecklist {
  const items = checklist.items.map((item) =>
    item.id === itemId ? { ...item, ...patch } : item,
  );
  return {
    ...checklist,
    items,
    counts: countChecklistStatuses(items),
    projectRecordEvent: createChecklistProjectRecordEvent({
      context: checklist.context,
      drawingContext: checklist.drawingContext,
      items,
    }),
  };
}

export function countChecklistStatuses(
  items: ChecklistItem[] = [],
): ChecklistCounts {
  const counts: ChecklistCounts = {
    total: items.length,
    unchecked: 0,
    pass: 0,
    fail: 0,
    needs_input: 0,
    not_applicable: 0,
    completionPercent: 0,
  };
  for (const item of items) {
    counts[item.status] = (counts[item.status] || 0) + 1;
  }
  counts.completionPercent = counts.total
    ? Math.round(((counts.pass + counts.not_applicable) / counts.total) * 100)
    : 0;
  return counts;
}

export function createChecklistProjectRecordEvent(opts: {
  context: DrawingComplianceContext;
  drawingContext: Record<string, unknown>;
  items: ChecklistItem[];
}): ProjectRecordEvent {
  return {
    type: "drawing_compliance_checklist_snapshot",
    projectId: opts.context.projectId,
    drawingId: (opts.drawingContext.drawingId as string) ?? null,
    municipality: opts.context.municipality,
    intent: opts.context.intent,
    counts: countChecklistStatuses(opts.items),
    blockers: opts.items
      .filter((i) => i.status === "fail" || i.status === "needs_input")
      .map((i) => ({
        id: i.id,
        group: i.group,
        text: i.text,
        status: i.status,
      })),
    auditNote:
      "Manual checklist + AI guidance snapshot. Not municipal approval. Professional review required.",
  };
}

export function createAiChecklistPrompt(opts: {
  checklist: DrawingComplianceChecklist;
  drawingVisionSummary?: string | null;
}): string {
  const { checklist, drawingVisionSummary } = opts;
  const unresolved = checklist.items
    .filter(
      (i) =>
        i.status === "unchecked" ||
        i.status === "needs_input" ||
        i.status === "fail",
    )
    .slice(0, 40);

  return `You are guiding an Architex drawing compliance checklist. Project: ${checklist.context.projectName}. Municipality: ${checklist.context.municipality ?? "unknown"}. Intent: ${checklist.context.intent}. Use project context to prefill, but do not invent missing values. Vision summary: ${drawingVisionSummary ?? "none supplied"}. For each unresolved item, suggest evidence to check and mark pass/fail/needs_input/not_applicable only if evidence is clear. Items: ${JSON.stringify(unresolved.map((i) => ({ id: i.id, group: i.group, text: i.text, source: i.source })))}`;
}

// ---------------------------------------------------------------------------
// Toolbox integration manifest
// ---------------------------------------------------------------------------

export const DRAWING_COMPLIANCE_NAVIGATOR_MANIFEST = {
  id: "sa-council-drawing-compliance-navigator",
  name: "SA Council Drawing Compliance Navigator",
  architexZone: "documents-drawing-intelligence",
  workflowStage: [
    "project-setup",
    "design-development",
    "municipal-submission-readiness",
  ],
  entrypoints: {
    library: "src/drawingChecklistWorkflowTool.ts",
    standaloneHtml:
      "public/sa-council-drawing-compliance-navigator-architex.html",
  },
  projectContextPrefill: [
    "projectId",
    "projectName",
    "municipality",
    "erfNumber",
    "streetAddress",
    "owner",
    "professional",
    "zoning",
    "proposedUse",
    "occupancyClass",
    "drawingRegister",
  ],
  writesBackTo: [
    "ProjectRecord",
    "DrawingRegister",
    "ActionCards",
    "RiskRegister",
    "MunicipalReadinessInbox",
  ],
  aiGuided: true,
  manualChecklist: true,
  professionalBoundary:
    "Guidance/checklist only. Does not certify compliance or municipal approval.",
  popia:
    "Browser checklist state may use localStorage for demo; production integration must store per project/tenant with server-side auth and audit trail.",
} as const;
