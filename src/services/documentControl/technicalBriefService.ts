import { DocumentRegisterService } from './documentRegisterService';
import type { TechnicalBrief, ProjectMeta } from './types';
import { hash, id } from './utils';

export class TechnicalBriefService {
  constructor(private reg: DocumentRegisterService) {}

  generate(project: ProjectMeta, docIds: string[], notes = '', title = 'Technical Brief'): TechnicalBrief | null {
    const docs = docIds.map((id) => this.reg.get(id)).filter((d) => !!d);
    if (docs.length === 0) return null;
    const documentEntries = docs.map((d) => ({ docNumber: d.docNumber, title: d.title, revision: d.revisionCount, status: d.status, fileManagerRefs: d.fileManagerRefs }));
    const tb: TechnicalBrief = {
      id: id('tb'), title, projectName: project.projectName, documentEntries, notes,
      generatedAt: new Date().toISOString(), auditHash: '',
    };
    tb.auditHash = hash(JSON.stringify(tb));
    return tb;
  }
}
