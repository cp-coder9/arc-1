import React, { useEffect, useMemo, useState } from 'react';
import { AlertOctagon, CheckCircle2, ClipboardList, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { SnagItem, SnagStatus, Severity } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createSnag, markSnagReadyForReinspection, closeSnagAfterReinspection, rejectSnag, subscribeToSnags } from '@/services/snagService';
import { safeFormat } from '@/lib/utils';

type Props = {
  projectId: string;
  currentUserId: string;
  compact?: boolean;
};

const statusClass: Record<SnagStatus, string> = {
  open: 'bg-blue-50 text-blue-700 border-blue-200',
  allocated: 'bg-amber-50 text-amber-700 border-amber-200',
  ready_for_reinspection: 'bg-purple-50 text-purple-700 border-purple-200',
  closed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-secondary text-muted-foreground border-border',
};

const severityClass: Record<Severity, string> = {
  low: 'bg-secondary text-muted-foreground',
  medium: 'bg-blue-50 text-blue-700',
  high: 'bg-amber-50 text-amber-700',
  critical: 'bg-destructive/10 text-destructive',
};

export default function SnagManager({ projectId, currentUserId, compact = false }: Props) {
  const [snags, setSnags] = useState<SnagItem[]>([]);
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Severity>('medium');
  const [responsiblePartyId, setResponsiblePartyId] = useState('');
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => subscribeToSnags(projectId, setSnags), [projectId]);

  const visibleSnags = useMemo(() => compact ? snags.slice(0, 5) : snags, [snags, compact]);

  const reset = () => {
    setLocation('');
    setDescription('');
    setPriority('medium');
    setResponsiblePartyId('');
    setDueDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  };

  const submitSnag = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await createSnag({
        projectId,
        location,
        description,
        priority,
        responsiblePartyId,
        dueDate,
        createdBy: currentUserId,
      });
      toast.success('Snag created');
      setOpen(false);
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create snag');
    } finally {
      setSaving(false);
    }
  };

  const markReady = async (snag: SnagItem) => {
    try {
      await markSnagReadyForReinspection(projectId, snag.id);
      toast.success('Snag marked ready for reinspection');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed');
    }
  };

  const closeSnag = async (snag: SnagItem) => {
    try {
      await closeSnagAfterReinspection(projectId, snag.id, currentUserId);
      toast.success('Snag closed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed');
    }
  };

  const reject = async (snag: SnagItem) => {
    try {
      await rejectSnag(projectId, snag.id, 'Not a valid snag item');
      toast.success('Snag rejected');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed');
    }
  };

  return (
    <Card className="rounded-3xl border-border bg-white shadow-sm overflow-hidden h-full">
      <CardHeader className="flex flex-row items-center justify-between gap-4 bg-primary/5 border-b border-border p-6">
        <CardTitle className="flex items-center gap-2 text-xl font-heading"><ClipboardList className="text-primary" /> Snag List</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button size="sm" className="rounded-full gap-2"><Plus size={14} /> New Snag</Button>} />
          <DialogContent className="sm:max-w-2xl rounded-3xl">
            <DialogHeader><DialogTitle>New snag item</DialogTitle></DialogHeader>
            <form onSubmit={submitSnag} className="space-y-4">
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (e.g. Level 1 passage)" required />
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description of snag/defect" required />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <select value={priority} onChange={(e) => setPriority(e.target.value as Severity)} className="h-12 rounded-xl border border-border bg-white px-3 text-sm">
                  <option value="low">Low priority</option>
                  <option value="medium">Medium priority</option>
                  <option value="high">High priority (blocks payment)</option>
                  <option value="critical">Critical priority (blocks payment)</option>
                </select>
                <Input value={responsiblePartyId} onChange={(e) => setResponsiblePartyId(e.target.value)} placeholder="Responsible party ID" required />
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
              </div>
              <Button type="submit" disabled={saving} className="w-full rounded-xl">{saving ? 'Creating...' : 'Create Snag'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {visibleSnags.map((snag) => (
          <div key={snag.id} className={`rounded-2xl border p-4 space-y-3 ${snag.blocksPayment ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-secondary/10'}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold flex items-center gap-2">
                  {snag.description}
                  {snag.blocksPayment && <AlertOctagon size={14} className="text-destructive" aria-label="Blocks payment" />}
                </p>
                <p className="text-xs text-muted-foreground">{snag.location} · Due {safeFormat(snag.dueDate, 'MMM d')}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={severityClass[snag.priority]}>{snag.priority}</Badge>
                <Badge variant="outline" className={statusClass[snag.status]}>{snag.status.replace(/_/g, ' ')}</Badge>
              </div>
            </div>
            <div className="flex gap-2">
              {snag.status === 'allocated' && (
                <>
                  <Button size="sm" onClick={() => markReady(snag)} className="gap-1"><CheckCircle2 size={12} /> Ready for Reinspection</Button>
                  <Button size="sm" variant="outline" onClick={() => reject(snag)}>Reject</Button>
                </>
              )}
              {snag.status === 'ready_for_reinspection' && (
                <>
                  <Button size="sm" onClick={() => closeSnag(snag)} className="gap-1"><CheckCircle2 size={12} /> Close</Button>
                  <Button size="sm" variant="outline" onClick={() => reject(snag)}>Reject</Button>
                </>
              )}
            </div>
          </div>
        ))}
        {snags.length === 0 && <div className="py-14 text-center rounded-3xl border-2 border-dashed border-border text-sm text-muted-foreground">No snags recorded for this project.</div>}
      </CardContent>
    </Card>
  );
}
