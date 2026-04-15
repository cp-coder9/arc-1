import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const PAYFAST_MERCHANT_ID = process.env.VITE_PAYFAST_MERCHANT_ID || "";
const PAYFAST_MERCHANT_KEY = process.env.VITE_PAYFAST_MERCHANT_KEY || "";
const PAYFAST_PASSPHRASE = process.env.VITE_PAYFAST_PASSPHRASE || "";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

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

  // Generic LLM Proxy endpoint
  app.post("/api/review", async (req, res) => {
    const { config, systemInstruction, prompt } = req.body;

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
  const { systemInstruction, prompt } = req.body;

// Check if Gemini API key is configured
    if (!GEMINI_API_KEY || GEMINI_API_KEY === '') {
      console.warn("GEMINI_API_KEY not configured - returning mock response for testing");
      
      // Return mock AI response for testing
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                status: 'failed',
                feedback: 'AI Review (Mock Mode): Drawing has compliance issues.',
                categories: [
                  {
                    name: 'Wall Compliance (SANS 10400-K)',
                    issues: [{
                      description: 'External wall thickness is less than 230mm',
                      severity: 'high',
                      actionItem: 'Increase external wall thickness to minimum 230mm per SANS 10400-K'
                    }]
                  },
                  {
                    name: 'Fenestration (SANS 10400-N)',
                    issues: [{
                      description: 'Natural ventilation may be insufficient',
                      severity: 'medium',
                      actionItem: 'Verify 5% of floor area is openable window/door area'
                    }]
                  }
                ],
                traceLog: 'Orchestrator initialized. Wall Compliance Agent checked wall thickness. Fenestration Agent checked ventilation. Fire Safety Agent checked escape routes. Area Sizing Agent checked room dimensions. General Compliance Agent checked title blocks. SANS Specialist cross-referenced regulations. Review complete.'
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
    // Build request body according to Gemini API specification
    const requestBody: any = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
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
      const grossAmount = parseFloat(pfData["amount_gross"]);
      // TODO: Fetch expected amount from Firestore and verify

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
      // In production, use Firebase Admin SDK directly
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
