/**
 * Chat Component
 * Real-time messaging between client and architect per job
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { messagingService } from '@/services/messagingService';
import { notificationService } from '@/services/notificationService';
import { Message, UserProfile, Job } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Send, Paperclip, MessageCircle, X, FileText, Image as ImageIcon } from 'lucide-react';
import { format } from 'date-fns';
import { put } from '@vercel/blob';
import { toast } from 'sonner';

interface ChatProps {
  job: Job;
  currentUser: UserProfile;
  otherUser: UserProfile | null;
  isOpen: boolean;
  onClose: () => void;
}

interface MessageGroup {
  date: string;
  messages: Message[];
}

export function Chat({ job, currentUser, otherUser, isOpen, onClose }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Subscribe to messages
  useEffect(() => {
    if (!isOpen || !job.id) return;

    const unsubscribeMessages = messagingService.subscribeToMessages(
      job.id,
      (msgs) => {
        setMessages(msgs);
      }
    );

    const unsubscribeUnread = messagingService.subscribeToConversation(
      job.id,
      currentUser.uid,
      (count) => {
        setUnreadCount(count);
      }
    );

    // Mark messages as read when opening
    messagingService.markMessagesAsRead(job.id, currentUser.uid);
    messagingService.resetUnreadCount(job.id, currentUser.uid);

    return () => {
      unsubscribeMessages();
      unsubscribeUnread();
    };
  }, [isOpen, job.id, currentUser.uid]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || isSending) return;

    setIsSending(true);
    try {
      await messagingService.sendMessage({
        jobId: job.id,
        senderId: currentUser.uid,
        senderRole: currentUser.role,
        content: newMessage.trim(),
      });

      // Notify the other user
      if (otherUser) {
        await notificationService.notifyNewMessage(
          otherUser.uid,
          currentUser.displayName,
          job.title,
          job.id
        );
      }

      setNewMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    setIsUploading(true);
    try {
      const blob = await put(file.name, file, {
        access: 'public',
        token: import.meta.env.VITE_BLOB_READ_WRITE_TOKEN,
        addRandomSuffix: true,
      });

      await messagingService.sendMessage({
        jobId: job.id,
        senderId: currentUser.uid,
        senderRole: currentUser.role,
        content: `Attached: ${file.name}`,
        attachments: [{
          name: file.name,
          url: blob.url,
          type: file.type,
        }],
      });

      // Notify the other user
      if (otherUser) {
        await notificationService.notifyNewMessage(
          otherUser.uid,
          currentUser.displayName,
          job.title,
          job.id
        );
      }
    } catch (error) {
      console.error('Failed to upload file:', error);
      toast.error('Failed to upload file');
    } finally {
      setIsUploading(false);
    }
  };

  const groupMessagesByDate = (messages: Message[]): MessageGroup[] => {
    const groups: MessageGroup[] = [];
    let currentGroup: MessageGroup | null = null;

    messages.forEach((message) => {
      const messageDate = format(new Date(message.createdAt), 'MMMM d, yyyy');
      
      if (!currentGroup || currentGroup.date !== messageDate) {
        currentGroup = { date: messageDate, messages: [] };
        groups.push(currentGroup);
      }
      currentGroup.messages.push(message);
    });

    return groups;
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <ImageIcon className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  const messageGroups = groupMessagesByDate(messages);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl h-[80vh] flex flex-col p-0 overflow-hidden rounded-2xl">
        {/* Header */}
        <DialogHeader className="p-4 border-b border-border bg-secondary/30 flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary text-primary-foreground">
                {otherUser?.displayName?.[0] || '?'}
              </AvatarFallback>
            </Avatar>
            <div>
              <DialogTitle className="text-lg font-heading font-bold">
                {otherUser?.displayName || 'Chat'}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                {job.title}
              </p>
            </div>
          </div>
          {unreadCount > 0 && (
            <Badge variant="secondary" className="gap-1">
              <MessageCircle className="h-3 w-3" />
              {unreadCount} unread
            </Badge>
          )}
        </DialogHeader>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {messageGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <MessageCircle className="h-12 w-12 mb-2 opacity-20" />
              <p className="text-sm">No messages yet</p>
              <p className="text-xs">Start the conversation!</p>
            </div>
          ) : (
            <div className="space-y-6">
              {messageGroups.map((group, groupIndex) => (
                <div key={groupIndex}>
                  {/* Date separator */}
                  <div className="flex justify-center mb-4">
                    <span className="text-xs text-muted-foreground bg-secondary/50 px-3 py-1 rounded-full">
                      {group.date}
                    </span>
                  </div>

                  {/* Messages */}
                  <div className="space-y-4">
                    {group.messages.map((message) => {
                      const isOwn = message.senderId === currentUser.uid;
                      
                      return (
                        <div
                          key={message.id}
                          className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] ${
                              isOwn
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-secondary text-secondary-foreground'
                            } rounded-2xl px-4 py-2`}
                          >
                            {/* Message content */}
                            <p className="text-sm leading-relaxed">{message.content}</p>

                            {/* Attachments */}
                            {message.attachments && message.attachments.length > 0 && (
                              <div className="mt-2 space-y-2">
                                {message.attachments.map((attachment, idx) => (
                                  <a
                                    key={idx}
                                    href={attachment.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`flex items-center gap-2 p-2 rounded-lg ${
                                      isOwn ? 'bg-primary-foreground/10' : 'bg-background/50'
                                    } hover:opacity-80 transition-opacity`}
                                  >
                                    {getFileIcon(attachment.type)}
                                    <span className="text-xs truncate flex-1">
                                      {attachment.name}
                                    </span>
                                  </a>
                                ))}
                              </div>
                            )}

                            {/* Timestamp and read status */}
                            <div className={`flex items-center gap-1 mt-1 ${
                              isOwn ? 'justify-end' : 'justify-start'
                            }`}>
                              <span className="text-[10px] opacity-70">
                                {format(new Date(message.createdAt), 'HH:mm')}
                              </span>
                              {isOwn && message.isRead && (
                                <span className="text-[10px] opacity-70">✓✓</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Input */}
        <div className="p-4 border-t border-border bg-white">
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileSelect}
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <Paperclip className="h-5 w-5" />
            </Button>
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Type a message..."
              className="flex-1"
              disabled={isSending || isUploading}
            />
            <Button
              onClick={handleSendMessage}
              disabled={!newMessage.trim() || isSending || isUploading}
              size="icon"
            >
              {isSending ? (
                <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Chat Button Component
 * Displays chat icon with unread count for a job
 */
interface ChatButtonProps {
  jobId: string;
  userId: string;
  onClick: () => void;
}

export function ChatButton({ jobId, userId, onClick }: ChatButtonProps) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const unsubscribe = messagingService.subscribeToConversation(
      jobId,
      userId,
      (count) => {
        setUnreadCount(count);
      }
    );

    return () => unsubscribe();
  }, [jobId, userId]);

  return (
    <Button variant="outline" size="sm" className="gap-2 relative" onClick={onClick}>
      <MessageCircle className="h-4 w-4" />
      Chat
      {unreadCount > 0 && (
        <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 p-0 text-xs">
          {unreadCount}
        </Badge>
      )}
    </Button>
  );
}
