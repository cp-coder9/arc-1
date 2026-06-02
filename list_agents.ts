import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const snap = await getDocs(collection(db, 'agents'));
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    console.log(`${data.name} | role=${data.role} | discipline=${data.discipline || 'n/a'} | risk=${data.riskLevel || 'n/a'} | modes=${(data.executionModes || []).join(',')}`);
  }
  process.exit(0);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
