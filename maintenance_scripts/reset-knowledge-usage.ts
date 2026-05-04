/**
 * Backfill script: Reset usageCount to 0 for agent_knowledge documents where usageCount is not a number.
 *
 * Run with: npx tsx maintenance_scripts/reset-knowledge-usage.ts
 */

import { adminDb } from '../src/lib/firebase-admin.js';

async function backfill() {
  console.log('Starting knowledge usage backfill...');

  try {
    const snapshot = await adminDb.collection('agent_knowledge').get();
    console.log(`Found ${snapshot.docs.length} agent_knowledge documents`);
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const usageCount = data.usageCount;
      // If usageCount is not a number (e.g., Timestamp, undefined, or other type), reset to 0
if (typeof usageCount !== 'number') {
 try {
 await docSnap.ref.update({
 usageCount: 0
 });
 updated++;
 console.log(`Reset usageCount for document ${docSnap.id}`);
 } catch (err) {
 errors++;
 console.error(`Failed to update ${docSnap.id}:`, err);
 }
      } else {
        skipped++;
      }
    }

    console.log(`Backfill complete: ${updated} updated, ${skipped} skipped, ${errors} errors`);
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  }
}

backfill().catch(console.error);