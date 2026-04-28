import crypto from 'crypto';

// Validate encryption key at module load
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  throw new Error('ENCRYPTION_KEY environment variable must be set and at least 32 characters long');
}

const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypt text using AES-256-GCM with a per-document random salt.
 * Returns encrypted data, IV, auth tag, and salt (all hex strings).
 */
export function encrypt(text: string): { encrypted: string; iv: string; authTag: string; salt: string } {
  const iv = crypto.randomBytes(16);
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, salt, 32);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag,
    salt: salt.toString('hex')
  };
}

/**
 * Decrypt text using AES-256-GCM with the provided salt.
 * Expects encrypted, ivHex, authTagHex, and saltHex as hex strings.
 * For backward compatibility, if saltHex is omitted, uses constant 'salt' (insecure).
 */
export function decrypt(
  encrypted: string, 
  ivHex: string, 
  authTagHex: string, 
  saltHex?: string
): string {
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : Buffer.from('salt', 'utf8');
  const key = crypto.scryptSync(ENCRYPTION_KEY, salt, 32);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
