import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import apiRouter from "./src/lib/api-router.js";
import { adminDb, testFirebase } from "./src/lib/firebase-admin.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

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

  // Mount the shared API router
  app.use("/api", apiRouter);

  // --- Local Development Notification Worker ---
  // In Vercel, this is handled by api/notifications/worker.ts as a cron job.
  // We keep it here for real-time local testing.
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
  
  if (process.env.NODE_ENV !== "production") {
    startNotificationWorker();
  }

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
    app.get(/.*/, (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Firebase test endpoint
  app.get("/firebase/test", async (_req, res) => {
    try {
      const result = await testFirebase();
      res.json(result);
    } catch (error) {
      res.status(500).json({ 
        status: "error", 
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});