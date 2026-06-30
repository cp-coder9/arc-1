import React, { useMemo, useState } from 'react';
import type { UserProfile } from '@/types';
import type { SpecForgeWorkspace } from '@/types/specforgeTypes';
import { getVisibleSpecItems, summarizeSpecBudget } from '@/services/specforge/specforgeService';

interface Props {
  user: UserProfile;
  workspace: SpecForgeWorkspace;
}

export default function SpecForgeWorkspace({ user, workspace }: Props) {
  const [room, setRoom] = useState('all');
  const [pkg, setPkg] = useState('all');
  const visibleItems = useMemo(() => {
    return getVisibleSpecItems(workspace, user.role as any).filter(item =>
      (room === 'all' || item.room === room) && (pkg === 'all' || item.package === pkg)
    );
  }, [workspace, user.role, room, pkg]);
  const summary = useMemo(() => summarizeSpecBudget(visibleItems), [visibleItems]);
  const rooms = [...new Set(workspace.items.map(item => item.room))];
  const packages = [...new Set(workspace.items.map(item => item.package))];

  return (
    <div className="space-y-6" data-testid="specforge-workspace">
      <header className="rounded-3xl border bg-card p-6">
        <p className="text-xs uppercase tracking-widest text-primary">SpecForge</p>
        <h1 className="font-heading text-3xl font-bold">{workspace.projectName}</h1>
        <p className="text-muted-foreground">{workspace.profile} · Revision {workspace.revision}</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label="Allowance" value={`R${summary.allowance.toLocaleString('en-ZA')}`} />
        <Stat label="Estimate" value={`R${summary.estimate.toLocaleString('en-ZA')}`} />
        <Stat label="Delta" value={`R${summary.delta.toLocaleString('en-ZA')}`} />
        <Stat label="Long lead" value={String(summary.longLeadItems.length)} />
      </section>
      <section className="flex flex-wrap gap-3">
        <select className="rounded-xl border bg-background p-2" value={room} onChange={event => setRoom(event.target.value)}>
          <option value="all">All rooms</option>{rooms.map(value => <option key={value}>{value}</option>)}
        </select>
        <select className="rounded-xl border bg-background p-2" value={pkg} onChange={event => setPkg(event.target.value)}>
          <option value="all">All packages</option>{packages.map(value => <option key={value}>{value}</option>)}
        </select>
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleItems.map(item => (
          <article key={item.id} className="overflow-hidden rounded-3xl border bg-card">
            {item.image && <img src={item.image} alt={item.title} className="aspect-video w-full object-cover" />}
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground"><strong>{item.code}</strong><span>{item.status}</span></div>
              <h2 className="font-semibold">{item.title}</h2>
              <p className="text-sm text-muted-foreground">{item.room} · {item.package}</p>
              <div className="flex flex-wrap gap-2 text-xs"><span>Owner: {item.ownerRole}</span><span>Reviewer: {item.reviewerRole}</span><span>Approver: {item.approverRole}</span></div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border bg-card p-4"><strong className="block text-xl">{value}</strong><span className="text-sm text-muted-foreground">{label}</span></div>;
}
