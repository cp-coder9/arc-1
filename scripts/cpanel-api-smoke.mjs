#!/usr/bin/env node
const baseUrl = (process.argv[2] || process.env.API_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 10000);

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { accept: 'application/json', ...(options.headers || {}) },
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`${path} returned non-JSON ${response.status} ${contentType}: ${text.slice(0, 120)}`);
    }
    return { response, contentType, body };
  } finally {
    clearTimeout(timer);
  }
}

const failures = [];

try {
  const { response, contentType, body } = await request('/api/health');
  if (!response.ok) failures.push(`/api/health expected 2xx, got ${response.status}`);
  if (!contentType.includes('application/json')) failures.push(`/api/health expected JSON content-type, got ${contentType}`);
  if (body?.status !== 'ok') failures.push(`/api/health expected status ok, got ${JSON.stringify(body)}`);
} catch (error) {
  failures.push(`/api/health failed: ${error instanceof Error ? error.message : String(error)}`);
}

try {
  const { response, contentType, body } = await request('/api/auth/check-admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (![401, 500].includes(response.status)) failures.push(`/api/auth/check-admin unauthenticated expected JSON 401 or dependency 500, got ${response.status}`);
  if (!contentType.includes('application/json')) failures.push(`/api/auth/check-admin expected JSON content-type, got ${contentType}`);
  if (!body || typeof body !== 'object' || !('error' in body)) failures.push(`/api/auth/check-admin expected JSON error body, got ${JSON.stringify(body)}`);
} catch (error) {
  failures.push(`/api/auth/check-admin failed: ${error instanceof Error ? error.message : String(error)}`);
}

if (failures.length) {
  console.error(`Smoke checks failed for ${baseUrl}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Smoke checks passed for ${baseUrl}`);
