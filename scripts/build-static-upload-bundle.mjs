#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const distDir = resolve(root, 'dist');
const releaseDir = resolve(root, 'release');
const uploadDir = resolve(releaseDir, 'ftp-upload');
const bundlePath = resolve(releaseDir, 'architex-co-za-upload-bundle.tgz');
const requiredDistFiles = ['index.html', '.htaccess'];

function fail(message) {
  console.error('Static upload bundle failed: ' + message);
  process.exit(1);
}

if (!existsSync(distDir)) fail('dist directory is missing; build static assets first.');
for (const file of requiredDistFiles) {
  if (!existsSync(resolve(distDir, file))) fail('dist/' + file + ' is missing; ensure public/' + file + ' is copied by Vite.');
}

mkdirSync(releaseDir, { recursive: true });
rmSync(uploadDir, { recursive: true, force: true });
cpSync(distDir, uploadDir, { recursive: true, force: true, verbatimSymlinks: true });

for (const file of requiredDistFiles) {
  if (!existsSync(resolve(uploadDir, file))) fail('release/ftp-upload/' + file + ' was not created.');
}

const tar = spawnSync('tar', ['-czf', bundlePath, '-C', releaseDir, 'ftp-upload'], { stdio: 'inherit' });
if (tar.status !== 0) fail('tar command failed');

console.log('Created ' + uploadDir);
console.log('Created ' + bundlePath);
