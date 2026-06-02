import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve('dist');
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.json', 'application/json'],
]);

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  let file = join(root, decodeURIComponent(url.pathname));
  if (url.pathname === '/' || !existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  res.setHeader('content-type', mime.get(extname(file)) || 'application/octet-stream');
  createReadStream(file).pipe(res);
});
await new Promise((resolveListen) => server.listen(4174, '127.0.0.1', resolveListen));
try {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:4174/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/tmp/architex-hero-alignment-fixed.png', fullPage: false });
  await browser.close();
  console.log('/tmp/architex-hero-alignment-fixed.png');
} finally {
  server.close();
}
