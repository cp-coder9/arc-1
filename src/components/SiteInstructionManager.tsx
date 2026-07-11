import React, { useEffect, useMemo, useState } from 'react';
import { FileText, CheckCircle2, Plus, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { SiteInstruction, SiteInstructionStatus, UserRole } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { issueSiteInstruction, authoriseInstruction, acknowledgeInstruction, subscribeToSiteInstructions, isAuthorisedRole } from '@/services/siteInstructionService';
import { safeFormat } from '@/lib/utils';

type Props = {
  projectId: string;
  currentUserId: string;
  currentUserRole: UserRole;
  compact?: boolean;
};

const statusClass: Record<SiteInstructionStatus, string> = {
  draft: 'bg-secondary text-muted-foreground border-border',
  issued: 'bg-blue-50 text-blue-700 border-blue-200',
  acknowledged: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  superseded: 'bg-amber-50 text-amber-700 border-amber-200',
};

export default function SiteInstructionManager({ projectId, currentUserId, currentUserRole, compact = false }: Props) {
  const [instructions, setInstructions] = useState<SiteInstruction[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [instruction, setInstruction] = useState('');
  const [costImpact, setCostImpact] = useState<'none' | 'possible' | 'confirmed'>('none');
  const [timeImpact, setTimeImpact] = useState<'none' | 'possible' | 'confirmed'>('none');
  const [saving, setSaving] = useState(false);

  useEffect(() => subscribeToSiteInstructions(projectId, setInstructions), [projectId]);

  const visibleInstructions = useMemo(() => compact ? instructions.slice(0, 5) : instructions, [instructions, compact]);
  const canIssueFormally = isAuthorisedRole(currentUserRole);

  const reset = () => {
    setTitle('');
    setInstruction('');
    setCostImpact('none');
    setTimeImpact('none');
  };

  const submitInstruction = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const id = await issueSiteInstruction({
        projectId,
        title,
        instruction,
        issuedBy: currentUserId,
        issuedByRole: currentUserRole,
        costImpact,
        timeImpact,
      });
      toast.success(canIssueFormally ? 'Site instruction issued' : `Site instruction saved as draft (${id})`);
      setOpen(false);
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create instruction');
    } finally {
      setSaving(false);
    }
  };

  const authorise = async (instr: SiteInstruction) => {
    try {
      await authoriseInstruction(projectId, instr.id, currentUserId);
      toast.success('Instruction authorised and issued');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed');
    }
  };

  const acknowledge = async (instr: SiteInstruction) => {
    try {
      await acknowledgeInstruction(projectId, instr.id, currentUserId);
      toast.success('Instruction acknowledged');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed');
    }
  };

  return (
    <Card className="rounded-3xl border-border bg-white shadow-sm overflow-hidden h-full">
      <CardHeader className="flex flex-row items-center justify-between gap-4 bg-primary/5 border-b border-border p-6">
        <CardTitle className="flex items-center gap-2 text-xl font-heading"><FileText className="text-primary" /> Site Instructions</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button size="sm" className="rounded-full gap-2"><Plus size={14} /> New Instruction</Button>} />
          <DialogContent className="sm:max-w-2xl rounded-3xl">
            <DialogHeader>
              <DialogTitle>{canIssueFormally ? 'Issue site instruction' : 'Create site instruction'}</DialogTitle>
            </DialogHeader>
            {!canIssueFormally && (
              <p className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle size={12} /> Instructions created by non-authorised roles will be saved as drafts pending authorisation.</p>
            )}
            <form onSubmit={submitInstruction} className="space-y-4">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Instruction title" required />
              <Textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Instruction details" required />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select value={costImpact} onChange={(e) => setCostImpact(e.target.value as 'none' | 'possible' | 'confirmed')} className="h-12 rounded-xl border border-border bg-white px-3 text-sm">
                  <option value="none">No cost impact</option>
                  <option value="possible">Possible cost impact</option>
                  <option value="confirmed">Confirmed cost impact</option>
                </select>
                <select value={timeImpact} onChange={(e) => setTimeImpact(e.target.value as 'none' | 'possible' | 'confirmed')} className="h-12 rounded-xl border border-border bg-white px-3 text-sm">
                  <option value="none">No time impact</option>
                  <option value="possible">Possible time impact</option>
                  <option value="confirmed">Confirmed time impact</option>
                </select>
              </div>
              <Button type="submit" disabled={saving} className="w-full rounded-xl">{saving ? 'Saving...' : canIssueFormally ? 'Issue instruction' : 'Save as draft'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {visibleInstructions.map((instr) => (
          <div key={instr.id} className={`rounded-2xl border p-4 space-y-3 ${!instr.authorised ? 'border-amber-300 bg-amber-50/30' : 'border-border bg-secondary/10'}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold flex items-center gap-2">
                  {instr.title}
                  {!instr.authorised && <AlertTriangle size={14} className="text-amber-600" aria-label="Pending authorisation" />}
                </p>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">By {instr.issuedByRole} · {safeFormat(instr.createdAt, 'PP p')}</p>
              </div>
              <div className="flex items-center gap-2">
                {instr.costImpact !== 'none' && <Badge variant="outline" className={instr.costImpact === 'confirmed' ? 'bg-destructive/10 text-destructive' : 'bg-amber-50 text-amber-700'}>Cost: {instr.costImpact}</Badge>}
                {instr.timeImpact !== 'none' && <Badge variant="outline" className={instr.timeImpact === 'confirmed' ? 'bg-destructive/10 text-destructive' : 'bg-amber-50 text-amber-700'}>Time: {instr.timeImpact}</Badge>}
                <Badge variant="outline" className={statusClass[instr.status]}>{instr.status}</Badge>
              </div>
            </div>
            <p className="text-sm text-foreground">{instr.instruction}</p>
            <div className="flex gap-2">
              {instr.status === 'draft' && canIssueFormally && (
                <Button size="sm" onClick={() => authorise(instr)} className="gap-1"><CheckCircle2 size={12} /> Authorise & Issue</Button>
              )}
              {instr.status === 'issued' && (
                <Button size="sm" onClick={() => acknowledge(instr)} className="gap-1"><CheckCircle2 size={12} /> Acknowledge</Button>
              )}
              {instr.status === 'superseded' && <span className="text-xs text-muted-foreground">Superseded by {instr.supersededById || 'newer instruction'}</span>}
              {instr.status === 'acknowledged' && <Badge variant="outline" className="bg-emerald-50 text-emerald-700">Acknowledged by {instr.acknowledgedBy || 'contractor'}</Badge>}
            </div>
          </div>
        ))}
        {instructions.length === 0 && <div className="py-14 text-center rounded-3xl border-2 border-dashed border-border text-sm text-muted-foreground">No site instructions recorded for this project.</div>}
      </CardContent>
    </Card>
  );
}
