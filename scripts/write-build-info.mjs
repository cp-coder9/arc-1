#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

function gitValue(args, fallback = null) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) return fallback;
  const value = result.stdout.trim();
  return value || fallback;
}

const commit = process.env.VERCEL_GIT_COMMIT_SHA
  || process.env.GITHUB_SHA
  || process.env.COMMIT_SHA
  || gitValue(['rev-parse', 'HEAD'], 'unknown');

const branch = process.env.VERCEL_GIT_COMMIT_REF
  || process.env.GITHUB_REF_NAME
  || process.env.BRANCH_NAME
  || gitValue(['rev-parse', '--abbrev-ref', 'HEAD'], 'unknown');

const buildInfo = {
  name: packageJson.name,
  version: packageJson.version,
  commit,
  shortCommit: commit === 'unknown' ? 'unknown' : commit.slice(0, 12),
  branch,
  builtAt: new Date().toISOString(),
  node: process.version,
};

const publicPath = resolve(root, 'public', 'build-info.json');
mkdirSync(dirname(publicPath), { recursive: true });
writeFileSync(publicPath, JSON.stringify(buildInfo, null, 2) + '\n');
console.log(`Wrote public/build-info.json (${buildInfo.shortCommit}, ${buildInfo.builtAt})`);
