/**
 * Architex Project Chat Applet — Mobile-first communication surface
 *
 * WhatsApp-familiar chat interface with project/phase selectors, five tabs
 * (Chat, Capture, Actions, AI, Files), and a message composer. All tab
 * content is phase-aware: changing the selected project stage re-renders
 * capture tools, AI prompts, next actions, and file focus.
 *
 * Reads and writes through the shared projectCommunicationService so the
 * same record is visible on desktop via ProjectMessageCentre.
 */

import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Job, Message, ProjectStage, UserProfile } from '@/types';
import { PROJECT_STAGE_ORDER, PROJECT_STAGE_LABELS } from '@/types';
import { getPhaseCommunicationUIConfig } from './phaseConfig';
import { sendProjectCommunication } from './projectCommunicationService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, ShieldCheck, Smartphone, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

// ── Props ───────────────────────────────────────────────────────────────

export interface ProjectChatAppletProps {
  user: UserProfile;
  /** Jobs available to the current user. The first is the default. */
  jobs: Job[];
  /** Pre-selected job id override. */
  selectedJobId?: string;
  /** Messages already loaded (from parent or realtime subscription). */
  messages: Message[];
  /** Whether the current user can send messages. */
  canSend: boolean;
  /** Human-readable reason describing send permission. */
  permissionReason: string;
  /** Callback when the user sends a message. */
  onMessageSent?: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────

type AppletTab = 'chat' | 'capture' | 'actions' | 'ai' | 'files';

const TAB_LABELS: { key: AppletTab; label: string }[] = [
  { key: 'chat', label: 'Chat' },
  { key: 'capture', label: 'Capture' },
  { key: 'actions', label: 'Actions' },
  { key: 'ai', label: 'AI' },
  { key: 'files', label: 'Files' },
];

function messageAuthor(message: Message, user: UserProfile): string {
  if (message.senderId === user.uid) return 'You';
  return message.senderRole
    ? message.senderRole.replace('-', ' ')
    : 'Project participant';
}

// ── Component ───────────────────────────────────────────────────────────

export function ProjectChatApplet({
  user,
  jobs,
  selectedJobId,
  messages,
  canSend,
  permissionReason,
  onMessageSent,
}: ProjectChatAppletProps) {
  const [projectId, setProjectId] = useState(selectedJobId ?? jobs[0]?.id ?? '');
  const [phase, setPhase] = useState<ProjectStage>('delivery');
  const [tab, setTab] = useState<AppletTab>('chat');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === projectId) ?? jobs[0],
    [jobs, projectId],
  );

  const config = useMemo(() => getPhaseCommunicationUIConfig(phase), [phase]);

  // Sync phase when job changes
  useEffect(() => {
    const stage = (selectedJob as unknown as { currentStage?: ProjectStage })?.currentStage;
    if (stage) setPhase(stage);
  }, [selectedJob]);

  const handleSend = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSend || !draft.trim() || !selectedJob) return;
    setSending(true);
    try {
      await sendProjectCommunication({
        jobId: selectedJob.id,
        projectId: `project-${selectedJob.id}`,
        phase,
        structuredStatus: 'raw',
        senderId: user.uid,
        senderRole: user.role,
        content: draft.trim(),
      });
      setDraft('');
      toast.success('Message captured as a governed project record');
      onMessageSent?.();
    } catch (error) {
      console.warn('Project communication send failed:', error);
      toast.error('Message could not be sent. Check project membership.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card
      className="mx-auto flex h-[calc(100dvh-1rem)] max-w-md flex-col overflow-hidden rounded-[2rem] border-border bg-card/95 shadow-xl"
      data-testid="project-chat-applet"
    >
      {/* ── Header with project & phase selectors ── */}
      <CardHeader className="bg-primary px-4 pb-3 pt-4 text-primary-foreground">
        <div className="flex items-center justify-between">
          <div>
            <Badge
              variant="secondary"
              className="mb-1 uppercase tracking-widest"
            >
              <Smartphone className="mr-1 h-3 w-3" />
              {' '}ProjectChatApplet
            </Badge>
            <CardTitle className="font-heading text-lg">Architex Chat</CardTitle>
          </div>
          <span className="text-xs opacity-75">PWA applet</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <select
            aria-label="Select project"
            className="h-10 rounded-xl border border-white/20 bg-white/10 px-3 text-sm text-white"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {(job as unknown as { title?: string }).title ?? job.id}
              </option>
            ))}
          </select>
          <select
            aria-label="Select phase"
            className="h-10 rounded-xl border border-white/20 bg-white/10 px-3 text-sm text-white"
            value={phase}
            onChange={(e) => setPhase(e.target.value as ProjectStage)}
          >
            {PROJECT_STAGE_ORDER.map((stage) => (
              <option key={stage} value={stage}>
                {PROJECT_STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
        </div>
      </CardHeader>

      {/* ── Tabs ── */}
      <nav className="grid grid-cols-5 border-b border-border bg-background">
        {TAB_LABELS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`px-1 py-2.5 text-xs font-medium transition ${
              tab === key
                ? 'border-b-[3px] border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* ── Body ── */}
      <CardContent className="flex-1 space-y-3 overflow-auto p-4">
        {/* Project bar */}
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-primary/20 bg-primary/5 p-3">
          <div>
            <strong className="text-sm">
              {selectedJob
                ? (selectedJob as unknown as { title?: string }).title ?? `Job ${selectedJob.id}`
                : 'Select a project'}
            </strong>
            <br />
            <span className="text-xs text-muted-foreground">
              {config.label} &middot; Live
            </span>
          </div>
          <Badge variant="outline" className="text-xs">
            {config.label}
          </Badge>
        </div>

        {/* ── Chat tab ── */}
        {tab === 'chat' && (
          <div className="space-y-3">
            {messages.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No messages for this project yet. Start the conversation.
              </p>
            )}
            {messages.map((message) => {
              const mine = message.senderId === user.uid;
              return (
                <div
                  key={message.id}
                  className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[84%] rounded-2xl px-3 py-2 text-sm ${
                      mine
                        ? 'rounded-tr-md border border-primary/20 bg-primary/10'
                        : 'rounded-tl-md border border-border bg-card shadow-sm'
                    }`}
                  >
                    <div className="mb-1 flex flex-wrap gap-1.5 text-[10px] font-bold uppercase tracking-widest opacity-60">
                      <span>{messageAuthor(message, user)}</span>
                      {message.phase && <span>&middot; {message.phase}</span>}
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {message.content}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Capture tab ── */}
        {tab === 'capture' && (
          <div className="grid grid-cols-2 gap-2">
            {config.captureItems.map((item) => (
              <button
                key={item}
                type="button"
                className="rounded-xl border border-border bg-card p-3 text-left text-sm transition hover:border-primary/30 hover:bg-primary/5"
                onClick={() => {
                  setDraft(`[${item}] `);
                  setTab('chat');
                }}
              >
                <strong className="block text-foreground">{item}</strong>
                <small className="text-muted-foreground">
                  Capture as project record
                </small>
              </button>
            ))}
          </div>
        )}

        {/* ── Actions tab ── */}
        {tab === 'actions' && (
          <div className="space-y-2">
            {config.nextActions.map((action) => (
              <div
                key={action}
                className="rounded-2xl border border-border bg-card p-3"
              >
                <strong className="text-sm">{action}</strong>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Assign owner, due date and link to messages.
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── AI tab ── */}
        {tab === 'ai' && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="mb-1 font-heading text-base">Suggested prompts</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                Phase-aware prompts based on the selected project stage, latest
                messages, open actions and available project records.
              </p>
              <div className="space-y-2">
                {config.suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="w-full rounded-xl bg-muted p-3 text-left text-sm transition hover:bg-primary/10"
                    onClick={() => {
                      setDraft(prompt);
                      setTab('chat');
                    }}
                  >
                    <Sparkles className="mr-2 inline h-3.5 w-3.5 text-primary" />
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Files tab ── */}
        {tab === 'files' && (
          <div className="grid grid-cols-2 gap-2">
            {config.fileFocus.map((file) => (
              <button
                key={file}
                type="button"
                className="rounded-xl border border-border bg-card p-3 text-left text-sm transition hover:border-primary/30"
              >
                <strong className="block text-foreground">{file}</strong>
                <small className="text-muted-foreground">
                  Filed under {config.label}
                </small>
              </button>
            ))}
          </div>
        )}
      </CardContent>

      {/* ── Composer ── */}
      <form
        onSubmit={handleSend}
        className="flex gap-2 border-t border-border bg-background p-3"
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message the project team…"
          disabled={!canSend || sending}
          className="min-h-0 flex-1 resize-none rounded-full border border-input px-4 py-2.5 text-sm"
          rows={1}
        />
        <Button
          type="submit"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-full"
          disabled={!canSend || sending || !draft.trim()}
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          <span className="hidden md:inline">{permissionReason}</span>
        </div>
      </form>
    </Card>
  );
}

export default ProjectChatApplet;
