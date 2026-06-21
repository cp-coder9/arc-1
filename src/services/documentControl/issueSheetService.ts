import type { DocumentRecord, IssuePurpose, IssueSheet, ProjectMeta } from './types';
import { hash, tsNumber, id } from './utils';
import { DocumentRegisterService } from './documentRegisterService';

export class IssueSheetService {
  constructor(private reg: DocumentRegisterService) {}

  create(project: ProjectMeta, props: { purpose: IssuePurpose; recipients: string[]; internalNotes: string }, docIds: string[], supersedesIssueSheet: IssueSheet | null = null): IssueSheet | null {
    const docs = docIds.map((id) => this.reg.get(id)).filter((d): d is DocumentRecord => !!d);
    if (docs.length === 0) return null;
    const documentSnapshots = docs.map((d) => ({ docId: d.id, revIdAtIssue: d.currentRevisionId ?? 'none', title: d.title, docNumber: d.docNumber }));
    const ts: IssueSheet = {
      id: id('ts'), tsNumber: tsNumber(), purpose: props.purpose, recipients: props.recipients,
      internalNotes: props.internalNotes, sentDate: new Date().toISOString(), documentSnapshots,
      supersedesIssueSheetId: supersedesIssueSheet?.id ?? null, supersededByIssueSheetId: null, auditHash: '',
    };
    if (supersedesIssueSheet) supersedesIssueSheet.supersededByIssueSheetId = ts.id;
    ts.auditHash = hash(JSON.stringify(ts));
    return ts;
  }
}
