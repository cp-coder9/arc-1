import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { toast } from 'sonner';
import { Clock, Plus, Trash2, FileText, DollarSign } from 'lucide-react';
import type { UserProfile, TimesheetEntry as TimesheetEntryType, TimesheetSummary } from '../types';
import { timesheetService } from '../services/timesheetService';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface Props {
  user: UserProfile;
  firmId?: string;
}

export default function TimesheetEntry({ user, firmId }: Props) {
  const [entries, setEntries] = useState<TimesheetEntryType[]>([]);
  const [summary, setSummary] = useState<TimesheetSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '17:00',
    description: '',
    projectId: '',
    workstage: '',
    billable: 'billable' as 'billable' | 'non_billable' | 'internal',
    hourlyRateCents: 0,
  });

  const activeFirmId = firmId || user.primaryFirmId || '';

  useEffect(() => {
    if (!activeFirmId) return;
    const q = query(
      collection(db, 'timesheets'),
      where('firmId', '==', activeFirmId),
      where('userId', '==', user.uid),
      orderBy('date', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TimesheetEntryType)));
    }, (err) => {
      console.error('Timesheet subscription error:', err);
    });
    return () => unsub();
  }, [activeFirmId, user.uid]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFirmId) {
      toast.error('No firm selected. Please set up a firm first.');
      return;
    }
    if (!form.description.trim()) {
      toast.error('Description is required.');
      return;
    }

    setLoading(true);
    try {
      await timesheetService.logTime({
        userId: user.uid,
        firmId: activeFirmId,
        projectId: form.projectId || undefined,
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        description: form.description,
        billable: form.billable,
        hourlyRateCents: form.hourlyRateCents || undefined,
      });
      toast.success('Time entry logged.');
      setForm((f) => ({ ...f, description: '', projectId: '' }));
    } catch (err: any) {
      toast.error(err.message || 'Failed to log time.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await timesheetService.deleteTimesheetEntry(id);
      toast.success('Entry deleted.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete entry.');
    }
  };

  const formatMinutes = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  };

  const todayEntries = entries.filter((e) => e.date === new Date().toISOString().split('T')[0]);
  const todayHours = todayEntries.reduce((sum, e) => sum + e.durationMinutes, 0);

  return (
    <div className="space-y-6">
      <Card className="rounded-[1.25rem] border-border bg-card/95 beos-soft-shadow overflow-hidden">
        <CardHeader className="bg-[#f4faff]/80 border-b border-border/70">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-sans text-2xl font-black flex items-center gap-3">
                <Clock size={22} className="text-primary" />
                Timesheet Entry
              </CardTitle>
              <CardDescription>Log billable and non-billable time against projects</CardDescription>
            </div>
            <Badge variant="secondary" className="rounded-full">
              Today: {formatMinutes(todayHours)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Date</label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Start Time</label>
              <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">End Time</label>
              <Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required className="rounded-xl" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Description</label>
              <Input placeholder="What did you work on?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Type</label>
              <select
                value={form.billable}
                onChange={(e) => setForm({ ...form, billable: e.target.value as any })}
                className="w-full h-12 rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="billable">Billable</option>
                <option value="non_billable">Non-Billable</option>
                <option value="internal">Internal</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Project ID (optional)</label>
              <Input placeholder="Project reference" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Hourly Rate (cents, optional)</label>
              <Input type="number" placeholder="0" value={form.hourlyRateCents || ''} onChange={(e) => setForm({ ...form, hourlyRateCents: Number(e.target.value) || 0 })} className="rounded-xl" />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={loading} className="w-full h-12 rounded-xl bg-[#04302c] text-white font-bold hover:bg-[#0f6b62]">
                <Plus size={18} className="mr-2" />
                {loading ? 'Logging...' : 'Log Time'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-[1.25rem] border-border bg-card/95 beos-soft-shadow overflow-hidden">
        <CardHeader className="bg-[#f4faff]/80 border-b border-border/70">
          <CardTitle className="font-sans text-xl font-black flex items-center gap-3">
            <FileText size={20} className="text-primary" />
            Recent Timesheet Entries
          </CardTitle>
          <CardDescription>Your time entries for this firm</CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <ScrollArea className="h-64">
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No timesheet entries yet. Log your first entry above.</p>
            ) : (
              <div className="space-y-2">
                {entries.slice(0, 20).map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between rounded-xl border border-border/50 bg-background/50 p-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{entry.date}</span>
                        <Badge variant={entry.billable === 'billable' ? 'default' : 'secondary'} className="rounded-full text-xs">
                          {entry.billable}
                        </Badge>
                        {entry.invoiced && <Badge variant="outline" className="rounded-full text-xs text-green-600">Invoiced</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground truncate mt-1">{entry.description}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <div className="text-right">
                        <p className="text-sm font-bold">{formatMinutes(entry.durationMinutes)}</p>
                        {entry.totalValueCents ? (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <DollarSign size={12} />{(entry.totalValueCents / 100).toFixed(2)}
                          </p>
                        ) : null}
                      </div>
                      <Button variant="ghost" size="icon" className="rounded-full hover:bg-destructive/10" onClick={() => handleDelete(entry.id)}>
                        <Trash2 size={16} className="text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
