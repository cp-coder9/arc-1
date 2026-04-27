/**
 * Gemini Multi-Agent Orchestration Service
 * Handles drawing review through specialized agents
 */

import { db } from "../lib/firebase";
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, addDoc, getDocs } from "firebase/firestore";
import { Agent, LLMConfig, LLMProvider, AIReviewResult, Submission, AICategory, AIIssue, TraceLog, KnowledgeCitation } from "../types";
import { getAgentKnowledge, webSearchForAgent, addKnowledge, getKnowledgeForAgents, incrementKnowledgeUsage } from "./knowledgeService";

// Progress reporting type
export interface AIProgress {
  percentage: number;
  agentName: string;
  activity: string;
  completedAgents: string[];
  thought?: string;
}

const MAX_RETRIES = 2;
const GEMINI_PROXY_URL = "/api/review";

// Default specialized agents configuration
export const SPECIALIZED_AGENTS: Partial<Agent>[] = [
  {
    role: 'orchestrator',
    name: 'Chief Architect Orchestrator',
    description: 'Coordinates specialized agents and synthesizes the final compliance report.',
    systemPrompt: 'You are the Chief Architect Orchestrator. Your role is to analyze the specialized reports from other agents and produce a final, coherent SANS 10400 compliance review. Ensure all identified issues are categorized correctly and provide a final pass/fail status.',
    temperature: 0.2,
    status: 'online'
  },
  {
    role: 'wall_checker',
    name: 'SANS 10400-K Wall Agent',
    description: 'Expert in wall construction, thicknesses, and damp-proofing.',
    systemPrompt: 'You are a SANS 10400-K specialist. Analyze the drawing for wall thicknesses, foundation details, and Damp Proof Course (DPC) compliance. Ensure walls meet structural and insulation requirements.',
    temperature: 0.1,
    status: 'online'
  },
  {
    role: 'window_checker',
    name: 'Fenestration & Ventilation Agent',
    description: 'Checks natural lighting (10%) and ventilation (5%) requirements.',
    systemPrompt: 'You are a fenestration expert. Calculate ventilation (5% of floor area) and natural lighting (10% of floor area) for every room. Check safety glazing for low-level windows as per SANS 10400-N.',
    temperature: 0.1,
    status: 'online'
  },
  {
    role: 'door_checker',
    name: 'Fire Safety & Egress Agent',
    description: 'Verifies fire doors, escape routes, and door swings.',
    systemPrompt: 'You are a Fire Safety specialist (SANS 10400-T). Check escape route widths, fire door ratings, and ensure door swings do not obstruct egress paths. Verify travel distances to exits.',
    temperature: 0.1,
    status: 'online'
  },
  {
    role: 'area_checker',
    name: 'Room Sizing & Ceiling Agent',
    description: 'Ensures minimum room sizes (6m2) and ceiling heights (2.4m).',
    systemPrompt: 'You are a space compliance agent. Verify that habitable rooms are at least 6m² and have a minimum ceiling height of 2.4m. Check occupancy density for different building classifications.',
    temperature: 0.1,
    status: 'online'
  },
  {
    role: 'compliance_checker',
    name: 'General Presentation Agent',
    description: 'Checks for north points, scale bars, and title block details.',
    systemPrompt: 'You are a technical drawing auditor. Verify the presence of a North Point, Scale Bar, correct Title Block information, and coordination between plan views and sections.',
    temperature: 0.1,
    status: 'online'
  },
  {
    role: 'sans_compliance',
    name: 'SANS 10400 National Regs Expert',
    description: 'Cross-references all building regulations and national standards.',
    systemPrompt: 'You are a general SANS 10400 compliance expert. Your role is to identify any miscellaneous regulatory failures not covered by specialized agents, focusing on National Building Regulations and Standards.',
    temperature: 0.1,
    status: 'online'
  }
];

export async function getLLMConfig(): Promise<LLMConfig> {
  try {
    const configDoc = await getDoc(doc(db, 'settings', 'llm_config'));
    if (configDoc.exists()) {
      return configDoc.data() as LLMConfig;
    }
  } catch (error) {
    console.error("Error fetching LLM config:", error);
  }

  return {
    provider: 'gemini',
    apiKey: '',
    model: 'gemini-1.5-pro-latest'
  };
}

export async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0) {
      console.warn(`Retrying after error: ${error}. Retries remaining: ${retries}`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return withRetry(fn, retries - 1);
    }
    throw error;
  }
}

export async function callGeminiProxy(systemInstruction: string, prompt: string, drawingUrl?: string, config?: LLMConfig, agent?: Agent): Promise<string> {
  const response = await fetch(GEMINI_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction,
      prompt,
      drawingUrl,
      config,
      agentId: agent?.id
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to call LLM proxy');
  }

  const data = await response.json();
  return data.text;
}

export async function callOpenAICompatible(config: LLMConfig, systemInstruction: string, prompt: string, drawingUrl?: string, agent?: Agent): Promise<string> {
  const isVisionModel = config.model.includes('vision') || config.provider === 'nvidia';

  const messages: any[] = [
    { role: 'system', content: systemInstruction },
    {
      role: 'user',
      content: drawingUrl && isVisionModel
        ? [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: drawingUrl } }
          ]
        : prompt
    }
  ];

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: agent?.temperature || 0.2
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to call OpenAI compatible provider');
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

export async function logSystemEvent(level: 'info' | 'warning' | 'error' | 'critical', source: string, message: string, metadata?: any) {
  try {
    await addDoc(collection(db, 'system_logs'), {
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      metadata: metadata || null
    });
  } catch (error) {
    console.error("Failed to log system event:", error);
  }
}

export function parseAIResponse(text: string): { status: string, feedback: string, categories: AICategory[], traceLog: string } {
  let cleanText = text.trim();
  const jsonMatch = cleanText.match(/```json\n([\s\S]*?)\n```/) || cleanText.match(/{[\s\S]*}/);

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      return {
        status: parsed.status || 'failed',
        feedback: parsed.feedback || 'No summary feedback provided.',
        categories: Array.isArray(parsed.categories) ? parsed.categories : [],
        traceLog: parsed.traceLog || 'Structure parsed from agent response.'
      };
    } catch (e) {
      console.warn("Failed to parse agent JSON:", e);
    }
  }

  const passed = text.toLowerCase().includes('"status": "passed"') || text.toLowerCase().includes('status: passed');

  return {
    status: passed ? 'passed' : 'failed',
    feedback: text.substring(0, 500),
    categories: [],
    traceLog: "Heuristic parsing applied to unstructured response."
  };
}

export async function seedAgents() {
  try {
    const agentsRef = collection(db, 'agents');
    const existingAgents = await getDocs(agentsRef);

    if (existingAgents.empty) {
      for (const agent of SPECIALIZED_AGENTS) {
        await addDoc(agentsRef, {
          ...agent,
          temperature: agent.temperature || 0.1,
          status: 'online',
          lastActive: new Date().toISOString()
        });
      }
    }
  } catch (error) {
    console.error("Error seeding agents:", error);
  }
}

export async function getAgentConfig(role: string, defaultAgent: Partial<Agent>): Promise<Agent> {
  try {
    const agentsRef = collection(db, 'agents');
    const q = query(agentsRef, where('role', '==', role));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const agentDoc = querySnapshot.docs[0];
      return { id: agentDoc.id, ...agentDoc.data() } as Agent;
    }
  } catch (error) {
    console.error(`Error fetching agent config for ${role}:`, error);
  }
  return { ...defaultAgent } as Agent;
}

export async function reviewDrawing(
  drawingUrl: string,
  drawingName: string,
  onProgress?: (progress: AIProgress) => void
): Promise<AIReviewResult> {
  const startTime = Date.now();

  try {
    const reportProgress = (percentage: number, agentName: string, activity: string, completedAgents: string[], thought?: string) => {
      if (onProgress) {
        onProgress({ percentage, agentName, activity, completedAgents, thought });
      }
    };

    const completed: string[] = [];
    reportProgress(5, 'Orchestrator', 'Initializing multi-agent workflow...', completed);

    await logSystemEvent('info', 'AI Orchestrator', `Starting multi-agent review for: ${drawingName}`, {
      drawingUrl,
      timestamp: new Date().toISOString()
    });

    const agentRoles = [
      'wall_checker',
      'window_checker',
      'door_checker',
      'area_checker',
      'compliance_checker',
      'sans_compliance'
    ];

    const globalConfig = await getLLMConfig();
    
    reportProgress(10, 'System', 'Loading specialized agent configurations...', completed);
    const agentConfigs = await Promise.all(agentRoles.map(role => {
      const def = SPECIALIZED_AGENTS.find(a => a.role === role) || { role, name: role, systemPrompt: '', temperature: 0.1 };
      return getAgentConfig(role, def);
    }));

    reportProgress(20, 'System', 'Activating specialized agents...', completed);
    
    let needsWebSearch = false;
    let webSearchQueries: { query: string, role: string, id: string }[] = [];
    const agentFindings: { role: string, name: string, findings: string, id?: string }[] = [];

    for (const agent of agentConfigs) {
      const getAgentThought = (role: string) => {
        const thoughts: Record<string, string[]> = {
          wall_checker: ["Checking wall thicknesses...", "Verifying DPC...", "Analyzing load paths..."],
          window_checker: ["Calculating ventilation...", "Measuring lighting...", "Checking safety glazing..."],
          door_checker: ["Verifying fire doors...", "Checking egress paths...", "Analyzing door swings..."],
          area_checker: ["Measuring room sizes...", "Checking ceiling heights...", "Verifying occupancy..."],
          compliance_checker: ["Searching for North Point...", "Analyzing title block...", "Checking coordination..."],
          sans_compliance: ["Cross-referencing SANS 10400...", "Validating Part A...", "Finalizing check..."]
        };
        const agentThoughts = thoughts[role] || ["Performing specialized analysis..."];
        return agentThoughts[Math.floor(Math.random() * agentThoughts.length)];
      };

      reportProgress(25, agent.name, `Analyzing drawing (Sector: ${agent.name})...`, completed, getAgentThought(agent.role));
      
      const isGlobalProvider = !agent.llmProvider || agent.llmProvider === 'global';
      const config: LLMConfig = {
        provider: isGlobalProvider ? globalConfig.provider : agent.llmProvider as LLMProvider,
        model: (isGlobalProvider || !agent.llmModel) ? globalConfig.model : agent.llmModel,
        apiKey: (isGlobalProvider || !agent.llmApiKey) ? globalConfig.apiKey : agent.llmApiKey,
        baseUrl: (isGlobalProvider || !agent.llmBaseUrl) ? globalConfig.baseUrl : agent.llmBaseUrl
      };

      try {
        const knowledgeEntries = await getAgentKnowledge(agent.role, 'active');
        const knowledgeContext = knowledgeEntries.length > 0
          ? `\n\nADDITIONAL LEARNED KNOWLEDGE:\n` +
          knowledgeEntries.map(k => `[${k.title}]: ${k.content}`).join('\n\n')
          : '';

        const enrichedPrompt = agent.systemPrompt + knowledgeContext;

        let response = '';
        const promptInstruction = `Identify compliance issues in this drawing: ${drawingName}. URL: ${drawingUrl}. If unsure, state "UNKNOWN_REGULATION: [Topic]".`;
        
        if (config.provider === 'gemini') {
          response = await callGeminiProxy(enrichedPrompt, promptInstruction, drawingUrl, config, agent);
        } else {
          response = await callOpenAICompatible(config, enrichedPrompt, promptInstruction, drawingUrl, agent);
        }
        
        completed.push(agent.name);
        reportProgress(20 + (completed.length * 10), agent.name, `${agent.name} completed.`, completed, "Sent to Orchestrator.");
        
        if (response.includes("UNKNOWN_REGULATION:")) {
          const match = response.match(/UNKNOWN_REGULATION:\s*(.+)/);
          if (match && match[1]) {
            needsWebSearch = true;
            webSearchQueries.push({ query: match[1], role: agent.role, id: agent.id! });
          }
        }

        agentFindings.push({ role: agent.role, name: agent.name, findings: response, id: agent.id });
      } catch (err) {
        console.error(`Agent ${agent.name} failed:`, err);
        agentFindings.push({ role: agent.role, name: agent.name, findings: `Error: Agent failed.`, id: agent.id });
      }
    }

    if (needsWebSearch && webSearchQueries.length > 0) {
      reportProgress(75, 'Orchestrator', 'Performing web research...', completed);
      for (const req of webSearchQueries) {
        if (req.id) {
           const searchResult = await webSearchForAgent(req.query, req.role, req.id);
           const targetFinding = agentFindings.find(f => f.role === req.role);
           if (targetFinding) targetFinding.findings += `\n\n[WEB SEARCH]: ${searchResult}`;
        }
      }
    }

    reportProgress(85, 'Orchestrator', 'Generating final report...', completed);
    const orchestratorAgent = await getAgentConfig('orchestrator', SPECIALIZED_AGENTS[0]);
    const orchConfig: LLMConfig = {
      provider: (orchestratorAgent.llmProvider === 'global' || !orchestratorAgent.llmProvider) ? globalConfig.provider : orchestratorAgent.llmProvider as LLMProvider,
      model: orchestratorAgent.llmModel || globalConfig.model,
      apiKey: orchestratorAgent.llmApiKey || globalConfig.apiKey,
      baseUrl: orchestratorAgent.llmBaseUrl || globalConfig.baseUrl,
    };

    const findingsContext = agentFindings.map(f => `### ${f.name} Findings:\n${f.findings}`).join('\n\n');
    const synthesisPrompt = `Specialized reports for ${drawingName}:\n\n${findingsContext}\n\nProduce final compliance report.`;

    let finalResponse = '';
    if (orchConfig.provider === 'gemini') {
      finalResponse = await callGeminiProxy(orchestratorAgent.systemPrompt, synthesisPrompt, drawingUrl, orchConfig, orchestratorAgent);
    } else {
      finalResponse = await callOpenAICompatible(orchConfig, orchestratorAgent.systemPrompt, synthesisPrompt, undefined, orchestratorAgent);
    }

    reportProgress(95, 'Orchestrator', 'Finalizing report...', completed);
    const result = parseAIResponse(finalResponse);
    const validStatus = result.status === 'passed' ? 'passed' : 'failed';

    const allKnowledge = await getKnowledgeForAgents(agentRoles, 'active');

    try {
      if (orchestratorAgent.id) {
        await addKnowledge({
          agentId: orchestratorAgent.id,
          agentRole: orchestratorAgent.role,
          title: `Review Summary for ${drawingName}`,
          content: `Reviewed ${drawingName}. Status: ${validStatus}.`,
          source: 'self_improvement',
          status: 'pending_review',
          submittedBy: 'system',
          submittedByRole: 'system',
          tags: ['review_summary', validStatus],
          createdAt: new Date().toISOString()
        });
      }
    } catch (e) {}

    await Promise.all(agentConfigs.concat(orchestratorAgent).map(agent => {
      if (!agent.id) return Promise.resolve();
      return updateDoc(doc(db, 'agents', agent.id), { currentActivity: 'Idle', lastActive: new Date().toISOString() });
    }));

    const duration = Date.now() - startTime;
    reportProgress(100, 'Orchestrator', `Complete (${Math.round(duration / 1000)}s).`, completed);

    return {
      status: validStatus,
      feedback: result.feedback || 'AI Review completed.',
      categories: result.categories,
      traceLog: result.traceLog,
      citations: allKnowledge.map(k => ({
        knowledgeId: k.id,
        title: k.title,
        content: k.content,
        source: k.source,
        sourceUrl: k.sourceUrl,
        pdfUrl: k.pdfUrl,
        pdfPageNumber: k.pdfPageNumber,
        tags: k.tags
      })),
      knowledgeSources: allKnowledge.map(k => `[${k.title}](${k.pdfUrl || k.sourceUrl || 'KB'})`)
    };
  } catch (error) {
    return {
      status: 'failed',
      feedback: `Orchestration error.`,
      categories: [],
      traceLog: `Failed.`
    };
  }
}

export const AIUtils = {
  parseAIResponse,
  withRetry,
  callGeminiProxy,
  callOpenAICompatible
};
