import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import fs from 'fs';
import { SPECIALIZED_AGENTS } from '../src/services/geminiService';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

const agentByRole = new Map(SPECIALIZED_AGENTS.map(agent => [agent.role, agent]));

async function migrateAgents() {
  const snap = await getDocs(collection(db, 'agents'));
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const def = agentByRole.get(data.role);
    if (!def) continue;

    const patch: Record<string, unknown> = {};
    for (const field of ['discipline', 'riskLevel', 'executionModes', 'standardsCoverage', 'requiresHumanReview', 'version']) {
      if (data[field] === undefined && (def as Record<string, unknown>)[field] !== undefined) {
        patch[field] = (def as Record<string, unknown>)[field];
      }
    }

    if (Object.keys(patch).length) {
      await updateDoc(doc(db, 'agents', docSnap.id), patch);
      console.log(`Migrated agent ${data.role}: ${Object.keys(patch).join(', ')}`);
    }
  }
}

async function migrateKnowledge() {
  const snap = await getDocs(collection(db, 'agent_knowledge'));
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    if (data.discipline) continue;
    const def = agentByRole.get(data.agentRole);
    const discipline = def?.discipline || 'documentation';
    await updateDoc(doc(db, 'agent_knowledge', docSnap.id), { discipline });
    console.log(`Backfilled knowledge ${docSnap.id} discipline=${discipline}`);
  }
}

async function run() {
  await migrateAgents();
  await migrateKnowledge();
  console.log('Migration complete');
  process.exit(0);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
