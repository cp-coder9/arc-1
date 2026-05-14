import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Edit2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { GanttTask, ProjectTeamMember } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
  progress: string;
  status: GanttTask['status'];
  assignedTo: string;
  color: string;
};

const emptyForm: TaskForm = {
  title: '',
  phase: 'General',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date(Date.now() + 7 * DAY_MS).toISOString().slice(0, 10),
  progress: '0',
  status: 'not_started',
  assignedTo: '',
  color: '',
};

export default function GanttChart({ projectId, teamMembers = [] }: Props) {
  const [tasks, setTasks] = useState<GanttTask[]>([]);
  const [open, setOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<GanttTask | null>(null);
  const [form, setForm] = useState<TaskForm>(emptyForm);

  useEffect(() => subscribeToGanttTasks(projectId, setTasks), [projectId]);

  const timeline = useMemo(() => {
    const starts = tasks.map((task) => new Date(task.startDate).getTime()).filter(Number.isFinite);
    const ends = tasks.map((task) => new Date(task.endDate).getTime()).filter(Number.isFinite);
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
      progress: String(task.progress),
      status: task.status,
      assignedTo: task.assignedTo ?? '',
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
      if (new Date(form.endDate) < new Date(form.startDate)) throw new Error('End date must be after start date');
      if (editingTask) {
        await updateGanttTask(editingTask.id, {
          projectId,
          title: form.title,
          phase: form.phase,
          startDate: form.startDate,
          endDate: form.endDate,
          progress,
          status: form.status,
          assignedTo: form.assignedTo || undefined,
          color: form.color || undefined,
        });
        toast.success('Gantt task updated');
      } else {
        await createGanttTask({
          projectId,
          title: form.title,
          phase: form.phase,
          startDate: form.startDate,
          endDate: form.endDate,
          progress,
          status: form.status,
          assignedTo: form.assignedTo || undefined,
          color: form.color || undefined,
        });
        toast.success('Gantt task added');
      }
      setOpen(false);
      resetDialog();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save Gantt task');
    }
  };

  return (
    <Card className="rounded-3xl border-border bg-white shadow-sm overflow-hidden">
      <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border bg-primary/5 p-6">
        <div>
          <CardTitle className="flex items-center gap-2 font-heading text-2xl"><CalendarDays className="text-primary" /> Construction Programme</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">CSS-based schedule with phase colours and progress tracking.</p>
        </div>
        <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetDialog(); }}>
          <DialogTrigger render={<Button className="rounded-full gap-2"><Plus size={16} /> Add Task</Button>} />
          <DialogContent className="sm:max-w-xl rounded-3xl">
            <DialogHeader><DialogTitle>{editingTask ? 'Edit programme task' : 'Add programme task'}</DialogTitle></DialogHeader>
            <form onSubmit={saveTask} className="space-y-4">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Task title" required />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value })} placeholder="Phase" required />
                <Input type="color" value={form.color || '#2563eb'} onChange={(e) => setForm({ ...form, color: e.target.value })} aria-label="Task colour" />
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
                <Input type="number" min="0" max="100" value={form.progress} onChange={(e) => setForm({ ...form, progress: e.target.value })} placeholder="Progress %" />
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as GanttTask['status'] })} className="h-12 rounded-xl border border-border bg-white px-3 text-sm">
                  <option value="not_started">Not started</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                  <option value="delayed">Delayed</option>
                </select>
              </div>
              <select value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} className="h-12 w-full rounded-xl border border-border bg-white px-3 text-sm">
                <option value="">Unassigned</option>
                {teamMembers.map((member) => <option key={`${member.userId}-${member.discipline || member.role}`} value={member.userId}>{member.role} {member.discipline ? `— ${member.discipline}` : ''}</option>)}
              </select>
              <Button type="submit" className="w-full rounded-xl">Save task</Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <div className="min-w-[860px] p-6 space-y-4">
            <div className="relative ml-48 h-10 border-b border-border">
              {months.map((month) => <span key={`${month.label}-${month.left}`} className="absolute top-0 text-[10px] font-black uppercase tracking-widest text-muted-foreground" style={{ left: `${month.left}%` }}>{month.label}</span>)}
            </div>
            {tasks.map((task) => {
              const left = Math.max(0, ((new Date(task.startDate).getTime() - timeline.start.getTime()) / DAY_MS / timeline.totalDays) * 100);
              const width = Math.max(1.5, (((new Date(task.endDate).getTime() - new Date(task.startDate).getTime()) / DAY_MS + 1) / timeline.totalDays) * 100);
              const color = colorForPhase(task.phase, task.color);
              return (
                <div key={task.id} className="grid grid-cols-[12rem_1fr] items-center gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold">{task.title}</p>
                      <button onClick={() => openEdit(task)} className="text-muted-foreground hover:text-primary" aria-label={`Edit ${task.title}`}><Edit2 size={13} /></button>
                    </div>
                    <div className="flex items-center gap-2 mt-1"><Badge variant="outline" className="text-[9px] uppercase">{task.phase}</Badge><span className="text-[10px] text-muted-foreground">{task.progress}%</span></div>
                  </div>
                  <div className="relative h-10 rounded-xl bg-secondary/40 border border-border/60">
                    <div className={cn('absolute top-1/2 -translate-y-1/2 h-7 rounded-xl shadow-sm overflow-hidden', task.status === 'delayed' && 'ring-2 ring-destructive/40')} style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color }}>
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
      </CardContent>
    </Card>
  );
}
