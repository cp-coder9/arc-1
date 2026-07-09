import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Bird, MessageSquare, Plus, FolderOpen, Send, Loader2, Import } from 'lucide-react';
import type { UserProfile } from '@/types';
import type { ConversationThread, CopilotMessage, CopilotCapability } from '@/services/copilotTypes';
import { getCapabilitiesForRole } from '@/services/copilotService';

/**
 * CopilotPanel — Root Wingman AI assistant workspace panel.
 *
 * Renders inside the AppShell content area as a Command Centre module.
 * Manages active thread selection, session-scoped conversation persistence,
 * and project context display.
 *
 * Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.7
 */

export interface CopilotPanelProps {
  user: UserProfile;
  projectId?: string;
}

/** Session-scoped store for conversation state (survives re-navigation, cleared on tab close). */
const sessionThreads: Map<string, ConversationThread[]> = new Map();
const sessionMessages: Map<string, CopilotMessage[]> = new Map();

function getSessionKey(userId: string, projectId?: string): string {
  return `${userId}::${projectId ?? 'general'}`;
}

export default function CopilotPanel({ user, projectId }: CopilotPanelProps) {
  // Session-scoped state restoration
  const sessionKey = getSessionKey(user.uid, projectId);

  const [threads, setThreads] = useState<ConversationThread[]>(
    () => sessionThreads.get(sessionKey) ?? []
  );
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    () => {
      const restored = sessionThreads.get(sessionKey);
      return restored && restored.length > 0 ? restored[0].id : null;
    }
  );
  const [messages, setMessages] = useState<CopilotMessage[]>(
    () => sessionMessages.get(sessionKey) ?? []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Derive capabilities from user role
  const capabilities = React.useMemo(
    () => getCapabilitiesForRole(user.role),
    [user.role]
  );

  // Non-project-scoped capabilities only when no project
  const availableCapabilities = React.useMemo(() => {
    if (projectId) return capabilities;
    // General-assistance mode: only non-project-scoped capabilities
    const nonProjectScoped: CopilotCapability[] = ['explain_clause', 'flag_risk'];
    return capabilities.filter((c) => nonProjectScoped.includes(c));
  }, [capabilities, projectId]);

  // Persist state to session store on change
  useEffect(() => {
    sessionThreads.set(sessionKey, threads);
  }, [sessionKey, threads]);

  useEffect(() => {
    sessionMessages.set(sessionKey, messages);
  }, [sessionKey, messages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCreateThread = useCallback(() => {
    const newThread: ConversationThread = {
      id: `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      projectId: projectId ?? '',
      ownerUid: user.uid,
      title: 'New conversation',
      status: 'active',
      messageCount: 0,
      lastMessageAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setThreads((prev) => [newThread, ...prev]);
    setActiveThreadId(newThread.id);
    setMessages([]);
    setError(null);
  }, [projectId, user.uid]);

  const handleSelectThread = useCallback((threadId: string) => {
    setActiveThreadId(threadId);
    // In a full implementation, messages would be fetched from the API
    // For session persistence, messages are stored in a flat list keyed by thread
    setMessages([]);
    setError(null);
  }, []);

  const handleSendMessage = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;

    setError(null);

    // Create thread if none active
    let threadId = activeThreadId;
    if (!threadId) {
      const newThread: ConversationThread = {
        id: `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        projectId: projectId ?? '',
        ownerUid: user.uid,
        title: trimmed.slice(0, 60).replace(/\s+\S*$/, '') || trimmed.slice(0, 60),
        status: 'active',
        messageCount: 0,
        lastMessageAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setThreads((prev) => [newThread, ...prev]);
      setActiveThreadId(newThread.id);
      threadId = newThread.id;
    }

    const userMessage: CopilotMessage = {
      id: `msg_${Date.now()}_user`,
      threadId,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
      capability: null,
      provenanceId: null,
      truncated: false,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // In production, this would call the /api/copilot/message endpoint
      // For now, we simulate the loading state and allow the API layer
      // to be wired when endpoints are registered
      const response = await fetch('/api/copilot/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: trimmed,
          threadId,
          projectId: projectId ?? null,
          capability: null,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `Service unavailable (${response.status})`);
      }

      const data = await response.json();
      const assistantMessage: CopilotMessage = data.message ?? {
        id: `msg_${Date.now()}_assistant`,
        threadId,
        role: 'assistant',
        content: data.content ?? 'I received your message but could not generate a response.',
        timestamp: new Date().toISOString(),
        capability: null,
        provenanceId: data.provenanceId ?? null,
        truncated: false,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      // Update thread metadata
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? { ...t, messageCount: t.messageCount + 2, lastMessageAt: new Date().toISOString() }
            : t
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(msg);
      // Retain unsent message in input for retry (Requirement 1.8)
      setInputValue(trimmed);
      // Remove the optimistic user message on error
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, activeThreadId, projectId, user.uid]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  // Determine display mode
  const hasProject = Boolean(projectId);
  const hasCapabilities = availableCapabilities.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">WINGMAN</div>
            <h1>AI Copilot Workspace</h1>
            <p className="sub">
              Role-aware project assistant • {user.displayName} • {user.role.replace(/_/g, ' ')}
            </p>
          </div>
        </div>
        <div className="hero-pills">
          {hasProject && (
            <span className="pill">
              <span className="dot"></span> Project Active
            </span>
          )}
          {!hasProject && (
            <span className="pill pill-muted">
              <span className="dot"></span> General Mode
            </span>
          )}
          <span className="pill pill-success">
            <span className="dot"></span> {availableCapabilities.length} Capabilities
          </span>
        </div>
      </div>

      {/* Project context header — when project is selected */}
      {hasProject && (
        <div className="panel" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FolderOpen size={18} style={{ color: 'var(--teal)' }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                Active Project Context
              </p>
              <p style={{ fontSize: 11, color: 'var(--muted)' }}>
                Project ID: {projectId} • Role: {user.role.replace(/_/g, ' ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Project selector — when no project active but user has projects */}
      {!hasProject && hasCapabilities && (
        <div className="panel" style={{ padding: 18, textAlign: 'center' }}>
          <FolderOpen
            size={28}
            style={{ color: 'var(--muted)', margin: '0 auto 8px' }}
          />
          <p style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600, marginBottom: 4 }}>
            No project selected
          </p>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
            Select a project for full capabilities, or continue in general-assistance mode.
          </p>
          <button className="btn" type="button">
            Select Project
          </button>
        </div>
      )}

      {/* General-assistance mode notice — when no project-scoped capabilities */}
      {!hasProject && !hasCapabilities && (
        <div className="panel" style={{ padding: 18, textAlign: 'center' }}>
          <Bird size={28} style={{ color: 'var(--muted)', margin: '0 auto 8px' }} />
          <p style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600, marginBottom: 4 }}>
            General Assistance Mode
          </p>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>
            No projects available. Copilot capabilities require a professional role and active project context.
          </p>
        </div>
      )}

      {/* Main workspace layout: Thread list + Conversation */}
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 14, minHeight: 420 }}>
        {/* Thread list sidebar */}
        <div className="panel" style={{ padding: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h2 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--deep)', margin: 0 }}>
              Threads
            </h2>
            <button
              className="btn"
              type="button"
              style={{ padding: '4px 8px', fontSize: 11, height: 26 }}
              onClick={handleCreateThread}
              aria-label="New thread"
            >
              <Plus size={12} /> New
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {threads.length === 0 && (
              <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>
                No conversations yet. Start one below.
              </p>
            )}
            {threads
              .filter((t) => t.status === 'active')
              .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
              .slice(0, 50)
              .map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => handleSelectThread(thread.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: 'none',
                    cursor: 'pointer',
                    marginBottom: 4,
                    background: thread.id === activeThreadId ? 'var(--aqua)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {thread.title}
                  </p>
                  <p style={{ fontSize: 10, color: 'var(--muted)', margin: '2px 0 0' }}>
                    {thread.messageCount} messages
                  </p>
                </button>
              ))}
          </div>
        </div>

        {/* Conversation area */}
        <div className="panel" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Message history */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
            {messages.length === 0 && !activeThreadId && (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <Bird size={40} style={{ color: 'var(--teal)', margin: '0 auto 12px' }} />
                <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
                  Welcome to Wingman
                </h3>
                <p style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 340, margin: '0 auto' }}>
                  Your role-aware AI assistant for project intelligence. Ask a question or select a capability to get started.
                </p>
              </div>
            )}

            {messages.length === 0 && activeThreadId && (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <MessageSquare size={28} style={{ color: 'var(--muted)', margin: '0 auto 12px' }} />
                <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                  Start the conversation. Type a message below.
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    maxWidth: '75%',
                    padding: '10px 14px',
                    borderRadius: 12,
                    background: msg.role === 'user' ? 'var(--aqua)' : 'rgba(255,255,255,.9)',
                    border: `1px solid ${msg.role === 'user' ? 'var(--mint)' : 'var(--border)'}`,
                  }}
                >
                  {msg.role === 'assistant' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Bird size={14} style={{ color: 'var(--teal)' }} />
                      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--deep)', textTransform: 'uppercase' }}>
                        Wingman
                      </span>
                      {msg.provenanceId && (
                        <span
                          style={{
                            fontSize: 9,
                            padding: '1px 5px',
                            borderRadius: 4,
                            background: 'var(--mint)',
                            color: 'var(--deep)',
                            fontWeight: 500,
                          }}
                        >
                          AI
                        </span>
                      )}
                    </div>
                  )}
                  <p style={{ fontSize: 13, color: 'var(--ink)', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {msg.content}
                  </p>
                  <p style={{ fontSize: 10, color: 'var(--muted)', margin: '4px 0 0', textAlign: 'right' }}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}

            {isLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
                <Loader2 size={16} style={{ color: 'var(--teal)', animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Wingman is thinking...</span>
              </div>
            )}

            {error && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'rgba(217,87,71,.06)',
                  border: '1px solid rgba(217,87,71,.18)',
                  marginTop: 8,
                }}
              >
                <p style={{ fontSize: 12, color: 'var(--red)', margin: 0 }}>
                  {error}
                </p>
                <button
                  type="button"
                  className="btn-danger"
                  style={{ marginTop: 6, fontSize: 11, padding: '4px 10px', height: 24, borderRadius: 6 }}
                  onClick={handleSendMessage}
                >
                  Retry
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div
            style={{
              borderTop: '1px solid var(--border)',
              padding: 12,
              display: 'flex',
              alignItems: 'flex-end',
              gap: 8,
            }}
          >
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                hasProject
                  ? 'Ask your Wingman...'
                  : 'Ask a general question (select a project for full capabilities)...'
              }
              rows={2}
              style={{
                flex: 1,
                resize: 'none',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '8px 12px',
                fontSize: 13,
                fontFamily: 'inherit',
                color: 'var(--ink)',
                background: 'rgba(255,255,255,.6)',
                outline: 'none',
              }}
              disabled={isLoading}
              aria-label="Message input"
            />
            <button
              className="btn"
              type="button"
              onClick={handleSendMessage}
              disabled={isLoading || !inputValue.trim()}
              style={{ height: 36, width: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              aria-label="Send message"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Import panel access button */}
      {hasProject && (
        <div className="panel" style={{ padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
              Bring Your Own AI
            </p>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 0' }}>
              Import AI-generated content from external tools with provenance tagging.
            </p>
          </div>
          <button className="btn btn-secondary" type="button" style={{ fontSize: 11, height: 30 }}>
            <Import size={14} style={{ marginRight: 4 }} /> Import Content
          </button>
        </div>
      )}
    </div>
  );
}
