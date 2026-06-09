import React, { useEffect, useMemo, useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, Plus, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import type { NonConformanceReport, NCRStatus, Severity } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createNcr, submitCorrectiveAction, verifyNcrClosed, rejectNcr, subscribeToNcrs } from '@/services/ncrService';
import { safeFormat } from '@/lib/utils';

type Props = {
  projectId: string;
  currentUserId: string;
  compact?: boolean;
};

const statusClass: Record<NCRStatus, string> = {
  open: 'bg-destructive/10 text-destructive border-destructive/20',
  corrective_action_submitted: 'bg-amber-50 text-amber-700 border-amber-200',
  verified_closed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-secondary text-muted-foreground border-border',
};

const severityClass: Record<Severity, string> = {
  low: 'bg-secondary text-muted-foreground',
  medium: 'bg-blue-50 text-blue-700',
  high: 'bg-amber-50 text-amber-700',
  critical: 'bg-destructive/10 text-destructive',
};

export default function NCRManager({ projectId, currentUserId, compact = false }: Props) {
  const [ncrs, setNcrs] = useState<NonConformanceReport[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<Severity>('medium');
  const [responsiblePartyId, setResponsiblePartyId] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [actionById, setActionById] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => subscribeToNcrs(projectId, setNcrs), [projectId]);

  const visibleNcrs = useMemo(() => compact ? ncrs.slice(0, 5) : ncrs, [ncrs, compact]);

  const reset = () => {
    setTitle('');
    setDescription('');
    setSeverity('medium');
    setResponsiblePartyId('');
    setCorrectiveAction('');
  };

  const submitNcr = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await createNcr({
        projectId,
        title,
        description,
        severity,
        responsiblePartyId,
        correctiveAction: correctiveAction || undefined,
        createdBy: currentUserId,
      });
      toast.success('NCR created');
      setOpen(false);
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create NCR');
    } finally {
      setSaving(false);
    }
  };

  const submitAction = async (ncr: NonConformanceReport) => {
    try {
      const action = actionById[ncr.id]?.trim();
      if (!action) throw new Error('Corrective action is required');
      await submitCorrectiveAction(projectId, ncr.id, action);
      setActionById((prev) => ({ ...prev, [ncr.id]: '' }));
      toast.success('Corrective action submitted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed');
    }
  };

  const verify = async (ncr: NonConformanceReport) => {
    try {
      await verifyNcrClosed(projectId, ncr.id, currentUserId);
      toast.success('NCR verified and closed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed');
    }
  };

  const reject = async (ncr: NonConformanceReport) => {
    try {
      await rejectNcr(projectId, ncr.id, 'Rejected by reviewer');
      toast.success('NCR rejected');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed');
    }
  };

  return (
    <Card className="rounded-3xl border-border bg-white shadow-sm overflow-hidden h-full">
      <CardHeader className="flex flex-row items-center justify-between gap-4 bg-primary/5 border-b border-border p-6">
        <CardTitle className="flex items-center gap-2 text-xl font-heading"><ShieldAlert className="text-primary" /> Non-Conformance Reports</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button size="sm" className="rounded-full gap-2"><Plus size={14} /> New NCR</Button>} />
          <DialogContent className="sm:max-w-2xl rounded-3xl">
            <DialogHeader><DialogTitle>New non-conformance report</DialogTitle></DialogHeader>
            <form onSubmit={submitNcr} className="space-y-4">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="NCR title" required />
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description of non-conformance" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)} className="h-12 rounded-xl border border-border bg-white px-3 text-sm">
                  <option value="low">Low severity</option>
                  <option value="medium">Medium severity</option>
                  <option value="high">High severity (blocks payment)</option>
                  <option value="critical">Critical severity (blocks payment)</option>
                </select>
                <Input value={responsiblePartyId} onChange={(e) => setResponsiblePartyId(e.target.value)} placeholder="Responsible party ID" required />
              </div>
              <Textarea value={correctiveAction} onChange={(e) => setCorrectiveAction(e.target.value)} placeholder="Initial corrective action (optional)" />
              <Button type="submit" disabled={saving} className="w-full rounded-xl">{saving ? 'Creating...' : 'Create NCR'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {visibleNcrs.map((ncr) => (
          <div key={ncr.id} className={`rounded-2xl border p-4 space-y-3 ${ncr.blocksPayment ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-secondary/10'}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold flex items-center gap-2">
                  {ncr.title}
                  {ncr.blocksPayment && <AlertOctagon size={14} className="text-destructive" title="Blocks payment" />}
                </p>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{safeFormat(ncr.createdAt, 'PP p')}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={severityClass[ncr.severity]}>{ncr.severity}</Badge>
                <Badge variant="outline" className={statusClass[ncr.status]}>{ncr.status.replace(/_/g, ' ')}</Badge>
              </div>
            </div>
            {ncr.description && <p className="text-sm text-foreground">{ncr.description}</p>}
            {ncr.correctiveAction && <p className="text-xs text-amber-700">Action: {ncr.correctiveAction}</p>}
            <div className="flex gap-2">
              {ncr.status === 'open' && (
                <div className="flex gap-2 w-full">
                  <Textarea
                    value={actionById[ncr.id] || ''}
                    onChange={(e) => setActionById({ ...actionById, [ncr.id]: e.target.value })}
                    placeholder="Corrective action..."
                    className="min-h-16"
                  />
                  <div className="flex flex-col gap-1">
                    <Button size="sm" onClick={() => submitAction(ncr)} className="gap-1"><CheckCircle2 size={12} /> Submit</Button>
                    <Button size="sm" variant="outline" onClick={() => reject(ncr)}><AlertTriangle size={12} /></Button>
                  </div>
                </div>
              )}
              {ncr.status === 'corrective_action_submitted' && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => verify(ncr)} className="gap-1"><CheckCircle2 size={12} /> Verify & Close</Button>
                  <Button size="sm" variant="outline" onClick={() => reject(ncr)}>Reject</Button>
                </div>
              )}
            </div>
          </div>
        ))}
        {ncrs.length === 0 && <div className="py-14 text-center rounded-3xl border-2 border-dashed border-border text-sm text-muted-foreground">No NCRs recorded for this project.</div>}
      </CardContent>
    </Card>
  );
}
