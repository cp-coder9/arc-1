export type DocumentStatus = 'draft' | 'current' | 'superseded' | 'withdrawn' | 'archived';
export type Discipline = 'architectural' | 'structural' | 'mechanical' | 'electrical' | 'civil' | 'fire' | 'landscape' | 'interior' | 'qs' | 'health-safety' | 'general';
export type IssuePurpose = 'for-construction' | 'for-approval' | 'for-information' | 'for-comment' | 'for-record' | 'tender' | 'submission';

export interface DocumentRecord {
  id: string; docNumber: string; title: string; discipline: Discipline; phase: string; status: DocumentStatus;
  originator: string; tags: string[]; fileManagerRefs: string[]; createdAt: string; updatedAt: string;
  revisionCount: number; currentRevisionId: string | null;
}
export interface RevisionRecord {
  id: string; docId: string; revNumber: number; date: string; reason: string; author: string;
  supersedesRevId: string | null; supersededByRevId: string | null; fileManagerRefs: string[];
}
export interface DocumentSnapshot { docId: string; revIdAtIssue: string; title: string; docNumber: string; }
export interface IssueSheet {
  id: string; tsNumber: string; purpose: IssuePurpose; recipients: string[]; internalNotes: string; sentDate: string;
  documentSnapshots: DocumentSnapshot[]; supersedesIssueSheetId: string | null; supersededByIssueSheetId: string | null;
  auditHash: string;
}
export interface TechnicalBrief {
  id: string; title: string; projectName: string; documentEntries: { docNumber: string; title: string; revision: number; status: DocumentStatus; fileManagerRefs: string[] }[];
  notes: string; generatedAt: string; auditHash: string;
}
export interface ProjectMeta { projectName: string; reference: string; }
