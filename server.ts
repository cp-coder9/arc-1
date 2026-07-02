import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

const mode = process.env.NODE_ENV || "development";
dotenv.config({
  path: [`.env.${mode}.local`, ".env.local", `.env.${mode}`, ".env"],
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readBuildInfo() {
  const candidates = [
    resolve(process.cwd(), "dist", "build-info.json"),
    resolve(process.cwd(), "public", "build-info.json"),
  ];

  for (const candidate of candidates) {
    try {
      return JSON.parse(readFileSync(candidate, "utf8"));
    } catch {
      // Try the next build-info location.
    }
  }

  return {
    name: "architex",
    version: "unknown",
    commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || process.env.COMMIT_SHA || "unknown",
    shortCommit: (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || process.env.COMMIT_SHA || "unknown").slice(0, 12),
    branch: process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_REF_NAME || process.env.BRANCH_NAME || "unknown",
    builtAt: "unknown",
    node: process.version,
  };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const BODY_LIMIT = "50mb";

  // File uploads are transported as base64 JSON to /api/files/upload.
  // Keep the local Express dev server aligned with api/index.ts so uploads
  // that work in production do not fail locally with Express's default 100 KB
  // "Payload Too Large" limit.
  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

  // Apply CORS
  app.use(cors({
    origin: process.env.NODE_ENV === 'production'
      ? ['https://architex.co.za']
      : ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true
  }));

  // Console logging for requests and COOP headers for Firebase Auth
  app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

    if (req.path.startsWith('/api')) {
      console.log(`[API] ${req.method} ${req.path}`);
    }
    next();
  });

  app.get("/api/version", (_req, res) => {
    res.json({ status: "ok", ...readBuildInfo(), servedAt: new Date().toISOString() });
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.post("/api/auth/check-admin", (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing authorization header" });
    }
    return next();
  });

  // Mount marketplace API router
  app.use("/api/marketplace", async (req, res, next) => {
    try {
      const { default: marketplaceRouter } = await import("./src/lib/marketplace-api-router.js");
      return marketplaceRouter(req, res, next);
    } catch (error) {
      console.error("Failed to load Marketplace API router:", error);
      return res.status(500).json({
        error: "Marketplace API router failed to initialize",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Mount SpecForge API router
  app.use("/api/specforge", async (req, res, next) => {
    try {
      const { default: specforgeRouter } = await import("./src/lib/specforge-api-router.js");
      return specforgeRouter(req, res, next);
    } catch (error) {
      console.error("Failed to load SpecForge API router:", error);
      return res.status(500).json({
        error: "SpecForge API router failed to initialize",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Mount the shared API router lazily. Firebase Admin / Firestore can add a
  // noticeable cold-start cost locally, so the server should become healthy
  // before those integrations are imported.
  app.use("/api", async (req, res, next) => {
    try {
      const { default: apiRouter } = await import("./src/lib/api-router.js");
      return apiRouter(req, res, next);
    } catch (error) {
      console.error("Failed to load API router:", error);
      return res.status(500).json({
        error: "API router failed to initialize",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.use("/api", (req, res) => {
    res.status(404).json({ error: "API route not found", path: req.originalUrl });
  });

  // --- Local Development Notification Worker ---
  // In Vercel, this is handled by api/notifications/worker.ts as a cron job.
  // We keep it here for real-time local testing.
  async function startNotificationWorker() {
    const { adminDb } = await import("./src/lib/firebase-admin.js");
    console.log("Starting background notification worker...");
    adminDb.collection("notifications")
      .where("deliveryStatus", "==", "pending")
      .onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === "added") {
            const notification = change.doc.data();
            const notificationId = change.doc.id;
            try {
              await change.doc.ref.update({ deliveryStatus: "processing" });
              console.log(`[Notification Worker] 📧 Simulated delivery for ${notification.type} to user ${notification.userId}`);
              await change.doc.ref.update({
                deliveryStatus: "delivered",
                deliveredAt: new Date().toISOString(),
                emailDelivered: true,
                pushDelivered: true
              });
            } catch (err: any) {
              console.error(`[Notification Worker] Failed: ${notificationId}`, err);
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
        console.error("Notification worker error:", error);
      });
  }
  
  const shouldStartNotificationWorker = process.env.NODE_ENV !== "production" && process.env.DISABLE_NOTIFICATION_WORKER !== "true";

  // Firebase test endpoint
  app.get("/firebase/test", async (_req, res) => {
    try {
      const { testFirebase } = await import("./src/lib/firebase-admin.js");
      const result = await testFirebase();
      res.json(result);
    } catch (error) {
      res.status(500).json({ 
        status: "error", 
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get(/.*/, (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    if (shouldStartNotificationWorker) {
      startNotificationWorker().catch((error) => {
        console.warn("Notification worker disabled:", error instanceof Error ? error.message : String(error));
      });
    }
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
