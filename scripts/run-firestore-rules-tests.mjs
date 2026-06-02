#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const localJre = '/tmp/jre21';
const env = { ...process.env };

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: root,
    stdio: options.stdio ?? 'pipe',
    encoding: 'utf8',
    env,
  });
}

function detectJava() {
  const which = run('bash', ['-lc', 'command -v java || true']);
  return which.stdout.trim();
}

let javaPath = detectJava();
if ((!javaPath || javaPath.includes('/.local/bin/java')) && existsSync(path.join(localJre, 'bin', 'java'))) {
  env.JAVA_HOME = localJre;
  env.PATH = `${path.join(localJre, 'bin')}:${env.PATH ?? ''}`;
  javaPath = detectJava();
}

if (!javaPath) {
  console.error('[firestore-rules] No Java runtime found. Install OpenJDK 21 or set JAVA_HOME before running emulator tests.');
  process.exit(1);
}

const version = run('java', ['-version']);
const versionOutput = `${version.stderr || ''}${version.stdout || ''}`.trim();
if (version.status !== 0) {
  console.error('[firestore-rules] Java runtime failed to execute.');
  console.error(versionOutput);
  process.exit(version.status ?? 1);
}

console.log(`[firestore-rules] Using Java: ${javaPath}`);
console.log(versionOutput.split('\n').slice(0, 2).join('\n'));

const firebaseBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'firebase.cmd' : 'firebase');
const vitestBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'vitest.cmd' : 'vitest');
const result = spawnSync(firebaseBin, [
  'emulators:exec',
  '--only', 'firestore',
  '--project', 'architex-rules-test',
  `${vitestBin} run --config vitest.emulator.config.ts --reporter=dot`,
], {
  cwd: root,
  stdio: 'inherit',
  env,
});

if (result.error) {
  console.error('[firestore-rules] Failed to run emulator tests:', result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
