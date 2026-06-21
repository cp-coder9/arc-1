import type { DocumentRecord, DocumentStatus, Discipline, RevisionRecord, ProjectMeta } from './types';
import { id } from './utils';

export class DocumentRegisterService {
  private docs = new Map<string, DocumentRecord>();
  private revs = new Map<string, RevisionRecord[]>();

  register(project: ProjectMeta, props: { docNumber: string; title: string; discipline: Discipline; phase: string; originator: string; tags: string[]; fileManagerRefs: string[] }): DocumentRecord {
    const doc: DocumentRecord = {
      id: id('doc'), docNumber: props.docNumber, title: props.title, discipline: props.discipline, phase: props.phase,
      status: 'draft', originator: props.originator, tags: props.tags, fileManagerRefs: props.fileManagerRefs,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), revisionCount: 0, currentRevisionId: null,
    };
    this.docs.set(doc.id, doc);
    this.revs.set(doc.id, []);
    return doc;
  }

  addRevision(docId: string, props: { reason: string; author: string; fileManagerRefs: string[] }): RevisionRecord | null {
    const doc = this.docs.get(docId);
    if (!doc) return null;
    const prevRevs = this.revs.get(docId) ?? [];
    const lastRev = prevRevs.length ? prevRevs[prevRevs.length - 1] : null;
    const rev: RevisionRecord = {
      id: id('rev'), docId, revNumber: prevRevs.length + 1, date: new Date().toISOString(),
      reason: props.reason, author: props.author, supersedesRevId: lastRev?.id ?? null,
      supersededByRevId: null, fileManagerRefs: props.fileManagerRefs,
    };
    if (lastRev) lastRev.supersededByRevId = rev.id;
    this.revs.set(docId, [...prevRevs, rev]);
    doc.currentRevisionId = rev.id;
    doc.revisionCount = this.revs.get(docId)!.length;
    doc.updatedAt = new Date().toISOString();
    if (doc.status === 'draft' && doc.revisionCount >= 1) doc.status = 'current';
    return rev;
  }

  supersede(docId: string): DocumentRecord | null {
    const doc = this.docs.get(docId);
    if (!doc || doc.status === 'superseded' || doc.status === 'archived') return null;
    doc.status = 'superseded';
    doc.updatedAt = new Date().toISOString();
    return doc;
  }

  withdraw(docId: string): DocumentRecord | null {
    const doc = this.docs.get(docId);
    if (!doc) return null;
    doc.status = 'withdrawn';
    doc.updatedAt = new Date().toISOString();
    return doc;
  }

  archive(docId: string): DocumentRecord | null {
    const doc = this.docs.get(docId);
    if (!doc) return null;
    doc.status = 'archived';
    doc.updatedAt = new Date().toISOString();
    return doc;
  }

  listCurrent() { return [...this.docs.values()].filter((d) => d.status === 'current' || d.status === 'draft'); }
  listAll() { return [...this.docs.values()]; }
  get(id: string) { return this.docs.get(id) ?? null; }
  getRevisions(docId: string) { return this.revs.get(docId) ?? []; }
}
