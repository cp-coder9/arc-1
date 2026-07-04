import type {
  BomExtractionSource,
  BomFlag,
  BomFlagSeverity,
  BomLineItem,
  BomProject,
  BomSourceFormat,
  BomTradePackage,
  BomUnit,
} from './types';

// ── Helpers ─────────────────────────────────────────────────────────────────

let seq = 0;
function uid(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}`;
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function now(): string {
  return new Date().toISOString();
}

// ── Rate & Cost Code Lookups ────────────────────────────────────────────────

const defaultRates: Record<BomTradePackage, number> = {
  earthworks: 320,
  concrete: 2450,
  masonry: 680,
  roofing: 1100,
  'doors-windows': 1850,
  finishes: 145,
  electrical: 900,
  plumbing: 850,
  fire: 1200,
  preliminaries: 1,
  general: 1,
};

const costCodes: Record<BomTradePackage, string> = {
  earthworks: 'CC-1100',
  concrete: 'CC-2100',
  masonry: 'CC-2300',
  roofing: 'CC-2500',
  'doors-windows': 'CC-3100',
  finishes: 'CC-5200',
  electrical: 'CC-6100',
  plumbing: 'CC-6200',
  fire: 'CC-6300',
  preliminaries: 'CC-0100',
  general: 'CC-9000',
};

// ── In-memory store ─────────────────────────────────────────────────────────

const projects: Map<string, BomProject> = new Map();

// ── Public API ──────────────────────────────────────────────────────────────

export function createProject(name: string, projectId?: string): BomProject {
  const project: BomProject = {
    id: uid('bom'),
    projectId,
    name,
    stage: 'takeoff',
    revision: '1.0',
    sources: [],
    lineItems: [],
    qsReviews: [],
    qsSignOff: undefined,
    tenderPackages: [],
    exports: [],
    createdAt: now(),
    updatedAt: now(),
  };
  projects.set(project.id, project);
  return project;
}

export function getProject(projectId: string): BomProject | undefined {
  return projects.get(projectId);
}

export function ingestSource(
  projectId: string,
  fileName: string,
  format: BomSourceFormat,
  drawingRef: string = '',
  revision: string = 'P01',
  uploadedBy: string = 'system',
): BomExtractionSource {
  const project = projects.get(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const source: BomExtractionSource = {
    id: uid('src'),
    fileName,
    format,
    drawingRef: drawingRef || fileName.replace(/\.[^.]+$/, ''),
    revision,
    uploadedBy,
    uploadedAt: now(),
    itemsExtracted: 0,
    confidence: 0,
    status: 'processing',
  };
  project.sources.push(source);
  project.updatedAt = now();
  return source;
}

export function extractQuantities(projectId: string, sourceId: string): BomLineItem[] {
  const project = projects.get(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const source = project.sources.find((s) => s.id === sourceId);
  if (!source) throw new Error(`Source ${sourceId} not found`);

  // Simulated AI extraction — produces deterministic sample items based on format
  const extractions: Array<{
    description: string;
    material: string;
    tradePackage: BomTradePackage;
    unit: BomUnit;
    quantity: number;
    confidence: number;
  }> = [
    { description: 'Face brick external walls 230mm', material: 'FBA clay brick', tradePackage: 'masonry', unit: 'm2', quantity: 185.4, confidence: 0.92 },
    { description: 'Concrete strip footings 600x200', material: '25MPa ready-mix', tradePackage: 'concrete', unit: 'm3', quantity: 18.6, confidence: 0.88 },
    { description: 'Aluminium sliding doors 2400x2100', material: 'Powder-coated aluminium', tradePackage: 'doors-windows', unit: 'nr', quantity: 4, confidence: 0.95 },
    { description: 'Ceiling plaster skim coat', material: 'Gypsum plaster', tradePackage: 'finishes', unit: 'm2', quantity: 142.0, confidence: 0.85 },
    { description: 'DB board 3-phase supply', material: 'CBI distribution board', tradePackage: 'electrical', unit: 'nr', quantity: 1, confidence: 0.78 },
  ];

  const newItems: BomLineItem[] = extractions.map((ext, idx) => {
    const rate = defaultRates[ext.tradePackage];
    const item: BomLineItem = {
      id: uid('item'),
      sourceIds: [sourceId],
      itemCode: `${String(project.lineItems.length + idx + 1).padStart(3, '0')}-${ext.tradePackage}`,
      description: ext.description,
      material: ext.material,
      tradePackage: ext.tradePackage,
      costCode: costCodes[ext.tradePackage],
      unit: ext.unit,
      quantity: ext.quantity,
      rate,
      total: money(ext.quantity * rate),
      confidence: ext.confidence,
      status: ext.confidence >= 0.9 ? 'extracted' : 'flagged',
      flags: [],
      procurementStatus: 'not_started',
    };

    // Auto-flag low-confidence items
    if (ext.confidence < 0.85) {
      const flag: BomFlag = {
        id: uid('flag'),
        lineItemId: item.id,
        severity: 'warning',
        reason: `Low extraction confidence (${Math.round(ext.confidence * 100)}%)`,
        suggestedAction: 'Manual QS verification required',
      };
      item.flags.push(flag);
      item.status = 'flagged';
    }

    return item;
  });

  project.lineItems.push(...newItems);
  source.itemsExtracted = newItems.length;
  source.confidence = newItems.reduce((sum, i) => sum + i.confidence, 0) / newItems.length;
  source.status = 'complete';
  project.updatedAt = now();

  return newItems;
}

export function addLineItem(
  projectId: string,
  item: Omit<BomLineItem, 'id' | 'total' | 'flags' | 'procurementStatus'>,
): BomLineItem {
  const project = projects.get(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const lineItem: BomLineItem = {
    ...item,
    id: uid('item'),
    total: money(item.quantity * item.rate),
    flags: [],
    procurementStatus: 'not_started',
  };
  project.lineItems.push(lineItem);
  project.updatedAt = now();
  return lineItem;
}

export function updateLineItem(
  projectId: string,
  lineItemId: string,
  updates: Partial<Pick<BomLineItem, 'description' | 'material' | 'quantity' | 'rate' | 'unit' | 'tradePackage' | 'status'>>,
): BomLineItem {
  const project = projects.get(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const item = project.lineItems.find((i) => i.id === lineItemId);
  if (!item) throw new Error(`Line item ${lineItemId} not found`);

  Object.assign(item, updates);
  item.total = money(item.quantity * item.rate);
  if (updates.quantity !== undefined || updates.rate !== undefined || updates.description !== undefined) {
    item.status = 'edited';
  }
  project.updatedAt = now();
  return item;
}

export function removeLineItem(projectId: string, lineItemId: string): void {
  const project = projects.get(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const idx = project.lineItems.findIndex((i) => i.id === lineItemId);
  if (idx === -1) throw new Error(`Line item ${lineItemId} not found`);

  project.lineItems.splice(idx, 1);
  project.updatedAt = now();
}

export function flagItem(
  projectId: string,
  lineItemId: string,
  severity: BomFlagSeverity,
  reason: string,
  suggestedAction: string = '',
  sansReference?: string,
): BomFlag {
  const project = projects.get(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const item = project.lineItems.find((i) => i.id === lineItemId);
  if (!item) throw new Error(`Line item ${lineItemId} not found`);

  const flag: BomFlag = {
    id: uid('flag'),
    lineItemId,
    severity,
    reason,
    suggestedAction,
    sansReference,
  };
  item.flags.push(flag);
  item.status = 'flagged';
  project.updatedAt = now();
  return flag;
}

export function resolveFlag(
  projectId: string,
  lineItemId: string,
  flagId: string,
  resolvedBy: string,
): void {
  const project = projects.get(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const item = project.lineItems.find((i) => i.id === lineItemId);
  if (!item) throw new Error(`Line item ${lineItemId} not found`);

  const flag = item.flags.find((f) => f.id === flagId);
  if (!flag) throw new Error(`Flag ${flagId} not found`);

  flag.resolvedBy = resolvedBy;
  flag.resolvedAt = now();

  // If all flags resolved, restore status
  const unresolvedFlags = item.flags.filter((f) => !f.resolvedBy);
  if (unresolvedFlags.length === 0) {
    item.status = 'extracted';
  }
  project.updatedAt = now();
}

export function getTradeBreakdown(projectId: string): Record<BomTradePackage, { count: number; total: number }> {
  const project = projects.get(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const breakdown = {} as Record<BomTradePackage, { count: number; total: number }>;
  for (const item of project.lineItems) {
    if (!breakdown[item.tradePackage]) {
      breakdown[item.tradePackage] = { count: 0, total: 0 };
    }
    breakdown[item.tradePackage].count += 1;
    breakdown[item.tradePackage].total = money(breakdown[item.tradePackage].total + item.total);
  }
  return breakdown;
}

export interface BomTotals {
  subtotal: number;
  preliminaries: number;
  contingency: number;
  vat: number;
  total: number;
  itemCount: number;
}

export function calculateTotals(projectId: string, prelimsPercent = 12, contingencyPercent = 5, vatPercent = 15): BomTotals {
  const project = projects.get(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const subtotal = project.lineItems.reduce((sum, item) => sum + item.total, 0);
  const preliminaries = money(subtotal * (prelimsPercent / 100));
  const contingency = money(subtotal * (contingencyPercent / 100));
  const netTotal = subtotal + preliminaries + contingency;
  const vat = money(netTotal * (vatPercent / 100));
  const total = money(netTotal + vat);

  return {
    subtotal: money(subtotal),
    preliminaries,
    contingency,
    vat,
    total,
    itemCount: project.lineItems.length,
  };
}

export function linkToSpecForge(projectId: string, lineItemId: string, specItemId: string): void {
  const project = projects.get(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const item = project.lineItems.find((i) => i.id === lineItemId);
  if (!item) throw new Error(`Line item ${lineItemId} not found`);

  item.specForgeItemId = specItemId;
  project.updatedAt = now();
}

export function linkToProgramme(projectId: string, lineItemId: string, activityId: string): void {
  const project = projects.get(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const item = project.lineItems.find((i) => i.id === lineItemId);
  if (!item) throw new Error(`Line item ${lineItemId} not found`);

  item.programmeActivityId = activityId;
  project.updatedAt = now();
}

// ── Testing utility ─────────────────────────────────────────────────────────

export function _resetStore(): void {
  projects.clear();
  seq = 0;
}
