/**
 * ConversationView — Main copilot conversation interface.
 *
 * Displays message history, capability selector, and text input.
 * Handles message submission, retry on error, and loading states.
 *
 * @requirements 1.2, 1.8, 1.9, 5.5
 */

import React, { useState, useRef, useEffect } from 'react';
import { Send, RefreshCw, ChevronDown } from 'lucide-react';
import type { CopilotMessage, CopilotCapability } from '@/services/copilotTypes';
import MessageHistory from './MessageHistory';

interface ConversationViewProps {
  messages: CopilotMessage[];
  capabilities: CopilotCapability[];
  onSendMessage: (prompt: string, capability: CopilotCapability) => Promise<void>;
  onLoadMore?: () => void;
  hasMoreMessages?: boolean;
  isLoading?: boolean;
  error?: string | null;
}

export default function ConversationView({
  messages,
  capabilities,
  onSendMessage,
  onLoadMore,
  hasMoreMessages = false,
  isLoading = false,
  error = null,
}: ConversationViewProps) {
  const [prompt, setPrompt] = useState('');
  const [selectedCapability, setSelectedCapability] = useState<CopilotCapability>(capabilities[0] || 'summarise_status');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!prompt.trim() || prompt.trim().length < 3) return;
    setIsSending(true);
    setSendError(null);
    try {
      await onSendMessage(prompt, selectedCapability);
      setPrompt('');
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send message. Please retry.');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
      {/* Message history area */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 0' }}>
        {hasMoreMessages && (
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <button className="btn-secondary" onClick={onLoadMore} style={{ fontSize: 11, padding: '4px 12px' }}>
              Load older messages
            </button>
          </div>
        )}
        <MessageHistory messages={messages} isLoading={isLoading} />
      </div>

      {/* Error indication */}
      {(error || sendError) && (
        <div style={{ padding: '8px 14px', color: 'var(--red)', fontSize: 12, background: 'rgba(217,87,71,.04)', borderTop: '1px solid var(--border)' }}>
          {error || sendError}
          {sendError && (
            <button onClick={handleSend} style={{ marginLeft: 8, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11 }}>
              <RefreshCw size={11} /> Retry
            </button>
          )}
        </div>
      )}

      {/* Input area */}
      <div style={{ borderTop: '1px solid var(--border)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Capability selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <select
              value={selectedCapability}
              onChange={(e) => setSelectedCapability(e.target.value as CopilotCapability)}
              style={{
                appearance: 'none', background: 'var(--aqua)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '4px 24px 4px 8px', fontSize: 11, color: 'var(--deep)',
                cursor: 'pointer',
              }}
            >
              {capabilities.map((cap) => (
                <option key={cap} value={cap}>{cap.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <ChevronDown size={12} style={{ position: 'absolute', right: 6, pointerEvents: 'none', color: 'var(--muted)' }} />
          </div>
        </div>

        {/* Text input + send */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask your Wingman..."
            rows={2}
            style={{
              flex: 1, resize: 'none', border: '1px solid var(--border)', borderRadius: 10,
              padding: '10px 12px', fontSize: 13, fontFamily: 'var(--font)', color: 'var(--ink)',
              background: 'rgba(255,255,255,.7)', outline: 'none',
            }}
            disabled={isSending}
          />
          <button
            className="btn"
            onClick={handleSend}
            disabled={isSending || !prompt.trim() || prompt.trim().length < 3}
            style={{ height: 40, width: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
