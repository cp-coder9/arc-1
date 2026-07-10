import type { ToolRun, PaginatedResult, ListByToolParams, ListByProjectParams } from './types';

export interface ToolRunRepository {
  save(run: ToolRun): Promise<ToolRun>;
  getById(id: string, tenantId?: string): Promise<ToolRun | undefined>;
  listByUser(tenantId: string, userId: string, limit?: number): Promise<ToolRun[]>;
  listByTool(params: ListByToolParams): Promise<PaginatedResult<ToolRun>>;
  listByProject(params: ListByProjectParams): Promise<PaginatedResult<ToolRun>>;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function clampPageSize(pageSize?: number): number {
  const size = pageSize ?? DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(1, size), MAX_PAGE_SIZE);
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

  async listByTool(params: ListByToolParams): Promise<PaginatedResult<ToolRun>> {
    const { tenantId, userId, toolId, pageSize, cursor } = params;
    const limit = clampPageSize(pageSize);

    let filtered = [...this.runs.values()]
      .filter((run) => run.tenantId === tenantId && run.userId === userId && run.toolId === toolId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (cursor) {
      const cursorIndex = filtered.findIndex((r) => r.createdAt < cursor);
      filtered = cursorIndex >= 0 ? filtered.slice(cursorIndex) : [];
    }

    const items = filtered.slice(0, limit).map((r) => structuredClone(r));
    const hasMore = filtered.length > limit;
    const lastItem = items[items.length - 1];

    return {
      items,
      cursor: lastItem ? lastItem.createdAt : null,
      hasMore,
    };
  }

  async listByProject(params: ListByProjectParams): Promise<PaginatedResult<ToolRun>> {
    const { tenantId, projectId, pageSize, cursor } = params;
    const limit = clampPageSize(pageSize);

    let filtered = [...this.runs.values()]
      .filter((run) => run.tenantId === tenantId && run.assignment.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (cursor) {
      const cursorIndex = filtered.findIndex((r) => r.createdAt < cursor);
      filtered = cursorIndex >= 0 ? filtered.slice(cursorIndex) : [];
    }

    const items = filtered.slice(0, limit).map((r) => structuredClone(r));
    const hasMore = filtered.length > limit;
    const lastItem = items[items.length - 1];

    return {
      items,
      cursor: lastItem ? lastItem.createdAt : null,
      hasMore,
    };
  }
}
