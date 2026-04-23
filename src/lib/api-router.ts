import express from "express";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import { del, put } from "@vercel/blob";
import multer from "multer";
import { admin, adminDb, auth, firebaseConfig } from "./firebase-admin.js";
import { extractCadData } from "./cadProcessor.js";
import { encrypt, decrypt } from "./encryption.js";
import { runMunicipalScraper } from "../services/scraperService.js";
import { processReceiptOCR } from "../services/ocrService.js";
import { detectMunicipalInvoices, getMunicipalityHeatMap } from "../services/shadowTrackerService.js";
import { verifySACAPRegistration } from "../services/sacapVerificationService.js";

import { UserRole, MunicipalityType } from "../types.js";


// ── Environment variables ─────────────────────────────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const PAYFAST_PASSPHRASE = process.env.VITE_PAYFAST_PASSPHRASE || "";
const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || process.env.VITE_BLOB_READ_WRITE_TOKEN || "";
const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY || "";
const PLATFORM_FEE_PERCENTAGE = 0.05;

// ── Rate Limiters ─────────────────────────────────────────────────────────────
const reviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // Increased to support multi-agent parallel execution
  message: { error: "Too many review requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Too many requests, please slow down" },
});

const router = express.Router();
router.use(apiLimiter);

// ── Helpers ───────────────────────────────────────────────────────────────────
const ALLOWED_BLOB_HOSTS = ["public.blob.vercel-storage.com"];

function isAllowedBlobUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_BLOB_HOSTS.some(host => parsed.hostname.endsWith(host));
  } catch {
    return false;
  }
}

async function getAdminLLMConfig() {
  try {
    const doc = await adminDb.collection("system_settings").doc("llm_config").get();
    if (doc.exists) return doc.data();
  } catch (error) {
    console.error("Error fetching LLM config:", error);
  }
  return null;
}

async function verifyAuth(headers: Record<string, any>) {
  const authHeader = headers.authorization as string | undefined;
  const directApiKey = headers['api-key'] || headers['x-agent-key'];

  // Handle direct API Key header (preferred for agents)
  if (directApiKey) {
    // Return a mock agent user
    return {
      uid: `agent_${crypto.randomBytes(8).toString('hex')}`,
      email: 'agent@architex.co.za',
      displayName: 'Agent Service',
      role: 'admin' as UserRole,
      authorizationType: 'api_key',
      authorizationValue: directApiKey
    };
  }

  if (!authHeader) {
    throw Object.assign(new Error("Missing authorization header"), { status: 401 });
  }

  // Handle Bearer token (Firebase auth)
  if (authHeader.startsWith("Bearer ")) {
    try {
      const token = authHeader.split("Bearer ")[1];
      const decoded = await auth.verifyIdToken(token);

      // Check if this user is acting as an agent
      const agentDoc = await adminDb.collection("agents").doc(decoded.uid).get();
      if (agentDoc.exists) {
        const agentData = agentDoc.data();
        return {
          ...decoded,
          authorizationType: agentData?.authorizationType,
          authorizationValue: agentData?.authorizationValue
        };
      }
      return decoded;
    } catch (err: any) {
      console.error("Firebase Auth Verification Failed:", err);
      throw Object.assign(new Error(`Auth failed: ${err.message}`), { status: 401 });
    }
  }

  // Handle Api-Key embedded in Authorization header
  if (authHeader.startsWith("Api-Key ")) {
    const apiKey = authHeader.split("Api-Key ")[1];
    if (!apiKey) {
      throw Object.assign(new Error("Missing API key value"), { status: 401 });
    }
    return {
      uid: `agent_${crypto.randomBytes(8).toString('hex')}`,
      email: 'agent@architex.co.za',
      displayName: 'Agent Service',
      role: 'admin' as UserRole,
      authorizationType: 'api_key',
      authorizationValue: apiKey
    };
  }

  // Handle Custom-Auth
  if (authHeader.startsWith("Custom-Auth ")) {
    const customAuth = authHeader.split("Custom-Auth ")[1];
    if (!customAuth) {
      throw Object.assign(new Error("Missing custom auth value"), { status: 401 });
    }
    return {
      uid: `agent_${crypto.randomBytes(8).toString('hex')}`,
      email: 'agent@architex.co.za',
      displayName: 'Agent Service',
      role: 'admin' as UserRole,
      authorizationType: 'custom',
      authorizationValue: customAuth
    };
  }

  throw Object.assign(new Error("Unsupported authorization type"), { status: 401 });
}

async function isAdmin(uid: string): Promise<boolean> {
  const userDoc = await adminDb.collection("users").doc(uid).get();
  return userDoc.data()?.role === "admin";
}

// ── Multer (memory storage, max 20 MB) ───────────────────────────────────────
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/octet-stream", // DWG, DXF
  "image/webp",
  "application/dwg", // AutoCAD DWG
  "application/dxf", // AutoCAD DXF
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  },
});

// ── Routes ───────────────────────────────────────────────────────────────────

// Health check
router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 3. SECURED AI Review (authenticated + proxy)
router.post("/review", reviewLimiter, async (req, res) => {
  // --- COMMENT 4 IMPLEMENTATION: Add Firebase auth verification ---
  let decoded;
  try {
    decoded = await verifyAuth(req.headers);

    // Admin whitelist check (log but allow for now to prevent blocking architects)
    const adminEmails = ['gm.tarb@gmail.com', 'leor@slutzkin.co.za'];
    const userEmail = decoded.email?.toLowerCase();
    const isAdmin = userEmail && adminEmails.includes(userEmail);

    if (userEmail && !isAdmin) {
      console.log(`[API] AI Review requested by non-admin: ${userEmail}. Allowing as standard user.`);
    }
  } catch (err: any) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const { systemInstruction, prompt, drawingUrl, config: clientConfig } = req.body;
  const dbConfig = (await getAdminLLMConfig()) as any;

  // Merge client config (from agent settings) with global DB config
  const config = { ...dbConfig, ...clientConfig };

  if (!config || !config.provider || config.provider === 'global') {
    return res.status(400).json({
      error: "LLM configuration not found. Please configure a provider in Admin Dashboard › Settings.",
    });
  }

  // If this is actually a Gemini config mistakenly routed here, handle it or return error
  if (config.provider === "gemini") {
    return res.status(400).json({
      error: "Current provider is Gemini — use /api/gemini/review instead.",
    });
  }

  const activeApiKey = config.apiKey || "";
  const activeModel = config.model || "";
  // Deep-clean the baseUrl to prevent double-pathing (e.g. /v1/chat/completions/chat/completions)
  let cleanBaseUrl = (config.baseUrl || (config.provider === 'nvidia' ? 'https://integrate.api.nvidia.com/v1' : '')).replace(/\/$/, "");
  if (cleanBaseUrl.endsWith("/chat/completions")) {
    cleanBaseUrl = cleanBaseUrl.replace(/\/chat\/completions$/, "");
  }

  // Log for debugging
  console.log(`[Proxy] Routing to ${config.provider} @ ${cleanBaseUrl}/chat/completions using model: ${activeModel}`);

  try {
    // Build the user message with vision support
    const messages: any[] = [{ role: "system", content: systemInstruction }];
    let userContent: any[] = [{ type: "text", text: prompt }];

    // If drawingUrl is present, determine whether it's an actual image or a
    // PDF/binary document. NVIDIA NIM and most OpenAI-compatible text models
    // will error with "cannot identify image file" if they receive a non-image.
    // We do a lightweight HEAD request to check the Content-Type before deciding.
    if (drawingUrl && isAllowedBlobUrl(drawingUrl)) {
      try {
        let resolvedMime = "";
        let urlLower = drawingUrl.toLowerCase();
        let isPdf = urlLower.endsWith(".pdf");
        let isImage = false;

        // HEAD request to check Content-Type
        try {
          const headResp = await fetch(drawingUrl, { method: "HEAD" });
          if (headResp.ok) {
            resolvedMime = (headResp.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
            isPdf = isPdf || resolvedMime === "application/pdf";
            isImage = resolvedMime.startsWith("image/") && !isPdf;
          }
        } catch (headErr) {
          console.warn("[Proxy] HEAD request failed, falling back to URL extension check:", headErr.message);
        }

        // Additional extension checks
        const isDwg = urlLower.endsWith(".dwg") || resolvedMime === "application/dwg";
        const isDxf = urlLower.endsWith(".dxf") || resolvedMime === "application/dxf";
        const isCadFile = isDwg || isDxf;
        const isOtherBinary = !isPdf && !isCadFile && !resolvedMime.startsWith("image/");

        console.log(`[Proxy] Drawing analysis: ${drawingUrl} -> mime: ${resolvedMime}, isImage: ${isImage}, isPdf: ${isPdf}, isDwg: ${isDwg}, isDxf: ${isDxf}`);

        if (isImage) {
          // Vision-capable: pass image URL directly so model fetches it
          console.log(`[Proxy] Vision injection: image_url (${resolvedMime})`);
          userContent.push({
            type: "image_url",
            image_url: { url: drawingUrl }
          });
        } else if (isPdf) {
          // PDF files - some vision models support PDFs, but to be safe, use text reference for now
          console.log(`[Proxy] PDF drawing — using text reference`);
          userContent.push({
            type: "text",
            text: `[Drawing Reference] File: ${drawingUrl} (PDF format). This is a technical architectural drawing in PDF format. Analyze based on SANS 10400 compliance requirements and architectural standards mentioned in the prompt.`
          });
        } else if (isCadFile) {
          // CAD files (DXF/DWG) - use specialized extractor
          try {
            console.log(`[Proxy] CAD file detected — attempting to extract structured data`);
            const cadResp = await fetch(drawingUrl);
            if (cadResp.ok) {
              const cadBuffer = Buffer.from(await cadResp.arrayBuffer());
              const cadData = extractCadData(cadBuffer, drawingUrl);

              console.log(`[Proxy] CAD data extracted: ${cadData.format}, labels: ${cadData.textLabels.length}`);

              userContent.push({
                type: "text",
                text: `[CAD Drawing Data]
Format: ${cadData.format}
Summary: ${cadData.summary}
Layers: ${cadData.metadata.layers?.join(', ') || 'N/A'}

EXTRACTED TEXT LABELS & NOTES:
${cadData.textLabels.slice(0, 300).join(' | ')}

DIMENSIONS FOUND:
${cadData.dimensions.slice(0, 50).join(', ') || 'None detected'}

Analyze these labels and dimensions against SANS 10400 requirements (e.g. room sizes, window ventilation codes, ceiling heights).`
              });
            } else {
              throw new Error(`Failed to fetch CAD file: ${cadResp.status}`);
            }
          } catch (cadError) {
            console.error(`[Proxy] Failed to process CAD data:`, cadError);
            userContent.push({
              type: "text",
              text: `[CAD Drawing Reference] File: ${drawingUrl} (${isDwg ? 'DWG' : 'DXF'} format). Extraction failed.`
            });
          }
        } else {
          // Other binary files — add descriptive text context only.
          const fileType = resolvedMime || "binary";
          console.log(`[Proxy] Other binary drawing (${fileType}) — using text reference only`);
          userContent.push({
            type: "text",
            text: `[Drawing Reference] File: ${drawingUrl} (${fileType} format). This is a technical drawing. Analyze based on architectural standards and the prompt requirements.`
          });
        }
      } catch (headErr) {
        console.error("[Proxy] Drawing type check failed:", headErr);
        // If we can't determine the type, add text reference as fallback
        userContent.push({
          type: "text",
          text: `[Drawing Reference] File: ${drawingUrl} (format unknown). This is a technical drawing. Analyze based on architectural standards and the prompt requirements.`
        });
      }
    }

    messages.push({ role: "user", content: userContent });

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 45000); // 45s for vision calls

    const response = await fetch(`${cleanBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${activeApiKey}`,
        "Accept": "application/json",
      },
      body: JSON.stringify({
        model: activeModel,
        messages,
        // response_format with json_object is only supported by OpenAI and OpenRouter.
        // NVIDIA NIM and local models reject this parameter and return 400.
        ...(config.provider === 'openai' || config.provider === 'openrouter'
          ? { response_format: { type: "json_object" } }
          : {}),
        temperature: 0.2,
      }),
      signal: controller.signal
    });

    clearTimeout(tid);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[API] LLM Provider Error: ${response.status} - ${errorText}`);
      return res.status(response.status).json({
        error: "LLM Provider rejected request",
        details: errorText.substring(0, 500),
        targetUrl: `${cleanBaseUrl}/chat/completions`,
        targetModel: activeModel
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error("LLM Proxy Error:", error);
    res.status(500).json({
      error: "Failed to connect to LLM provider",
      message: error.message,
      type: error.name
    });
  }
});

// Gemini proxy (authenticated + URL-validated)
router.post("/gemini/review", reviewLimiter, async (req, res) => {
  try {
    await verifyAuth(req.headers);
  } catch (err: any) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const { systemInstruction, prompt, drawingUrl, config } = req.body;
  const dbConfig = await getAdminLLMConfig();

  const activeApiKey = config?.apiKey || dbConfig?.apiKey || GEMINI_API_KEY;
  const activeModel = config?.model || dbConfig?.model || "gemini-2.0-flash";

  if (!activeApiKey) {
    return res.json({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              status: "failed",
              feedback: "AI Review (MOCK): No API key configured. Add GEMINI_API_KEY in environment variables.",
              categories: [],
              traceLog: "MOCK MODE: Missing API Key.",
            }),
          }],
        },
        finishReason: "STOP",
      }],
    });
  }

  if (!prompt) return res.status(400).json({ error: "Prompt is required" });

  if (drawingUrl && !isAllowedBlobUrl(drawingUrl)) {
    return res.status(400).json({ error: "drawingUrl must be a valid Vercel Blob URL (https)" });
  }

  try {
    const parts: any[] = [{ text: prompt }];

    if (drawingUrl) {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 15_000);
        const imageResp = await fetch(drawingUrl, { signal: controller.signal });
        clearTimeout(tid);

        if (imageResp.ok) {
          const buffer = await imageResp.arrayBuffer();
          if (buffer.byteLength > 10 * 1024 * 1024) {
            return res.status(400).json({ error: "Drawing file exceeds 10 MB limit" });
          }

          let mimeType = imageResp.headers.get("content-type") || "image/jpeg";
          const urlLower = drawingUrl.toLowerCase();
          const isPdf = urlLower.endsWith(".pdf") || mimeType === "application/pdf";
          const isDwg = urlLower.endsWith(".dwg") || mimeType === "application/dwg";
          const isDxf = urlLower.endsWith(".dxf") || mimeType === "application/dxf";
          const isCadFile = isDwg || isDxf;
          const isImage = mimeType.startsWith("image/") && !isPdf && !isCadFile;

          console.log(`[Gemini Proxy] Drawing analysis: ${drawingUrl} -> mime: ${mimeType}, isImage: ${isImage}, isPdf: ${isPdf}, isDwg: ${isDwg}, isDxf: ${isDxf}`);

          if (isImage) {
            // Images - send as inlineData for vision
            const base64Data = Buffer.from(buffer).toString("base64");
            parts.push({ inlineData: { mimeType, data: base64Data } });
            console.log(`[Gemini Proxy] Vision injection: inlineData (${mimeType})`);
          } else if (isPdf) {
            // PDFs - Gemini supports PDF inlineData
            const base64Data = Buffer.from(buffer).toString("base64");
            parts.push({ inlineData: { mimeType: "application/pdf", data: base64Data } });
            console.log(`[Gemini Proxy] PDF injection: inlineData (application/pdf)`);
          } else if (isCadFile) {
            // CAD files (DXF/DWG) - use specialized extractor
            try {
              const cadBuffer = Buffer.from(buffer);
              const cadData = extractCadData(cadBuffer, drawingUrl);

              console.log(`[Gemini Proxy] CAD data extracted: ${cadData.format}, labels: ${cadData.textLabels.length}`);

              parts.push({
                text: `[CAD Drawing Data]
Format: ${cadData.format}
Summary: ${cadData.summary}
Layers: ${cadData.metadata.layers?.join(', ') || 'N/A'}

EXTRACTED TEXT LABELS & NOTES:
${cadData.textLabels.slice(0, 300).join(' | ')}

DIMENSIONS FOUND:
${cadData.dimensions.slice(0, 50).join(', ') || 'None detected'}

Analyze these labels and dimensions against SANS 10400 requirements (e.g. room sizes, window ventilation codes, ceiling heights).`
              });
            } catch (cadError) {
              console.error(`[Gemini Proxy] Failed to process CAD data:`, cadError);
              parts.push({
                text: `[CAD Drawing Reference] File: ${drawingUrl} (${isDwg ? 'DWG' : 'DXF'} format). Extraction failed.`
              });
            }
          } else {
            // Other binary files - add text reference
            const fileType = mimeType || "binary";
            console.log(`[Gemini Proxy] Other binary drawing (${fileType}) — using text reference only`);
            parts.push({
              text: `[Drawing Reference] File: ${drawingUrl} (${fileType} format). This is a technical drawing. Analyze based on architectural standards and the prompt requirements.`
            });
          }
        }
      } catch (fetchError) {
        console.error("Error fetching drawing:", fetchError);
        // Add text reference as fallback
        parts.push({
          text: `[Drawing Reference] File: ${drawingUrl} (format unknown). This is a technical drawing. Analyze based on architectural standards and the prompt requirements.`
        });
      }
    }

    const requestBody: any = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    };

    if (systemInstruction) {
      requestBody.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${activeApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json({ error: "Gemini API request failed", details: errorData });
    }

    res.json(await response.json());
  } catch (error) {
    console.error("Gemini Proxy Error:", error);
    res.status(500).json({ error: "Failed to fetch from Gemini API" });
  }
});

// Agent web search (Now using standard LLM instead of Google Search)
router.post("/agent/search", apiLimiter, async (req, res) => {
  const { query, agentRole } = req.body;
  try {
    await verifyAuth(req.headers);
  } catch (err: any) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  if (!query) return res.status(400).json({ error: "Search query is required" });

  try {
    const dbConfig = (await getAdminLLMConfig()) as any;
    if (!dbConfig || !dbConfig.provider) {
      return res.status(400).json({ error: "LLM configuration not found for search" });
    }

    const provider = dbConfig.provider;
    const activeApiKey = dbConfig.apiKey || GEMINI_API_KEY;
    const activeModel = dbConfig.model || (provider === 'gemini' ? "gemini-1.5-flash" : "");
    const searchPrompt = `You are a compliance research assistant. Research the following topic for agent '${agentRole}': ${query}. Provide a concise, factual summary with regulatory references based on your training data.`;

    console.log(`[API] Agent virtual search for "${query}" using ${provider}`);

    if (provider === 'gemini') {
      const requestBody = {
        contents: [{ role: "user", parts: [{ text: searchPrompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
        },
      };

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${activeApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`[API] Gemini Search failed: ${response.status}`, errorData);
        return res.status(response.status).json({ error: "Gemini search error", details: errorData });
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return res.json(text ? { text } : { text: `No results for: ${query}` });
    } else {
      // OpenAI-compatible providers
      let cleanBaseUrl = (dbConfig.baseUrl || (provider === 'nvidia' ? 'https://integrate.api.nvidia.com/v1' : '')).replace(/\/$/, "");
      if (cleanBaseUrl.endsWith("/chat/completions")) {
        cleanBaseUrl = cleanBaseUrl.replace(/\/chat\/completions$/, "");
      }

      const requestBody = {
        model: activeModel,
        messages: [{ role: "user", content: searchPrompt }],
        temperature: 0.1,
        max_tokens: 1024
      };

      const response = await fetch(`${cleanBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${activeApiKey}`
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        console.error(`[API] AI Search failed: ${response.status}`, errData);
        return res.status(response.status).json({ error: "Search provider error", details: errData });
      }
      
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content;
      return res.json(text ? { text } : { text: `No results for: ${query}` });
    }
  } catch (error) {
    console.error("Agent Search Error:", error);
    res.status(500).json({ error: "Internal server error during agent search" });
  }
});

// File upload (server-side Blob, auth-gated)
router.post("/files/upload", async (req, res) => {
  let decoded;
  try {
    decoded = await verifyAuth(req.headers);
  } catch (err: any) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const { context, jobId, submissionId, fileBase64, fileName, fileType, fileSize } = req.body;
  if (!fileBase64) return res.status(400).json({ error: "No file provided" });
  if (!context) return res.status(400).json({ error: "context field is required" });

  try {
    const safeFileName = fileName || `upload-${Date.now()}`;
    const fileBuffer = Buffer.from(fileBase64, 'base64');

    console.log(`[API] Uploading ${safeFileName} (${fileBuffer.byteLength} bytes) for context: ${context}`);

    // Check environment variables
    if (!BLOB_READ_WRITE_TOKEN) {
      console.error("[API] Configuration Error: BLOB_READ_WRITE_TOKEN is missing.");
      return res.status(503).json({ error: "Service unavailable: Storage token missing." });
    }

    // Optional: check file type against ALLOWED_MIME_TYPES
    if (!ALLOWED_MIME_TYPES.has(fileType || '')) {
      console.warn(`[API] Invalid file type blocked: ${fileType}`);
      // return res.status(400).json({ error: `File type not allowed: ${fileType}` });
    }

    console.log(`[API] Sending file to Vercel Blob...`);
    const blob = await put(safeFileName, fileBuffer, {
      access: "public",
      token: BLOB_READ_WRITE_TOKEN,
      contentType: fileType || "application/octet-stream",
      addRandomSuffix: true,
    });
    console.log(`[API] Vercel Blob success: ${blob.url}`);

    console.log(`[API] Adding to Firestore...`);
    const fileRef = await adminDb.collection("uploaded_files").add({

      url: blob.url,
      fileName: safeFileName,
      fileType: fileType || "application/octet-stream",
      fileSize: fileSize || fileBuffer.byteLength,
      uploadedBy: decoded.uid,
      context,
      jobId: jobId || null,
      submissionId: submissionId || null,
      uploadedAt: new Date().toISOString(),
    });
    console.log(`[API] Firestore success: ${fileRef.id}`);

    res.json({ url: blob.url, fileId: fileRef.id });
  } catch (err: any) {
    console.error("[API] ❌ Upload failed catastrophically:", err);
    res.status(500).json({
      error: "Upload failed",
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// File delete
router.post("/files/delete", async (req, res) => {
  const { fileId, fileUrl } = req.body;
  let decoded;
  try {
    decoded = await verifyAuth(req.headers);
  } catch (err: any) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  if (!fileId || !fileUrl) return res.status(400).json({ error: "Missing fileId or fileUrl" });

  try {
    const uid = decoded.uid;
    const fileRef = adminDb.collection("uploaded_files").doc(fileId);
    const fileDoc = await fileRef.get();

    if (!fileDoc.exists) return res.status(404).json({ error: "File record not found in database" });

    const fileData = fileDoc.data();
    let authorized = fileData?.uploadedBy === uid || (await isAdmin(uid));

    if (!authorized) return res.status(403).json({ error: "You don't have permission to delete this file" });

    try {
      await del(fileUrl, { token: BLOB_READ_WRITE_TOKEN });
    } catch (blobError: any) {
      if (!blobError.message?.includes("404")) throw blobError;
    }

    await fileRef.delete();
    res.json({ success: true, message: "File deleted successfully" });
  } catch (error: any) {
    console.error("Delete operation failed:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

// Notifications registration
router.post("/notifications/token", async (req, res) => {
  let decoded;
  try {
    decoded = await verifyAuth(req.headers);
  } catch (err: any) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  try {
    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(400).json({ error: "Missing FCM Token" });

    await adminDb.collection("users").doc(decoded.uid).update({
      fcmTokens: admin.firestore.FieldValue.arrayUnion(fcmToken),
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error registering FCM token:", error);
    res.status(500).json({ error: "Failed to register token" });
  }
});

// Payment – initialize escrow
router.post("/payment/initialize-escrow", async (req, res) => {
  let decoded;
  try {
    decoded = await verifyAuth(req.headers);
  } catch (err: any) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const { jobId } = req.body;
  if (!jobId) return res.status(400).json({ error: "jobId is required" });

  try {
    const jobDoc = await adminDb.collection("jobs").doc(jobId).get();
    if (!jobDoc.exists) return res.status(404).json({ error: "Job not found" });

    const job = jobDoc.data()!;
    if (job.clientId !== decoded.uid) return res.status(403).json({ error: "Only the job client can initialize escrow" });

    const platformFee = Math.round(job.budget * PLATFORM_FEE_PERCENTAGE);
    const totalAmount = job.budget + platformFee;

    const paymentRef = await adminDb.collection("payments").add({
      jobId,
      payerId: job.clientId,
      payeeId: job.selectedArchitectId || "",
      amount: totalAmount,
      type: "escrow_deposit",
      status: "pending",
      metadata: { platformFee, architectAmount: job.budget },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await adminDb.collection("escrow").doc(jobId).set({
      totalAmount,
      heldAmount: 0,
      releasedAmount: 0,
      platformFeeAmount: platformFee,
      status: "pending",
      paymentId: paymentRef.id,
      milestones: {
        initial: { percentage: 20, status: "pending", released: false },
        draft: { percentage: 40, status: "pending", released: false },
        final: { percentage: 40, status: "pending", released: false },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    // Build PayFast URL
    const PAYFAST_MERCHANT_ID = process.env.VITE_PAYFAST_MERCHANT_ID || "";
    const PAYFAST_MERCHANT_KEY = process.env.VITE_PAYFAST_MERCHANT_KEY || "";
    const PAYFAST_SANDBOX = process.env.VITE_PAYFAST_SANDBOX === "true";
    const baseUrl = process.env.APP_BASE_URL || "https://architex.co.za";
    const pfUrl = PAYFAST_SANDBOX ? "https://sandbox.payfast.co.za/eng/process" : "https://www.payfast.co.za/eng/process";

    const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
    const userData = userDoc.data();
    const displayName = userData?.displayName || "";

    const data: Record<string, string> = {
      merchant_id: PAYFAST_MERCHANT_ID,
      merchant_key: PAYFAST_MERCHANT_KEY,
      return_url: `${baseUrl}/api/payment/success?payment_id=${paymentRef.id}`,
      cancel_url: `${baseUrl}/api/payment/cancel?payment_id=${paymentRef.id}`,
      notify_url: `${baseUrl}/api/payment/notify`,
      name_first: displayName.split(" ")[0] || displayName,
      name_last: displayName.split(" ").slice(1).join(" ") || "",
      email_address: userData?.email || "",
      m_payment_id: paymentRef.id,
      amount: (totalAmount / 100).toFixed(2),
      item_name: `Escrow: ${(job.title || "").substring(0, 100)}`,
      item_description: "Payment for architectural services via Architex",
      custom_str1: paymentRef.id,
      custom_str2: decoded.uid,
    };

    Object.keys(data).forEach(k => { if (!data[k]) delete data[k]; });

    const sorted = Object.keys(data).sort();
    let paramStr = sorted.map(k => `${k}=${encodeURIComponent(data[k]).replace(/%20/g, "+")}`).join("&");
    if (PAYFAST_PASSPHRASE) paramStr += `&passphrase=${encodeURIComponent(PAYFAST_PASSPHRASE).replace(/%20/g, "+")}`;
    const signature = crypto.createHash("md5").update(paramStr).digest("hex");

    const params = new URLSearchParams({ ...data, signature }).toString();
    res.json({ paymentUrl: `${pfUrl}?${params}`, paymentId: paymentRef.id });
  } catch (err: any) {
    console.error("Initialize escrow error:", err);
    res.status(500).json({ error: "Internal server error", details: err.message });
  }
});

// Payment – release milestone
router.post("/payment/release-milestone", async (req, res) => {
  let decoded;
  try {
    decoded = await verifyAuth(req.headers);
  } catch (err: any) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const { jobId, milestone } = req.body;
  if (!jobId || !milestone) return res.status(400).json({ error: "jobId and milestone are required" });

  try {
    const jobDoc = await adminDb.collection("jobs").doc(jobId).get();
    if (!jobDoc.exists) return res.status(404).json({ error: "Job not found" });
    const job = jobDoc.data()!;

    if (job.clientId !== decoded.uid) return res.status(403).json({ error: "Only the job client can release milestone payments" });

    const escrowRef = adminDb.collection("escrow").doc(jobId);
    const escrowDoc = await escrowRef.get();
    if (!escrowDoc.exists) return res.status(404).json({ error: "Escrow not found" });
    const escrow = escrowDoc.data()!;

    if (!["funded", "partially_released"].includes(escrow.status)) return res.status(400).json({ error: "Escrow is not funded" });
    if (escrow.milestones?.[milestone]?.released) return res.status(400).json({ error: "Milestone already released" });

    const percentages: Record<string, number> = { initial: 0.20, draft: 0.40, final: 0.40 };
    const releaseAmount = Math.round(job.budget * percentages[milestone]);
    const platformFee = Math.round(releaseAmount * PLATFORM_FEE_PERCENTAGE);
    const architectAmount = releaseAmount - platformFee;

    const batch = adminDb.batch();
    batch.update(escrowRef, {
      heldAmount: escrow.heldAmount - releaseAmount,
      releasedAmount: (escrow.releasedAmount || 0) + releaseAmount,
      [`milestones.${milestone}.status`]: "released",
      [`milestones.${milestone}.released`]: true,
      [`milestones.${milestone}.releasedAt`]: new Date().toISOString(),
      [`milestones.${milestone}.amount`]: architectAmount,
      status: escrow.heldAmount - releaseAmount <= 0 ? "fully_released" : "partially_released",
      updatedAt: new Date().toISOString(),
    });

    const paymentRef = adminDb.collection("payments").doc();
    batch.set(paymentRef, {
      jobId,
      payerId: job.clientId,
      payeeId: job.selectedArchitectId || "",
      amount: architectAmount,
      type: "milestone_release",
      milestone,
      status: "completed",
      metadata: { platformFee, grossAmount: releaseAmount },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await batch.commit();
    res.json({ success: true, releasedAmount: architectAmount });
  } catch (err: any) {
    console.error("Release milestone error:", err);
    res.status(500).json({ error: "Internal server error", details: err.message });
  }
});

// Payment – confirm
router.post("/payment/confirm", async (req, res) => {
  const { paymentId, pfData } = req.body;
  if (!paymentId || !pfData) return res.status(400).json({ error: "Missing paymentId or pfData" });

  try {
    const paymentRef = adminDb.collection("payments").doc(paymentId);
    const paymentDoc = await paymentRef.get();
    if (!paymentDoc.exists) return res.status(404).json({ error: "Payment not found" });

    const payment = paymentDoc.data()!;
    if (payment.status === "completed") return res.json({ success: true, message: "Payment already processed" });

    if (pfData["amount_gross"] !== (payment.amount / 100).toFixed(2)) return res.status(400).json({ error: "Amount mismatch" });

    await paymentRef.update({
      status: "completed",
      transactionId: pfData["pf_payment_id"],
      processedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { ...(payment.metadata || {}), payfastData: pfData },
    });

    if (payment.jobId) {
      await adminDb.collection("escrow").doc(payment.jobId).update({
        status: "funded",
        heldAmount: payment.amount,
        fundedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error("Payment confirmation error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PayFast ITN webhook
router.post("/payment/notify", async (req, res) => {
  try {
    const pfData = { ...req.body };
    const paymentId = pfData["m_payment_id"];
    if (!paymentId) return res.status(400).send("No payment ID provided");

    const paymentRef = adminDb.collection("payments").doc(paymentId);
    const paymentDoc = await paymentRef.get();
    if (!paymentDoc.exists) return res.status(404).send("Payment not found");

    if (pfData["payment_status"] === "COMPLETE") {
      // Similar logic to /confirm
      await paymentRef.update({
        status: "completed",
        transactionId: pfData["pf_payment_id"],
        processedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: { ...(paymentDoc.data()?.metadata || {}), payfastData: pfData, itn: true },
      });
      if (paymentDoc.data()?.jobId) {
        await adminDb.collection("escrow").doc(paymentDoc.data()!.jobId).update({
          status: "funded",
          heldAmount: paymentDoc.data()!.amount,
          fundedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }
    res.status(200).send("OK");
  } catch (err) {
    console.error("ITN error:", err);
    res.status(500).send("Internal Error");
  }
});

// ── Municipal Tracker Routes ───────────────────────────────────────────────

// Get Municipal Settings
router.get("/municipal/settings", async (req, res) => {
  try {
    await verifyAuth(req.headers);
    const doc = await adminDb.collection("system_settings").doc("municipal_tracker").get();
    res.json(doc.exists ? doc.data() : { municipalTrackerEnabled: false });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Update Municipal Settings (Admin Only)
router.post("/municipal/settings", async (req, res) => {
  try {
    const decoded = await verifyAuth(req.headers);
    if (!(await isAdmin(decoded.uid))) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const settings = req.body;
    await adminDb.collection("system_settings").doc("municipal_tracker").set({
      ...settings,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    res.json({ success: true });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Save Municipal Credentials
router.post("/municipal/credentials", async (req, res) => {
  try {
    const decoded = await verifyAuth(req.headers);
    const { municipality, username, password } = req.body;

    if (!municipality || !username || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const { encrypted, iv, authTag } = encrypt(password);

    const credRef = adminDb.collection("municipal_credentials").doc(`${decoded.uid}_${municipality}`);
    await credRef.set({
      userId: decoded.uid,
      municipality,
      username,
      encryptedPassword: encrypted,
      iv,
      authTag,
      status: 'unchecked',
      createdAt: new Date().toISOString()
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Trigger Scraper
router.post("/municipal/scrape", async (req, res) => {
  try {
    const decoded = await verifyAuth(req.headers);
    const { municipality } = req.body;

    if (!municipality) return res.status(400).json({ error: "Municipality is required" });

    const result = await runMunicipalScraper(decoded.uid, municipality as MunicipalityType);
    res.json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// OCR Receipt Processing
router.post("/municipal/ocr", async (req, res) => {
  try {
    const decoded = await verifyAuth(req.headers);
    const { imageUrl } = req.body;

    if (!imageUrl) return res.status(400).json({ error: "imageUrl is required" });

    const result = await processReceiptOCR(imageUrl, decoded.uid);
    res.json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Get Heatmap
router.get("/municipal/heatmap/:municipality", async (req, res) => {
  try {
    await verifyAuth(req.headers);
    const { municipality } = req.params;
    const stats = await getMunicipalityHeatMap(municipality as MunicipalityType);
    res.json(stats);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Shadow Tracker Ingestion
router.post("/municipal/shadow-track", async (req, res) => {
  try {
    const decoded = await verifyAuth(req.headers);
    const { content } = req.body;
    const result = await detectMunicipalInvoices(content, decoded.uid);
    res.json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Submit Manual Tracking
router.post("/municipal/submissions", async (req, res) => {
  try {
    const decoded = await verifyAuth(req.headers);
    const submission = req.body;

    const docRef = await adminDb.collection("council_submissions").add({
      ...submission,
      userId: decoded.uid,
      createdAt: new Date().toISOString(),
      trackingHistory: [
        {
          status: submission.status,
          timestamp: new Date().toISOString(),
          notes: "Initial submission",
          source: submission.source || 'manual'
        }
      ]
    });

    res.json({ id: docRef.id });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Get User's Submissions
router.get("/municipal/submissions", async (req, res) => {
  try {
    const decoded = await verifyAuth(req.headers);
    const snapshot = await adminDb.collection("council_submissions")
      .where("userId", "==", decoded.uid)
      .get();

    const submissions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(submissions);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// SACAP Verification Agent (Real Automation)
router.post("/architect/verify-sacap", async (req, res) => {
  try {
    await verifyAuth(req.headers);
    const { architectId, name, sacapNumber } = req.body;

    if (!architectId || !name) {
      return res.status(400).json({ error: "Missing architectId or name" });
    }

    console.log(`[SACAP Agent] Verifying architect: ${name} (SACAP: ${sacapNumber || 'N/A'})`);

    const result = await verifySACAPRegistration(name);
    const status = result.verified ? 'verified' : 'failed';

    // Update the architect profile in Firestore
    await adminDb.collection("architect_profiles").doc(architectId).set({
      sacapStatus: status,
      sacapLastVerifiedAt: new Date().toISOString(),
      sacapCategory: result.registrationDetails?.category || null,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    res.json({
      success: true,
      status,
      details: result.registrationDetails,
      message: status === 'verified'
        ? `Architect SACAP status verified as ${result.registrationDetails?.category}.`
        : 'Architect not found in SACAP registry.'
    });
  } catch (err: any) {
    console.error("SACAP Verification Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Crowdsource Update
router.post("/municipal/crowdsource", async (req, res) => {
  try {
    const decoded = await verifyAuth(req.headers);
    const update = req.body;

    const docRef = await adminDb.collection("crowdsource_updates").add({
      ...update,
      reportedBy: decoded.uid,
      timestamp: new Date().toISOString()
    });

    res.json({ id: docRef.id });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Firebase test endpoint
router.get("/firebase/test", async (_req, res) => {
  try {
    const collections = await adminDb.listCollections();
    const collectionNames = collections.map(col => col.id);
    res.json({
      status: "success",
      firebaseConfig: firebaseConfig,
      collections: collectionNames,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
})

export default router;
