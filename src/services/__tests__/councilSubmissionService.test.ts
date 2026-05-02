/**
 * Council Submission Service Tests
 * Tests for municipality submission functionality
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { councilSubmissionService, Municipality } from '../councilSubmissionService';
import { Job, UserProfile, CouncilSubmission } from '@/types';
import { notificationService } from '@/services/notificationService';
import { addDoc, getDoc, updateDoc } from 'firebase/firestore';

const mockAddDoc = addDoc as jest.Mock<any>;
const mockGetDoc = getDoc as jest.Mock<any>;
const mockUpdateDoc = updateDoc as jest.Mock<any>;

// Mock Firebase
jest.mock('@/lib/firebase', () => ({
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  addDoc: jest.fn(),
  doc: jest.fn(),
  updateDoc: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  onSnapshot: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
}));

// Mock notification service
jest.mock('@/services/notificationService', () => ({
  notificationService: {
    notifyCouncilUpdate: jest.fn<any>().mockResolvedValue(undefined),
  },
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe('CouncilSubmissionService', () => {
  const mockJob: Job = {
    id: 'job-1',
    title: 'Test House',
    clientId: 'client-1',
    description: 'Test description',
    budget: 20000,
    requirements: [],
    deadline: '2026-12-31',
    category: 'Residential',
    location: 'Johannesburg',
    status: 'in-progress',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
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
    jest.spyOn(notificationService, 'notifyCouncilUpdate').mockResolvedValue(undefined);
  });

  describe('getMunicipalityConfig', () => {
    test('should return config for a municipality', () => {
      const config = councilSubmissionService.getMunicipalityConfig('city_of_johannesburg');
      expect(config.name).toBe('City of Johannesburg');
      expect(config.requirements).toBeInstanceOf(Array);
    });
  });

  describe('submitToCouncil', () => {
    test('should create a submission and update the job', async () => {
      const mockDocRef = { id: 'submission-123' };
      mockAddDoc.mockResolvedValueOnce(mockDocRef);
      mockUpdateDoc.mockResolvedValue(undefined);

      const documents = [{ name: 'Plans', url: 'https://example.com/plans.pdf' }];
      const result = await councilSubmissionService.submitToCouncil(
        mockJob,
        'city_of_johannesburg',
        documents,
        mockClient
      );

      expect(addDoc).toHaveBeenCalled();
      expect(updateDoc).toHaveBeenCalled();
      expect(result.id).toBe('submission-123');
      expect(notificationService.notifyCouncilUpdate).toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    test('should update status and notify client', async () => {
      const mockSubmission: CouncilSubmission = {
        id: 'sub-1',
        jobId: 'job-1',
        userId: 'client-1',
        status: 'preparing',
        municipality: 'city_of_johannesburg',
        documents: [],
        source: 'manual',
        trackingHistory: [],
      };

      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => mockSubmission,
      }).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockJob,
      });

      await councilSubmissionService.updateStatus('sub-1', 'submitted', 'Plan submitted');

      expect(updateDoc).toHaveBeenCalled();
      expect(notificationService.notifyCouncilUpdate).toHaveBeenCalled();
    });
  });

  describe('respondToQuery', () => {
    test('should update query with response', async () => {
      const mockSubmission: CouncilSubmission = {
        id: 'sub-1',
        jobId: 'job-1',
        userId: 'client-1',
        status: 'queries_raised',
        municipality: 'city_of_johannesburg',
        documents: [],
        source: 'manual',
        trackingHistory: [],
        queries: [{ description: 'Missing signature', raisedAt: new Date().toISOString() }],
      };

      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => mockSubmission,
      });

      await councilSubmissionService.respondToQuery('sub-1', 0, 'Signature added');

      expect(updateDoc).toHaveBeenCalled();
    });
  });
});
