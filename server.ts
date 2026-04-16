import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";
import cors from "cors";
import crypto from "crypto";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "./firebase-applet-config.json" assert { type: "json" };
import { del } from "@vercel/blob";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

// Initialize Firestore with the correct database ID using the proper SDK method
const adminDb = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId)
  : getFirestore(admin.app());

// Get environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const PAYFAST_MERCHANT_ID = process.env.VITE_PAYFAST_MERCHANT_ID || "";
const PAYFAST_MERCHANT_KEY = process.env.VITE_PAYFAST_MERCHANT_KEY || "";
const PAYFAST_PASSPHRASE = process.env.VITE_PAYFAST_PASSPHRASE || "";
const BLOB_READ_WRITE_TOKEN = process.env.VITE_BLOB_READ_WRITE_TOKEN || "";


async function getAdminLLMConfig() {
  try {
    const doc = await adminDb.collection('system_settings').doc('llm_config').get();
    if (doc.exists) {
      return doc.data();
    }
  } catch (error) {
    console.error("Error fetching LLM config from Firestore Admin:", error);
  }
  return null;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Apply CORS middleware
  app.use(cors({
    origin: process.env.NODE_ENV === 'production'
      ? ['https://architex.co.za'] // Proposed production domain
      : ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true
  }));

  // Rate limiting for API endpoints
  const reviewLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 requests per windowMs
    message: { error: "Too many review requests, please try again later" },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // limit each IP to 60 requests per minute
    message: { error: "Too many requests, please slow down" },
  });

  // Apply rate limiting to API routes
  app.use("/api/review", reviewLimiter);
  app.use("/api/gemini", reviewLimiter);
  app.use("/api/", apiLimiter);

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Generic LLM Proxy endpoint - Now fetches config on server
  app.post("/api/review", async (req, res) => {
    const { systemInstruction, prompt } = req.body;
    const config = await getAdminLLMConfig();

    if (!config) {
      return res.status(400).json({ 
        error: "LLM configuration not found. Please configure a provider in Admin Dashboard > Settings." 
      });
    }

    if (config.provider === 'gemini') {
      return res.status(400).json({ 
        error: "Invalid configuration for OpenAI-compatible provider. Current provider is Gemini.",
        suggestion: "Use the /api/gemini/review endpoint or switch the provider in Settings."
      });
    }

    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return res.status(response.status).json(errorData);
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Server LLM Proxy Error:", error);
      res.status(500).json({ error: "Failed to fetch from LLM provider" });
    }
  });

  // Gemini API Proxy - Server-side only (protects API key) — requires Firebase auth
  app.post("/api/gemini/review", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required. Please sign in to run an AI review." });
    }
    try {
      await admin.auth().verifyIdToken(authHeader.split("Bearer ")[1]);
    } catch (authErr) {
      return res.status(401).json({ error: "Invalid or expired session. Please sign out and sign back in." });
    }

    // original handler continues below
    const _handler = async () => {
    const { systemInstruction, prompt, drawingUrl, config } = req.body;
    const dbConfig = await getAdminLLMConfig();
    
    // Use forwarded config or fallback to database config or environment variables
    const activeApiKey = config?.apiKey || dbConfig?.apiKey || GEMINI_API_KEY;
    const activeModel = config?.model || dbConfig?.model || "gemini-2.0-flash";

    // Check if Gemini API key is configured
    if (!activeApiKey || activeApiKey === '') {
      console.warn("Gemini API key not configured - returning mock response for testing");
      
      // Return mock AI response for testing
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                status: 'failed',
                feedback: 'AI Review (MOCK/TEST RESPONSE): No API key configured. This is a placeholder report for testing purposes.',
                categories: [
                  {
                    name: 'Environment Check',
                    issues: [{
                      description: 'Gemini API Key is missing in LLM Settings',
                      severity: 'high',
                      actionItem: 'Please enter a valid Gemini API key in the Admin Dashboard Settings.'
                    }]
                  },
                  {
                    name: 'Wall Compliance (SANS 10400-K)',
                    issues: [{
                      description: 'External wall thickness is less than 230mm (Simulated)',
                      severity: 'high',
                      actionItem: 'Increase external wall thickness to minimum 230mm per SANS 10400-K'
                    }]
                  }
                ],
                traceLog: 'MOCK MODE: Orchestrator initialized. Missing API Key detected. Returning static test data.'
              })
            }]
          },
          finishReason: 'STOP'
        }]
      };
      
      return res.json(mockResponse);
    }

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    try {
      const parts: any[] = [{ text: prompt }];

      // Handle drawing image/PDF if provided
      if (drawingUrl) {
        try {
          const imageResp = await fetch(drawingUrl);
          if (imageResp.ok) {
            const buffer = await imageResp.arrayBuffer();
            const base64Data = Buffer.from(buffer).toString('base64');
            
            // Determine MIME type
            let mimeType = imageResp.headers.get('content-type') || 'image/jpeg';
            if (drawingUrl.toLowerCase().endsWith('.pdf')) {
              mimeType = 'application/pdf';
            } else if (drawingUrl.toLowerCase().endsWith('.dwg')) {
              // DWG not directly supported by Gemini, but we can pass it as octet-stream and see
              mimeType = 'application/octet-stream'; 
            }

            parts.push({
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            });
          }
        } catch (fetchError) {
          console.error("Error fetching drawing for Gemini:", fetchError);
          // Continue with just text if image fetch fails, or we could error out
        }
      }

      // Build request body according to Gemini API specification
      const requestBody: any = {
        contents: [
          {
            role: "user",
            parts: parts,
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
      };

      // Add system instruction if provided (Gemini uses systemInstruction field)
      if (systemInstruction) {
        requestBody.systemInstruction = {
          parts: [{ text: systemInstruction }],
        };
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${activeApiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Gemini API error:", errorData);
        return res.status(response.status).json({
          error: "Gemini API request failed",
          details: errorData,
        });
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Server Gemini Proxy Error:", error);
      res.status(500).json({ error: "Failed to fetch from Gemini API" });
    }
    }; // end _handler
    await _handler();
  });
  
  // Agent Web Search endpoint - Uses Gemini with Google Search grounding
  app.post("/api/agent/search", async (req, res) => {
    const { query, agentRole } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    if (!query) {
      return res.status(400).json({ error: "Search query is required" });
    }

    try {
      // Verify token
      const idToken = authHeader.split("Bearer ")[1];
      await admin.auth().verifyIdToken(idToken);

      const dbConfig = await getAdminLLMConfig();
      const activeApiKey = dbConfig?.apiKey || GEMINI_API_KEY;
      
      // Use 1.5 Flash for search as it is fast and supports tools well
      const activeModel = "gemini-1.5-flash"; 

      if (!activeApiKey || activeApiKey === '') {
        return res.status(400).json({ error: "Gemini API key not configured for search" });
      }

      const requestBody = {
        contents: [
          {
            role: "user",
            parts: [{ text: `Research the following query related to ${agentRole}: ${query}` }],
          },
        ],
        tools: [
          {
            googleSearchRetrieval: {}
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
        },
      };

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${activeApiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        return res.status(response.status).json(errorData);
      }

      const data = await response.json();
      
      // Extract text from response
      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        res.json({ text: data.candidates[0].content.parts[0].text });
      } else {
        res.json(data);
      }
    } catch (error) {
      console.error("Agent Search Error:", error);
      res.status(500).json({ error: "Internal server error during agent search" });
    }
  });

  // ── File Upload endpoint ────────────────────────────────────────────────────
  // Validates auth, authorization against jobId/submissionId, MIME type, and size.
  app.post("/api/files/upload", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer "))
      return res.status(401).json({ error: "Authentication required" });

    const ALLOWED_MIME_TYPES: Record<string, string[]> = {
      drawing:     ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
      document:    ['application/pdf', 'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      profile:     ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
      sacap:       ['image/png', 'image/jpeg', 'application/pdf'],
      message:     ['image/png', 'image/jpeg', 'image/webp',
                    'application/pdf', 'video/mp4', 'audio/mpeg'],
      invoice:     ['application/pdf'],
      verification:['image/png', 'image/jpeg', 'application/pdf'],
    };
    const MAX_SIZE_BYTES: Record<string, number> = {
      drawing:     50 * 1024 * 1024,  // 50 MB
      document:    20 * 1024 * 1024,  // 20 MB
      profile:      5 * 1024 * 1024,  //  5 MB
      sacap:       20 * 1024 * 1024,
      message:     25 * 1024 * 1024,
      invoice:     10 * 1024 * 1024,
      verification:20 * 1024 * 1024,
    };

    try {
      const decodedToken = await admin.auth().verifyIdToken(authHeader.split("Bearer ")[1]);
      const uid = decodedToken.uid;

      const { fileName, fileType, fileSize, context, jobId, submissionId, fileBase64 } = req.body;

      // --- Input validation ---
      if (!fileName || !fileType || !fileSize || !context || !fileBase64) {
        return res.status(400).json({ error: "Missing required fields: fileName, fileType, fileSize, context, fileBase64" });
      }

      const allowedMimes = ALLOWED_MIME_TYPES[context];
      if (!allowedMimes) {
        return res.status(400).json({ error: `Unknown upload context: ${context}` });
      }
      if (!allowedMimes.includes(fileType)) {
        return res.status(415).json({
          error: `File type '${fileType}' is not allowed for context '${context}'.`,
          allowed: allowedMimes,
        });
      }

      const maxBytes = MAX_SIZE_BYTES[context] ?? 10 * 1024 * 1024;
      if (fileSize > maxBytes) {
        return res.status(413).json({
          error: `File too large. Maximum allowed for '${context}' is ${maxBytes / 1024 / 1024} MB.`,
        });
      }

      // --- Authorization: verify the user is a party to the referenced job/submission ---
      if (jobId) {
        const jobSnap = await adminDb.collection('jobs').doc(jobId).get();
        if (!jobSnap.exists) return res.status(404).json({ error: 'Referenced job not found' });
        const job = jobSnap.data()!;
        const userSnap = await adminDb.collection('users').doc(uid).get();
        const isAdmin = userSnap.data()?.role === 'admin';
        if (!isAdmin && job.clientId !== uid && job.selectedArchitectId !== uid) {
          return res.status(403).json({ error: 'You are not authorized to upload files for this job' });
        }
      } else if (submissionId) {
        // Resolve the parent job via the submission document searched across subcollections
        const subQuery = await adminDb.collectionGroup('submissions').where(admin.firestore.FieldPath.documentId(), '==', submissionId).limit(1).get();
        if (subQuery.empty) return res.status(404).json({ error: 'Referenced submission not found' });
        const subData = subQuery.docs[0].data();
        const parentJobId = subQuery.docs[0].ref.parent.parent?.id;
        if (parentJobId) {
          const jobSnap = await adminDb.collection('jobs').doc(parentJobId).get();
          const job = jobSnap.data();
          const userSnap = await adminDb.collection('users').doc(uid).get();
          const isAdmin = userSnap.data()?.role === 'admin';
          if (!isAdmin && job?.clientId !== uid && job?.selectedArchitectId !== uid && subData.architectId !== uid) {
            return res.status(403).json({ error: 'You are not authorized to upload files for this submission' });
          }
        }
      } else {
        // No job/submission context — only allow profile/sacap/verification uploads for the owner
        if (!['profile', 'sacap', 'verification'].includes(context)) {
          return res.status(400).json({ error: `A jobId or submissionId is required for context '${context}'` });
        }
      }

      // --- Upload to Vercel Blob ---
      const { put } = await import('@vercel/blob');
      const fileBuffer = Buffer.from(fileBase64, 'base64');
      const blob = await put(fileName, fileBuffer, {
        access: 'public',
        token: BLOB_READ_WRITE_TOKEN,
        contentType: fileType,
      });

      // --- Track in Firestore (server-side, trusted) ---
      await adminDb.collection('uploaded_files').add({
        url: blob.url,
        fileName,
        fileType,
        fileSize,
        uploadedBy: uid,           // derived from verified token — not client-supplied
        context,
        jobId: jobId || null,
        submissionId: submissionId || null,
        uploadedAt: new Date().toISOString(),
      });

      return res.json({ success: true, url: blob.url });
    } catch (error: any) {
      console.error('File upload error:', error);
      if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
        return res.status(401).json({ error: 'Invalid or expired session' });
      }
      return res.status(500).json({ error: 'File upload failed', details: error.message });
    }
  });

  // ── Payment – escrow initialization ─────────────────────────────────────────
  app.post("/api/payment/escrow/init", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer "))
      return res.status(401).json({ error: "Authentication required" });
    try {
      const decodedToken = await admin.auth().verifyIdToken(authHeader.split("Bearer ")[1]);
      const uid = decodedToken.uid;
      const { jobId } = req.body;
      if (!jobId) return res.status(400).json({ error: "Missing jobId" });

      const jobSnap = await adminDb.collection('jobs').doc(jobId).get();
      if (!jobSnap.exists) return res.status(404).json({ error: "Job not found" });
      const job = jobSnap.data()!;

      if (job.clientId !== uid) {
        return res.status(403).json({ error: "Only the client who owns this job can initialize escrow" });
      }
      if (!job.budget || job.budget <= 0) {
        return res.status(400).json({ error: "Job has no valid budget" });
      }

      const PLATFORM_FEE_PERCENTAGE = 0.05;
      const platformFee = Math.round(job.budget * PLATFORM_FEE_PERCENTAGE);
      const totalAmount = job.budget + platformFee;

      const escrowData = {
        totalAmount,
        heldAmount: 0,
        releasedAmount: 0,
        platformFeeAmount: platformFee,
        status: 'pending',
        milestones: {
          initial: { percentage: 20, status: 'pending', released: false },
          draft:   { percentage: 40, status: 'pending', released: false },
          final:   { percentage: 40, status: 'pending', released: false },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await adminDb.collection('escrow').doc(jobId).set(escrowData, { merge: true });

      const paymentData = {
        jobId,
        payerId: job.clientId,
        payeeId: job.selectedArchitectId || '',
        amount: totalAmount,
        type: 'escrow_deposit',
        status: 'pending',
        metadata: { platformFee, architectAmount: job.budget },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const paymentRef = await adminDb.collection('payments').add(paymentData);
      await adminDb.collection('escrow').doc(jobId).update({ paymentId: paymentRef.id });

      return res.json({ success: true, paymentId: paymentRef.id, totalAmount });
    } catch (err: any) {
      console.error('Escrow init error:', err);
      return res.status(500).json({ error: 'Failed to initialize escrow', details: err.message });
    }
  });

  // ── Payment – milestone release (client approves) ─────────────────────────────
  app.post("/api/payment/milestone/release", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer "))
      return res.status(401).json({ error: "Authentication required" });
    try {
      const decodedToken = await admin.auth().verifyIdToken(authHeader.split("Bearer ")[1]);
      const uid = decodedToken.uid;
      const { jobId, milestone } = req.body;
      if (!jobId || !milestone) return res.status(400).json({ error: "Missing jobId or milestone" });
      if (!['initial','draft','final'].includes(milestone))
        return res.status(400).json({ error: "Invalid milestone" });

      const jobSnap = await adminDb.collection('jobs').doc(jobId).get();
      if (!jobSnap.exists) return res.status(404).json({ error: "Job not found" });
      const job = jobSnap.data()!;
      if (job.clientId !== uid)
        return res.status(403).json({ error: "Only the client can release milestone payments" });

      const escrowSnap = await adminDb.collection('escrow').doc(jobId).get();
      if (!escrowSnap.exists) return res.status(404).json({ error: "Escrow not found" });
      const escrow = escrowSnap.data()!;
      if (!['funded','partially_released'].includes(escrow.status))
        return res.status(400).json({ error: "Escrow is not funded" });
      if (escrow.milestones[milestone]?.released)
        return res.status(400).json({ error: "Milestone already released" });

      const PLATFORM_FEE_PERCENTAGE = 0.05;
      const percentages: Record<string,number> = { initial:0.20, draft:0.40, final:0.40 };
      const releaseAmount  = Math.round(job.budget * percentages[milestone]);
      const platformFee    = Math.round(releaseAmount * PLATFORM_FEE_PERCENTAGE);
      const architectAmount = releaseAmount - platformFee;
      const remainingHeld  = escrow.heldAmount - releaseAmount;

      const batch = adminDb.batch();
      const escrowRef = adminDb.collection('escrow').doc(jobId);
      batch.update(escrowRef, {
        heldAmount:          remainingHeld,
        releasedAmount:      escrow.releasedAmount + releaseAmount,
        platformFeeAmount:   escrow.platformFeeAmount + platformFee,
        [`milestones.${milestone}.status`]:     'released',
        [`milestones.${milestone}.released`]:   true,
        [`milestones.${milestone}.releasedAt`]: new Date().toISOString(),
        [`milestones.${milestone}.amount`]:     architectAmount,
        status: remainingHeld <= 0 ? 'fully_released' : 'partially_released',
        updatedAt: new Date().toISOString(),
      });
      const payRef = adminDb.collection('payments').doc();
      batch.set(payRef, {
        jobId,
        payerId: job.clientId,
        payeeId: job.selectedArchitectId || '',
        amount: architectAmount,
        type: 'milestone_release',
        milestone,
        status: 'completed',
        metadata: { platformFee, grossAmount: releaseAmount },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await batch.commit();
      return res.json({ success: true, architectAmount, milestone });
    } catch (err: any) {
      console.error('Milestone release error:', err);
      return res.status(500).json({ error: 'Failed to release milestone', details: err.message });
    }
  });

  // ── Payment – milestone release request (architect initiates) ────────────────
  app.post("/api/payment/milestone/request", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer "))
      return res.status(401).json({ error: "Authentication required" });
    try {
      const decodedToken = await admin.auth().verifyIdToken(authHeader.split("Bearer ")[1]);
      const uid = decodedToken.uid;
      const { jobId, milestone } = req.body;
      if (!jobId || !milestone) return res.status(400).json({ error: "Missing jobId or milestone" });
      if (!['initial','draft','final'].includes(milestone))
        return res.status(400).json({ error: "Invalid milestone" });

      const jobSnap = await adminDb.collection('jobs').doc(jobId).get();
      if (!jobSnap.exists) return res.status(404).json({ error: "Job not found" });
      const job = jobSnap.data()!;
      if (job.selectedArchitectId !== uid)
        return res.status(403).json({ error: "Only the assigned architect can request milestone release" });

      const escrowSnap = await adminDb.collection('escrow').doc(jobId).get();
      if (!escrowSnap.exists) return res.status(404).json({ error: "Escrow not found" });
      const escrow = escrowSnap.data()!;
      if (escrow.milestones[milestone]?.released)
        return res.status(400).json({ error: "Milestone already released" });
      if (escrow.milestones[milestone]?.status === 'requested')
        return res.status(400).json({ error: "Release already requested" });

      await adminDb.collection('escrow').doc(jobId).update({
        [`milestones.${milestone}.status`]:      'requested',
        [`milestones.${milestone}.requestedAt`]: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return res.json({ success: true });
    } catch (err: any) {
      console.error('Milestone request error:', err);
      return res.status(500).json({ error: 'Failed to request milestone release', details: err.message });
    }
  });

  // ── Payment – refund ──────────────────────────────────────────────────────────
  app.post("/api/payment/refund", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer "))
      return res.status(401).json({ error: "Authentication required" });
    try {
      const decodedToken = await admin.auth().verifyIdToken(authHeader.split("Bearer ")[1]);
      const uid = decodedToken.uid;
      const { jobId, amount, reason } = req.body;
      if (!jobId || !amount || !reason)
        return res.status(400).json({ error: "Missing jobId, amount, or reason" });

      const jobSnap = await adminDb.collection('jobs').doc(jobId).get();
      if (!jobSnap.exists) return res.status(404).json({ error: "Job not found" });
      const job = jobSnap.data()!;
      if (job.clientId !== uid)
        return res.status(403).json({ error: "Only the client can request a refund" });

      const escrowSnap = await adminDb.collection('escrow').doc(jobId).get();
      if (!escrowSnap.exists) return res.status(404).json({ error: "Escrow not found" });
      const escrow = escrowSnap.data()!;
      if (amount > escrow.heldAmount)
        return res.status(400).json({ error: "Refund amount exceeds available held funds" });

      const PLATFORM_FEE_PERCENTAGE = 0.05;
      const platformFee  = Math.round(amount * PLATFORM_FEE_PERCENTAGE);
      const refundAmount = amount - platformFee;
      const remainingHeld = escrow.heldAmount - amount;

      const batch = adminDb.batch();
      batch.update(adminDb.collection('escrow').doc(jobId), {
        heldAmount:     remainingHeld,
        refundedAmount: (escrow.refundedAmount || 0) + refundAmount,
        status: remainingHeld <= 0 ? 'refunded' : 'partially_refunded',
        updatedAt: new Date().toISOString(),
      });
      const payRef = adminDb.collection('payments').doc();
      batch.set(payRef, {
        jobId,
        payerId: job.clientId,
        payeeId: job.selectedArchitectId || '',
        amount: refundAmount,
        type: 'refund',
        status: 'completed',
        metadata: { reason, platformFee },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await batch.commit();
      return res.json({ success: true, refundAmount, platformFee });
    } catch (err: any) {
      console.error('Refund error:', err);
      return res.status(500).json({ error: 'Failed to process refund', details: err.message });
    }
  });

  // File Delete endpoint - Server-side only (protects Blob token and verifies ownership)
  app.post("/api/files/delete", async (req, res) => {
    const { fileId, fileUrl } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    if (!fileId || !fileUrl) {
      return res.status(400).json({ error: "Missing fileId or fileUrl" });
    }

    const idToken = authHeader.split("Bearer ")[1];

    try {
      // 1. Verify user's ID token
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const uid = decodedToken.uid;

      // 2. Fetch file document from Firestore to check ownership
      const fileRef = adminDb.collection('uploaded_files').doc(fileId);
      const fileDoc = await fileRef.get();

      if (!fileDoc.exists) {
        return res.status(404).json({ error: "File record not found in database" });
      }

      const fileData = fileDoc.data();
      
      // 3. Authorization check: must be owner or admin
      let isAuthorized = fileData?.uploadedBy === uid;
      
      if (!isAuthorized) {
        // Double check admin role in users collection
        const userDoc = await adminDb.collection('users').doc(uid).get();
        const userData = userDoc.data();
        if (userData?.role === 'admin') {
          isAuthorized = true;
        }
      }

      if (!isAuthorized) {
        return res.status(403).json({ error: "You don't have permission to delete this file" });
      }

      // 4. Delete from Vercel Blob
      try {
        await del(fileUrl, { token: BLOB_READ_WRITE_TOKEN });
      } catch (blobError: any) {
        console.error("Vercel Blob deletion failed:", blobError);
        // If file doesn't exist in blob anymore, we might still want to delete the record
        if (!blobError.message?.includes("404")) {
          return res.status(500).json({ error: "Failed to delete file from storage", details: blobError.message });
        }
      }

      // 5. Delete from Firestore
      await fileRef.delete();

      res.json({ success: true, message: "File deleted successfully from storage and database" });
    } catch (error: any) {
      console.error("Delete operation failed:", error);
      res.status(500).json({ error: "Internal server error during deletion", details: error.message });
    }
  });

  // Notification Token Registration
  app.post("/api/notifications/token", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing authorization header" });
    }

    try {
      const idToken = authHeader.split("Bearer ")[1];
      const decodedUser = await admin.auth().verifyIdToken(idToken);
      const { fcmToken } = req.body;

      if (!fcmToken) return res.status(400).json({ error: "Missing FCM Token" });

      const userRef = adminDb.collection("users").doc(decodedUser.uid);
      await userRef.update({
        fcmTokens: admin.firestore.FieldValue.arrayUnion(fcmToken)
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error registering FCM token:", error);
      res.status(500).json({ error: "Failed to register token" });
    }
  });

  // Payment confirmation endpoint (called by PayFast webhook)
  app.post("/api/payment/confirm", async (req, res) => {
    const { paymentId, pfData } = req.body;
    if (!paymentId || !pfData) {
      return res.status(400).json({ error: "Missing paymentId or pfData" });
    }

    try {
      const paymentRef = adminDb.collection("payments").doc(paymentId);
      const paymentDoc = await paymentRef.get();
      
      if (!paymentDoc.exists) {
        return res.status(404).json({ error: "Payment not found" });
      }

      const payment = paymentDoc.data();
      
      if (payment?.status === "completed") {
        return res.json({ success: true, message: "Payment already processed (idempotency)" });
      }
      
      const expectedAmount = (payment?.amount / 100).toFixed(2);
      if (pfData['amount_gross'] !== expectedAmount) {
        return res.status(400).json({ error: "Amount mismatch in confirmation" });
      }
      
      await paymentRef.update({
        status: "completed",
        transactionId: pfData['pf_payment_id'],
        processedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {
          ...(payment?.metadata || {}),
          payfastData: pfData
        }
      });
      
      if (payment?.jobId) {
        const escrowRef = adminDb.collection("escrow").doc(payment.jobId);
        await escrowRef.update({
          status: "funded",
          heldAmount: payment.amount,
          fundedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Payment confirmation error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PayFast ITN (Instant Transaction Notification) Handler
  app.post("/api/payment/notify", async (req, res) => {
    try {
      const pfData = req.body;

      // Validate required PayFast fields
      const requiredFields = [
        "m_payment_id",
        "pf_payment_id",
        "payment_status",
        "amount_gross",
        "amount_fee",
        "amount_net",
      ];

      for (const field of requiredFields) {
        if (!pfData[field]) {
          console.error(`Missing required PayFast field: ${field}`);
          return res.status(400).send("Bad Request");
        }
      }

      // Verify payment data signature
      const signature = pfData["signature"];
      delete pfData["signature"];

      // Build signature string (alphabetical order)
      const signatureData = Object.keys(pfData)
        .sort()
        .map((key) => `${key}=${encodeURIComponent(pfData[key]).replace(/%20/g, "+")}`)
        .join("&");

      // Calculate expected signature
      let signatureString = signatureData;
      if (PAYFAST_PASSPHRASE) {
        signatureString += `&passphrase=${encodeURIComponent(PAYFAST_PASSPHRASE).replace(/%20/g, "+")}`;
      }

      const expectedSignature = crypto
        .createHash("md5")
        .update(signatureString)
        .digest("hex");

      if (signature !== expectedSignature) {
        console.error("PayFast signature verification failed");
        return res.status(400).send("Invalid signature");
      }

      // Verify amounts match (prevent tampering)
      const expectedAmountResult = await adminDb.collection("payments").doc(pfData["m_payment_id"]).get();
      if (!expectedAmountResult.exists) {
        console.error("Payment record not found for webhook:", pfData["m_payment_id"]);
        return res.status(400).send("Payment not found");
      }
      const paymentData = expectedAmountResult.data();
      const expectedAmount = (paymentData?.amount / 100).toFixed(2);
      
      if (pfData["amount_gross"] !== expectedAmount) {
        console.error("PayFast amount mismatch. Expected:", expectedAmount, "Got:", pfData["amount_gross"]);
        return res.status(400).send("Amount mismatch");
      }

      const grossAmount = parseFloat(pfData["amount_gross"]);

      console.log("PayFast payment notification received:", {
        paymentId: pfData["m_payment_id"],
        pfPaymentId: pfData["pf_payment_id"],
        status: pfData["payment_status"],
        amount: grossAmount,
      });

      // Process payment based on status
      if (pfData["payment_status"] === "COMPLETE") {
        console.log("Payment completed successfully:", pfData["m_payment_id"]);

        // Call internal API to confirm payment
        try {
          const confirmResponse = await fetch(`http://localhost:${PORT}/api/payment/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paymentId: pfData["m_payment_id"],
              pfData: pfData,
            }),
          });

          if (!confirmResponse.ok) {
            console.error("Failed to confirm payment:", await confirmResponse.text());
          }
        } catch (confirmError) {
          console.error("Error confirming payment:", confirmError);
        }
      } else if (pfData["payment_status"] === "FAILED") {
        console.error("Payment failed:", pfData["m_payment_id"]);

        // Update payment status to failed
        // TODO: Implement via Firebase Admin SDK
      } else if (pfData["payment_status"] === "PENDING") {
        console.log("Payment pending:", pfData["m_payment_id"]);
      }

      // Return success to PayFast (must be exactly "OK")
      res.status(200).send("OK");
    } catch (error) {
      console.error("PayFast notification error:", error);
      res.status(500).send("Error");
    }
  });

  // Payment return URLs
  app.get("/api/payment/success", (req, res) => {
    // Redirect to frontend success page
    res.redirect("/dashboard?payment=success");
  });

  app.get("/api/payment/cancel", (req, res) => {
    // Redirect to frontend cancel page
    res.redirect("/dashboard?payment=cancel");
  });

  // --- Notification Worker ---
  async function startNotificationWorker() {
    console.log("Starting background notification worker...");
    adminDb.collection("notifications")
      .where("deliveryStatus", "==", "pending")
      .onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === "added") {
            const notification = change.doc.data();
            const notificationId = change.doc.id;
            
            try {
              // Mark as processing
              await change.doc.ref.update({ deliveryStatus: "processing" });
              
              const channels = notification.channels || [];
              let emailDelivered = false;
              let pushDelivered = false;
              
              if (channels.includes('email')) {
                console.log(`[Notification Worker] 📧 Simulated EMAIL delivery for ${notification.type} to user ${notification.userId}`);
                emailDelivered = true;
              }
              
              if (channels.includes('push')) {
                const userDoc = await adminDb.collection('users').doc(notification.userId).get();
                const fcmTokens = userDoc.data()?.fcmTokens || [];
                
                if (fcmTokens.length > 0) {
                  console.log(`[Notification Worker] 📱 Simulated PUSH delivery to ${fcmTokens.length} devices.`);
                  pushDelivered = true;
                } else {
                  console.log(`[Notification Worker] User has no active Push devices.`);
                }
              }
              
              await change.doc.ref.update({
                deliveryStatus: "delivered",
                deliveredAt: new Date().toISOString(),
                emailDelivered,
                pushDelivered
              });
              
            } catch (err: any) {
              console.error(`[Notification Worker] Failed to deliver notification ${notificationId}:`, err);
              const retryCount = (notification.retryCount || 0) + 1;
              await change.doc.ref.update({
                deliveryStatus: retryCount >= 3 ? "failed" : "pending",
                lastError: err.message,
                retryCount
              });
            }
          }
        });
      }, (error) => {
        console.error("Notification worker snapshot listener error:", error);
      });
  }
  
  // Start the background worker
  startNotificationWorker();

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
