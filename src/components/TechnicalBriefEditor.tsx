import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { ClipboardCheck, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '../lib/firebase';
import type { UserProfile } from '../types';
import { buildBriefInterpretation } from '../services/briefWorkflowService';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';

type Opportunity = {
  id: string;
  briefId: string;
  clientId: string;
  title: string;
  description: string;
  category?: string;
  location?: string;
  status: string;
};

export default function TechnicalBriefEditor({ user }: { user: UserProfile }) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    scope: '',
    deliverables: '',
    exclusions: '',
    assumptions: '',
    consultants: '',
    approvalRoute: '',
    riskLevel: 'medium',
    missingInformation: '',
  });

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'marketplace_opportunities'), where('status', '==', 'published')), (snapshot) => {
      const records = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Opportunity));
      setOpportunities(records);
      setSelectedId((current) => current || records[0]?.id || '');
    }, (error) => {
      console.error('Failed to load opportunities for technical brief:', error);
      toast.error('Failed to load published briefs.');
    });
    return () => unsub();
  }, []);

  const selected = useMemo(() => opportunities.find((opportunity) => opportunity.id === selectedId), [opportunities, selectedId]);

  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

  const saveTechnicalBrief = async () => {
    if (!selected) return;
    if (!['bep', 'architect', 'admin'].includes(user.role)) {
      toast.error('Only BEP/design-team users can create technical briefs.');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const technicalBrief = {
        opportunityId: selected.id,
        briefId: selected.briefId,
        clientId: selected.clientId,
        createdBy: user.uid,
        createdByRole: user.role,
        professionalScope: splitLines(form.scope),
        deliverables: splitLines(form.deliverables),
        exclusions: splitLines(form.exclusions),
        assumptions: splitLines(form.assumptions),
        consultants: splitLines(form.consultants),
        approvalRoute: form.approvalRoute.trim(),
        riskLevel: form.riskLevel,
        missingInformation: splitLines(form.missingInformation),
        status: 'ready_for_review',
        humanReviewRequired: true,
        createdAt: now,
        updatedAt: now,
      };
      await addDoc(collection(db, 'technical_briefs'), technicalBrief);

      const interpretation = buildBriefInterpretation({
        briefId: selected.briefId,
        clientId: selected.clientId,
        createdBy: user.uid,
        createdByRole: user.role,
        summary: `Technical interpretation for ${selected.title}: ${form.scope || selected.description}`,
        inferredProjectRoute: form.approvalRoute,
        likelyRequiredProfessionals: splitLines(form.consultants),
        risks: [form.riskLevel !== 'low' ? `Risk level marked ${form.riskLevel}` : '', ...splitLines(form.missingInformation).map((item) => `Missing information: ${item}`)].filter(Boolean),
        assumptions: splitLines(form.assumptions),
        confidence: 0.7,
        model: 'human-authored-technical-brief',
      });
      await addDoc(collection(db, 'project_briefs', selected.briefId, 'interpretations'), interpretation);
      await updateDoc(doc(db, 'marketplace_opportunities', selected.id), { technicalBriefStatus: 'ready_for_review', updatedAt: now });
      toast.success('Technical brief saved for human review.');
    } catch (error) {
      console.error('Failed to save technical brief:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save technical brief.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="technical-brief-editor">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <Badge variant="secondary" className="w-fit uppercase tracking-widest">BEP Tools</Badge>
          <CardTitle className="font-heading text-3xl flex items-center gap-3"><ClipboardCheck className="text-primary" /> Technical Brief Editor</CardTitle>
          <CardDescription>Convert a published client brief into a professional technical scope, deliverables, assumptions, consultant list, approval route, and missing-information list.</CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          {opportunities.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No published client briefs are available for technical interpretation.</p>
          ) : (
            <>
              <label className="space-y-2 block"><span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Published client brief</span><select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{opportunities.map((opportunity) => <option key={opportunity.id} value={opportunity.id}>{opportunity.title}</option>)}</select></label>
              {selected && <div className="rounded-2xl border border-border bg-secondary/20 p-4 text-sm"><strong>{selected.title}</strong><p className="text-muted-foreground mt-1">{selected.description}</p><div className="mt-2 flex gap-2"><Badge variant="outline">{selected.category || 'Uncategorised'}</Badge><Badge variant="outline">{selected.location || 'Location TBC'}</Badge></div></div>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Professional scope"><textarea value={form.scope} onChange={(event) => update('scope', event.target.value)} className="min-h-28 w-full rounded-md border border-input bg-background p-3 text-sm" placeholder="One scope item per line" /></Field>
                <Field label="Deliverables"><textarea value={form.deliverables} onChange={(event) => update('deliverables', event.target.value)} className="min-h-28 w-full rounded-md border border-input bg-background p-3 text-sm" placeholder="Drawings, reports, schedules..." /></Field>
                <Field label="Exclusions"><textarea value={form.exclusions} onChange={(event) => update('exclusions', event.target.value)} className="min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm" /></Field>
                <Field label="Assumptions"><textarea value={form.assumptions} onChange={(event) => update('assumptions', event.target.value)} className="min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm" /></Field>
                <Field label="Required consultants"><textarea value={form.consultants} onChange={(event) => update('consultants', event.target.value)} className="min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm" placeholder="Structural engineer\nQS\nFire consultant" /></Field>
                <Field label="Missing information"><textarea value={form.missingInformation} onChange={(event) => update('missingInformation', event.target.value)} className="min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm" placeholder="Title deed\nSurvey\nExisting plans" /></Field>
                <Field label="Approval route"><Input value={form.approvalRoute} onChange={(event) => update('approvalRoute', event.target.value)} placeholder="e.g. Municipal building plan submission" /></Field>
                <Field label="Risk level"><select value={form.riskLevel} onChange={(event) => update('riskLevel', event.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex gap-2"><Sparkles className="h-4 w-4 shrink-0" /> AI/advisory interpretation is stored for review only. It does not certify compliance, appoint professionals, or submit municipal plans.</div>
              <Button onClick={saveTechnicalBrief} disabled={saving || !selected} className="rounded-xl">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save technical brief for review'}</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function splitLines(value: string) {
  return value.split('\n').map((item) => item.trim()).filter(Boolean);
}

function Field({ label, children }: React.PropsWithChildren<{ label: string }>) {
  return <label className="space-y-2"><span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</span>{children}</label>;
}
