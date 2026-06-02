#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const vitestBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'vitest.cmd' : 'vitest');
const userArgs = process.argv.slice(2).filter(arg => arg !== '--run');
const reporterArgs = userArgs.some(arg => arg.startsWith('--reporter')) ? [] : ['--reporter=dot'];

function collectTests(dir) {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectTests(fullPath);
    if (/\.emulator\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name)) return [];
    return /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

function rel(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

function runVitest(label, environment, testFiles) {
  if (testFiles.length === 0) return;
  console.log(`\n[tests] ${label}: ${testFiles.length} file(s) in ${environment} environment`);
  const result = spawnSync(
    vitestBin,
    ['run', '--environment', environment, ...reporterArgs, ...testFiles, ...userArgs],
    { stdio: 'inherit', cwd: root, env: process.env },
  );

  if (result.error) {
    console.error(`[tests] Failed to start ${label}:`, result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const serviceTests = collectTests(path.join(root, 'src/services/__tests__')).map(rel);
const messagingServiceTest = 'src/services/__tests__/messagingService.test.ts';
const nodeTests = [
  ...collectTests(path.join(root, 'src/lib')).map(rel),
  ...serviceTests.filter(file => file !== messagingServiceTest),
  'src/test/schemas.test.ts',
].filter((file, index, all) => existsSync(path.join(root, file)) && all.indexOf(file) === index);

const browserTests = [
  ...collectTests(path.join(root, 'src/components')).map(rel),
  ...collectTests(path.join(root, 'src/test/integration')).map(rel),
  messagingServiceTest,
].filter((file, index, all) => existsSync(path.join(root, file)) && all.indexOf(file) === index);

runVitest('domain and API tests', 'node', nodeTests);
runVitest('component and browser-dependent tests', 'jsdom', browserTests);
