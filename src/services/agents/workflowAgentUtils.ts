import { Agent, LLMConfig, WorkflowAgentConfig } from '@/types';
import { callGeminiProxy, getAgentConfig, getLLMConfig, SYSTEM_GUARDRAILS } from '../geminiService';

export function extractJsonObject(text: string): unknown | null {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

export function sanitizeText(value: unknown, fallback = '', maxLength = 1200): string {
  if (typeof value !== 'string') return fallback;
  return value.replace(/[<>]/g, '').trim().slice(0, maxLength) || fallback;
}

export function sanitizeStringArray(value: unknown, fallback: string[], maxItems = 12): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value.map((item) => sanitizeText(item, '', 180)).filter(Boolean).slice(0, maxItems);
  return items.length ? items : fallback;
}

export function finiteNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export async function callWorkflowAgent(config: WorkflowAgentConfig, prompt: string): Promise<string | null> {
  try {
    const agent = await getAgentConfig(config.role, {
      role: config.role,
      name: config.name,
      description: config.description,
      systemPrompt: config.systemPrompt,
      temperature: config.temperature,
    });
    const globalConfig: LLMConfig = await getLLMConfig();
    if (globalConfig.provider !== 'gemini') return null;
    return await callGeminiProxy(`${SYSTEM_GUARDRAILS}\n\n${agent.systemPrompt || config.systemPrompt}`, prompt, undefined, globalConfig, agent as Agent);
  } catch (error) {
    console.warn(`Workflow agent ${config.role} unavailable:`, error);
    return null;
  }
}
