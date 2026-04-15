/**
 * Notification Bell Component
 * Displays unread notifications with dropdown panel
 */

import React, { useState, useEffect, useRef } from 'react';
import { notificationService } from '@/services/notificationService';
import { Notification, NotificationType } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, Check, X, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface NotificationBellProps {
  userId: string;
}

const NOTIFICATION_ICONS: Record<NotificationType, string> = {
  job_application: '👤',
  application_accepted: '✅',
  drawing_submitted: '📄',
  ai_review_complete: '🤖',
  admin_approval: '✅',
  admin_rejection: '❌',
  payment_released: '💰',
  message: '💬',
  milestone_due: '⏰',
  council_update: '🏛️',
};

export function NotificationBell({ userId }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId) return;

    // Subscribe to notifications
    const unsubscribe = notificationService.subscribeToNotifications(userId, (notifs) => {
      setNotifications(notifs);
      setUnreadCount(notifs.filter(n => !n.isRead).length);
    });

    // Initial unread count
    notificationService.getUnreadCount(userId).then(setUnreadCount);

    return () => {
      unsubscribe();
    };
  }, [userId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAsRead = async (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    try {
      await notificationService.markAsRead(notificationId);
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    setIsLoading(true);
    try {
      await notificationService.markAllAsRead(userId);
      toast.success('All notifications marked as read');
    } catch (error) {
      console.error('Failed to mark all as read:', error);
      toast.error('Failed to mark notifications as read');
    } finally {
      setIsLoading(false);
    }
  };

  const getNotificationLink = (notification: Notification): string => {
    const { data } = notification;
    if (data?.jobId) {
      return `#/jobs/${data.jobId}`;
    }
    return '#';
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      notificationService.markAsRead(notification.id);
    }
    setIsOpen(false);
    
    // Navigate to relevant page
    const link = getNotificationLink(notification);
    if (link && link !== '#') {
      window.location.href = link;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative rounded-full"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge 
            variant="destructive" 
            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
      </Button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-2xl shadow-2xl border border-border z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/30">
            <h3 className="font-heading font-bold text-lg">Notifications</h3>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllAsRead}
                disabled={isLoading}
                className="text-xs gap-1"
              >
                {isLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <Check className="h-3 w-3" />
                    Mark all read
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Notifications List */}
          <ScrollArea className="h-96">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <Bell className="h-12 w-12 mb-2 opacity-20" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 cursor-pointer hover:bg-secondary/30 transition-colors ${
                      !notification.isRead ? 'bg-primary/5' : ''
                    }`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl" role="img" aria-label="icon">
                        {NOTIFICATION_ICONS[notification.type] || '🔔'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-bold text-sm leading-tight">
                            {notification.title}
                          </p>
                          {!notification.isRead && (
                            <div className="h-2 w-2 bg-primary rounded-full flex-shrink-0 mt-1" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {notification.body}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {formatDistanceToNow(new Date(notification.createdAt), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                      {!notification.isRead && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100"
                          onClick={(e) => handleMarkAsRead(e, notification.id)}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          <div className="p-3 border-t border-border bg-secondary/30 text-center">
            <Button variant="ghost" size="sm" className="text-xs w-full" onClick={() => setIsOpen(false)}>
              View all notifications
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
