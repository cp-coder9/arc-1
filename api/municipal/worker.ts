/**
 * Vercel Cron Job: Municipal Scraper Worker
 *
 * Runs daily to check for municipal updates for users with stored credentials.
 */
import { adminDb } from "../../src/lib/firebase-admin.js";
import { runMunicipalScraper } from "../../src/services/scraperService.js";
import { MunicipalityType } from "../../src/types.js";
import type { Request, Response } from "express";

export default async function handler(_req: Request, res: Response) {
  // Basic cron secret check
  const authHeader = _req.headers.authorization;
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    console.log("[Scraper Worker] Checking for daily municipal updates...");

    // In a real implementation, we would query users with credentials
    const snapshot = await adminDb.collection("municipal_credentials").get();

    let processed = 0;
    for (const doc of snapshot.docs) {
      const creds = doc.data();
      await runMunicipalScraper(creds.userId, creds.municipality as MunicipalityType);
      processed++;
    }

    return res.json({
      processed,
      message: `Processed ${processed} municipal credential syncs`
    });
  } catch (error: any) {
    console.error("[Scraper Worker] Fatal error:", error);
    return res.status(500).json({ error: error.message });
  }
}
