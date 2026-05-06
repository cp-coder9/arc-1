/**
 * Council Submission Service Tests
 * Tests for actual municipality submission functionality
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { councilSubmissionService, Municipality } from '../councilSubmissionService';
import { Job, UserProfile } from '../../types';

const mockAddDoc = jest.fn(() => Promise.resolve({ id: 'new-submission-id' }));
const mockCollection = jest.fn((_db: unknown, path: string) => ({ path }));
const mockDoc = jest.fn((_db: unknown, path: string, id: string) => ({ path, id }));
const mockUpdateDoc = jest.fn(() => Promise.resolve());
const mockQuery = jest.fn((...args: unknown[]) => ({ args }));
const mockWhere = jest.fn((...args: unknown[]) => ({ args }));
const mockGetDoc = jest.fn();
const mockOnSnapshot = jest.fn();

jest.mock('../../lib/firebase', () => ({
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockCollection(...args),
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  where: (...args: unknown[]) => mockWhere(...args),
  orderBy: jest.fn(),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
  getDocs: jest.fn(),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
}));

jest.mock('../notificationService', () => ({
  notificationService: {
    notifyCouncilUpdate: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../pdfGenerationService', () => ({
  pdfGenerationService: {},
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe('CouncilSubmissionService', () => {
  const mockJob: Job = {
    id: 'job-1',
    title: 'Test Project',
    clientId: 'client-1',
    description: 'Test description',
    budget: { min: 10000, max: 20000 },
    location: 'Johannesburg',
    municipality: 'city_of_johannesburg',
    status: 'open',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    drawings: [],
    applications: [],
  };

  const mockClient: UserProfile = {
    uid: 'client-1',
    email: 'client@example.com',
    role: 'client',
    displayName: 'Test Client',
    createdAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        id: 'sub-1',
        jobId: 'job-1',
        userId: 'client-1',
        trackingHistory: [
          {
            status: 'Document Package Created',
            timestamp: '2026-01-01T00:00:00Z',
          },
        ],
        title: 'Test Project',
        clientId: 'client-1',
      }),
    });
    mockOnSnapshot.mockImplementation((_q: unknown, callback: (snapshot: unknown) => void) => {
      callback({
        empty: false,
        docs: [
          {
            id: 'sub-1',
            data: () => ({
              jobId: 'job-1',
              municipalityName: 'City of Johannesburg',
              status: 'preparing',
            }),
          },
        ],
      });
      return jest.fn();
    });
  });

  test('getMunicipalityConfig returns config for a valid municipality', () => {
    const config = councilSubmissionService.getMunicipalityConfig('city_of_johannesburg');

    expect(config.name).toBe('City of Johannesburg');
    expect(config.hasApi).toBe(false);
    expect(config.requirements.length).toBeGreaterThan(0);
  });

  test('getAllMunicipalities returns configured municipality options', () => {
    const municipalities = councilSubmissionService.getAllMunicipalities();

    expect(municipalities).toHaveLength(8);
    expect(municipalities).toEqual(
      expect.arrayContaining([
        { value: 'city_of_cape_town', label: 'City of Cape Town' },
      ])
    );
  });

  test('submitToCouncil creates a manual package, updates job, notifies client, and returns submission', async () => {
    const { notificationService } = await import('../notificationService');
    const documents = [{ name: 'Plans.pdf', url: 'https://example.com/plans.pdf' }];

    const submission = await councilSubmissionService.submitToCouncil(
      mockJob,
      'city_of_johannesburg',
      documents,
      mockClient
    );

    expect(mockAddDoc).toHaveBeenCalledWith(
      { path: 'council_submissions' },
      expect.objectContaining({
        jobId: 'job-1',
        municipality: 'Other',
        municipalityName: 'City of Johannesburg',
        userId: 'client-1',
        status: 'preparing',
        documents,
        source: 'manual',
      })
    );
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      { path: 'jobs', id: 'job-1' },
      expect.objectContaining({
        councilReference: expect.stringContaining('CITY-OF-JOHANNESBURG-'),
        status: 'council_submitted',
      })
    );
    expect(notificationService.notifyCouncilUpdate).toHaveBeenCalledWith(
      'client-1',
      'Test Project',
      'Document package prepared',
      'job-1'
    );
    expect(submission.id).toBe('new-submission-id');
    expect(submission.referenceNumber).toContain('CITY-OF-JOHANNESBURG-');
  });

  test('updateStatus appends tracking history, stores query data, and notifies the job client', async () => {
    const { notificationService } = await import('../notificationService');
    mockGetDoc
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          jobId: 'job-1',
          trackingHistory: [{ status: 'Created', timestamp: '2026-01-01T00:00:00Z' }],
          queries: [],
        }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: 'job-1',
          title: 'Test Project',
          clientId: 'client-1',
        }),
      });

    await councilSubmissionService.updateStatus('sub-1', 'queries_raised', 'Missing zoning certificate', {
      description: 'Please upload zoning certificate',
    });

    expect(mockUpdateDoc).toHaveBeenCalledWith(
      { path: 'council_submissions', id: 'sub-1' },
      expect.objectContaining({
        status: 'queries_raised',
        trackingHistory: expect.arrayContaining([
          expect.objectContaining({ status: 'queries raised', notes: 'Missing zoning certificate' }),
        ]),
        queries: expect.arrayContaining([
          expect.objectContaining({ description: 'Please upload zoning certificate' }),
        ]),
      })
    );
    expect(notificationService.notifyCouncilUpdate).toHaveBeenCalledWith(
      'client-1',
      'Test Project',
      'queries raised',
      'job-1'
    );
  });

  test('updateStatus returns without updating when the submission does not exist', async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => false });

    await councilSubmissionService.updateStatus('missing-submission', 'approved');

    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  test('subscribeToSubmission returns unsubscribe and calls callback with first matching submission', () => {
    const callback = jest.fn();

    const unsubscribe = councilSubmissionService.subscribeToSubmission('job-1', callback);

    expect(typeof unsubscribe).toBe('function');
    expect(mockWhere).toHaveBeenCalledWith('jobId', '==', 'job-1');
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'sub-1',
        jobId: 'job-1',
        municipalityName: 'City of Johannesburg',
      })
    );
  });

  test('subscribeToSubmission calls callback with null when no submission exists', () => {
    mockOnSnapshot.mockImplementationOnce((_q: unknown, callback: (snapshot: unknown) => void) => {
      callback({ empty: true, docs: [] });
      return jest.fn();
    });
    const callback = jest.fn();

    councilSubmissionService.subscribeToSubmission('job-1', callback);

    expect(callback).toHaveBeenCalledWith(null);
  });

  test('generateSubmissionPackage returns the submission package endpoint', async () => {
    await expect(councilSubmissionService.generateSubmissionPackage('sub-1')).resolves.toBe(
      '/api/submissions/sub-1/package'
    );
  });
});
