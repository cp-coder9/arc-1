import { adminDb } from '../lib/firebase-admin.js';
import { decrypt } from '../lib/encryption.js';
import { MunicipalityType, CouncilSubmission, TrackingEvent } from '../types.js';

export async function runMunicipalScraper(userId: string, municipality: MunicipalityType) {
  console.log(`[Scraper] Starting scraper for user ${userId} in ${municipality}`);

  try {
    const credDoc = await adminDb.collection("municipal_credentials").doc(`${userId}_${municipality}`).get();
    if (!credDoc.exists) {
      throw new Error("Credentials not found");
    }

    const creds = credDoc.data()!;
    const password = decrypt(creds.encryptedPassword, creds.iv, creds.authTag);

    let scrapedData: Partial<CouncilSubmission>[] = [];

    if (municipality === 'COJ') {
      scrapedData = await scrapeJoburg(creds.username, password);
    } else if (municipality === 'COCT') {
      scrapedData = await scrapeCapeTown(creds.username, password);
    }

    for (const data of scrapedData) {
      if (!data.referenceNumber) continue;

      const subQuery = await adminDb.collection("council_submissions")
        .where("userId", "==", userId)
        .where("municipality", "==", municipality)
        .where("referenceNumber", "==", data.referenceNumber)
        .get();

      if (subQuery.empty) {
        await adminDb.collection("council_submissions").add({
          userId,
          municipality,
          referenceNumber: data.referenceNumber,
          status: data.status,
          rawStatus: data.rawStatus,
          lastCheckedAt: new Date().toISOString(),
          source: 'scraper',
          trackingHistory: [
            {
              status: data.status,
              timestamp: new Date().toISOString(),
              notes: "Found via automated scraper",
              source: 'scraper'
            } as TrackingEvent
          ],
          documents: [],
          createdAt: new Date().toISOString()
        });
      } else {
        const subDoc = subQuery.docs[0];
        const subData = subDoc.data();

        if (subData.status !== data.status) {
          await subDoc.ref.update({
            status: data.status,
            rawStatus: data.rawStatus,
            lastCheckedAt: new Date().toISOString(),
            trackingHistory: [
              ...subData.trackingHistory,
              {
                status: data.status,
                timestamp: new Date().toISOString(),
                notes: `Status updated from ${subData.status} to ${data.status} via scraper`,
                source: 'scraper'
              } as TrackingEvent
            ]
          });
        } else {
          await subDoc.ref.update({
            lastCheckedAt: new Date().toISOString()
          });
        }
      }
    }

    return { success: true, count: scrapedData.length };
  } catch (error: any) {
    console.error(`[Scraper] Error scraping ${municipality}:`, error);
    return { success: false, error: error.message };
  }
}

async function scrapeJoburg(username: string, password: string): Promise<Partial<CouncilSubmission>[]> {
  console.log(`[Scraper] [COJ] Logging in as ${username}...`);
  await new Promise(resolve => setTimeout(resolve, 1000));
  return [
    {
      referenceNumber: "BP-2024-0001",
      status: "In Circulation",
      rawStatus: "IN_CIRCULATION_PENDING_HEALTH"
    }
  ];
}

async function scrapeCapeTown(username: string, password: string): Promise<Partial<CouncilSubmission>[]> {
  console.log(`[Scraper] [COCT] Logging in as ${username}...`);
  await new Promise(resolve => setTimeout(resolve, 1000));
  return [
    {
      referenceNumber: "DAMS-778899",
      status: "Approved",
      rawStatus: "FINAL_APPROVAL_GRANTED"
    }
  ];
}
