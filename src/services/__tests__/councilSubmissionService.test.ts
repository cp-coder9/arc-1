/**
 * Council Submission Service Tests
 * Tests for municipality submission functionality
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { councilSubmissionService, Municipality } from '../councilSubmissionService';
import { Job, UserProfile } from '../../types';

// Mock Firebase
jest.mock('../../lib/firebase', () => ({
  db: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
      })),
      add: jest.fn(() => Promise.resolve({ id: 'new-submission-id' })),
      where: jest.fn(() => ({
        orderBy: jest.fn(() => ({
          onSnapshot: jest.fn(),
          get: jest.fn(),
        })),
      })),
    })),
  },
}));

// Mock Firebase Firestore
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  addDoc: jest.fn(() => Promise.resolve({ id: 'new-submission-id' })),
  doc: jest.fn(() => ({})),
  updateDoc: jest.fn(() => Promise.resolve()),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  onSnapshot: jest.fn((q, callback) => {
    callback({
      docs: [
        {
          id: 'sub-1',
          data: () => ({
            jobId: 'job-1',
            municipality: 'city_of_johannesburg',
            status: 'draft',
            createdAt: '2026-01-01T00:00:00Z',
          }),
        },
      ],
    });
    return jest.fn();
  }),
  getDocs: jest.fn(() =>
    Promise.resolve({
      docs: [
        {
          id: 'sub-1',
          data: () => ({
            jobId: 'job-1',
            municipality: 'city_of_johannesburg',
            status: 'submitted',
          }),
        },
      ],
    })
  ),
  getDoc: jest.fn(() =>
    Promise.resolve({
      exists: () => true,
      data: () => ({
        status: 'draft',
        drawings: ['drawing-1'],
      }),
    })
  ),
}));

// Mock notification service
jest.mock('../notificationService', () => ({
  notificationService: {
    notifyCouncilUpdate: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock PDF generation service
jest.mock('../pdfGenerationService', () => ({
  pdfGenerationService: {
    generateCouncilSubmission: jest.fn().mockResolvedValue({
      url: 'https://example.com/document.pdf',
      pages: 5,
    }),
  },
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
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

  const mockUser: UserProfile = {
    uid: 'arch-1',
    email: 'architect@example.com',
    role: 'architect',
    displayName: 'Test Architect',
    createdAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getMunicipalityConfig', () => {
    test('should return config for valid municipality', () => {
      const config = councilSubmissionService.getMunicipalityConfig('city_of_johannesburg');

      expect(config).toBeDefined();
      expect(config.name).toBe('City of Johannesburg');
      expect(config.hasApi).toBe(false);
      expect(config.requirements).toBeInstanceOf(Array);
      expect(config.requirements.length).toBeGreaterThan(0);
    });

    test('should return all municipalities', () => {
      const municipalities = councilSubmissionService.getAllMunicipalities();

      expect(municipalities).toBeInstanceOf(Array);
      expect(municipalities.length).toBe(8); // 8 municipalities defined
      expect(municipalities[0]).toHaveProperty('value');
      expect(municipalities[0]).toHaveProperty('label');
    });

    test('should return requirements for municipality', () => {
      const requirements = councilSubmissionService.getRequirementsForMunicipality('city_of_cape_town');

      expect(requirements).toBeInstanceOf(Array);
      expect(requirements.length).toBeGreaterThan(0);
      expect(requirements).toContain('Completed application form');
    });
  });

  describe('createSubmission', () => {
    test('should create submission with correct data', async () => {
      const { addDoc } = await import('firebase/firestore');

      await councilSubmissionService.createSubmission(
        mockJob,
        'city_of_johannesburg',
        mockUser
      );

      expect(addDoc).toHaveBeenCalled();
      const callArg = (addDoc as jest.Mock).mock.calls[0][1];
      expect(callArg.jobId).toBe('job-1');
      expect(callArg.municipality).toBe('city_of_johannesburg');
      expect(callArg.architectId).toBe('arch-1');
      expect(callArg.clientId).toBe('client-1');
      expect(callArg.status).toBe('draft');
    });

    test('should include requirements checklist', async () => {
      const { addDoc } = await import('firebase/firestore');

      await councilSubmissionService.createSubmission(
        mockJob,
        'city_of_johannesburg',
        mockUser
      );

      const callArg = (addDoc as jest.Mock).mock.calls[0][1];
      expect(callArg.requirements).toBeInstanceOf(Array);
      expect(callArg.requirements[0]).toHaveProperty('name');
      expect(callArg.requirements[0]).toHaveProperty('completed');
    });
  });

  describe('updateSubmission', () => {
    test('should update submission', async () => {
      const { updateDoc } = await import('firebase/firestore');

      await councilSubmissionService.updateSubmission('sub-1', {
        status: 'submitted',
        referenceNumber: 'REF-123',
      });

      expect(updateDoc).toHaveBeenCalled();
    });
  });

  describe('addDrawingToSubmission', () => {
    test('should add drawing to submission', async () => {
      const { updateDoc } = await import('firebase/firestore');

      await councilSubmissionService.addDrawingToSubmission('sub-1', 'drawing-2');

      expect(updateDoc).toHaveBeenCalled();
    });
  });

  describe('removeDrawingFromSubmission', () => {
    test('should remove drawing from submission', async () => {
      const { updateDoc, getDoc } = await import('firebase/firestore');

      await councilSubmissionService.removeDrawingFromSubmission('sub-1', 'drawing-1');

      expect(getDoc).toHaveBeenCalled();
      expect(updateDoc).toHaveBeenCalled();
    });
  });

  describe('submitToCouncil', () => {
    test('should mark submission as submitted', async () => {
      const { updateDoc } = await import('firebase/firestore');

      await councilSubmissionService.submitToCouncil('sub-1', 'manual');

      expect(updateDoc).toHaveBeenCalled();
      const callArg = (updateDoc as jest.Mock).mock.calls[0][1];
      expect(callArg.status).toBe('submitted');
      expect(callArg.submittedAt).toBeDefined();
    });

    test('should include submission method', async () => {
      const { updateDoc } = await import('firebase/firestore');

      await councilSubmissionService.submitToCouncil('sub-1', 'api');

      const callArg = (updateDoc as jest.Mock).mock.calls[0][1];
      expect(callArg.submissionMethod).toBe('api');
    });
  });

  describe('subscribeToSubmissions', () => {
    test('should subscribe and return unsubscribe function', () => {
      const callback = jest.fn();
      const unsubscribe = councilSubmissionService.subscribeToSubmissions('job-1', callback);

      expect(typeof unsubscribe).toBe('function');
    });

    test('should call callback with submissions', () => {
      const callback = jest.fn();
      councilSubmissionService.subscribeToSubmissions('job-1', callback);

      expect(callback).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'sub-1',
            jobId: 'job-1',
          }),
        ])
      );
    });
  });

  describe('getSubmissionsForJob', () => {
    test('should return submissions for job', async () => {
      const submissions = await councilSubmissionService.getSubmissionsForJob('job-1');

      expect(submissions).toBeInstanceOf(Array);
      expect(submissions.length).toBeGreaterThan(0);
    });
  });

  describe('checkMunicipalityStatus', () => {
    test('should return status for municipality with API', async () => {
      // Note: Currently no municipalities have API support
      const status = await councilSubmissionService.checkMunicipalityStatus(
        'city_of_johannesburg',
        'REF-123'
      );

      // Since no APIs are implemented, should return unknown or error
      expect(status).toBeDefined();
    });
  });

  describe('updateSubmissionStatus', () => {
    test('should update status and notify', async () => {
      const { updateDoc } = await import('firebase/firestore');
      const { notificationService } = await import('../notificationService');

      await councilSubmissionService.updateSubmissionStatus(
        'sub-1',
        'approved',
        'Permit granted'
      );

      expect(updateDoc).toHaveBeenCalled();
      expect(notificationService.notifyCouncilUpdate).toHaveBeenCalled();
    });
  });

  describe('getSubmissionStats', () => {
    test('should calculate statistics correctly', async () => {
      const stats = await councilSubmissionService.getSubmissionStats('arch-1');

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('byStatus');
      expect(stats).toHaveProperty('byMunicipality');
    });
  });

  describe('generateSubmissionDocument', () => {
    test('should generate PDF document', async () => {
      const { pdfGenerationService } = await import('../pdfGenerationService');

      const result = await councilSubmissionService.generateSubmissionDocument('sub-1');

      expect(pdfGenerationService.generateCouncilSubmission).toHaveBeenCalled();
      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('pages');
    });
  });

  describe('validateSubmission', () => {
    test('should return valid for complete submission', async () => {
      const { getDoc } = await import('firebase/firestore');
      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          status: 'draft',
          drawings: ['drawing-1', 'drawing-2'],
          requirements: [
            { name: 'Form', completed: true },
            { name: 'Plans', completed: true },
          ],
        }),
      });

      const validation = await councilSubmissionService.validateSubmission('sub-1');

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should return invalid for incomplete requirements', async () => {
      const { getDoc } = await import('firebase/firestore');
      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          status: 'draft',
          drawings: ['drawing-1'],
          requirements: [
            { name: 'Form', completed: true },
            { name: 'Plans', completed: false },
          ],
        }),
      });

      const validation = await councilSubmissionService.validateSubmission('sub-1');

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    test('should return invalid for no drawings', async () => {
      const { getDoc } = await import('firebase/firestore');
      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          status: 'draft',
          drawings: [],
          requirements: [{ name: 'Form', completed: true }],
        }),
      });

      const validation = await councilSubmissionService.validateSubmission('sub-1');

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('No drawings attached');
    });

    test('should throw for non-existent submission', async () => {
      const { getDoc } = await import('firebase/firestore');
      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => false,
      });

      await expect(councilSubmissionService.validateSubmission('non-existent')).rejects.toThrow(
        'Submission not found'
      );
    });
  });
});
