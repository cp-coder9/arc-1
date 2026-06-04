/**
 * ContextualMessageDrawer — Slide-out drawer for composing contextual messages.
 *
 * Opens from the right (or bottom on mobile) showing a pre-populated
 * message draft with context metadata. The user can review, edit, and
 * send before the drawer closes.
 */

import React, { useState, useCallback } from 'react';
import type { UserProfile } from '@/types';
import type { ContextualMessageDraft } from '@/types/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { messagingService } from '@/services/messagingService';
import { Loader2, Send, X } from 'lucide-react';
import { toast } from 'sonner';

// ── Props ------------------------------------------------------------------

export interface ContextualMessageDrawerProps {
  /** Whether the drawer is currently open. */
  open: boolean;
  /** Called to close the drawer. */
  onClose: () => void;
  /** The pre-built message draft from contextualMessagingService. */
  draft: ContextualMessageDraft | null;
  /** The current user. */
  user: UserProfile;
  /** The active job ID for scoping the message. */
  jobId?: string;
  /** Called after a message is successfully sent. */
  onSent?: () => void;
}

// ── Component --------------------------------------------------------------

export function ContextualMessageDrawer({
  open,
  onClose,
  draft,
  user,
  jobId,
  onSent,
}: ContextualMessageDrawerProps) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  // Sync body when draft changes
  React.useEffect(() => {
    if (draft) {
      setBody(draft.body);
    }
  }, [draft]);

  const handleSend = useCallback(async () => {
    if (!draft || !jobId || !body.trim()) return;

    setSending(true);
    try {
      await messagingService.sendContextualMessage({
        jobId,
        senderId: user.uid,
        senderRole: user.role,
        draft: { ...draft, body },
      });
      toast.success('Message sent and linked to context.');
      onClose();
      onSent?.();
    } catch (err) {
      toast.error('Failed to send message. Please try again.');
      console.error('Contextual message send error:', err);
    } finally {
      setSending(false);
    }
  }, [draft, jobId, body, user, onClose, onSent]);

  if (!open || !draft) return null;

  const ctx = draft.context;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="fixed bottom-0 right-0 z-50 w-full max-w-md h-[85vh] sm:h-full sm:top-0 sm:bottom-0 flex flex-col border-l border-border/70 bg-background shadow-2xl rounded-t-2xl sm:rounded-none animate-in slide-in-from-right">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4 shrink-0">
          <div>
            <CardTitle className="text-base">Contextual Message</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {ctx.projectName && `Project: ${ctx.projectName}`}
              {ctx.projectName && ctx.phaseName && ' · '}
              {ctx.phaseName && `Phase: ${ctx.phaseName}`}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="rounded-full" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>

        {/* Context metadata */}
        <div className="px-5 py-3 border-b border-border/70 space-y-2 shrink-0">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="text-[0.65rem]">
              {ctx.sourceObjectType.replace(/_/g, ' ')}
            </Badge>
            <Badge variant="outline" className="text-[0.65rem]">
              {ctx.sourceObjectId}
            </Badge>
            {ctx.status && (
              <Badge variant="outline" className="text-[0.65rem]">
                {ctx.status}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{ctx.summary}</p>
          <p className="text-[0.65rem] text-muted-foreground">
            Channel: {draft.targetChannel.replace(/_/g, ' ')} · Policy:{' '}
            {ctx.persistencePolicy.replace(/_/g, ' ')}
            {ctx.auditPolicy && ctx.auditPolicy !== 'none' && (
              <> · Audit: {ctx.auditPolicy.replace(/_/g, ' ')}</>
            )}
          </p>
        </div>

        {/* Editable message body */}
        <div className="flex-1 px-5 py-4 overflow-y-auto">
          <label className="text-xs font-bold text-muted-foreground mb-1 block">
            Your Message
          </label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-[160px] text-sm"
            placeholder="Type your message here..."
          />
          {draft.requiresUserApproval && (
            <p className="text-[0.65rem] text-muted-foreground mt-2">
              This message requires your explicit approval before sending.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border/70 px-5 py-4 shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={sending || !body.trim()}
            className="gap-1.5 rounded-full"
          >
            {sending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            {sending ? 'Sending...' : 'Send Message'}
          </Button>
        </div>
      </div>
    </>
  );
}
