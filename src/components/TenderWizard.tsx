import React, { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import { CheckCircle2, FileText, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Discipline, TenderPackage } from '@/types';
import { createTenderPackage, publishTender } from '@/services/tenderService';
import { uploadAndTrackFile } from '@/lib/uploadService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const DISCIPLINES: Discipline[] = ['architecture', 'structure', 'electrical', 'mechanical', 'drainage', 'fire', 'nhbrc'];

interface TenderWizardProps {
  projectId: string;
  jobId: string;
  createdBy: string;
  onCreated?: (tenderId: string) => void;
}

interface TenderDocumentDraft {
  name: string;
  url: string;
}

export default function TenderWizard({ projectId, jobId, createdBy, onCreated }: TenderWizardProps) {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<string[]>(['']);
  const [deadline, setDeadline] = useState('');
  const [estimatedBudget, setEstimatedBudget] = useState('');
  const [requiredDisciplines, setRequiredDisciplines] = useState<Discipline[]>(['architecture']);
  const [requiredCertifications, setRequiredCertifications] = useState('');
  const [documents, setDocuments] = useState<TenderDocumentDraft[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validScope = useMemo(() => scope.map((item) => item.trim()).filter(Boolean), [scope]);
  const canSubmit = title.trim() && description.trim() && deadline && validScope.length > 0 && requiredDisciplines.length > 0;

  const updateScope = (index: number, value: string) => setScope((items) => items.map((item, itemIndex) => (itemIndex === index ? value : item)));
  const removeScope = (index: number) => setScope((items) => (items.length === 1 ? [''] : items.filter((_, itemIndex) => itemIndex !== index)));

  const toggleDiscipline = (discipline: Discipline) => {
    setRequiredDisciplines((current) => current.includes(discipline) ? current.filter((item) => item !== discipline) : [...current, discipline]);
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files: File[] = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setIsUploading(true);
    try {
      const uploaded = await Promise.all(files.map(async (file: File) => ({
        name: file.name,
        url: await uploadAndTrackFile(file, {
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
          fileSize: file.size,
          uploadedBy: createdBy,
          context: 'submission',
          jobId,
        }),
      })));
      setDocuments((current) => [...current, ...uploaded]);
      toast.success('Tender document uploaded');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload tender document');
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const submitTender = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const tenderData: Omit<TenderPackage, 'id' | 'status' | 'createdAt' | 'updatedAt'> = {
        projectId,
        jobId,
        title: title.trim(),
        description: description.trim(),
        scope: validScope,
        documents,
        deadline,
        estimatedBudget: estimatedBudget ? Number(estimatedBudget) : undefined,
        requiredDisciplines,
        requiredCertifications: requiredCertifications.split(',').map((item) => item.trim()).filter(Boolean),
        createdBy,
      };
      const tenderId = await createTenderPackage(tenderData);
      await publishTender(tenderId);
      toast.success('Tender package published');
      onCreated?.(tenderId);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to create tender');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="rounded-3xl border-border bg-white shadow-sm">
      <CardHeader className="border-b border-border p-6">
        <CardTitle className="font-heading text-xl font-bold">Create Tender Package</CardTitle>
        <CardDescription>Build a procurement package for contractor bidding.</CardDescription>
        <div className="flex flex-wrap gap-2 pt-2">
          {['Details', 'Requirements', 'Documents', 'Review'].map((label, index) => (
            <Badge key={label} variant={step === index ? 'default' : 'secondary'}>{index + 1}. {label}</Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <form onSubmit={submitTender} className="space-y-6">
          {step === 0 && (
            <div className="space-y-4">
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Tender title" required />
              <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the tender package" required />
              {scope.map((item, index) => (
                <div key={index} className="flex gap-2">
                  <Input value={item} onChange={(event) => updateScope(index, event.target.value)} placeholder="Scope item" />
                  <Button type="button" variant="outline" size="icon" onClick={() => removeScope(index)}><Trash2 size={16} /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={() => setScope((items) => [...items, ''])} className="gap-2"><Plus size={16} /> Add scope item</Button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <Input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} required />
              <Input type="number" min="0" value={estimatedBudget} onChange={(event) => setEstimatedBudget(event.target.value)} placeholder="Estimated budget (ZAR)" />
              <Input value={requiredCertifications} onChange={(event) => setRequiredCertifications(event.target.value)} placeholder="Required certifications, comma-separated" />
              <div className="flex flex-wrap gap-2">
                {DISCIPLINES.map((discipline) => <Button key={discipline} type="button" variant={requiredDisciplines.includes(discipline) ? 'default' : 'outline'} onClick={() => toggleDiscipline(discipline)}>{discipline}</Button>)}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-8 text-sm text-muted-foreground">
                {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                Upload BOQ, drawings, or specifications
                <input type="file" multiple className="hidden" onChange={handleFileUpload} disabled={isUploading} />
              </label>
              {documents.map((document) => <div key={document.url} className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm"><FileText size={16} /> {document.name}</div>)}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 rounded-2xl bg-secondary/30 p-5 text-sm">
              <h3 className="font-heading text-lg font-bold">{title || 'Untitled tender'}</h3>
              <p>{description || 'No description provided.'}</p>
              <p><strong>Scope:</strong> {validScope.join(', ') || 'No scope items'}</p>
              <p><strong>Deadline:</strong> {deadline || 'Not set'}</p>
              <p><strong>Documents:</strong> {documents.length}</p>
            </div>
          )}

          <div className="flex justify-between border-t border-border pt-4">
            <Button type="button" variant="outline" disabled={step === 0 || isSubmitting} onClick={() => setStep((value) => value - 1)}>Back</Button>
            {step < 3 ? <Button type="button" onClick={() => setStep((value) => value + 1)}>Next</Button> : <Button type="submit" disabled={!canSubmit || isSubmitting} className="gap-2">{isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Publish Tender</Button>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
