import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { addDoc, collection, limit, onSnapshot, query, updateDoc, where, doc } from 'firebase/firestore';
import { BookOpen, CheckCircle2, ClipboardList, ExternalLink, Loader2, Plus, Search } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { AgentKnowledge, Discipline, UserProfile } from '@/types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

type ChecklistItem = { id: string; title: string; discipline?: Discipline | string; municipality?: string; status: 'open' | 'in_progress' | 'complete'; requiredForSubmission?: boolean; createdBy: string; createdAt: string; completedAt?: string };

const DISCIPLINE_OPTIONS = ['architecture', 'structure', 'fire', 'accessibility', 'energy', 'drainage', 'electrical', 'mechanical', 'planning', 'documentation', 'nhbrc', 'coordination'];

function timestampMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime() || 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value === 'object' && 'seconds' in value && typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

export default function ResourceCentre({ user }: { user: UserProfile }) {
  const [knowledge, setKnowledge] = useState<AgentKnowledge[]>([]);
  const [checklists, setChecklists] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [title, setTitle] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [checklistDiscipline, setChecklistDiscipline] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubKnowledge = onSnapshot(query(collection(db, 'agent_knowledge'), where('status', '==', 'active'), limit(50)), (snapshot) => {
      setKnowledge(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as AgentKnowledge)));
      setLoading(false);
    }, (error) => {
      console.error('Failed to load resource centre knowledge:', error);
      setLoading(false);
    });
    const unsubChecklists = onSnapshot(query(collection(db, 'resource_checklists'), limit(50)), (snapshot) => {
      setChecklists(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as ChecklistItem)).sort((a, b) => timestampMs(b.createdAt) - timestampMs(a.createdAt)));
    }, (error) => console.error('Failed to load resource checklists:', error));
    return () => { unsubKnowledge(); unsubChecklists(); };
  }, []);

  const filteredKnowledge = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return knowledge
      .filter((item) => !discipline || item.discipline === discipline || item.tags?.includes(discipline))
      .filter((item) => !lower || item.title.toLowerCase().includes(lower) || item.content.toLowerCase().includes(lower) || item.tags?.some((tag) => tag.toLowerCase().includes(lower)));
  }, [discipline, knowledge, search]);

  const checklistStats = useMemo(() => ({
    total: checklists.length,
    complete: checklists.filter((item) => item.status === 'complete').length,
    requiredOpen: checklists.filter((item) => item.requiredForSubmission && item.status !== 'complete').length,
  }), [checklists]);

  const createChecklist = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'resource_checklists'), {
        title: title.trim(),
        discipline: checklistDiscipline.trim() || undefined,
        municipality: municipality.trim() || undefined,
        status: 'open',
        requiredForSubmission: true,
        createdBy: user.uid,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      });
      setTitle('');
      setMunicipality('');
      setChecklistDiscipline('');
    } finally {
      setSaving(false);
    }
  };

  const markChecklist = async (item: ChecklistItem, status: ChecklistItem['status']) => {
    await updateDoc(doc(db, 'resource_checklists', item.id), {
      status,
      completedAt: status === 'complete' ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="space-y-6" data-testid="resource-centre-page">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">Resource Centre / Checklists</Badge>
              <CardTitle className="font-heading text-3xl mt-3">Templates, references, and submission checklists</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">Live knowledge records and persisted checklist items for municipal links, inspector contacts, drawing checklists, templates, and submission readiness. Official standards remain authoritative.</CardDescription>
            </div>
            <Badge className="capitalize w-fit">{user.role}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {loading && <div className="md:col-span-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading resources...</div>}
          <MetricCard icon={<BookOpen />} label="Knowledge records" value={filteredKnowledge.length} />
          <MetricCard icon={<ClipboardList />} label="Checklist items" value={checklistStats.total} />
          <MetricCard icon={<CheckCircle2 />} label="Required open" value={checklistStats.requiredOpen} danger={checklistStats.requiredOpen > 0} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader><CardTitle className="font-heading text-xl flex items-center gap-2"><Search className="h-5 w-5 text-primary" /> Resource library</CardTitle><CardDescription>Active agent knowledge and templates from Firestore.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search standards, templates, municipal links..." /><select value={discipline} onChange={(event) => setDiscipline(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="">All disciplines</option>{DISCIPLINE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>
            {filteredKnowledge.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No active knowledge resources match the current filters.</p> : filteredKnowledge.slice(0, 20).map((item) => (
              <div key={item.id} className="rounded-xl border border-border bg-background/70 p-4 text-sm">
                <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{item.title}</p><p className="mt-1 text-xs text-muted-foreground line-clamp-2">{item.content}</p></div><Badge variant="outline">{item.source}</Badge></div>
                <div className="mt-3 flex flex-wrap gap-2">{item.tags?.slice(0, 5).map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}{(item.sourceUrl || item.pdfUrl) && <Button asChild size="sm" variant="outline" className="ml-auto rounded-xl gap-2"><a href={item.sourceUrl || item.pdfUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" /> Open</a></Button>}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-2xl border-border bg-card/90 shadow-sm"><CardHeader><CardTitle className="font-heading text-xl flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /> Add checklist item</CardTitle><CardDescription>Persist a municipal/submission checklist item for team readiness tracking.</CardDescription></CardHeader><CardContent><form onSubmit={createChecklist} className="space-y-3"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Checklist item / template needed" required /><Input value={municipality} onChange={(e) => setMunicipality(e.target.value)} placeholder="Municipality or portal, optional" /><Textarea value={checklistDiscipline} onChange={(e) => setChecklistDiscipline(e.target.value)} placeholder="Discipline key, optional" /><Button type="submit" disabled={saving || !title.trim()} className="w-full rounded-xl gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save checklist</Button></form></CardContent></Card>
          <Card className="rounded-2xl border-border bg-card/90 shadow-sm"><CardHeader><CardTitle className="font-heading text-xl">Checklist tracker</CardTitle><CardDescription>Persisted records, not static examples.</CardDescription></CardHeader><CardContent className="space-y-3">{checklists.length === 0 ? <p className="text-sm text-muted-foreground">No checklist records yet.</p> : checklists.slice(0, 12).map((item) => <div key={item.id} className="rounded-xl border border-border p-3 text-sm"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{item.title}</p><p className="text-xs text-muted-foreground">{item.discipline || 'Any discipline'} · {item.municipality || 'No municipality'}</p></div><select value={item.status} onChange={(e) => markChecklist(item, e.target.value as ChecklistItem['status'])} className="h-8 rounded-xl border border-input bg-background px-2 text-xs"><option value="open">Open</option><option value="in_progress">In progress</option><option value="complete">Complete</option></select></div></div>)}</CardContent></Card>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, danger = false }: { icon: React.ReactNode; label: string; value: React.ReactNode; danger?: boolean }) {
  return <div className={`rounded-2xl border bg-background/70 p-4 ${danger ? 'border-destructive/40' : 'border-border'}`}><div className="flex items-center gap-2 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}<p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p></div><p className="mt-3 font-heading text-3xl font-black">{value}</p></div>;
}
