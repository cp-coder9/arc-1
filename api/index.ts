import express from "express";
import cors from "cors";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
const firebaseAppletConfig = {
  projectId: 'gen-lang-client-0880960511',
  firestoreDatabaseId: 'ai-studio-2ae3d9c3-70e6-4323-8a95-9d566bd24635',
};

const app = express();

// Vercel and local proxy adapters set X-Forwarded-* headers. Trusting the
// first proxy prevents express-rate-limit from throwing before routes run.
app.set('trust proxy', 1);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
const USER_PROFILE_FIELDS = [
  'bio', 'budgetRange', 'cidbGrading', 'experienceYears', 'hasPIInsurance',
  'mainSpecialization', 'nhbrcNumber', 'professionalLabel', 'projectType',
  'region', 'sacapNumber', 'specializations', 'tradeLicense',
];

function sanitizeUserProfileData(profileData: unknown) {
  if (!profileData || typeof profileData !== 'object') return {};
  return USER_PROFILE_FIELDS.reduce<Record<string, unknown>>((safeData, field) => {
    if (Object.prototype.hasOwnProperty.call(profileData, field)) {
      safeData[field] = (profileData as Record<string, unknown>)[field];
    }
    return safeData;
  }, {});
}

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
    const profileData = sanitizeUserProfileData(req.body.profileData);
    const requestedRole = ['client', 'architect', 'freelancer', 'bep', 'contractor'].includes(req.body.role)
      ? req.body.role
      : 'client';

    if (!userDoc.exists) {
      const newUser = {
        uid: decoded.uid,
        email: decoded.email || '',
        displayName: req.body.displayName || decoded.name || 'Anonymous',
        role: isAdminEmail ? 'admin' : requestedRole,
        ...profileData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await userRef.set(newUser);
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

app.use(
  cors({
    origin: [
      "https://architex.co.za",
      "https://architex-marketplace.vercel.app",
      /\.vercel\.app$/,
    ],
    credentials: true,
  })
);

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

export default app;
