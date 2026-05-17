import React, { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import { FileText, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { BidLineItem, TenderPackage } from '@/types';
import { submitBid } from '@/services/tenderService';
import { uploadAndTrackFile } from '@/lib/uploadService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface BidSubmissionProps {
  tenders: TenderPackage[];
  contractorId: string;
  contractorName: string;
  onSubmitted?: (tenderId: string, bidId: string) => void;
}

interface AttachmentDraft {
  name: string;
  url: string;
}

const emptyLineItem = (): BidLineItem => ({ description: '', quantity: 1, unitPrice: 0, total: 0 });

export default function BidSubmission({ tenders, contractorId, contractorName, onSubmitted }: BidSubmissionProps) {
  const openTenders = useMemo(() => tenders.filter((tender) => tender.status === 'published'), [tenders]);
  const [selectedTenderId, setSelectedTenderId] = useState(openTenders[0]?.id ?? '');
  const [lineItems, setLineItems] = useState<BidLineItem[]>([emptyLineItem()]);
  const [proposedTimeline, setProposedTimeline] = useState('');
  const [proposedStartDate, setProposedStartDate] = useState('');
  const [methodology, setMethodology] = useState('');
  const [qualifications, setQualifications] = useState('');
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedTender = openTenders.find((tender) => tender.id === selectedTenderId);
  const normalizedLineItems = useMemo(() => lineItems.map((item) => ({ ...item, total: Number(item.quantity) * Number(item.unitPrice) })), [lineItems]);
  const totalAmount = normalizedLineItems.reduce((total, item) => total + item.total, 0);
  const canSubmit = Boolean(selectedTenderId && totalAmount > 0 && proposedTimeline.trim() && proposedStartDate && methodology.trim() && qualifications.trim());

  const updateLineItem = (index: number, field: keyof BidLineItem, value: string) => {
    setLineItems((items) => items.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const next = { ...item, [field]: field === 'description' ? value : Number(value) };
      return { ...next, total: Number(next.quantity) * Number(next.unitPrice) };
    }));
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files: File[] = Array.from(event.target.files ?? []);
    if (!selectedTender || files.length === 0) return;
    setIsUploading(true);
    try {
      const uploaded = await Promise.all(files.map(async (file: File) => ({
        name: file.name,
        url: await uploadAndTrackFile(file, {
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
          fileSize: file.size,
          uploadedBy: contractorId,
          context: 'submission',
          jobId: selectedTender.jobId,
        }),
      })));
      setAttachments((current) => [...current, ...uploaded]);
      toast.success('Bid attachment uploaded');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload attachment');
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const submitTenderBid = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const bidId = await submitBid(selectedTenderId, {
        contractorId,
        contractorName,
        totalAmount,
        lineItems: normalizedLineItems.filter((item) => item.description.trim()),
        proposedTimeline: proposedTimeline.trim(),
        proposedStartDate,
        methodology: methodology.trim(),
        qualifications: qualifications.trim(),
        attachments,
      });
      toast.success('Bid submitted');
      onSubmitted?.(selectedTenderId, bidId);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit bid');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="rounded-3xl border-border bg-white shadow-sm">
      <CardHeader className="border-b border-border p-6">
        <CardTitle className="font-heading text-xl font-bold">Submit Package Bid</CardTitle>
        <CardDescription>Select a published tender and provide verified pricing, timeline, methodology, and attachments.</CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        {openTenders.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No open tenders are currently available.</p> : (
          <form onSubmit={submitTenderBid} className="space-y-6">
            <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={selectedTenderId} onChange={(event) => setSelectedTenderId(event.target.value)}>
              {openTenders.map((tender) => <option key={tender.id} value={tender.id}>{tender.title}</option>)}
            </select>

            {selectedTender && <div className="rounded-2xl bg-secondary/30 p-4 text-sm"><strong>{selectedTender.title}</strong><p>{selectedTender.description}</p><Badge variant="secondary">Deadline {selectedTender.deadline}</Badge></div>}

            <div className="space-y-3">
              {lineItems.map((item, index) => (
                <div key={index} className="grid gap-2 md:grid-cols-[1fr_120px_140px_48px]">
                  <Input value={item.description} onChange={(event) => updateLineItem(index, 'description', event.target.value)} placeholder="Line item description" />
                  <Input type="number" min="0" value={item.quantity} onChange={(event) => updateLineItem(index, 'quantity', event.target.value)} placeholder="Qty" />
                  <Input type="number" min="0" value={item.unitPrice} onChange={(event) => updateLineItem(index, 'unitPrice', event.target.value)} placeholder="Unit price" />
                  <Button type="button" variant="outline" size="icon" onClick={() => setLineItems((items) => items.length === 1 ? [emptyLineItem()] : items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16} /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={() => setLineItems((items) => [...items, emptyLineItem()])} className="gap-2"><Plus size={16} /> Add line item</Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Input value={proposedTimeline} onChange={(event) => setProposedTimeline(event.target.value)} placeholder="Proposed timeline, e.g. 12 weeks" required />
              <Input type="date" value={proposedStartDate} onChange={(event) => setProposedStartDate(event.target.value)} required />
            </div>
            <Textarea value={methodology} onChange={(event) => setMethodology(event.target.value)} placeholder="Construction methodology" required />
            <Textarea value={qualifications} onChange={(event) => setQualifications(event.target.value)} placeholder="Qualifications, CIDB/NHBRC details, and relevant experience" required />

            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              Upload bid attachments
              <input type="file" multiple className="hidden" onChange={handleFileUpload} disabled={isUploading} />
            </label>
            {attachments.map((attachment) => <div key={attachment.url} className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm"><FileText size={16} /> {attachment.name}</div>)}

            <div className="flex items-center justify-between border-t border-border pt-4">
              <strong>Total: {new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(totalAmount)}</strong>
              <Button type="submit" disabled={!canSubmit || isSubmitting} className="gap-2">{isSubmitting && <Loader2 size={16} className="animate-spin" />} Submit Bid</Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
