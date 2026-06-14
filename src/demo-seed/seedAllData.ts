// @ts-nocheck
/**
 * Master seed script for demo sandbox.
 * Writes all mock data under /demo/{userId}/ in Firestore.
 *
 * Every seed refreshes the ENTIRE sandbox — replacing projects, submissions,
 * messages, compliance checks, and CPD data. This means user changes since
 * last seed are LOST when reseeding. This is deliberate: the "Reset Sandbox
 * Data" button restores factory-fresh data.
 *
 * For persistence (user uploads, invoices, edits between reseeds):
 * See demoFirestore.ts — all real-time reads/writes transparently redirect
 * to /demo/{uid}/ so user changes persist across page reloads.
 *
 * Usage:
 *   npx tsx src/demo-seed/seedAllData.ts                     # seed all users
 *   npx tsx src/demo-seed/seedAllData.ts --uid=abc123        # seed specific user
 *   npx tsx src/demo-seed/seedAllData.ts --uid=abc123 --force  # replace existing
 */

import { db } from '../lib/firebase';
import { doc, writeBatch } from 'firebase/firestore';
import { MOCK_USERS, MOCK_USER_LIST } from './mockUsers';
import { MOCK_PROJECTS } from './mockProjects';
import { getSubmissionsForProject } from './mockSubmissions';
import { getMessagesForProject } from './mockMessages';
import { getComplianceForProject } from './mockCompliance';
import { mockCPDArticles, mockCPDAssessments, mockCPDLearningModules, mockCPDCertificates } from './mockCPD';

const BATCH_LIMIT = 500; // Firestore batch write limit

async function commitToBatch(
  db_instance: any,
  pendingWrites: Array<{ ref: any; data: any }>,
  currentBatch: any,
  count: number
): Promise<{ batch: any; count: number }> {
  let batch = currentBatch;
  let c = count;

  for (const w of pendingWrites) {
    batch.set(w.ref, w.data, { merge: true });
    c++;
    if (c >= BATCH_LIMIT) {
      await batch.commit();
      batch = writeBatch(db_instance);
      c = 0;
    }
  }
  return { batch, count: c };
}

async function seedUser(uid: string, force: boolean) {
  const prefix = `demo/${uid}`;
  let batch = writeBatch(db);
  let count = 0;
  const writes: Array<{ ref: any; data: any }> = [];

  const addWrite = (path: string, id: string, data: any) => {
    writes.push({ ref: doc(db, path, id), data });
  };

  // 1. Write all mock users
  for (const user of MOCK_USER_LIST) {
    addWrite(`${prefix}/users`, user.uid, user);
  }

  // 2. Write all mock projects
  for (const project of MOCK_PROJECTS) {
    addWrite(`${prefix}/projects`, project.id, project);

    // 3. Submissions per project
    const submissions = getSubmissionsForProject(project);
    for (const s of submissions) {
      addWrite(`${prefix}/projects/${project.id}/submissions`, s.id, s);
    }

    // 4. Messages per project
    const messages = getMessagesForProject(project);
    for (const m of messages) {
      addWrite(`${prefix}/projects/${project.id}/messages`, m.id, m);
    }

    // 5. Compliance checks per project
    const compliance = getComplianceForProject(project);
    for (const c of compliance) {
      addWrite(`${prefix}/projects/${project.id}/compliance`, c.id, c);
    }
  }

  // 6. CPD data — articles, assessments, learning modules, certificates
  for (const article of mockCPDArticles) {
    addWrite(`${prefix}/cpd/articles`, article.id, article);
  }
  for (const assessment of mockCPDAssessments) {
    addWrite(`${prefix}/cpd/assessments`, assessment.id, assessment);
  }
  for (const mod of mockCPDLearningModules) {
    addWrite(`${prefix}/cpd/learning-modules`, mod.id, mod);
  }
  for (const cert of mockCPDCertificates) {
    addWrite(`${prefix}/cpd/certificates`, cert.id, cert);
  }

  // Commit all writes in batches
  const result = await commitToBatch(db, writes, batch, count);
  if (result.count > 0) {
    await result.batch.commit();
  }

  // 7. Write seed flag (separate — lives at root level for easy check)
  const flagRef = doc(db, 'demo_seed_flags', uid);
  await writeBatch(db)
    .set(flagRef, {
      seeded: true,
      seededAt: new Date().toISOString(),
      projectCount: MOCK_PROJECTS.length,
      userCount: MOCK_USER_LIST.length,
      cpdArticleCount: mockCPDArticles.length,
      cpdAssessmentCount: mockCPDAssessments.length,
      cpdModuleCount: mockCPDLearningModules.length,
      force,
    }, { merge: true })
    .commit();

  console.log(`✅ Demo sandbox seeded for user ${uid}:`);
  console.log(`   - ${MOCK_USER_LIST.length} mock users`);
  console.log(`   - ${MOCK_PROJECTS.length} projects across all stages`);
  console.log(`   - Submissions, messages, compliance per project`);
  console.log(`   - ${mockCPDArticles.length} CPD articles`);
  console.log(`   - ${mockCPDAssessments.length} CPD assessments`);
  console.log(`   - ${mockCPDLearningModules.length} CPD learning modules`);
  console.log(`   - ${mockCPDCertificates.length} CPD certificates`);
  console.log(`   - All data under /demo/${uid}/`);
}

export async function seedUserSandbox(uid: string, force: boolean = false) {
  try {
    await seedUser(uid, force);
  } catch (err) {
    console.error(`❌ Seed failed for user ${uid}:`, err);
    throw err;
  }
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const uidArg = args.find(a => a.startsWith('--uid='));
  const force = args.includes('--force');

  const targetUids = uidArg
    ? [uidArg.split('=')[1]]
    : MOCK_USER_LIST.map(u => u.uid);

  (async () => {
    for (const uid of targetUids) {
      console.log(`Seeding user ${uid}...`);
      await seedUserSandbox(uid, force);
      console.log('');
    }
    console.log('Done!');
  })().catch(console.error);
}
