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

  // Gemini API Proxy - Server-side only (protects API key)
  app.post("/api/gemini/review", async (req, res) => {
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
