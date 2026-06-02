#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const apiReferencePath = path.join('docs', 'backend', 'api-reference.md');
const backendDocsDir = path.join('docs', 'backend');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function extractDocumentedRoutes(apiReference) {
  return [...apiReference.matchAll(/`(GET|POST|PUT|PATCH|DELETE) ([^`]+)`/g)].map((match) => `${match[1]} ${match[2]}`);
}

function normalizeMountedRoute(route) {
  return route.replace(/^([^ ]+) /, '$1 /api');
}

function shouldRequireDedicatedContract(route) {
  // Legacy/global municipal routes are summarized in the API reference table and are
  // intentionally delegated to existing operational services. Project-scoped
  // municipal routes and the explicit tracking helper are covered by deterministic
  // examples and should remain checked.
  if (route.includes('/municipal/') && !route.includes('/projects/') && route !== 'POST /track-municipality') return false;
  return true;
}

function main() {
  const apiReference = readText(apiReferencePath);
  const routes = extractDocumentedRoutes(apiReference);
  const contractFiles = fs
    .readdirSync(backendDocsDir)
    .filter((file) => file.includes('contract-examples') && file.endsWith('.md'))
    .sort()
    .map((file) => path.join(backendDocsDir, file));

  const contractTexts = contractFiles.map((filePath) => ({ filePath, text: readText(filePath) }));
  let jsonBlocks = 0;

  for (const { filePath, text } of contractTexts) {
    for (const block of text.matchAll(/```json\n([\s\S]*?)\n```/g)) {
      try {
        JSON.parse(block[1]);
      } catch (error) {
        throw new Error(`${filePath} has invalid JSON example block ${jsonBlocks + 1}: ${error.message}`);
      }
      jsonBlocks += 1;
    }
  }

  const uncovered = [];
  for (const route of routes) {
    if (!shouldRequireDedicatedContract(route)) continue;
    const mountedRoute = normalizeMountedRoute(route);
    const covered = contractTexts.some(({ text }) => text.includes(route) || text.includes(mountedRoute));
    if (!covered) uncovered.push(route);
  }

  console.log(`Routes mentioned: ${routes.length}`);
  console.log(`Contract docs: ${contractFiles.length}`);
  console.log(`JSON blocks validated: ${jsonBlocks}`);

  if (uncovered.length > 0) {
    console.error('Uncovered documented routes requiring deterministic contract examples:');
    for (const route of [...new Set(uncovered)]) console.error(`- ${route}`);
    process.exit(1);
  }

  console.log('Uncovered documented routes requiring deterministic contract examples: none');
}

main();
