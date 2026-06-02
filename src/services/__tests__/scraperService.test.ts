import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const credentialGet = jest.fn();
const submissionGet = jest.fn();
const submissionAdd = jest.fn();
const submissionWhere = jest.fn();
const submissionQuery = {
  where: submissionWhere,
  get: submissionGet,
};
const collection = jest.fn((name: string) => {
  if (name === 'municipal_credentials') {
    return {
      doc: jest.fn(() => ({ get: credentialGet })),
    };
  }

  if (name === 'council_submissions') {
    return {
      where: submissionWhere,
      add: submissionAdd,
    };
  }

  throw new Error(`Unexpected collection: ${name}`);
});
const decrypt = jest.fn(() => 'decrypted-password');

jest.mock('../../lib/firebase-admin', () => ({
  adminDb: {
    collection: (name: string) => collection(name),
  },
}));

jest.mock('../../lib/encryption', () => ({
  decrypt: (...args: unknown[]) => decrypt(...args),
}));

const { runMunicipalScraper } = await import('../scraperService');

function mockCredentials(overrides: Record<string, unknown> = {}) {
  credentialGet.mockResolvedValue({
    exists: true,
    data: () => ({
      username: 'municipal-user',
      encryptedPassword: 'encrypted',
      iv: 'iv',
      authTag: 'authTag',
      salt: 'salt',
      ...overrides,
    }),
  });
}

function mockNoExistingSubmission() {
  submissionWhere.mockReturnValue(submissionQuery);
  submissionGet.mockResolvedValue({ empty: true, docs: [] });
}

describe('runMunicipalScraper', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async () => {
      throw new Error('Network should not be called by scraper tests');
    }) as unknown as typeof fetch;
    mockCredentials();
    mockNoExistingSubmission();
    submissionAdd.mockResolvedValue({ id: 'submission-1' });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('returns an error without decrypting or scraping when credentials are missing', async () => {
    credentialGet.mockResolvedValue({ exists: false });

    const result = await runMunicipalScraper('user-1', 'COJ');

    expect(result).toEqual({ success: false, error: 'Credentials not found' });
    expect(decrypt).not.toHaveBeenCalled();
    expect(submissionAdd).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test('decrypts stored credentials and creates a parsed Joburg submission when none exists', async () => {
    const result = await runMunicipalScraper('user-1', 'COJ');

    expect(result).toEqual({ success: true, count: 1 });
    expect(collection).toHaveBeenCalledWith('municipal_credentials');
    expect(decrypt).toHaveBeenCalledWith('encrypted', 'iv', 'authTag', 'salt');
    expect(submissionWhere).toHaveBeenNthCalledWith(1, 'userId', '==', 'user-1');
    expect(submissionWhere).toHaveBeenNthCalledWith(2, 'municipality', '==', 'COJ');
    expect(submissionWhere).toHaveBeenNthCalledWith(3, 'referenceNumber', '==', 'BP-2024-0001');
    expect(submissionAdd).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      municipality: 'COJ',
      referenceNumber: 'BP-2024-0001',
      status: 'In Circulation',
      rawStatus: 'IN_CIRCULATION_PENDING_HEALTH',
      source: 'scraper',
      documents: [],
      trackingHistory: [expect.objectContaining({
        status: 'In Circulation',
        notes: 'Found via automated scraper',
        source: 'scraper',
      })],
    }));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test('creates a parsed Cape Town submission safely without network access', async () => {
    const result = await runMunicipalScraper('user-2', 'COCT');

    expect(result).toEqual({ success: true, count: 1 });
    expect(submissionWhere).toHaveBeenNthCalledWith(3, 'referenceNumber', '==', 'DAMS-778899');
    expect(submissionAdd).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-2',
      municipality: 'COCT',
      referenceNumber: 'DAMS-778899',
      status: 'Approved',
      rawStatus: 'FINAL_APPROVAL_GRANTED',
    }));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test('updates tracking history when an existing submission status changes', async () => {
    const update = jest.fn(() => Promise.resolve());
    submissionGet.mockResolvedValue({
      empty: false,
      docs: [{
        ref: { update },
        data: () => ({
          status: 'Submitted',
          trackingHistory: [{ status: 'Submitted', timestamp: '2026-01-01T00:00:00.000Z' }],
        }),
      }],
    });

    const result = await runMunicipalScraper('user-1', 'COJ');

    expect(result).toEqual({ success: true, count: 1 });
    expect(submissionAdd).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'In Circulation',
      rawStatus: 'IN_CIRCULATION_PENDING_HEALTH',
      trackingHistory: [
        expect.objectContaining({ status: 'Submitted' }),
        expect.objectContaining({
          status: 'In Circulation',
          notes: 'Status updated from Submitted to In Circulation via scraper',
          source: 'scraper',
        }),
      ],
    }));
  });

  test('refreshes only lastCheckedAt when an existing status is unchanged', async () => {
    const update = jest.fn(() => Promise.resolve());
    submissionGet.mockResolvedValue({
      empty: false,
      docs: [{
        ref: { update },
        data: () => ({ status: 'Approved', trackingHistory: [] }),
      }],
    });

    const result = await runMunicipalScraper('user-2', 'COCT');

    expect(result).toEqual({ success: true, count: 1 });
    expect(update).toHaveBeenCalledWith({
      lastCheckedAt: expect.any(String),
    });
    expect(submissionAdd).not.toHaveBeenCalled();
  });

  test('returns a failure object when persistence fails', async () => {
    submissionAdd.mockRejectedValue(new Error('firestore unavailable'));

    const result = await runMunicipalScraper('user-1', 'COJ');

    expect(result).toEqual({ success: false, error: 'firestore unavailable' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
