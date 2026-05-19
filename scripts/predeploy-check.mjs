#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'package.json',
  'server.ts',
  'api/index.ts',
  'src/lib/api-router.ts',
  'docs/deployment/shared-hosting-architex-co-za.md',
  '.env.production.example',
];

const requiredPackageScripts = ['build', 'start', 'lint', 'test'];
const requiredEnv = [
  'VITE_API_BASE_URL',
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_KEY',
  'BLOB_READ_WRITE_TOKEN',
];

const failures = [];
for (const file of requiredFiles) {
  if (!existsSync(resolve(root, file))) failures.push(`Missing required file: ${file}`);
}

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
for (const script of requiredPackageScripts) {
  if (!packageJson.scripts?.[script]) failures.push(`Missing package.json script: ${script}`);
}

if (!packageJson.engines?.node?.startsWith('20')) {
  failures.push('package.json should require Node 20.x for production parity.');
}

if (!existsSync(resolve(root, 'dist/index.html'))) {
  failures.push('dist/index.html is missing. Run npm run build before creating an upload bundle.');
}

if (failures.length > 0) {
  console.error('Predeploy check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  console.error('\nRequired production environment variables:');
  for (const env of requiredEnv) console.error(`- ${env}`);
  process.exit(1);
}

console.log('Predeploy check passed.');
console.log('Required production environment variables:');
for (const env of requiredEnv) console.log(`- ${env}`);
