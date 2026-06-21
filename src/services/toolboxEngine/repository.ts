import type { ToolRun } from './types';

export interface ToolRunRepository {
  save(run: ToolRun): Promise<ToolRun>;
  getById(id: string): Promise<ToolRun | undefined>;
  listByUser(tenantId: string, userId: string, limit?: number): Promise<ToolRun[]>;
  listByTool(tenantId: string, userId: string, toolId: string, limit?: number): Promise<ToolRun[]>;
}

export class InMemoryToolRunRepository implements ToolRunRepository {
  private runs = new Map<string, ToolRun>();

  async save(run: ToolRun): Promise<ToolRun> {
    this.runs.set(run.id, structuredClone(run));
    return structuredClone(run);
  }

  async getById(id: string): Promise<ToolRun | undefined> {
    const run = this.runs.get(id);
    return run ? structuredClone(run) : undefined;
  }

  async listByUser(tenantId: string, userId: string, limit = 20): Promise<ToolRun[]> {
    return [...this.runs.values()]
      .filter((run) => run.tenantId === tenantId && run.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((r) => structuredClone(r));
  }

  async listByTool(tenantId: string, userId: string, toolId: string, limit = 20): Promise<ToolRun[]> {
    return [...this.runs.values()]
      .filter((run) => run.tenantId === tenantId && run.userId === userId && run.toolId === toolId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((r) => structuredClone(r));
  }
}
