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

  it('matches SACAP registration numbers case-insensitively against official register details', async () => {
    const { runVerificationBrowserAgent } = await import('../verificationAgentService');
    const result = await runVerificationBrowserAgent({
      subjectType: 'bep',
      statutoryBody: 'SACAP',
      registrationNumber: ' sacap-123 ',
      displayName: 'Architect One',
    });

    expect(result).toMatchObject({
      provider: 'sacap',
      status: 'verified',
      requiresHumanReview: false,
      details: { registrationMatches: true },
    });
  });

  it('does not simulate results when required search data is missing', async () => {
    const { runVerificationBrowserAgent } = await import('../verificationAgentService');
    const result = await runVerificationBrowserAgent({ subjectType: 'bep', statutoryBody: 'SACAP' });
    expect(result.status).toBe('pending');
    expect(result.requiresHumanReview).toBe(true);
    expect(result.error).toContain('display name');
  });

  it('routes ECSA checks through the configured public-register provider', async () => {
    const { chromium } = await import('playwright');
    const { runVerificationBrowserAgent } = await import('../verificationAgentService');
    const result = await runVerificationBrowserAgent({ subjectType: 'bep', statutoryBody: 'ECSA' });

    expect(result).toMatchObject({
      provider: 'ecsa',
      status: 'pending',
      source: 'automated_browser_agent',
      officialUrl: expect.stringContaining('ecsa.co.za'),
      requiresHumanReview: true,
      error: expect.stringContaining('registration number'),
    });
    expect(chromium.launch).not.toHaveBeenCalled();
  });

  it('classifies clear official no-record text as rejected without human review', async () => {
    const { assessVerificationRegisterText } = await import('../verificationAgentService');

    expect(assessVerificationRegisterText('No record found for CIDB-404', 'CIDB-404')).toEqual({
      status: 'rejected',
      requiresHumanReview: false,
    });
  });

  it('matches official register numbers despite punctuation or spacing differences', async () => {
    const { assessVerificationRegisterText } = await import('../verificationAgentService');

    expect(assessVerificationRegisterText('Registered person: SACAP 123, active', 'SACAP-123')).toEqual({
      status: 'verified',
      requiresHumanReview: false,
    });

    expect(assessVerificationRegisterText('Contractor registration CIDB/2024/0007 is active', 'CIDB-2024-0007')).toEqual({
      status: 'verified',
      requiresHumanReview: false,
    });
  });

  it('keeps ambiguous official register text pending for human review', async () => {
    const { assessVerificationRegisterText } = await import('../verificationAgentService');

    expect(assessVerificationRegisterText('The register is temporarily unavailable. Try again later.', 'CIDB-123')).toEqual({
      status: 'pending',
      requiresHumanReview: true,
    });
  });
});
