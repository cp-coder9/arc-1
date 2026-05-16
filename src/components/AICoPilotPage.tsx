import React, { useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, ClipboardCheck, Loader2, Search, ShieldCheck, Sparkles } from 'lucide-react';
import type { AgentKnowledge, UserProfile } from '@/types';
import { getAllAgentKnowledge } from '@/services/knowledgeService';
import { SPECIALIZED_AGENTS } from '@/services/geminiService';
import AgentKnowledgeManager from './AgentKnowledgeManager';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
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
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">AI Co-Pilot</Badge>
              <CardTitle className="font-heading text-3xl mt-3 flex items-center gap-3"><Bot className="h-7 w-7 text-primary" /> Grounded AI workflow hub</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">Production AI surfaces with verified knowledge, human-review governance, and direct links to drawing checks, tasks, and resource workflows. This page does not invent chatbot answers or bypass professional sign-off.</CardDescription>
            </div>
            <Badge className="capitalize w-fit">{user.role}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {state === 'loading' && <div className="md:col-span-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading AI governance records...</div>}
          {state === 'error' && <div className="md:col-span-3 text-sm text-destructive">Unable to load AI governance records. Check knowledge permissions.</div>}
          <MetricCard icon={<CheckCircle2 />} label="Active knowledge" value={stats.active} />
          <MetricCard icon={<ShieldCheck />} label="Pending review" value={user.role === 'admin' ? stats.pending : 'Admin only'} />
          <MetricCard icon={<Sparkles />} label="Agent roles with sources" value={stats.agentsWithKnowledge} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="rounded-2xl border-border bg-card/90 shadow-sm lg:col-span-2">
          <CardHeader><CardTitle className="font-heading text-xl">Grounded knowledge search</CardTitle><CardDescription>Search active `agent_knowledge` records used to ground agent output. Empty states mean no fake knowledge is being injected.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-3">
              <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search active knowledge, standards, discipline, tags" className="pl-9" /></div>
              <select value={agentRole} onChange={(event) => setAgentRole(event.target.value)} className="h-11 rounded-xl border border-input bg-background px-3 text-sm">
                <option value="all">All agents</option>
                {SPECIALIZED_AGENTS.map((agent) => <option key={agent.role} value={agent.role}>{agent.name}</option>)}
              </select>
            </div>
            {filteredKnowledge.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No active knowledge matches this filter.</p> : filteredKnowledge.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-border p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{entry.title}</p><p className="mt-1 text-xs text-muted-foreground">Agent: {entry.agentRole || entry.agentId} · {entry.standardFamily || 'No standard family'} · {entry.discipline || 'No discipline'}</p></div><Badge variant="secondary">{entry.source}</Badge></div>
                <p className="mt-3 line-clamp-3 text-muted-foreground">{entry.content}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader><CardTitle className="font-heading text-xl">AI workflow routing</CardTitle><CardDescription>Open the real modules that perform governed AI-assisted work.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <WorkflowButton label="AI drawing checker" description="Upload drawings and generate preliminary AI review reports." onClick={() => onNavigate?.('drawing-checker')} />
            <WorkflowButton label="Tasks & approvals" description="Track missing information and human approvals." onClick={() => onNavigate?.('tasks')} />
            <WorkflowButton label="Resource centre" description="Use active knowledge and checklist records." onClick={() => onNavigate?.('resource-centre')} />
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900"><ClipboardCheck className="mb-2 h-4 w-4" /><strong>Governance:</strong> AI output is advisory. Professional, client, payment, contract, municipal, and admin approvals stay human-confirmed in their dedicated workflows.</div>
          </CardContent>
        </Card>
      </div>

      {user.role === 'admin' && (
        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader><CardTitle className="font-heading text-xl">Admin AI knowledge review</CardTitle><CardDescription>Admin-only production queue for approving, rejecting, editing, or deleting agent knowledge.</CardDescription></CardHeader>
          <CardContent><AgentKnowledgeManager user={user} /></CardContent>
        </Card>
      )}
    </div>
  );
}

function WorkflowButton({ label, description, onClick }: { label: string; description: string; onClick?: () => void }) {
  return <Button type="button" variant="outline" className="h-auto w-full justify-start rounded-2xl p-4 text-left" onClick={onClick}><span><span className="block font-bold">{label}</span><span className="block text-xs font-normal text-muted-foreground">{description}</span></span></Button>;
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-background/70 p-4"><div className="flex items-center gap-2 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}<p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p></div><p className="mt-3 font-heading text-3xl font-black">{value}</p></div>;
}
