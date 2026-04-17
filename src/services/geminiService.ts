import { db, auth } from "../lib/firebase";
import { getAgentKnowledge, webSearchForAgent, addKnowledge } from "./knowledgeService";
import { doc, getDoc, collection, getDocs, query, where, addDoc, updateDoc } from "firebase/firestore";
import { getIdToken } from "firebase/auth";
import { Agent, AICategory, AIIssue, AIReviewResult, LLMConfig, LLMProvider } from "../types";

// Helper function to get authorization headers from agent config
function getAuthorizationHeader(agent: Agent): Record<string, string> {
  if (!agent.authorizationType || !agent.authorizationValue) {
    return {};
  }

  switch (agent.authorizationType) {
    case 'bearer':
      return { 'Authorization': `Bearer ${agent.authorizationValue}` };
    case 'api_key':
      return { 'Api-Key': agent.authorizationValue };
    case 'custom':
      if (agent.authorizationHeader) {
        return { [agent.authorizationHeader]: agent.authorizationValue };
      }
      return {};
    default:
      return {};
  }
}

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

async function getLLMConfig(): Promise<LLMConfig> {
  try {
    const docRef = doc(db, 'system_settings', 'llm_config');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as LLMConfig;
    }
  } catch (error) {
    console.error("Error fetching LLM config:", error);
  }
  return {
    provider: 'gemini',
    apiKey: '',
    model: 'gemini-2.0-flash'
  };
}

// Retry wrapper for API calls
async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0) {
      console.log(`Retrying... ${retries} attempts remaining`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return withRetry(fn, retries - 1);
    }
    throw error;
  }
}

// Server-side Gemini proxy - API key is protected on server
async function callGeminiProxy(systemInstruction: string, prompt: string, drawingUrl?: string, config?: LLMConfig, agent?: Agent): Promise<string> {
  // Require an authenticated Firebase user before touching the endpoint.
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error(
      'Authentication required: you must be signed in to run an AI review. ' +
      'Please sign in and try again.'
    );
  }

  // Obtain a fresh ID token (auto-refreshed by the Firebase SDK if needed).
  const idToken = await getIdToken(currentUser);

  return withRetry(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    try {
      // Get agent configuration if available
      const agentToUse = agent || await getAgentConfig('orchestrator', SPECIALIZED_AGENTS[0]);
      const authorizationHeader = getAuthorizationHeader(agentToUse);

      const response = await fetch('/api/gemini/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
          ...authorizationHeader
        },
        body: JSON.stringify({
          systemInstruction,
          prompt,
          drawingUrl,
          config
        }),
        signal: controller.signal
      });


      clearTimeout(timeoutId);

      if (response.status === 401) {
        throw new Error(
          'Authentication required: the review endpoint rejected your session. ' +
          'Please sign out, sign back in, and try again.'
        );
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Gemini Proxy Error: ${response.status} ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();

      // Handle different Gemini API response formats
      // Format 1: Standard generateContent response
      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text;
      }

      // Format 2: Response might be already parsed JSON
      if (data.text) {
        return data.text;
      }

      // Format 3: Direct JSON response
      if (typeof data === 'object') {
        return JSON.stringify(data);
      }

      throw new Error('Invalid response format from Gemini API: ' + JSON.stringify(data).substring(0, 200));
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  });
}

async function callOpenAICompatible(config: LLMConfig, systemInstruction: string, prompt: string, drawingUrl?: string, agent?: Agent): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Authentication required for AI review.');
  }

  const idToken = await getIdToken(currentUser);

  return withRetry(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      // Get agent configuration if available
      const agentToUse = agent || await getAgentConfig('orchestrator', SPECIALIZED_AGENTS[0]);
      const authorizationHeader = getAuthorizationHeader(agentToUse);

      const response = await fetch('/api/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
          ...authorizationHeader
        },
        body: JSON.stringify({
          systemInstruction,
          prompt,
          drawingUrl, // Send drawingUrl to the proxy so it can fetch/encode it
          config // Pass the config so the server knows which provider/model to use
        }),
        signal: controller.signal
      });


      clearTimeout(timeoutId);

      if (response.status === 401) {
        throw new Error('Authentication required: session rejected.');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`LLM Proxy Error: ${response.status} ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();

      // OpenAI format
      if (data.choices && data.choices[0]?.message?.content) {
        return data.choices[0].message.content;
      }

      throw new Error('Invalid response format from OpenAI-compatible API');
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  });
}

export async function logSystemEvent(level: 'info' | 'warning' | 'error' | 'critical', source: string, message: string, metadata?: any) {
  try {
    await addDoc(collection(db, 'system_logs'), {
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      metadata: metadata || {}
    });
  } catch (error) {
    console.error("Failed to log system event:", error);
  }
}

export interface AIProgress {
  percentage: number;
  agentName: string;
  activity: string;
  thought?: string;
  completedAgents: string[];
}


export const SPECIALIZED_AGENTS = [
  {
    name: "Orchestrator",
    role: "orchestrator",
    description: "Main coordinator for architectural compliance checks.",
    systemPrompt: `You are the AI Orchestrator for SANS 10400 compliance checking.

Your role is to coordinate specialized agent findings and produce a structured JSON compliance report.

CRITICAL RULES:
1. You MUST output ONLY valid JSON — no markdown, no preamble, no explanation outside the JSON.
2. Start your response with { and end with } — nothing else.
3. The JSON must have these exact fields: status, feedback, categories, traceLog
4. status must be either "passed" or "failed"
5. If ANY compliance issue is found, status must be "failed"
6. Only use "passed" if drawing is fully compliant
7. For each issue, you MUST provide a "boundingBox": { "x": number, "y": number, "width": number, "height": number }
   - Use normalized coordinates (0.0 to 1.0) relative to the image dimensions.
   - x: left, y: top, width, height.

Example output (output ONLY this structure, nothing else):
{
  "status": "failed",
  "feedback": "Drawing has compliance issues...",
  "categories": [
    {
      "name": "Wall Compliance",
      "issues": [
        {
          "description": "External wall thickness is less than 230mm",
          "severity": "high",
          "actionItem": "Increase external wall thickness to minimum 230mm per SANS 10400-K",
          "boundingBox": { "x": 0.15, "y": 0.22, "width": 0.05, "height": 0.3 }
        }
      ]
    }
  ],
  "traceLog": "Orchestrator synthesized findings from specialized agents..."
}`,
    temperature: 0.2
  },
  {
    name: "Wall Compliance Agent",
    role: "wall_checker",
    description: "Checks wall thickness, materials, and SANS 10400-K compliance.",
    systemPrompt: `You are a Wall Compliance Specialist focusing on SANS 10400-K.

CHECK FOR:
1. External walls: Minimum 230mm thickness for single storey, 290mm for double storey
2. Internal walls: Minimum 110mm thickness
3. Damp-proof courses (DPC) at foundation and window sill levels
4. Masonry quality and mortar specifications
5. Cavity wall construction where applicable

Output findings as structured text describing any violations found.`,
    temperature: 0.1
  },
  {
    name: "Fenestration & Window Agent",
    role: "window_checker",
    description: "Checks window sizes, ventilation, and SANS 10400-N compliance.",
    systemPrompt: `You are a Fenestration Specialist focusing on SANS 10400-N.

CHECK FOR:
1. Natural ventilation: Minimum 5% of floor area as openable window/door area
2. Natural lighting: Minimum 10% of floor area as glazing
3. Window height: Maximum 1m from floor level for safety
4. Safety glazing in hazardous locations
5. Window sizes in habitable rooms (minimum 1.5m² or 10% of floor area)

Output findings as structured text describing any violations found.`,
    temperature: 0.1
  },
  {
    name: "Door & Fire Safety Agent",
    role: "door_checker",
    description: "Checks door dimensions and fire ratings (SANS 10400-T).",
    systemPrompt: `You are a Door and Fire Safety Specialist focusing on SANS 10400-T.

CHECK FOR:
1. Fire doors: Minimum rating of 30 minutes where required
2. Escape routes: Minimum width 900mm clear opening
3. Travel distances to exits: Maximum 45m from any point
4. Door swing direction: Must open in direction of travel for exits
5. Threshold heights: Maximum 15mm for accessibility

Output findings as structured text describing any violations found.`,
    temperature: 0.1
  },
  {
    name: "Area & Room Sizing Agent",
    role: "area_checker",
    description: "Checks minimum room sizes and ceiling heights (SANS 10400-C).",
    systemPrompt: `You are an Area and Room Sizing Specialist focusing on SANS 10400-C.

CHECK FOR:
1. Habitable rooms: Minimum 6m² floor area
2. Ceiling height: Minimum 2.4m (2.1m over 25% of area allowed)
3. Kitchen: Minimum 5m² with minimum 1.5m workspace width
4. Bathroom: Minimum 3.5m² with proper clearances
5. Passage widths: Minimum 900mm

Output findings as structured text describing any violations found.`,
    temperature: 0.1
  },
  {
    name: "General Compliance Agent",
    role: "compliance_checker",
    description: "Overall SANS 10400 and Council readiness check.",
    systemPrompt: `You are a General Compliance Specialist for SANS 10400-A and council submissions.

CHECK FOR:
1. Title block with project name, architect details, date
2. North point indicator
3. Scale bar and scale notation
4. Site address and erf number
5. Drawing numbering system
6. SACAP registration number if applicable
7. Professional indemnity insurance indication

Output findings as structured text describing any violations found.`,
    temperature: 0.1
  },
  {
    name: "SANS Compliance Specialist",
    role: "sans_compliance",
    description: "Specialist in SANS 10400 regulations, room sizes, and fire safety.",
    systemPrompt: `You are a SANS Compliance Specialist with comprehensive knowledge of SANS 10400.

Your role is to cross-reference findings from other agents with the specific SANS 10400 regulations.

Focus areas:
- SANS 10400-A: General principles
- SANS 10400-C: Dimensions
- SANS 10400-K: Walls
- SANS 10400-N: Glazing and ventilation
- SANS 10400-T: Fire protection
- SANS 10400-V: Structural design

Identify any gaps or conflicts in compliance across different SANS parts.

Output findings as structured text describing any additional violations found.`,
    temperature: 0.1
  }
];

export async function seedAgents() {
  try {
    const q = query(collection(db, 'agents'));
    const snap = await getDocs(q);
    const existingRoles = snap.docs.map(doc => doc.data().role);

    for (const agent of SPECIALIZED_AGENTS) {
      if (!existingRoles.includes(agent.role)) {
        const roleKeys: Record<string, string> = {
          orchestrator: 'orchestrator-key',
          wall_checker: 'wall-checker-key',
          window_checker: 'window-checker-key',
          door_checker: 'door-checker-key',
          area_checker: 'area-checker-key',
          compliance_checker: 'compliance-checker-key',
          sans_compliance: 'sans-specialist-key'
        };

        await addDoc(collection(db, 'agents'), {
          ...agent,
          status: 'online',
          lastActive: new Date().toISOString(),
          currentActivity: 'Idle',
          authorizationType: 'api_key',
          authorizationValue: roleKeys[agent.role] || 'default-agent-key'
        });
      }
    }

    if (snap.empty) {
      await logSystemEvent('info', 'System', 'Specialized agents seeded successfully.');
    }
  } catch (error) {
    console.error("Failed to seed agents:", error);
    await logSystemEvent('error', 'System', 'Failed to seed agents', { error: String(error) });
  }
}

// Parse LLM response to extract valid JSON
function parseAIResponse(responseText: string): any {
  if (!responseText) return { status: 'failed', feedback: 'Empty response from model.', categories: [], traceLog: '' };
  
  try {
    return JSON.parse(responseText);
  } catch (e) {
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[1].trim()); } catch (_) {}
    }
    const curlyMatch = responseText.match(/\{[\s\S]*\}/);
    if (curlyMatch) {
      try { return JSON.parse(curlyMatch[0]); } catch (_) {}
    }
    
    // NVIDIA fallback: if it output pure markdown instead of JSON, we wrap it in our expected structure
    console.warn("AI responded with non-JSON text. Wrapping raw response.", responseText.substring(0, 100));
    return {
      status: "failed", // Assume failed if it didn't follow strict JSON rules
      feedback: "The AI agent provided a non-standard response. Raw output:\n\n" + responseText,
      categories: [{
        name: "General Compliance",
        issues: [{
          description: "Model failed to output structured JSON.",
          severity: "Medium",
          regulationRef: "System",
          boundingBox: { x: 0, y: 0, width: 0, height: 0 }
        }]
      }],
      traceLog: "Failsafe triggered: parsed unstructured markdown into JSON wrapper."
    };
  }
}

async function getAgentConfig(role: string, defaultAgent: Partial<Agent>): Promise<Agent> {
  try {
    const q = query(collection(db, 'agents'), where('role', '==', role), where('status', '==', 'online'));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const agentDoc = snap.docs[0];
      await updateDoc(doc(db, 'agents', agentDoc.id), {
        currentActivity: 'Analyzing drawing...',
        lastActive: new Date().toISOString()
      });
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
    
    // 1. Fetch all agent configurations
    reportProgress(10, 'System', 'Loading specialized agent configurations...', completed);
    const agentConfigs = await Promise.all(agentRoles.map(role => {
      const def = SPECIALIZED_AGENTS.find(a => a.role === role) || { role, name: role, systemPrompt: '', temperature: 0.1 };
      return getAgentConfig(role, def);
    }));

    // 2. Execute specialized agents in parallel
    reportProgress(20, 'System', 'Activating specialized agents...', completed);
    
    // Check if we need a web search based on findings (we'll collect unknown refs)
    let needsWebSearch = false;
    let webSearchQueries: { query: string, role: string, id: string }[] = [];

    const agentCalls = agentConfigs.map(async (agent) => {
      const getAgentThought = (role: string) => {
        const thoughts: Record<string, string[]> = {
          wall_checker: ["Checking wall thicknesses against SANS 10400-K...", "Verifying DPC placement and heights...", "Analyzing foundation-to-wall load paths..."],
          window_checker: ["Calculating 5% ventilation requirements...", "Measuring 10% natural lighting ratios (Part N)...", "Checking safety glazing compliance..."],
          door_checker: ["Verifying fire door ratings and escape widths...", "Checking threshold levels for accessibility...", "Analyzing door swings for escape routes..."],
          area_checker: ["Measuring minimum room sizes (min 6m²)...", "Checking vertical clearances (2.4m ceiling height)...", "Verifying occupancy density compliance..."],
          compliance_checker: ["Searching for North Point and Scale Bar...", "Analyzing title block and site plan details...", "Checking coordination between plan and sections..."],
          sans_compliance: ["Cross-referencing SANS 10400 National Building Regs...", "Validating Part A (General Principles) items...", "Finalizing multi-part regulation check..."]
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
        // Inject active knowledge
        const knowledgeEntries = await getAgentKnowledge(agent.role, 'active');
        const knowledgeContext = knowledgeEntries.length > 0 
          ? `\n\nADDITIONAL LEARNED KNOWLEDGE (Apply these rules over default instructions):\n` + 
            knowledgeEntries.map(k => `[${k.title}]: ${k.content}`).join('\n\n')
          : '';
          
        const enrichedPrompt = agent.systemPrompt + knowledgeContext;

        let response = '';
        const promptInstruction = `Identify compliance issues in this drawing: ${drawingName}. URL: ${drawingUrl}. If you encounter a regulation or standard you are unsure of, explicitly state "UNKNOWN_REGULATION: [Topic]".`;
        
        if (config.provider === 'gemini') {
          response = await callGeminiProxy(enrichedPrompt, promptInstruction, drawingUrl, config, agent as Agent);
        } else {
          // Support vision for OpenAI-compatible providers (like NVIDIA)
          response = await callOpenAICompatible(config, enrichedPrompt, promptInstruction, drawingUrl, agent as Agent);
        }
        
        completed.push(agent.name);
        reportProgress(20 + (completed.length * 10), agent.name, `${agent.name} completed analysis.`, completed, "Synthesis sent to Orchestrator.");
        
        if (response.includes("UNKNOWN_REGULATION:")) {
          const match = response.match(/UNKNOWN_REGULATION:\s*(.+)/);
          if (match && match[1]) {
            needsWebSearch = true;
            webSearchQueries.push({ query: match[1], role: agent.role, id: agent.id! });
          }
        }

        return { role: agent.role, name: agent.name, findings: response, id: agent.id };
      } catch (err) {
        console.error(`Agent ${agent.name} failed:`, err);
        return { role: agent.role, name: agent.name, findings: `Error: Agent failed to respond. ${err instanceof Error ? err.message : String(err)}`, id: agent.id };
      }
    });

    const agentFindings = await Promise.all(agentCalls);

    // Dynamic Web Search Phase
    if (needsWebSearch && webSearchQueries.length > 0) {
      reportProgress(75, 'Orchestrator', 'Performing web research on unknown regulations...', completed);
      
      for (const req of webSearchQueries) {
        if (req.id) {
           const searchResult = await webSearchForAgent(req.query, req.role, req.id);
           // Append search result to the respective agent's findings for the current run
           const targetFinding = agentFindings.find(f => f.role === req.role);
           if (targetFinding) {
             targetFinding.findings += `\n\n[WEB SEARCH RESULT for ${req.query}]: ${searchResult}`;
           }
        }
      }
    }

    // 3. Orchestration phase
    reportProgress(85, 'Orchestrator', 'Synthesizing all agent findings and generating final report...', completed);
    
    const orchestratorAgent = await getAgentConfig('orchestrator', SPECIALIZED_AGENTS[0]);
    const orchConfig: LLMConfig = {
      provider: (orchestratorAgent.llmProvider === 'global' || !orchestratorAgent.llmProvider) ? globalConfig.provider : orchestratorAgent.llmProvider as LLMProvider,
      model: orchestratorAgent.llmModel || globalConfig.model,
      apiKey: orchestratorAgent.llmApiKey || globalConfig.apiKey,
      baseUrl: orchestratorAgent.llmBaseUrl || globalConfig.baseUrl,
    };

    const findingsContext = agentFindings.map(f => `### ${f.name} Findings:\n${f.findings}`).join('\n\n');
    
    const synthesisPrompt = `I have received reports from multiple specialized agents regarding the drawing: ${drawingName}.
    
    ${findingsContext}
    
    Based on these specialized reports AND your visual analysis of the drawing, produce the final compliance status and structured issue list.
    Remember to include boundingBox coordinates for every issue identified.`;

    let finalResponse = '';
    if (orchConfig.provider === 'gemini') {
      finalResponse = await callGeminiProxy(orchestratorAgent.systemPrompt, synthesisPrompt, drawingUrl, orchConfig, orchestratorAgent);
    } else {
      finalResponse = await callOpenAICompatible(orchConfig, orchestratorAgent.systemPrompt, synthesisPrompt, undefined, orchestratorAgent);
    }

    reportProgress(95, 'Orchestrator', 'Finalizing compliance report...', completed);

    const result = parseAIResponse(finalResponse);
    const validStatus = result.status === 'passed' ? 'passed' : 'failed';

    // Self Improvement logging
    try {
      if (orchestratorAgent.id) {
        await addKnowledge({
          agentId: 'orchestrator',
          agentRole: 'orchestrator',
          title: `Review Summary for ${drawingName}`,
          content: `Reviewed ${drawingName}. Status: ${validStatus}. Found ${Array.isArray(result.categories) ? result.categories.reduce((acc: number, cat: any) => acc + (cat.issues?.length || 0), 0) : 0} issues. Tracelog: ${result.traceLog}`,
          source: 'self_improvement',
          status: 'pending_review',
          submittedBy: 'system',
          submittedByRole: 'system',
          tags: ['review_summary', validStatus],
          createdAt: new Date().toISOString()
        });
      }
    } catch (selfImprovementError) {
      console.error("Failed to log self improvement:", selfImprovementError);
    }

    // Reset agent activities
    await Promise.all(agentConfigs.concat(orchestratorAgent).map(agent => {
      if (!agent.id) return Promise.resolve();
      return updateDoc(doc(db, 'agents', agent.id), {
        currentActivity: 'Idle',
        lastActive: new Date().toISOString()
      });
    }));

    const duration = Date.now() - startTime;
    reportProgress(100, 'Orchestrator', `Review Complete (${Math.round(duration / 1000)}s).`, completed);

    return {
      status: validStatus,
      feedback: result.feedback || 'AI Review completed.',
      categories: Array.isArray(result.categories) ? result.categories : [],
      traceLog: result.traceLog || `Orchestrator summarized findings from ${completed.length} specialized agents.`
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Multi-agent Review Error:", error);
    
    return {
      status: 'failed',
      feedback: `Orchestration error: ${errorMessage}`,
      categories: [{
        name: 'System Error',
        issues: [{
          description: 'The multi-agent review system encountered a failure.',
          severity: 'high',
          actionItem: 'Retry or check system logs'
        }]
      }],
      traceLog: `Failed at ${Date.now() - startTime}ms: ${errorMessage}`
    };
  }
}

// Export additional utilities for testing and debugging
export const AIUtils = {
  parseAIResponse,
  withRetry,
  callGeminiProxy,
  callOpenAICompatible
};
