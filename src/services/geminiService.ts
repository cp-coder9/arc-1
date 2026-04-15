import { db } from "../lib/firebase";
import { collection, getDocs, query, where, addDoc, updateDoc, doc, getDoc } from "firebase/firestore";
import { LLMConfig } from "../types";

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
async function callGeminiProxy(systemInstruction: string, prompt: string): Promise<string> {
  return withRetry(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    try {
      const response = await fetch('/api/gemini/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction,
          prompt
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

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

async function callOpenAICompatible(config: LLMConfig, systemInstruction: string, prompt: string): Promise<string> {
  return withRetry(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch('/api/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config,
          systemInstruction,
          prompt
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

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

export interface AIIssue {
  description: string;
  severity: 'low' | 'medium' | 'high';
  actionItem: string;
}

export interface AICategory {
  name: string;
  issues: AIIssue[];
}

export interface AIReviewResult {
  status: 'passed' | 'failed';
  feedback: string;
  categories: AICategory[];
  traceLog: string;
}

export const SPECIALIZED_AGENTS = [
  {
    name: "Orchestrator",
    role: "orchestrator",
    description: "Main coordinator for architectural compliance checks.",
    systemPrompt: `You are the AI Orchestrator for SANS 10400 compliance checking.

Your role is to coordinate specialized agents and produce a structured JSON compliance report.

CRITICAL RULES:
1. You MUST output valid JSON only
2. The JSON must have these exact fields: status, feedback, categories, traceLog
3. status must be either "passed" or "failed"
4. If ANY compliance issue is found, status must be "failed"
5. Only use "passed" if drawing is fully compliant

Use the specialized agents' knowledge to inform your analysis but produce a unified report.

Example output format:
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
          "actionItem": "Increase external wall thickness to minimum 230mm per SANS 10400-K"
        }
      ]
    }
  ],
  "traceLog": "Orchestrator initialized review. Checked wall compliance, fenestration, fire safety..."
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
        await addDoc(collection(db, 'agents'), {
          ...agent,
          status: 'online',
          lastActive: new Date().toISOString(),
          currentActivity: 'Idle'
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

async function getAgentPrompt(role: string, defaultPrompt: string): Promise<string> {
  try {
    const q = query(collection(db, 'agents'), where('role', '==', role), where('status', '==', 'online'));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const agentDoc = snap.docs[0];
      // Update activity
      await updateDoc(doc(db, 'agents', agentDoc.id), {
        currentActivity: 'Analyzing drawing...',
        lastActive: new Date().toISOString()
      });
      return agentDoc.data().systemPrompt;
    }
  } catch (error) {
    console.error(`Error fetching agent prompt for ${role}:`, error);
  }
  return defaultPrompt;
}

export interface AIProgress {
  percentage: number;
  agentName: string;
  activity: string;
  completedAgents: string[];
}

// Parse LLM response to extract valid JSON
function parseAIResponse(responseText: string): any {
  // Try parsing directly first
  try {
    return JSON.parse(responseText);
  } catch (e) {
    // Not direct JSON, try extracting from markdown code blocks
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch (e2) {
        // Failed to parse code block
      }
    }

    // Try finding JSON between curly braces
    const curlyMatch = responseText.match(/\{[\s\S]*\}/);
    if (curlyMatch) {
      try {
        return JSON.parse(curlyMatch[0]);
      } catch (e3) {
        // Failed to parse curly braces
      }
    }

    // If all parsing fails, return a structured error
    throw new Error('Could not parse AI response as JSON. Response: ' + responseText.substring(0, 500));
  }
}

export async function reviewDrawing(
  drawingUrl: string,
  drawingName: string,
  onProgress?: (progress: AIProgress) => void
): Promise<AIReviewResult> {
  const startTime = Date.now();

  try {
    const reportProgress = (percentage: number, agentName: string, activity: string, completedAgents: string[]) => {
      if (onProgress) {
        onProgress({ percentage, agentName, activity, completedAgents });
      }
    };

    const completed: string[] = [];
    reportProgress(5, 'Orchestrator', 'Initializing review workflow...', completed);

    await logSystemEvent('info', 'AI Orchestrator', `Starting review for drawing: ${drawingName}`, {
      drawingUrl,
      timestamp: new Date().toISOString()
    });

    const agentsToFetch = [
      { role: 'orchestrator', name: 'Orchestrator' },
      { role: 'wall_checker', name: 'Wall Compliance Agent' },
      { role: 'window_checker', name: 'Fenestration Agent' },
      { role: 'door_checker', name: 'Fire Safety Agent' },
      { role: 'area_checker', name: 'Area Sizing Agent' },
      { role: 'compliance_checker', name: 'General Compliance Agent' },
      { role: 'sans_compliance', name: 'SANS Specialist' }
    ];

    const prompts: string[] = [];
    let currentPercentage = 5;

    // Fetch all agent prompts in parallel for better performance
    const promptPromises = agentsToFetch.map(async (agent, index) => {
      const agentFromList = SPECIALIZED_AGENTS.find(a => a.role === agent.role);
      const defaultPrompt = agentFromList?.systemPrompt || '';

      reportProgress(
        currentPercentage + (index * 2),
        agent.name,
        `Fetching ${agent.name} configuration...`,
        completed
      );

      try {
        const prompt = await getAgentPrompt(agent.role, defaultPrompt);
        return { index, prompt, agent };
      } catch (error) {
        console.error(`Failed to fetch prompt for ${agent.name}:`, error);
        return { index, prompt: defaultPrompt, agent };
      }
    });

    const promptResults = await Promise.all(promptPromises);

    // Sort by original index to maintain order
    promptResults.sort((a, b) => a.index - b.index);

    promptResults.forEach(({ prompt, agent }) => {
      prompts.push(prompt);
      completed.push(agent.name);
      currentPercentage += 10;
      reportProgress(currentPercentage, agent.name, `${agent.name} ready for analysis.`, completed);
    });

    const [
      orchestratorPrompt,
      wallPrompt,
      windowPrompt,
      doorPrompt,
      areaPrompt,
      compliancePrompt,
      sansPrompt
    ] = prompts;

    reportProgress(75, 'Orchestrator', 'Consolidating agent knowledge and performing final compliance synthesis...', completed);

    // Create a more detailed combined system instruction
    const combinedSystemInstruction = `${orchestratorPrompt}

You have access to specialized agents with the following expertise:

WALL COMPLIANCE AGENT:
${wallPrompt}

FENESTRATION AGENT:
${windowPrompt}

FIRE SAFETY AGENT:
${doorPrompt}

AREA SIZING AGENT:
${areaPrompt}

GENERAL COMPLIANCE AGENT:
${compliancePrompt}

SANS SPECIALIST:
${sansPrompt}

INSTRUCTIONS:
1. Analyze the architectural drawing comprehensively
2. Use the specialized agents' knowledge as context
3. Identify ALL compliance issues
4. Return a valid JSON object with the exact structure specified in your instructions
5. Be thorough - check every aspect mentioned by the specialized agents
6. If you cannot see certain details in the drawing, note that as a potential issue

REMEMBER: Valid JSON output only. No markdown formatting, no explanation text outside the JSON.`;

    const userPrompt = `Review this architectural drawing:

Drawing Name: ${drawingName}
Image URL: ${drawingUrl}

Perform a comprehensive SANS 10400 compliance review covering:
1. Wall thickness and construction (SANS 10400-K)
2. Windows, ventilation, and lighting (SANS 10400-N)
3. Doors and fire safety (SANS 10400-T)
4. Room sizes and ceiling heights (SANS 10400-C)
5. General compliance (SANS 10400-A)
6. Cross-reference with SANS specialist knowledge

Provide your findings as a JSON object with:
- status: "passed" or "failed"
- feedback: A detailed markdown summary of findings
- categories: Array of compliance categories with issues
- traceLog: Summary of the review process

If ANY issues are found, status must be "failed".
Only use "passed" if the drawing is fully compliant.`;

    const config = await getLLMConfig();
    let responseText = '';

    reportProgress(80, 'Orchestrator', 'Sending request to AI model...', completed);

    try {
      if (config.provider === 'gemini') {
        responseText = await callGeminiProxy(combinedSystemInstruction, userPrompt);
      } else {
        responseText = await callOpenAICompatible(config, combinedSystemInstruction, userPrompt);
      }
    } catch (apiError) {
      console.error('API call failed:', apiError);
      throw new Error(`AI API call failed: ${apiError.message}`);
    }

    reportProgress(90, 'Orchestrator', 'Parsing AI response...', completed);

    // Parse the response
    let result: any;
    try {
      result = parseAIResponse(responseText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Return a fallback result with the raw response for debugging
      return {
        status: 'failed',
        feedback: `AI Review completed but response parsing failed. Raw response snippet: ${responseText.substring(0, 500)}...`,
        categories: [{
          name: 'Parse Error',
          issues: [{
            description: 'Failed to parse AI response',
            severity: 'medium',
            actionItem: 'Please review the drawing manually or retry'
          }]
        }],
        traceLog: `Orchestrator started review. Agents activated: ${completed.join(', ')}. Parse error occurred.`
      };
    }

    // Validate required fields
    if (!result.status || !result.feedback) {
      console.error('Invalid result structure:', result);
      throw new Error('AI response missing required fields');
    }

    // Ensure status is valid
    const validStatus = result.status === 'passed' || result.status === 'failed' ? result.status : 'failed';

    reportProgress(95, 'Orchestrator', 'Finalizing report and updating traceability logs...', completed);

    // Reset agent activities
    try {
      const agentsSnap = await getDocs(collection(db, 'agents'));
      const resetPromises = agentsSnap.docs.map(agentDoc =>
        updateDoc(doc(db, 'agents', agentDoc.id), {
          currentActivity: 'Idle',
          lastActive: new Date().toISOString()
        })
      );
      await Promise.all(resetPromises);
    } catch (error) {
      console.error('Failed to reset agent activities:', error);
    }

    const duration = Date.now() - startTime;
    reportProgress(100, 'Orchestrator', `Review Complete (${Math.round(duration / 1000)}s).`, completed);

    await logSystemEvent('info', 'AI Orchestrator', `Review completed for ${drawingName}`, {
      status: validStatus,
      duration: `${duration}ms`,
      categoriesCount: result.categories?.length || 0,
      issuesCount: result.categories?.reduce((acc: number, cat: AICategory) => acc + cat.issues.length, 0) || 0
    });

    return {
      status: validStatus,
      feedback: result.feedback || 'AI Review completed.',
      categories: Array.isArray(result.categories) ? result.categories : [],
      traceLog: result.traceLog || `Orchestrator completed review with ${completed.length} agents in ${Math.round(duration / 1000)}s.`
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await logSystemEvent('error', 'AI Orchestrator', `Review failed for ${drawingName}`, {
      error: errorMessage,
      duration: `${Date.now() - startTime}ms`
    });

    console.error("AI Review Error:", error);

    return {
      status: 'failed',
      feedback: `An error occurred during the AI review process: ${errorMessage}. Please try again or contact support.`,
      categories: [{
        name: 'System Error',
        issues: [{
          description: 'AI review system encountered an error',
          severity: 'high',
          actionItem: 'Please retry the submission or contact support if the issue persists'
        }]
      }],
      traceLog: `Orchestrator encountered an error: ${errorMessage}`
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
