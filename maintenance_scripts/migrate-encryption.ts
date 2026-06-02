/**
 * Migration script: Convert existing municipal_credentials encryption to per-document salt.
 *
 * This script reads all municipal_credentials documents that have encryptedPassword but missing salt,
 * decrypts with the legacy constant salt, then re-encrypts with a fresh random salt and writes back.
 *
 * Run with: npx tsx maintenance_scripts/migrate-encryption.ts
 */

import { adminDb } from '../src/lib/firebase-admin.js';
import { decrypt, encrypt } from '../src/lib/encryption.js';

async function migrate() {
  console.log('Starting encryption migration...');
  
  try {
    const snapshot = await adminDb.collection('municipal_credentials').get();
    console.log(`Found ${snapshot.docs.length} credentials documents`);
    
    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const { encryptedPassword, iv, authTag, salt } = data;
      
      // Skip if already has salt
      if (salt) {
        skipped++;
        continue;
      }
      
      // Must have the legacy fields
      if (!encryptedPassword || !iv || !authTag) {
        skipped++;
        continue;
      }
      
      try {
        // Decrypt with legacy constant salt (fallback)
        const plaintext = decrypt(encryptedPassword, iv, authTag);
        
        // Encrypt with new random salt
        const { encrypted, iv: newIv, authTag: newAuthTag, salt: newSalt } = encrypt(plaintext);
        
        // Update document with new encryption fields
        await doc.ref.update({
          encryptedPassword: encrypted,
          iv: newIv,
          authTag: newAuthTag,
          salt: newSalt
        });
        
        migrated++;
        console.log(`Migrated credential ${doc.id} for user ${data.userId}`);
      } catch (err) {
        errors++;
        console.error(`Failed to migrate ${doc.id}:`, err.message);
      }
    }
    
    console.log(`Migration complete: ${migrated} migrated, ${skipped} skipped, ${errors} errors`);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate().catch(console.error);