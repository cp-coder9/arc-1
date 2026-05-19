const API_PATH_PREFIX = '/api';

function readConfiguredApiBaseUrl(): string {
  const viteBase = import.meta.env?.VITE_API_BASE_URL;
  const processBase = typeof process !== 'undefined' ? process.env?.VITE_API_BASE_URL : undefined;
  return String(viteBase || processBase || '').trim().replace(/\/$/, '');
}

function isAbsoluteUrl(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//');
}

function isApiPath(value: string): boolean {
  return value === API_PATH_PREFIX || value.startsWith(`${API_PATH_PREFIX}/`);
}

export function getApiBaseUrl(): string {
  return readConfiguredApiBaseUrl();
}

export function buildApiUrl(input: string): string {
  if (!input || isAbsoluteUrl(input) || !isApiPath(input)) return input;
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) return input;
  return `${apiBaseUrl}${input}`;
}

export function apiFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  if (typeof input === 'string') return fetch(buildApiUrl(input), init);
  if (input instanceof URL) return fetch(input, init);
  return fetch(input, init);
}
