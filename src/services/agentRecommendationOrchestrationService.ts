import type { AgentOutput, WorkflowRecord } from '../types/agentOrchestration';
import type { AgentRecommendation } from '../types/architexMasterTypes';

let seq = 1;

export function recommend(
  agentKey: string,
  firstTitle: string,
  records: WorkflowRecord[],
): AgentOutput[] {
  const outputs: AgentOutput[] = [
    {
      outputId: `agent-output-${seq++}`,
      agentKey,
      title: firstTitle,
      rationale: 'Workflow state contains approvals, blockers or next actions requiring human review.',
      sourceObjectId: records[0]?.id ?? 'none',
      severity: 'high',
    },
  ];

  for (const record of records.filter((r) => r.blockers.length > 0).slice(0, 3)) {
    outputs.push({
      outputId: `agent-output-${seq++}`,
      agentKey,
      title: `Clear blocker: ${record.title}`,
      rationale: record.blockers.join('; '),
      sourceObjectId: record.id,
      severity: 'high',
    });
  }

  return outputs;
}

export function agentOutputToRecommendation(
  output: AgentOutput,
  projectId: string,
): AgentRecommendation {
  return {
    id: output.outputId,
    scope: 'project',
    title: output.title,
    rationale: output.rationale,
    priority: output.severity,
    recommendedActionLabel: 'Review in agent console',
    relatedRoute: `/projects/${projectId}/agent-orchestration`,
    requiresHumanApproval: output.severity === 'critical',
  };
}
