import { DocumentRegisterService } from './documentRegisterService';
import { IssueSheetService } from './issueSheetService';
import { TechnicalBriefService } from './technicalBriefService';
import { toInboxTask, toProjectRecord, toToolRunDocuments } from './adapters';

export function runDemo() {
  const project = { projectName: 'Architex Demo Office', reference: 'DOC-001' };
  const reg = new DocumentRegisterService();
  const iss = new IssueSheetService(reg);
  const brief = new TechnicalBriefService(reg);

  const d1 = reg.register(project, { docNumber: 'A101', title: 'Ground Floor Plan', discipline: 'architectural' as const, phase: 'tender', originator: 'Architect X', tags: ['plan', 'ground'], fileManagerRefs: ['ref-A101-v1'] });
  const r1 = reg.addRevision(d1.id, { reason: 'Window sizes updated per XA calc', author: 'Architect X', fileManagerRefs: ['ref-A101-v2'] });
  const d2 = reg.register(project, { docNumber: 'S201', title: 'Foundation Detail', discipline: 'structural' as const, phase: 'tender', originator: 'Engineer Y', tags: ['detail', 'foundation'], fileManagerRefs: ['ref-S201-v1'] });
  reg.addRevision(d2.id, { reason: 'Column schedule revised', author: 'Engineer Y', fileManagerRefs: ['ref-S201-v2'] });

  const currentDocs = reg.listCurrent();
  const ts1 = iss.create(project, { purpose: 'for-construction' as const, recipients: ['Contractor A', 'Architect X'], internalNotes: 'Please use these for site works' }, currentDocs.map((d) => d.id));

  reg.supersede(d2.id);
  reg.addRevision(d2.id, { reason: 'Major rebar change', author: 'Engineer Y', fileManagerRefs: ['ref-S201-v3'] });

  const currentAfter = reg.listCurrent();
  const briefDoc = brief.generate(project, currentAfter.map((d) => d.id), 'Municipal submission package');

  const allDocs = toToolRunDocuments(reg);

  return {
    registeredDocuments: allDocs.length,
    currentDocuments: currentAfter.length,
    d1RevCount: d1.revisionCount,
    d2RevCount: d2.revisionCount,
    d2Superseded: reg.get(d2.id)?.status,
    revisionChainD2: reg.getRevisions(d2.id).map((r) => ({ revNumber: r.revNumber, supersedes: r.supersedesRevId ? 'yes' : 'no', supersededBy: r.supersededByRevId ? 'yes' : 'no' })),
    issueSheetTSNumber: ts1?.tsNumber,
    issueSheetDocCount: ts1?.documentSnapshots.length,
    issueSheetAudit: ts1?.auditHash ? 'present' : 'missing',
    technicalBriefTitle: briefDoc?.title,
    technicalBriefEntryCount: briefDoc?.documentEntries.length,
    technicalBriefAudit: briefDoc?.auditHash ? 'present' : 'missing',
    projectRecords: [toProjectRecord('DOCUMENT_REGISTERED', d1), toProjectRecord('DOCUMENT_REVISED', r1 ?? d1), toProjectRecord('DOCUMENT_SUPERSEDED', d2), toProjectRecord('ISSUE_SHEET_GENERATED', ts1!), toProjectRecord('TECHNICAL_BRIEF_GENERATED', briefDoc!)],
    inboxTasks: [toInboxTask('DOCUMENT_REGISTERED', d1), toInboxTask('DOCUMENT_SUPERSEDED', d2)],
    municipalReadiness: briefDoc?.documentEntries.length,
  };
}
