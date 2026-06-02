import React, { useMemo, useState } from 'react';
import { addDoc, collection, doc, setDoc, updateDoc } from 'firebase/firestore';
import { Loader2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '../lib/firebase';
import { MAX_UPLOAD_SIZE_LABEL, uploadAndTrackFile } from '../lib/uploadService';
import type { JobCategory, UserProfile } from '../types';
import { buildBriefInterpretation, buildProjectAttachmentMetadata, buildProjectBrief } from '../services/briefWorkflowService';
import { buildMarketplaceOpportunityFromBrief } from '../services/marketplaceWorkflowService';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Badge } from './ui/badge';

const categories: JobCategory[] = ['Residential', 'Commercial', 'Industrial', 'Renovation', 'Interior', 'Landscape'];

export default function GuidedBriefWizard({ user }: { user: UserProfile }) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'Residential' as JobCategory,
    location: '',
    budgetMin: '',
    budgetMax: '',
    targetStartDate: '',
    erfNumber: '',
    propertyAddress: '',
    municipalArea: '',
    requirements: '',
    publishOpportunity: true,
    aiAdvisoryAcknowledged: false,
  });

  const requirements = useMemo(() => form.requirements.split('\n').map((item) => item.trim()).filter(Boolean), [form.requirements]);
  const selectedFiles = useMemo(() => Array.from(files ?? []) as File[], [files]);

  const update = (field: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [field]: value }));

  const createBrief = async () => {
    if (user.role !== 'client') {
      toast.error('Only clients can create guided briefs.');
      return;
    }
    if (!form.aiAdvisoryAcknowledged) {
      toast.error('Please acknowledge that AI diagnostic guidance is advisory and requires BEP review.');
      return;
    }

    setSaving(true);
    try {
      const budgetRange = {
        min: form.budgetMin ? Number(form.budgetMin) : undefined,
        max: form.budgetMax ? Number(form.budgetMax) : undefined,
        currency: 'ZAR',
      };
      const brief = buildProjectBrief({
        clientId: user.uid,
        createdBy: user.uid,
        title: form.title,
        description: form.description,
        category: form.category,
        location: form.location,
        targetStartDate: form.targetStartDate,
        requirements,
        budgetRange,
        propertyDetails: {
          erfNumber: form.erfNumber,
          propertyAddress: form.propertyAddress,
          municipalArea: form.municipalArea,
          aiAdvisoryAcknowledged: form.aiAdvisoryAcknowledged,
        },
      });

      const briefRef = await addDoc(collection(db, 'project_briefs'), brief);
      const uploadedAttachmentIds: string[] = [];

      for (const file of selectedFiles) {
        const url = await uploadAndTrackFile(file, {
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
          fileSize: file.size,
          uploadedBy: user.uid,
          context: 'brief',
          submissionId: briefRef.id,
        });
        const attachment = buildProjectAttachmentMetadata({
          briefId: briefRef.id,
          clientId: user.uid,
          uploadedBy: user.uid,
          fileName: file.name,
          fileUrl: url,
          contentType: file.type,
          sizeBytes: file.size,
          evidenceType: 'client_brief_evidence',
          storageProvider: 'vercel_blob',
        });
        const attachmentRef = await addDoc(collection(db, 'project_briefs', briefRef.id, 'attachments'), attachment);
        uploadedAttachmentIds.push(attachmentRef.id);
      }

      const interpretation = buildBriefInterpretation({
        briefId: briefRef.id,
        clientId: user.uid,
        createdBy: user.uid,
        createdByRole: user.role,
        summary: `${form.category} project in ${form.location || 'an unspecified location'} requiring ${requirements.length || 'general'} captured requirements.`,
        inferredProjectRoute: form.category === 'Renovation' ? 'BEP review, existing-condition check, municipal route confirmation' : 'BEP review, professional scope confirmation, proposal comparison',
        likelyRequiredProfessionals: form.category === 'Residential' ? ['architect', 'structural engineer'] : ['architect', 'quantity surveyor', 'engineer'],
        risks: [!form.municipalArea && 'Municipal area missing', !form.erfNumber && 'ERF/title deed reference missing'].filter(Boolean) as string[],
        assumptions: ['Client-provided information requires professional verification before appointment or submission.'],
        sourceAttachmentIds: uploadedAttachmentIds,
        confidence: 0.62,
        model: 'deterministic-briefing-agent',
      });
      await addDoc(collection(db, 'project_briefs', briefRef.id, 'interpretations'), interpretation);

      if (form.publishOpportunity) {
        const opportunity = buildMarketplaceOpportunityFromBrief({ ...brief, id: briefRef.id } as typeof brief & { id: string });
        await setDoc(doc(db, 'marketplace_opportunities', briefRef.id), opportunity);
        await updateDoc(briefRef, { status: 'published', updatedAt: new Date().toISOString() });
      }

      toast.success(form.publishOpportunity ? 'Brief created and published for proposals.' : 'Brief draft created.');
      setStep(4);
    } catch (error) {
      console.error('Guided brief creation failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create guided brief.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="guided-brief-wizard">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <Badge variant="secondary" className="w-fit uppercase tracking-widest">Client Tools</Badge>
          <CardTitle className="font-heading text-3xl">Guided Brief Wizard</CardTitle>
          <CardDescription>Capture a real project brief, upload evidence through the authenticated file API, generate advisory interpretation, and optionally publish a marketplace opportunity.</CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="flex flex-wrap gap-2">{[1, 2, 3, 4].map((index) => <Badge key={index} variant={step === index ? 'default' : 'outline'}>Step {index}</Badge>)}</div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="note" aria-label="AI advisory notice">
            <strong>AI diagnostic guidance is advisory.</strong> It can help explain likely routes, risks, and professional inputs, but it does not appoint a professional, certify compliance, approve municipal submissions, create a contract, or replace BEP review.
          </div>

          {step === 1 && <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Project title"><Input value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="e.g. New family home in Pretoria" /></Field>
            <Field label="Category"><select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.category} onChange={(event) => update('category', event.target.value)}>{categories.map((category) => <option key={category}>{category}</option>)}</select></Field>
            <Field label="Location"><Input value={form.location} onChange={(event) => update('location', event.target.value)} placeholder="Town/suburb/province" /></Field>
            <Field label="Target start date"><Input type="date" value={form.targetStartDate} onChange={(event) => update('targetStartDate', event.target.value)} /></Field>
            <Field label="Plain-language project description" className="md:col-span-2"><textarea className="w-full min-h-32 rounded-md border border-input bg-background p-3 text-sm" value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="Describe what you want to build, change, legalise, or investigate." /></Field>
          </div>}

          {step === 2 && <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Budget minimum"><Input type="number" value={form.budgetMin} onChange={(event) => update('budgetMin', event.target.value)} placeholder="0" /></Field>
            <Field label="Budget maximum"><Input type="number" value={form.budgetMax} onChange={(event) => update('budgetMax', event.target.value)} placeholder="1000000" /></Field>
            <Field label="ERF / title deed reference"><Input value={form.erfNumber} onChange={(event) => update('erfNumber', event.target.value)} /></Field>
            <Field label="Municipal area"><Input value={form.municipalArea} onChange={(event) => update('municipalArea', event.target.value)} /></Field>
            <Field label="Property address" className="md:col-span-2"><Input value={form.propertyAddress} onChange={(event) => update('propertyAddress', event.target.value)} /></Field>
            <Field label="Requirements, one per line" className="md:col-span-2"><textarea className="w-full min-h-28 rounded-md border border-input bg-background p-3 text-sm" value={form.requirements} onChange={(event) => update('requirements', event.target.value)} placeholder="More bedrooms\nOpen-plan kitchen\nMunicipal submission support" /></Field>
          </div>}

          {step === 3 && <div className="space-y-4">
            <label className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-8 text-center cursor-pointer">
              <UploadCloud className="h-8 w-8 text-primary mb-3" />
              <span className="font-bold">Upload photos, old plans, title deed, municipal letters, or screenshots</span>
              <span className="text-xs text-muted-foreground mt-1">Authenticated upload, max {MAX_UPLOAD_SIZE_LABEL} per file.</span>
              <input className="sr-only" type="file" multiple onChange={(event) => setFiles(event.target.files)} />
            </label>
            <div className="space-y-2">{selectedFiles.map((file) => <div key={`${file.name}-${file.size}`} className="rounded-xl border border-border p-3 text-sm">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</div>)}</div>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={form.publishOpportunity} onChange={(event) => update('publishOpportunity', event.target.checked)} /> Publish as opportunity after saving</label>
            <label className="flex items-start gap-3 text-sm rounded-xl border border-border p-3 bg-background"><input className="mt-1" type="checkbox" checked={form.aiAdvisoryAcknowledged} onChange={(event) => update('aiAdvisoryAcknowledged', event.target.checked)} /> <span>I understand the AI diagnostic summary is advisory only and must be reviewed by an appointed BEP before appointment, compliance submission, construction, payment, or legal use.</span></label>
          </div>}

          {step === 4 && <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6"><h3 className="font-heading text-xl font-bold">Brief workflow completed</h3><p className="text-sm text-muted-foreground mt-2">The brief, attachments, advisory interpretation, acknowledgement, and optional marketplace opportunity were persisted to Firestore.</p></div>}

          <div className="flex justify-between gap-3 pt-4 border-t border-border">
            <Button variant="outline" disabled={step === 1 || saving} onClick={() => setStep((current) => Math.max(1, current - 1))}>Back</Button>
            {step < 3 && <Button onClick={() => setStep((current) => current + 1)}>Continue</Button>}
            {step === 3 && <Button disabled={saving || !form.aiAdvisoryAcknowledged} onClick={createBrief}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save brief'}</Button>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children, className = '' }: React.PropsWithChildren<{ label: string; className?: string }>) {
  return <label className={`space-y-2 ${className}`}><span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</span>{children}</label>;
}
