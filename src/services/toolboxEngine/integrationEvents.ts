import { createId, iso } from './ids';
import type { GovernanceProfile, IntegrationEvent, ToolContext, ToolRun } from './types';

/**
 * Status of an integration event delivery attempt.
 */
export type IntegrationEventStatus = 'delivered' | 'pending_retry' | 'failed';

/**
 * Result of attempting to deliver a single integration event.
 */
export interface IntegrationEventResult {
  event: IntegrationEvent;
  status: IntegrationEventStatus;
  attempts: number;
  /** Preserved payload for manual reprocessing when status is 'failed'. */
  preservedPayload?: Record<string, unknown>;
}

/**
 * Interface for the downstream writer that persists integration events.
 * Implementations can be Firestore-backed, in-memory (tests), or stubs.
 */
export interface IntegrationEventWriter {
  /** Write an integration event to the appropriate downstream target. Throws on failure. */
  write(event: IntegrationEvent): Promise<void>;
}

/**
 * Interface for emitting Action Centre alerts when retries are exhausted.
 */
export interface ActionCentreAlerter {
  /** Emit an alert to the Action Centre for the specified user. */
  alert(userId: string, tenantId: string, message: string, payload: Record<string, unknown>): Promise<void>;
}

/**
 * Default delay function using setTimeout. Can be overridden for testing.
 */
function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Configuration for the IntegrationEventBus.
 */
export interface IntegrationEventBusConfig {
  /** Optional writer for persisting events downstream. When absent, events are stored in-memory only. */
  writer?: IntegrationEventWriter;
  /** Optional alerter for Action Centre notifications on retry exhaustion. */
  alerter?: ActionCentreAlerter;
  /** Optional delay function (for testing — avoids real timers). Defaults to setTimeout-based delay. */
  delayFn?: (ms: number) => Promise<void>;
  /** Maximum number of retry attempts (default: 3). */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000). Delays are base * 2^attempt. */
  baseDelayMs?: number;
}

export class IntegrationEventBus {
  readonly events: IntegrationEvent[] = [];
  readonly results: IntegrationEventResult[] = [];

  private readonly writer?: IntegrationEventWriter;
  private readonly alerter?: ActionCentreAlerter;
  private readonly delayFn: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;

  constructor(config: IntegrationEventBusConfig = {}) {
    this.writer = config.writer;
    this.alerter = config.alerter;
    this.delayFn = config.delayFn ?? defaultDelay;
    this.maxRetries = config.maxRetries ?? 3;
    this.baseDelayMs = config.baseDelayMs ?? 1000;
  }

  /**
   * Emit integration events for a completed/issued ToolRun, respecting the
   * GovernanceProfile's downstreamWriteBack array. Only emits to targets listed
   * in the governance profile.
   *
   * Implements retry with exponential backoff (1s, 2s, 4s) on Firestore write errors.
   *
   * Requirements: 6.1–6.7
   */
  async emitForRun(run: ToolRun, governance: GovernanceProfile, message: string): Promise<IntegrationEventResult[]> {
    const targets = governance.downstreamWriteBack;
    if (!targets || targets.length === 0) {
      return [];
    }

    const eventsToEmit: IntegrationEvent[] = [];

    for (const target of targets) {
      const event = this.buildEvent(target, run, message);
      if (event) {
        eventsToEmit.push(event);
      }
    }

    // Persist in local event log
    this.events.push(...eventsToEmit);

    // Attempt delivery with retry for each event
    const deliveryResults: IntegrationEventResult[] = [];
    for (const event of eventsToEmit) {
      const result = await this.deliverWithRetry(event, run);
      deliveryResults.push(result);
    }

    this.results.push(...deliveryResults);
    return deliveryResults;
  }

  /**
   * Emit an AuditTrail Integration_Event with the audit snapshot hash
   * when a ToolRun is successfully locked/issued.
   * (Requirement 10.5)
   */
  emitAuditTrailForSnapshot(run: ToolRun): IntegrationEvent {
    const event: IntegrationEvent = {
      id: createId('audittrail'),
      type: 'AuditTrail',
      tenantId: run.tenantId,
      userId: run.userId,
      toolRunId: run.id,
      message: `ToolRun issued and locked with audit snapshot.`,
      payload: {
        toolId: run.toolId,
        action: 'ISSUED_LOCKED',
        snapshotHash: run.auditSnapshot?.hash ?? null,
        issuedAt: run.issuedAt,
      },
      createdAt: iso(),
    };
    this.events.push(event);
    return event;
  }

  /**
   * Emit a PLACEHOLDER_DETECTED Integration_Event for tools whose Calculator_Definition
   * status is not 'full' or 'preview', or whose registry entry lacks a calculatorDefinitionId.
   * (Requirement 2.4)
   */
  emitPlaceholderDetected(toolId: string, context: ToolContext): IntegrationEvent {
    const event: IntegrationEvent = {
      id: createId('audittrail'),
      type: 'AuditTrail',
      tenantId: context.tenantId,
      userId: context.userId,
      toolRunId: '',
      message: `PLACEHOLDER_DETECTED: Tool '${toolId}' does not have a full or preview Calculator_Definition.`,
      payload: { toolId, action: 'PLACEHOLDER_DETECTED' },
      createdAt: iso(),
    };
    this.events.push(event);
    return event;
  }

  // ── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Build an IntegrationEvent for a specific downstream target.
   * Returns null if the target should be skipped (e.g. ProjectRecord without internal-project assignment).
   */
  private buildEvent(target: 'ProjectRecord' | 'Inbox' | 'AuditTrail', run: ToolRun, message: string): IntegrationEvent | null {
    switch (target) {
      case 'ProjectRecord':
        return this.buildProjectRecordEvent(run, message);
      case 'Inbox':
        return this.buildInboxEvent(run, message);
      case 'AuditTrail':
        return this.buildAuditTrailEvent(run, message);
      default:
        return null;
    }
  }

  /**
   * Build a ProjectRecord event. Only emits when the run has an internal-project assignment.
   * Includes tool name, run status, result summary (≤500 chars), and link to ToolRun.
   * (Requirement 6.2)
   */
  private buildProjectRecordEvent(run: ToolRun, message: string): IntegrationEvent | null {
    if (run.assignment.mode !== 'internal-project') {
      return null;
    }

    const resultSummary = this.buildResultSummary(run);

    return {
      id: createId('projectrecord'),
      type: 'ProjectRecord',
      tenantId: run.tenantId,
      userId: run.userId,
      toolRunId: run.id,
      message,
      payload: {
        projectId: run.assignment.projectId,
        projectName: run.assignment.projectName,
        toolId: run.toolId,
        toolName: run.toolId,
        runStatus: run.status,
        resultSummary,
        runLink: `/api/toolbox/runs/${run.id}`,
      },
      createdAt: iso(),
    };
  }

  /**
   * Build an Inbox event.
   * - If run has internal-project assignment: action item for project team.
   * - If run has no project: action item for executing user only.
   * (Requirements 6.3, 6.4)
   */
  private buildInboxEvent(run: ToolRun, message: string): IntegrationEvent {
    const isProjectScoped = run.assignment.mode === 'internal-project';

    return {
      id: createId('inbox'),
      type: 'Inbox',
      tenantId: run.tenantId,
      userId: run.userId,
      toolRunId: run.id,
      message,
      payload: {
        subject: `Tool run ${run.status}: ${run.toolId}`,
        toolId: run.toolId,
        toolName: run.toolId,
        runLink: `/api/toolbox/runs/${run.id}`,
        scope: isProjectScoped ? 'project-team' : 'executing-user',
        projectId: isProjectScoped ? run.assignment.projectId : undefined,
        projectName: isProjectScoped ? run.assignment.projectName : undefined,
        targetUserId: isProjectScoped ? undefined : run.userId,
      },
      createdAt: iso(),
    };
  }

  /**
   * Build an immutable AuditTrail record with userId, toolId, runId, action,
   * timestamp, and snapshot hash.
   * (Requirement 6.5)
   */
  private buildAuditTrailEvent(run: ToolRun, message: string): IntegrationEvent {
    return {
      id: createId('audittrail'),
      type: 'AuditTrail',
      tenantId: run.tenantId,
      userId: run.userId,
      toolRunId: run.id,
      message,
      payload: {
        userId: run.userId,
        toolId: run.toolId,
        runId: run.id,
        action: run.status === 'issued' ? 'ISSUED' : 'COMPLETED',
        timestamp: iso(),
        auditHash: run.auditSnapshot?.hash ?? null,
      },
      createdAt: iso(),
    };
  }

  /**
   * Deliver an event with retry and exponential backoff.
   * Retry intervals: 1s, 2s, 4s (baseDelay * 2^retryIndex).
   *
   * - On success: status = 'delivered'
   * - During retries: status = 'pending_retry'
   * - After all retries exhausted: status = 'failed', alert emitted
   *
   * (Requirements 6.6, 6.7)
   */
  private async deliverWithRetry(event: IntegrationEvent, run: ToolRun): Promise<IntegrationEventResult> {
    if (!this.writer) {
      // No writer configured — treat as delivered (in-memory mode)
      return { event, status: 'delivered', attempts: 1 };
    }

    let attempts = 0;
    const totalAttempts = 1 + this.maxRetries; // 1 initial + maxRetries

    for (let i = 0; i < totalAttempts; i++) {
      attempts = i + 1;

      try {
        await this.writer.write(event);
        return { event, status: 'delivered', attempts };
      } catch {
        // If this is NOT the last attempt, delay and retry
        if (i < totalAttempts - 1) {
          const delayMs = this.baseDelayMs * Math.pow(2, i);
          await this.delayFn(delayMs);
        }
      }
    }

    // All attempts exhausted — mark as failed
    const result: IntegrationEventResult = {
      event,
      status: 'failed',
      attempts,
      preservedPayload: { ...event.payload },
    };

    // Emit Action Centre alert for the triggering user (Requirement 6.7)
    if (this.alerter) {
      try {
        await this.alerter.alert(
          run.userId,
          run.tenantId,
          `Integration event delivery failed after ${attempts} attempts: ${event.type} for run ${run.id}`,
          { eventId: event.id, eventType: event.type, toolRunId: run.id, toolId: run.toolId }
        );
      } catch {
        // Alert failure is non-fatal — event is already marked failed
      }
    }

    return result;
  }

  /**
   * Build a result summary string, capped at 500 characters.
   */
  private buildResultSummary(run: ToolRun): string {
    if (!run.output) {
      return `Tool run ${run.status}. No output available.`;
    }

    let summary: string;
    try {
      const output = run.output as Record<string, unknown>;
      const parts: string[] = [];

      if (output.aggregates && typeof output.aggregates === 'object') {
        const aggEntries = Object.entries(output.aggregates as Record<string, unknown>);
        const aggSummary = aggEntries
          .slice(0, 5)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        parts.push(`Aggregates: ${aggSummary}`);
      }

      if (Array.isArray(output.lineResults)) {
        parts.push(`${output.lineResults.length} line result(s)`);
      }

      if (Array.isArray(output.clauseResults)) {
        parts.push(`${output.clauseResults.length} clause result(s)`);
      }

      summary = parts.length > 0 ? parts.join('. ') : JSON.stringify(output);
    } catch {
      summary = `Tool run ${run.status}`;
    }

    // Cap at 500 characters
    if (summary.length > 500) {
      return summary.slice(0, 497) + '...';
    }
    return summary;
  }
}
