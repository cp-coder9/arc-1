import { JobCategory, WorkflowAgentConfig } from '@/types';
import { callWorkflowAgent, extractJsonObject, finiteNumber, sanitizeStringArray, sanitizeText } from './workflowAgentUtils';

export interface BriefAnalysis {
  suggestedCategory: JobCategory;
  requirements: string[];
  estimatedBudget: { min: number; max: number };
  scopeNotes: string;
}

const CATEGORIES: JobCategory[] = ['Residential', 'Commercial', 'Industrial', 'Renovation', 'Interior', 'Landscape'];

export const BRIEFING_AGENT_CONFIG: WorkflowAgentConfig = {
  role: 'briefing_agent',
  name: 'Briefing Agent',
  description: 'Structures client project briefs into advisory scope, category, budget range, and requirements.',
  systemPrompt: 'Analyze South African architectural project descriptions. Return JSON only: {suggestedCategory, requirements, estimatedBudget:{min,max}, scopeNotes}. Values are advisory, not quotes.',
  activeInStages: ['intake', 'scoping'],
  triggerEvents: ['brief_submitted', 'stage_entered'],
  temperature: 0.2,
};

function inferCategory(description: string): JobCategory {
  const text = description.toLowerCase();
  if (/office|shop|retail|restaurant|commercial/.test(text)) return 'Commercial';
  if (/factory|warehouse|industrial|workshop/.test(text)) return 'Industrial';
  if (/renovat|alteration|extension|remodel/.test(text)) return 'Renovation';
  if (/interior|fit[- ]?out|kitchen|bathroom/.test(text)) return 'Interior';
  if (/landscape|garden|pool|outdoor/.test(text)) return 'Landscape';
  return 'Residential';
}

function deterministicBrief(description: string): BriefAnalysis {
  const category = inferCategory(description);
  const base = category === 'Commercial' ? 350000 : category === 'Industrial' ? 600000 : category === 'Renovation' ? 180000 : category === 'Interior' ? 120000 : category === 'Landscape' ? 90000 : 250000;
  return {
    suggestedCategory: category,
    requirements: ['Confirm site address and erf details', 'Define required drawings and council submission scope', 'Confirm appointment, budget, deadline, and statutory constraints'],
    estimatedBudget: { min: base, max: Math.round(base * 1.8) },
    scopeNotes: 'Advisory brief analysis generated from supplied description. A registered professional must confirm scope, fees, and statutory requirements.',
  };
}

export async function analyzeBrief(description: string): Promise<BriefAnalysis> {
  const fallback = deterministicBrief(description);
  if (!description.trim()) return fallback;
  const response = await callWorkflowAgent(BRIEFING_AGENT_CONFIG, `Project description:\n${description.slice(0, 6000)}`);
  const parsed = response ? extractJsonObject(response) as any : null;
  if (!parsed) return fallback;
  const category = CATEGORIES.includes(parsed.suggestedCategory) ? parsed.suggestedCategory : fallback.suggestedCategory;
  const min = Math.max(0, Math.round(finiteNumber(parsed.estimatedBudget?.min, fallback.estimatedBudget.min)));
  const max = Math.max(min, Math.round(finiteNumber(parsed.estimatedBudget?.max, fallback.estimatedBudget.max)));
  return {
    suggestedCategory: category,
    requirements: sanitizeStringArray(parsed.requirements, fallback.requirements),
    estimatedBudget: { min, max },
    scopeNotes: sanitizeText(parsed.scopeNotes, fallback.scopeNotes),
  };
}
