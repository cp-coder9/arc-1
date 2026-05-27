import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import cors from "cors";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import firebaseAppletConfig from "../firebase-applet-config.json";

const app = express();

const BODY_LIMIT = '50mb';
const API_NOT_FOUND_MESSAGE = 'API route not found';
const ALLOWED_CORS_ORIGINS = [
  "https://architex.co.za",
  "https://www.architex.co.za",
  "https://test.architex.co.za",
  "https://architex-marketplace.vercel.app",
  /\.vercel\.app$/,
];

// Vercel and local proxy adapters set X-Forwarded-* headers. Trusting the
// first proxy prevents express-rate-limit from throwing before routes run.
app.set('trust proxy', 1);

app.use((_req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

app.use(
  cors({
    origin: ALLOWED_CORS_ORIGINS,
    credentials: true,
  })
);

app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

function readBuildInfo() {
  const candidates = [
    resolve(process.cwd(), 'dist', 'build-info.json'),
    resolve(process.cwd(), 'public', 'build-info.json'),
  ];

  for (const candidate of candidates) {
    try {
      return JSON.parse(readFileSync(candidate, 'utf8'));
    } catch {
      // Try the next build-info location.
    }
  }

  const commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || process.env.COMMIT_SHA || 'unknown';
  return {
    name: 'architex',
    version: 'unknown',
    commit,
    shortCommit: commit.slice(0, 12),
    branch: process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_REF_NAME || process.env.BRANCH_NAME || 'unknown',
    builtAt: 'unknown',
    node: process.version,
  };
}

function trimWrappingQuotes(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseServiceAccount(value: string) {
  const raw = trimWrappingQuotes(value);
  const candidates = [raw, raw.replace(/\\n/g, '\n'), Buffer.from(raw, 'base64').toString('utf8')];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      return parsed;
    } catch {
      // Try the next representation.
    }
  }
  throw new Error('Unable to parse Firebase service account JSON');
}

function getAdminServices() {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID || firebaseAppletConfig.projectId;
  const databaseId = process.env.VITE_FIREBASE_DATABASE_ID || firebaseAppletConfig.firestoreDatabaseId;
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!getApps().length) {
    if (!serviceAccountRaw) throw new Error('Firebase Admin credentials missing');
    initializeApp({ projectId, credential: cert(parseServiceAccount(serviceAccountRaw)) });
  }

  return {
    auth: getAuth(),
    db: databaseId && databaseId !== '(default)' ? getFirestore(databaseId) : getFirestore(),
  };
}

const ADMIN_EMAILS = ['gm.tarb@gmail.com', 'leor@slutzkin.co.za'];
const COMMON_PROFILE_FIELDS = [
  'displayName', 'bio', 'mobileNumber', 'address', 'billingDetails', 'vatTaxDetails',
  'digitalSignatureUrl', 'preferredNotificationMethod', 'projectRegion', 'directoryVisibility',
  'directoryPrivacySettings',
];
const ROLE_PROFILE_FIELDS: Record<string, readonly string[]> = {
  client: [...COMMON_PROFILE_FIELDS, 'companyRegistration', 'residentialAddress', 'businessAddress', 'budgetRange', 'projectType'],
  architect: [...COMMON_PROFILE_FIELDS, 'practiceName', 'professionalName', 'professionalDiscipline', 'statutoryBody', 'registrationNumber', 'practiceAddress', 'professionalIndemnityDetails', 'servicesOffered', 'region', 'availability', 'portfolio', 'sacapNumber', 'mainSpecialization', 'specializations', 'hasPIInsurance', 'experienceYears'],
  bep: [...COMMON_PROFILE_FIELDS, 'practiceName', 'professionalName', 'professionalDiscipline', 'statutoryBody', 'registrationNumber', 'practiceAddress', 'professionalIndemnityDetails', 'servicesOffered', 'region', 'availability', 'portfolio', 'sacapNumber', 'mainSpecialization', 'specializations', 'hasPIInsurance', 'experienceYears'],
  contractor: [...COMMON_PROFILE_FIELDS, 'companyName', 'contractorCategory', 'regionsServed', 'projectValueRange', 'companyRegistration', 'bankingPayoutDetails', 'insuranceDetails', 'healthSafetyDocuments', 'staffCapacity', 'trades', 'plantEquipmentCapability', 'portfolio', 'cidbGrading', 'nhbrcNumber'],
  subcontractor: [...COMMON_PROFILE_FIELDS, 'businessName', 'tradeCategory', 'serviceRegion', 'packageType', 'bankingPayoutDetails', 'warrantySupportDetails', 'productCategories', 'deliveryCapacity', 'complianceDocuments', 'closeOutDocumentationRequirements', 'tradeLicense'],
  supplier: [...COMMON_PROFILE_FIELDS, 'businessName', 'supplyCategory', 'serviceRegion', 'packageType', 'bankingPayoutDetails', 'warrantySupportDetails', 'productCategories', 'deliveryCapacity', 'complianceDocuments', 'closeOutDocumentationRequirements'],
  freelancer: [...COMMON_PROFILE_FIELDS, 'skills', 'software', 'availability', 'portfolio', 'payoutDetails', 'professionalDiscipline', 'region'],
  admin: [...COMMON_PROFILE_FIELDS, 'department', 'permissionLevel', 'auditIdentity', 'twoFactorStatus'],
};

function sanitizeUserProfileData(profileData: unknown, role: string) {
  if (!profileData || typeof profileData !== 'object') return {};
  const allowedFields = new Set([...(ROLE_PROFILE_FIELDS[role] ?? COMMON_PROFILE_FIELDS), 'professionalLabel']);
  return Object.entries(profileData as Record<string, unknown>).reduce<Record<string, unknown>>((safeData, [field, value]) => {
    if (allowedFields.has(field)) safeData[field] = value;
    return safeData;
  }, {});
}

async function projectDirectoryProfile(db: Firestore, uid: string, profile: Record<string, unknown>) {
  const visible = profile.directoryVisibility !== false;
  await db.collection('directoryProfiles').doc(uid).set({
    uid,
    role: profile.role,
    displayName: profile.displayName ?? '',
    region: profile.region ?? profile.projectRegion ?? profile.serviceRegion ?? '',
    discipline: profile.professionalDiscipline ?? profile.tradeCategory ?? profile.supplyCategory ?? profile.mainSpecialization ?? '',
    verificationStatus: profile.verificationStatus ?? 'pending',
    visible,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

app.get('/api/version', (_req, res) => {
  res.json({ status: 'ok', ...readBuildInfo(), servedAt: new Date().toISOString() });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/auth/check-admin', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const { auth, db } = getAdminServices();
    const decoded = await auth.verifyIdToken(authHeader.slice('Bearer '.length));
    const isAdminEmail = ADMIN_EMAILS.includes(decoded.email || '');
    const userRef = db.collection('users').doc(decoded.uid);
    const userDoc = await userRef.get();
    const requestedRole = ['client', 'architect', 'freelancer', 'bep', 'contractor', 'subcontractor', 'supplier'].includes(req.body.role)
      ? req.body.role
      : 'client';
    const assignedRole = isAdminEmail ? 'admin' : requestedRole;
    const profileData = sanitizeUserProfileData(req.body.profileData, assignedRole);

    if (!userDoc.exists) {
      const newUser = {
        uid: decoded.uid,
        email: decoded.email || '',
        displayName: req.body.displayName || decoded.name || 'Anonymous',
        role: assignedRole,
        ...profileData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await userRef.set(newUser);
      await projectDirectoryProfile(db, decoded.uid, newUser);
      return res.json({ role: newUser.role, isAdmin: isAdminEmail, created: true });
    }

    const currentRole = userDoc.data()?.role;
    if (Object.keys(profileData).length > 0) {
      await userRef.set({ ...profileData, updatedAt: new Date().toISOString() }, { merge: true });
    }

    if (isAdminEmail && currentRole !== 'admin') {
      await userRef.update({ role: 'admin', updatedAt: new Date().toISOString() });
      return res.json({ role: 'admin', isAdmin: true, upgraded: true });
    }

    return res.json({ role: currentRole, isAdmin: currentRole === 'admin', existing: true });
  } catch (error) {
    console.error('Admin check error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

// Mount the shared API router lazily so lightweight routes (for example
// `/api/health`) still work even if downstream integrations fail at import time.
app.use('/api', async (req, res, next) => {
  try {
    const { default: apiRouter } = await import('../src/lib/api-router.ts');
    return apiRouter(req, res, next);
  } catch (error) {
    console.error('Failed to load API router:', error);
    return res.status(500).json({
      error: 'API router failed to initialize',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: API_NOT_FOUND_MESSAGE, path: req.originalUrl });
});

export default app;
