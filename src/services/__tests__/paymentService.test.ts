/**
 * Payment Service Tests
 * Tests for payment and escrow functionality
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { paymentService } from '../paymentService';
import { Job, UserProfile } from '../../types';

// Mock Firebase
const mockGetIdToken = jest.fn().mockResolvedValue('mock-id-token');
jest.mock('../../lib/firebase', () => ({
  db: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
      })),
      where: jest.fn(() => ({
        orderBy: jest.fn(() => ({
          onSnapshot: jest.fn(),
          get: jest.fn(),
        })),
      })),
    })),
  },
  auth: {
    currentUser: { uid: 'test-user', email: 'test@example.com' },
  },
}));

// Mock Firebase Auth
jest.mock('firebase/auth', () => ({
  getIdToken: () => mockGetIdToken(),
}));

// Mock modular Firebase Firestore APIs used by paymentService
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({ type: 'collection' })),
  query: jest.fn(() => ({ type: 'query' })),
  where: jest.fn(() => ({ type: 'where' })),
  orderBy: jest.fn(() => ({ type: 'orderBy' })),
  doc: jest.fn(() => ({ type: 'doc' })),
  getDoc: jest.fn(() => Promise.resolve({ exists: () => false })),
  getDocs: jest.fn(() => Promise.resolve({ docs: [], size: 0 })),
  onSnapshot: jest.fn((_ref, callback: any) => {
    callback({
      docs: [],
      exists: () => false,
    });
    return jest.fn();
  }),
}));

// Mock notification service
jest.mock('../notificationService', () => ({
  notificationService: {
    notifyPaymentReleased: jest.fn().mockResolvedValue(undefined),
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

// Mock fetch
global.fetch = jest.fn();

describe('PaymentService', () => {
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
    const { auth } = require('../../lib/firebase');
    auth.currentUser = { uid: 'test-user', email: 'test@example.com' };
    process.env.VITE_PAYFAST_MERCHANT_ID = '10000100';
    process.env.VITE_PAYFAST_MERCHANT_KEY = '46f0cd694581a';
    (global.fetch as jest.Mock).mockReset();
  });

  describe('generateSignature', () => {
    test('should generate consistent signature for same data', async () => {
      const data = { amount: '100', item_name: 'Test' };
      
      // @ts-ignore - accessing private method
      const signature1 = await paymentService.generateSignature(data);
      // @ts-ignore - accessing private method
      const signature2 = await paymentService.generateSignature(data);

      expect(signature1).toBe(signature2);
    });

    test('should generate different signatures for different data', async () => {
      // @ts-ignore - accessing private method
      const signature1 = await paymentService.generateSignature({ amount: '100' });
      // @ts-ignore - accessing private method
      const signature2 = await paymentService.generateSignature({ amount: '200' });

      expect(signature1).not.toBe(signature2);
    });
  });

  describe('verifyITNSignature', () => {
    test('should verify valid signature', async () => {
      const data = { amount: '100', item_name: 'Test' };
      // @ts-ignore - accessing private method
      const signature = await paymentService.generateSignature(data);

      const isValid = await paymentService.verifyITNSignature(data, signature);

      expect(isValid).toBe(true);
    });

    test('should reject invalid signature', async () => {
      const data = { amount: '100', item_name: 'Test' };
      const isValid = await paymentService.verifyITNSignature(data, 'invalid-signature');

      expect(isValid).toBe(false);
    });
  });

  describe('initializeEscrow', () => {
    test('should initialize escrow and return payment URL', async () => {
      const mockResponse = {
        success: true,
        paymentId: 'pay-123',
        totalAmount: 10500,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await paymentService.initializeEscrow(mockJob, mockClient);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/payment/escrow/init',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer mock-id-token',
          }),
          body: JSON.stringify({ jobId: 'job-1' }),
        })
      );

      expect(result).toHaveProperty('paymentUrl');
      expect(result).toHaveProperty('paymentId', 'pay-123');
    });

    test('should throw error when not authenticated', async () => {
      const { auth } = await import('../../lib/firebase');
      (auth as any).currentUser = null;

      await expect(paymentService.initializeEscrow(mockJob, mockClient)).rejects.toThrow(
        'You must be signed in to perform this action'
      );
    });

    test('should throw error on server failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Server error' }),
      });

      await expect(paymentService.initializeEscrow(mockJob, mockClient)).rejects.toThrow('Server error');
    });
  });

  describe('confirmPayment', () => {
    test('should confirm payment successfully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await paymentService.confirmPayment('pay-123', { amount: '100' });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/payment/confirm',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('pay-123'),
        })
      );
    });

    test('should show info toast on non-success response', async () => {
      const { toast } = await import('sonner');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false, message: 'Pending verification' }),
      });

      await paymentService.confirmPayment('pay-123', {});

      expect(toast.info).toHaveBeenCalledWith('Pending verification');
    });
  });

  describe('releaseMilestone', () => {
    test('should release milestone payment', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, architectAmount: 3500 }),
      });

      const jobWithArchitect = { ...mockJob, selectedArchitectId: 'arch-1' };
      await paymentService.releaseMilestone(jobWithArchitect, 'initial', 'client-1');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/payment/milestone/release',
        expect.objectContaining({
          body: JSON.stringify({ jobId: 'job-1', milestone: 'initial' }),
        })
      );
    });

    test('should notify architect on release', async () => {
      const { notificationService } = await import('../notificationService');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, architectAmount: 3500 }),
      });

      const jobWithArchitect = { ...mockJob, selectedArchitectId: 'arch-1' };
      await paymentService.releaseMilestone(jobWithArchitect, 'final', 'client-1');

      expect(notificationService.notifyPaymentReleased).toHaveBeenCalledWith(
        'arch-1',
        3500,
        'final',
        'job-1'
      );
    });
  });

  describe('requestMilestoneRelease', () => {
    test('should request milestone release', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await paymentService.requestMilestoneRelease(mockJob, 'draft', 'arch-1');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/payment/milestone/request',
        expect.objectContaining({
          body: JSON.stringify({ jobId: 'job-1', milestone: 'draft' }),
        })
      );
    });
  });

  describe('subscribeToEscrow', () => {
    test('should subscribe to escrow updates', () => {
      const callback = jest.fn();
      const unsubscribe = paymentService.subscribeToEscrow('job-1', callback);

      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('subscribeToPayments', () => {
    test('should subscribe to payment updates', () => {
      const callback = jest.fn();
      const unsubscribe = paymentService.subscribeToPayments('client-1', callback);

      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('calculateEscrowAmounts', () => {
    test('should calculate amounts correctly', () => {
      const amounts = paymentService.calculateEscrowAmounts(10000);

      expect(amounts.total).toBe(10500); // Including 5% platform fee
      expect(amounts.platformFee).toBe(500);
      expect(amounts.architectAmount).toBe(10000);
    });

    test('should handle zero budget', () => {
      const amounts = paymentService.calculateEscrowAmounts(0);

      expect(amounts.total).toBe(0);
      expect(amounts.platformFee).toBe(0);
      expect(amounts.architectAmount).toBe(0);
    });

    test('should handle custom platform fee percentage', () => {
      const amounts = paymentService.calculateEscrowAmounts(10000, 0.1);

      expect(amounts.total).toBe(11000);
      expect(amounts.platformFee).toBe(1000);
    });
  });

  describe('generatePayFastUrl', () => {
    test('should generate PayFast URL with required parameters', async () => {
      // @ts-ignore - accessing private method
      const url = await paymentService.generatePayFastUrl(
        'pay-123',
        10000,
        'Test Project',
        mockClient
      );

      expect(url).toContain('merchant_id=');
      expect(url).toContain('merchant_key=');
      expect(url).toContain('amount=100.00');
      expect(url).toContain('item_name=');
    });
  });
});
