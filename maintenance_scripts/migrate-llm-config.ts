/**
 * Migration script: Move LLM config from 'settings/llm_config' to 'system_settings/llm_config'.
 *
 * Run with: npx tsx maintenance_scripts/migrate-llm-config.ts
 */

import { db } from '../src/lib/firebase.js';
import { doc, getDoc, setDoc } from 'firebase/firestore';

async function migrate() {
  console.log('Starting LLM config migration...');

  try {
    const oldRef = doc(db, 'settings', 'llm_config');
    const newRef = doc(db, 'system_settings', 'llm_config');

    const oldSnap = await getDoc(oldRef);
    if (!oldSnap.exists()) {
      console.log('No LLM config found at settings/llm_config. Nothing to migrate.');
      return;
    }

    const data = oldSnap.data();
    await setDoc(newRef, data);
    console.log('Migrated LLM config to system_settings/llm_config');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate().catch(console.error);