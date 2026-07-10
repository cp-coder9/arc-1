import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { ToolboxEngine } from './engine';
import { ToolDefinitionRegistry } from './registry';
import { InMemoryToolRunRepository } from './repository';
import { ExportService } from './exportService';
import { AuditSnapshotService } from './auditSnapshot';
import { IntegrationEventBus } from './integrationEvents';
import { ToolRunError } from './types';
import type { ToolContext, ToolDefinition, ProjectAssignment } from './types';
import {
  registerCalculatorDefinition,
  resetCalculatorDefinitions,
} from '@/services/toolbox/definitions/definitionRegistry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    tenantId: 'tenant_1',
    userId: 'user_1',
    userRole: 'architect',
    ...overrides,
  };
}

function makeAssignment(): ProjectAssignment {
  return { mode: 'none' };
}

function makeToolDef(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    id: 'test_tool',
    name: 'Test Tool',
    version: '1.0.0',
    roles: ['architect', 'admin'],
    category: 'professional-fees',
    route: '/toolbox/standalone/test-tool',
    description: 'A test tool',
    tags: ['test', 'unit', 'validation'],
    inputSchema: { projectName: 'string' },
    outputSchema: { total: 'number' },
    governance: {
      requiresProfessionalConfirmation: false,
      allowsAiDraft: true,
      locksOnIssue: false,
      downstreamWriteBack: ['AuditTrail'],
    },
    calculatorDefinitionId: 'test_calc_v1',
    execute: vi.fn().mockResolvedValue({ total: 100 }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('ToolboxEngine — Input validation gate', () => {
  let registry: ToolDefinitionRegistry;
  let repository: InMemoryToolRunRepository;
  let engine: ToolboxEngine;

  beforeEach(() => {
    resetCalculatorDefinitions();
    registry = new ToolDefinitionRegistry();
    repository = new InMemoryToolRunRepository();
    engine = new ToolboxEngine(
      registry,
      repository,
      new ExportService(),
      new AuditSnapshotService(),
      new IntegrationEventBus(),
    );
  });

  afterEach(() => {
    resetCalculatorDefinitions();
  });

  describe('Top-level input validation (Req 7.1, 7.2)', () => {
    it('rejects invalid input with INVALID_INPUT and field-level errors', async () => {
      // Register a CalculatorDefinition with a Zod inputSchema
      registerCalculatorDefinition({
        id: 'test_calc_v1',
        toolId: 'test_tool',
        title: 'Test Calculator',
        method: 'bracket',
        inputSchema: z.object({
          projectName: z.string().min(1),
          amount: z.number().positive(),
        }),
        tableRefs: [],
        compute: () => ({
          lineResults: [],
          aggregates: { total: 0 },
          clauseResults: [],
          sourceVersions: [],
          disclaimers: [],
          warnings: [],
        }),
        reportTemplateId: 'default',
        source: { guideline: 'Test', version: '1.0', status: 'indicative' },
        disclaimers: [],
        status: 'full',
      });

      const tool = makeToolDef();
      registry.register(tool);

      await expect(
        engine.runTool({
          toolId: 'test_tool',
          input: { projectName: '', amount: -5 },
          context: makeContext(),
          assignment: makeAssignment(),
        }),
      ).rejects.toThrow(ToolRunError);

      try {
        await engine.runTool({
          toolId: 'test_tool',
          input: { projectName: '', amount: -5 },
          context: makeContext(),
          assignment: makeAssignment(),
        });
      } catch (err) {
        expect(err).toBeInstanceOf(ToolRunError);
        const runErr = err as ToolRunError;
        expect(runErr.code).toBe('INVALID_INPUT');
        expect(runErr.details).toBeDefined();
        const details = runErr.details as { fields: Array<{ path: string; expected: string; actual: unknown }> };
        expect(details.fields.length).toBeGreaterThan(0);
        // Each field error should have path, expected, and actual
        for (const field of details.fields) {
          expect(field).toHaveProperty('path');
          expect(field).toHaveProperty('expected');
          expect(field).toHaveProperty('actual');
        }
      }
    });

    it('does not invoke compute when input validation fails', async () => {
      const computeFn = vi.fn();
      registerCalculatorDefinition({
        id: 'test_calc_v1',
        toolId: 'test_tool',
        title: 'Test Calculator',
        method: 'bracket',
        inputSchema: z.object({
          projectName: z.string().min(1),
        }),
        tableRefs: [],
        compute: computeFn,
        reportTemplateId: 'default',
        source: { guideline: 'Test', version: '1.0', status: 'indicative' },
        disclaimers: [],
        status: 'full',
      });

      const executeFn = vi.fn();
      const tool = makeToolDef({ execute: executeFn });
      registry.register(tool);

      await expect(
        engine.runTool({
          toolId: 'test_tool',
          input: { projectName: '' }, // invalid: min(1)
          context: makeContext(),
          assignment: makeAssignment(),
        }),
      ).rejects.toThrow(ToolRunError);

      expect(executeFn).not.toHaveBeenCalled();
      expect(computeFn).not.toHaveBeenCalled();
    });

    it('stores validated (parsed) input in ToolRun, not raw input (Req 7.5)', async () => {
      registerCalculatorDefinition({
        id: 'test_calc_v1',
        toolId: 'test_tool',
        title: 'Test Calculator',
        method: 'bracket',
        inputSchema: z.object({
          projectName: z.string().min(1),
          amount: z.number().default(100),
        }),
        tableRefs: [],
        compute: () => ({
          lineResults: [],
          aggregates: { total: 100 },
          clauseResults: [],
          sourceVersions: [],
          disclaimers: [],
          warnings: [],
        }),
        reportTemplateId: 'default',
        source: { guideline: 'Test', version: '1.0', status: 'indicative' },
        disclaimers: [],
        status: 'full',
      });

      const tool = makeToolDef();
      registry.register(tool);

      const run = await engine.runTool({
        toolId: 'test_tool',
        input: { projectName: 'My Project' }, // amount not supplied; default should fill in
        context: makeContext(),
        assignment: makeAssignment(),
      });

      // The validated (parsed) input should include the default value
      expect((run.input as Record<string, unknown>).amount).toBe(100);
      expect((run.input as Record<string, unknown>).projectName).toBe('My Project');
    });
  });

  describe('Schedule row validation (Req 7.3, 7.4)', () => {
    it('rejects invalid schedule rows with INVALID_SCHEDULE_ROW and row index', async () => {
      registerCalculatorDefinition({
        id: 'test_calc_v1',
        toolId: 'test_tool',
        title: 'Test Calculator',
        method: 'area',
        inputSchema: z.object({
          projectName: z.string().min(1),
        }),
        scheduleSchema: z.object({
          description: z.string().min(1),
          quantity: z.number().min(0),
          rate: z.number().min(0),
        }),
        tableRefs: [],
        compute: () => ({
          lineResults: [],
          aggregates: { total: 0 },
          clauseResults: [],
          sourceVersions: [],
          disclaimers: [],
          warnings: [],
        }),
        reportTemplateId: 'default',
        source: { guideline: 'Test', version: '1.0', status: 'indicative' },
        disclaimers: [],
        status: 'full',
      });

      const tool = makeToolDef();
      registry.register(tool);

      try {
        await engine.runTool({
          toolId: 'test_tool',
          input: {
            projectName: 'Valid Project',
            rows: [
              { description: 'Good row', quantity: 10, rate: 50 },
              { description: '', quantity: -1, rate: 20 }, // invalid: description min(1), quantity min(0)
            ],
          },
          context: makeContext(),
          assignment: makeAssignment(),
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ToolRunError);
        const runErr = err as ToolRunError;
        expect(runErr.code).toBe('INVALID_SCHEDULE_ROW');
        const details = runErr.details as { rowIndex: number; fields: Array<{ path: string }> };
        expect(details.rowIndex).toBe(1); // second row (0-indexed)
        expect(details.fields.length).toBeGreaterThan(0);
      }
    });

    it('accepts valid schedule rows in "schedule" property', async () => {
      registerCalculatorDefinition({
        id: 'test_calc_v1',
        toolId: 'test_tool',
        title: 'Test Calculator',
        method: 'area',
        inputSchema: z.object({
          projectName: z.string().min(1),
        }),
        scheduleSchema: z.object({
          description: z.string().min(1),
          quantity: z.number().min(0),
        }),
        tableRefs: [],
        compute: () => ({
          lineResults: [{ description: 'Item', quantity: 5 }],
          aggregates: { total: 5 },
          clauseResults: [],
          sourceVersions: [],
          disclaimers: [],
          warnings: [],
        }),
        reportTemplateId: 'default',
        source: { guideline: 'Test', version: '1.0', status: 'indicative' },
        disclaimers: [],
        status: 'full',
      });

      const tool = makeToolDef();
      registry.register(tool);

      const run = await engine.runTool({
        toolId: 'test_tool',
        input: {
          projectName: 'Valid Project',
          schedule: [{ description: 'Item', quantity: 5 }],
        },
        context: makeContext(),
        assignment: makeAssignment(),
      });

      expect(run.status).toBe('completed');
    });
  });

  describe('Passthrough when no CalculatorDefinition linked', () => {
    it('skips validation when no calculatorDefinitionId is set', async () => {
      const tool = makeToolDef({ calculatorDefinitionId: undefined });
      registry.register(tool);

      // No CalculatorDefinition registered — should pass through without validation
      const run = await engine.runTool({
        toolId: 'test_tool',
        input: { anything: 'goes' },
        context: makeContext(),
        assignment: makeAssignment(),
      });

      expect(run.status).toBe('completed');
      expect(run.input).toEqual({ anything: 'goes' });
    });
  });

  describe('Valid input passes through to execute', () => {
    it('calls execute with validated input and completes the run', async () => {
      const executeFn = vi.fn().mockResolvedValue({ total: 250 });

      registerCalculatorDefinition({
        id: 'test_calc_v1',
        toolId: 'test_tool',
        title: 'Test Calculator',
        method: 'bracket',
        inputSchema: z.object({
          projectName: z.string().min(1),
          amount: z.number().positive(),
        }),
        tableRefs: [],
        compute: () => ({
          lineResults: [],
          aggregates: { total: 250 },
          clauseResults: [],
          sourceVersions: [],
          disclaimers: [],
          warnings: [],
        }),
        reportTemplateId: 'default',
        source: { guideline: 'Test', version: '1.0', status: 'indicative' },
        disclaimers: [],
        status: 'full',
      });

      const tool = makeToolDef({ execute: executeFn });
      registry.register(tool);

      const run = await engine.runTool({
        toolId: 'test_tool',
        input: { projectName: 'Valid', amount: 500 },
        context: makeContext(),
        assignment: makeAssignment(),
      });

      expect(run.status).toBe('completed');
      expect(executeFn).toHaveBeenCalledWith(
        { projectName: 'Valid', amount: 500 },
        expect.objectContaining({ tenantId: 'tenant_1' }),
      );
      expect(run.output).toEqual({ total: 250 });
    });
  });
});
