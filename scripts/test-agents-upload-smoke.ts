import * as dotenv from 'dotenv';
import { put } from '@vercel/blob';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

dotenv.config({ path: ['.env.local', '.env'] });

type AgentTest = {
  role: string;
  name: string;
  systemInstruction: string;
  prompt: string;
};

const apiKey = process.env.GEMINI_API_KEY;
const nvidiaApiKey = process.env.NVIDIA_API_KEY || process.env.NVIDIA_NIM_API_KEY;
const blobToken = process.env.BLOB_READ_WRITE_TOKEN || process.env.VITE_BLOB_READ_WRITE_TOKEN;
const cliProviderArg = process.argv.find(arg => arg.startsWith('--provider='))?.split('=')[1];
const cliLimitArg = process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1];
const provider = (cliProviderArg || process.env.AGENT_TEST_PROVIDER || 'gemini').toLowerCase();
const model = process.env.GEMINI_TEST_MODEL || 'gemini-2.0-flash';
const nvidiaModel = process.env.NVIDIA_TEST_MODEL || 'meta/llama-3.1-70b-instruct';
const nvidiaBaseUrl = (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '').replace(/\/chat\/completions$/, '');
const requestTimeoutMs = Number(process.env.AGENT_TEST_TIMEOUT_MS || 45_000);

if (provider === 'gemini' && !apiKey) throw new Error('GEMINI_API_KEY is not configured.');
if (provider === 'nvidia' && !nvidiaApiKey) throw new Error('NVIDIA_API_KEY or NVIDIA_NIM_API_KEY is not configured.');
if (!blobToken) throw new Error('BLOB_READ_WRITE_TOKEN or VITE_BLOB_READ_WRITE_TOKEN is not configured.');

const agents: AgentTest[] = [
  {
    role: 'wall_checker',
    name: 'Wall Compliance Agent',
    systemInstruction: 'You are a SANS 10400-K wall compliance specialist. Review uploaded architectural drawings for wall thickness, DPC, lateral support, and wall/fire-separation risks. Return JSON only with status, feedback, findings, categories, and traceLog.',
    prompt: 'Review the uploaded drawing PDF. Focus on wall thickness and DPC compliance. Flag insufficient or non-compliant evidence.'
  },
  {
    role: 'window_checker',
    name: 'Fenestration Agent',
    systemInstruction: 'You are a SANS 10400-N/O/XA fenestration specialist. Review uploaded drawings for natural lighting, ventilation, safety glazing, window schedules, and energy prompts. Return JSON only with status, feedback, findings, categories, and traceLog.',
    prompt: 'Review the uploaded drawing PDF. Focus on window/ventilation/natural-light ratios and glazing notes.'
  },
  {
    role: 'door_checker',
    name: 'Door and Fire Safety Agent',
    systemInstruction: 'You are a SANS 10400-T fire safety and egress specialist. Review uploaded drawings for escape routes, door swings, travel distance, fire doors, and fire-safety documentation. Return JSON only with status, feedback, findings, categories, and traceLog.',
    prompt: 'Review the uploaded drawing PDF. Focus on escape route width, door swing, travel distance, and fire safety gaps.'
  },
  {
    role: 'area_checker',
    name: 'Area Sizing Agent',
    systemInstruction: 'You are a SANS 10400-C area and dimensional compliance specialist. Review uploaded drawings for minimum room sizes, ceiling heights, occupancy sizing, and headroom. Return JSON only with status, feedback, findings, categories, and traceLog.',
    prompt: 'Review the uploaded drawing PDF. Focus on room sizes, kitchen area, ceiling height, and minimum dimensional requirements.'
  },
  {
    role: 'compliance_checker',
    name: 'General Compliance Agent',
    systemInstruction: 'You are an architectural documentation completeness specialist. Review uploaded drawings for title blocks, north points, scale bars, drawing numbers, legends, dimensions, and council submission readiness. Return JSON only with status, feedback, findings, categories, and traceLog.',
    prompt: 'Review the uploaded drawing PDF. Focus on title block, scale, north point, submission notes, and drawing completeness.'
  },
  {
    role: 'sans_compliance',
    name: 'SANS Specialist',
    systemInstruction: 'You are a broad SANS 10400/NBR specialist. Cross-reference likely South African National Building Regulation issues in uploaded architectural drawings without certifying compliance. Return JSON only with status, feedback, findings, categories, and traceLog.',
    prompt: 'Review the uploaded drawing PDF and summarize the highest-risk SANS/NBR concerns across wall, area, fenestration, fire/egress, and documentation.'
  }
];

async function createDrawingPdf(): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([842, 595]); // A4 landscape points
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawText('ARCHITEX AGENT TEST DRAWING - RESIDENTIAL PLAN', { x: 36, y: 552, size: 16, font: bold, color: rgb(0.05, 0.12, 0.25) });
  page.drawText('Scale: 1:100   Drawing No: AI-SMOKE-001   Revision: T1', { x: 36, y: 532, size: 10, font });
  page.drawText('NOTE: North point intentionally omitted for documentation-completeness testing.', { x: 36, y: 516, size: 9, font, color: rgb(0.7, 0.15, 0.05) });

  // Simple plan outline
  page.drawRectangle({ x: 80, y: 130, width: 560, height: 340, borderWidth: 2, borderColor: rgb(0, 0, 0) });
  page.drawLine({ start: { x: 330, y: 130 }, end: { x: 330, y: 470 }, thickness: 1.5 });
  page.drawLine({ start: { x: 80, y: 300 }, end: { x: 640, y: 300 }, thickness: 1.5 });
  page.drawLine({ start: { x: 480, y: 300 }, end: { x: 480, y: 470 }, thickness: 1.5 });

  const labels = [
    ['BEDROOM 1', '5.5 m2', 'ceiling 2.30 m', 120, 386],
    ['LIVING / DINING', '42 m2', 'windows total 3.0 m2', 370, 386],
    ['KITCHEN', '4.0 m2', 'no mechanical ventilation note', 505, 386],
    ['BEDROOM 2', '7.2 m2', 'ceiling 2.40 m', 120, 216],
    ['PASSAGE / EXIT ROUTE', 'clear width 820 mm', 'travel distance to exit 50 m', 370, 216],
  ];

  for (const [title, line1, line2, x, y] of labels) {
    page.drawText(String(title), { x: Number(x), y: Number(y), size: 10, font: bold });
    page.drawText(String(line1), { x: Number(x), y: Number(y) - 15, size: 9, font });
    page.drawText(String(line2), { x: Number(x), y: Number(y) - 29, size: 9, font });
  }

  page.drawText('External walls noted as 220 mm masonry. DPC: NOT SPECIFIED.', { x: 80, y: 104, size: 10, font: bold, color: rgb(0.7, 0.15, 0.05) });
  page.drawText('Main exit door swings inward. Fire door rating not specified. No fire equipment shown.', { x: 80, y: 86, size: 10, font: bold, color: rgb(0.7, 0.15, 0.05) });
  page.drawText('This synthetic PDF is for automated AI-agent smoke testing only; it is not a real construction document.', { x: 36, y: 36, size: 8, font, color: rgb(0.35, 0.35, 0.35) });

  return pdfDoc.save();
}

function extractText(data: any): string {
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || data?.text || JSON.stringify(data);
}

function parseJsonLikeResponse(text: string): any | null {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/i) || trimmed.match(/```\s*([\s\S]*?)\s*```/) || trimmed.match(/{[\s\S]*}/);
  const candidate = jsonMatch?.[1] || jsonMatch?.[0] || trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function countFindings(parsed: any): number | undefined {
  if (Array.isArray(parsed?.findings)) return parsed.findings.length;
  if (Array.isArray(parsed?.categories)) {
    return parsed.categories.reduce((sum: number, cat: any) => sum + (Array.isArray(cat?.issues) ? cat.issues.length : 0), 0);
  }
  return undefined;
}

async function callGemini(agent: AgentTest, pdfBytes: Uint8Array) {
  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: `${agent.prompt}\n\nReturn concise JSON. Include whether the uploaded PDF was read and list at least one drawing evidence quote if possible.` },
        { inlineData: { mimeType: 'application/pdf', data: Buffer.from(pdfBytes).toString('base64') } }
      ]
    }],
    systemInstruction: { parts: [{ text: agent.systemInstruction }] },
    generationConfig: { temperature: 0.2, maxOutputTokens: 2048, responseMimeType: 'application/json' }
  };

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const json = await response.json();
  if (!response.ok) throw new Error(`${agent.name} failed: ${response.status} ${JSON.stringify(json).slice(0, 500)}`);

  const text = extractText(json);
  const parsed = parseJsonLikeResponse(text);

  return {
    role: agent.role,
    name: agent.name,
    ok: true,
    status: parsed?.status || 'unknown',
    feedback: parsed?.feedback || text.slice(0, 500),
    findingCount: countFindings(parsed),
    raw: parsed || text
  };
}

async function callNvidia(agent: AgentTest, drawingUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const response = await fetch(`${nvidiaBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${nvidiaApiKey}`
    },
    body: JSON.stringify({
      model: nvidiaModel,
      messages: [
        { role: 'system', content: agent.systemInstruction },
        {
          role: 'user',
          content: `${agent.prompt}\n\nDrawing URL: ${drawingUrl}\n\nThe uploaded file is a synthetic architectural PDF smoke-test drawing. Because this NVIDIA text endpoint may not read PDFs directly, use the drawing notes below as extracted evidence:\n- North point intentionally omitted.\n- Bedroom 1 is 5.5 m2 with ceiling 2.30 m.\n- Kitchen is 4.0 m2 with no mechanical ventilation note.\n- Living/dining is 42 m2 with windows total 3.0 m2.\n- External walls are 220 mm masonry. DPC is not specified.\n- Main exit door swings inward. Fire door rating not specified. Travel distance to exit is 50 m.\n\nReturn concise JSON only with status, feedback, findings or categories, and traceLog.`
        }
      ],
      temperature: 0.2,
      max_tokens: 1024
    }),
    signal: controller.signal
  }).finally(() => clearTimeout(timeout));

  const json = await response.json().catch(async () => ({ raw: await response.text() }));
  const text = json?.choices?.[0]?.message?.content || json?.text || JSON.stringify(json);
  if (!response.ok) throw new Error(`${agent.name} failed: ${response.status} ${JSON.stringify(json).slice(0, 500)}`);

  const parsed = parseJsonLikeResponse(text);

  return {
    role: agent.role,
    name: agent.name,
    ok: true,
    status: parsed?.status || 'unknown',
    feedback: parsed?.feedback || text.slice(0, 500),
    findingCount: countFindings(parsed),
    raw: parsed || text
  };
}

async function main() {
  const limit = cliLimitArg ? Number(cliLimitArg) : Number(process.env.AGENT_TEST_LIMIT || agents.length);
  const pdfBytes = await createDrawingPdf();
  const fileName = `agent-smoke-tests/agent-test-drawing-${Date.now()}.pdf`;
  const blob = await put(fileName, Buffer.from(pdfBytes), {
    access: 'public',
    contentType: 'application/pdf',
    token: blobToken,
  });

  console.log(`Uploaded PDF drawing: ${blob.url}`);
  console.log(`PDF size: ${pdfBytes.byteLength} bytes`);

  const results = [];
  for (const agent of agents.slice(0, limit)) {
    console.log(`Testing ${agent.name} with ${provider}...`);
    try {
      results.push(provider === 'nvidia' ? await callNvidia(agent, blob.url) : await callGemini(agent, pdfBytes));
    } catch (error) {
      results.push({ role: agent.role, name: agent.name, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const summary = {
    uploadedDrawingUrl: blob.url,
    provider,
    model: provider === 'nvidia' ? nvidiaModel : model,
    testedAt: new Date().toISOString(),
    passedAgentCalls: results.filter(r => r.ok).length,
    failedAgentCalls: results.filter(r => !r.ok).length,
    results,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});