import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./gen-lang-client-0880960511-firebase-adminsdk-fbsvc-52e9f670f8.json', 'utf8'));
const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = getFirestore(config.firestoreDatabaseId);

// Known vision models for OpenAI-compatible providers (NVIDIA/OpenRouter/etc)
// We'll prefer llama-3.2-90b-vision-instruct if using NVIDIA
const PREFERRED_VISION_MODEL = "meta/llama-3.2-90b-vision-instruct";

async function fixAgents() {
  console.log('--- Fixing Agent Model Configurations ---');
  const agentsRef = db.collection('agents');
  const snapshot = await agentsRef.get();
  
  if (snapshot.empty) {
    console.log('No agents found.');
    return;
  }

  for (const doc of snapshot.docs) {
    const agent = doc.data();
    console.log(`Checking Agent: ${agent.name} (ID: ${doc.id})`);
    
    const updates: any = {};
    
    // 1. Ensure provider is explicitly set if it was 'global' but we want to stick to a stable provider
    // Actually, setting to 'global' is fine if the global config is correct.
    
    // 2. If the agent is using a known non-vision model, update it
    const currentModel = agent.llmModel || '';
    if (currentModel.includes('minimax') || currentModel === 'llama-3.1-405b') {
       console.log(`  Updating model from ${currentModel} to ${PREFERRED_VISION_MODEL}`);
       updates.llmModel = PREFERRED_VISION_MODEL;
    }

    // 3. Ensure temperature is appropriate for compliance (low)
    if (agent.temperature === undefined || agent.temperature > 0.3) {
      console.log(`  Updating temperature to 0.1`);
      updates.temperature = 0.1;
    }

    if (Object.keys(updates).length > 0) {
      await doc.ref.update(updates);
      console.log(`  ✅ Updated ${agent.name}`);
    } else {
      console.log(`  ✨ ${agent.name} looks good.`);
    }
  }
}

fixAgents().then(() => {
  console.log('--- Maintenance Complete ---');
  process.exit(0);
}).catch(err => {
  console.error('Maintenance failed:', err);
  process.exit(1);
});
