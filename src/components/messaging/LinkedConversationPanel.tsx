/**
 * LinkedConversationPanel — Shows conversation thread linked to a workflow item.
 *
 * Displays messages that have been linked to a specific workflow object
 * (via recordLinks) so users can see the full conversation history
 * related to an RFI, snag, CPD assessment, etc.
 */

import React, { useEffect, useState } from 'react';
import type { Message, UserProfile } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, MessageCircle } from 'lucide-react';
import { messagingService } from '@/services/messagingService';
import { safeFormat } from '@/lib/utils';

// ── Props ------------------------------------------------------------------

export interface LinkedConversationPanelProps {
  /** The project/job ID for scoped message retrieval. */
  jobId: string;
  /** The source object type to filter by. */
  sourceObjectType: string;
  /** The source object ID to filter by. */
  sourceObjectId: string;
  /** The current user (for sender attribution). */
  user: UserProfile;
  /** Whether the panel is visible. */
  visible?: boolean;
}

// ── Component --------------------------------------------------------------

export function LinkedConversationPanel({
  jobId,
  sourceObjectType,
  sourceObjectId,
  user,
  visible = true,
}: LinkedConversationPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible || !jobId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = messagingService.subscribeToMessages(jobId, (msgs) => {
      // Filter messages that have recordLinks matching this source object
      const linked = msgs.filter((msg) =>
        msg.recordLinks?.some(
          (link) =>
            link.recordType === sourceObjectType &&
            link.recordId === sourceObjectId,
        ),
      );
      setMessages(linked);
      setLoading(false);
    });

    return () => unsub();
  }, [jobId, sourceObjectType, sourceObjectId, visible]);

  if (!visible) return null;

  return (
    <Card className="beos-section-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageCircle size={16} />
          Linked Conversation
          {messages.length > 0 && (
            <Badge variant="secondary" className="text-[0.65rem]">
              {messages.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            No linked messages yet. Use the message button to start a conversation.
          </p>
        ) : (
          <ScrollArea className="max-h-48">
            <div className="space-y-2">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`text-xs p-2 rounded-lg ${
                    msg.senderId === user.uid
                      ? 'bg-primary/5 ml-4'
                      : 'bg-muted mr-4'
                  }`}
                >
                  <p className="text-[0.65rem] font-bold text-muted-foreground mb-0.5">
                    {msg.senderId === user.uid ? 'You' : msg.senderRole}
                    <span className="font-normal ml-2">
                      {safeFormat(msg.createdAt, 'PP p')}
                    </span>
                  </p>
                  <p className="leading-relaxed whitespace-pre-wrap">
                    {msg.content.length > 200
                      ? msg.content.slice(0, 200) + '...'
                      : msg.content}
                  </p>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
