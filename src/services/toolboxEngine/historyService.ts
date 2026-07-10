import type { ToolRunRepository } from './repository';

export class RunHistoryService {
  constructor(private readonly repository: ToolRunRepository) {}

  async recentRuns(tenantId: string, userId: string, limit = 5): Promise<import('./types').ToolRun[]> {
    return this.repository.listByUser(tenantId, userId, limit);
  }

  async runCountForTile(tenantId: string, userId: string, toolId: string): Promise<number> {
    const result = await this.repository.listByTool({ tenantId, userId, toolId, pageSize: 50 });
    // Note: this returns at most 50 — for a true count, a dedicated countByTool query is needed
    return result.items.length;
  }
}
