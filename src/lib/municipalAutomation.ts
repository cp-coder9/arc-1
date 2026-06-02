import { chromium, type Page } from 'playwright';
import { adminDb } from './firebase-admin';
import { decrypt } from './encryption';
import { MunicipalityType, TrackingEvent } from '../types';

type PortalApplication = {
  referenceNumber: string;
  status: string;
  rawStatus?: string;
  erfNumber?: string;
  projectDescription?: string;
};

type MunicipalCredentialRecord = {
  userId: string;
  municipality: MunicipalityType | string;
  username: string;
  encryptedPassword?: string;
  password?: string;
  iv?: string;
  authTag?: string;
  salt?: string;
};

type AutomationResult = {
  success: boolean;
  mode: 'browser' | 'dry_run';
  municipality: string;
  count: number;
  lastUpdated: string;
  applications: PortalApplication[];
  runId?: string;
};

const LIVE_AUTOMATION_ENABLED = process.env.MUNICIPAL_AUTOMATION_LIVE === 'true';

const MUNICIPALITY_ALIASES: Record<string, MunicipalityType | string> = {
  city_of_johannesburg: 'COJ',
  johannesburg: 'COJ',
  coj: 'COJ',
  city_of_cape_town: 'COCT',
  cape_town: 'COCT',
  coct: 'COCT',
  ethekwini: 'ETH',
  eth: 'ETH',
  tshwane: 'Tshwane',
  ekurhuleni: 'Ekurhuleni',
  mangaung: 'Mangaung',
};

export async function runMunicipalBrowserAutomation(userId: string, municipality: MunicipalityType | string) {
  const normalizedMunicipality = normalizeMunicipality(municipality);
  const credentialDoc = await findCredential(userId, normalizedMunicipality);

  if (!credentialDoc) {
    return {
      success: false,
      error: `No official portal credentials found for ${normalizedMunicipality}`,
    };
  }

  return trackMunicipalityStatus(credentialDoc.id);
}

export async function trackMunicipalityStatus(credentialId: string): Promise<AutomationResult> {
  const credDoc = await adminDb.collection('municipal_credentials').doc(credentialId).get();
  if (!credDoc.exists) {
    throw new Error('Credentials not found');
  }

  const cred = credDoc.data() as MunicipalCredentialRecord;
  const municipality = normalizeMunicipality(cred.municipality);
  const password = decryptCredentialPassword(cred);
  const startedAt = new Date().toISOString();

  const runRef = await adminDb.collection('municipal_automation_runs').add({
    credentialId,
    userId: cred.userId,
    municipality,
    mode: LIVE_AUTOMATION_ENABLED ? 'browser' : 'dry_run',
    status: 'running',
    startedAt,
  });

  try {
    const applications = LIVE_AUTOMATION_ENABLED
      ? await scrapeOfficialPortal(municipality, cred.username, password)
      : await dryRunOfficialPortal(municipality);

    await persistApplications(cred.userId, municipality, applications);

    const result: AutomationResult = {
      success: true,
      mode: LIVE_AUTOMATION_ENABLED ? 'browser' : 'dry_run',
      municipality,
      count: applications.length,
      lastUpdated: new Date().toISOString(),
      applications,
      runId: runRef.id,
    };

    await runRef.update({
      ...result,
      status: 'completed',
      completedAt: result.lastUpdated,
    });

    return result;
  } catch (error: any) {
    await runRef.update({
      status: 'failed',
      error: error.message,
      completedAt: new Date().toISOString(),
    });
    throw error;
  }
}

function normalizeMunicipality(municipality: MunicipalityType | string) {
  const key = municipality.toString().trim().toLowerCase();
  return MUNICIPALITY_ALIASES[key] || municipality;
}

async function findCredential(userId: string, municipality: MunicipalityType | string) {
  const deterministicId = `${userId}_${municipality}`;
  const deterministicDoc = await adminDb.collection('municipal_credentials').doc(deterministicId).get();

  if (deterministicDoc.exists) {
    return deterministicDoc;
  }

  const snapshot = await adminDb.collection('municipal_credentials')
    .where('userId', '==', userId)
    .where('municipality', '==', municipality)
    .limit(1)
    .get();

  return snapshot.empty ? null : snapshot.docs[0];
}

function decryptCredentialPassword(cred: MunicipalCredentialRecord) {
  if (cred.encryptedPassword && cred.iv && cred.authTag) {
    return decrypt(cred.encryptedPassword, cred.iv, cred.authTag, cred.salt);
  }

  if (cred.password) {
    return Buffer.from(cred.password, 'base64').toString('utf-8');
  }

  throw new Error('Credential password is not configured');
}

async function scrapeOfficialPortal(municipality: MunicipalityType | string, username: string, password: string) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Architex Municipal Tracker/1.0 official-access automation',
  });
  const page = await context.newPage();

  try {
    if (municipality === 'COJ') {
      return scrapeJoburgPortal(page, username, password);
    }

    if (municipality === 'COCT') {
      return scrapeCapeTownPortal(page, username, password);
    }

    throw new Error(`Official browser automation is not configured for ${municipality}`);
  } finally {
    await browser.close();
  }
}

async function scrapeJoburgPortal(page: Page, username: string, password: string): Promise<PortalApplication[]> {
  await page.goto('https://eservices.joburg.org.za/Pages/BuildingPlanStatus.aspx', { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="username"], #username', username);
  await page.fill('input[name="password"], #password', password);
  await page.click('button[type="submit"], #loginBtn');
  await page.waitForLoadState('networkidle');

  return page.$$eval('.status-row, tr', rows => rows.map(row => {
    const text = (selector: string) => row.querySelector(selector)?.textContent?.trim() || '';
    const cells = Array.from(row.querySelectorAll('td')).map(cell => cell.textContent?.trim() || '');

    return {
      referenceNumber: text('.ref-no') || cells[0],
      status: text('.status') || cells[1],
      rawStatus: text('.raw-status') || cells[1],
      erfNumber: text('.erf') || cells[2],
      projectDescription: text('.description') || cells[3],
    };
  }).filter(app => app.referenceNumber && app.status));
}

async function scrapeCapeTownPortal(page: Page, username: string, password: string): Promise<PortalApplication[]> {
  await page.goto('https://eservices.capetown.gov.za/irj/portal', { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="username"], #username', username);
  await page.fill('input[name="password"], #password', password);
  await page.click('button[type="submit"], #loginBtn');
  await page.waitForLoadState('networkidle');

  return page.$$eval('.application-row, tr', rows => rows.map(row => {
    const text = (selector: string) => row.querySelector(selector)?.textContent?.trim() || '';
    const cells = Array.from(row.querySelectorAll('td')).map(cell => cell.textContent?.trim() || '');

    return {
      referenceNumber: text('.reference') || cells[0],
      status: text('.status') || cells[1],
      rawStatus: text('.raw-status') || cells[1],
      erfNumber: text('.erf') || cells[2],
      projectDescription: text('.description') || cells[3],
    };
  }).filter(app => app.referenceNumber && app.status));
}

async function dryRunOfficialPortal(municipality: MunicipalityType | string): Promise<PortalApplication[]> {
  await new Promise(resolve => setTimeout(resolve, 1000));

  const fixtures: Record<string, PortalApplication[]> = {
    COJ: [
      { referenceNumber: 'BP-2024-0001', status: 'In Circulation', rawStatus: 'IN_CIRCULATION_PENDING_HEALTH' },
    ],
    COCT: [
      { referenceNumber: 'DAMS-778899', status: 'Approved', rawStatus: 'FINAL_APPROVAL_GRANTED' },
    ],
    ETH: [
      { referenceNumber: 'ETH-2024-XP', status: 'Queries Raised', rawStatus: 'QUERY_RAISED' },
    ],
  };

  return fixtures[municipality] || [];
}

async function persistApplications(userId: string, municipality: MunicipalityType | string, applications: PortalApplication[]) {
  for (const application of applications) {
    const now = new Date().toISOString();
    const subQuery = await adminDb.collection('council_submissions')
      .where('userId', '==', userId)
      .where('municipality', '==', municipality)
      .where('referenceNumber', '==', application.referenceNumber)
      .limit(1)
      .get();

    if (subQuery.empty) {
      await adminDb.collection('council_submissions').add({
        userId,
        municipality,
        referenceNumber: application.referenceNumber,
        status: application.status,
        rawStatus: application.rawStatus || application.status,
        erfNumber: application.erfNumber || null,
        projectDescription: application.projectDescription || null,
        lastCheckedAt: now,
        source: 'scraper',
        trackingHistory: [
          {
            status: application.status,
            timestamp: now,
            notes: 'Found via official-access browser automation',
            source: 'scraper',
          } as TrackingEvent,
        ],
        documents: [],
        createdAt: now,
      });
      continue;
    }

    const subDoc = subQuery.docs[0];
    const subData = subDoc.data();
    const trackingHistory = Array.isArray(subData.trackingHistory) ? subData.trackingHistory : [];

    if (subData.status !== application.status) {
      await subDoc.ref.update({
        status: application.status,
        rawStatus: application.rawStatus || application.status,
        erfNumber: application.erfNumber || subData.erfNumber || null,
        projectDescription: application.projectDescription || subData.projectDescription || null,
        lastCheckedAt: now,
        trackingHistory: [
          ...trackingHistory,
          {
            status: application.status,
            timestamp: now,
            notes: `Status updated from ${subData.status} to ${application.status} via official portal automation`,
            source: 'scraper',
          } as TrackingEvent,
        ],
      });
    } else {
      await subDoc.ref.update({ lastCheckedAt: now });
    }
  }
}
