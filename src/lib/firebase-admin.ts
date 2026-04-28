import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

// Configuration - require environment variables
const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
const firestoreDatabaseId = process.env.VITE_FIREBASE_DATABASE_ID;

let app;
if (getApps().length === 0) {
  if (!projectId) {
    throw new Error('VITE_FIREBASE_PROJECT_ID environment variable is required');
  }

  const adminConfig: any = {
    projectId: projectId,
  };

  // Check for service account in environment variables
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (serviceAccountKey) {
    try {
      const serviceAccount = JSON.parse(serviceAccountKey);
      adminConfig.credential = cert(serviceAccount);
      console.log("Firebase Admin initialized with service account.");
    } catch (err) {
      console.error("Error parsing FIREBASE_SERVICE_ACCOUNT_KEY:", err);
      throw err;
    }
  } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    adminConfig.credential = cert({
      projectId: projectId,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
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


