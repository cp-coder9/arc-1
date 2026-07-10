import { AuditSnapshotService } from './auditSnapshot';
import { ExportService } from './exportService';
import { createId, iso } from './ids';
import { IntegrationEventBus } from './integrationEvents';
import type { ToolRunRepository } from './repository';
import { ToolDefinitionRegistry } from './registry';
import { ToolRunError } from './types';
import type { ProjectAssignment, ToolContext, ToolRun } from './types';
import { getCalculatorDefinition } from '@/services/toolbox/definitions/definitionRegistry';

export class ToolboxEngine {
  constructor(
    private readonly registry: ToolDefinitionRegistry,
    private readonly repository: ToolRunRepository,
    private readonly exports: ExportService,
    private readonly snapshots: AuditSnapshotService,
    private readonly events: IntegrationEventBus,
  ) {}

  async runTool(params: {
    toolId: string;
    input: unknown;
    context: ToolContext;
    assignment: ProjectAssignment;
    issueImmediately?: boolean;
  }): Promise<ToolRun> {
    // Definition resolution gate (Req 2.1)
    const tool = this.registry.getDefinition(params.toolId);
    if (!tool) {
      throw new ToolRunError('NO_DEFINITION', 'This tool is not yet available.');
    }

    // Resolve the CalculatorDefinition for Zod validation and status checks
    const calcDef = getCalculatorDefinition(tool.calculatorDefinitionId);

    // Check Calculator_Definition status for preview disclaimer and placeholder detection (Req 2.2, 2.4)
    const definitionStatus = calcDef?.status;

    // Emit PLACEHOLDER_DETECTED for non-full/preview definitions or missing calculatorDefinitionId (Req 2.4)
    if (!calcDef || (definitionStatus !== 'full' && definitionStatus !== 'preview')) {
      this.events.emitPlaceholderDetected(params.toolId, params.context);
    }

    if (!tool.roles.includes(params.context.userRole)) {
      throw new Error(`Role ${params.context.userRole} cannot run ${tool.id}`);
    }

    // --- Input validation gate (Req 7.1–7.5) ---
    // Validate input against the CalculatorDefinition's Zod schemas before compute.
    let validatedInput: unknown = params.input;

    if (calcDef) {
      // Validate top-level input against the definition's Zod inputSchema (Req 7.1, 7.2)
      const inputResult = calcDef.inputSchema.safeParse(params.input);
      if (!inputResult.success) {
        const fieldErrors = inputResult.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          expected: issue.message,
          actual: issue.path.reduce(
            (obj: unknown, key) =>
              obj != null && typeof obj === 'object'
                ? (obj as Record<string, unknown>)[String(key)]
                : undefined,
            params.input,
          ),
        }));
        throw new ToolRunError('INVALID_INPUT', 'Input validation failed', {
          fields: fieldErrors,
        });
      }

      // If the definition has a scheduleSchema, validate each schedule row (Req 7.3, 7.4)
      if (calcDef.scheduleSchema) {
        const rawInput = params.input as Record<string, unknown> | null | undefined;
        const scheduleRows: unknown[] = Array.isArray(rawInput?.rows)
          ? (rawInput as Record<string, unknown>).rows as unknown[]
          : Array.isArray(rawInput?.schedule)
            ? (rawInput as Record<string, unknown>).schedule as unknown[]
            : Array.isArray(rawInput?.scheduleRows)
              ? (rawInput as Record<string, unknown>).scheduleRows as unknown[]
              : [];

        for (let i = 0; i < scheduleRows.length; i++) {
          const rowResult = calcDef.scheduleSchema.safeParse(scheduleRows[i]);
          if (!rowResult.success) {
            const rowErrors = rowResult.error.issues.map((issue) => ({
              path: issue.path.join('.'),
              expected: issue.message,
              actual: issue.path.reduce(
                (obj: unknown, key) =>
                  obj != null && typeof obj === 'object'
                    ? (obj as Record<string, unknown>)[String(key)]
                    : undefined,
                scheduleRows[i],
              ),
            }));
            throw new ToolRunError('INVALID_SCHEDULE_ROW', `Schedule row ${i} validation failed`, {
              rowIndex: i,
              fields: rowErrors,
            });
          }
        }
      }

      // Store validated (parsed) input — not the raw user-submitted input (Req 7.5)
      validatedInput = inputResult.data;
    }

    const now = iso(params.context.now ?? new Date());
    const run: ToolRun = {
      id: createId('run'),
      tenantId: params.context.tenantId,
      userId: params.context.userId,
      toolId: tool.id,
      toolVersion: tool.version,
      role: params.context.userRole,
      assignment: params.assignment,
      status: 'draft',
      input: validatedInput,
      exports: [],
      locked: false,
      createdAt: now,
      updatedAt: now,
    };

    // Inject preview disclaimer when definition status is 'preview' (Req 2.2)
    if (definitionStatus === 'preview') {
      run.previewDisclaimer = 'This tool is in preview. Results are indicative only and must not be relied upon for professional decisions.';
    }

    try {
      run.output = await tool.execute(validatedInput, params.context);

      // --- Generic output detection (Req 2.5) ---
      // After compute, check if output is entirely empty/zero — reject if so.
      if (this.isGenericOutput(run.output)) {
        run.status = 'failed';
        run.error = 'Tool produced no meaningful output.';
        run.updatedAt = iso();
        await this.repository.save(run);
        throw new ToolRunError('GENERIC_OUTPUT_DETECTED', 'Tool produced no meaningful output.');
      }

      run.status = params.issueImmediately ? 'issued' : 'completed';
      run.updatedAt = iso();
      if (params.issueImmediately || tool.governance.locksOnIssue) {
        run.auditSnapshot = this.snapshots.create(run, params.issueImmediately ? 'issued by authorised user' : 'completed locked snapshot');
        run.locked = true;
        if (params.issueImmediately) run.issuedAt = iso();
      }
      run.exports = [this.exports.createJson(run), this.exports.createCsv(run), this.exports.createPrintableHtml(run, tool.name)];
      await this.repository.save(run);
      await this.events.emitForRun(run, tool.governance, `${tool.name} run ${run.status}`);
      return run;
    } catch (error) {
      // If the error is already a ToolRunError (e.g. GENERIC_OUTPUT_DETECTED), re-throw as-is
      if (error instanceof ToolRunError) {
        throw error;
      }

      // --- Unhandled compute exception (Req 2.6) ---
      // Preserve input and schedule rows in the ToolRun for diagnostics.
      run.status = 'failed';
      run.error = `Calculation failed. Input preserved for diagnostics. ${error instanceof Error ? error.message : String(error)}`;
      run.updatedAt = iso();
      await this.repository.save(run);
      throw new ToolRunError('COMPUTE_FAILED', 'Calculation failed. Input preserved for diagnostics.', {
        originalError: error instanceof Error ? error.message : String(error),
        input: validatedInput,
      });
    }
  }

  /**
   * Detects generic/placeholder output (Req 2.5).
   * Returns true when lineResults is empty AND clauseResults is empty AND every
   * value in aggregates equals zero — meaning the compute function produced no
   * meaningful domain-specific result.
   */
  private isGenericOutput(output: unknown): boolean {
    if (output == null || typeof output !== 'object') return false;
    const result = output as Record<string, unknown>;

    const lineResults = result.lineResults;
    const clauseResults = result.clauseResults;
    const aggregates = result.aggregates;

    // If the output doesn't have the expected CalculationResult shape, skip the check
    if (!Array.isArray(lineResults) || !Array.isArray(clauseResults) || aggregates == null || typeof aggregates !== 'object') {
      return false;
    }

    // Check if lineResults and clauseResults are both empty
    if (lineResults.length > 0 || clauseResults.length > 0) {
      return false;
    }

    // Check if all aggregate values are zero
    const aggValues = Object.values(aggregates as Record<string, unknown>);
    if (aggValues.length === 0) {
      // No aggregates at all — treat as generic
      return true;
    }

    return aggValues.every((val) => val === 0);
  }

  /**
   * Issues a completed ToolRun: computes audit snapshot, locks the run, and emits AuditTrail event.
   * Requirement 10.1: SHA-256 hash at issue time
   * Requirement 10.2: locked=true in same atomic operation as hash storage
   * Requirement 10.5: Emit AuditTrail Integration_Event with snapshot hash
   */
  async issueRun(runId: string, context: ToolContext): Promise<ToolRun> {
    const run = await this.repository.getById(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    if (run.locked) throw new ToolRunError('RUN_LOCKED', 'This run is locked. Use revision workflow.');
    if (run.status !== 'completed') throw new Error('Only completed runs can be issued.');

    // Set issuedAt and status atomically with hash computation
    run.issuedAt = iso(context.now ?? new Date());
    run.status = 'issued';

    // Compute audit snapshot (SHA-256) and lock — atomic operation (Req 10.2)
    run.auditSnapshot = this.snapshots.create(run, 'issued by authorised user');
    run.locked = true;
    run.updatedAt = iso();

    await this.repository.save(run);

    // Emit AuditTrail Integration_Event with snapshot hash (Req 10.5)
    this.events.emitAuditTrailForSnapshot(run);

    return run;
  }

  /**
   * Rejects modification of locked ToolRun fields (except status → superseded).
   * Requirement 10.3: RUN_LOCKED enforcement
   */
  assertNotLocked(run: ToolRun): void {
    if (run.locked) {
      throw new ToolRunError('RUN_LOCKED', 'This run is locked. Use revision workflow.');
    }
  }

  /**
   * Revises a locked (issued) ToolRun: creates a new draft run with supersedesRunId,
   * marks the original as superseded.
   * Requirement 10.3: Only status → superseded is allowed on locked runs
   * Requirement 10.4: Revision creates new draft, sets supersedesRunId, original → superseded
   */
  async reviseRun(existingRunId: string, input: unknown, context: ToolContext, assignment: ProjectAssignment): Promise<ToolRun> {
    const existing = await this.repository.getById(existingRunId);
    if (!existing) throw new Error(`Cannot revise missing run ${existingRunId}`);
    if (!existing.locked) throw new Error('Only locked (issued) runs need the revision workflow. Update the run directly instead.');

    // Create a new ToolRun with status draft (Req 10.4)
    const revised = await this.runTool({ toolId: existing.toolId, input, context, assignment });
    revised.supersedesRunId = existing.id;
    revised.status = 'draft';
    revised.updatedAt = iso();
    await this.repository.save(revised);

    // Update original to superseded — this is the only allowed mutation on a locked run (Req 10.3)
    existing.status = 'superseded';
    existing.updatedAt = iso();
    await this.repository.save(existing);

    return revised;
  }

  /**
   * Reassigns a completed ToolRun's project assignment.
   * Rejects if the run is locked (Req 10.3).
   */
  async reassignRun(runId: string, assignment: ProjectAssignment, context: ToolContext): Promise<ToolRun> {
    const run = await this.repository.getById(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    this.assertNotLocked(run);

    if (run.assignment.mode !== 'none') {
      throw new ToolRunError('REASSIGNMENT_NOT_PERMITTED', 'Cannot reassign from current mode.');
    }

    run.assignment = assignment;
    run.updatedAt = iso();
    await this.repository.save(run);
    return run;
  }
}
