import { describe, it, expect, beforeEach } from 'vitest';
import {
  createProject,
  getProject,
  ingestSource,
  extractQuantities,
  addLineItem,
  updateLineItem,
  removeLineItem,
  flagItem,
  resolveFlag,
  getTradeBreakdown,
  calculateTotals,
  linkToSpecForge,
  linkToProgramme,
  _resetStore,
} from '../bomBuilderService';

describe('bomBuilderService', () => {
  beforeEach(() => {
    _resetStore();
  });

  it('creates a new BoM project with correct defaults', () => {
    const project = createProject('Test Residence');
    expect(project.id).toMatch(/^bom_/);
    expect(project.name).toBe('Test Residence');
    expect(project.stage).toBe('takeoff');
    expect(project.revision).toBe('1.0');
    expect(project.lineItems).toHaveLength(0);
    expect(project.sources).toHaveLength(0);
  });

  it('creates a linked BoM project with projectId', () => {
    const project = createProject('Linked Project', 'proj_abc123');
    expect(project.projectId).toBe('proj_abc123');
  });

  it('ingests a drawing source', () => {
    const project = createProject('Intake Test');
    const source = ingestSource(project.id, 'floor-plan-L01.pdf', 'pdf_vector', 'DWG-001', 'P02', 'architect@test.com');
    expect(source.fileName).toBe('floor-plan-L01.pdf');
    expect(source.format).toBe('pdf_vector');
    expect(source.drawingRef).toBe('DWG-001');
    expect(source.revision).toBe('P02');
    expect(source.status).toBe('processing');
    expect(project.sources).toHaveLength(1);
  });

  it('throws when ingesting source for non-existent project', () => {
    expect(() => ingestSource('bogus_id', 'file.pdf', 'pdf_vector')).toThrow('Project bogus_id not found');
  });

  it('extracts quantities from a source with AI simulation', () => {
    const project = createProject('Extraction Test');
    const source = ingestSource(project.id, 'plan.dwg', 'dwg');
    const items = extractQuantities(project.id, source.id);

    expect(items.length).toBeGreaterThan(0);
    expect(source.status).toBe('complete');
    expect(source.itemsExtracted).toBe(items.length);
    expect(source.confidence).toBeGreaterThan(0);

    // All items should have valid structure
    for (const item of items) {
      expect(item.id).toMatch(/^item_/);
      expect(item.sourceIds).toContain(source.id);
      expect(item.total).toBe(Math.round(item.quantity * item.rate * 100) / 100);
      expect(item.procurementStatus).toBe('not_started');
    }
  });

  it('auto-flags low-confidence extracted items', () => {
    const project = createProject('Flag Test');
    const source = ingestSource(project.id, 'plan.ifc', 'ifc');
    const items = extractQuantities(project.id, source.id);

    const flaggedItems = items.filter((i) => i.status === 'flagged');
    expect(flaggedItems.length).toBeGreaterThan(0);

    // At least one flagged item should have a flag object
    const withFlags = flaggedItems.filter((i) => i.flags.length > 0);
    expect(withFlags.length).toBeGreaterThan(0);
    expect(withFlags[0].flags[0].severity).toBe('warning');
    expect(withFlags[0].flags[0].reason).toContain('Low extraction confidence');
  });

  it('adds a manual line item', () => {
    const project = createProject('Manual Add');
    const item = addLineItem(project.id, {
      sourceIds: [],
      itemCode: '001-masonry',
      description: 'Internal plaster walls',
      material: 'Plaster mix',
      tradePackage: 'masonry',
      costCode: 'CC-2300',
      unit: 'm2',
      quantity: 120,
      rate: 95,
      confidence: 1.0,
      status: 'extracted',
    });

    expect(item.id).toMatch(/^item_/);
    expect(item.total).toBe(11400);
    expect(item.procurementStatus).toBe('not_started');
    expect(project.lineItems).toHaveLength(1);
  });

  it('updates a line item and recalculates total', () => {
    const project = createProject('Update Test');
    const item = addLineItem(project.id, {
      sourceIds: [],
      itemCode: '001-concrete',
      description: 'Foundation concrete',
      material: '30MPa concrete',
      tradePackage: 'concrete',
      costCode: 'CC-2100',
      unit: 'm3',
      quantity: 10,
      rate: 2500,
      confidence: 1.0,
      status: 'extracted',
    });

    const updated = updateLineItem(project.id, item.id, { quantity: 15, rate: 2600 });
    expect(updated.quantity).toBe(15);
    expect(updated.rate).toBe(2600);
    expect(updated.total).toBe(39000);
    expect(updated.status).toBe('edited');
  });

  it('removes a line item', () => {
    const project = createProject('Remove Test');
    const item = addLineItem(project.id, {
      sourceIds: [],
      itemCode: '001-general',
      description: 'Temporary item',
      material: 'N/A',
      tradePackage: 'general',
      costCode: 'CC-9000',
      unit: 'sum',
      quantity: 1,
      rate: 5000,
      confidence: 1.0,
      status: 'extracted',
    });

    expect(project.lineItems).toHaveLength(1);
    removeLineItem(project.id, item.id);
    expect(project.lineItems).toHaveLength(0);
  });

  it('flags an item and resolves the flag', () => {
    const project = createProject('Flag Resolve');
    const item = addLineItem(project.id, {
      sourceIds: [],
      itemCode: '001-electrical',
      description: 'DB board supply',
      material: 'CBI board',
      tradePackage: 'electrical',
      costCode: 'CC-6100',
      unit: 'nr',
      quantity: 1,
      rate: 4500,
      confidence: 0.9,
      status: 'extracted',
    });

    const flag = flagItem(project.id, item.id, 'blocker', 'Quantity unclear from drawing', 'Verify with architect');
    expect(flag.severity).toBe('blocker');
    expect(item.status).toBe('flagged');
    expect(item.flags).toHaveLength(1);

    resolveFlag(project.id, item.id, flag.id, 'qs@test.com');
    expect(flag.resolvedBy).toBe('qs@test.com');
    expect(flag.resolvedAt).toBeDefined();
    expect(item.status).toBe('extracted'); // restored after all flags resolved
  });

  it('calculates trade breakdown', () => {
    const project = createProject('Breakdown Test');
    addLineItem(project.id, { sourceIds: [], itemCode: '001-masonry', description: 'Walls', material: 'Brick', tradePackage: 'masonry', costCode: 'CC-2300', unit: 'm2', quantity: 100, rate: 680, confidence: 1, status: 'extracted' });
    addLineItem(project.id, { sourceIds: [], itemCode: '002-masonry', description: 'More walls', material: 'Brick', tradePackage: 'masonry', costCode: 'CC-2300', unit: 'm2', quantity: 50, rate: 680, confidence: 1, status: 'extracted' });
    addLineItem(project.id, { sourceIds: [], itemCode: '003-electrical', description: 'Wiring', material: 'Cable', tradePackage: 'electrical', costCode: 'CC-6100', unit: 'm', quantity: 200, rate: 45, confidence: 1, status: 'extracted' });

    const breakdown = getTradeBreakdown(project.id);
    expect(breakdown.masonry.count).toBe(2);
    expect(breakdown.masonry.total).toBe(102000);
    expect(breakdown.electrical.count).toBe(1);
    expect(breakdown.electrical.total).toBe(9000);
  });

  it('calculates totals with prelims, contingency, and VAT', () => {
    const project = createProject('Totals Test');
    addLineItem(project.id, { sourceIds: [], itemCode: '001-concrete', description: 'Slab', material: 'Concrete', tradePackage: 'concrete', costCode: 'CC-2100', unit: 'm3', quantity: 20, rate: 2450, confidence: 1, status: 'extracted' });
    addLineItem(project.id, { sourceIds: [], itemCode: '002-masonry', description: 'Walls', material: 'Brick', tradePackage: 'masonry', costCode: 'CC-2300', unit: 'm2', quantity: 100, rate: 680, confidence: 1, status: 'extracted' });

    const totals = calculateTotals(project.id);
    // Subtotal: 49000 + 68000 = 117000
    expect(totals.subtotal).toBe(117000);
    expect(totals.preliminaries).toBe(14040); // 12%
    expect(totals.contingency).toBe(5850); // 5%
    expect(totals.vat).toBe(20533.5); // 15% of (117000 + 14040 + 5850)
    expect(totals.total).toBe(157423.5);
    expect(totals.itemCount).toBe(2);
  });

  it('links a line item to SpecForge', () => {
    const project = createProject('Link SF');
    const item = addLineItem(project.id, { sourceIds: [], itemCode: '001-finishes', description: 'Tile', material: 'Porcelain', tradePackage: 'finishes', costCode: 'CC-5200', unit: 'm2', quantity: 40, rate: 450, confidence: 1, status: 'extracted' });

    linkToSpecForge(project.id, item.id, 'spec_item_xyz');
    const updated = project.lineItems.find((i) => i.id === item.id);
    expect(updated?.specForgeItemId).toBe('spec_item_xyz');
  });

  it('links a line item to programme activity', () => {
    const project = createProject('Link Programme');
    const item = addLineItem(project.id, { sourceIds: [], itemCode: '001-roofing', description: 'Roof tiles', material: 'Concrete tile', tradePackage: 'roofing', costCode: 'CC-2500', unit: 'm2', quantity: 180, rate: 320, confidence: 1, status: 'extracted' });

    linkToProgramme(project.id, item.id, 'activity_roof_001');
    const updated = project.lineItems.find((i) => i.id === item.id);
    expect(updated?.programmeActivityId).toBe('activity_roof_001');
  });

  it('retrieves a project by id', () => {
    const project = createProject('Retrieve Test');
    const retrieved = getProject(project.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('Retrieve Test');
  });

  it('returns undefined for non-existent project', () => {
    const result = getProject('does_not_exist');
    expect(result).toBeUndefined();
  });
});
