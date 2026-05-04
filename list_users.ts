import "dotenv/config";
import { adminDb } from "./src/lib/firebase-admin.js";

async function listUsers() {
  console.log("Listing some users in the system:");
  const usersSnap = await adminDb.collection("users").orderBy("createdAt", "desc").limit(10).get();
  
  usersSnap.docs.forEach(doc => {
    const data = doc.data();
    console.log(`${doc.id}: ${data.displayName} (${data.role}) - ${data.email}`);
  });
}

listUsers().catch(console.error);
