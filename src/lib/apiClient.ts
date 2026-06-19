const API_PATH_PREFIX = '/api';
const TEST_SITE_HOST = 'test.architex.co.za';
const DEFAULT_TEST_SITE_API_BASE_URL = 'https://api.architex.co.za';

function readConfiguredApiBaseUrl(): string {
  const viteBase = import.meta.env?.VITE_API_BASE_URL;
  return String(viteBase || '').trim().replace(/\/$/, '');
}

function readBrowserApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  if (window.location.hostname === TEST_SITE_HOST) return DEFAULT_TEST_SITE_API_BASE_URL;
  return '';
}

function isAbsoluteUrl(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//');
}

function isApiPath(value: string): boolean {
  return value === API_PATH_PREFIX || value.startsWith(`${API_PATH_PREFIX}/`);
}

function getCurrentOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

function isSameOriginApiUrl(value: string): boolean {
  const currentOrigin = getCurrentOrigin();
  if (!currentOrigin || value.startsWith('//')) return false;
  try {
    const url = new URL(value);
    return url.origin === currentOrigin && isApiPath(url.pathname);
  } catch {
    return false;
  }
}

export function getApiBaseUrl(): string {
  return readConfiguredApiBaseUrl() || readBrowserApiBaseUrl();
}

export function buildApiUrl(input: string): string {
  if (!input) return input;

  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) return input;

  if (isApiPath(input)) return `${apiBaseUrl}${input}`;

  if (isAbsoluteUrl(input) && isSameOriginApiUrl(input)) {
    const url = new URL(input);
    return `${apiBaseUrl}${url.pathname}${url.search}${url.hash}`;
  }

  return input;
}

export function apiFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  if (typeof input === 'string') return fetch(buildApiUrl(input), init);

  if (input instanceof URL) {
    return fetch(buildApiUrl(input.toString()), init);
  }

  const rewrittenUrl = buildApiUrl(input.url);
  if (rewrittenUrl !== input.url) return fetch(new Request(rewrittenUrl, input), init);
  return fetch(input, init);
}
