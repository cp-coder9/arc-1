/**
 * Notification Service Tests
 * Tests for actual notification service functionality
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { NotificationType } from '../../types';
import * as firestore from 'firebase/firestore';

const mockAddDoc = jest.fn<(...args: any[]) => Promise<{ id: string }>>(() => Promise.resolve({ id: 'new-notification-id' }));
const mockCollection = jest.fn<(...args: any[]) => { path: string }>((_db: any, path: string) => ({ path }));
const mockDoc = jest.fn<(...args: any[]) => { path: string; id: string }>((_db: any, path: string, id: string) => ({ path, id }));
const mockUpdateDoc = jest.fn<(...args: any[]) => Promise<void>>(() => Promise.resolve());
const mockQuery = jest.fn<(...args: any[]) => { args: any[] }>((...args: any[]) => ({ args }));
const mockWhere = jest.fn<(...args: any[]) => { args: any[] }>((...args: any[]) => ({ args }));
const mockOrderBy = jest.fn<(...args: any[]) => { args: any[] }>((...args: any[]) => ({ args }));
const mockLimit = jest.fn<(...args: any[]) => { args: any[] }>((...args: any[]) => ({ args }));
const mockOnSnapshot = jest.fn<(...args: any[]) => any>();
const mockGetDocs = jest.fn<(...args: any[]) => any>();
const mockGetDoc = jest.fn<(...args: any[]) => any>();
const mockBatchUpdate = jest.fn<(...args: any[]) => any>();
const mockBatchCommit = jest.fn<(...args: any[]) => Promise<void>>(() => Promise.resolve());

jest.mock('../../lib/firebase', () => ({
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  collection: (...args: any[]) => mockCollection(...args),
  addDoc: (...args: any[]) => mockAddDoc(...args),
  query: (...args: any[]) => mockQuery(...args),
  where: (...args: any[]) => mockWhere(...args),
  orderBy: (...args: any[]) => mockOrderBy(...args),
  limit: (...args: any[]) => mockLimit(...args),
  onSnapshot: (...args: any[]) => mockOnSnapshot(...args),
  updateDoc: (...args: any[]) => mockUpdateDoc(...args),
  doc: (...args: any[]) => mockDoc(...args),
  getDocs: (...args: any[]) => mockGetDocs(...args),
  getDoc: (...args: any[]) => mockGetDoc(...args),
  writeBatch: jest.fn(() => ({
    update: mockBatchUpdate,
    commit: mockBatchCommit,
  })),
}));

jest.mock('sonner', () => ({
  toast: jest.fn(),
}));

const { notificationService } = await import('../notificationService');

describe('NotificationService', () => {
  let notificationWrites: any[];
  let mockUnsubscribe: ReturnType<typeof jest.fn>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ notificationPreferences: { in_app: true, email: true, push: true } }),
    });
    mockGetDocs.mockResolvedValue({
      size: 1,
      docs: [
        {
          id: 'notif-1',
          ref: { id: 'notif-1' },
          data: () => ({ userId: 'user-1', isRead: false }),
        },
      ],
    });
    mockOnSnapshot.mockImplementation((_q: any, callback: (snapshot: any) => void) => {
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
    });
    notificationService.cleanup();
  });

  describe('sendNotification', () => {
    test('sends notification with correct data', async () => {
      await notificationService.sendNotification(
        'user-1',
        'job_application' as NotificationType,
        'Test notification body',
        { jobId: 'job-1' }
      );

      expect(mockAddDoc).toHaveBeenCalledWith(
        { path: 'notifications' },
        expect.objectContaining({
          userId: 'user-1',
          type: 'job_application',
          title: 'New Application',
          body: 'Test notification body',
          data: { jobId: 'job-1' },
          isRead: false,
          deliveryStatus: 'pending',
        })
      );
    });

    test('filters channels from user notification preferences', async () => {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ notificationPreferences: { in_app: false, email: true, push: false } }),
      });

      await notificationService.sendNotification('user-1', 'application_accepted', 'Accepted');

      const notification = mockAddDoc.mock.calls[0][1] as { channels: string[] };
      expect(notification.channels).toEqual(['email']);
    });

    test('does not create a notification when all preferred channels are disabled', async () => {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ notificationPreferences: { in_app: false, email: false, push: false } }),
      });

      await notificationService.sendNotification('user-1', 'message', 'Muted message');

      expect(mockAddDoc).not.toHaveBeenCalled();
    });
  });

  describe('subscribeToNotifications', () => {
    test('subscribes and returns unsubscribe function without calling it immediately', () => {
      const callback = jest.fn();
      const unsubscribe = notificationService.subscribeToNotifications('user-1', callback);

      expect(typeof unsubscribe).toBe('function');
      expect(mockWhere).toHaveBeenCalledWith('userId', '==', 'user-1');
      expect(mockOrderBy).toHaveBeenCalledWith('createdAt', 'desc');
      expect(mockLimit).toHaveBeenCalledWith(50);
      expect(callback).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'notif-1', userId: 'user-1', type: 'job_application' }),
        ])
      );
    });
  });

  test('markAsRead updates notification read fields', async () => {
    await notificationService.markAsRead('notif-1');

    expect(mockUpdateDoc).toHaveBeenCalledWith(
      { path: 'notifications', id: 'notif-1' },
      expect.objectContaining({ isRead: true, readAt: expect.any(String) })
    );
  });

  test('markAllAsRead updates unread notifications using a batch', async () => {
    await notificationService.markAllAsRead('user-1');

    expect(mockGetDocs).toHaveBeenCalled();
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      { id: 'notif-1' },
      expect.objectContaining({ isRead: true, readAt: expect.any(String) })
    );
    expect(mockBatchCommit).toHaveBeenCalled();
  });

  test('getUnreadCount returns snapshot size', async () => {
    await expect(notificationService.getUnreadCount('user-1')).resolves.toBe(1);
  });

  test('cleanup unsubscribes stored listeners', () => {
    const unsubscribe = jest.fn();
    mockOnSnapshot.mockReturnValueOnce(unsubscribe);

    notificationService.subscribeToNotifications('user-1', jest.fn());
    notificationService.cleanup();

    expect(unsubscribe).toHaveBeenCalled();
  });

  describe('notification trigger helpers', () => {
    test('notifyNewApplication uses job_application type', async () => {
      await notificationService.notifyNewApplication('client-1', 'Architect Name', 'Job Title', 'job-1');

      expect(mockAddDoc).toHaveBeenCalledWith(
        { path: 'notifications' },
        expect.objectContaining({
          userId: 'client-1',
          type: 'job_application',
          body: 'Architect Name applied for "Job Title"',
          data: { jobId: 'job-1' },
        })
      );
    });

    test('notifyApplicationAccepted uses application_accepted type', async () => {
      await notificationService.notifyApplicationAccepted('architect-1', 'Job Title', 'job-1');

      expect(mockAddDoc).toHaveBeenCalledWith(
        { path: 'notifications' },
        expect.objectContaining({ type: 'application_accepted', userId: 'architect-1' })
      );
    });

    test('notifyDrawingSubmitted uses drawing_submitted type', async () => {
      await notificationService.notifyDrawingSubmitted('client-1', 'Plans.pdf', 'job-1', 'sub-1');

      expect(mockAddDoc).toHaveBeenCalledWith(
        { path: 'notifications' },
        expect.objectContaining({
          type: 'drawing_submitted',
          data: { jobId: 'job-1', submissionId: 'sub-1' },
        })
      );
    });

    test('notifyAIReviewComplete notifies both client and architect', async () => {
      await notificationService.notifyAIReviewComplete('client-1', 'architect-1', 'Plans.pdf', 'passed', 'job-1', 'sub-1');

      expect(mockAddDoc).toHaveBeenCalledTimes(2);
      expect(mockAddDoc).toHaveBeenNthCalledWith(
        1,
        { path: 'notifications' },
        expect.objectContaining({ userId: 'client-1', type: 'ai_review_complete' })
      );
      expect(mockAddDoc).toHaveBeenNthCalledWith(
        2,
        { path: 'notifications' },
        expect.objectContaining({ userId: 'architect-1', type: 'ai_review_complete' })
      );
    });

    test('notifyAdminApproval uses admin_approval type', async () => {
      await notificationService.notifyAdminApproval('architect-1', 'Plans.pdf', 'job-1', 'sub-1');

      expect(mockAddDoc).toHaveBeenCalledWith(
        { path: 'notifications' },
        expect.objectContaining({ type: 'admin_approval', userId: 'architect-1' })
      );
    });

    test('notifyAdminRejection uses admin_rejection type', async () => {
      await notificationService.notifyAdminRejection('architect-1', 'Plans.pdf', 'job-1', 'sub-1');

      expect(mockAddDoc).toHaveBeenCalledWith(
        { path: 'notifications' },
        expect.objectContaining({ type: 'admin_rejection', userId: 'architect-1' })
      );
    });

    test('notifyPaymentReleased uses payment_released type', async () => {
      await notificationService.notifyPaymentReleased('architect-1', 5000, 'final', 'job-1');

      expect(mockAddDoc).toHaveBeenCalledWith(
        { path: 'notifications' },
        expect.objectContaining({ type: 'payment_released', userId: 'architect-1' })
      );
    });

    test('notifyNewMessage uses message type', async () => {
      await notificationService.notifyNewMessage('recipient-1', 'Sender', 'Job Title', 'job-1');

      expect(mockAddDoc).toHaveBeenCalledWith(
        { path: 'notifications' },
        expect.objectContaining({ type: 'message', userId: 'recipient-1' })
      );
    });

    test('notifyCouncilUpdate uses council_update type', async () => {
      await notificationService.notifyCouncilUpdate('client-1', 'Job Title', 'approved', 'job-1');

      expect(mockAddDoc).toHaveBeenCalledWith(
        { path: 'notifications' },
        expect.objectContaining({ type: 'council_update', userId: 'client-1' })
      );
    });
  });
});
