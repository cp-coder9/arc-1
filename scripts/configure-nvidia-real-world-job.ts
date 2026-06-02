import dotenv from 'dotenv';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: false });

const JOB_ID = process.env.JOB_ID || '117847582';
const NVIDIA_MODEL = process.env.NVIDIA_MODEL || 'meta/llama-3.2-90b-vision-instruct';
const NVIDIA_BASE_URL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY or FIREBASE_SERVICE_ACCOUNT is required');
  return JSON.parse(raw);
}

async function main() {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  const databaseId = process.env.VITE_FIREBASE_DATABASE_ID;
  if (!projectId) throw new Error('VITE_FIREBASE_PROJECT_ID is required');
  if (!process.env.NVIDIA_API_KEY && !process.env.NVIDIA_NIM_API_KEY) {
    throw new Error('NVIDIA_API_KEY or NVIDIA_NIM_API_KEY is required for real Nvidia LLM calls');
  }

  const app = getApps()[0] || initializeApp({ projectId, credential: cert(getServiceAccount()) });
  const db = databaseId && databaseId !== '(default)' ? getFirestore(app, databaseId) : getFirestore(app);

  await db.collection('system_settings').doc('llm_config').set({
    provider: 'nvidia',
    model: NVIDIA_MODEL,
    baseUrl: NVIDIA_BASE_URL,
    apiKey: 'env:NVIDIA_API_KEY',
    updatedAt: new Date().toISOString(),
    updatedBy: 'scripts/configure-nvidia-real-world-job.ts',
  }, { merge: true });

  const agents = await db.collection('agents').get();
  const batch = db.batch();
  agents.docs.forEach(agentDoc => {
    batch.set(agentDoc.ref, {
      llmProvider: 'nvidia',
      llmModel: NVIDIA_MODEL,
      llmBaseUrl: NVIDIA_BASE_URL,
      llmApiKey: 'env:NVIDIA_API_KEY',
      status: 'online',
      currentActivity: 'Ready for real drawing review',
      lastActive: new Date().toISOString(),
    }, { merge: true });
  });
  await batch.commit();

  let jobSnap = await db.collection('jobs').doc(JOB_ID).get();
  if (!jobSnap.exists) {
    const byLegacyId = await db.collection('jobs').where('jobId', '==', JOB_ID).limit(1).get();
    const byReference = await db.collection('jobs').where('referenceNumber', '==', JOB_ID).limit(1).get();
    jobSnap = byLegacyId.docs[0] || byReference.docs[0] || jobSnap;
  }
  if (!jobSnap.exists) {
    const recent = await db.collection('jobs').limit(10).get();
    throw new Error(`Job ${JOB_ID} not found in Firestore. Recent job ids: ${recent.docs.map(d => d.id).join(', ') || 'none'}`);
  }
  const resolvedJobId = jobSnap.id;
  const job = jobSnap.data() || {};

  const filesSnap = await db.collection('uploaded_files').where('jobId', 'in', Array.from(new Set([JOB_ID, resolvedJobId])).slice(0, 10)).get();
  const submissionsSnap = await db.collection('jobs').doc(resolvedJobId).collection('submissions').get();
  const tasksSnap = await db.collection('jobs').doc(resolvedJobId).collection('tasks').get();

  console.log(JSON.stringify({
    ok: true,
    requestedJobId: JOB_ID,
    resolvedJobId,
    jobTitle: job.title,
    selectedArchitectId: job.selectedArchitectId || null,
    clientId: job.clientId || null,
    nvidia: { provider: 'nvidia', model: NVIDIA_MODEL, baseUrl: NVIDIA_BASE_URL },
    agentCountUpdated: agents.size,
    projectLinkedFiles: filesSnap.docs.map(d => ({ id: d.id, fileName: d.data().fileName, url: d.data().url, uploadedBy: d.data().uploadedBy })),
    submissions: submissionsSnap.docs.map(d => ({ id: d.id, drawingName: d.data().drawingName, status: d.data().status })),
    teamTasks: tasksSnap.docs.map(d => ({ id: d.id, assigneeName: d.data().assigneeName, assigneeRole: d.data().assigneeRole, status: d.data().status })),
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});