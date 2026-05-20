import { describe, expect, it, vi, afterEach } from 'vitest';

const originalWindow = globalThis.window;

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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

  it('auto-routes test.architex.co.za /api calls to the owned API host when build-time config is absent', async () => {
    vi.stubGlobal('window', {
      location: {
        hostname: 'test.architex.co.za',
        origin: 'https://test.architex.co.za',
      },
    });
    const { buildApiUrl, getApiBaseUrl } = await import('../apiClient');

    expect(getApiBaseUrl()).toBe('https://api.architex.co.za');
    expect(buildApiUrl('/api/health')).toBe('https://api.architex.co.za/api/health');
    expect(buildApiUrl('https://test.architex.co.za/api/health?check=1#top')).toBe('https://api.architex.co.za/api/health?check=1#top');
  });

  it('does not rewrite same-origin absolute asset URLs on the test site', async () => {
    vi.stubGlobal('window', {
      location: {
        hostname: 'test.architex.co.za',
        origin: 'https://test.architex.co.za',
      },
    });
    const { buildApiUrl } = await import('../apiClient');

    expect(buildApiUrl('https://test.architex.co.za/assets/index.js')).toBe('https://test.architex.co.za/assets/index.js');
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

  it('apiFetch rewrites Request instances while preserving method and headers', async () => {
    vi.stubGlobal('window', {
      location: {
        hostname: 'test.architex.co.za',
        origin: 'https://test.architex.co.za',
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { apiFetch } = await import('../apiClient');
    await apiFetch(new Request('https://test.architex.co.za/api/health', {
      method: 'POST',
      headers: { 'X-Test': 'yes' },
    }));

    const rewrittenRequest = fetchMock.mock.calls[0][0] as Request;
    expect(rewrittenRequest.url).toBe('https://api.architex.co.za/api/health');
    expect(rewrittenRequest.method).toBe('POST');
    expect(rewrittenRequest.headers.get('X-Test')).toBe('yes');
  });
});
