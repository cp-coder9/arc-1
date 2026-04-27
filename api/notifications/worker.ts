/**
 * Vercel Cron Job: Notification Worker
 *
 * Runs every minute to process pending notifications from Firestore.
 * Configured in vercel.json under "crons".
 *
 * This replaces the long-lived onSnapshot listener from server.ts,
 * which cannot run in a serverless environment.
 */
import { admin, adminDb } from "../../src/lib/firebase-admin";
import type { Request, Response } from "express";

// Conditionally initialize Resend if API key is present
let resend: any = null;
if (process.env.RESEND_API_KEY) {
  try {
    // Dynamic import to avoid requiring the package if not used
    const { Resend } = require('resend');
    resend = new Resend(process.env.RESEND_API_KEY);
  } catch (e) {
    console.warn("Resend package not installed or RESEND_API_KEY missing", e);
  }
}

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

      // Attempt to lock the notification using a transaction
      let locked = false;
      try {
        await adminDb.runTransaction(async (transaction) => {
          const docRef = doc.ref;
          const snap = await transaction.get(docRef);
          if (!snap.exists) return;
          const data = snap.data();
          if (data?.deliveryStatus === 'pending') {
            transaction.update(docRef, { deliveryStatus: 'processing' });
            locked = true;
          }
        });
      } catch (err) {
        console.error(`[Notification Worker] Transaction error for ${notificationId}:`, err);
        errors.push(notificationId);
        continue; // skip this notification
      }

      if (!locked) {
        // Another worker already locked this notification
        continue;
      }

      try {
        const channels: string[] = notification.channels || [];
        let emailDelivered = false;
        let pushDelivered = false;

        // Email channel via Resend (or SendGrid)
        if (channels.includes("email")) {
          const userDoc = await adminDb.collection("users").doc(notification.userId).get();
          const userEmail = userDoc.data()?.email;
          if (userEmail && resend) {
            try {
              await resend.emails.send({
                from: 'notifications@architex.co.za',
                to: userEmail,
                subject: notification.title,
                html: `<p>${notification.body}</p>`
              });
              emailDelivered = true;
            } catch (emailErr) {
              console.error(`Email failed for ${notificationId}:`, emailErr);
              throw emailErr;
            }
          } else if (!process.env.RESEND_API_KEY) {
            console.warn(`RESEND_API_KEY not set, skipping email for ${notificationId}`);
            // Don't fail, just mark as not delivered; we may still attempt push
          } else {
            throw new Error('User email not found');
          }
        }

        // Push channel via FCM
        if (channels.includes("push")) {
          const userDoc = await adminDb.collection("users").doc(notification.userId).get();
          const fcmTokens: string[] = userDoc.data()?.fcmTokens || [];
          if (fcmTokens.length > 0) {
            const message = {
              notification: {
                title: notification.title,
                body: notification.body,
              },
              tokens: fcmTokens,
            };
            const response = await admin.messaging().sendEachForMulticast(message);
            pushDelivered = response.successCount > 0;
            if (!pushDelivered) {
              throw new Error('Push failed for all tokens');
            }
          } else {
            console.log(`No FCM tokens for user ${notification.userId}, skipping push`);
            // Not an error; just no push delivered
            pushDelivered = false;
          }
        }

        // Mark as delivered
        await doc.ref.update({
          deliveryStatus: "delivered",
          deliveredAt: new Date().toISOString(),
          emailDelivered,
          pushDelivered,
        });

        processed++;
      } catch (err: any) {
        console.error(`[Notification Worker] Failed for ${notificationId}:`, err);
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