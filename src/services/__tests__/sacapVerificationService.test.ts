import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chromium } from 'playwright';
import { verifySACAPByName, verifySACAPRegistration } from '../sacapVerificationService';

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn(),
  },
}));

const launchMock = vi.mocked(chromium.launch);

function createBrowserMock(results: string[][] = []) {
  const page = {
    setDefaultTimeout: vi.fn(),
    goto: vi.fn(async () => undefined),
    fill: vi.fn(async () => undefined),
    click: vi.fn(async () => undefined),
    waitForSelector: vi.fn(async () => undefined),
    $$eval: vi.fn(async () => results),
  };
  const browser = {
    newPage: vi.fn(async () => page),
    close: vi.fn(async () => undefined),
  };

  launchMock.mockResolvedValue(browser as Awaited<ReturnType<typeof chromium.launch>>);

  return { browser, page };
}

describe('sacapVerificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('rejects missing or too-short names before launching Playwright', async () => {
    await expect(verifySACAPRegistration('A', 'Smith')).resolves.toEqual({
      verified: false,
      error: 'First name and last name are required',
    });
    await expect(verifySACAPRegistration('Jane', '')).resolves.toEqual({
      verified: false,
      error: 'First name and last name are required',
    });

    expect(launchMock).not.toHaveBeenCalled();
  });

  it('searches the SACAP register and returns matching registration details', async () => {
    const { browser, page } = createBrowserMock([
      ['Other', 'Person', 'Candidate Architect', 'SACAP-000'],
      ['Jane', 'Smith', 'Professional Architect', 'SACAP-123'],
    ]);

    await expect(verifySACAPRegistration(' Jane ', ' SMITH ')).resolves.toEqual({
      verified: true,
      registrationDetails: {
        firstName: 'Jane',
        lastName: 'Smith',
        category: 'Professional Architect',
        registrationNumber: 'SACAP-123',
      },
    });

    expect(launchMock).toHaveBeenCalledWith({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    expect(page.setDefaultTimeout).toHaveBeenCalledWith(30000);
    expect(page.goto).toHaveBeenCalledWith(expect.stringContaining('search.mymembership.co.za/Search/'), {
      waitUntil: 'networkidle',
    });
    expect(page.fill).toHaveBeenCalledWith('#WildCardSearch', 'Jane SMITH');
    expect(page.click).toHaveBeenCalledWith('#butSubmit');
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it('returns unverified and closes the browser when no result table appears', async () => {
    const { browser, page } = createBrowserMock();
    page.waitForSelector.mockRejectedValueOnce(new Error('timeout'));

    await expect(verifySACAPRegistration('Jane', 'Smith')).resolves.toEqual({ verified: false });

    expect(page.$$eval).not.toHaveBeenCalled();
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it('returns an error result and closes the browser when scraping fails', async () => {
    const { browser, page } = createBrowserMock();
    page.goto.mockRejectedValueOnce(new Error('registry unavailable'));

    await expect(verifySACAPRegistration('Jane', 'Smith')).resolves.toEqual({
      verified: false,
      error: 'registry unavailable',
    });
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it('requires a full display name before delegating by-name verification', async () => {
    await expect(verifySACAPByName('Jane')).resolves.toEqual({
      verified: false,
      error: 'Full name (first and last) is required',
    });

    expect(launchMock).not.toHaveBeenCalled();
  });

  it('splits display names into first name and compound last name for searches', async () => {
    const { page } = createBrowserMock([
      ['Jane', 'Mary Smith', 'Professional Senior Architectural Technologist', 'SACAP-456'],
    ]);

    await expect(verifySACAPByName(' Jane Mary Smith ')).resolves.toMatchObject({
      verified: true,
      registrationDetails: {
        firstName: 'Jane',
        lastName: 'Mary Smith',
        registrationNumber: 'SACAP-456',
      },
    });
    expect(page.fill).toHaveBeenCalledWith('#WildCardSearch', 'Jane Mary Smith');
  });
});
