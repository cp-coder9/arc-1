import express from "express";
import rateLimit from "express-rate-limit";
import cors from "cors";
import crypto from "crypto";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { del } from "@vercel/blob";
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
const BLOB_READ_WRITE_TOKEN = process.env.VITE_BLOB_READ_WRITE_TOKEN || "";

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

// ── Gemini proxy ──────────────────────────────────────────────────────────────
app.post("/api/gemini/review", async (req, res) => {
  const { systemInstruction, prompt, drawingUrl, config } = req.body;
  const dbConfig = await getAdminLLMConfig();

  const activeApiKey = config?.apiKey || dbConfig?.apiKey || GEMINI_API_KEY;
  const activeModel = config?.model || dbConfig?.model || "gemini-2.0-flash";

  if (!activeApiKey) {
    // Return mock response when no key is set
    return res.json({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  status: "failed",
                  feedback:
                    "AI Review (MOCK): No API key configured. Add GEMINI_API_KEY in Vercel environment variables.",
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

  try {
    const parts: any[] = [{ text: prompt }];

    if (drawingUrl) {
      try {
        const imageResp = await fetch(drawingUrl);
        if (imageResp.ok) {
          const base64Data = Buffer.from(await imageResp.arrayBuffer()).toString(
            "base64"
          );
          let mimeType = imageResp.headers.get("content-type") || "image/jpeg";
          if (drawingUrl.toLowerCase().endsWith(".pdf"))
            mimeType = "application/pdf";
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
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer "))
    return res.status(401).json({ error: "Missing or invalid authorization header" });

  if (!query) return res.status(400).json({ error: "Search query is required" });

  try {
    await admin.auth().verifyIdToken(authHeader.split("Bearer ")[1]);

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

// ── File delete ───────────────────────────────────────────────────────────────
app.post("/api/files/delete", async (req, res) => {
  const { fileId, fileUrl } = req.body;
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer "))
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  if (!fileId || !fileUrl)
    return res.status(400).json({ error: "Missing fileId or fileUrl" });

  try {
    const decodedToken = await admin
      .auth()
      .verifyIdToken(authHeader.split("Bearer ")[1]);
    const uid = decodedToken.uid;

    const fileRef = adminDb.collection("uploaded_files").doc(fileId);
    const fileDoc = await fileRef.get();

    if (!fileDoc.exists)
      return res.status(404).json({ error: "File record not found in database" });

    const fileData = fileDoc.data();
    let isAuthorized = fileData?.uploadedBy === uid;

    if (!isAuthorized) {
      const userDoc = await adminDb.collection("users").doc(uid).get();
      if (userDoc.data()?.role === "admin") isAuthorized = true;
    }

    if (!isAuthorized)
      return res
        .status(403)
        .json({ error: "You don't have permission to delete this file" });

    try {
      await del(fileUrl, { token: BLOB_READ_WRITE_TOKEN });
    } catch (blobError: any) {
      if (!blobError.message?.includes("404"))
        return res
          .status(500)
          .json({ error: "Failed to delete file from storage", details: blobError.message });
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
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer "))
    return res.status(401).json({ error: "Missing authorization header" });

  try {
    const decodedUser = await admin
      .auth()
      .verifyIdToken(authHeader.split("Bearer ")[1]);
    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(400).json({ error: "Missing FCM Token" });

    await adminDb
      .collection("users")
      .doc(decodedUser.uid)
      .update({ fcmTokens: admin.firestore.FieldValue.arrayUnion(fcmToken) });

    res.json({ success: true });
  } catch (error) {
    console.error("Error registering FCM token:", error);
    res.status(500).json({ error: "Failed to register token" });
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

    const payment = paymentDoc.data();

    if (payment?.status === "completed")
      return res.json({ success: true, message: "Payment already processed" });

    const expectedAmount = (payment?.amount / 100).toFixed(2);
    if (pfData["amount_gross"] !== expectedAmount)
      return res.status(400).json({ error: "Amount mismatch in confirmation" });

    await paymentRef.update({
      status: "completed",
      transactionId: pfData["pf_payment_id"],
      processedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { ...(payment?.metadata || {}), payfastData: pfData },
    });

    if (payment?.jobId) {
      await adminDb
        .collection("escrow")
        .doc(payment.jobId)
        .update({
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
      "m_payment_id",
      "pf_payment_id",
      "payment_status",
      "amount_gross",
      "amount_fee",
      "amount_net",
    ];
    for (const field of requiredFields) {
      if (!pfData[field]) {
        console.error(`Missing PayFast field: ${field}`);
        return res.status(400).send("Bad Request");
      }
    }

    const signature = pfData["signature"];
    delete pfData["signature"];

    const signatureData = Object.keys(pfData)
      .sort()
      .map(
        (key) =>
          `${key}=${encodeURIComponent(pfData[key]).replace(/%20/g, "+")}`
      )
      .join("&");

    let signatureString = signatureData;
    if (PAYFAST_PASSPHRASE)
      signatureString += `&passphrase=${encodeURIComponent(
        PAYFAST_PASSPHRASE
      ).replace(/%20/g, "+")}`;

    const expectedSignature = crypto
      .createHash("md5")
      .update(signatureString)
      .digest("hex");

    if (signature !== expectedSignature) {
      console.error("PayFast signature verification failed");
      return res.status(400).send("Invalid signature");
    }

    const paymentSnap = await adminDb
      .collection("payments")
      .doc(pfData["m_payment_id"])
      .get();

    if (!paymentSnap.exists)
      return res.status(400).send("Payment not found");

    const paymentData = paymentSnap.data();
    const expectedAmount = (paymentData?.amount / 100).toFixed(2);

    if (pfData["amount_gross"] !== expectedAmount)
      return res.status(400).send("Amount mismatch");

    if (pfData["payment_status"] === "COMPLETE") {
      await adminDb
        .collection("payments")
        .doc(pfData["m_payment_id"])
        .update({
          status: "completed",
          transactionId: pfData["pf_payment_id"],
          processedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          metadata: {
            ...(paymentData?.metadata || {}),
            payfastData: pfData,
          },
        });

      if (paymentData?.jobId) {
        await adminDb
          .collection("escrow")
          .doc(paymentData.jobId)
          .update({
            status: "funded",
            heldAmount: paymentData.amount,
            fundedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
      }
    } else if (pfData["payment_status"] === "FAILED") {
      await adminDb
        .collection("payments")
        .doc(pfData["m_payment_id"])
        .update({ status: "failed", updatedAt: new Date().toISOString() });
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
