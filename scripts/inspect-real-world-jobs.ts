import dotenv from 'dotenv';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: false });

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY or FIREBASE_SERVICE_ACCOUNT is required');
  return JSON.parse(raw);
}

async function main() {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  const databaseId = process.env.VITE_FIREBASE_DATABASE_ID;
  if (!projectId) throw new Error('VITE_FIREBASE_PROJECT_ID is required');

  const app = getApps()[0] || initializeApp({ projectId, credential: cert(getServiceAccount()) });
  const db = databaseId && databaseId !== '(default)' ? getFirestore(app, databaseId) : getFirestore(app);

  const jobs = await db.collection('jobs').limit(25).get();
  const rows = await Promise.all(jobs.docs.map(async jobDoc => {
    const job = jobDoc.data();
    const files = await db.collection('uploaded_files').where('jobId', '==', jobDoc.id).get();
    const submissions = await jobDoc.ref.collection('submissions').get();
    const tasks = await jobDoc.ref.collection('tasks').get();
    return {
      id: jobDoc.id,
      title: job.title || null,
      status: job.status || null,
      clientId: job.clientId || null,
      selectedArchitectId: job.selectedArchitectId || null,
      jobId: job.jobId || null,
      referenceNumber: job.referenceNumber || null,
      fileCount: files.size,
      submissionCount: submissions.size,
      taskCount: tasks.size,
    };
  }));

  console.log(JSON.stringify(rows, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});