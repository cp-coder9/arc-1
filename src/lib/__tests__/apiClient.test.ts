import { describe, expect, it, vi, afterEach } from 'vitest';

const originalWindow = globalThis.window;

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  if (originalWindow === undefined) {
    // @ts-expect-error test cleanup
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }
});

describe('apiClient deployment URL handling', () => {
  it('keeps relative API URLs when no static-host API base is configured', async () => {
    const { buildApiUrl } = await import('../apiClient');

    expect(buildApiUrl('/api/health')).toBe('/api/health');
    expect(buildApiUrl('/assets/index.js')).toBe('/assets/index.js');
  });

  it('routes relative /api calls to the configured API host without changing external URLs', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.architex.co.za/');
    const { buildApiUrl } = await import('../apiClient');

    expect(buildApiUrl('/api/auth/check-admin')).toBe('https://api.architex.co.za/api/auth/check-admin');
    expect(buildApiUrl('https://example.com/api/health')).toBe('https://example.com/api/health');
  });

  it('apiFetch delegates through buildApiUrl so static hosts do not return index.html for API calls', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.architex.co.za');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { apiFetch } = await import('../apiClient');
    await apiFetch('/api/health', { headers: { Accept: 'application/json' } });

    expect(fetchMock).toHaveBeenCalledWith('https://api.architex.co.za/api/health', expect.objectContaining({
      headers: { Accept: 'application/json' },
    }));
  });
});
