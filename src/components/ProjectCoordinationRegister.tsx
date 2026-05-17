import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BrainCircuit, CalendarClock, CheckCircle2, ClipboardList, Loader2, Plus, RadioTower, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { Job, Project, UserProfile } from '@/types';
import {
  COORDINATION_ITEM_TYPES,
  COORDINATION_STATUSES,
  createCoordinationItem,
  isCoordinationItemOverdue,
  subscribeToCoordinationItems,
  summariseCoordinationItems,
  updateCoordinationItemStatus,
} from '@/services/coordinationRegisterService';
import type { CoordinationItemType, CoordinationRegisterItem, CoordinationStatus } from '@/services/coordinationRegisterService';
import { safeFormat } from '@/lib/utils';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

interface ProjectCoordinationRegisterProps {
  project: Project;
  job?: Job;
  user: UserProfile;
}

const typeLabels: Record<CoordinationItemType, string> = {
  deliverable: 'Deliverable',
  dependency: 'Dependency',
  rfi: 'RFI',
  comment_thread: 'Comment thread',
  transmittal: 'Transmittal',
  deadline: 'Deadline',
  compliance_status: 'Compliance status',
  municipal_readiness: 'Municipal readiness',
};

const statusLabels: Record<CoordinationStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  blocked: 'Blocked',
  submitted: 'Submitted',
  resolved: 'Resolved',
  closed: 'Closed',
};

const statusTone: Record<CoordinationStatus, string> = {
  open: 'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  blocked: 'bg-destructive/10 text-destructive border-destructive/20',
  submitted: 'bg-amber-50 text-amber-700 border-amber-200',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed: 'bg-secondary text-muted-foreground border-border',
};

function canUpdateItem(user: UserProfile, item: CoordinationRegisterItem) {
  return item.createdBy === user.uid || ['admin', 'architect', 'bep'].includes(user.role);
}

export default function ProjectCoordinationRegister({ project, job, user }: ProjectCoordinationRegisterProps) {
  const [items, setItems] = useState<CoordinationRegisterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [itemType, setItemType] = useState<CoordinationItemType>('rfi');
  const [status, setStatus] = useState<CoordinationStatus>('open');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [dependsOnIds, setDependsOnIds] = useState('');

  useEffect(() => {
    setLoading(true);
    return subscribeToCoordinationItems(project.id, (nextItems) => {
      setItems(nextItems);
      setLoading(false);
    });
  }, [project.id]);

  const summary = useMemo(() => summariseCoordinationItems(items), [items]);
  const activeTeamMembers = useMemo(() => (project.teamMembers ?? []).filter((member) => member.status !== 'removed'), [project.teamMembers]);

  const reset = () => {
    setItemType('rfi');
    setStatus('open');
    setTitle('');
    setDescription('');
    setDiscipline('');
    setAssigneeId('');
    setDueAt('');
    setDependsOnIds('');
  };

  const submitItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await createCoordinationItem(project.id, {
        jobId: job?.id ?? project.jobId,
        itemType,
        status,
        title,
        description,
        discipline: discipline || undefined,
        assigneeId: assigneeId || undefined,
        dueAt: dueAt || undefined,
        dependsOnIds: dependsOnIds.split('\n').map((value) => value.trim()).filter(Boolean),
        createdBy: user.uid,
        createdByRole: user.role,
      });
      toast.success('Coordination item created');
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create coordination item');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (item: CoordinationRegisterItem, nextStatus: CoordinationStatus) => {
    try {
      await updateCoordinationItemStatus(project.id, item.id, nextStatus);
      toast.success('Coordination status updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update coordination status');
    }
  };

  return (
    <Card className="rounded-[1.5rem] border-border bg-card/95 shadow-sm overflow-hidden" data-testid="project-coordination-register">
      <CardHeader className="bg-primary/5 border-b border-border">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <Badge variant="secondary" className="uppercase tracking-widest">Project Coordination Register</Badge>
            <CardTitle className="font-heading text-2xl mt-3 flex items-center gap-3">
              <RadioTower className="h-6 w-6 text-primary" /> RFIs, transmittals, deadlines, and compliance status
            </CardTitle>
            <CardDescription className="mt-2 max-w-3xl text-base">
              Live coordination records for the selected project. AI can help surface risk context elsewhere, but every response, transmittal, approval, and professional sign-off remains a human decision.
            </CardDescription>
          </div>
          <Badge className="w-fit capitalize">{user.role}</Badge>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <MetricCard icon={<ClipboardList />} label="Items" value={summary.total} />
          <MetricCard icon={<AlertTriangle />} label="Blocked" value={summary.blocked} danger={summary.blocked > 0} />
          <MetricCard icon={<CalendarClock />} label="Overdue" value={summary.overdue} danger={summary.overdue > 0} />
          <MetricCard icon={<BrainCircuit />} label="Submitted" value={summary.submitted} />
          <MetricCard icon={<CheckCircle2 />} label="Resolved" value={summary.resolved + summary.closed} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6">
          <div className="space-y-3">
            {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading coordination register...</div>}
            {!loading && items.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No RFIs, transmittals, deadlines, or compliance coordination items are recorded for this project yet.
              </div>
            )}
            {items.map((item) => {
              const overdue = isCoordinationItemOverdue(item);
              const assignee = activeTeamMembers.find((member) => member.userId === item.assigneeId);
              const canUpdate = canUpdateItem(user, item);
              return (
                <div key={item.id} className={`rounded-2xl border p-4 text-sm ${overdue ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-background/70'}`}>
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="rounded-full">{typeLabels[item.itemType]}</Badge>
                        <Badge variant="outline" className={`rounded-full ${statusTone[item.status]}`}>{statusLabels[item.status]}</Badge>
                        {overdue && <Badge variant="destructive" className="rounded-full">Overdue</Badge>}
                      </div>
                      <div>
                        <p className="font-semibold text-base">{item.title}</p>
                        {item.description && <p className="mt-1 text-muted-foreground leading-relaxed">{item.description}</p>}
                      </div>
                      <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-widest font-bold text-muted-foreground">
                        {item.dueAt && <span>Due {safeFormat(item.dueAt, 'MMM d, yyyy')}</span>}
                        {item.discipline && <span>{item.discipline}</span>}
                        {assignee && <span>Assigned: {assignee.role}{assignee.discipline ? ` · ${assignee.discipline}` : ''}</span>}
                        {item.dependsOnIds?.length ? <span>Links: {item.dependsOnIds.length}</span> : null}
                      </div>
                    </div>
                    <div className="min-w-[170px]">
                      {canUpdate ? (
                        <select value={item.status} onChange={(event) => updateStatus(item, event.target.value as CoordinationStatus)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs font-bold uppercase tracking-widest">
                          {COORDINATION_STATUSES.map((coordinationStatus) => <option key={coordinationStatus} value={coordinationStatus}>{statusLabels[coordinationStatus]}</option>)}
                        </select>
                      ) : (
                        <p className="text-xs text-muted-foreground">Read-only for this role.</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-4">
            <Card className="rounded-2xl border-border bg-background/80 shadow-none">
              <CardHeader>
                <CardTitle className="font-heading text-xl flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /> Add coordination item</CardTitle>
                <CardDescription>Creates a real project participant record. Do not use this for statutory submission or contract/payment approval.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={submitItem} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select value={itemType} onChange={(event) => setItemType(event.target.value as CoordinationItemType)} className="h-11 rounded-xl border border-input bg-background px-3 text-sm">
                      {COORDINATION_ITEM_TYPES.map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}
                    </select>
                    <select value={status} onChange={(event) => setStatus(event.target.value as CoordinationStatus)} className="h-11 rounded-xl border border-input bg-background px-3 text-sm">
                      {COORDINATION_STATUSES.map((coordinationStatus) => <option key={coordinationStatus} value={coordinationStatus}>{statusLabels[coordinationStatus]}</option>)}
                    </select>
                  </div>
                  <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title / question / transmittal subject" required />
                  <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Context, required response, or evidence location" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input value={discipline} onChange={(event) => setDiscipline(event.target.value)} placeholder="Discipline" />
                    <Input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
                  </div>
                  <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm">
                    <option value="">No assignee selected</option>
                    {activeTeamMembers.map((member) => <option key={`${member.userId}-${member.discipline ?? member.role}`} value={member.userId}>{member.role}{member.discipline ? ` · ${member.discipline}` : ''}</option>)}
                  </select>
                  <Textarea value={dependsOnIds} onChange={(event) => setDependsOnIds(event.target.value)} placeholder="Linked task/drawing/document IDs, one per line" />
                  <Button type="submit" disabled={saving} className="w-full rounded-xl gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create coordination item</Button>
                </form>
              </CardContent>
            </Card>

            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p>Governance guardrail: this register coordinates accountability only. It does not issue contractual instructions, municipal submissions, payment releases, or professional certifications.</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCard({ icon, label, value, danger = false }: { icon: React.ReactNode; label: string; value: React.ReactNode; danger?: boolean }) {
  return <Card className={`rounded-2xl bg-background/80 shadow-none ${danger ? 'border-destructive/40' : 'border-border'}`}><CardHeader className="pb-2"><div className="flex items-center gap-2 text-primary [&>svg]:h-4 [&>svg]:w-4">{icon}<CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</CardTitle></div></CardHeader><CardContent><p className="font-heading text-2xl font-black">{value}</p></CardContent></Card>;
}
