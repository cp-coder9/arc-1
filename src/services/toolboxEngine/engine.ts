import { AuditSnapshotService } from './auditSnapshot';
import { ExportService } from './exportService';
import { createId, iso } from './ids';
import { IntegrationEventBus } from './integrationEvents';
import type { ToolRunRepository } from './repository';
import { ToolDefinitionRegistry } from './registry';
import type { ProjectAssignment, ToolContext, ToolRun } from './types';

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
    const tool = this.registry.getRequired(params.toolId);
    if (!tool.roles.includes(params.context.userRole)) {
      throw new Error(`Role ${params.context.userRole} cannot run ${tool.id}`);
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
      input: params.input,
      exports: [],
      createdAt: now,
      updatedAt: now,
    };

    try {
      run.output = await tool.execute(params.input, params.context);
      run.status = params.issueImmediately ? 'issued' : 'completed';
      run.updatedAt = iso();
      if (params.issueImmediately || tool.governance.locksOnIssue) {
        run.auditSnapshot = this.snapshots.create(run, params.issueImmediately ? 'issued by authorised user' : 'completed locked snapshot');
        if (params.issueImmediately) run.issuedAt = iso();
      }
      run.exports = [this.exports.createJson(run), this.exports.createCsv(run), this.exports.createPrintableHtml(run, tool.name)];
      await this.repository.save(run);
      this.events.emitForRun(run, `${tool.name} run ${run.status}`);
      return run;
    } catch (error) {
      run.status = 'failed';
      run.error = error instanceof Error ? error.message : String(error);
      run.updatedAt = iso();
      await this.repository.save(run);
      throw error;
    }
  }

  async reviseRun(existingRunId: string, input: unknown, context: ToolContext, assignment: ProjectAssignment): Promise<ToolRun> {
    const existing = await this.repository.getById(existingRunId);
    if (!existing) throw new Error(`Cannot revise missing run ${existingRunId}`);
    if (existing.status !== 'issued') throw new Error('Only issued runs need immutable revision flow');
    const revised = await this.runTool({ toolId: existing.toolId, input, context, assignment, issueImmediately: true });
    revised.supersedesRunId = existing.id;
    existing.status = 'superseded';
    existing.updatedAt = iso();
    await this.repository.save(existing);
    await this.repository.save(revised);
    return revised;
  }
}
