import { describe, it, expect } from 'vitest';
import { ExportService } from './exportService';
import type { ToolRun } from './types';
import type { CalculationResult, CalculatorDefinition } from '@/services/toolbox/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRun(overrides: Partial<ToolRun> = {}): ToolRun {
  return {
    id: 'run_001',
    tenantId: 'tenant_abc',
    userId: 'user_xyz',
    toolId: 'boq_takeoff',
    toolVersion: '1.0.0',
    role: 'quantity_surveyor',
    assignment: { mode: 'internal-project', projectId: 'proj_1', projectName: 'Sandton Tower' },
    status: 'completed',
    input: { projectName: 'Sandton Tower', section: 'JBCC 5.1', contingencyPercent: 10 },
    output: undefined,
    error: undefined,
    exports: [],
    auditSnapshot: undefined,
    locked: false,
    previewDisclaimer: undefined,
    supersedesRunId: undefined,
    createdAt: '2025-01-15T10:00:00.000Z',
    updatedAt: '2025-01-15T10:00:01.000Z',
    issuedAt: undefined,
    ...overrides,
  };
}

function makeScheduleOutput(): CalculationResult {
  return {
    lineResults: [
      { description: 'Concrete slab', unit: 'm³', quantity: 120, rate: 2500, amount: 300000 },
      { description: 'Reinforcing steel', unit: 'kg', quantity: 5000, rate: 18, amount: 90000, labourCost: 25000, materialCost: 65000, plantCost: 0 },
    ],
    aggregates: {
      projectName: 'Sandton Tower',
      section: 'JBCC 5.1',
      itemCount: 2,
      subtotal: 390000,
      contingencyPercent: 10,
      contingencyAmount: 39000,
      grandTotal: 429000,
    },
    clauseResults: [],
    sourceVersions: [],
    disclaimers: ['Advisory only.'],
    warnings: [],
  };
}

function makeDefinition(): Partial<CalculatorDefinition> {
  return {
    id: 'boq_takeoff_v1',
    toolId: 'boq_takeoff',
    source: {
      guideline: 'JBCC/NEC Schedule of Quantities',
      version: '2024',
      status: 'indicative',
    },
  } as Partial<CalculatorDefinition>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExportService', () => {
  const service = new ExportService();

  describe('createJson', () => {
    it('produces a properly structured JSON ExportRecord', () => {
      const run = makeRun({ output: { foo: 'bar' } });
      const record = service.createJson(run);

      expect(record.format).toBe('json');
      expect(record.mimeType).toBe('application/json');
      expect(record.filename).toMatch(/^boq_takeoff_run_001_.+\.json$/);
      expect(record.id).toMatch(/^export_/);
      expect(record.createdAt).toBeTruthy();

      // Verify JSON structure contains all required fields
      const parsed = JSON.parse(record.content);
      expect(parsed.id).toBe('run_001');
      expect(parsed.tenantId).toBe('tenant_abc');
      expect(parsed.userId).toBe('user_xyz');
      expect(parsed.toolId).toBe('boq_takeoff');
      expect(parsed.toolVersion).toBe('1.0.0');
      expect(parsed.role).toBe('quantity_surveyor');
      expect(parsed.status).toBe('completed');
      expect(parsed.assignment).toEqual(run.assignment);
      expect(parsed.input).toEqual(run.input);
      expect(parsed.output).toEqual(run.output);
      expect(parsed.locked).toBe(false);
      expect(parsed.createdAt).toBe('2025-01-15T10:00:00.000Z');
      expect(parsed.updatedAt).toBe('2025-01-15T10:00:01.000Z');
    });

    it('filename follows {toolId}_{runId}_{timestamp}.json pattern', () => {
      const run = makeRun();
      const record = service.createJson(run);
      // Pattern: toolId_runId_timestamp.ext (timestamp has dashes instead of colons)
      const parts = record.filename.split('_');
      expect(parts[0]).toBe('boq');
      expect(record.filename).toContain('run_001');
      expect(record.filename.endsWith('.json')).toBe(true);
    });
  });

  describe('createCsv — schedule-based output', () => {
    it('produces header row + one data row per line item when lineResults exist', () => {
      const output = makeScheduleOutput();
      const run = makeRun({ output });
      const record = service.createCsv(run, makeDefinition() as CalculatorDefinition);

      expect(record.format).toBe('csv');
      expect(record.mimeType).toBe('text/csv');
      expect(record.filename).toMatch(/^boq_takeoff_run_001_.+\.csv$/);

      const lines = record.content.split('\n');
      // Header + 2 data rows
      expect(lines.length).toBe(3);

      // Verify header includes required columns
      const header = lines[0];
      expect(header).toContain('"item"');
      expect(header).toContain('"description"');
      expect(header).toContain('"unit"');
      expect(header).toContain('"quantity"');
      expect(header).toContain('"rate"');
      expect(header).toContain('"amount"');
      expect(header).toContain('"section"');
    });

    it('includes JBCC/GCC section reference from aggregates', () => {
      const output = makeScheduleOutput();
      const run = makeRun({ output });
      const record = service.createCsv(run, makeDefinition() as CalculatorDefinition);

      const lines = record.content.split('\n');
      // First data row should include the section from aggregates
      expect(lines[1]).toContain('"JBCC 5.1"');
    });

    it('includes extra columns like labourCost, materialCost, plantCost', () => {
      const output = makeScheduleOutput();
      const run = makeRun({ output });
      const record = service.createCsv(run, makeDefinition() as CalculatorDefinition);

      const lines = record.content.split('\n');
      const header = lines[0];
      expect(header).toContain('"labourCost"');
      expect(header).toContain('"materialCost"');
      expect(header).toContain('"plantCost"');

      // Second data row has build-up values
      expect(lines[2]).toContain('"25000"');
      expect(lines[2]).toContain('"65000"');
    });

    it('assigns sequential item numbers starting from 1', () => {
      const output = makeScheduleOutput();
      const run = makeRun({ output });
      const record = service.createCsv(run);

      const lines = record.content.split('\n');
      // First data row starts with item "1"
      expect(lines[1]).toMatch(/^"1"/);
      // Second data row starts with item "2"
      expect(lines[2]).toMatch(/^"2"/);
    });

    it('falls back to definition source guideline when aggregates has no section', () => {
      const output: CalculationResult = {
        ...makeScheduleOutput(),
        aggregates: { subtotal: 100, grandTotal: 110 }, // no section field
      };
      const run = makeRun({ output });
      const record = service.createCsv(run, makeDefinition() as CalculatorDefinition);

      const lines = record.content.split('\n');
      // Should use the definition source guideline as section
      expect(lines[1]).toContain('"JBCC/NEC Schedule of Quantities"');
    });
  });

  describe('createCsv — fallback (non-schedule)', () => {
    it('produces field/value pairs when output has no lineResults', () => {
      const run = makeRun({ output: { someValue: 42 } });
      const record = service.createCsv(run);

      const lines = record.content.split('\n');
      // Header is field,value
      expect(lines[0]).toBe('"field","value"');
      // Contains run metadata
      expect(record.content).toContain('"runId","run_001"');
      expect(record.content).toContain('"toolId","boq_takeoff"');
    });

    it('produces field/value pairs when output is undefined', () => {
      const run = makeRun({ output: undefined });
      const record = service.createCsv(run);

      const lines = record.content.split('\n');
      expect(lines[0]).toBe('"field","value"');
    });

    it('produces field/value pairs when lineResults is empty', () => {
      const output: CalculationResult = {
        lineResults: [],
        aggregates: { total: 0 },
        clauseResults: [],
        sourceVersions: [],
        disclaimers: [],
        warnings: [],
      };
      const run = makeRun({ output });
      const record = service.createCsv(run);

      const lines = record.content.split('\n');
      expect(lines[0]).toBe('"field","value"');
    });
  });

  describe('filename uniqueness', () => {
    it('no two exports for the same run have identical filenames (different extensions)', () => {
      const run = makeRun({ output: makeScheduleOutput() });
      const json = service.createJson(run);
      const csv = service.createCsv(run);
      const html = service.createPrintableHtml(run, 'BoQ Takeoff');

      const filenames = [json.filename, csv.filename, html.filename];
      const unique = new Set(filenames);
      expect(unique.size).toBe(3);
    });
  });
});
