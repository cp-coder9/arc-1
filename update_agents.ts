import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc, addDoc } from 'firebase/firestore';
import fs from 'fs';
import { SPECIALIZED_AGENTS } from './src/services/geminiService';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);
const reseed = process.argv.includes('--reseed');

async function run() {
  const snap = await getDocs(collection(db, 'agents'));
  const byRole = new Map(snap.docs.map(docSnap => [docSnap.data().role, docSnap]));

  for (const agent of SPECIALIZED_AGENTS) {
    if (!agent.role) continue;
    const existing = byRole.get(agent.role);
    const payload = {
      ...agent,
      temperature: agent.temperature ?? 0.1,
      status: agent.status ?? 'online',
      lastActive: new Date().toISOString()
    };

    if (!existing) {
      await addDoc(collection(db, 'agents'), payload);
      console.log(`Seeded ${agent.role}`);
      continue;
    }

    if (reseed) {
      await updateDoc(doc(db, 'agents', existing.id), payload);
      console.log(`Reseeded ${agent.role}`);
      continue;
    }

    const current = existing.data();
    const patch: Record<string, unknown> = {};
    for (const field of ['discipline', 'riskLevel', 'standardsCoverage', 'executionModes', 'requiresHumanReview', 'version']) {
      if (current[field] === undefined && (payload as Record<string, unknown>)[field] !== undefined) {
        patch[field] = (payload as Record<string, unknown>)[field];
      }
    }

    if (Object.keys(patch).length) {
      await updateDoc(doc(db, 'agents', existing.id), patch);
      console.log(`Patched ${agent.role}: ${Object.keys(patch).join(', ')}`);
    }
  }

  console.log('Done');
  process.exit(0);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
