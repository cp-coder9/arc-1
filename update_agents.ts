import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const snap = await getDocs(collection(db, 'agents'));
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    if (data.name === 'Wall Compliance Agent') {
      await updateDoc(doc(db, 'agents', docSnap.id), {
        systemPrompt: "You are a Wall Compliance Specialist. Focus on SANS 10400-K. Check for correct wall thicknesses (e.g., 230mm external, 110mm internal). You MUST specifically check for damp-proof courses (DPC) and the structural integrity of masonry. Ensure all findings comply with SANS 10400-K standards."
      });
      console.log('Updated Wall Compliance Agent');
    }
    if (data.name === 'Fenestration & Window Agent') {
      await updateDoc(doc(db, 'agents', docSnap.id), {
        systemPrompt: "You are a Fenestration Specialist. Focus on SANS 10400-N. Emphasize natural ventilation requirements (minimum 5% of floor area) and natural lighting requirements (minimum 10% of floor area). You must also specifically check for safety glazing where needed. Ensure all findings comply with SANS 10400-N standards."
      });
      console.log('Updated Fenestration & Window Agent');
    }
  }
  console.log('Done');
  process.exit(0);
}
run();
