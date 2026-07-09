/**
 * Unit tests for Export Service — BIM/IFC Quantity Extraction Bridge
 *
 * Tests CSV, Excel, JSON, and procurement package exports for correctness,
 * formatting, and structural integrity.
 *
 * Requirements: 6.5, 6.6, 6.7, 12.3
 */

import * as XLSX from 'xlsx';
import type {
  BoqDocument,
  BoqSection,
  BoqLineItem,
  ProcurementPackage,
  ProcurementLineItem,
  PackageCoverSheet,
  AsaqsTradeSection,
  MeasurementUnit,
} from '../types';
import {
  exportToCsv,
  exportToExcel,
  exportToJson,
  exportProcurementPackage,
} from '../exportService';

// ─── Test Helpers ───────────────────────────────────────────────────────────

function makeLineItem(overrides: Partial<BoqLineItem> = {}): BoqLineItem {
  return {
    itemNumber: '3.01',
    description: 'Columns, Concrete 30MPa, measured in cubic metres',
    unit: 'm³' as MeasurementUnit,
    quantity: 12.5,
    rate: undefined,
    amount: undefined,
    sourceElementCount: 5,
    sourceElementGlobalIds: ['col-1', 'col-2', 'col-3', 'col-4', 'col-5'],
    elementType: 'IfcColumn',
    material: 'Concrete 30MPa',
    specForgeItemId: undefined,
    ...overrides,
  };
}

function makeSection(overrides: Partial<BoqSection> = {}): BoqSection {
  return {
    sectionNumber: '3',
    tradeSection: 'Concrete' as AsaqsTradeSection,
    title: 'Concrete',
    lineItems: [makeLineItem()],
    subtotal: undefined,
    ...overrides,
  };
}

function makeBoqDocument(overrides: Partial<BoqDocument> = {}): BoqDocument {
  return {
    boqId: 'boq-001',
    projectId: 'proj-123',
    extractionId: 'ext-456',
    title: 'Bill of Quantities — Test Project',
    status: 'draft',
    revision: 'A',
    generatedAt: '2026-07-01T10:30:00.000Z',
    generatedBy: 'user-001',
    currency: 'ZAR',
    sections: [
      makeSection(),
      makeSection({
        sectionNumber: '6',
        tradeSection: 'Masonry',
        title: 'Masonry',
        lineItems: [
          makeLineItem({
            itemNumber: '6.01',
            description: 'Walls, Face Brick, measured in square metres',
            unit: 'm²',
            quantity: 245.8,
            sourceElementCount: 12,
            sourceElementGlobalIds: ['w-1', 'w-2', 'w-3'],
            elementType: 'IfcWall',
            material: 'Face Brick',
          }),
          makeLineItem({
            itemNumber: '6.02',
            description: 'Walls, Clay Brick, measured in square metres',
            unit: 'm²',
            quantity: 180.35,
            sourceElementCount: 8,
            sourceElementGlobalIds: ['w-4', 'w-5'],
            elementType: 'IfcWall',
            material: 'Clay Brick',
          }),
        ],
      }),
    ],
    flaggedElementsSummary: [],
    totals: {
      totalLineItems: 3,
      totalSections: 2,
      totalElements: 25,
    },
    ...overrides,
  };
}

function makeProcurementPackage(overrides: Partial<ProcurementPackage> = {}): ProcurementPackage {
  return {
    packageId: 'pkg-001',
    projectId: 'proj-123',
    boqId: 'boq-001',
    title: 'Concrete Package',
    tradeSections: ['Concrete' as AsaqsTradeSection],
    lineItems: [
      {
        itemNumber: '3.01',
        description: 'Reinforced concrete in columns, 30 MPa',
        unit: 'm³' as MeasurementUnit,
        quantity: 12.5,
      },
      {
        itemNumber: '3.02',
        description: 'Reinforced concrete in slabs, 30 MPa',
        unit: 'm³' as MeasurementUnit,
        quantity: 85.0,
      },
    ],
    coverSheet: {
      projectName: 'Office Block Phase 2',
      projectNumber: 'PRJ-2026-042',
      packageTitle: 'Concrete Package',
      issueDate: '2026-07-15',
      revisionNumber: 'A',
      qsContactName: 'John Smith',
      qsContactEmail: 'john.smith@qs-firm.co.za',
    },
    revision: 'A',
    modelSuperseded: false,
    ...overrides,
  };
}

// ─── exportToCsv ────────────────────────────────────────────────────────────

describe('exportToCsv', () => {
  it('produces CSV with correct header row', () => {
    const boq = makeBoqDocument();
    const csv = exportToCsv(boq);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Section,Item No,Description,Unit,Quantity,Rate,Amount');
  });

  it('produces one data row per line item', () => {
    const boq = makeBoqDocument();
    const csv = exportToCsv(boq);
    const lines = csv.split('\n');
    // 1 header + 3 line items (1 in Concrete, 2 in Masonry)
    expect(lines.length).toBe(4);
  });

  it('includes section name in each data row', () => {
    const boq = makeBoqDocument();
    const csv = exportToCsv(boq);
    const lines = csv.split('\n');
    expect(lines[1]).toContain('Concrete');
    expect(lines[2]).toContain('Masonry');
    expect(lines[3]).toContain('Masonry');
  });

  it('includes item number, description, unit, and quantity', () => {
    const boq = makeBoqDocument({
      sections: [
        makeSection({
          lineItems: [
            makeLineItem({
              itemNumber: '3.01',
              description: 'Columns, Concrete 30MPa, measured in cubic metres',
              unit: 'm³',
              quantity: 12.5,
            }),
          ],
        }),
      ],
    });
    const csv = exportToCsv(boq);
    const lines = csv.split('\n');
    const dataRow = lines[1];
    expect(dataRow).toContain('3.01');
    expect(dataRow).toContain('m³');
    expect(dataRow).toContain('12.5');
  });

  it('leaves Rate and Amount columns blank', () => {
    const boq = makeBoqDocument({
      sections: [makeSection({ lineItems: [makeLineItem()] })],
    });
    const csv = exportToCsv(boq);
    const lines = csv.split('\n');
    const fields = lines[1].split(',');
    // Rate and Amount are the last two fields — should be empty
    expect(fields[fields.length - 2]).toBe('');
    expect(fields[fields.length - 1]).toBe('');
  });

  it('escapes descriptions containing commas', () => {
    const boq = makeBoqDocument({
      sections: [
        makeSection({
          lineItems: [
            makeLineItem({
              description: 'Reinforced concrete in columns, 30 MPa, exceeding 0.03 m³',
            }),
          ],
        }),
      ],
    });
    const csv = exportToCsv(boq);
    // Should be wrapped in quotes
    expect(csv).toContain('"Reinforced concrete in columns, 30 MPa, exceeding 0.03 m³"');
  });

  it('escapes descriptions containing quotes', () => {
    const boq = makeBoqDocument({
      sections: [
        makeSection({
          lineItems: [
            makeLineItem({
              description: 'Timber "Grade 5" framing',
            }),
          ],
        }),
      ],
    });
    const csv = exportToCsv(boq);
    // Quotes should be doubled and field wrapped
    expect(csv).toContain('"Timber ""Grade 5"" framing"');
  });

  it('handles empty BoQ with no sections', () => {
    const boq = makeBoqDocument({ sections: [] });
    const csv = exportToCsv(boq);
    const lines = csv.split('\n');
    expect(lines.length).toBe(1); // header only
    expect(lines[0]).toBe('Section,Item No,Description,Unit,Quantity,Rate,Amount');
  });

  it('preserves quantity precision', () => {
    const boq = makeBoqDocument({
      sections: [
        makeSection({
          lineItems: [makeLineItem({ quantity: 123.45 })],
        }),
      ],
    });
    const csv = exportToCsv(boq);
    expect(csv).toContain('123.45');
  });
});

// ─── exportToExcel ──────────────────────────────────────────────────────────

describe('exportToExcel', () => {
  it('returns a Buffer', () => {
    const boq = makeBoqDocument();
    const result = exportToExcel(boq);
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it('produces a valid xlsx workbook', () => {
    const boq = makeBoqDocument();
    const buffer = exportToExcel(boq);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    expect(wb.SheetNames).toContain('Bill of Quantities');
  });

  it('includes header row with Rate (ZAR) and Amount (ZAR) columns', () => {
    const boq = makeBoqDocument();
    const buffer = exportToExcel(boq);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets['Bill of Quantities'];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    const headers = data[0] as string[];
    expect(headers).toContain('Section');
    expect(headers).toContain('Item No');
    expect(headers).toContain('Description');
    expect(headers).toContain('Unit');
    expect(headers).toContain('Quantity');
    expect(headers).toContain('Rate (ZAR)');
    expect(headers).toContain('Amount (ZAR)');
  });

  it('includes section header rows', () => {
    const boq = makeBoqDocument({
      sections: [makeSection()],
    });
    const buffer = exportToExcel(boq);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets['Bill of Quantities'];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    // Row 1 is header, Row 2 should be section header
    const sectionRow = data[1] as string[];
    expect(sectionRow[0]).toContain('Section 3: Concrete');
  });

  it('includes subtotal rows per section', () => {
    const boq = makeBoqDocument({
      sections: [makeSection()],
    });
    const buffer = exportToExcel(boq);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets['Bill of Quantities'];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    // Find the subtotal row
    const subtotalRow = data.find(
      (row) => Array.isArray(row) && row.some((cell) => typeof cell === 'string' && cell.includes('Subtotal'))
    );
    expect(subtotalRow).toBeDefined();
  });

  it('includes grand total row at the bottom', () => {
    const boq = makeBoqDocument();
    const buffer = exportToExcel(boq);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets['Bill of Quantities'];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    const lastRow = data[data.length - 1] as (string | number)[];
    expect(lastRow.some((cell) => cell === 'GRAND TOTAL')).toBe(true);
  });

  it('preserves line item quantities correctly', () => {
    const boq = makeBoqDocument({
      sections: [
        makeSection({
          lineItems: [makeLineItem({ quantity: 42.75 })],
        }),
      ],
    });
    const buffer = exportToExcel(boq);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets['Bill of Quantities'];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    // Find the data row (skip header and section header)
    const dataRow = data[2] as (string | number)[];
    expect(dataRow[4]).toBe(42.75);
  });

  it('handles multiple sections with correct subtotals', () => {
    const boq = makeBoqDocument();
    const buffer = exportToExcel(boq);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets['Bill of Quantities'];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });

    // Find subtotal rows
    const subtotalRows = data.filter(
      (row) => Array.isArray(row) && row.some((cell) => typeof cell === 'string' && cell.includes('Subtotal'))
    );
    expect(subtotalRows.length).toBe(2); // Concrete + Masonry
  });

  it('handles empty BoQ', () => {
    const boq = makeBoqDocument({ sections: [] });
    const buffer = exportToExcel(boq);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets['Bill of Quantities'];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    // Header + grand total row only
    expect(data.length).toBe(2);
  });
});

// ─── exportToJson ───────────────────────────────────────────────────────────

describe('exportToJson', () => {
  it('returns a valid JSON string', () => {
    const boq = makeBoqDocument();
    const json = exportToJson(boq);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('preserves all BoQ document fields', () => {
    const boq = makeBoqDocument();
    const json = exportToJson(boq);
    const parsed = JSON.parse(json) as BoqDocument;
    expect(parsed.boqId).toBe(boq.boqId);
    expect(parsed.projectId).toBe(boq.projectId);
    expect(parsed.extractionId).toBe(boq.extractionId);
    expect(parsed.title).toBe(boq.title);
    expect(parsed.status).toBe(boq.status);
    expect(parsed.revision).toBe(boq.revision);
    expect(parsed.generatedAt).toBe(boq.generatedAt);
    expect(parsed.generatedBy).toBe(boq.generatedBy);
    expect(parsed.currency).toBe(boq.currency);
  });

  it('preserves section hierarchy', () => {
    const boq = makeBoqDocument();
    const json = exportToJson(boq);
    const parsed = JSON.parse(json) as BoqDocument;
    expect(parsed.sections).toHaveLength(2);
    expect(parsed.sections[0].tradeSection).toBe('Concrete');
    expect(parsed.sections[1].tradeSection).toBe('Masonry');
  });

  it('preserves line items within sections', () => {
    const boq = makeBoqDocument();
    const json = exportToJson(boq);
    const parsed = JSON.parse(json) as BoqDocument;
    expect(parsed.sections[0].lineItems).toHaveLength(1);
    expect(parsed.sections[1].lineItems).toHaveLength(2);
    expect(parsed.sections[0].lineItems[0].itemNumber).toBe('3.01');
    expect(parsed.sections[0].lineItems[0].quantity).toBe(12.5);
  });

  it('preserves totals', () => {
    const boq = makeBoqDocument();
    const json = exportToJson(boq);
    const parsed = JSON.parse(json) as BoqDocument;
    expect(parsed.totals.totalLineItems).toBe(3);
    expect(parsed.totals.totalSections).toBe(2);
    expect(parsed.totals.totalElements).toBe(25);
  });

  it('preserves flagged elements summary', () => {
    const boq = makeBoqDocument({
      flaggedElementsSummary: [
        {
          globalId: 'proxy-1',
          elementType: 'IfcBuildingElementProxy',
          findingType: 'unclassified_element',
          message: 'Element not classified',
        },
      ],
    });
    const json = exportToJson(boq);
    const parsed = JSON.parse(json) as BoqDocument;
    expect(parsed.flaggedElementsSummary).toHaveLength(1);
    expect(parsed.flaggedElementsSummary[0].globalId).toBe('proxy-1');
  });

  it('is pretty-printed with indentation', () => {
    const boq = makeBoqDocument();
    const json = exportToJson(boq);
    // Pretty-printed JSON has newlines and spaces
    expect(json).toContain('\n');
    expect(json).toContain('  ');
  });

  it('round-trips correctly — parse produces equivalent structure', () => {
    const boq = makeBoqDocument();
    const json = exportToJson(boq);
    const parsed = JSON.parse(json) as BoqDocument;
    // Re-stringify and compare
    const reJson = JSON.stringify(parsed, null, 2);
    expect(reJson).toBe(json);
  });
});

// ─── exportProcurementPackage ───────────────────────────────────────────────

describe('exportProcurementPackage', () => {
  it('returns a Buffer', () => {
    const pkg = makeProcurementPackage();
    const result = exportProcurementPackage(pkg);
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it('produces a valid xlsx workbook', () => {
    const pkg = makeProcurementPackage();
    const buffer = exportProcurementPackage(pkg);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    expect(wb.SheetNames.length).toBeGreaterThanOrEqual(2);
  });

  it('includes Cover Sheet and Line Items sheets', () => {
    const pkg = makeProcurementPackage();
    const buffer = exportProcurementPackage(pkg);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    expect(wb.SheetNames).toContain('Cover Sheet');
    expect(wb.SheetNames).toContain('Line Items');
  });

  it('cover sheet contains project metadata', () => {
    const pkg = makeProcurementPackage();
    const buffer = exportProcurementPackage(pkg);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets['Cover Sheet'];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    const flatContent = data.map((row) => (row as string[]).join(' ')).join('\n');

    expect(flatContent).toContain('Office Block Phase 2');
    expect(flatContent).toContain('PRJ-2026-042');
    expect(flatContent).toContain('Concrete Package');
    expect(flatContent).toContain('2026-07-15');
    expect(flatContent).toContain('John Smith');
    expect(flatContent).toContain('john.smith@qs-firm.co.za');
  });

  it('line items sheet contains correct data', () => {
    const pkg = makeProcurementPackage();
    const buffer = exportProcurementPackage(pkg);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets['Line Items'];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });

    // Header row
    const headers = data[0] as string[];
    expect(headers).toContain('Item No');
    expect(headers).toContain('Description');
    expect(headers).toContain('Unit');
    expect(headers).toContain('Quantity');

    // Data rows
    const firstItem = data[1] as (string | number)[];
    expect(firstItem[0]).toBe('3.01');
    expect(firstItem[1]).toBe('Reinforced concrete in columns, 30 MPa');
    expect(firstItem[2]).toBe('m³');
    expect(firstItem[3]).toBe(12.5);
  });

  it('line items sheet includes a total row', () => {
    const pkg = makeProcurementPackage();
    const buffer = exportProcurementPackage(pkg);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets['Line Items'];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    const lastRow = data[data.length - 1] as (string | number)[];
    expect(lastRow.some((cell) => cell === 'TOTAL')).toBe(true);
    // Total quantity: 12.5 + 85.0 = 97.5
    expect(lastRow[3]).toBe(97.5);
  });

  it('cover sheet includes trade sections list', () => {
    const pkg = makeProcurementPackage({
      tradeSections: ['Concrete', 'Formwork'] as AsaqsTradeSection[],
    });
    const buffer = exportProcurementPackage(pkg);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets['Cover Sheet'];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    const flatContent = data.map((row) => (row as string[]).join(' ')).join('\n');
    expect(flatContent).toContain('Concrete, Formwork');
  });

  it('handles package with no line items', () => {
    const pkg = makeProcurementPackage({ lineItems: [] });
    const buffer = exportProcurementPackage(pkg);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets['Line Items'];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    // Header + total row
    expect(data.length).toBe(2);
  });

  it('includes Rate (ZAR) and Amount (ZAR) columns in line items', () => {
    const pkg = makeProcurementPackage();
    const buffer = exportProcurementPackage(pkg);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets['Line Items'];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    const headers = data[0] as string[];
    expect(headers).toContain('Rate (ZAR)');
    expect(headers).toContain('Amount (ZAR)');
  });
});
