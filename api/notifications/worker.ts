/**
 * Vercel Cron Job: Notification Worker
 *
 * Runs every minute to process pending notifications from Firestore.
 * Configured in vercel.json under "crons".
 *
 * This replaces the long-lived onSnapshot listener from server.ts,
 * which cannot run in a serverless environment.
 */
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import type { Request, Response } from "express";
import firebaseConfig from "../firebase-applet-config.json" assert { type: "json" };

if (!admin.apps.length) {
  admin.initializeApp({ projectId: firebaseConfig.projectId });
}

const adminDb =
  firebaseConfig.firestoreDatabaseId &&
  firebaseConfig.firestoreDatabaseId !== "(default)"
    ? getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId)
    : getFirestore(admin.app());

export default async function handler(_req: Request, res: Response) {
  // Basic cron secret check to prevent unauthorized invocations
  const authHeader = _req.headers.authorization;
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const snapshot = await adminDb
      .collection("notifications")
      .where("deliveryStatus", "==", "pending")
      .limit(50) // process up to 50 per invocation
      .get();

    if (snapshot.empty) {
      return res.json({ processed: 0, message: "No pending notifications" });
    }

    let processed = 0;
    const errors: string[] = [];

    for (const doc of snapshot.docs) {
      const notification = doc.data();
      const notificationId = doc.id;

      try {
        await doc.ref.update({ deliveryStatus: "processing" });

        const channels: string[] = notification.channels || [];
        let emailDelivered = false;
        let pushDelivered = false;

        if (channels.includes("email")) {
          // TODO: Integrate a transactional email service (e.g., Resend, SendGrid)
          console.log(
            `[Notification Worker] 📧 EMAIL queued for ${notification.type} → user ${notification.userId}`
          );
          emailDelivered = true;
        }

        if (channels.includes("push")) {
          const userDoc = await adminDb
            .collection("users")
            .doc(notification.userId)
            .get();
          const fcmTokens: string[] = userDoc.data()?.fcmTokens || [];

          if (fcmTokens.length > 0) {
            // TODO: Send via FCM using firebase-admin messaging
            console.log(
              `[Notification Worker] 📱 PUSH queued to ${fcmTokens.length} device(s)`
            );
            pushDelivered = true;
          }
        }

        await doc.ref.update({
          deliveryStatus: "delivered",
          deliveredAt: new Date().toISOString(),
          emailDelivered,
          pushDelivered,
        });

        processed++;
      } catch (err: any) {
        console.error(
          `[Notification Worker] Failed for ${notificationId}:`,
          err
        );
        errors.push(notificationId);
        const retryCount = (notification.retryCount || 0) + 1;
        await doc.ref.update({
          deliveryStatus: retryCount >= 3 ? "failed" : "pending",
          lastError: err.message,
          retryCount,
        });
      }
    }

    return res.json({
      processed,
      errors: errors.length > 0 ? errors : undefined,
      message: `Processed ${processed} notifications`,
    });
  } catch (error: any) {
    console.error("[Notification Worker] Fatal error:", error);
    return res.status(500).json({ error: error.message });
  }
}
