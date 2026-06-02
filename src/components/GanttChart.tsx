import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, Edit2, GitBranch, Plus, ShieldCheck, Target } from 'lucide-react';
import { toast } from 'sonner';
import type { GanttTask, ProjectTeamMember } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { createGanttTask, subscribeToGanttTasks, updateGanttTask } from '@/services/constructionService';
import { cn, safeFormat } from '@/lib/utils';

const DAY_MS = 24 * 60 * 60 * 1000;
const PHASE_COLORS = ['#2563eb', '#16a34a', '#d97706', '#7c3aed', '#dc2626', '#0891b2'];

type Props = {
  projectId: string;
  teamMembers?: ProjectTeamMember[];
};

type TaskForm = {
  title: string;
  phase: string;
  startDate: string;
  endDate: string;
  baselineStartDate: string;
  baselineEndDate: string;
  forecastEndDate: string;
  progress: string;
  status: GanttTask['status'];
  assignedTo: string;
  dependsOn: string;
  isCritical: boolean;
  recoveryPlan: string;
  baselineChangeReason: string;
  color: string;
};

const emptyForm: TaskForm = {
  title: '',
  phase: 'General',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date(Date.now() + 7 * DAY_MS).toISOString().slice(0, 10),
  baselineStartDate: '',
  baselineEndDate: '',
  forecastEndDate: '',
  progress: '0',
  status: 'not_started',
  assignedTo: '',
  dependsOn: '',
  isCritical: false,
  recoveryPlan: '',
  baselineChangeReason: '',
  color: '',
};

function parseDependencyInput(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function dateMs(value?: string) {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function daysBetween(start?: string, end?: string) {
  const startMs = dateMs(start);
  const endMs = dateMs(end);
  if (!startMs || !endMs) return 0;
  return Math.round((endMs - startMs) / DAY_MS);
}

function taskLabel(task: GanttTask) {
  return `${task.phase}: ${task.title}`;
}

export default function GanttChart({ projectId, teamMembers = [] }: Props) {
  const [tasks, setTasks] = useState<GanttTask[]>([]);
  const [open, setOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<GanttTask | null>(null);
  const [form, setForm] = useState<TaskForm>(emptyForm);

  useEffect(() => subscribeToGanttTasks(projectId, setTasks), [projectId]);

  const timeline = useMemo(() => {
    const starts = tasks.flatMap((task) => [task.startDate, task.baselineStartDate]).map(dateMs).filter(Boolean);
    const ends = tasks.flatMap((task) => [task.endDate, task.forecastEndDate, task.baselineEndDate]).map(dateMs).filter(Boolean);
    const min = starts.length ? Math.min(...starts) : Date.now();
    const max = ends.length ? Math.max(...ends) : Date.now() + 30 * DAY_MS;
    const start = new Date(min);
    start.setHours(0, 0, 0, 0);
    const end = new Date(max);
    end.setHours(0, 0, 0, 0);
    const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / DAY_MS) + 1);
    return { start, end, totalDays };
  }, [tasks]);

  const months = useMemo(() => {
    const labels: { label: string; left: number }[] = [];
    const cursor = new Date(timeline.start);
    cursor.setDate(1);
    if (cursor < timeline.start) cursor.setMonth(cursor.getMonth() + 1);
    while (cursor <= timeline.end) {
      labels.push({ label: safeFormat(cursor, 'MMM yyyy'), left: ((cursor.getTime() - timeline.start.getTime()) / DAY_MS / timeline.totalDays) * 100 });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return labels;
  }, [timeline]);

  const criticalTasks = useMemo(() => tasks.filter((task) => task.isCritical || task.status === 'delayed'), [tasks]);
  const lookAheadTasks = useMemo(() => {
    const now = Date.now();
    const horizon = now + 14 * DAY_MS;
    return tasks.filter((task) => dateMs(task.startDate) <= horizon && dateMs(task.endDate) >= now && task.status !== 'completed');
  }, [tasks]);
  const recoveryTasks = useMemo(() => tasks.filter((task) => task.status === 'delayed' || task.recoveryPlan || daysBetween(task.baselineEndDate, task.forecastEndDate || task.endDate) > 0), [tasks]);
  const pendingBaselineReviews = useMemo(() => tasks.filter((task) => task.baselineChangeStatus === 'pending_review'), [tasks]);

  const colorForPhase = (phase: string, explicit?: string) => {
    if (explicit) return explicit;
    const phases = Array.from(new Set(tasks.map((task) => task.phase))).sort();
    return PHASE_COLORS[Math.max(0, phases.indexOf(phase)) % PHASE_COLORS.length];
  };

  const openEdit = (task: GanttTask) => {
    setEditingTask(task);
    setForm({
      title: task.title,
      phase: task.phase,
      startDate: task.startDate,
      endDate: task.endDate,
      baselineStartDate: task.baselineStartDate ?? '',
      baselineEndDate: task.baselineEndDate ?? '',
      forecastEndDate: task.forecastEndDate ?? '',
      progress: String(task.progress),
      status: task.status,
      assignedTo: task.assignedTo ?? '',
      dependsOn: (task.dependsOn ?? []).join(', '),
      isCritical: Boolean(task.isCritical),
      recoveryPlan: task.recoveryPlan ?? '',
      baselineChangeReason: task.baselineChangeReason ?? '',
      color: task.color ?? '',
    });
    setOpen(true);
  };

  const resetDialog = () => {
    setEditingTask(null);
    setForm(emptyForm);
  };

  const saveTask = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const progress = Number(form.progress || 0);
      const dependsOn = parseDependencyInput(form.dependsOn);
      if (new Date(form.endDate) < new Date(form.startDate)) throw new Error('End date must be after start date');
      if (form.baselineEndDate && form.baselineStartDate && new Date(form.baselineEndDate) < new Date(form.baselineStartDate)) throw new Error('Baseline end must be after baseline start');
      const payload = {
        projectId,
        title: form.title,
        phase: form.phase,
        startDate: form.startDate,
        endDate: form.endDate,
        baselineStartDate: form.baselineStartDate || undefined,
        baselineEndDate: form.baselineEndDate || undefined,
        forecastEndDate: form.forecastEndDate || undefined,
        progress,
        status: form.status,
        assignedTo: form.assignedTo || undefined,
        dependsOn,
        isCritical: form.isCritical,
        recoveryPlan: form.recoveryPlan || undefined,
        baselineChangeReason: form.baselineChangeReason || undefined,
        baselineChangeStatus: form.baselineChangeReason ? 'pending_review' as const : editingTask?.baselineChangeStatus,
        humanApprovalRequired: Boolean(form.baselineChangeReason),
        color: form.color || undefined,
      };
      if (editingTask) {
        await updateGanttTask(editingTask.id, payload);
        toast.success('Programme task updated');
      } else {
        await createGanttTask(payload);
        toast.success('Programme task added');
      }
      setOpen(false);
      resetDialog();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save programme task');
    }
  };

  const position = (value?: string) => Math.max(0, ((dateMs(value) - timeline.start.getTime()) / DAY_MS / timeline.totalDays) * 100);
  const widthFor = (start?: string, end?: string) => Math.max(1.5, ((daysBetween(start, end) + 1) / timeline.totalDays) * 100);

  return (
    <Card className="rounded-3xl border-border bg-white shadow-sm overflow-hidden" data-testid="programme-builder">
      <CardHeader className="border-b border-border bg-primary/5 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 font-heading text-2xl"><CalendarDays className="text-primary" /> Programme Builder</CardTitle>
            <CardDescription className="mt-2 max-w-3xl text-base">Baseline, current and forecast programme control with dependencies, look-ahead planning, recovery notes, and human-reviewed baseline changes.</CardDescription>
          </div>
          <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetDialog(); }}>
            <DialogTrigger render={<Button className="rounded-full gap-2"><Plus size={16} /> Add Task</Button>} />
            <DialogContent className="sm:max-w-3xl rounded-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingTask ? 'Edit programme task' : 'Add programme task'}</DialogTitle></DialogHeader>
              <form onSubmit={saveTask} className="space-y-4">
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Task title" required />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value })} placeholder="Phase" required />
                  <Input type="color" value={form.color || '#2563eb'} onChange={(e) => setForm({ ...form, color: e.target.value })} aria-label="Task colour" />
                  <label className="space-y-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">Baseline start<Input type="date" value={form.baselineStartDate} onChange={(e) => setForm({ ...form, baselineStartDate: e.target.value })} /></label>
                  <label className="space-y-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">Baseline end<Input type="date" value={form.baselineEndDate} onChange={(e) => setForm({ ...form, baselineEndDate: e.target.value })} /></label>
                  <label className="space-y-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">Current start<Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required /></label>
                  <label className="space-y-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">Current end<Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required /></label>
                  <label className="space-y-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">Forecast end<Input type="date" value={form.forecastEndDate} onChange={(e) => setForm({ ...form, forecastEndDate: e.target.value })} /></label>
                  <Input type="number" min="0" max="100" value={form.progress} onChange={(e) => setForm({ ...form, progress: e.target.value })} placeholder="Progress %" />
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as GanttTask['status'] })} className="h-12 rounded-xl border border-border bg-white px-3 text-sm">
                    <option value="not_started">Not started</option>
                    <option value="in_progress">In progress</option>
                    <option value="completed">Completed</option>
                    <option value="delayed">Delayed</option>
                  </select>
                  <select value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} className="h-12 w-full rounded-xl border border-border bg-white px-3 text-sm">
                    <option value="">Unassigned</option>
                    {teamMembers.map((member) => <option key={`${member.userId}-${member.discipline || member.role}`} value={member.userId}>{member.role} {member.discipline ? `— ${member.discipline}` : ''}</option>)}
                  </select>
                </div>
                <Input value={form.dependsOn} onChange={(e) => setForm({ ...form, dependsOn: e.target.value })} placeholder="Dependency task IDs, comma separated" />
                <Textarea value={form.recoveryPlan} onChange={(e) => setForm({ ...form, recoveryPlan: e.target.value })} placeholder="Recovery programme / mitigation note" />
                <Textarea value={form.baselineChangeReason} onChange={(e) => setForm({ ...form, baselineChangeReason: e.target.value })} placeholder="Baseline change reason. If completed, this task is flagged for human approval before the baseline is treated as accepted." />
                <label className="flex items-center gap-3 rounded-2xl border border-border p-3 text-sm font-semibold"><input type="checkbox" checked={form.isCritical} onChange={(e) => setForm({ ...form, isCritical: e.target.checked })} /> Critical path task</label>
                <Button type="submit" className="w-full rounded-xl">Save programme task</Button>
                <p className="text-xs text-muted-foreground">Baseline changes are recorded as pending human review. This tool does not approve extensions of time, payment claims, or contract changes.</p>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <ProgrammeMetric icon={<Target />} label="Critical / delayed" value={criticalTasks.length} />
          <ProgrammeMetric icon={<CalendarDays />} label="14-day look-ahead" value={lookAheadTasks.length} />
          <ProgrammeMetric icon={<AlertTriangle />} label="Recovery items" value={recoveryTasks.length} />
          <ProgrammeMetric icon={<ShieldCheck />} label="Baseline reviews" value={pendingBaselineReviews.length} />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid gap-0 xl:grid-cols-[1fr_21rem]">
          <div className="overflow-x-auto">
            <div className="min-w-[980px] p-6 space-y-4">
              <div className="relative ml-56 h-10 border-b border-border">
                {months.map((month) => <span key={`${month.label}-${month.left}`} className="absolute top-0 text-[10px] font-black uppercase tracking-widest text-muted-foreground" style={{ left: `${month.left}%` }}>{month.label}</span>)}
              </div>
              {tasks.map((task) => {
                const currentLeft = position(task.startDate);
                const currentWidth = widthFor(task.startDate, task.endDate);
                const baselineLeft = task.baselineStartDate ? position(task.baselineStartDate) : currentLeft;
                const baselineWidth = task.baselineStartDate && task.baselineEndDate ? widthFor(task.baselineStartDate, task.baselineEndDate) : currentWidth;
                const forecastWidth = task.forecastEndDate ? widthFor(task.startDate, task.forecastEndDate) : currentWidth;
                const color = colorForPhase(task.phase, task.color);
                const slippage = daysBetween(task.baselineEndDate, task.forecastEndDate || task.endDate);
                return (
                  <div key={task.id} className="grid grid-cols-[14rem_1fr] items-center gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-bold">{task.title}</p>
                        {task.isCritical && <Target size={13} className="text-destructive" />}
                        <button onClick={() => openEdit(task)} className="text-muted-foreground hover:text-primary" aria-label={`Edit ${task.title}`}><Edit2 size={13} /></button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1"><Badge variant="outline" className="text-[9px] uppercase">{task.phase}</Badge><span className="text-[10px] text-muted-foreground">{task.progress}%</span>{slippage > 0 && <span className="text-[10px] font-bold text-destructive">+{slippage}d forecast</span>}</div>
                    </div>
                    <div className="relative h-14 rounded-xl bg-secondary/40 border border-border/60">
                      <div className="absolute top-2 h-1.5 rounded-full bg-slate-400/50" style={{ left: `${baselineLeft}%`, width: `${baselineWidth}%` }} title="Baseline" />
                      <div className="absolute top-6 h-2 rounded-full bg-amber-500/30" style={{ left: `${currentLeft}%`, width: `${forecastWidth}%` }} title="Forecast" />
                      <div className={cn('absolute top-1/2 -translate-y-1/2 h-7 rounded-xl shadow-sm overflow-hidden', task.status === 'delayed' && 'ring-2 ring-destructive/40')} style={{ left: `${currentLeft}%`, width: `${currentWidth}%`, backgroundColor: color }}>
                        <div className="h-full bg-white/35" style={{ width: `${Math.min(100, Math.max(0, task.progress))}%` }} />
                        <span className="absolute inset-0 flex items-center px-3 text-[10px] font-black uppercase tracking-widest text-white drop-shadow">{task.status.replace('_', ' ')}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {tasks.length === 0 && <div className="py-16 text-center rounded-3xl border-2 border-dashed border-border text-sm text-muted-foreground">No construction programme tasks yet.</div>}
            </div>
          </div>
          <aside className="border-t border-border bg-secondary/30 p-5 xl:border-l xl:border-t-0">
            <h3 className="font-heading text-xl font-black">Programme controls</h3>
            <ProgrammeList title="Critical path" icon={<Target />} tasks={criticalTasks} empty="No critical or delayed tasks recorded." />
            <ProgrammeList title="Look-ahead" icon={<CalendarDays />} tasks={lookAheadTasks} empty="No active tasks in the next 14 days." />
            <ProgrammeList title="Dependencies" icon={<GitBranch />} tasks={tasks.filter((task) => (task.dependsOn ?? []).length > 0)} empty="No dependencies recorded." showDependencies />
            <ProgrammeList title="Recovery" icon={<AlertTriangle />} tasks={recoveryTasks} empty="No recovery items recorded." showRecovery />
          </aside>
        </div>
      </CardContent>
    </Card>
  );
}

function ProgrammeMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <div className="rounded-2xl border border-border bg-card/80 p-4"><div className="flex items-center gap-2 text-primary [&>svg]:h-4 [&>svg]:w-4">{icon}<span className="text-xs font-black uppercase tracking-widest text-muted-foreground">{label}</span></div><p className="mt-2 font-heading text-3xl font-black">{value}</p></div>;
}

function ProgrammeList({ title, icon, tasks, empty, showDependencies = false, showRecovery = false }: { title: string; icon: React.ReactNode; tasks: GanttTask[]; empty: string; showDependencies?: boolean; showRecovery?: boolean }) {
  return (
    <div className="mt-5">
      <h4 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">{icon}{title}</h4>
      <div className="mt-3 space-y-2">
        {tasks.length === 0 ? <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">{empty}</p> : tasks.slice(0, 6).map((task) => (
          <div key={`${title}-${task.id}`} className="rounded-xl border border-border bg-card p-3 text-xs">
            <p className="font-bold">{taskLabel(task)}</p>
            <p className="mt-1 text-muted-foreground">{safeFormat(new Date(task.startDate), 'dd MMM')} → {safeFormat(new Date(task.forecastEndDate || task.endDate), 'dd MMM yyyy')}</p>
            {showDependencies && (task.dependsOn ?? []).length > 0 && <p className="mt-1 text-muted-foreground">Depends on: {(task.dependsOn ?? []).join(', ')}</p>}
            {showRecovery && task.recoveryPlan && <p className="mt-1 text-muted-foreground">{task.recoveryPlan}</p>}
            {task.baselineChangeStatus === 'pending_review' && <Badge variant="outline" className="mt-2 text-[9px] uppercase">Human baseline review</Badge>}
          </div>
        ))}
      </div>
    </div>
  );
}
