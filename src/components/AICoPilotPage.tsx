import React, { useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, ClipboardCheck, Loader2, Search, ShieldCheck, Sparkles } from 'lucide-react';
import type { AgentKnowledge, UserProfile } from '@/types';
import { getAllAgentKnowledge } from '@/services/knowledgeService';
import { SPECIALIZED_AGENTS } from '@/services/geminiService';
import AgentKnowledgeManager from './AgentKnowledgeManager';
import AdminAIReviewQueue from './AdminAIReviewQueue';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';

type LoadState = 'loading' | 'ready' | 'error';

export default function AICoPilotPage({ user, onNavigate }: { user: UserProfile; onNavigate?: (pageId: string) => void }) {
  const [state, setState] = useState<LoadState>('loading');
  const [activeKnowledge, setActiveKnowledge] = useState<AgentKnowledge[]>([]);
  const [pendingKnowledge, setPendingKnowledge] = useState<AgentKnowledge[]>([]);
  const [search, setSearch] = useState('');
  const [agentRole, setAgentRole] = useState('all');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setState('loading');
      try {
        const [active, pending] = await Promise.all([
          getAllAgentKnowledge('active'),
          user.role === 'admin' ? getAllAgentKnowledge('pending_review') : Promise.resolve([]),
        ]);
        if (!cancelled) {
          setActiveKnowledge(active);
          setPendingKnowledge(pending);
          setState('ready');
        }
      } catch (error) {
        console.error('Failed to load AI co-pilot governance data:', error);
        if (!cancelled) setState('error');
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user.role]);

  const filteredKnowledge = useMemo(() => {
    const term = search.trim().toLowerCase();
    return activeKnowledge
      .filter((entry) => agentRole === 'all' || entry.agentRole === agentRole || entry.agentId === agentRole)
      .filter((entry) => !term || [entry.title, entry.content, entry.agentRole, entry.discipline, entry.standardFamily, ...(entry.tags ?? [])].filter(Boolean).join(' ').toLowerCase().includes(term))
      .slice(0, 12);
  }, [activeKnowledge, agentRole, search]);

  const stats = useMemo(() => ({
    active: activeKnowledge.length,
    pending: pendingKnowledge.length,
    agentsWithKnowledge: new Set(activeKnowledge.map((entry) => entry.agentRole || entry.agentId)).size,
  }), [activeKnowledge, pendingKnowledge]);

  return (
    <div className="space-y-6" data-testid="ai-copilot-page">
      <section className="glass-panel rounded-2xl overflow-hidden" style={{ borderTop: '4px solid #7046a8' }}>
        <div className="p-6 border-b border-border/40">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <span className="glass-pill text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wide text-foreground-muted">AI Co-Pilot</span>
              <h1 className="font-heading text-3xl mt-3 flex items-center gap-3 tracking-[-0.045em] text-foreground"><Bot className="h-7 w-7 text-primary" /> Grounded AI workflow hub</h1>
              <p className="mt-2 max-w-3xl text-base text-foreground-muted">Production AI surfaces with verified knowledge, human-review governance, and direct links to drawing checks, tasks, and resource workflows. This page does not invent chatbot answers or bypass professional sign-off.</p>
            </div>
            <Badge className="capitalize w-fit">{user.role}</Badge>
          </div>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {state === 'loading' && <div className="md:col-span-3 flex items-center gap-2 text-sm text-foreground-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading AI governance records...</div>}
          {state === 'error' && <div className="md:col-span-3 text-sm text-destructive">Unable to load AI governance records. Check knowledge permissions.</div>}
          <MetricCard icon={<CheckCircle2 />} label="Active knowledge" value={stats.active} />
          <MetricCard icon={<ShieldCheck />} label="Pending review" value={user.role === 'admin' ? stats.pending : 'Admin only'} />
          <MetricCard icon={<Sparkles />} label="Agent roles with sources" value={stats.agentsWithKnowledge} />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="glass-panel rounded-2xl p-6 lg:col-span-2">
          <div className="mb-4">
            <h2 className="font-heading text-xl font-bold tracking-[-0.02em] text-foreground">Grounded knowledge search</h2>
            <p className="text-sm text-foreground-muted">Search active `agent_knowledge` records used to ground agent output. Empty states mean no fake knowledge is being injected.</p>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-3">
              <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-foreground-muted" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search active knowledge, standards, discipline, tags" className="pl-9" /></div>
              <select value={agentRole} onChange={(event) => setAgentRole(event.target.value)} className="h-11 rounded-xl border border-input bg-background px-3 text-sm">
                <option value="all">All agents</option>
                {SPECIALIZED_AGENTS.map((agent) => <option key={agent.role} value={agent.role}>{agent.name}</option>)}
              </select>
            </div>
            {filteredKnowledge.length === 0 ? <p className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-foreground-muted">No active knowledge matches this filter.</p> : filteredKnowledge.map((entry) => (
              <div key={entry.id} className="glass-record rounded-xl p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-foreground">{entry.title}</p><p className="mt-1 text-xs text-foreground-muted">Agent: {entry.agentRole || entry.agentId} · {entry.standardFamily || 'No standard family'} · {entry.discipline || 'No discipline'}</p></div><Badge variant="secondary">{entry.source}</Badge></div>
                <p className="mt-3 line-clamp-3 text-foreground-muted">{entry.content}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="glass-panel rounded-2xl p-6">
          <div className="mb-4">
            <h2 className="font-heading text-xl font-bold tracking-[-0.02em] text-foreground">AI workflow routing</h2>
            <p className="text-sm text-foreground-muted">Open the real modules that perform governed AI-assisted work.</p>
          </div>
          <div className="space-y-3">
            <WorkflowButton label="AI drawing checker" description="Upload drawings and generate preliminary AI review reports." onClick={() => onNavigate?.('drawing-checker')} />
            <WorkflowButton label="Tasks & approvals" description="Track missing information and human approvals." onClick={() => onNavigate?.('tasks')} />
            <WorkflowButton label="Resource centre" description="Use active knowledge and checklist records." onClick={() => onNavigate?.('resource-centre')} />
            <div className="glass-tile rounded-xl p-4 text-xs text-foreground-muted"><ClipboardCheck className="mb-2 h-4 w-4 text-primary" /><strong className="text-foreground">Governance:</strong> AI output is advisory. Professional, client, payment, contract, municipal, and admin approvals stay human-confirmed in their dedicated workflows.</div>
          </div>
        </section>
      </div>

      {user.role === 'admin' && (
        <>
          <section className="glass-panel rounded-2xl p-6">
            <div className="mb-4">
              <h2 className="font-heading text-xl font-bold tracking-[-0.02em] text-foreground">Admin AI output review queue</h2>
              <p className="text-sm text-foreground-muted">Admin-only production workflow for resolving AI action outputs that require human review. Resolutions go through the server API and can optionally record a human sign-off.</p>
            </div>
            <AdminAIReviewQueue />
          </section>
          <section className="glass-panel rounded-2xl p-6">
            <div className="mb-4">
              <h2 className="font-heading text-xl font-bold tracking-[-0.02em] text-foreground">Admin AI knowledge review</h2>
              <p className="text-sm text-foreground-muted">Admin-only production queue for approving, rejecting, editing, or deleting agent knowledge.</p>
            </div>
            <AgentKnowledgeManager user={user} />
          </section>
        </>
      )}
    </div>
  );
}

function WorkflowButton({ label, description, onClick }: { label: string; description: string; onClick?: () => void }) {
  return <Button type="button" variant="outline" className="h-auto w-full justify-start rounded-2xl p-4 text-left hover:border-primary/40 hover:bg-primary/5" onClick={onClick}><span><span className="block font-bold text-foreground">{label}</span><span className="block text-xs font-normal text-foreground-muted">{description}</span></span></Button>;
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return <div className="glass-tile rounded-xl p-5 space-y-2"><div className="flex items-center gap-2 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}<p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{label}</p></div><p className="text-2xl font-black tracking-[-0.04em] text-foreground">{value}</p></div>;
}
