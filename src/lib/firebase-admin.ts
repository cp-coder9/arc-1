import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find firebase-applet-config.json
// It could be in root (from server.ts) or in .. (from api/index.ts)
// We'll check common locations or use a more robust resolution.
let configPath = path.resolve(__dirname, "../../firebase-applet-config.json");
if (!fs.existsSync(configPath)) {
  configPath = path.resolve(__dirname, "../../../firebase-applet-config.json");
}

const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

export const adminDb = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)"
  ? getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId)
  : getFirestore(admin.app());

export const auth = admin.auth();
export { admin };
export { firebaseConfig };
