/**
 * MessageHistory — Renders user and assistant message bubbles.
 *
 * Includes ProvenanceBadge and DisclaimerTag on assistant messages.
 * Uses a bird icon avatar for the Wingman identity.
 *
 * @requirements 1.2, 1.9, 5.5, 12.3
 */

import { Bird, User } from 'lucide-react';
import type { CopilotMessage } from '@/services/copilotTypes';

interface MessageHistoryProps {
  messages: CopilotMessage[];
  isLoading?: boolean;
}

function ProvenanceBadge({ provenanceId }: { provenanceId: string | null }) {
  if (!provenanceId) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 9, color: 'var(--deep)', background: 'var(--mint)',
      padding: '2px 6px', borderRadius: 4, fontWeight: 500,
    }}>
      ◈ AI Provenance
    </span>
  );
}

function DisclaimerTag() {
  return (
    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6, fontStyle: 'italic' }}>
      AI-generated content. Review before professional use.
    </div>
  );
}

function UserMessage({ message }: { message: CopilotMessage }) {
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginBottom: 14 }}>
      <div style={{
        maxWidth: '75%', padding: '10px 14px', borderRadius: '14px 14px 4px 14px',
        background: 'var(--aqua)', color: 'var(--ink)', fontSize: 13, lineHeight: 1.5,
      }}>
        {message.content}
      </div>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', background: 'var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <User size={14} style={{ color: 'var(--muted)' }} />
      </div>
    </div>
  );
}

function AssistantMessage({ message }: { message: CopilotMessage }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', background: 'var(--mint)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Bird size={14} style={{ color: 'var(--deep)' }} />
      </div>
      <div style={{ maxWidth: '75%' }}>
        <div style={{
          padding: '10px 14px', borderRadius: '14px 14px 14px 4px',
          background: 'rgba(255,255,255,.74)', border: '1px solid var(--border)',
          color: 'var(--ink)', fontSize: 13, lineHeight: 1.5,
          boxShadow: 'var(--soft)',
        }}>
          <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
          {message.truncated && (
            <div style={{ fontSize: 10, color: 'var(--amber)', marginTop: 4 }}>
              Response was truncated.
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <ProvenanceBadge provenanceId={message.provenanceId} />
          {message.capability && (
            <span style={{ fontSize: 9, color: 'var(--muted)' }}>
              {message.capability.replace(/_/g, ' ')}
            </span>
          )}
        </div>
        <DisclaimerTag />
      </div>
    </div>
  );
}

export default function MessageHistory({ messages, isLoading = false }: MessageHistoryProps) {
  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 24, color: 'var(--muted)', fontSize: 12 }}>
        <Bird size={20} style={{ color: 'var(--teal)', marginBottom: 8 }} />
        <div>Thinking...</div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
        <Bird size={32} style={{ color: 'var(--mint)', marginBottom: 12 }} />
        <div style={{ fontSize: 13 }}>Start a conversation with your Wingman</div>
        <div style={{ fontSize: 11, marginTop: 4 }}>Select a capability and ask a question</div>
      </div>
    );
  }

  return (
    <div>
      {messages.map((msg) =>
        msg.role === 'user'
          ? <UserMessage key={msg.id} message={msg} />
          : <AssistantMessage key={msg.id} message={msg} />
      )}
    </div>
  );
}
