/**
 * Notification Service Tests
 * Tests for notification functionality
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { NotificationType } from '../../types';
import * as firestore from 'firebase/firestore';

const { notificationService } = await import('../notificationService');

// Mock Firebase
jest.mock('@/lib/firebase', () => ({
  db: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
      })),
      add: jest.fn(),
      where: jest.fn(() => ({
        orderBy: jest.fn(() => ({
          limit: jest.fn(() => ({
            onSnapshot: jest.fn(),
            get: jest.fn(),
          })),
        })),
      })),
    })),
  },
}));

// Mock Firebase Firestore
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  addDoc: jest.fn(() => Promise.resolve({ id: 'new-notification-id' })),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  onSnapshot: jest.fn((q, callback) => {
    callback({
      docs: [
        {
          id: 'notif-1',
          data: () => ({
            userId: 'user-1',
            type: 'job_application',
            title: 'New Application',
            body: 'Test notification',
            isRead: false,
            createdAt: '2026-01-01T00:00:00Z',
          }),
        },
      ],
    });
    return jest.fn();
  }),
  updateDoc: jest.fn(() => Promise.resolve()),
  doc: jest.fn(() => ({})),
  getDocs: jest.fn(() =>
    Promise.resolve({
      docs: [
        {
          id: 'notif-1',
          ref: { id: 'notif-1' },
          data: () => ({
            userId: 'user-1',
            isRead: false,
          }),
        },
      ],
    })
  ),
  writeBatch: jest.fn(() => ({
    update: jest.fn(),
    commit: jest.fn(() => Promise.resolve()),
  })),
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

describe('NotificationService', () => {
  let notificationWrites: any[];
  let mockUnsubscribe: ReturnType<typeof jest.fn>;

  beforeEach(() => {
    jest.clearAllMocks();
    notificationWrites = [];
    mockUnsubscribe = jest.fn();

    jest.spyOn(firestore, 'getDoc').mockResolvedValue({
      data: () => ({ notificationPreferences: { in_app: true, email: true, push: true } }),
    } as any);
    jest.spyOn(firestore, 'addDoc').mockImplementation(async (_collection: any, notification: any) => {
      notificationWrites.push(notification);
      return { id: 'new-notification-id' } as any;
    });
    jest.spyOn(firestore, 'onSnapshot').mockImplementation((_q: any, callback: any) => {
      callback({
        docs: [
          {
            id: 'notif-1',
            data: () => ({
              userId: 'user-1',
              type: 'job_application',
              title: 'New Application',
              body: 'Test notification',
              isRead: false,
              createdAt: '2026-01-01T00:00:00Z',
            }),
          },
        ],
      });
      return mockUnsubscribe;
    });
    jest.spyOn(firestore, 'updateDoc').mockResolvedValue(undefined as any);
    jest.spyOn(firestore, 'getDocs').mockResolvedValue({
      docs: [
        {
          id: 'notif-1',
          ref: { id: 'notif-1' },
          data: () => ({ userId: 'user-1', isRead: false }),
        },
      ],
    } as any);
    jest.spyOn(firestore, 'writeBatch').mockReturnValue({
      update: jest.fn(),
      commit: jest.fn(() => Promise.resolve()),
    } as any);
  });

  describe('sendNotification', () => {
    test('should send notification with correct data', async () => {
      await notificationService.sendNotification(
        'user-1',
        'job_application' as NotificationType,
        'Test notification body',
        { jobId: 'job-1' }
      );

      expect(firestore.addDoc).toHaveBeenCalled();
      const callArg = notificationWrites[0];
      expect(callArg.userId).toBe('user-1');
      expect(callArg.type).toBe('job_application');
      expect(callArg.body).toBe('Test notification body');
      expect(callArg.data.jobId).toBe('job-1');
      expect(callArg.isRead).toBe(false);
    });

    test('should include correct channels based on notification type', async () => {
      await notificationService.sendNotification(
        'user-1',
        'application_accepted' as NotificationType,
        'Your application was accepted'
      );

      const callArg = notificationWrites[0];
      expect(callArg.channels).toContain('in_app');
      expect(callArg.channels).toContain('email');
      expect(callArg.channels).toContain('push');
    });

    test('should handle notification without data', async () => {
      await notificationService.sendNotification(
        'user-1',
        'message' as NotificationType,
        'Simple message'
      );

      const callArg = notificationWrites[0];
      expect(callArg.data).toEqual({});
    });
  });

  describe('subscribeToNotifications', () => {
    test('should subscribe and return unsubscribe function', () => {
      const callback = jest.fn();
      const unsubscribe = notificationService.subscribeToNotifications('user-1', callback);

      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    test('should call callback with notifications', () => {
      const callback = jest.fn();
      notificationService.subscribeToNotifications('user-1', callback);

      expect(callback).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'notif-1',
            userId: 'user-1',
            type: 'job_application',
          }),
        ])
      );
    });
  });

  describe('markAsRead', () => {
    test('should update notification as read', async () => {
      await notificationService.markAsRead('notif-1');

      expect(firestore.updateDoc).toHaveBeenCalled();
    });
  });

  describe('markAllAsRead', () => {
    test('should mark all notifications as read for user', async () => {
      await notificationService.markAllAsRead('user-1');

      expect(firestore.getDocs).toHaveBeenCalled();
      expect(firestore.writeBatch).toHaveBeenCalled();
    });
  });

  describe('unsubscribe', () => {
    test('should unsubscribe all listeners', () => {
      const callback = jest.fn();

      // Subscribe first
      notificationService.subscribeToNotifications('user-1', callback);

      // Unsubscribe all
      notificationService.unsubscribe();

      // The unsubscribe function should have been called
      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  describe('notification type helpers', () => {
    test('should notify on job application', async () => {
      await notificationService.notifyJobApplication('client-1', 'architect-1', 'job-1', 'app-1');

      expect(firestore.addDoc).toHaveBeenCalled();
      const callArg = notificationWrites[0];
      expect(callArg.type).toBe('job_application');
      expect(callArg.data.applicationId).toBe('app-1');
    });

    test('should notify on application accepted', async () => {
      await notificationService.notifyApplicationAccepted('architect-1', 'client-1', 'job-1');

      expect(firestore.addDoc).toHaveBeenCalled();
      const callArg = notificationWrites[0];
      expect(callArg.type).toBe('application_accepted');
    });

    test('should notify on drawing submitted', async () => {
      await notificationService.notifyDrawingSubmitted('client-1', 'architect-1', 'job-1', 'sub-1');

      expect(firestore.addDoc).toHaveBeenCalled();
      const callArg = notificationWrites[0];
      expect(callArg.type).toBe('drawing_submitted');
    });

    test('should notify on AI review complete', async () => {
      await notificationService.notifyAIReviewComplete('client-1', 'architect-1', 'drawing.pdf', 'passed', 'job-1', 'sub-1');

      expect(firestore.addDoc).toHaveBeenCalled();
      const callArg = notificationWrites[0];
      expect(callArg.type).toBe('ai_review_complete');
    });

    test('should notify on admin approval', async () => {
      await notificationService.notifyAdminApproval('client-1', 'drawing.pdf', 'job-1', 'sub-1');

      expect(firestore.addDoc).toHaveBeenCalled();
      const callArg = notificationWrites[0];
      expect(callArg.type).toBe('admin_approval');
    });

    test('should notify on admin rejection', async () => {
      await notificationService.notifyAdminRejection('client-1', 'job-1', 'sub-1', 'Issues found');

      expect(firestore.addDoc).toHaveBeenCalled();
      const callArg = notificationWrites[0];
      expect(callArg.type).toBe('admin_rejection');
    });

    test('should notify on payment released', async () => {
      await notificationService.notifyPaymentReleased('architect-1', 5000, 'final', 'job-1');

      expect(firestore.addDoc).toHaveBeenCalled();
      const callArg = notificationWrites[0];
      expect(callArg.type).toBe('payment_released');
    });

    test('should notify on new message', async () => {
      await notificationService.notifyMessage('recipient-1', 'sender-1', 'Hello', 'job-1');

      expect(firestore.addDoc).toHaveBeenCalled();
      const callArg = notificationWrites[0];
      expect(callArg.type).toBe('message');
    });

    test('should notify on milestone due', async () => {
      await notificationService.notifyMilestoneDue('architect-1', 'draft', 'job-1', 7);

      expect(firestore.addDoc).toHaveBeenCalled();
      const callArg = notificationWrites[0];
      expect(callArg.type).toBe('milestone_due');
    });

    test('should notify on council update', async () => {
      await notificationService.notifyCouncilUpdate('client-1', 'job-1', 'sub-1', 'approved');

      expect(firestore.addDoc).toHaveBeenCalled();
      const callArg = notificationWrites[0];
      expect(callArg.type).toBe('council_update');
    });
  });
});
