/**
 * ThreadList — Copilot conversation thread list component.
 *
 * Displays thread summaries sorted by last message timestamp descending.
 * Supports creating new threads with 100-thread limit enforcement.
 *
 * @requirements 4.3, 4.9
 */

import { useState } from 'react';
import { Plus, MessageSquare } from 'lucide-react';
import type { ConversationThread } from '@/services/copilotTypes';

interface ThreadListProps {
  threads: ConversationThread[];
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onCreateThread: () => void;
  threadLimitReached?: boolean;
  isLoading?: boolean;
}

export default function ThreadList({
  threads,
  activeThreadId,
  onSelectThread,
  onCreateThread,
  threadLimitReached = false,
  isLoading = false,
}: ThreadListProps) {
  const [showLimitError, setShowLimitError] = useState(false);

  const handleNewThread = () => {
    if (threadLimitReached) {
      setShowLimitError(true);
      setTimeout(() => setShowLimitError(false), 3000);
      return;
    }
    onCreateThread();
  };

  const formatTimestamp = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
  };

  return (
    <div className="panel" style={{ padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--deep)', margin: 0 }}>Threads</h2>
        <button className="btn" onClick={handleNewThread} style={{ padding: '4px 10px', fontSize: 12 }}>
          <Plus size={14} /> New
        </button>
      </div>

      {showLimitError && (
        <div style={{ color: 'var(--red)', fontSize: 11, marginBottom: 8, padding: '6px 8px', background: 'rgba(217,87,71,.06)', borderRadius: 6 }}>
          Thread limit reached (100 max). Archive old threads to create new ones.
        </div>
      )}

      {isLoading && <div style={{ color: 'var(--muted)', fontSize: 12, padding: 12, textAlign: 'center' }}>Loading...</div>}

      {!isLoading && threads.length === 0 && (
        <div style={{ color: 'var(--muted)', fontSize: 12, padding: 12, textAlign: 'center' }}>
          No conversations yet. Start a new thread.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {threads.map((thread) => (
          <button
            key={thread.id}
            onClick={() => onSelectThread(thread.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', borderRadius: 8, border: 'none',
              background: activeThreadId === thread.id ? 'var(--aqua)' : 'transparent',
              cursor: 'pointer', textAlign: 'left', width: '100%',
              transition: 'background 0.15s',
            }}
          >
            <MessageSquare size={14} style={{ color: 'var(--teal)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--ink)', fontWeight: activeThreadId === thread.id ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {thread.title || 'Untitled'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 6 }}>
                <span>{thread.messageCount} msgs</span>
                <span>{formatTimestamp(thread.lastMessageAt)}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
