/**
 * Payment Service Tests
 * Tests for payment and escrow functionality
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { paymentService } from '../paymentService';
import { Job, UserProfile, Payment } from '@/types';
import { notificationService } from '@/services/notificationService';

// Mock Firebase
const mockGetIdToken = jest.fn() as jest.Mock<any>;
mockGetIdToken.mockResolvedValue('mock-id-token');

jest.mock('@/lib/firebase', () => ({
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
        })),
        get: jest.fn(),
      })),
    })),
  },
  auth: {
    currentUser: {
      uid: 'user-1',
      getIdToken: () => mockGetIdToken(),
    },
  },
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  onSnapshot: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  orderBy: jest.fn(),
}));

// Mock Firebase Auth
jest.mock('firebase/auth', () => ({
  getIdToken: (user: any) => user.getIdToken(),
}));

// Mock notification service
jest.mock('@/services/notificationService', () => ({
  notificationService: {
    notifyPaymentReleased: jest.fn<any>().mockResolvedValue(undefined),
    notifyEscrowFunded: jest.fn<any>().mockResolvedValue(undefined),
    notifyRefundProcessed: jest.fn<any>().mockResolvedValue(undefined),
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
(global as any).fetch = jest.fn();
const mockFetch = (global as any).fetch as jest.Mock;

describe('PaymentService', () => {
  const mockJob: Job = {
    id: 'job-1',
    title: 'Test Project',
    clientId: 'client-1',
    description: 'Test description',
    budget: 15000,
    requirements: [],
    deadline: '2026-12-31',
    category: 'Residential',
    location: 'Johannesburg',
    status: 'open',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    selectedArchitectId: 'architect-1',
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
    mockFetch.mockReset();
    jest.spyOn(notificationService, 'notifyPaymentReleased').mockResolvedValue(undefined);
    jest.spyOn(notificationService, 'notifyEscrowFunded').mockResolvedValue(undefined);
    jest.spyOn(notificationService, 'notifyRefundProcessed').mockResolvedValue(undefined);
  });

  describe('calculateEscrowAmounts', () => {
    test('should calculate amounts correctly', () => {
      const amounts = paymentService.calculateEscrowAmounts(10000);

      expect(amounts.total).toBe(10500); // Including 5% platform fee
      expect(amounts.platformFee).toBe(500);
      expect(amounts.architectAmount).toBe(10000);
    });

    test('should allow custom fee percentage', () => {
      const amounts = paymentService.calculateEscrowAmounts(10000, 0.1);

      expect(amounts.total).toBe(11000);
      expect(amounts.platformFee).toBe(1000);
    });
  });

  describe('initializeEscrow', () => {
    test('should call server and return payment details', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          paymentId: 'pay-123',
          totalAmount: 10500,
        }),
      });

      const result = await paymentService.initializeEscrow(mockJob, mockClient);

      expect(mockFetch).toHaveBeenCalled();
      expect(result.paymentId).toBe('pay-123');
      expect(result.paymentUrl).toContain('pay-123');
    });

    test('should handle server errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Insufficient funds' }),
      });

      await expect(paymentService.initializeEscrow(mockJob, mockClient))
        .rejects.toThrow('Insufficient funds');
    });
  });

  describe('confirmPayment', () => {
    test('should confirm payment with server', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await paymentService.confirmPayment('pay-123', { pf_payment_id: '123' });

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('releaseMilestone', () => {
    test('should release payment and notify architect', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, architectAmount: 5000 }),
      });

      await paymentService.releaseMilestone(mockJob, 'initial', 'client-1');

      expect(mockFetch).toHaveBeenCalled();
      expect(notificationService.notifyPaymentReleased).toHaveBeenCalledWith(
        'architect-1',
        5000,
        'initial',
        'job-1'
      );
    });
  });

  describe('requestMilestoneRelease', () => {
    test('should send request to server', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, architectAmount: 5000 }),
      });

      await paymentService.requestMilestoneRelease(mockJob, 'initial', 'architect-1');

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('processRefund', () => {
    test('should process refund via server', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, refundAmount: 5000 }),
      });

      await paymentService.processRefund(mockJob, 5000, 'Test reason', 'admin-1');

      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
