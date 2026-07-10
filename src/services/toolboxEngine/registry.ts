import type { ToolDefinition } from './types';

export class ToolDefinitionRegistry {
  private definitions = new Map<string, ToolDefinition>();

  register(definition: ToolDefinition): void {
    if (this.definitions.has(definition.id)) {
      throw new Error(`Duplicate tool definition: ${definition.id}`);
    }
    if (!definition.route.startsWith('/toolbox/standalone/')) {
      throw new Error(`Tool ${definition.id} must use a direct standalone route`);
    }
    if (definition.tags.length < 3) {
      throw new Error(`Tool ${definition.id} needs at least 3 tags for tile display`);
    }
    this.definitions.set(definition.id, definition);
  }

  getRequired(toolId: string): ToolDefinition {
    const tool = this.definitions.get(toolId);
    if (!tool) throw new Error(`Unknown toolbox tool '${toolId}'. Production must not fall back to a placeholder runner.`);
    return tool;
  }

  /** Non-throwing lookup: returns the definition or undefined. */
  getDefinition(toolId: string): ToolDefinition | undefined {
    return this.definitions.get(toolId);
  }

  listForRole(role: string): ToolDefinition[] {
    return [...this.definitions.values()].filter((tool) => tool.roles.includes(role));
  }

  search(role: string, query: string): ToolDefinition[] {
    const q = query.toLowerCase();
    return this.listForRole(role).filter((tool) =>
      [tool.name, tool.description, tool.category, ...tool.tags].join(' ').toLowerCase().includes(q)
    );
  }

  listAll(): ToolDefinition[] {
    return [...this.definitions.values()];
  }
}

export class ToolRouteRegistry {
  constructor(private readonly definitions: ToolDefinitionRegistry) {}

  resolve(toolId: string, params: { projectId?: string } = {}): string {
    const tool = this.definitions.getRequired(toolId);
    const url = new URL(`https://architex.local${tool.route}`);
    if (params.projectId) url.searchParams.set('projectId', params.projectId);
    return `${url.pathname}${url.search}`;
  }
}
