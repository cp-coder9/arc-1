import type { ToolRunRepository } from './repository';

export class RunHistoryService {
  constructor(private readonly repository: ToolRunRepository) {}

  async recentRuns(tenantId: string, userId: string, limit = 5): Promise<import('./types').ToolRun[]> {
    return this.repository.listByUser(tenantId, userId, limit);
  }

  async runCountForTile(tenantId: string, userId: string, toolId: string): Promise<number> {
    return (await this.repository.listByTool(tenantId, userId, toolId, 1000)).length;
  }
}
