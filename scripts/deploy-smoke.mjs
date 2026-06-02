#!/usr/bin/env node
const target = process.argv[2] || process.env.SMOKE_BASE_URL || 'https://test.architex.co.za';
const apiBase = process.env.SMOKE_API_BASE_URL || target;
const includeApi = process.env.SMOKE_INCLUDE_API === '1' || process.env.SMOKE_INCLUDE_API === 'true' || process.argv.includes('--include-api');
const publicRoutes = (process.env.SMOKE_PUBLIC_ROUTES || '/,/login')
  .split(',')
  .map((route) => route.trim())
  .filter(Boolean);

function absoluteUrl(base, path) {
  return new URL(path, base.endsWith('/') ? base : base + '/').toString();
}

async function fetchOk(url, options = {}) {
  const response = await fetch(url, { redirect: 'follow', ...options });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response;
}

function extractAssetPaths(html) {
  const paths = new Set();
  const patterns = [
    /<script[^>]+src=["']([^"']+)["'][^>]*>/gi,
    /<link[^>]+href=["']([^"']+)["'][^>]*>/gi,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const path = match[1];
      if (path.startsWith('http') || path.startsWith('//')) continue;
      if (path.includes('/assets/') || /\.(js|css)$/i.test(path)) paths.add(path);
    }
  }
  return [...paths];
}

async function main() {
  const checks = [];
  const homeUrl = absoluteUrl(target, '/');
  const htmlResponse = await fetchOk(homeUrl);
  const html = await htmlResponse.text();
  if (!html.includes('id="root"')) throw new Error('HTML does not contain #root mount point');
  if (!html.includes('type="module"')) throw new Error('HTML does not reference a module script for hydration');
  checks.push(`HTML loaded and contains root/module script: ${homeUrl}`);

  const assets = extractAssetPaths(html);
  if (assets.length === 0) throw new Error('No JS/CSS asset references found in HTML');
  await Promise.all(assets.map(async (assetPath) => {
    await fetchOk(absoluteUrl(target, assetPath));
  }));
  checks.push(`Assets returned 200: ${assets.length}`);

  const buildInfoResponse = await fetchOk(absoluteUrl(target, '/build-info.json'), {
    headers: { accept: 'application/json' },
  });
  const buildInfo = await buildInfoResponse.json();
  for (const key of ['version', 'commit', 'builtAt']) {
    if (!buildInfo[key]) throw new Error(`build-info.json is missing ${key}`);
  }
  checks.push(`Build info available: ${buildInfo.version} ${buildInfo.shortCommit || buildInfo.commit}`);

  for (const route of publicRoutes) {
    const routeResponse = await fetchOk(absoluteUrl(target, route));
    const routeHtml = await routeResponse.text();
    if (!routeHtml.includes('id="root"')) throw new Error(`${route} did not return SPA HTML with #root`);
  }
  checks.push(`Public SPA routes returned shell: ${publicRoutes.join(', ')}`);

  if (includeApi) {
    const apiHealthResponse = await fetchOk(absoluteUrl(apiBase, '/api/health'), {
      headers: { accept: 'application/json' },
    });
    const apiHealth = await apiHealthResponse.json();
    if (apiHealth.status !== 'ok') throw new Error('/api/health did not return status=ok');
    checks.push(`API health responded: ${absoluteUrl(apiBase, '/api/health')}`);
  } else {
    checks.push('API health skipped for static frontend smoke; set SMOKE_INCLUDE_API=1 to enable');
  }

  console.log('Deploy smoke passed');
  for (const check of checks) console.log(`- ${check}`);
}

main().catch((error) => {
  console.error('Deploy smoke failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
