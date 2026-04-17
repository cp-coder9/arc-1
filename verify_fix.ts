import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

// Load credentials
const serviceAccount = JSON.parse(fs.readFileSync('./gen-lang-client-0880960511-firebase-adminsdk-fbsvc-52e9f670f8.json', 'utf8'));
const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = getFirestore(config.firestoreDatabaseId);

async function verifyKnowledgeMapping() {
  console.log('--- Verifying Knowledge Mapping ---');
  
  // 1. Check existing knowledge
  const knowledgeRef = db.collection('agent_knowledge');
  const snapshot = await knowledgeRef.limit(5).get();
  
  if (snapshot.empty) {
    console.log('No knowledge entries found. Creating a test entry for wall_checker...');
    await knowledgeRef.add({
      agentId: 'test-id',
      agentRole: 'wall_checker',
      title: 'Test Rule',
      content: 'Wall thickness must be 500mm in test environment.',
      status: 'active',
      source: 'human_feedback',
      createdAt: new Date().toISOString()
    });
    console.log('✅ Test entry created.');
  } else {
    console.log(`Found ${snapshot.size} entries.`);
    snapshot.forEach(doc => {
      const data = doc.data();
      console.log(`- [${data.agentRole}] ${data.title} (agentId: ${data.agentId})`);
    });
  }

  // 2. Query as the service would
  const testRole = 'wall_checker';
  const querySnapshot = await knowledgeRef
    .where("agentRole", "==", testRole)
    .where("status", "==", "active")
    .get();
    
  console.log(`Query for role "${testRole}" returned ${querySnapshot.size} results.`);
  if (querySnapshot.size > 0) {
    console.log('✅ Knowledge retrieval by role is working!');
  } else {
    console.log('❌ Knowledge retrieval by role returned 0 results. Checking if any exist with this role...');
    const allForRole = await knowledgeRef.where("agentRole", "==", testRole).get();
    console.log(`Total entries for role "${testRole}" (regardless of status): ${allForRole.size}`);
  }
}

verifyKnowledgeMapping().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
