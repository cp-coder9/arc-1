import "dotenv/config";
import { adminDb } from "./src/lib/firebase-admin.js";

async function findProfessionals() {
  console.log("Finding freelancers and BEPs:");
  const usersSnap = await adminDb.collection("users").where("role", "in", ["freelancer", "bep"]).get();
  
  if (usersSnap.empty) {
    console.log("No freelancers or BEPs found. Creating some for testing.");
    const testUsers = [
      {
        displayName: "John Structural",
        role: "bep",
        email: "structural@example.com",
        professionalLabels: ["Structural Engineer"],
        professionalLabel: "Structural Engineer",
        createdAt: new Date().toISOString()
      },
      {
        displayName: "Mike Builder",
        role: "freelancer",
        email: "builder@example.com",
        professionalLabels: ["Builder"],
        professionalLabel: "Builder",
        createdAt: new Date().toISOString()
      }
    ];
    
    for (const u of testUsers) {
      const ref = await adminDb.collection("users").add(u);
      console.log(`Created ${u.displayName} with ID: ${ref.id}`);
    }
  } else {
    usersSnap.docs.forEach(doc => {
      const data = doc.data();
      console.log(`${doc.id}: ${data.displayName} (${data.role}) - ${data.email}`);
    });
  }
}

findProfessionals().catch(console.error);
