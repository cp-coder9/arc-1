import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import firebaseAppletConfig from "../../firebase-applet-config.json";

// Non-secret Firebase identifiers can come from env or the shared app config.
// Credentials still must come from environment variables.
const projectId = process.env.VITE_FIREBASE_PROJECT_ID || firebaseAppletConfig.projectId;
const firestoreDatabaseId = process.env.VITE_FIREBASE_DATABASE_ID || firebaseAppletConfig.firestoreDatabaseId;

type ServiceAccountInput = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

function trimWrappingQuotes(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseServiceAccount(value: string): ServiceAccountInput {
  const raw = trimWrappingQuotes(value);
  const candidates = [
    raw,
    raw.replace(/\\n/g, '\n'),
    Buffer.from(raw, 'base64').toString('utf8'),
  ];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as ServiceAccountInput;
      if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      return parsed;
    } catch {
      // Try the next representation.
    }
  }

  throw new Error('Unable to parse Firebase service account JSON from environment variable');
}

let app;
if (getApps().length === 0) {
  if (!projectId) {
    throw new Error('Firebase project ID is required via VITE_FIREBASE_PROJECT_ID or firebase-applet-config.json');
  }

  const adminConfig: any = {
    projectId: projectId,
  };

  // Check for service account in environment variables. Production hosts often
  // store this as raw JSON, quoted JSON, escaped JSON, or base64-encoded JSON.
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (serviceAccountKey) {
    try {
      const serviceAccount = parseServiceAccount(serviceAccountKey);
      adminConfig.credential = cert(serviceAccount as any);
      console.log("Firebase Admin initialized with service account.");
    } catch (err) {
      console.error("Error parsing Firebase service account credentials:", err);
      throw err;
    }
  } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    adminConfig.credential = cert({
      projectId: projectId,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: trimWrappingQuotes(process.env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, '\n'),
    });
    console.log("Firebase Admin initialized with individual credentials.");
  } else {
    throw new Error("Firebase Admin credentials missing. Set either FIREBASE_SERVICE_ACCOUNT_KEY or both FIREBASE_PRIVATE_KEY and FIREBASE_CLIENT_EMAIL.");
  }

  app = initializeApp(adminConfig);
} else {
  app = getApps()[0];
}

export const adminDb = firestoreDatabaseId && firestoreDatabaseId !== "(default)"
  ? getFirestore(app, firestoreDatabaseId)
  : getFirestore(app);

export const auth = getAuth(app);
export const firebaseConfig = { projectId, firestoreDatabaseId };
// Maintain 'admin' export for compatibility if needed, though modular is preferred
import * as adminModule from "firebase-admin";
export const admin = adminModule;

// Add test endpoint for development
export async function testFirebase() {
  try {
    const collections = await adminDb.listCollections();
    const collectionNames = collections.map(col => col.id);
    return {
      status: "success",
      firebaseConfig: { projectId, firestoreDatabaseId },
      collections: collectionNames,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    };
  }
}


