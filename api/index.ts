import express from "express";
import rateLimit from "express-rate-limit";
import cors from "cors";
import crypto from "crypto";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { del, put } from "@vercel/blob";
import multer from "multer";
import firebaseConfig from "../firebase-applet-config.json" assert { type: "json" };

// ── Firebase Admin initialisation ─────────────────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({ projectId: firebaseConfig.projectId });
}

const adminDb =
  firebaseConfig.firestoreDatabaseId &&
  firebaseConfig.firestoreDatabaseId !== "(default)"
    ? getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId)
    : getFirestore(admin.app());

// ── Environment variables ─────────────────────────────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const PAYFAST_PASSPHRASE = process.env.VITE_PAYFAST_PASSPHRASE || "";
const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || process.env.VITE_BLOB_READ_WRITE_TOKEN || "";
const PLATFORM_FEE_PERCENTAGE = 0.05;

// ── Allowed Blob hostnames for drawingUrl validation ──────────────────────────
const ALLOWED_BLOB_HOSTS = [
  "public.blob.vercel-storage.com",
];

function isAllowedBlobUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_BLOB_HOSTS.some(host => parsed.hostname.endsWith(host));
  } catch {
    return false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getAdminLLMConfig() {
  try {
    const doc = await adminDb
      .collection("system_settings")
      .doc("llm_config")
      .get();
    if (doc.exists) return doc.data();
  } catch (error) {
    console.error("Error fetching LLM config:", error);
  }
  return null;
}

async function verifyAuth(authHeader: string | undefined): Promise<admin.auth.DecodedIdToken> {
  if (!authHeader?.startsWith("Bearer ")) {
    throw Object.assign(new Error("Missing or invalid authorization header"), { status: 401 });
  }
  return admin.auth().verifyIdToken(authHeader.split("Bearer ")[1]);
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
  "application/octet-stream", // DWG
  "image/webp",
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

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: [
      "https://architex.co.za",
      "https://architex-marketplace.vercel.app",
      /\.vercel\.app$/,
    ],
    credentials: true,
  })
);

// Rate limiters
const reviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many review requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Too many requests, please slow down" },
});

app.use("/api/review", reviewLimiter);
app.use("/api/gemini", reviewLimiter);
app.use("/api/", apiLimiter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── OpenAI-compatible LLM proxy ───────────────────────────────────────────────
app.post("/api/review", async (req, res) => {
  const { systemInstruction, prompt } = req.body;
  const config = await getAdminLLMConfig();

  if (!config)
    return res.status(400).json({
      error:
        "LLM configuration not found. Please configure a provider in Admin Dashboard › Settings.",
    });

  if (config.provider === "gemini")
    return res.status(400).json({
      error: "Current provider is Gemini — use /api/gemini/review instead.",
    });

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

    if (!response.ok) return res.status(response.status).json(await response.json());
    res.json(await response.json());
  } catch (error) {
    console.error("LLM Proxy Error:", error);
    res.status(500).json({ error: "Failed to fetch from LLM provider" });
  }
});

// ── Gemini proxy (authenticated + URL-validated) ──────────────────────────────
app.post("/api/gemini/review", async (req, res) => {
  // 1. Verify Firebase ID token
  try {
    await verifyAuth(req.headers.authorization);
  } catch (err: any) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const { systemInstruction, prompt, drawingUrl, config } = req.body;
  const dbConfig = await getAdminLLMConfig();

  const activeApiKey = config?.apiKey || dbConfig?.apiKey || GEMINI_API_KEY;
  const activeModel = config?.model || dbConfig?.model || "gemini-2.0-flash";

  if (!activeApiKey) {
    return res.json({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  status: "failed",
                  feedback:
                    "AI Review (MOCK): No API key configured. Add GEMINI_API_KEY in environment variables.",
                  categories: [],
                  traceLog: "MOCK MODE: Missing API Key.",
                }),
              },
            ],
          },
          finishReason: "STOP",
        },
      ],
    });
  }

  if (!prompt) return res.status(400).json({ error: "Prompt is required" });

  // 2. Validate drawingUrl — only allow Vercel Blob URLs
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
          // Enforce max 10 MB download
          const contentLength = Number(imageResp.headers.get("content-length") || "0");
          if (contentLength > 10 * 1024 * 1024) {
            return res.status(400).json({ error: "Drawing file exceeds 10 MB limit" });
          }
          const buffer = await imageResp.arrayBuffer();
          if (buffer.byteLength > 10 * 1024 * 1024) {
            return res.status(400).json({ error: "Drawing file exceeds 10 MB limit" });
          }
          const base64Data = Buffer.from(buffer).toString("base64");
          let mimeType = imageResp.headers.get("content-type") || "image/jpeg";
          if (drawingUrl.toLowerCase().endsWith(".pdf")) mimeType = "application/pdf";
          parts.push({ inlineData: { mimeType, data: base64Data } });
        }
      } catch (fetchError) {
        console.error("Error fetching drawing:", fetchError);
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
      console.error("Gemini API error:", errorData);
      return res
        .status(response.status)
        .json({ error: "Gemini API request failed", details: errorData });
    }

    res.json(await response.json());
  } catch (error) {
    console.error("Gemini Proxy Error:", error);
    res.status(500).json({ error: "Failed to fetch from Gemini API" });
  }
});

// ── Agent web search ──────────────────────────────────────────────────────────
app.post("/api/agent/search", async (req, res) => {
  const { query, agentRole } = req.body;

  try {
    const decoded = await verifyAuth(req.headers.authorization);
    void decoded; // auth verified
  } catch (err: any) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  if (!query) return res.status(400).json({ error: "Search query is required" });

  try {
    const dbConfig = await getAdminLLMConfig();
    const activeApiKey = dbConfig?.apiKey || GEMINI_API_KEY;

    if (!activeApiKey)
      return res.status(400).json({ error: "Gemini API key not configured for search" });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${activeApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: `Research the following query related to ${agentRole}: ${query}` },
              ],
            },
          ],
          tools: [{ googleSearchRetrieval: {} }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
        }),
      }
    );

    if (!response.ok) return res.status(response.status).json(await response.json());

    const data = await response.json();
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      res.json({ text: data.candidates[0].content.parts[0].text });
    } else {
      res.json(data);
    }
  } catch (error) {
    console.error("Agent Search Error:", error);
    res.status(500).json({ error: "Internal server error during agent search" });
  }
});

// ── File upload (server-side Blob, auth-gated) ────────────────────────────────
app.post("/api/files/upload", upload.single("file"), async (req, res) => {
  const authHeader = req.headers.authorization;
  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await verifyAuth(authHeader);
  } catch (err: any) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  if (!req.file) {
    return res.status(400).json({ error: "No file provided" });
  }

  const { context, jobId, submissionId } = req.body;
  if (!context) {
    return res.status(400).json({ error: "context field is required" });
  }

  try {
    const fileName = req.file.originalname || `upload-${Date.now()}`;
    const blob = await put(fileName, req.file.buffer, {
      access: "public",
      token: BLOB_READ_WRITE_TOKEN,
      contentType: req.file.mimetype,
    });

    // Track in Firestore using Admin SDK
    const fileRef = await adminDb.collection("uploaded_files").add({
      url: blob.url,
      fileName,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      uploadedBy: decoded.uid,
      context,
      jobId: jobId || null,
      submissionId: submissionId || null,
      uploadedAt: new Date().toISOString(),
    });

    res.json({ url: blob.url, fileId: fileRef.id });
  } catch (err: any) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed", details: err.message });
  }
});

// ── File delete ───────────────────────────────────────────────────────────────
app.post("/api/files/delete", async (req, res) => {
  const { fileId, fileUrl } = req.body;

  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await verifyAuth(req.headers.authorization);
  } catch (err: any) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  if (!fileId || !fileUrl)
    return res.status(400).json({ error: "Missing fileId or fileUrl" });

  try {
    const uid = decoded.uid;
    const fileRef = adminDb.collection("uploaded_files").doc(fileId);
    const fileDoc = await fileRef.get();

    if (!fileDoc.exists)
      return res.status(404).json({ error: "File record not found in database" });

    const fileData = fileDoc.data();
    let authorized = fileData?.uploadedBy === uid;

    if (!authorized && (await isAdmin(uid))) authorized = true;

    if (!authorized)
      return res.status(403).json({ error: "You don't have permission to delete this file" });

    try {
      await del(fileUrl, { token: BLOB_READ_WRITE_TOKEN });
    } catch (blobError: any) {
      if (!blobError.message?.includes("404"))
        return res.status(500).json({ error: "Failed to delete file from storage", details: blobError.message });
    }

    await fileRef.delete();
    res.json({ success: true, message: "File deleted successfully" });
  } catch (error: any) {
    console.error("Delete operation failed:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

// ── Notification token registration ──────────────────────────────────────────
app.post("/api/notifications/token", async (req, res) => {
  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await verifyAuth(req.headers.authorization);
  } catch (err: any) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  try {
    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(400).json({ error: "Missing FCM Token" });

    await adminDb
      .collection("users")
      .doc(decoded.uid)
      .update({ fcmTokens: admin.firestore.FieldValue.arrayUnion(fcmToken) });

    res.json({ success: true });
  } catch (error) {
    console.error("Error registering FCM token:", error);
    res.status(500).json({ error: "Failed to register token" });
  }
});

// ── Payment – initialize escrow (client-side can't write to admin-only collections) ──
app.post("/api/payment/initialize-escrow", async (req, res) => {
  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await verifyAuth(req.headers.authorization);
  } catch (err: any) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const { jobId } = req.body;
  if (!jobId) return res.status(400).json({ error: "jobId is required" });

  try {
    const jobDoc = await adminDb.collection("jobs").doc(jobId).get();
    if (!jobDoc.exists) return res.status(404).json({ error: "Job not found" });

    const job = jobDoc.data()!;
    if (job.clientId !== decoded.uid) {
      return res.status(403).json({ error: "Only the job client can initialize escrow" });
    }

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

    const escrowData: Record<string, any> = {
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
    };

    await adminDb.collection("escrow").doc(jobId).set(escrowData, { merge: true });

    // Build PayFast URL (server-side)
    const PAYFAST_MERCHANT_ID = process.env.VITE_PAYFAST_MERCHANT_ID || "";
    const PAYFAST_MERCHANT_KEY = process.env.VITE_PAYFAST_MERCHANT_KEY || "";
    const PAYFAST_SANDBOX = process.env.VITE_PAYFAST_SANDBOX === "true";
    const baseUrl = process.env.APP_BASE_URL || "https://architex.co.za";
    const pfUrl = PAYFAST_SANDBOX
      ? "https://sandbox.payfast.co.za/eng/process"
      : "https://www.payfast.co.za/eng/process";

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

    // Remove empty values
    Object.keys(data).forEach(k => { if (!data[k]) delete data[k]; });

    // Generate MD5 signature
    const sorted = Object.keys(data).sort();
    let paramStr = sorted.map(k => `${k}=${encodeURIComponent(data[k]).replace(/%20/g, "+")}`).join("&");
    if (PAYFAST_PASSPHRASE) paramStr += `&passphrase=${encodeURIComponent(PAYFAST_PASSPHRASE).replace(/%20/g, "+")}`;
    const signature = crypto.createHash("md5").update(paramStr).digest("hex");

    const params = new URLSearchParams({ ...data, signature }).toString();
    const paymentUrl = `${pfUrl}?${params}`;

    res.json({ paymentUrl, paymentId: paymentRef.id });
  } catch (err: any) {
    console.error("Initialize escrow error:", err);
    res.status(500).json({ error: "Internal server error", details: err.message });
  }
});

// ── Payment – release milestone ───────────────────────────────────────────────
app.post("/api/payment/release-milestone", async (req, res) => {
  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await verifyAuth(req.headers.authorization);
  } catch (err: any) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const { jobId, milestone } = req.body;
  if (!jobId || !milestone) return res.status(400).json({ error: "jobId and milestone are required" });
  if (!["initial", "draft", "final"].includes(milestone)) {
    return res.status(400).json({ error: "Invalid milestone value" });
  }

  try {
    const jobDoc = await adminDb.collection("jobs").doc(jobId).get();
    if (!jobDoc.exists) return res.status(404).json({ error: "Job not found" });
    const job = jobDoc.data()!;

    if (job.clientId !== decoded.uid) {
      return res.status(403).json({ error: "Only the job client can release milestone payments" });
    }

    const escrowRef = adminDb.collection("escrow").doc(jobId);
    const escrowDoc = await escrowRef.get();
    if (!escrowDoc.exists) return res.status(404).json({ error: "Escrow not found" });
    const escrow = escrowDoc.data()!;

    if (escrow.status !== "funded" && escrow.status !== "partially_released") {
      return res.status(400).json({ error: "Escrow is not funded" });
    }
    if (escrow.milestones?.[milestone]?.released) {
      return res.status(400).json({ error: "Milestone already released" });
    }

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

// ── Payment – request milestone release (architect) ───────────────────────────
app.post("/api/payment/request-milestone", async (req, res) => {
  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await verifyAuth(req.headers.authorization);
  } catch (err: any) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const { jobId, milestone } = req.body;
  if (!jobId || !milestone) return res.status(400).json({ error: "jobId and milestone are required" });

  try {
    const jobDoc = await adminDb.collection("jobs").doc(jobId).get();
    if (!jobDoc.exists) return res.status(404).json({ error: "Job not found" });
    const job = jobDoc.data()!;

    if (job.selectedArchitectId !== decoded.uid) {
      return res.status(403).json({ error: "Only the assigned architect can request payment release" });
    }

    const escrowRef = adminDb.collection("escrow").doc(jobId);
    const escrowDoc = await escrowRef.get();
    if (!escrowDoc.exists) return res.status(404).json({ error: "Escrow not found" });
    const escrow = escrowDoc.data()!;

    if (escrow.milestones?.[milestone]?.released) {
      return res.status(400).json({ error: "Milestone already released" });
    }
    if (escrow.milestones?.[milestone]?.status === "requested") {
      return res.status(400).json({ error: "Release already requested" });
    }

    await escrowRef.update({
      [`milestones.${milestone}.status`]: "requested",
      [`milestones.${milestone}.requestedAt`]: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error("Request milestone error:", err);
    res.status(500).json({ error: "Internal server error", details: err.message });
  }
});

// ── Payment – refund ──────────────────────────────────────────────────────────
app.post("/api/payment/refund", async (req, res) => {
  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await verifyAuth(req.headers.authorization);
  } catch (err: any) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const { jobId, amount, reason } = req.body;
  if (!jobId || !amount || !reason) return res.status(400).json({ error: "jobId, amount, and reason are required" });

  try {
    const jobDoc = await adminDb.collection("jobs").doc(jobId).get();
    if (!jobDoc.exists) return res.status(404).json({ error: "Job not found" });
    const job = jobDoc.data()!;

    if (job.clientId !== decoded.uid) {
      return res.status(403).json({ error: "Only the job client can request a refund" });
    }

    const escrowRef = adminDb.collection("escrow").doc(jobId);
    const escrowDoc = await escrowRef.get();
    if (!escrowDoc.exists) return res.status(404).json({ error: "Escrow not found" });
    const escrow = escrowDoc.data()!;

    if (amount > escrow.heldAmount) {
      return res.status(400).json({ error: "Refund amount exceeds available funds" });
    }

    const platformFee = Math.round(amount * PLATFORM_FEE_PERCENTAGE);
    const refundAmount = amount - platformFee;

    const batch = adminDb.batch();

    batch.update(escrowRef, {
      heldAmount: escrow.heldAmount - amount,
      refundedAmount: (escrow.refundedAmount || 0) + refundAmount,
      status: escrow.heldAmount - amount <= 0 ? "refunded" : "partially_refunded",
      updatedAt: new Date().toISOString(),
    });

    const paymentRef = adminDb.collection("payments").doc();
    batch.set(paymentRef, {
      jobId,
      payerId: job.clientId,
      payeeId: job.selectedArchitectId || "",
      amount: refundAmount,
      type: "refund",
      status: "completed",
      metadata: { reason, platformFee },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await batch.commit();
    res.json({ success: true, refundAmount });
  } catch (err: any) {
    console.error("Refund error:", err);
    res.status(500).json({ error: "Internal server error", details: err.message });
  }
});

// ── Payment – confirm ─────────────────────────────────────────────────────────
app.post("/api/payment/confirm", async (req, res) => {
  const { paymentId, pfData } = req.body;
  if (!paymentId || !pfData)
    return res.status(400).json({ error: "Missing paymentId or pfData" });

  try {
    const paymentRef = adminDb.collection("payments").doc(paymentId);
    const paymentDoc = await paymentRef.get();

    if (!paymentDoc.exists)
      return res.status(404).json({ error: "Payment not found" });

    const payment = paymentDoc.data()!;

    // Idempotency: already processed
    if (payment.status === "completed")
      return res.json({ success: true, message: "Payment already processed" });

    const expectedAmount = (payment.amount / 100).toFixed(2);
    if (pfData["amount_gross"] !== expectedAmount)
      return res.status(400).json({ error: "Amount mismatch in confirmation" });

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

// ── Payment – PayFast ITN webhook ─────────────────────────────────────────────
app.post("/api/payment/notify", async (req, res) => {
  try {
    const pfData = { ...req.body };

    const requiredFields = [
      "m_payment_id", "pf_payment_id", "payment_status",
      "amount_gross", "amount_fee", "amount_net",
    ];
    for (const field of requiredFields) {
      if (!pfData[field]) {
        console.error(`Missing PayFast field: ${field}`);
        return res.status(400).send("Bad Request");
      }
    }

    // Verify signature
    const signature = pfData["signature"];
    delete pfData["signature"];

    const signatureData = Object.keys(pfData)
      .sort()
      .map(key => `${key}=${encodeURIComponent(pfData[key]).replace(/%20/g, "+")}`)
      .join("&");

    let signatureString = signatureData;
    if (PAYFAST_PASSPHRASE)
      signatureString += `&passphrase=${encodeURIComponent(PAYFAST_PASSPHRASE).replace(/%20/g, "+")}`;

    const expectedSignature = crypto.createHash("md5").update(signatureString).digest("hex");

    if (signature !== expectedSignature) {
      console.error("PayFast signature verification failed");
      return res.status(400).send("Invalid signature");
    }

    // Look up payment record to validate expected amount
    const paymentSnap = await adminDb.collection("payments").doc(pfData["m_payment_id"]).get();
    if (!paymentSnap.exists) return res.status(400).send("Payment not found");

    const paymentData = paymentSnap.data()!;
    const expectedAmount = (paymentData.amount / 100).toFixed(2);
    if (pfData["amount_gross"] !== expectedAmount) {
      console.error("PayFast amount mismatch. Expected:", expectedAmount, "Got:", pfData["amount_gross"]);
      return res.status(400).send("Amount mismatch");
    }

    // Process inline using Admin SDK (no internal HTTP call — serverless safe)
    if (pfData["payment_status"] === "COMPLETE") {
      // Idempotency check
      if (paymentData.status !== "completed") {
        await paymentSnap.ref.update({
          status: "completed",
          transactionId: pfData["pf_payment_id"],
          processedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          metadata: { ...(paymentData.metadata || {}), payfastData: pfData },
        });

        if (paymentData.jobId) {
          await adminDb.collection("escrow").doc(paymentData.jobId).update({
            status: "funded",
            heldAmount: paymentData.amount,
            fundedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }
    } else if (pfData["payment_status"] === "FAILED") {
      await paymentSnap.ref.update({
        status: "failed",
        updatedAt: new Date().toISOString(),
        metadata: { ...(paymentData.metadata || {}), payfastData: pfData },
      });
    } else if (pfData["payment_status"] === "PENDING") {
      console.log("PayFast payment pending:", pfData["m_payment_id"]);
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("PayFast notification error:", error);
    res.status(500).send("Error");
  }
});

// ── Payment return redirects ───────────────────────────────────────────────────
app.get("/api/payment/success", (_req, res) =>
  res.redirect("/dashboard?payment=success")
);
app.get("/api/payment/cancel", (_req, res) =>
  res.redirect("/dashboard?payment=cancel")
);

// ── Export for Vercel ─────────────────────────────────────────────────────────
export default app;
