import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, MessageSquarePlus, Send, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { ProjectTeamMember, RFI, RFIPriority, UserProfile } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { closeRFI, createRFI, respondToRFI, subscribeToRFIs } from '@/services/constructionService';
import { notificationService } from '@/services/notificationService';
import { safeFormat } from '@/lib/utils';

type Props = {
  projectId: string;
  jobId?: string;
  currentUser: UserProfile;
  teamMembers?: ProjectTeamMember[];
  compact?: boolean;
};

const statusClass: Record<RFI['status'], string> = {
  open: 'bg-blue-50 text-blue-700 border-blue-200',
  responded: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed: 'bg-secondary text-muted-foreground border-border',
  overdue: 'bg-destructive/10 text-destructive border-destructive/20',
};

const priorityClass: Record<RFIPriority, string> = {
  low: 'bg-secondary text-muted-foreground',
  medium: 'bg-blue-50 text-blue-700',
  high: 'bg-amber-50 text-amber-700',
  urgent: 'bg-destructive/10 text-destructive',
};

export default function RFIManager({ projectId, jobId, currentUser, teamMembers = [], compact = false }: Props) {
  const [rfis, setRfis] = useState<RFI[]>([]);
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [question, setQuestion] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [priority, setPriority] = useState<RFIPriority>('medium');
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [responseById, setResponseById] = useState<Record<string, string>>({});

  useEffect(() => subscribeToRFIs(projectId, setRfis), [projectId]);

  const visibleRFIs = useMemo(() => compact ? rfis.filter((rfi) => rfi.status === 'open' || rfi.status === 'overdue').slice(0, 5) : rfis, [rfis, compact]);
  const activeUserTeamEntry = useMemo(
    () => teamMembers.find((member) => member.userId === currentUser.uid && member.status === 'active'),
    [currentUser.uid, teamMembers]
  );
  const canManageRFIs = currentUser.role === 'admin' || activeUserTeamEntry?.role === 'architect';

  const reset = () => {
    setSubject('');
    setQuestion('');
    setAssignedTo('');
    setPriority('medium');
    setDueDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  };

  const submitRFI = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const rfiId = await createRFI({
        projectId,
        subject,
        question,
        attachments: [],
        requestedBy: currentUser.uid,
        assignedTo,
        priority,
        dueDate,
      });
      if (assignedTo) {
        await notificationService.sendNotification(assignedTo, 'message', `New RFI: ${subject}`, { jobId, senderId: currentUser.uid });
      }
      toast.success(`RFI created (${rfiId})`);
      setOpen(false);
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create RFI');
    }
  };

  const submitResponse = async (rfi: RFI) => {
    try {
      const response = responseById[rfi.id]?.trim();
      if (!response) throw new Error('Response is required');
      await respondToRFI(projectId, rfi.id, response, currentUser.uid);
      await notificationService.sendNotification(rfi.requestedBy, 'message', `Response posted for RFI #${rfi.number}: ${rfi.subject}`, { jobId, senderId: currentUser.uid });
      setResponseById((current) => ({ ...current, [rfi.id]: '' }));
      toast.success('RFI response submitted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to respond to RFI');
    }
  };

  const close = async (rfi: RFI) => {
    try {
      await closeRFI(projectId, rfi.id);
      toast.success(`RFI #${rfi.number} closed`);
    } catch {
      toast.error('Failed to close RFI');
    }
  };

  return (
    <Card className="rounded-3xl border-border bg-white shadow-sm overflow-hidden h-full">
      <CardHeader className="flex flex-row items-center justify-between gap-4 bg-primary/5 border-b border-border p-6">
        <CardTitle className="flex items-center gap-2 text-xl font-heading"><MessageSquarePlus className="text-primary" /> RFIs</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button size="sm" className="rounded-full gap-2"><MessageSquarePlus size={14} /> New RFI</Button>} />
          <DialogContent className="sm:max-w-2xl rounded-3xl">
            <DialogHeader><DialogTitle>New request for information</DialogTitle></DialogHeader>
            <form onSubmit={submitRFI} className="space-y-4">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" required />
              <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Question / clarification required" required />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="h-12 rounded-xl border border-border bg-white px-3 text-sm" required>
                  <option value="">Assign to...</option>
                  {teamMembers.map((member) => <option key={`${member.userId}-${member.discipline || member.role}`} value={member.userId}>{member.role} {member.discipline ? `— ${member.discipline}` : ''}</option>)}
                </select>
                <select value={priority} onChange={(e) => setPriority(e.target.value as RFIPriority)} className="h-12 rounded-xl border border-border bg-white px-3 text-sm">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full rounded-xl">Create RFI</Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-6">
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Subject</TableHead><TableHead>Status</TableHead><TableHead>Priority</TableHead><TableHead>Due</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
            <TableBody>
              {visibleRFIs.map((rfi) => {
                const canRespond = rfi.assignedTo === currentUser.uid || canManageRFIs;
                const canClose = rfi.requestedBy === currentUser.uid || canManageRFIs;
                return <RFIRow key={rfi.id} rfi={rfi} response={responseById[rfi.id] || ''} canRespond={canRespond} canClose={canClose} onResponseChange={(value) => setResponseById({ ...responseById, [rfi.id]: value })} onSubmitResponse={() => submitResponse(rfi)} onClose={() => close(rfi)} />;
              })}
            </TableBody>
          </Table>
        </div>
        <div className="md:hidden space-y-4">
          {visibleRFIs.map((rfi) => {
            const canRespond = rfi.assignedTo === currentUser.uid || canManageRFIs;
            const canClose = rfi.requestedBy === currentUser.uid || canManageRFIs;
            return <RFICard key={rfi.id} rfi={rfi} response={responseById[rfi.id] || ''} canRespond={canRespond} canClose={canClose} onResponseChange={(value) => setResponseById({ ...responseById, [rfi.id]: value })} onSubmitResponse={() => submitResponse(rfi)} onClose={() => close(rfi)} />;
          })}
        </div>
        {visibleRFIs.length === 0 && <div className="py-14 text-center rounded-3xl border-2 border-dashed border-border text-sm text-muted-foreground">No RFIs recorded for this project.</div>}
      </CardContent>
    </Card>
  );
}

function RFIRow({ rfi, response, canRespond, canClose, onResponseChange, onSubmitResponse, onClose }: { key?: React.Key; rfi: RFI; response: string; canRespond: boolean; canClose: boolean; onResponseChange: (value: string) => void; onSubmitResponse: () => void | Promise<void>; onClose: () => void | Promise<void> }) {
  return (
    <TableRow className={rfi.status === 'overdue' ? 'bg-destructive/5' : undefined}>
      <TableCell className="font-mono font-bold">{rfi.number}</TableCell>
      <TableCell><RFIContent rfi={rfi} /></TableCell>
      <TableCell><StatusBadge rfi={rfi} /></TableCell>
      <TableCell><Badge className={priorityClass[rfi.priority]}>{rfi.priority}</Badge></TableCell>
      <TableCell>{safeFormat(rfi.dueDate, 'MMM d')}</TableCell>
      <TableCell><RFIActions rfi={rfi} response={response} canRespond={canRespond} canClose={canClose} onResponseChange={onResponseChange} onSubmitResponse={onSubmitResponse} onClose={onClose} /></TableCell>
    </TableRow>
  );
}

function RFICard(props: { key?: React.Key; rfi: RFI; response: string; canRespond: boolean; canClose: boolean; onResponseChange: (value: string) => void; onSubmitResponse: () => void | Promise<void>; onClose: () => void | Promise<void> }) {
  return (
    <div className="rounded-2xl border border-border p-4 space-y-3">
      <div className="flex justify-between gap-3"><RFIContent rfi={props.rfi} /><StatusBadge rfi={props.rfi} /></div>
      <RFIActions {...props} />
    </div>
  );
}

function RFIContent({ rfi }: { rfi: RFI }) {
  return <div><p className="font-bold">RFI #{rfi.number}: {rfi.subject}</p><p className="text-xs text-muted-foreground line-clamp-2">{rfi.question}</p>{rfi.response && <p className="mt-2 text-xs text-emerald-700">Response: {rfi.response}</p>}</div>;
}

function StatusBadge({ rfi }: { rfi: RFI }) {
  return <Badge variant="outline" className={statusClass[rfi.status]}>{rfi.status === 'overdue' && <AlertTriangle size={12} className="mr-1" />}{rfi.status}</Badge>;
}

function RFIActions({ rfi, response, canRespond, canClose, onResponseChange, onSubmitResponse, onClose }: { rfi: RFI; response: string; canRespond: boolean; canClose: boolean; onResponseChange: (value: string) => void; onSubmitResponse: () => void; onClose: () => void }) {
  if (rfi.status === 'closed') return <span className="text-xs text-muted-foreground">Closed</span>;
  const showRespond = canRespond && (rfi.status === 'open' || rfi.status === 'overdue');
  const showClose = canClose && rfi.status === 'responded';
  if (!showRespond && !showClose) return <span className="text-xs text-muted-foreground">No available actions</span>;
  return (
    <div className="space-y-2 min-w-64">
      {showRespond && <Textarea value={response} onChange={(event) => onResponseChange(event.target.value)} placeholder="Response" className="min-h-20" />}
      <div className="flex gap-2">
        {showRespond && <Button size="sm" onClick={onSubmitResponse} className="gap-1"><Send size={12} /> Respond</Button>}
        {showClose && <Button size="sm" variant="outline" onClick={onClose} className="gap-1"><XCircle size={12} /> Close</Button>}
      </div>
    </div>
  );
}
