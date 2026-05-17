import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, ClipboardList, FileCheck2, Link2, Loader2, Plus, ShieldCheck } from 'lucide-react';
import type { Job, Project, UserProfile } from '@/types';
import { DISCIPLINE_REGISTRY } from '@/types';
import {
  createDrawingChecklistItem,
  DrawingChecklistItem,
  DrawingChecklistStatus,
  subscribeToDrawingChecklists,
  summariseDrawingChecklistItems,
  updateDrawingChecklistStatus,
} from '@/services/drawingChecklistService';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';

interface DrawingChecklistTrackerProps {
  project: Project;
  job?: Job;
  user: UserProfile;
}

const statusLabels: Record<DrawingChecklistStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  complete: 'Complete',
};

function statusVariant(status: DrawingChecklistStatus) {
  if (status === 'complete') return 'default' as const;
  if (status === 'in_progress') return 'secondary' as const;
  return 'outline' as const;
}

function isProjectChecklistManager(project: Project, user: UserProfile) {
  return user.role === 'admin' || project.clientId === user.uid || project.leadArchitectId === user.uid;
}

function disciplineLabel(key?: string) {
  if (!key) return 'General coordination';
  return DISCIPLINE_REGISTRY.find((discipline) => discipline.key === key)?.label ?? key;
}

function parseLinkedDrawingIds(value: string) {
  return Array.from(new Set(value.split(',').map((item) => item.trim()).filter(Boolean))).slice(0, 40);
}

export default function DrawingChecklistTracker({ project, job, user }: DrawingChecklistTrackerProps) {
  const [items, setItems] = useState<DrawingChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [linkedDrawingIds, setLinkedDrawingIds] = useState('');
  const [notes, setNotes] = useState('');
  const [requiredForSubmission, setRequiredForSubmission] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    return subscribeToDrawingChecklists(project.id, (nextItems) => {
      setItems(nextItems);
      setLoading(false);
    });
  }, [project.id]);

  const canManage = isProjectChecklistManager(project, user);
  const summary = useMemo(() => summariseDrawingChecklistItems(items), [items]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage || !title.trim()) return;
    setSaving(true);
    try {
      await createDrawingChecklistItem(project.id, {
        title,
        discipline: discipline || undefined,
        linkedDrawingIds: parseLinkedDrawingIds(linkedDrawingIds),
        notes,
        requiredForSubmission,
        createdBy: user.uid,
        createdByRole: user.role,
      });
      setTitle('');
      setDiscipline('');
      setLinkedDrawingIds('');
      setNotes('');
      setRequiredForSubmission(true);
      toast.success('Drawing checklist item added');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add checklist item');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (item: DrawingChecklistItem, status: DrawingChecklistStatus) => {
    if (!canManage || item.status === status) return;
    try {
      await updateDrawingChecklistStatus(project.id, item.id, status);
      toast.success(`Checklist marked ${statusLabels[status].toLowerCase()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update checklist item');
    }
  };

  return (
    <Card className="beos-section-card overflow-hidden" data-testid="drawing-checklist-tracker">
      <CardHeader className="border-b border-border bg-primary/5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Badge variant="secondary" className="beos-label-caps">Project drawing checklist</Badge>
            <CardTitle className="mt-3 flex items-center gap-2 font-heading text-2xl">
              <ClipboardList className="h-6 w-6 text-primary" /> Municipal and discipline submission readiness
            </CardTitle>
            <CardDescription className="mt-2 max-w-3xl text-base">
              Live checklist records for {job?.title ?? 'the selected project'}. AI and checklist guidance is advisory only; accountable professionals still confirm drawing completeness before issue or municipal submission.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge className="gap-1"><ShieldCheck className="h-3 w-3" /> Human sign-off required</Badge>
            <Badge variant="outline" className="gap-1"><Bot className="h-3 w-3" /> AI advisory only</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-5 md:p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Metric icon={<FileCheck2 />} label="Items" value={summary.total} />
          <Metric icon={<AlertTriangle />} label="Required open" value={summary.requiredOpen} danger={summary.requiredOpen > 0} />
          <Metric icon={<ClipboardList />} label="In progress" value={summary.inProgress} />
          <Metric icon={<CheckCircle2 />} label="Complete" value={summary.complete} />
          <Metric icon={<Link2 />} label="Linked drawings" value={summary.linkedDrawings} />
        </div>

        {canManage ? (
          <form onSubmit={submit} className="rounded-2xl border border-border bg-white/80 p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Checklist item, e.g. Site plan north point confirmed" required />
              <select value={discipline} onChange={(event) => setDiscipline(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">General / all disciplines</option>
                {DISCIPLINE_REGISTRY.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
              <Input value={linkedDrawingIds} onChange={(event) => setLinkedDrawingIds(event.target.value)} placeholder="Linked drawing IDs, comma separated (optional)" />
              <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm text-muted-foreground">
                <input type="checkbox" checked={requiredForSubmission} onChange={(event) => setRequiredForSubmission(event.target.checked)} />
                Required for submission
              </label>
            </div>
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes, municipal requirement, or responsible discipline context (optional)" className="mt-3" />
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">Records are written to this project only. No fake templates or AI-generated requirements are created.</p>
              <Button type="submit" disabled={saving || !title.trim()} className="rounded-full gap-2"><Plus className="h-4 w-4" /> {saving ? 'Adding...' : 'Add checklist item'}</Button>
            </div>
          </form>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
            This role can read drawing checklist status for project coordination. Only the client, lead BEP/architect, or admin can change checklist records under the current Firestore rules.
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-background/70 p-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading live checklist records...</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No drawing checklist items exist for this project yet. Add only real project requirements, municipal comments, or discipline obligations.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-border bg-background/80 p-4 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">{item.title}</p>
                      <Badge variant={statusVariant(item.status)}>{statusLabels[item.status]}</Badge>
                      {item.requiredForSubmission && <Badge variant="outline">Submission required</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{disciplineLabel(item.discipline)}{item.notes ? ` · ${item.notes}` : ''}</p>
                    {item.linkedDrawingIds?.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Linked drawings: {item.linkedDrawingIds.join(', ')}</p>}
                  </div>
                  {canManage && (
                    <div className="flex flex-wrap gap-2">
                      {(['open', 'in_progress', 'complete'] as DrawingChecklistStatus[]).map((status) => (
                        <Button key={status} type="button" size="sm" variant={item.status === status ? 'default' : 'outline'} className="rounded-full" onClick={() => updateStatus(item, status)}>
                          {statusLabels[status]}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ icon, label, value, danger = false }: { icon: React.ReactNode; label: string; value: React.ReactNode; danger?: boolean }) {
  return (
    <div className={`beos-stat-card ${danger ? 'border-destructive/30 bg-destructive/5' : ''}`}>
      <div className="flex items-center gap-2 text-primary [&>svg]:h-4 [&>svg]:w-4">{icon}<span className="beos-label-caps text-[0.62rem]">{label}</span></div>
      <p className="mt-2 font-heading text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}
