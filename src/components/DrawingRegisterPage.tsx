import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { collection, doc, limit, onSnapshot, query, where, writeBatch, type Query } from 'firebase/firestore';
import { AlertTriangle, FileArchive, FileClock, FileOutput, FileText, History, Loader2, Plus, RadioTower, Send } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { safeFormat } from '@/lib/utils';
import type { Project, UserProfile } from '@/types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

const DOCUMENT_TYPES = ['drawing', 'report', 'addendum', 'submission_pack', 'specification', 'schedule'] as const;
const DOCUMENT_STATUSES = ['draft', 'active', 'issued', 'superseded', 'withdrawn'] as const;
const TRANSMITTAL_STATUSES = ['draft', 'issued'] as const;

type LoadState = 'loading' | 'ready' | 'error';
type DocumentType = typeof DOCUMENT_TYPES[number];
type DocumentStatus = typeof DOCUMENT_STATUSES[number];
type TransmittalStatus = typeof TRANSMITTAL_STATUSES[number];

interface DrawingRegisterDocument {
  id: string;
  projectId: string;
  title: string;
  drawingNumber?: string | null;
  documentType: DocumentType | string;
  discipline?: string | null;
  status: DocumentStatus | string;
  currentVersionId?: string | null;
  currentRevision?: string | null;
  latestFileUrl?: string | null;
  latestFileName?: string | null;
  tags?: string[];
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

interface DrawingRegisterVersion {
  id: string;
  documentId: string;
  projectId: string;
  versionNumber: number;
  revision: string;
  fileUrl?: string | null;
  fileName?: string | null;
  checksum?: string | null;
  notes?: string;
  issueStatus?: string;
  supersedesVersionId?: string | null;
  createdBy: string;
  createdAt: string;
}

interface DrawingTransmittal {
  id: string;
  projectId: string;
  title: string;
  status: TransmittalStatus | string;
  recipientIds: string[];
  documentVersionIds: string[];
  purpose: string;
  issuedBy: string;
  issuedAt: string;
  createdAt: string;
  updatedAt?: string;
}

function timestampMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime() || 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') return (value as { toDate: () => Date }).toDate().getTime();
  if (typeof value === 'object' && 'seconds' in value && typeof (value as { seconds?: unknown }).seconds === 'number') return (value as { seconds: number }).seconds * 1000;
  return 0;
}

function sortByRecent<T extends { updatedAt?: unknown; createdAt?: unknown; issuedAt?: unknown }>(items: T[]) {
  return [...items].sort((a, b) => timestampMs(b.updatedAt ?? b.issuedAt ?? b.createdAt) - timestampMs(a.updatedAt ?? a.issuedAt ?? a.createdAt));
}

function projectQueriesForUser(user: UserProfile): Query[] {
  const projects = collection(db, 'projects');
  if (user.role === 'admin') return [query(projects, limit(40))];
  if (user.role === 'client') return [query(projects, where('clientId', '==', user.uid), limit(25))];
  if (user.role === 'architect' || user.role === 'bep') {
    return [
      query(projects, where('leadProfessionalId', '==', user.uid), limit(25)),
      query(projects, where('leadBepId', '==', user.uid), limit(25)),
      query(projects, where('leadArchitectId', '==', user.uid), limit(25)),
    ];
  }
  return [];
}

function mergeProjectSnapshots(snapshotGroups: Project[][]) {
  const byId = new Map<string, Project>();
  for (const projects of snapshotGroups) {
    for (const project of projects) {
      byId.set(project.id, { ...byId.get(project.id), ...project });
    }
  }
  return sortByRecent(Array.from(byId.values()));
}

function canManageDrawingRegister(user: UserProfile) {
  return user.role === 'admin' || user.role === 'architect' || user.role === 'bep';
}

function cleanList(value: string) {
  return Array.from(new Set(value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean))).slice(0, 40);
}

function versionKey(documentId: string, versionId?: string | null) {
  return `${documentId}:${versionId || 'current'}`;
}

function statusTone(status: string) {
  if (status === 'issued' || status === 'active') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'superseded' || status === 'withdrawn') return 'bg-slate-100 text-slate-600 border-slate-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

const defaultDocumentForm = {
  title: '',
  drawingNumber: '',
  documentType: 'drawing' as DocumentType,
  discipline: 'Architecture',
  status: 'active' as DocumentStatus,
  revision: 'P01',
  fileUrl: '',
  fileName: '',
  notes: '',
  tags: '',
};

export default function DrawingRegisterPage({ user }: { user: UserProfile }) {
  const [state, setState] = useState<LoadState>('loading');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [documents, setDocuments] = useState<DrawingRegisterDocument[]>([]);
  const [transmittals, setTransmittals] = useState<DrawingTransmittal[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [selectedVersions, setSelectedVersions] = useState<DrawingRegisterVersion[]>([]);
  const [selectedVersionKeys, setSelectedVersionKeys] = useState<string[]>([]);
  const [documentForm, setDocumentForm] = useState(defaultDocumentForm);
  const [revisionForm, setRevisionForm] = useState({ revision: 'P02', fileUrl: '', fileName: '', notes: '' });
  const [transmittalForm, setTransmittalForm] = useState({ title: '', status: 'issued' as TransmittalStatus, recipientIds: '', purpose: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const projectQueries = projectQueriesForUser(user);
    if (projectQueries.length === 0) {
      setProjects([]);
      setState('ready');
      return undefined;
    }

    let cancelled = false;
    const snapshotGroups = projectQueries.map(() => [] as Project[]);
    const loadedGroups = new Set<number>();
    const unsubscribers = projectQueries.map((projectQuery, index) => onSnapshot(projectQuery, (snapshot) => {
      if (cancelled) return;
      snapshotGroups[index] = snapshot.docs.map((projectDoc) => ({ id: projectDoc.id, ...projectDoc.data() } as Project));
      loadedGroups.add(index);
      const nextProjects = mergeProjectSnapshots(snapshotGroups);
      setProjects(nextProjects);
      setSelectedProjectId((current) => current && nextProjects.some((project) => project.id === current) ? current : nextProjects[0]?.id || '');
      if (loadedGroups.size === projectQueries.length) setState('ready');
    }, (error) => {
      console.warn('Drawing register project projection unavailable:', error);
      if (cancelled) return;
      loadedGroups.add(index);
      if (loadedGroups.size === projectQueries.length) {
        setProjects(mergeProjectSnapshots(snapshotGroups));
        setState('ready');
      }
    }));

    setState('loading');
    return () => {
      cancelled = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [user]);

  const selectedProject = useMemo(() => projects.find((project) => project.id === selectedProjectId), [projects, selectedProjectId]);

  useEffect(() => {
    setDocuments([]);
    setTransmittals([]);
    setSelectedDocumentId('');
    setSelectedVersionKeys([]);
    if (!selectedProject) return undefined;

    const documentsQuery = query(collection(db, 'projects', selectedProject.id, 'documents'), limit(80));
    const transmittalsQuery = query(collection(db, 'projects', selectedProject.id, 'transmittals'), limit(80));
    const unsubDocuments = onSnapshot(documentsQuery, (snapshot) => {
      const nextDocuments = sortByRecent(snapshot.docs.map((documentSnapshot) => ({ id: documentSnapshot.id, ...documentSnapshot.data() } as DrawingRegisterDocument)));
      setDocuments(nextDocuments);
      setSelectedDocumentId((current) => current || nextDocuments[0]?.id || '');
    }, (error) => {
      console.warn('Drawing register documents unavailable:', error);
      setDocuments([]);
    });
    const unsubTransmittals = onSnapshot(transmittalsQuery, (snapshot) => {
      setTransmittals(sortByRecent(snapshot.docs.map((transmittalSnapshot) => ({ id: transmittalSnapshot.id, ...transmittalSnapshot.data() } as DrawingTransmittal))));
    }, (error) => {
      console.warn('Drawing transmittals unavailable:', error);
      setTransmittals([]);
    });

    return () => { unsubDocuments(); unsubTransmittals(); };
  }, [selectedProject]);

  const selectedDocument = useMemo(() => documents.find((document) => document.id === selectedDocumentId), [documents, selectedDocumentId]);

  useEffect(() => {
    setSelectedVersions([]);
    setSelectedVersionKeys([]);
    if (!selectedProject || !selectedDocument) return undefined;
    const versionsQuery = query(collection(db, 'projects', selectedProject.id, 'documents', selectedDocument.id, 'versions'), limit(50));
    return onSnapshot(versionsQuery, (snapshot) => {
      const versions = [...snapshot.docs.map((versionDoc) => ({ id: versionDoc.id, ...versionDoc.data() } as DrawingRegisterVersion))]
        .sort((a, b) => b.versionNumber - a.versionNumber);
      setSelectedVersions(versions);
    }, (error) => {
      console.warn('Drawing register version history unavailable:', error);
      setSelectedVersions([]);
    });
  }, [selectedProject, selectedDocument]);

  const manager = canManageDrawingRegister(user);
  const issuedTransmittals = transmittals.filter((transmittal) => transmittal.status === 'issued');
  const activeDocuments = documents.filter((document) => !['superseded', 'withdrawn'].includes(String(document.status)));
  const supersededDocuments = documents.filter((document) => ['superseded', 'withdrawn'].includes(String(document.status)));
  const selectedCurrentKey = selectedDocument ? versionKey(selectedDocument.id, selectedDocument.currentVersionId) : '';
  const selectedDocumentTransmittals = selectedDocument ? transmittals.filter((transmittal) => transmittal.documentVersionIds.includes(selectedCurrentKey) || transmittal.documentVersionIds.includes(selectedDocument.currentVersionId || '')) : [];

  const toggleVersion = (key: string) => {
    setSelectedVersionKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  };

  const createDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProject) return;
    if (!manager) {
      toast.error('Only the design lead or admin can create drawing register records.');
      return;
    }
    const title = documentForm.title.trim();
    if (!title) {
      toast.error('Document title is required.');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const documentRef = doc(collection(db, 'projects', selectedProject.id, 'documents'));
      const versionRef = doc(collection(documentRef, 'versions'), 'v1');
      const version: Omit<DrawingRegisterVersion, 'id'> & { id: string } = {
        id: versionRef.id,
        documentId: documentRef.id,
        projectId: selectedProject.id,
        versionNumber: 1,
        revision: documentForm.revision.trim() || 'P01',
        fileUrl: documentForm.fileUrl.trim() || null,
        fileName: documentForm.fileName.trim() || null,
        checksum: null,
        notes: documentForm.notes.trim(),
        issueStatus: documentForm.status,
        supersedesVersionId: null,
        createdBy: user.uid,
        createdAt: now,
      };
      const documentData: Omit<DrawingRegisterDocument, 'id'> & { id: string } = {
        id: documentRef.id,
        projectId: selectedProject.id,
        title,
        drawingNumber: documentForm.drawingNumber.trim() || null,
        documentType: documentForm.documentType,
        discipline: documentForm.discipline.trim() || null,
        status: documentForm.status,
        currentVersionId: versionRef.id,
        currentRevision: version.revision,
        latestFileUrl: version.fileUrl,
        latestFileName: version.fileName,
        tags: cleanList(documentForm.tags),
        createdBy: user.uid,
        createdAt: now,
        updatedAt: now,
      };
      const batch = writeBatch(db);
      batch.set(documentRef, documentData);
      batch.set(versionRef, version);
      await batch.commit();
      setDocumentForm(defaultDocumentForm);
      setSelectedDocumentId(documentRef.id);
      toast.success('Drawing register record created.');
    } catch (error) {
      console.warn('Failed to create drawing register record:', error);
      toast.error('Drawing register record could not be created. Check project permissions.');
    } finally {
      setSaving(false);
    }
  };

  const addRevision = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProject || !selectedDocument || !manager) return;
    const revision = revisionForm.revision.trim();
    if (!revision) {
      toast.error('Revision is required.');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const nextVersionNumber = selectedVersions.length + 1;
      const versionRef = doc(collection(db, 'projects', selectedProject.id, 'documents', selectedDocument.id, 'versions'), `v${nextVersionNumber}`);
      const version: Omit<DrawingRegisterVersion, 'id'> & { id: string } = {
        id: versionRef.id,
        documentId: selectedDocument.id,
        projectId: selectedProject.id,
        versionNumber: nextVersionNumber,
        revision,
        fileUrl: revisionForm.fileUrl.trim() || selectedDocument.latestFileUrl || null,
        fileName: revisionForm.fileName.trim() || selectedDocument.latestFileName || null,
        checksum: null,
        notes: revisionForm.notes.trim(),
        issueStatus: 'active',
        supersedesVersionId: selectedDocument.currentVersionId || null,
        createdBy: user.uid,
        createdAt: now,
      };
      const batch = writeBatch(db);
      batch.set(versionRef, version);
      batch.update(doc(db, 'projects', selectedProject.id, 'documents', selectedDocument.id), {
        currentVersionId: versionRef.id,
        currentRevision: revision,
        latestFileUrl: version.fileUrl,
        latestFileName: version.fileName,
        status: 'active',
        updatedAt: now,
      });
      await batch.commit();
      setRevisionForm({ revision: `P${String(nextVersionNumber + 1).padStart(2, '0')}`, fileUrl: '', fileName: '', notes: '' });
      toast.success('Revision recorded and previous version superseded.');
    } catch (error) {
      console.warn('Failed to add drawing revision:', error);
      toast.error('Revision could not be recorded. Check project permissions.');
    } finally {
      setSaving(false);
    }
  };

  const issueTransmittal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProject || !manager) return;
    const title = transmittalForm.title.trim();
    if (!title) {
      toast.error('Transmittal title is required.');
      return;
    }
    if (selectedVersionKeys.length === 0) {
      toast.error('Select at least one drawing revision for the transmittal.');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const transmittalRef = doc(collection(db, 'projects', selectedProject.id, 'transmittals'));
      const coordinationRef = doc(collection(db, 'projects', selectedProject.id, 'coordination_items'));
      const transmittal: Omit<DrawingTransmittal, 'id'> & { id: string } = {
        id: transmittalRef.id,
        projectId: selectedProject.id,
        title,
        status: transmittalForm.status,
        recipientIds: cleanList(transmittalForm.recipientIds),
        documentVersionIds: selectedVersionKeys,
        purpose: transmittalForm.purpose.trim(),
        issuedBy: user.uid,
        issuedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      const batch = writeBatch(db);
      batch.set(transmittalRef, transmittal);
      batch.set(coordinationRef, {
        id: coordinationRef.id,
        projectId: selectedProject.id,
        jobId: selectedProject.jobId,
        itemType: 'transmittal',
        title: `Transmittal: ${title}`,
        description: `${transmittal.purpose || 'Drawing transmittal issued.'}\nRecipients: ${transmittal.recipientIds.join(', ') || 'Not specified'}\nVersions: ${transmittal.documentVersionIds.join(', ')}`,
        dependsOnIds: selectedVersionKeys,
        status: transmittal.status === 'issued' ? 'submitted' : 'open',
        createdBy: user.uid,
        createdByRole: user.role,
        createdAt: now,
        updatedAt: now,
      });
      await batch.commit();
      setTransmittalForm({ title: '', status: 'issued', recipientIds: '', purpose: '' });
      setSelectedVersionKeys([]);
      toast.success('Transmittal issued and linked to the project coordination register.');
    } catch (error) {
      console.warn('Failed to issue transmittal:', error);
      toast.error('Transmittal could not be issued. Check project permissions.');
    } finally {
      setSaving(false);
    }
  };

  if (state === 'loading') {
    return <Card className="rounded-[2rem] border-border bg-card/95"><CardContent className="p-8 flex items-center gap-3 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading drawing register...</CardContent></Card>;
  }

  return (
    <div className="space-y-6" data-testid="drawing-register-page">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border bg-primary/5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">Document Control</Badge>
              <CardTitle className="mt-3 flex items-center gap-3 font-heading text-3xl"><FileArchive className="h-7 w-7 text-primary" /> Drawing Register & Transmittals</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">Formal drawing numbers, revisions, issue status, superseded records, and transmittal logs backed by live project document-control records. External delivery, statutory approval, and legal sign-off remain human-confirmed.</CardDescription>
            </div>
            <Badge className="w-fit capitalize">{user.role}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Metric icon={<FileText />} label="Register records" value={documents.length} />
            <Metric icon={<FileClock />} label="Active / issued" value={activeDocuments.length} />
            <Metric icon={<History />} label="Superseded" value={supersededDocuments.length} />
            <Metric icon={<Send />} label="Transmittals" value={transmittals.length} />
            <Metric icon={<RadioTower />} label="Issued" value={issuedTransmittals.length} />
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Active project</label>
              <select className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm" value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.id} · {project.currentStage}</option>)}
              </select>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/20 p-4 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">Human confirmation boundary</p>
              <p className="mt-1">Transmittals record issue metadata only. They do not send email, certify municipal submissions, or approve construction use.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {state === 'error' && <Notice title="Drawing register needs attention" message="Project access could not be resolved for this role. Existing project data remains unchanged; check sign-in, role assignment, or Firestore access before recording revisions." />}
      {!selectedProject && state !== 'error' && <Notice title="No active project found" message="Create or appoint a project before issuing drawing register records or transmittals." />}

      {selectedProject && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-6">
            <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm">
              <CardHeader>
                <CardTitle className="font-heading text-2xl">Live drawing register</CardTitle>
                <CardDescription>Current revisions and issue status. Select a record to view immutable revision history and transmittal coverage.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {documents.length === 0 && <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No drawing register records are visible for this project yet.</div>}
                {documents.map((documentRecord) => {
                  const currentKey = versionKey(documentRecord.id, documentRecord.currentVersionId);
                  const transmitted = transmittals.some((transmittal) => transmittal.documentVersionIds.includes(currentKey) || transmittal.documentVersionIds.includes(documentRecord.currentVersionId || ''));
                  return (
                    <button key={documentRecord.id} type="button" onClick={() => setSelectedDocumentId(documentRecord.id)} className={`w-full rounded-2xl border p-4 text-left transition hover:border-primary/50 ${selectedDocumentId === documentRecord.id ? 'border-primary bg-primary/5' : 'border-border bg-background/70'}`}>
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="rounded-full">{documentRecord.documentType}</Badge>
                            <Badge variant="outline" className={`rounded-full ${statusTone(String(documentRecord.status))}`}>{documentRecord.status}</Badge>
                            {transmitted && <Badge className="rounded-full">Transmitted</Badge>}
                          </div>
                          <p className="mt-2 font-semibold text-base">{documentRecord.drawingNumber ? `${documentRecord.drawingNumber} · ` : ''}{documentRecord.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Revision {documentRecord.currentRevision || 'unversioned'} · {documentRecord.discipline || 'No discipline'} · Updated {safeFormat(documentRecord.updatedAt ?? documentRecord.createdAt, 'MMM d, yyyy')}</p>
                        </div>
                        {documentRecord.latestFileUrl && <a href={documentRecord.latestFileUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary hover:underline" onClick={(event) => event.stopPropagation()}>Open file</a>}
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            {selectedDocument && (
              <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm">
                <CardHeader>
                  <CardTitle className="font-heading text-2xl">Revision history</CardTitle>
                  <CardDescription>{selectedDocument.title} · current revision {selectedDocument.currentRevision || 'not set'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedVersions.length === 0 && <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No immutable versions are visible for this record.</p>}
                  {selectedVersions.map((version) => {
                    const key = versionKey(selectedDocument.id, version.id);
                    return (
                      <label key={version.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-background/70 p-4 text-sm">
                        <input type="checkbox" className="mt-1" checked={selectedVersionKeys.includes(key)} onChange={() => toggleVersion(key)} disabled={!manager} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{version.revision}</Badge><Badge variant="secondary">v{version.versionNumber}</Badge>{version.supersedesVersionId && <Badge variant="outline">supersedes {version.supersedesVersionId}</Badge>}</div>
                          <p className="mt-2 font-semibold">{version.fileName || selectedDocument.latestFileName || 'No file name recorded'}</p>
                          {version.notes && <p className="mt-1 text-muted-foreground">{version.notes}</p>}
                          <p className="mt-2 text-[11px] uppercase tracking-widest text-muted-foreground">Recorded {safeFormat(version.createdAt, 'MMM d, yyyy HH:mm')}</p>
                        </div>
                        {version.fileUrl && <a href={version.fileUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary hover:underline">Open</a>}
                      </label>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm">
              <CardHeader>
                <CardTitle className="font-heading text-2xl">Recipient transmittal log</CardTitle>
                <CardDescription>Issued packages and recipient logs for the selected project.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {transmittals.length === 0 && <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No transmittals are visible for this project yet.</p>}
                {transmittals.map((transmittal) => (
                  <div key={transmittal.id} className="rounded-2xl border border-border bg-background/70 p-4 text-sm">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={statusTone(String(transmittal.status))}>{transmittal.status}</Badge><Badge variant="secondary">{transmittal.documentVersionIds.length} revisions</Badge><Badge variant="secondary">{transmittal.recipientIds.length} recipients</Badge></div>
                        <p className="mt-2 font-semibold">{transmittal.title}</p>
                        {transmittal.purpose && <p className="mt-1 text-muted-foreground">{transmittal.purpose}</p>}
                        <p className="mt-2 text-[11px] uppercase tracking-widest text-muted-foreground">Issued {safeFormat(transmittal.issuedAt ?? transmittal.createdAt, 'MMM d, yyyy HH:mm')}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {manager ? (
              <>
                <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm">
                  <CardHeader><CardTitle className="font-heading text-xl flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /> Add register record</CardTitle><CardDescription>Create the first immutable version for a drawing/report/addendum/submission pack.</CardDescription></CardHeader>
                  <CardContent>
                    <form onSubmit={createDocument} className="space-y-3">
                      <Input placeholder="Title" value={documentForm.title} onChange={(event) => setDocumentForm((current) => ({ ...current, title: event.target.value }))} />
                      <Input placeholder="Drawing / document number" value={documentForm.drawingNumber} onChange={(event) => setDocumentForm((current) => ({ ...current, drawingNumber: event.target.value }))} />
                      <div className="grid grid-cols-2 gap-3">
                        <select className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={documentForm.documentType} onChange={(event) => setDocumentForm((current) => ({ ...current, documentType: event.target.value as DocumentType }))}>{DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}</select>
                        <select className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={documentForm.status} onChange={(event) => setDocumentForm((current) => ({ ...current, status: event.target.value as DocumentStatus }))}>{DOCUMENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select>
                      </div>
                      <Input placeholder="Discipline" value={documentForm.discipline} onChange={(event) => setDocumentForm((current) => ({ ...current, discipline: event.target.value }))} />
                      <Input placeholder="Initial revision, e.g. P01" value={documentForm.revision} onChange={(event) => setDocumentForm((current) => ({ ...current, revision: event.target.value }))} />
                      <Input placeholder="File URL" value={documentForm.fileUrl} onChange={(event) => setDocumentForm((current) => ({ ...current, fileUrl: event.target.value }))} />
                      <Input placeholder="File name" value={documentForm.fileName} onChange={(event) => setDocumentForm((current) => ({ ...current, fileName: event.target.value }))} />
                      <Textarea placeholder="Notes" value={documentForm.notes} onChange={(event) => setDocumentForm((current) => ({ ...current, notes: event.target.value }))} />
                      <Input placeholder="Tags, comma separated" value={documentForm.tags} onChange={(event) => setDocumentForm((current) => ({ ...current, tags: event.target.value }))} />
                      <Button className="w-full rounded-xl" disabled={saving} type="submit">Create register record</Button>
                    </form>
                  </CardContent>
                </Card>

                <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm">
                  <CardHeader><CardTitle className="font-heading text-xl">Add revision</CardTitle><CardDescription>Append a new immutable version for the selected record.</CardDescription></CardHeader>
                  <CardContent>
                    <form onSubmit={addRevision} className="space-y-3">
                      <Input placeholder="Revision, e.g. P02" value={revisionForm.revision} onChange={(event) => setRevisionForm((current) => ({ ...current, revision: event.target.value }))} disabled={!selectedDocument} />
                      <Input placeholder="File URL" value={revisionForm.fileUrl} onChange={(event) => setRevisionForm((current) => ({ ...current, fileUrl: event.target.value }))} disabled={!selectedDocument} />
                      <Input placeholder="File name" value={revisionForm.fileName} onChange={(event) => setRevisionForm((current) => ({ ...current, fileName: event.target.value }))} disabled={!selectedDocument} />
                      <Textarea placeholder="Revision notes" value={revisionForm.notes} onChange={(event) => setRevisionForm((current) => ({ ...current, notes: event.target.value }))} disabled={!selectedDocument} />
                      <Button className="w-full rounded-xl" variant="outline" disabled={saving || !selectedDocument} type="submit">Record revision</Button>
                    </form>
                  </CardContent>
                </Card>

                <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm">
                  <CardHeader><CardTitle className="font-heading text-xl flex items-center gap-2"><FileOutput className="h-5 w-5 text-primary" /> Generate transmittal</CardTitle><CardDescription>Select revisions from the history, then record issue metadata and a linked coordination item.</CardDescription></CardHeader>
                  <CardContent>
                    <form onSubmit={issueTransmittal} className="space-y-3">
                      <Input placeholder="Transmittal title" value={transmittalForm.title} onChange={(event) => setTransmittalForm((current) => ({ ...current, title: event.target.value }))} />
                      <select className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={transmittalForm.status} onChange={(event) => setTransmittalForm((current) => ({ ...current, status: event.target.value as TransmittalStatus }))}>{TRANSMITTAL_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select>
                      <Textarea placeholder="Recipient user IDs, separated by commas or new lines" value={transmittalForm.recipientIds} onChange={(event) => setTransmittalForm((current) => ({ ...current, recipientIds: event.target.value }))} />
                      <Textarea placeholder="Purpose / issue note" value={transmittalForm.purpose} onChange={(event) => setTransmittalForm((current) => ({ ...current, purpose: event.target.value }))} />
                      <p className="text-xs text-muted-foreground">Selected revisions: {selectedVersionKeys.length}</p>
                      <Button className="w-full rounded-xl" disabled={saving || selectedVersionKeys.length === 0} type="submit">Issue transmittal record</Button>
                    </form>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Notice title="Read-only register" message="Clients can view issued register records and transmittals. Creating revisions or transmittals remains with the design lead/admin." />
            )}
          </div>
        </div>
      )}

      {selectedDocument && selectedDocumentTransmittals.length > 0 && <p className="text-xs text-muted-foreground">Selected current revision appears in {selectedDocumentTransmittals.length} transmittal record(s).</p>}
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <div className="rounded-2xl border border-border bg-background/70 p-4"><div className="mb-3 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}</div><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p><p className="mt-1 font-heading text-2xl font-black">{value}</p></div>;
}

function Notice({ title, message }: { title: string; message: string }) {
  return <Card className="rounded-2xl border-border bg-card/95"><CardContent className="flex gap-3 p-6"><AlertTriangle className="mt-1 h-5 w-5 text-amber-600" /><div><p className="font-heading text-lg font-bold">{title}</p><p className="mt-1 text-sm text-muted-foreground">{message}</p></div></CardContent></Card>;
}
