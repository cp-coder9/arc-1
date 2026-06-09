/**
 * Architex Project Message Centre — Desktop communication surface
 *
 * Richer desktop view inside the Architex project workspace. Provides a
 * three-column layout: sidebar filters, message thread, and detail/action
 * panel. Reads the same Firestore records as the mobile ProjectChatApplet.
 *
 * This is not a separate desktop chat app — it is the desktop surface of
 * the shared Project Communication Engine.
 */

import React, { useMemo, useState } from 'react';
import type { Job, Message, ProjectStage, UserProfile } from '@/types';
import { getPhaseCommunicationUIConfig, PHASE_COMMUNICATION_UI_CONFIG } from './phaseConfig';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  AlertTriangle,
  Bot,
  FileText,
  MessageCircle,
  Paperclip,
  Search,
  ShieldCheck,
} from 'lucide-react';

// ── Props ───────────────────────────────────────────────────────────────

export interface ProjectMessageCentreProps {
  user: UserProfile;
  jobs: Job[];
  messages: Message[];
  selectedJobId?: string;
  onSelectJob?: (jobId: string) => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function messageAuthor(message: Message, user: UserProfile): string {
  if (message.senderId === user.uid) return 'You';
  return message.senderRole
    ? message.senderRole.replace('-', ' ')
    : 'Project participant';
}

function timestampLabel(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Component ───────────────────────────────────────────────────────────

export function ProjectMessageCentre({
  user,
  jobs,
  messages,
  selectedJobId,
  onSelectJob,
}: ProjectMessageCentreProps) {
  const [projectId, setProjectId] = useState(selectedJobId ?? jobs[0]?.id ?? '');
  const [phaseFilter, setPhaseFilter] = useState<ProjectStage | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selectedMessageId, setSelectedMessageId] = useState('');

  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === projectId),
    [jobs, projectId],
  );

  const config = useMemo(
    () => getPhaseCommunicationUIConfig(phaseFilter === 'all' ? 'delivery' : phaseFilter),
    [phaseFilter],
  );

  // Filter messages
  const filteredMessages = useMemo(() => {
    let result = [...messages];
    if (phaseFilter !== 'all') {
      result = result.filter((m) => m.phase === phaseFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((m) => m.content.toLowerCase().includes(q));
    }
    return result.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [messages, phaseFilter, search]);

  const selectedMessage = useMemo(
    () => filteredMessages.find((m) => m.id === selectedMessageId) ?? filteredMessages[0],
    [filteredMessages, selectedMessageId],
  );

  const handleProjectChange = (id: string) => {
    setProjectId(id);
    onSelectJob?.(id);
  };

  return (
    <Card
      className="grid min-h-[720px] overflow-hidden rounded-[2rem] border-border bg-card/95 shadow-sm lg:grid-cols-[18rem_1fr_22rem]"
      data-testid="project-message-centre"
    >
      {/* ── Left sidebar ── */}
      <aside className="flex flex-col border-r border-border bg-background p-4">
        <div className="mb-4 flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-lg">Message Centre</h2>
        </div>

        {/* Project selector */}
        <label className="mb-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Project
        </label>
        <select
          aria-label="Select project"
          className="mb-3 h-10 rounded-xl border border-input bg-background px-3 text-sm"
          value={projectId}
          onChange={(e) => handleProjectChange(e.target.value)}
        >
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {(job as unknown as { title?: string }).title ?? job.id}
            </option>
          ))}
        </select>

        {/* Phase filter */}
        <label className="mb-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Phase
        </label>
        <select
          aria-label="Filter by phase"
          className="mb-3 h-10 rounded-xl border border-input bg-background px-3 text-sm"
          value={phaseFilter}
          onChange={(e) =>
            setPhaseFilter(e.target.value as ProjectStage | 'all')
          }
        >
          <option value="all">All phases</option>
          {(Object.entries(PHASE_COMMUNICATION_UI_CONFIG) as [ProjectStage, typeof PHASE_COMMUNICATION_UI_CONFIG[ProjectStage]][]).map(([stage, cfg]) => (
            <option key={stage} value={stage}>
              {cfg.label}
            </option>
          ))}
        </select>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search messages…"
            className="h-10 rounded-xl pl-9 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* File focus */}
        <div className="flex-1">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            File focus — {config.label}
          </p>
          <div className="space-y-1.5">
            {config.fileFocus.map((item) => (
              <div
                key={item}
                className="rounded-xl border border-border bg-background p-2 text-sm text-muted-foreground"
              >
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* Summary stats */}
        <div className="mt-4 space-y-2 rounded-2xl border border-border bg-muted/30 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Messages</span>
            <strong>{filteredMessages.length}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Capture types</span>
            <strong>{config.captureItems.length}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Open actions</span>
            <strong>{config.nextActions.length}</strong>
          </div>
        </div>
      </aside>

      {/* ── Center: thread ── */}
      <main className="flex flex-col overflow-auto bg-muted/20 p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Project conversation
        </p>

        {filteredMessages.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No messages match the current filters.
          </p>
        )}

        <div className="flex-1 space-y-3">
          {filteredMessages.map((message) => (
            <button
              key={message.id}
              type="button"
              onClick={() => setSelectedMessageId(message.id)}
              className={`w-full rounded-2xl border p-4 text-left transition ${
                selectedMessage?.id === message.id
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-border bg-card hover:border-primary/20'
              }`}
            >
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold">
                  {messageAuthor(message, user)}
                </span>
                {message.phase && (
                  <Badge variant="outline" className="text-[10px]">
                    {message.phase}
                  </Badge>
                )}
                {message.captureType && (
                  <Badge variant="secondary" className="text-[10px]">
                    {message.captureType.replaceAll('_', ' ')}
                  </Badge>
                )}
                {message.structuredStatus === 'raw' && (
                  <Badge variant="destructive" className="text-[10px]">
                    unconverted
                  </Badge>
                )}
              </div>
              <p className="line-clamp-3 text-sm leading-relaxed">
                {message.content}
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {message.attachments?.length ? (
                  <span className="flex items-center gap-1">
                    <Paperclip className="h-3 w-3" /> {message.attachments.length}{' '}
                    files
                  </span>
                ) : null}
                {message.recordLinks?.length ? (
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />{' '}
                    {message.recordLinks.length} links
                  </span>
                ) : null}
                <span>{timestampLabel(message.createdAt)}</span>
              </div>
            </button>
          ))}
        </div>
      </main>

      {/* ── Right panel ── */}
      <aside className="flex flex-col border-l border-border bg-background p-4">
        {!selectedMessage ? (
          <p className="text-sm text-muted-foreground">
            Select a message to review details.
          </p>
        ) : (
          <div className="flex-1 space-y-4">
            {/* Project pulse */}
            <div className="rounded-2xl border border-border p-4">
              <h3 className="mb-3 font-heading text-sm">Project pulse</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current stage</span>
                  <strong>{config.label}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Open actions</span>
                  <strong>{config.nextActions.length}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Capture tools</span>
                  <strong>{config.captureItems.length}</strong>
                </div>
              </div>
            </div>

            {/* Structured detail */}
            <div className="rounded-2xl border border-border p-4">
              <h3 className="mb-2 font-heading text-sm">Structured detail</h3>
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {messageAuthor(selectedMessage, user)} &middot;{' '}
                {timestampLabel(selectedMessage.createdAt)}
              </p>
              <p className="rounded-xl bg-muted/60 p-3 text-sm leading-relaxed">
                {selectedMessage.content}
              </p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phase</span>
                  <strong>{selectedMessage.phase ?? '—'}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Capture type</span>
                  <strong>
                    {selectedMessage.captureType?.replaceAll('_', ' ') ?? 'chat'}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <strong>{selectedMessage.structuredStatus ?? 'raw'}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Attachments</span>
                  <strong>{selectedMessage.attachments?.length ?? 0}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Record links</span>
                  <strong>{selectedMessage.recordLinks?.length ?? 0}</strong>
                </div>
              </div>
            </div>

            {/* Suggested conversions */}
            <div className="rounded-2xl border border-border p-4">
              <h3 className="mb-2 font-heading text-sm">Convert to record</h3>
              <div className="space-y-2">
                {config.captureItems.slice(0, 5).map((item) => (
                  <Button
                    key={item}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start rounded-xl text-sm"
                  >
                    {item}
                  </Button>
                ))}
                <Button
                  size="sm"
                  className="w-full rounded-xl"
                >
                  Create action / record
                </Button>
              </div>
            </div>

            {/* AI suggested prompts */}
            <div className="rounded-2xl border border-border p-4">
              <h3 className="mb-1 flex items-center gap-2 font-heading text-sm">
                <Bot className="h-4 w-4 text-primary" /> AI: Suggested prompts
              </h3>
              <div className="mt-2 space-y-1.5">
                {config.suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="w-full rounded-xl bg-muted p-2.5 text-left text-xs transition hover:bg-primary/10"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300/40 bg-amber-50 p-2.5 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  AI suggestions require human approval before any formal output or
                  instruction is issued.
                </span>
              </div>
            </div>
          </div>
        )}
      </aside>
    </Card>
  );
}

export default ProjectMessageCentre;
