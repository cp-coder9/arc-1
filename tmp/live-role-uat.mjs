import { chromium } from 'playwright';
import fs from 'node:fs';
import dotenv from 'dotenv';
import admin from 'firebase-admin';

for (const path of ['.env', '.env.local']) dotenv.config({ path, quiet: true, override: false });

const firebaseConfig = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!serviceAccountRaw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_KEY');
function parseServiceAccount(raw) {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch (firstError) {
    const escapedPrivateKey = trimmed.replace(
      /"private_key"\s*:\s*"([\s\S]*?)"\s*,\s*"client_email"/,
      (_match, key) => `"private_key":"${String(key).replace(/\r?\n/g, '\\n')}","client_email"`,
    );
    try {
      return JSON.parse(escapedPrivateKey);
    } catch {
      throw firstError;
    }
  }
}
const serviceAccount = parseServiceAccount(serviceAccountRaw);

const app = admin.apps.length ? admin.app() : admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: firebaseConfig.projectId,
});
const db = admin.firestore(app);
db.settings({ databaseId: firebaseConfig.firestoreDatabaseId || '(default)' });

const baseUrl = process.env.UAT_BASE_URL || 'https://test.architex.co.za';
const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const password = `Architex-UAT-${runId}!`;
const roles = [
  { role: 'client', path: '/', select: 'role-select-client', expect: /Client View|Command Centre|Always know what to do next/i },
  { role: 'architect', path: '/', select: 'role-select-bep', expect: /Architect|Opportunities|Applications|Command Centre/i, storedRole: 'architect', professionalLabel: 'Architect' },
  { role: 'bep', path: '/', select: 'role-select-bep', expect: /BEP|Design Team|My Tasks|Lead Architect/i },
  { role: 'contractor', path: '/', select: 'role-select-contractor', expect: /Contractor Portal/i },
  { role: 'subcontractor', path: '/', select: 'role-select-subcontractor', expect: /Package Delivery Dashboard|Subcontractor workspace/i },
  { role: 'supplier', path: '/', select: 'role-select-supplier', expect: /Supply Chain Dashboard|Supplier workspace/i },
  { role: 'freelancer', path: '/', select: 'role-select-freelancer', expect: /Freelancer Portal/i },
  { role: 'admin', path: '/admin', select: null, expect: /Admin Command Center|Admin Portal/i },
];
const created = [];

async function ensureUser(entry) {
  const email = `uat+${entry.role}.${runId}@architex.co.za`;
  let user;
  try {
    user = await admin.auth().createUser({ email, password, displayName: `UAT ${entry.role}`, emailVerified: true });
    created.push(user.uid);
  } catch (error) {
    if (error.code !== 'auth/email-already-exists') throw error;
    user = await admin.auth().getUserByEmail(email);
  }
  const now = new Date().toISOString();
  const role = entry.storedRole || entry.role;
  await db.collection('users').doc(user.uid).set({
    uid: user.uid,
    email,
    displayName: `UAT ${entry.role}`,
    role,
    professionalLabel: entry.professionalLabel || role[0].toUpperCase() + role.slice(1),
    status: 'verified',
    createdAt: now,
    updatedAt: now,
    uatRunId: runId,
  }, { merge: true });
  return { ...entry, email, password, uid: user.uid, storedRole: role };
}

async function forceClick(locator) {
  await locator.evaluate((element) => element.click());
}

async function loginAndVerify(page, account) {
  await page.goto(`${baseUrl}${account.path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => undefined);

  if (account.role === 'admin') {
    await page.getByRole('button', { name: /Login with Email/i }).click({ timeout: 30_000 });
    await page.getByPlaceholder('admin@example.com').fill(account.email);
    await page.getByPlaceholder('••••••••').fill(account.password);
    await page.getByRole('button', { name: /Login to Admin Portal/i }).click();
  } else {
    await page.locator('button').filter({ hasText: 'Login' }).first().evaluate((element) => element.click());
    await forceClick(page.getByTestId(account.select));
    await forceClick(page.getByRole('button', { name: 'Login with Email' }));
    await page.getByPlaceholder('name@example.com').fill(account.email);
    await page.getByPlaceholder('••••••••').fill(account.password);
    await page.getByRole('button', { name: /^Login$/i }).dispatchEvent('click');
  }

  await page.waitForFunction((pattern) => {
    const regex = new RegExp(pattern, 'i');
    return regex.test(document.body.innerText) && !document.body.innerText.includes('Invalid email or password');
  }, account.expect.source, { timeout: 90_000 });

  const visibleText = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 500);
  const hasNav = await page.getByTestId('nav-page-command').count().catch(() => 0);
  await page.context().clearCookies();
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); indexedDB.databases?.().then((dbs) => dbs.forEach((db) => db.name && indexedDB.deleteDatabase(db.name))); }).catch(() => undefined);
  return { role: account.role, storedRole: account.storedRole, uid: account.uid, email: account.email, navCommandFound: hasNav > 0, textSample: visibleText };
}

const accounts = [];
for (const entry of roles) accounts.push(await ensureUser(entry));

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const account of accounts) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    page.on('console', (msg) => { if (msg.type() === 'error') console.error(`[browser:${account.role}]`, msg.text()); });
    try {
      const result = await loginAndVerify(page, account);
      results.push({ ...result, status: 'PASS' });
      console.log(`PASS ${account.role}: ${result.email}`);
    } catch (error) {
      const screenshot = `tmp/uat-${account.role}-${runId}.png`;
      await page.screenshot({ path: screenshot, fullPage: true }).catch(() => undefined);
      results.push({ role: account.role, email: account.email, status: 'FAIL', error: error.message, screenshot });
      console.error(`FAIL ${account.role}: ${error.message} screenshot=${screenshot}`);
      throw error;
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const report = { baseUrl, runId, generatedAt: new Date().toISOString(), results };
fs.mkdirSync('tmp', { recursive: true });
fs.writeFileSync(`tmp/live-role-uat-${runId}.json`, JSON.stringify(report, null, 2));
console.log('LIVE_ROLE_UAT_RESULTS');
console.log(JSON.stringify(report, null, 2));
