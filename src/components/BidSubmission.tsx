import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { toast } from 'sonner';
import { Plus, Trash2, UploadCloud } from 'lucide-react';
import { db } from '@/lib/firebase';
import { uploadAndTrackFile } from '@/lib/uploadService';
import { getContractorBidId, submitBid } from '@/services/tenderService';
import type { Bid, BidLineItem, TenderDocument, TenderPackage, UserProfile } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

const CERTIFICATION_ALIASES: Record<string, string[]> = {
  nhbrc: ['nhbrc', 'nhbrc enrolment', 'nhbrc registered builder', 'registered builder'],
  structure: ['structure', 'structural', 'structural engineering', 'pr eng structural', 'engineer'],
  electrical: ['electrical', 'electrician', 'pr eng electrical'],
  mechanical: ['mechanical', 'pr eng mechanical'],
  fire: ['fire', 'fire engineering', 'fire consultant'],
  drainage: ['drainage', 'civil', 'civil engineering'],
  energy: ['energy', 'energy compliance'],
  documentation: ['documentation', 'draughtsperson', 'drafting'],
};

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function userCapabilityTokens(user: UserProfile): Set<string> {
  const values = [
    user.professionalLabel,
    user.tradeLicense,
    user.cidbGrading ? 'cidb' : undefined,
    user.cidbGrading,
    user.nhbrcNumber ? 'nhbrc' : undefined,
    user.nhbrcNumber ? 'nhbrc registered builder' : undefined,
    ...(user.professionalLabels ?? []),
  ];

  const tokens = new Set<string>();
  values.filter((value): value is string => Boolean(value?.trim())).forEach((value) => {
    const normalized = normalizeToken(value);
    tokens.add(normalized);
    normalized.split(/[^a-z0-9]+/).filter(Boolean).forEach((part) => tokens.add(part));
  });
  return tokens;
}

function matchesRequirement(requirement: string, capabilities: Set<string>): boolean {
  const normalized = normalizeToken(requirement);
  const aliases = CERTIFICATION_ALIASES[normalized] ?? [];
  const candidates = [normalized, ...aliases];
  return candidates.some((candidate) => capabilities.has(candidate) || Array.from(capabilities).some((capability) => capability.includes(candidate) || candidate.includes(capability)));
}

export default function BidSubmission({ user }: { user: UserProfile }) {
  const [tenders, setTenders] = useState<TenderPackage[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'tender_packages'), where('status', '==', 'published'));
    return onSnapshot(q, (snapshot) => setTenders(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as TenderPackage))));
  }, []);

  const matchingTenders = useMemo(() => tenders.filter((tender) => {
    const capabilities = userCapabilityTokens(user);
    if (capabilities.size === 0) return true;
    return tender.requiredDisciplines.some((discipline) => matchesRequirement(discipline, capabilities)) || tender.requiredCertifications?.some((cert) => matchesRequirement(cert, capabilities));
  }), [tenders, user]);

  return <div className="space-y-6">{matchingTenders.map((tender) => <div key={tender.id}><TenderBidCard tender={tender} user={user} /></div>)}{matchingTenders.length === 0 && <div className="rounded-3xl border-2 border-dashed border-border bg-white/50 py-16 text-center text-muted-foreground">No open tenders currently match your profile.</div>}</div>;
}

function TenderBidCard({ tender, user }: { tender: TenderPackage; user: UserProfile }) {
  const [lineItems, setLineItems] = useState<BidLineItem[]>([{ description: '', quantity: 1, unitPrice: 0, total: 0 }]);
  const [methodology, setMethodology] = useState('');
  const [timeline, setTimeline] = useState('');
  const [startDate, setStartDate] = useState('');
  const [qualifications, setQualifications] = useState('');
  const [attachments, setAttachments] = useState<TenderDocument[]>([]);
  const [existingBid, setExistingBid] = useState<Bid | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const total = lineItems.reduce((sum, item) => sum + Number(item.total || item.quantity * item.unitPrice || 0), 0);
  const hasActiveBid = existingBid != null && existingBid.status !== 'withdrawn';

  useEffect(() => {
    const bidRef = doc(db, 'tender_packages', tender.id, 'bids', getContractorBidId(user.uid));
    return onSnapshot(bidRef, (snapshot) => setExistingBid(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } as Bid : null));
  }, [tender.id, user.uid]);

  const updateLine = (index: number, patch: Partial<BidLineItem>) => setLineItems((current) => current.map((item, i) => {
    if (i !== index) return item;
    const next = { ...item, ...patch };
    return { ...next, total: Number(next.quantity || 0) * Number(next.unitPrice || 0) };
  }));

  const uploadAttachments = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const uploaded = await Promise.all(Array.from(files).map(async (file) => ({ name: file.name, url: await uploadAndTrackFile(file, { fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, uploadedBy: user.uid, context: 'tender', jobId: tender.jobId }) })));
      setAttachments((current) => [...current, ...uploaded]);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Attachment upload failed'); }
  };

  const handleSubmit = async () => {
    if (hasActiveBid) {
      toast.error('You already have an active bid for this tender');
      return;
    }
    setSubmitting(true);
    try {
      await submitBid(tender.id, { contractorId: user.uid, contractorName: user.displayName || user.email, lineItems, proposedTimeline: timeline, proposedStartDate: startDate, methodology, qualifications, attachments });
      toast.success('Bid submitted');
      setMethodology(''); setTimeline(''); setStartDate(''); setQualifications(''); setAttachments([]); setLineItems([{ description: '', quantity: 1, unitPrice: 0, total: 0 }]);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Bid submission failed'); } finally { setSubmitting(false); }
  };

  return <Card className="rounded-[2rem] border-border bg-white shadow-sm"><CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle>{tender.title}</CardTitle><CardDescription>{tender.description}</CardDescription></div><Badge>Due {tender.deadline}</Badge></div></CardHeader><CardContent className="space-y-5"><div className="flex flex-wrap gap-2">{tender.scope.map((item) => <Badge key={item} variant="outline">{item}</Badge>)}</div><div className="space-y-3">{lineItems.map((item, index) => <div key={index} className="grid grid-cols-12 gap-2"><Input className="col-span-5" placeholder="Line item" value={item.description} onChange={(e) => updateLine(index, { description: e.target.value })} /><Input className="col-span-2" type="number" value={item.quantity} onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })} /><Input className="col-span-3" type="number" value={item.unitPrice} onChange={(e) => updateLine(index, { unitPrice: Number(e.target.value) })} /><Button className="col-span-2" variant="outline" onClick={() => setLineItems((current) => current.filter((_, i) => i !== index))}><Trash2 size={14} /></Button></div>)}<Button variant="outline" onClick={() => setLineItems((current) => [...current, { description: '', quantity: 1, unitPrice: 0, total: 0 }])}><Plus className="mr-2 h-4 w-4" />Add line item</Button></div><div className="grid grid-cols-1 md:grid-cols-2 gap-3"><Input placeholder="Proposed timeline, e.g. 12 weeks" value={timeline} onChange={(e) => setTimeline(e.target.value)} /><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div><Textarea placeholder="Methodology" value={methodology} onChange={(e) => setMethodology(e.target.value)} /><Textarea placeholder="Qualifications and relevant experience" value={qualifications} onChange={(e) => setQualifications(e.target.value)} /><label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-4 text-sm font-bold"><UploadCloud size={16} /> Attach supporting documents<input type="file" multiple className="hidden" onChange={(e) => uploadAttachments(e.target.files)} /></label><div className="flex items-center justify-between border-t border-border pt-4"><span className="font-mono text-lg font-bold text-primary">R {total.toLocaleString()}</span><Button onClick={handleSubmit} disabled={submitting || hasActiveBid || !methodology || !timeline}>{hasActiveBid ? `Bid ${existingBid?.status}` : 'Submit Bid'}</Button></div></CardContent></Card>;
}
