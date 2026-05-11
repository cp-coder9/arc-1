import React, { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, UploadCloud, Send } from 'lucide-react';
import type { Discipline, Job, Project, TenderDocument, UserProfile } from '@/types';
import { DISCIPLINE_REGISTRY } from '@/types';
import { uploadAndTrackFile } from '@/lib/uploadService';
import { createTenderPackage, publishTender } from '@/services/tenderService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

export default function TenderWizard({ user, job, project, onCreated }: { user: UserProfile; job: Job; project: Project; onCreated?: (tenderId: string) => void }) {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState(`${job.title} Tender Package`);
  const [description, setDescription] = useState(job.description || '');
  const [scopeText, setScopeText] = useState((job.requirements || []).join('\n'));
  const [deadline, setDeadline] = useState(job.deadline || '');
  const [estimatedBudget, setEstimatedBudget] = useState(job.budget ? String(job.budget) : '');
  const [requiredDisciplines, setRequiredDisciplines] = useState<Discipline[]>(['nhbrc']);
  const [certifications, setCertifications] = useState('NHBRC\nCIDB');
  const [documents, setDocuments] = useState<TenderDocument[]>([]);
  const [saving, setSaving] = useState(false);

  const toggleDiscipline = (discipline: Discipline) => {
    setRequiredDisciplines((current) => current.includes(discipline) ? current.filter((item) => item !== discipline) : [...current, discipline]);
  };

  const uploadDocuments = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const uploaded = await Promise.all(Array.from(files).map(async (file) => ({
        name: file.name,
        url: await uploadAndTrackFile(file, {
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
          fileSize: file.size,
          uploadedBy: user.uid,
          context: 'tender',
          jobId: job.id,
        }),
      })));
      setDocuments((current) => [...current, ...uploaded]);
      toast.success('Tender documents uploaded');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Document upload failed');
    }
  };

  const createTender = async (publish: boolean) => {
    setSaving(true);
    try {
      const tenderId = await createTenderPackage({
        projectId: project.id,
        jobId: job.id,
        title,
        description,
        scope: scopeText.split('\n').map((item) => item.trim()).filter(Boolean),
        documents,
        deadline,
        estimatedBudget: estimatedBudget ? Number(estimatedBudget) : undefined,
        requiredDisciplines,
        requiredCertifications: certifications.split('\n').map((item) => item.trim()).filter(Boolean),
        createdBy: user.uid,
      });
      if (publish) await publishTender(tenderId);
      toast.success(publish ? 'Tender package published' : 'Tender package saved as draft');
      onCreated?.(tenderId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create tender package');
    } finally {
      setSaving(false);
    }
  };

  const steps = ['Package Details', 'Requirements', 'Documents', 'Review & Publish'];

  return (
    <Card className="rounded-[2rem] border-border bg-white shadow-sm">
      <CardHeader>
        <CardTitle>Tender Creation Wizard</CardTitle>
        <CardDescription>{steps[step]} for {job.title}</CardDescription>
        <div className="flex flex-wrap gap-2 pt-2">{steps.map((label, index) => <Badge key={label} variant={index === step ? 'default' : 'outline'}>{index + 1}. {label}</Badge>)}</div>
      </CardHeader>
      <CardContent className="space-y-5">
        {step === 0 && <div className="space-y-4"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tender title" /><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tender description" rows={4} /><Textarea value={scopeText} onChange={(e) => setScopeText(e.target.value)} placeholder="Scope items, one per line" rows={5} /><Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>}
        {step === 1 && <div className="space-y-4"><Input type="number" value={estimatedBudget} onChange={(e) => setEstimatedBudget(e.target.value)} placeholder="Estimated budget" /><Textarea value={certifications} onChange={(e) => setCertifications(e.target.value)} placeholder="Required certifications, one per line" /><div className="flex flex-wrap gap-2">{DISCIPLINE_REGISTRY.map((discipline) => <Button key={discipline.key} type="button" size="sm" variant={requiredDisciplines.includes(discipline.key) ? 'default' : 'outline'} onClick={() => toggleDiscipline(discipline.key)}>{discipline.label}</Button>)}</div></div>}
        {step === 2 && <div className="space-y-4"><label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border bg-secondary/20 p-6 text-center"><UploadCloud className="mb-2 text-primary" /><span className="text-sm font-bold">Upload BOQ, drawings, specifications</span><input type="file" multiple className="hidden" onChange={(e) => uploadDocuments(e.target.files)} /></label>{documents.map((document, index) => <div key={`${document.url}-${index}`} className="flex items-center justify-between rounded-2xl border border-border p-3 text-sm"><a href={document.url} target="_blank" rel="noreferrer" className="font-bold text-primary hover:underline">{document.name}</a><Button size="sm" variant="ghost" onClick={() => setDocuments((current) => current.filter((_, i) => i !== index))}><Trash2 size={14} /></Button></div>)}</div>}
        {step === 3 && <div className="space-y-4 rounded-3xl border border-border bg-secondary/20 p-5"><h3 className="text-xl font-bold">{title}</h3><p className="text-sm text-muted-foreground">{description}</p><div className="grid grid-cols-2 gap-3 text-sm"><span>Scope items: {scopeText.split('\n').filter(Boolean).length}</span><span>Documents: {documents.length}</span><span>Budget: {estimatedBudget ? `R ${Number(estimatedBudget).toLocaleString()}` : 'Not set'}</span><span>Deadline: {deadline || 'Not set'}</span></div></div>}
        <div className="flex justify-between gap-3 pt-4"><Button variant="outline" disabled={step === 0 || saving} onClick={() => setStep((current) => current - 1)}>Back</Button>{step < steps.length - 1 ? <Button onClick={() => setStep((current) => current + 1)}>Next</Button> : <div className="flex gap-2"><Button variant="outline" disabled={saving} onClick={() => createTender(false)}><Plus className="mr-2 h-4 w-4" />Save Draft</Button><Button disabled={saving} onClick={() => createTender(true)}><Send className="mr-2 h-4 w-4" />Publish</Button></div>}</div>
      </CardContent>
    </Card>
  );
}
