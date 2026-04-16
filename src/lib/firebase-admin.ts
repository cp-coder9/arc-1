import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

// Configuration with fallbacks
const projectId = process.env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-0880960511";
const firestoreDatabaseId = process.env.VITE_FIREBASE_DATABASE_ID || "ai-studio-2ae3d9c3-70e6-4323-8a95-9d566bd24635";

let app;
if (getApps().length === 0) {
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
    }
  } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    adminConfig.credential = cert({
      projectId: projectId,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    });
    console.log("Firebase Admin initialized with individual credentials.");
  } else {
    console.warn("⚠️ No Firebase Admin credentials found! CRUD operations on server-side will likely fail.");
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
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}


