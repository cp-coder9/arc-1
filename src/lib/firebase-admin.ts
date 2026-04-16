import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "../../firebase-applet-config.json" assert { type: "json" };

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
