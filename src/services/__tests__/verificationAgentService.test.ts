import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn(),
  },
}));

vi.mock('../sacapVerificationService', () => ({
  verifySACAPByName: vi.fn(async () => ({
    verified: true,
    registrationDetails: {
      firstName: 'Architect',
      lastName: 'One',
      category: 'Professional Architect',
      registrationNumber: 'SACAP-123',
    },
  })),
}));

describe('verificationAgentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs SACAP through the browser-agent path and verifies matching register details', async () => {
    const { runVerificationBrowserAgent } = await import('../verificationAgentService');
    const result = await runVerificationBrowserAgent({
      subjectType: 'bep',
      statutoryBody: 'SACAP',
      registrationNumber: 'SACAP-123',
      displayName: 'Architect One',
    });

    expect(result).toMatchObject({
      provider: 'sacap',
      status: 'verified',
      source: 'automated_browser_agent',
      requiresHumanReview: false,
      officialUrl: expect.stringContaining('search.mymembership.co.za'),
    });
  });

  it('does not simulate results when required search data is missing', async () => {
    const { runVerificationBrowserAgent } = await import('../verificationAgentService');
    const result = await runVerificationBrowserAgent({ subjectType: 'bep', statutoryBody: 'SACAP' });
    expect(result.status).toBe('pending');
    expect(result.requiresHumanReview).toBe(true);
    expect(result.error).toContain('display name');
  });
});
