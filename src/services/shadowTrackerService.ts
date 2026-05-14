import { adminDb } from '../lib/firebase-admin';
import { MunicipalityType, TrackingEvent } from '../types';

export async function detectMunicipalInvoices(emailContent: string, userId: string) {
  console.log(`[Shadow Tracker] Scanning content for user ${userId}...`);

  const muniKeywords = ['City of Johannesburg', 'City of Cape Town', 'Tshwane', 'Ekurhuleni', 'Statement', 'Invoice', 'Plan Fees'];
  const found = muniKeywords.some(k => emailContent.includes(k));

  if (found) {
    console.log(`[Shadow Tracker] Municipal activity detected!`);
    const ref = "INV-" + Math.random().toString(36).substring(7).toUpperCase();
    const muni: MunicipalityType = emailContent.includes('Johannesburg') ? 'COJ' : 'COCT';

    const subQuery = await adminDb.collection("council_submissions")
      .where("userId", "==", userId)
      .where("municipality", "==", muni)
      .limit(1)
      .get();

    if (!subQuery.empty) {
      const subDoc = subQuery.docs[0];
      const subData = subDoc.data();

      await subDoc.ref.update({
        status: "Fees Invoiced",
        trackingHistory: [
          ...subData.trackingHistory,
          {
            status: "Fees Invoiced",
            timestamp: new Date().toISOString(),
            notes: `Shadow tracker detected invoice ${ref} from ${muni}. This usually indicates a status change is imminent.`,
            source: 'shadow_tracker'
          } as TrackingEvent
        ]
      });

      return { detected: true, ref, municipality: muni, action: 'updated_submission' };
    }
  }

  return { detected: false };
}

export async function getMunicipalityHeatMap(municipality: MunicipalityType) {
  const snapshot = await adminDb.collection("crowdsource_updates")
    .where("municipality", "==", municipality)
    .where("timestamp", ">", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .get();

  const updates = snapshot.docs.map(doc => doc.data());
  const stats: Record<string, { count: number, high: number, med: number, low: number }> = {};

  updates.forEach(u => {
    const dept = u.department || 'General';
    if (!stats[dept]) stats[dept] = { count: 0, high: 0, med: 0, low: 0 };
    stats[dept].count++;
    if (u.backlogLevel === 'high') stats[dept].high++;
    if (u.backlogLevel === 'medium') stats[dept].med++;
    if (u.backlogLevel === 'low') stats[dept].low++;
  });

  return stats;
}
